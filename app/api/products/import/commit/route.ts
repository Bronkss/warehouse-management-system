import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ProductUnit = 'piece' | 'weight'
type ImportAction = 'update' | 'create' | 'skip'
type ImportStatus = 'matched' | 'review' | 'new' | 'error'

type IncomingRow = {
    rowId?: string
    rowNumber?: number
    status?: ImportStatus
    action?: ImportAction
    matchType?: string
    matchScore?: number | string
    matchedProductId?: number | string | null
    matchedProductName?: string
    matchedProductBarcode?: string
    productId?: number | string | null
    name?: string
    category?: string
    barcode?: string
    purchasePrice?: number | string
    sellingPrice?: number | string
    unit?: ProductUnit
    stock?: number | string
    minStock?: number | string
    image?: string
    error?: string | null
}

type ProductDbRow = {
    id: number
    name: string
    category: string
    barcode: string
    purchase_price: string
    selling_price: string
    unit: ProductUnit
    stock: string
    min_stock: string
    image: string
}

function normalizeText(value: unknown) {
    return String(value ?? '').trim()
}

function toNumber(value: unknown, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback
    const normalized = String(value).replace(',', '.').replace(/\s/g, '')
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : fallback
}

function toNullableId(value: unknown) {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function normalizeUnit(value: unknown): ProductUnit {
    return value === 'weight' ? 'weight' : 'piece'
}

function normalizeAction(value: unknown): ImportAction {
    if (value === 'create' || value === 'skip') return value
    return 'update'
}

function normalizeStatus(value: unknown): ImportStatus {
    if (value === 'review' || value === 'new' || value === 'error') return value
    return 'matched'
}

function makeAcceptanceNumber(id: number) {
    const date = new Date()
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `ACC-${y}${m}${d}-${String(id).padStart(6, '0')}`
}

function makeAutoBarcode(id: number, rowNumber: number) {
    return `AUTO-${id}-${rowNumber}-${Date.now()}`
}

function productSnapshot(row: ProductDbRow | null) {
    if (!row) return null

    return {
        id: Number(row.id),
        name: row.name,
        category: row.category,
        barcode: row.barcode,
        purchasePrice: Number(row.purchase_price ?? 0),
        sellingPrice: Number(row.selling_price ?? 0),
        unit: row.unit,
        stock: Number(row.stock ?? 0),
        minStock: Number(row.min_stock ?? 0),
        image: row.image ?? '',
    }
}

async function insertAcceptanceItem(client: any, params: {
    acceptanceId: number
    row: IncomingRow
    rowNumber: number
    action: ImportAction
    status: ImportStatus
    productId: number | null
    matchedProductId: number | null
    matchedProductName: string
    matchedProductBarcode: string
    productBefore: ProductDbRow | null
    productAfter: ProductDbRow | null
    appliedQuantity: number
    createdProduct: boolean
    error: string | null
}) {
    const { row } = params

    await client.query(
        `INSERT INTO product_acceptance_items (
            acceptance_id,
            row_number,
            status,
            action,
            match_type,
            match_score,
            product_id,
            matched_product_id,
            matched_product_name,
            matched_product_barcode,
            product_before,
            product_after,
            name,
            category,
            barcode,
            purchase_price,
            selling_price,
            unit,
            quantity,
            min_stock,
            image,
            applied_quantity,
            created_product,
            error
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11::jsonb, $12::jsonb, $13, $14, $15, $16, $17, $18,
            $19, $20, $21, $22, $23, $24
        )`,
        [
            params.acceptanceId,
            params.rowNumber,
            params.status,
            params.action,
            normalizeText(row.matchType),
            toNumber(row.matchScore, 0),
            params.productId,
            params.matchedProductId,
            params.matchedProductName,
            params.matchedProductBarcode,
            JSON.stringify(productSnapshot(params.productBefore)),
            JSON.stringify(productSnapshot(params.productAfter)),
            normalizeText(row.name),
            normalizeText(row.category),
            normalizeText(row.barcode),
            toNumber(row.purchasePrice, 0),
            toNumber(row.sellingPrice, 0),
            normalizeUnit(row.unit),
            toNumber(row.stock, 0),
            toNumber(row.minStock, 0),
            normalizeText(row.image),
            params.appliedQuantity,
            params.createdProduct,
            params.error,
        ]
    )
}

export async function POST(request: NextRequest) {
    const client = await pool.connect()

    try {
        const body = await request.json()
        const rows: IncomingRow[] = Array.isArray(body.rows) ? body.rows : []
        const sourceFileName = normalizeText(body.sourceFileName)
        const supplier = normalizeText(body.supplier)
        const invoiceNumber = normalizeText(body.invoiceNumber)
        const comment = normalizeText(body.comment)

        if (rows.length === 0) {
            return NextResponse.json({ message: 'Нет строк для применения' }, { status: 400 })
        }

        await client.query('BEGIN')

        const headerResult = await client.query(
            `INSERT INTO product_acceptances (
                number,
                source_file_name,
                supplier,
                invoice_number,
                comment,
                status
            ) VALUES ($5, $1, $2, $3, $4, 'completed')
            RETURNING id`,
            [sourceFileName || null, supplier || null, invoiceNumber || null, comment || null, `TEMP-${Date.now()}-${Math.random()}`]
        )

        const acceptanceId = Number(headerResult.rows[0].id)
        const acceptanceNumber = makeAcceptanceNumber(acceptanceId)

        await client.query(
            'UPDATE product_acceptances SET number = $1 WHERE id = $2',
            [acceptanceNumber, acceptanceId]
        )

        let created = 0
        let updated = 0
        let skipped = 0
        const errors: string[] = []

        for (let index = 0; index < rows.length; index++) {
            const row = rows[index]
            const rowNumber = Number(row.rowNumber || index + 1)
            const action = normalizeAction(row.action)
            const status = normalizeStatus(row.status)
            const quantity = toNumber(row.stock, 0)
            const purchasePrice = toNumber(row.purchasePrice, 0)
            const sellingPrice = toNumber(row.sellingPrice, 0)
            const unit = normalizeUnit(row.unit)

            try {
                if (action === 'skip') {
                    skipped++
                    await insertAcceptanceItem(client, {
                        acceptanceId,
                        row,
                        rowNumber,
                        action,
                        status,
                        productId: null,
                        matchedProductId: toNullableId(row.matchedProductId),
                        matchedProductName: normalizeText(row.matchedProductName),
                        matchedProductBarcode: normalizeText(row.matchedProductBarcode),
                        productBefore: null,
                        productAfter: null,
                        appliedQuantity: 0,
                        createdProduct: false,
                        error: null,
                    })
                    continue
                }

                if (quantity <= 0) {
                    throw new Error('Количество должно быть больше 0')
                }

                if (action === 'update') {
                    const productId = toNullableId(row.matchedProductId) ?? toNullableId(row.productId)

                    if (!productId) {
                        throw new Error('Для обновления нужно выбрать товар из БД')
                    }

                    const beforeResult = await client.query(
                        'SELECT * FROM products WHERE id = $1 FOR UPDATE',
                        [productId]
                    )

                    if (beforeResult.rowCount === 0) {
                        throw new Error(`Товар ID ${productId} не найден`)
                    }

                    const productBefore = beforeResult.rows[0]

                    const afterResult = await client.query(
                        `UPDATE products
                         SET
                            stock = COALESCE(stock, 0) + $1,
                            purchase_price = $2,
                            selling_price = $3,
                            unit = $4,
                            min_stock = $5,
                            name = COALESCE(NULLIF($6, ''), name),
                            category = COALESCE(NULLIF($7, ''), category),
                            barcode = COALESCE(NULLIF($8, ''), barcode),
                            image = COALESCE(NULLIF($9, ''), image)
                         WHERE id = $10
                         RETURNING *`,
                        [
                            quantity,
                            purchasePrice,
                            sellingPrice,
                            unit,
                            toNumber(row.minStock, 0),
                            normalizeText(row.name),
                            normalizeText(row.category),
                            normalizeText(row.barcode),
                            normalizeText(row.image),
                            productId,
                        ]
                    )

                    updated++
                    await insertAcceptanceItem(client, {
                        acceptanceId,
                        row,
                        rowNumber,
                        action,
                        status,
                        productId,
                        matchedProductId: productId,
                        matchedProductName: normalizeText(row.matchedProductName) || productBefore.name,
                        matchedProductBarcode: normalizeText(row.matchedProductBarcode) || productBefore.barcode,
                        productBefore,
                        productAfter: afterResult.rows[0],
                        appliedQuantity: quantity,
                        createdProduct: false,
                        error: null,
                    })
                    continue
                }

                const name = normalizeText(row.name)

                if (!name) {
                    throw new Error('Для создания товара нужно указать название')
                }

                const barcode = normalizeText(row.barcode) || makeAutoBarcode(acceptanceId, rowNumber)

                const afterResult = await client.query(
                    `INSERT INTO products (
                        name,
                        category,
                        barcode,
                        purchase_price,
                        selling_price,
                        unit,
                        stock,
                        min_stock,
                        image
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    RETURNING *`,
                    [
                        name,
                        normalizeText(row.category),
                        barcode,
                        purchasePrice,
                        sellingPrice,
                        unit,
                        quantity,
                        toNumber(row.minStock, 0),
                        normalizeText(row.image),
                    ]
                )

                const createdProduct = afterResult.rows[0]
                created++

                await insertAcceptanceItem(client, {
                    acceptanceId,
                    row: { ...row, barcode },
                    rowNumber,
                    action,
                    status,
                    productId: Number(createdProduct.id),
                    matchedProductId: null,
                    matchedProductName: '',
                    matchedProductBarcode: '',
                    productBefore: null,
                    productAfter: createdProduct,
                    appliedQuantity: quantity,
                    createdProduct: true,
                    error: null,
                })
            } catch (error) {
                const message = `Строка ${rowNumber}: ${error instanceof Error ? error.message : 'ошибка обработки'}`
                errors.push(message)

                await insertAcceptanceItem(client, {
                    acceptanceId,
                    row,
                    rowNumber,
                    action,
                    status: 'error',
                    productId: null,
                    matchedProductId: toNullableId(row.matchedProductId),
                    matchedProductName: normalizeText(row.matchedProductName),
                    matchedProductBarcode: normalizeText(row.matchedProductBarcode),
                    productBefore: null,
                    productAfter: null,
                    appliedQuantity: 0,
                    createdProduct: false,
                    error: message,
                })
            }
        }

        const finalStatus = errors.length > 0 ? 'completed_with_errors' : 'completed'

        await client.query(
            `UPDATE product_acceptances
             SET
                total_rows = $1,
                created_count = $2,
                updated_count = $3,
                skipped_count = $4,
                error_count = $5,
                errors = $6::jsonb,
                status = $7,
                updated_at = NOW()
             WHERE id = $8`,
            [rows.length, created, updated, skipped, errors.length, JSON.stringify(errors), finalStatus, acceptanceId]
        )

        await client.query('COMMIT')

        return NextResponse.json({
            acceptanceId,
            acceptanceNumber,
            totalRows: rows.length,
            created,
            updated,
            skipped,
            errors,
        })
    } catch (error) {
        await client.query('ROLLBACK')
        console.error('POST /api/products/import/commit error:', error)

        return NextResponse.json(
            { message: error instanceof Error ? error.message : 'Ошибка применения импорта' },
            { status: 500 }
        )
    } finally {
        client.release()
    }
}

import { NextRequest, NextResponse } from 'next/server'
import type { QueryResult, QueryResultRow } from 'pg'
import { pool } from '@/app/lib/db'
import { resolveWarehouseContext, type WarehouseLocation, type WarehouseUser } from '@/app/lib/serverWarehouseLocation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ProductUnit = 'piece' | 'weight'
type ImportAction = 'update' | 'create' | 'skip'
type ImportStatus = 'matched' | 'review' | 'new' | 'error'

type IncomingRow = {
    acceptanceItemId?: number | string | null
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

type ProductDbRow = QueryResultRow & {
    id: number
    name: string
    category: string
    barcode: string
    purchase_price: string
    selling_price: string
    unit: ProductUnit
    stock: string
    min_stock: string
    image?: string | null
    image_url?: string | null
}

type AcceptanceItemDbRow = QueryResultRow & {
    id: number
    acceptance_id: number
    row_number: number
    status: ImportStatus
    action: ImportAction
    match_type: string | null
    match_score: string
    product_id: number | null
    matched_product_id: number | null
    matched_product_name: string | null
    matched_product_barcode: string | null
    name: string
    category: string
    barcode: string
    purchase_price: string
    selling_price: string
    unit: ProductUnit
    quantity: string
    min_stock: string
    image: string
    applied_quantity: string
    created_product: boolean
    error: string | null
}

type HeaderRow = QueryResultRow & {
    id: number
    number: string
    source_file_name: string | null
    supplier: string | null
    invoice_number: string | null
    comment: string | null
    total_rows: number | null
    created_count: number | null
    updated_count: number | null
    skipped_count: number | null
    error_count: number | null
    status: string
    errors: unknown
    created_at: string
    updated_at: string
    location_id: number
    location_name?: string
    location_slug?: string
}

type StockRow = QueryResultRow & {
    stock: string
}

type DbClient = {
    query<T extends QueryResultRow = QueryResultRow>(
        text: string,
        params?: readonly unknown[]
    ): Promise<QueryResult<T>>
    release(): void
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

function makeAutoBarcode(acceptanceId: number, rowNumber: number) {
    return `AUTO-${acceptanceId}-${rowNumber}-${Date.now()}`
}

function makeAcceptanceItemResult(action: ImportAction, createdProduct: boolean, error: string | null) {
    if (error) return 'error'
    if (action === 'skip') return 'skipped'
    if (createdProduct) return 'created'
    if (action === 'update') return 'updated'
    return 'success'
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
        image: row.image_url || row.image || '',
    }
}

async function ensureProductStockRows(
    client: DbClient,
    productId: number,
    locationId: number,
    currentLocationInitialStock = 0
) {
    await client.query(
        `
        INSERT INTO product_stocks (product_id, location_id, stock)
        SELECT
            $1,
            l.id,
            CASE WHEN l.id = $2 THEN $3 ELSE 0 END
        FROM locations l
        WHERE l.is_active = TRUE
        ON CONFLICT (product_id, location_id) DO NOTHING
        `,
        [productId, locationId, currentLocationInitialStock]
    )
}

async function getProductWithLocationStockForUpdate(
    client: DbClient,
    productId: number,
    locationId: number
): Promise<ProductDbRow | null> {
    const productResult = await client.query<ProductDbRow>(
        `
        SELECT
            id,
            name,
            category,
            barcode,
            purchase_price,
            selling_price,
            unit,
            stock,
            min_stock,
            image,
            image_url
        FROM products
        WHERE id = $1
        FOR UPDATE
        `,
        [productId]
    )

    if (productResult.rowCount === 0) {
        return null
    }

    await ensureProductStockRows(client, productId, locationId, 0)

    const stockResult = await client.query<StockRow>(
        `
        SELECT stock
        FROM product_stocks
        WHERE product_id = $1 AND location_id = $2
        FOR UPDATE
        `,
        [productId, locationId]
    )

    return {
        ...productResult.rows[0],
        stock: String(stockResult.rows[0]?.stock ?? 0),
    }
}

async function addLocationStock(
    client: DbClient,
    productId: number,
    location: WarehouseLocation,
    quantityDelta: number,
    acceptanceId: number,
    comment: string,
    createdBy: string
): Promise<number> {
    await ensureProductStockRows(client, productId, location.id, 0)

    const stockResult = await client.query<StockRow>(
        `
        UPDATE product_stocks
        SET
            stock = COALESCE(stock, 0) + $3,
            updated_at = NOW()
        WHERE product_id = $1 AND location_id = $2
        RETURNING stock
        `,
        [productId, location.id, quantityDelta]
    )

    const stockAfter = Number(stockResult.rows[0]?.stock ?? 0)

    await client.query(
        `
        INSERT INTO stock_movements (
            product_id,
            location_id,
            movement_type,
            quantity_delta,
            stock_after,
            document_type,
            document_id,
            comment,
            created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
            productId,
            location.id,
            quantityDelta >= 0 ? 'acceptance_edit' : 'acceptance_edit_reverse',
            quantityDelta,
            stockAfter,
            'product_acceptance',
            acceptanceId,
            comment,
            createdBy,
        ]
    )

    return stockAfter
}

async function updateLegacyProductStockIfNeeded(
    client: DbClient,
    productId: number,
    location: WarehouseLocation,
    quantityDelta: number
) {
    if (location.slug !== 'tochka') {
        return
    }

    await client.query(
        `
        UPDATE products
        SET stock = COALESCE(stock, 0) + $1
        WHERE id = $2
        `,
        [quantityDelta, productId]
    )
}

async function reverseOldEffect(
    client: DbClient,
    location: WarehouseLocation,
    acceptanceId: number,
    item: AcceptanceItemDbRow,
    user: WarehouseUser
) {
    const oldProductId = toNullableId(item.product_id)
    const oldQuantity = toNumber(item.applied_quantity, 0)

    if (!oldProductId || oldQuantity <= 0) return

    await getProductWithLocationStockForUpdate(client, oldProductId, location.id)

    await addLocationStock(
        client,
        oldProductId,
        location,
        -oldQuantity,
        acceptanceId,
        `Откат старой строки приёмки ${location.name}`,
        user.login
    )

    await updateLegacyProductStockIfNeeded(client, oldProductId, location, -oldQuantity)
}

async function applyRowEffect(
    client: DbClient,
    location: WarehouseLocation,
    acceptanceId: number,
    row: IncomingRow,
    existingItem: AcceptanceItemDbRow | undefined,
    user: WarehouseUser
) {
    const rowNumber = Number(row.rowNumber || existingItem?.row_number || 0)
    const action = normalizeAction(row.action)
    const quantity = toNumber(row.stock, 0)
    const purchasePrice = toNumber(row.purchasePrice, 0)
    const sellingPrice = Math.round(toNumber(row.sellingPrice, 0))
    const unit = normalizeUnit(row.unit)
    const minStock = toNumber(row.minStock, 0)
    const name = normalizeText(row.name)
    const category = normalizeText(row.category)
    const image = normalizeText(row.image)

    if (action === 'skip') {
        return {
            action,
            productId: toNullableId(row.productId) ?? toNullableId(row.matchedProductId) ?? existingItem?.product_id ?? null,
            matchedProductId: toNullableId(row.matchedProductId) ?? existingItem?.matched_product_id ?? null,
            matchedProductName: normalizeText(row.matchedProductName) || existingItem?.matched_product_name || '',
            matchedProductBarcode: normalizeText(row.matchedProductBarcode) || existingItem?.matched_product_barcode || '',
            productBefore: null as ProductDbRow | null,
            productAfter: null as ProductDbRow | null,
            appliedQuantity: 0,
            createdProduct: existingItem?.created_product ?? false,
            barcode: normalizeText(row.barcode),
        }
    }

    if (quantity <= 0) {
        throw new Error('Количество должно быть больше 0')
    }

    if (purchasePrice <= 0) {
        throw new Error('Цена закупки должна быть больше 0')
    }

    if (sellingPrice <= 0) {
        throw new Error('Цена продажи должна быть больше 0')
    }

    if (action === 'update') {
        const productId = toNullableId(row.matchedProductId) ?? toNullableId(row.productId) ?? existingItem?.product_id ?? null

        if (!productId) {
            throw new Error('Для обновления нужно выбрать товар из БД')
        }

        const productBefore = await getProductWithLocationStockForUpdate(client, productId, location.id)

        if (!productBefore) {
            throw new Error(`Товар ID ${productId} не найден`)
        }

        const barcode = normalizeText(row.barcode)

        const productResult = await client.query<ProductDbRow>(
            `UPDATE products
             SET
                purchase_price = $1,
                selling_price = $2,
                unit = $3,
                min_stock = $4,
                name = COALESCE(NULLIF($5, ''), name),
                category = COALESCE(NULLIF($6, ''), category),
                barcode = COALESCE(NULLIF($7, ''), barcode),
                image = COALESCE(NULLIF($8, ''), image),
                image_url = COALESCE(NULLIF($8, ''), image_url)
             WHERE id = $9
             RETURNING id, name, category, barcode, purchase_price, selling_price, unit, stock, min_stock, image, image_url`,
            [purchasePrice, sellingPrice, unit, minStock, name, category, barcode, image, productId]
        )

        const stockAfter = await addLocationStock(
            client,
            productId,
            location,
            quantity,
            acceptanceId,
            `Редактирование приёмки ${location.name}`,
            user.login
        )

        await updateLegacyProductStockIfNeeded(client, productId, location, quantity)

        return {
            action,
            productId,
            matchedProductId: productId,
            matchedProductName: normalizeText(row.matchedProductName) || productBefore.name,
            matchedProductBarcode: normalizeText(row.matchedProductBarcode) || productBefore.barcode,
            productBefore,
            productAfter: {
                ...productResult.rows[0],
                stock: String(stockAfter),
            },
            appliedQuantity: quantity,
            createdProduct: existingItem?.created_product ?? false,
            barcode,
        }
    }

    if (!name) {
        throw new Error('Для создания товара нужно указать название')
    }

    const existingProductId = existingItem?.product_id ?? toNullableId(row.productId)

    if (existingProductId) {
        const productBefore = await getProductWithLocationStockForUpdate(client, existingProductId, location.id)

        if (!productBefore) {
            throw new Error(`Товар ID ${existingProductId} не найден`)
        }

        const barcode = normalizeText(row.barcode) || productBefore.barcode || makeAutoBarcode(acceptanceId, rowNumber)

        const productResult = await client.query<ProductDbRow>(
            `UPDATE products
             SET
                purchase_price = $1,
                selling_price = $2,
                unit = $3,
                min_stock = $4,
                name = $5,
                category = $6,
                barcode = $7,
                image = $8,
                image_url = $8
             WHERE id = $9
             RETURNING id, name, category, barcode, purchase_price, selling_price, unit, stock, min_stock, image, image_url`,
            [purchasePrice, sellingPrice, unit, minStock, name, category, barcode, image, existingProductId]
        )

        const stockAfter = await addLocationStock(
            client,
            existingProductId,
            location,
            quantity,
            acceptanceId,
            `Редактирование созданного товара в приёмке ${location.name}`,
            user.login
        )

        await updateLegacyProductStockIfNeeded(client, existingProductId, location, quantity)

        return {
            action,
            productId: existingProductId,
            matchedProductId: null,
            matchedProductName: '',
            matchedProductBarcode: '',
            productBefore,
            productAfter: {
                ...productResult.rows[0],
                stock: String(stockAfter),
            },
            appliedQuantity: quantity,
            createdProduct: existingItem?.created_product ?? true,
            barcode,
        }
    }

    const barcode = normalizeText(row.barcode) || makeAutoBarcode(acceptanceId, rowNumber)
    const legacyStock = location.slug === 'tochka' ? quantity : 0

    const productResult = await client.query<ProductDbRow>(
        `INSERT INTO products (
            name,
            category,
            barcode,
            purchase_price,
            selling_price,
            unit,
            stock,
            min_stock,
            image,
            image_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
        RETURNING id, name, category, barcode, purchase_price, selling_price, unit, stock, min_stock, image, image_url`,
        [name, category, barcode, purchasePrice, sellingPrice, unit, legacyStock, minStock, image]
    )

    const productId = Number(productResult.rows[0].id)

    await ensureProductStockRows(client, productId, location.id, 0)
    const stockAfter = await addLocationStock(
        client,
        productId,
        location,
        quantity,
        acceptanceId,
        `Создание товара через редактирование приёмки ${location.name}`,
        user.login
    )

    return {
        action,
        productId,
        matchedProductId: null,
        matchedProductName: '',
        matchedProductBarcode: '',
        productBefore: null as ProductDbRow | null,
        productAfter: {
            ...productResult.rows[0],
            stock: String(stockAfter),
        },
        appliedQuantity: quantity,
        createdProduct: true,
        barcode,
    }
}

async function upsertAcceptanceItem(
    client: DbClient,
    acceptanceId: number,
    row: IncomingRow,
    effect: Awaited<ReturnType<typeof applyRowEffect>>,
    error: string | null
) {
    const acceptanceItemId = toNullableId(row.acceptanceItemId)
    const rowNumber = Number(row.rowNumber || 0)
    const status = error ? 'error' : normalizeStatus(row.status)
    const action = normalizeAction(row.action)
    const result = makeAcceptanceItemResult(action, effect.createdProduct, error)

    const values = [
        rowNumber,
        status,
        action,
        normalizeText(row.matchType),
        toNumber(row.matchScore, 0),
        effect.productId,
        effect.matchedProductId,
        effect.matchedProductName,
        effect.matchedProductBarcode,
        JSON.stringify(productSnapshot(effect.productBefore)),
        JSON.stringify(productSnapshot(effect.productAfter)),
        normalizeText(row.name),
        normalizeText(row.category),
        effect.barcode || normalizeText(row.barcode),
        toNumber(row.purchasePrice, 0),
        Math.round(toNumber(row.sellingPrice, 0)),
        normalizeUnit(row.unit),
        toNumber(row.stock, 0),
        toNumber(row.minStock, 0),
        normalizeText(row.image),
        effect.appliedQuantity,
        effect.createdProduct,
        result,
        error,
    ]

    if (acceptanceItemId) {
        await client.query(
            `UPDATE product_acceptance_items
             SET
                row_number = $1,
                status = $2,
                action = $3,
                match_type = $4,
                match_score = $5,
                product_id = $6,
                matched_product_id = $7,
                matched_product_name = $8,
                matched_product_barcode = $9,
                product_before = $10::jsonb,
                product_after = $11::jsonb,
                name = $12,
                category = $13,
                barcode = $14,
                purchase_price = $15,
                selling_price = $16,
                unit = $17,
                quantity = $18,
                min_stock = $19,
                image = $20,
                applied_quantity = $21,
                created_product = $22,
                result = $23,
                error = $24,
                updated_at = NOW()
             WHERE id = $25 AND acceptance_id = $26`,
            [...values, acceptanceItemId, acceptanceId]
        )
    } else {
        await client.query(
            `INSERT INTO product_acceptance_items (
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
                result,
                error,
                acceptance_id
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb,
                $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
            )`,
            [...values, acceptanceId]
        )
    }
}

async function getReceiptId(context: { params: Promise<{ id: string }> | { id: string } }): Promise<number | null> {
    const params = await context.params
    return toNullableId(params.id)
}

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> | { id: string } }
) {
    try {
        const { location } = await resolveWarehouseContext(pool, request)
        const acceptanceId = await getReceiptId(context)

        if (!acceptanceId) {
            return NextResponse.json({ message: 'Некорректный ID приёмки' }, { status: 400 })
        }

        const headerResult = await pool.query<HeaderRow>(
            `SELECT
                pa.id,
                pa.number,
                pa.source_file_name,
                pa.supplier,
                pa.invoice_number,
                pa.comment,
                pa.total_rows,
                pa.created_count,
                pa.updated_count,
                pa.skipped_count,
                pa.error_count,
                pa.status,
                pa.errors,
                pa.created_at,
                pa.updated_at,
                pa.location_id,
                COALESCE(pa.created_by_name, '') AS created_by_name,
                COALESCE(pa.created_by_login, '') AS created_by_login,
                l.name AS location_name,
                l.slug AS location_slug
             FROM product_acceptances pa
             JOIN locations l ON l.id = pa.location_id
             WHERE pa.id = $1 AND pa.location_id = $2`,
            [acceptanceId, location.id]
        )

        if (headerResult.rowCount === 0) {
            return NextResponse.json({ message: 'Приёмка не найдена в текущей зоне' }, { status: 404 })
        }

        const itemsResult = await pool.query(
            `SELECT
                i.*,
                p.name AS product_name,
                p.category AS product_category,
                p.barcode AS product_barcode,
                COALESCE(ps.stock, 0) AS product_stock,
                p.purchase_price AS product_purchase_price,
                p.selling_price AS product_selling_price
             FROM product_acceptance_items i
             LEFT JOIN products p ON p.id = COALESCE(i.matched_product_id, i.product_id)
             LEFT JOIN product_stocks ps ON ps.product_id = p.id AND ps.location_id = $2
             WHERE i.acceptance_id = $1
             ORDER BY i.row_number ASC, i.id ASC`,
            [acceptanceId, location.id]
        )

        const header = headerResult.rows[0]

        return NextResponse.json({
            id: Number(header.id),
            number: header.number,
            sourceFileName: header.source_file_name,
            supplier: header.supplier || '',
            invoiceNumber: header.invoice_number || '',
            comment: header.comment || '',
            totalRows: Number(header.total_rows ?? 0),
            created: Number(header.created_count ?? 0),
            updated: Number(header.updated_count ?? 0),
            skipped: Number(header.skipped_count ?? 0),
            errors: Array.isArray(header.errors) ? header.errors : [],
            status: header.status,
            createdAt: header.created_at,
            updatedAt: header.updated_at,
            createdByName: header.created_by_name || '',
            createdByLogin: header.created_by_login || '',
            locationId: Number(header.location_id),
            locationName: header.location_name,
            locationSlug: header.location_slug,
            rows: itemsResult.rows.map((row: any, index: number) => ({
                acceptanceItemId: Number(row.id),
                productId: row.product_id ? Number(row.product_id) : null,
                rowId: `history-${row.id}`,
                rowNumber: Number(row.row_number || index + 1),
                status: row.status,
                action: row.action,
                matchType: row.match_type || '',
                matchScore: Number(row.match_score ?? 0),
                matchedProductId: row.matched_product_id ? Number(row.matched_product_id) : row.product_id ? Number(row.product_id) : null,
                matchedProductName: row.matched_product_name || row.product_name || '',
                matchedProductBarcode: row.matched_product_barcode || row.product_barcode || '',
                suggestions: row.product_id
                    ? [{
                        id: Number(row.product_id),
                        name: row.product_name || row.matched_product_name || row.name,
                        category: row.product_category || row.category,
                        barcode: row.product_barcode || row.matched_product_barcode || row.barcode,
                        stock: Number(row.product_stock ?? 0),
                        purchasePrice: Number(row.product_purchase_price ?? row.purchase_price ?? 0),
                        sellingPrice: Number(row.product_selling_price ?? row.selling_price ?? 0),
                        score: 1,
                    }]
                    : [],
                error: row.error,
                name: row.name || '',
                category: row.category || '',
                barcode: row.barcode || '',
                purchasePrice: String(row.purchase_price ?? 0),
                sellingPrice: String(row.selling_price ?? 0),
                unit: row.unit === 'weight' ? 'weight' : 'piece',
                stock: String(row.quantity ?? 0),
                minStock: String(row.min_stock ?? 0),
                image: row.image || '',
            })),
        })
    } catch (error) {
        console.error('GET /api/products/import/history/[id] error:', error)

        return NextResponse.json(
            { message: 'Не удалось загрузить приёмку' },
            { status: 500 }
        )
    }
}

export async function PUT(
    request: NextRequest,
    context: { params: Promise<{ id: string }> | { id: string } }
) {
    const client = await pool.connect() as unknown as DbClient

    try {
        const { location, user } = await resolveWarehouseContext(client, request)
        const acceptanceId = await getReceiptId(context)

        if (!acceptanceId) {
            return NextResponse.json({ message: 'Некорректный ID приёмки' }, { status: 400 })
        }

        const body = await request.json()
        const rows: IncomingRow[] = Array.isArray(body.rows) ? body.rows : []

        if (rows.length === 0) {
            return NextResponse.json({ message: 'В приёмке должна быть хотя бы одна строка' }, { status: 400 })
        }

        await client.query('BEGIN')

        const headerResult = await client.query(
            'SELECT id FROM product_acceptances WHERE id = $1 AND location_id = $2 FOR UPDATE',
            [acceptanceId, location.id]
        )

        if (headerResult.rowCount === 0) {
            await client.query('ROLLBACK')
            return NextResponse.json({ message: 'Приёмка не найдена в текущей зоне' }, { status: 404 })
        }

        const existingItemsResult = await client.query<AcceptanceItemDbRow>(
            'SELECT * FROM product_acceptance_items WHERE acceptance_id = $1 FOR UPDATE',
            [acceptanceId]
        )

        const existingById = new Map<number, AcceptanceItemDbRow>()
        existingItemsResult.rows.forEach(item => existingById.set(Number(item.id), item))

        const submittedExistingIds = new Set<number>()
        const errors: string[] = []

        for (let index = 0; index < rows.length; index++) {
            const row = rows[index]
            const rowNumber = Number(row.rowNumber || index + 1)
            row.rowNumber = rowNumber

            const itemId = toNullableId(row.acceptanceItemId)
            const existingItem = itemId ? existingById.get(itemId) : undefined

            if (itemId) submittedExistingIds.add(itemId)

            try {
                if (existingItem) {
                    await reverseOldEffect(client, location, acceptanceId, existingItem, user)
                }

                const effect = await applyRowEffect(client, location, acceptanceId, row, existingItem, user)
                await upsertAcceptanceItem(client, acceptanceId, row, effect, null)
            } catch (error) {
                const message = `Строка ${rowNumber}: ${error instanceof Error ? error.message : 'ошибка обработки'}`
                throw new Error(message)
            }
        }

        for (const item of existingItemsResult.rows) {
            const itemId = Number(item.id)

            if (!submittedExistingIds.has(itemId)) {
                await reverseOldEffect(client, location, acceptanceId, item, user)
                await client.query(
                    'DELETE FROM product_acceptance_items WHERE id = $1 AND acceptance_id = $2',
                    [itemId, acceptanceId]
                )
            }
        }

        const savedItemsResult = await client.query(
            'SELECT action, error FROM product_acceptance_items WHERE acceptance_id = $1',
            [acceptanceId]
        )

        const created = savedItemsResult.rows.filter(row => row.action === 'create' && !row.error).length
        const updated = savedItemsResult.rows.filter(row => row.action === 'update' && !row.error).length
        const skipped = savedItemsResult.rows.filter(row => row.action === 'skip' && !row.error).length
        const errorCount = savedItemsResult.rows.filter(row => row.error).length
        const totalRows = savedItemsResult.rows.length
        const finalStatus = errorCount > 0 ? 'completed_with_errors' : 'completed'

        await client.query(
            `UPDATE product_acceptances
             SET
                supplier = $1,
                invoice_number = $2,
                comment = $3,
                total_rows = $4,
                created_count = $5,
                updated_count = $6,
                skipped_count = $7,
                error_count = $8,
                errors = $9::jsonb,
                status = $10,
                updated_by_name = $11,
                updated_by_login = $12,
                updated_at = NOW()
             WHERE id = $13 AND location_id = $14`,
            [
                normalizeText(body.supplier) || null,
                normalizeText(body.invoiceNumber) || null,
                normalizeText(body.comment) || null,
                totalRows,
                created,
                updated,
                skipped,
                errorCount,
                JSON.stringify(errors),
                finalStatus,
                user.name,
                user.login,
                acceptanceId,
                location.id,
            ]
        )

        await client.query('COMMIT')

        return NextResponse.json({
            acceptanceId,
            updatedByName: user.name,
            updatedByLogin: user.login,
            locationId: location.id,
            locationName: location.name,
            totalRows,
            created,
            updated,
            skipped,
            errors,
        })
    } catch (error) {
        await client.query('ROLLBACK')
        console.error('PUT /api/products/import/history/[id] error:', error)

        return NextResponse.json(
            { message: error instanceof Error ? error.message : 'Ошибка сохранения приёмки' },
            { status: 500 }
        )
    } finally {
        client.release()
    }
}

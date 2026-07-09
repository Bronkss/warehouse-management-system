import { NextRequest, NextResponse } from 'next/server'
import type { PoolClient, QueryResultRow } from 'pg'
import { pool } from '@/app/lib/db'
import { resolveWarehouseContext, type WarehouseLocation } from '@/app/lib/serverWarehouseLocation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ProductUnit = 'piece' | 'weight'

type WriteoffReason = {
    value: string
    label: string
}

type WriteoffItemInput = {
    productId?: number | string | null
    quantity?: number | string | null
    category?: string | null
    purchasePrice?: number | string | null
    sellingPrice?: number | string | null
}

type ProductStockRow = QueryResultRow & {
    id: number
    name: string
    category: string | null
    barcode: string | null
    purchase_price: string | number | null
    selling_price: string | number | null
    unit: ProductUnit | string | null
    stock: string | number | null
}

type WriteoffIdRow = QueryResultRow & {
    id: number
}

const WRITEOFF_REASONS: WriteoffReason[] = [
    { value: 'expired', label: 'Истечение срока годности' },
    { value: 'lost_presentation', label: 'Потеря товарного вида' },
    { value: 'damaged_packaging', label: 'Повреждение упаковки' },
    { value: 'spoilage', label: 'Порча товара' },
    { value: 'broken', label: 'Бой / поломка' },
    { value: 'inventory_shortage', label: 'Недостача по инвентаризации' },
    { value: 'stock_correction', label: 'Корректировка остатков' },
    { value: 'loss_or_theft', label: 'Утеря / кража' },
    { value: 'supplier_defect', label: 'Брак поставщика' },
    { value: 'transport_damage', label: 'Повреждение при перевозке' },
    { value: 'sample_or_demo', label: 'Образец / тест / демонстрация' },
    { value: 'internal_use', label: 'Внутреннее использование' },
    { value: 'other', label: 'Другое' },
]

function toNumber(value: unknown): number {
    const parsed = Number(String(value ?? '0').replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : 0
}

function money(value: unknown): number {
    return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100
}

function roundStock(value: number): number {
    return Math.round((value + Number.EPSILON) * 1000) / 1000
}

function normalizeUnit(value: unknown): ProductUnit {
    return value === 'weight' ? 'weight' : 'piece'
}

function normalizeQuantity(value: unknown, unit: ProductUnit, rowNumber: number): number {
    const parsed = toNumber(value)

    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Строка ${rowNumber}: некорректное количество`)
    }

    if (unit === 'piece') {
        if (!Number.isInteger(parsed)) {
            throw new Error(`Строка ${rowNumber}: для штучного товара количество должно быть целым`)
        }

        return parsed
    }

    return roundStock(parsed)
}

function getReasonLabel(value: unknown, fallback?: unknown): string {
    const reason = String(value || '').trim()
    const found = WRITEOFF_REASONS.find(item => item.value === reason)

    if (found) {
        return found.label
    }

    const safeFallback = String(fallback || '').trim()

    return safeFallback || 'Другое'
}

function createWriteoffNumber(): string {
    const date = new Date()
    const pad = (value: number) => String(value).padStart(2, '0')

    const datePart = [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
    ].join('')

    const timePart = [
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds()),
    ].join('')

    return `СП-${datePart}-${timePart}`
}

function mapInsertedRow(row: Record<string, unknown>) {
    return {
        writeoffItemId: Number(row.id),
        productId: row.product_id === null ? null : Number(row.product_id),
        rowId: String(row.row_id || ''),
        rowNumber: Number(row.row_number || 0),
        name: String(row.name || ''),
        category: String(row.category || ''),
        barcode: String(row.barcode || ''),
        unit: normalizeUnit(row.unit),
        quantity: String(row.quantity ?? '0'),
        purchasePrice: String(row.purchase_price ?? '0'),
        sellingPrice: String(row.selling_price ?? '0'),
        previousStock: row.previous_stock === null ? null : toNumber(row.previous_stock),
        newStock: row.new_stock === null ? null : toNumber(row.new_stock),
        result: String(row.result || 'written_off'),
        error: row.error ? String(row.error) : null,
    }
}

async function ensureProductStockRow(client: PoolClient, productId: number, locationId: number) {
    await client.query(
        `
        INSERT INTO product_stocks (product_id, location_id, stock)
        VALUES ($1, $2, 0)
        ON CONFLICT (product_id, location_id) DO NOTHING
        `,
        [productId, locationId]
    )
}

async function loadProductStock(
    client: PoolClient,
    productId: number,
    locationId: number
): Promise<ProductStockRow | null> {
    await ensureProductStockRow(client, productId, locationId)

    const result = await client.query<ProductStockRow>(
        `
        SELECT
            p.id,
            p.name,
            p.category,
            p.barcode,
            p.purchase_price,
            p.selling_price,
            p.unit,
            ps.stock
        FROM products p
        JOIN product_stocks ps ON ps.product_id = p.id
        WHERE p.id = $1 AND ps.location_id = $2
        FOR UPDATE OF p, ps
        `,
        [productId, locationId]
    )

    return result.rows[0] || null
}

async function syncLegacyTochkaStock(
    client: PoolClient,
    location: WarehouseLocation,
    productId: number,
    stock: number
) {
    if (location.slug !== 'tochka') {
        return
    }

    await client.query(
        `
        UPDATE products
        SET
            stock = $1,
            updated_at = NOW()
        WHERE id = $2
        `,
        [stock, productId]
    )
}

async function insertStockMovement(
    client: PoolClient,
    productId: number,
    location: WarehouseLocation,
    quantityDelta: number,
    stockAfter: number,
    writeoffId: number,
    comment: string,
    createdBy: string
) {
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
        )
        VALUES ($1, $2, 'writeoff', $3, $4, 'writeoff', $5, $6, $7)
        `,
        [
            productId,
            location.id,
            quantityDelta,
            stockAfter,
            writeoffId,
            comment,
            createdBy,
        ]
    )
}

export async function POST(request: NextRequest) {
    const client = await pool.connect()

    try {
        const { location, user } = await resolveWarehouseContext(client, request)
        const body = await request.json()
        const reason = String(body?.reason || '').trim() || 'other'
        const reasonLabel = getReasonLabel(reason, body?.reasonLabel)
        const responsible = String(body?.responsible || '').trim()
        const comment = String(body?.comment || '').trim()
        const items = Array.isArray(body?.items) ? body.items as WriteoffItemInput[] : []

        if (!items.length) {
            return NextResponse.json(
                { message: 'Добавьте хотя бы один товар для списания' },
                { status: 400 }
            )
        }

        await client.query('BEGIN')

        const number = createWriteoffNumber()

        const writeoffResult = await client.query<WriteoffIdRow>(
            `
            INSERT INTO writeoffs (
                number,
                reason,
                reason_label,
                responsible,
                comment,
                location_id,
                created_by_name,
                created_by_login,
                total_rows,
                total_quantity,
                total_purchase_amount,
                total_selling_amount,
                status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0, 0, 0, 'completed')
            RETURNING id
            `,
            [number, reason, reasonLabel, responsible, comment, location.id, user.name, user.login]
        )

        const writeoffId = Number(writeoffResult.rows[0].id)
        const insertedRows: ReturnType<typeof mapInsertedRow>[] = []

        let totalQuantity = 0
        let totalPurchaseAmount = 0
        let totalSellingAmount = 0

        for (let index = 0; index < items.length; index += 1) {
            const item = items[index]
            const rowNumber = index + 1
            const productId = Number(item.productId)

            if (!Number.isInteger(productId) || productId <= 0) {
                throw new Error(`Строка ${rowNumber}: товар не выбран`)
            }

            const product = await loadProductStock(client, productId, location.id)

            if (!product) {
                throw new Error(`Строка ${rowNumber}: товар не найден в базе`)
            }

            const unit = normalizeUnit(product.unit)
            const qty = normalizeQuantity(item.quantity, unit, rowNumber)
            const previousStock = roundStock(toNumber(product.stock))

            if (qty > previousStock) {
                throw new Error(
                    `Недостаточно остатка у товара «${product.name}». Доступно: ${previousStock} ${unit === 'weight' ? 'кг' : 'шт.'}`
                )
            }

            const newStock = roundStock(previousStock - qty)
            const purchasePrice = money(item.purchasePrice ?? product.purchase_price)
            const sellingPrice = money(item.sellingPrice ?? product.selling_price)
            const category = String(item.category ?? product.category ?? '').trim()

            await client.query(
                `
                UPDATE product_stocks
                SET
                    stock = $1,
                    updated_at = NOW()
                WHERE product_id = $2 AND location_id = $3
                `,
                [newStock, productId, location.id]
            )

            await syncLegacyTochkaStock(client, location, productId, newStock)

            const insertedItemResult = await client.query(
                `
                INSERT INTO writeoff_items (
                    writeoff_id,
                    product_id,
                    row_id,
                    row_number,
                    name,
                    category,
                    barcode,
                    unit,
                    quantity,
                    purchase_price,
                    selling_price,
                    previous_stock,
                    new_stock,
                    result,
                    error
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9,
                    $10, $11, $12, $13, 'written_off', NULL
                )
                RETURNING *
                `,
                [
                    writeoffId,
                    productId,
                    `writeoff-${writeoffId}-${rowNumber}`,
                    rowNumber,
                    product.name,
                    category,
                    product.barcode || '',
                    unit,
                    qty,
                    purchasePrice,
                    sellingPrice,
                    previousStock,
                    newStock,
                ]
            )

            await insertStockMovement(
                client,
                productId,
                location,
                -qty,
                newStock,
                writeoffId,
                `Списание ${number} в зоне ${location.name}: ${reasonLabel}`,
                user.login
            )

            insertedRows.push(mapInsertedRow(insertedItemResult.rows[0]))

            totalQuantity += qty
            totalPurchaseAmount += qty * purchasePrice
            totalSellingAmount += qty * sellingPrice
        }

        const updatedWriteoffResult = await client.query(
            `
            UPDATE writeoffs
            SET
                total_rows = $2,
                total_quantity = $3,
                total_purchase_amount = $4,
                total_selling_amount = $5,
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
            `,
            [
                writeoffId,
                insertedRows.length,
                roundStock(totalQuantity),
                money(totalPurchaseAmount),
                money(totalSellingAmount),
            ]
        )

        await client.query('COMMIT')

        const updatedWriteoff = updatedWriteoffResult.rows[0]

        return NextResponse.json({
            id: writeoffId,
            writeoffId,
            number: updatedWriteoff.number,
            reason: updatedWriteoff.reason,
            reasonLabel: updatedWriteoff.reason_label,
            responsible: updatedWriteoff.responsible,
            comment: updatedWriteoff.comment,
            locationId: location.id,
            locationName: location.name,
            locationSlug: location.slug,
            createdByName: user.name,
            createdByLogin: user.login,
            totalRows: Number(updatedWriteoff.total_rows || 0),
            totalQuantity: toNumber(updatedWriteoff.total_quantity),
            totalPurchaseAmount: money(updatedWriteoff.total_purchase_amount),
            totalSellingAmount: money(updatedWriteoff.total_selling_amount),
            status: updatedWriteoff.status,
            createdAt: updatedWriteoff.created_at,
            updatedAt: updatedWriteoff.updated_at,
            rows: insertedRows,
            message: 'Списание сохранено',
        })
    } catch (error) {
        await client.query('ROLLBACK')
        console.error('Writeoff POST error:', error)

        return NextResponse.json(
            {
                message: error instanceof Error
                    ? error.message
                    : 'Не удалось сохранить списание',
            },
            { status: 500 }
        )
    } finally {
        client.release()
    }
}

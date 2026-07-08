import { NextRequest, NextResponse } from 'next/server'
import type { PoolClient, QueryResultRow } from 'pg'
import { pool } from '@/app/lib/db'
import { resolveWarehouseLocation, type WarehouseLocation } from '@/app/lib/serverWarehouseLocation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ProductUnit = 'piece' | 'weight'

type RouteContext = {
    params: Promise<{ id: string }> | { id: string }
}

type WriteoffItemInput = {
    writeoffItemId?: number | string | null
    productId?: number | string | null
    rowId?: string | null
    rowNumber?: number | string | null
    name?: string | null
    category?: string | null
    barcode?: string | null
    unit?: ProductUnit | string | null
    quantity?: number | string | null
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

type WriteoffRow = QueryResultRow & {
    id: number
    number: string
    reason: string | null
    reason_label: string | null
    responsible: string | null
    comment: string | null
    total_rows: number | string | null
    total_quantity: number | string | null
    total_purchase_amount: number | string | null
    total_selling_amount: number | string | null
    status: string | null
    created_at: string
    updated_at: string
    location_id: number
    location_name?: string
    location_slug?: string
}

type WriteoffItemRow = QueryResultRow & {
    id: number
    product_id: number | null
    row_id: string
    row_number: number
    name: string
    category: string
    barcode: string
    unit: ProductUnit | string
    quantity: string | number
    purchase_price: string | number
    selling_price: string | number
    previous_stock: string | number | null
    new_stock: string | number | null
    result: string
    error: string | null
}

const WRITEOFF_REASONS = [
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

async function getWriteoffId(context: RouteContext): Promise<number | null> {
    const params = await context.params
    const id = Number(params.id)

    return Number.isInteger(id) && id > 0 ? id : null
}

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

function mapWriteoff(row: WriteoffRow) {
    return {
        id: Number(row.id),
        number: String(row.number || ''),
        reason: String(row.reason || ''),
        reasonLabel: String(row.reason_label || ''),
        responsible: String(row.responsible || ''),
        comment: String(row.comment || ''),
        locationId: Number(row.location_id),
        locationName: String(row.location_name || ''),
        locationSlug: String(row.location_slug || ''),
        totalRows: Number(row.total_rows || 0),
        totalQuantity: toNumber(row.total_quantity),
        totalPurchaseAmount: money(row.total_purchase_amount),
        totalSellingAmount: money(row.total_selling_amount),
        status: String(row.status || ''),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

function mapWriteoffItem(row: WriteoffItemRow) {
    return {
        writeoffItemId: row.id === null ? null : Number(row.id),
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
    movementType: 'writeoff' | 'writeoff_reverse',
    quantityDelta: number,
    stockAfter: number,
    writeoffId: number,
    comment: string
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
        VALUES ($1, $2, $3, $4, $5, 'writeoff', $6, $7, 'system')
        `,
        [
            productId,
            location.id,
            movementType,
            quantityDelta,
            stockAfter,
            writeoffId,
            comment,
        ]
    )
}

async function loadWriteoffDetail(id: number, locationId: number) {
    const writeoffResult = await pool.query<WriteoffRow>(
        `
        SELECT
            w.id,
            w.number,
            w.reason,
            w.reason_label,
            w.responsible,
            w.comment,
            w.total_rows,
            w.total_quantity,
            w.total_purchase_amount,
            w.total_selling_amount,
            w.status,
            w.created_at,
            w.updated_at,
            w.location_id,
            l.name AS location_name,
            l.slug AS location_slug
        FROM writeoffs w
        JOIN locations l ON l.id = w.location_id
        WHERE w.id = $1 AND w.location_id = $2
        `,
        [id, locationId]
    )

    const writeoff = writeoffResult.rows[0]

    if (!writeoff) {
        return null
    }

    const rowsResult = await pool.query<WriteoffItemRow>(
        `
        SELECT
            id,
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
        FROM writeoff_items
        WHERE writeoff_id = $1
        ORDER BY row_number ASC, id ASC
        `,
        [id]
    )

    return {
        ...mapWriteoff(writeoff),
        rows: rowsResult.rows.map(mapWriteoffItem),
    }
}

export async function GET(request: NextRequest, context: RouteContext) {
    try {
        const location = await resolveWarehouseLocation(pool, request)
        const id = await getWriteoffId(context)

        if (!id) {
            return NextResponse.json({ message: 'Некорректный ID списания' }, { status: 400 })
        }

        const detail = await loadWriteoffDetail(id, location.id)

        if (!detail) {
            return NextResponse.json({ message: 'Списание не найдено в текущей зоне' }, { status: 404 })
        }

        return NextResponse.json(detail)
    } catch (error) {
        console.error('Writeoff detail GET error:', error)

        return NextResponse.json(
            { message: 'Не удалось открыть списание' },
            { status: 500 }
        )
    }
}

export async function PUT(request: NextRequest, context: RouteContext) {
    const client = await pool.connect()

    try {
        const location = await resolveWarehouseLocation(client, request)
        const id = await getWriteoffId(context)

        if (!id) {
            return NextResponse.json({ message: 'Некорректный ID списания' }, { status: 400 })
        }

        const body = await request.json()
        const rows = Array.isArray(body?.rows) ? body.rows as WriteoffItemInput[] : []

        if (!rows.length) {
            return NextResponse.json({ message: 'В списании должна быть хотя бы одна позиция' }, { status: 400 })
        }

        const reason = String(body?.reason || '').trim() || 'other'
        const reasonLabel = getReasonLabel(reason, body?.reasonLabel)
        const responsible = String(body?.responsible || '').trim()
        const comment = String(body?.comment || '').trim()

        await client.query('BEGIN')

        const writeoffResult = await client.query<WriteoffRow>(
            `
            SELECT *
            FROM writeoffs
            WHERE id = $1 AND location_id = $2
            FOR UPDATE
            `,
            [id, location.id]
        )

        const writeoff = writeoffResult.rows[0]

        if (!writeoff) {
            throw new Error('Списание не найдено в текущей зоне')
        }

        const oldRowsResult = await client.query<WriteoffItemRow>(
            `
            SELECT *
            FROM writeoff_items
            WHERE writeoff_id = $1
            ORDER BY row_number ASC, id ASC
            FOR UPDATE
            `,
            [id]
        )

        for (const oldRow of oldRowsResult.rows) {
            const productId = oldRow.product_id === null ? null : Number(oldRow.product_id)

            if (!productId) {
                continue
            }

            const product = await loadProductStock(client, productId, location.id)

            if (!product) {
                continue
            }

            const unit = normalizeUnit(product.unit)
            const restoredStock = roundStock(toNumber(product.stock) + toNumber(oldRow.quantity))

            await client.query(
                `
                UPDATE product_stocks
                SET
                    stock = $1,
                    updated_at = NOW()
                WHERE product_id = $2 AND location_id = $3
                `,
                [restoredStock, productId, location.id]
            )

            await syncLegacyTochkaStock(client, location, productId, restoredStock)
            await insertStockMovement(
                client,
                productId,
                location,
                'writeoff_reverse',
                toNumber(oldRow.quantity),
                restoredStock,
                id,
                `Возврат старой версии списания ${writeoff.number} перед редактированием`
            )
        }

        await client.query('DELETE FROM writeoff_items WHERE writeoff_id = $1', [id])

        const insertedRows: ReturnType<typeof mapWriteoffItem>[] = []
        let totalQuantity = 0
        let totalPurchaseAmount = 0
        let totalSellingAmount = 0

        for (let index = 0; index < rows.length; index += 1) {
            const row = rows[index]
            const rowNumber = index + 1
            const productId = Number(row.productId)

            if (!Number.isInteger(productId) || productId <= 0) {
                throw new Error(`Строка ${rowNumber}: товар не выбран`)
            }

            const product = await loadProductStock(client, productId, location.id)

            if (!product) {
                throw new Error(`Строка ${rowNumber}: товар не найден в базе`)
            }

            const unit = normalizeUnit(product.unit)
            const qty = normalizeQuantity(row.quantity, unit, rowNumber)
            const previousStock = roundStock(toNumber(product.stock))

            if (qty > previousStock) {
                throw new Error(
                    `Недостаточно остатка у товара «${product.name}». Доступно: ${previousStock} ${unit === 'weight' ? 'кг' : 'шт.'}`
                )
            }

            const newStock = roundStock(previousStock - qty)
            const purchasePrice = money(row.purchasePrice ?? product.purchase_price)
            const sellingPrice = money(row.sellingPrice ?? product.selling_price)
            const category = String(row.category ?? product.category ?? '').trim()

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

            const insertResult = await client.query<WriteoffItemRow>(
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
                    id,
                    productId,
                    String(row.rowId || `writeoff-${id}-${rowNumber}`),
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
                'writeoff',
                -qty,
                newStock,
                id,
                `Списание ${writeoff.number} в зоне ${location.name}: ${reasonLabel}`
            )

            insertedRows.push(mapWriteoffItem(insertResult.rows[0]))

            totalQuantity += qty
            totalPurchaseAmount += qty * purchasePrice
            totalSellingAmount += qty * sellingPrice
        }

        const updatedResult = await client.query<WriteoffRow>(
            `
            UPDATE writeoffs
            SET
                reason = $2,
                reason_label = $3,
                responsible = $4,
                comment = $5,
                total_rows = $6,
                total_quantity = $7,
                total_purchase_amount = $8,
                total_selling_amount = $9,
                status = 'completed',
                updated_at = NOW()
            WHERE id = $1 AND location_id = $10
            RETURNING *
            `,
            [
                id,
                reason,
                reasonLabel,
                responsible,
                comment,
                insertedRows.length,
                roundStock(totalQuantity),
                money(totalPurchaseAmount),
                money(totalSellingAmount),
                location.id,
            ]
        )

        await client.query('COMMIT')

        return NextResponse.json({
            ...mapWriteoff({
                ...updatedResult.rows[0],
                location_name: location.name,
                location_slug: location.slug,
            }),
            rows: insertedRows,
            message: 'Списание сохранено',
        })
    } catch (error) {
        await client.query('ROLLBACK')
        console.error('Writeoff detail PUT error:', error)

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

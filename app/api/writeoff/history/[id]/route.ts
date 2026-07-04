import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'

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

type ProductRow = {
    id: number
    name: string
    category: string | null
    barcode: string | null
    purchase_price: string | number | null
    selling_price: string | number | null
    unit: ProductUnit | string | null
    stock: string | number | null
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

function normalizeUnit(value: unknown): ProductUnit {
    return value === 'weight' ? 'weight' : 'piece'
}

function quantity(value: unknown, unit: ProductUnit): number {
    const parsed = toNumber(value)

    if (unit === 'weight') {
        return Math.round((parsed + Number.EPSILON) * 1000) / 1000
    }

    return Math.floor(parsed)
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

function mapWriteoff(row: Record<string, unknown>) {
    return {
        id: Number(row.id),
        number: String(row.number || ''),
        reason: String(row.reason || ''),
        reasonLabel: String(row.reason_label || ''),
        responsible: String(row.responsible || ''),
        comment: String(row.comment || ''),
        totalRows: Number(row.total_rows || 0),
        totalQuantity: toNumber(row.total_quantity),
        totalPurchaseAmount: money(row.total_purchase_amount),
        totalSellingAmount: money(row.total_selling_amount),
        status: String(row.status || ''),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

function mapWriteoffItem(row: Record<string, unknown>) {
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

async function loadWriteoffDetail(id: number) {
    const writeoffResult = await pool.query(
        `SELECT
            id,
            number,
            reason,
            reason_label,
            responsible,
            comment,
            total_rows,
            total_quantity,
            total_purchase_amount,
            total_selling_amount,
            status,
            created_at,
            updated_at
         FROM writeoffs
         WHERE id = $1`,
        [id]
    )

    const writeoff = writeoffResult.rows[0]

    if (!writeoff) {
        return null
    }

    const rowsResult = await pool.query(
        `SELECT
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
         ORDER BY row_number ASC, id ASC`,
        [id]
    )

    return {
        ...mapWriteoff(writeoff),
        rows: rowsResult.rows.map(mapWriteoffItem),
    }
}

export async function GET(_request: NextRequest, context: RouteContext) {
    try {
        const id = await getWriteoffId(context)

        if (!id) {
            return NextResponse.json({ message: 'Некорректный ID списания' }, { status: 400 })
        }

        const detail = await loadWriteoffDetail(id)

        if (!detail) {
            return NextResponse.json({ message: 'Списание не найдено' }, { status: 404 })
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

        const writeoffResult = await client.query(
            'SELECT * FROM writeoffs WHERE id = $1 FOR UPDATE',
            [id]
        )

        const writeoff = writeoffResult.rows[0]

        if (!writeoff) {
            throw new Error('Списание не найдено')
        }

        const oldRowsResult = await client.query(
            'SELECT * FROM writeoff_items WHERE writeoff_id = $1 ORDER BY row_number ASC, id ASC',
            [id]
        )

        for (const oldRow of oldRowsResult.rows) {
            const productId = oldRow.product_id === null ? null : Number(oldRow.product_id)

            if (!productId) {
                continue
            }

            const productResult = await client.query<ProductRow>(
                'SELECT id, unit, stock FROM products WHERE id = $1 FOR UPDATE',
                [productId]
            )

            const product = productResult.rows[0]

            if (!product) {
                continue
            }

            const unit = normalizeUnit(product.unit)
            const restoredStock = quantity(toNumber(product.stock) + toNumber(oldRow.quantity), unit)

            await client.query(
                'UPDATE products SET stock = $1 WHERE id = $2',
                [restoredStock, productId]
            )
        }

        await client.query('DELETE FROM writeoff_items WHERE writeoff_id = $1', [id])

        const insertedRows: ReturnType<typeof mapWriteoffItem>[] = []
        let totalQuantity = 0
        let totalPurchaseAmount = 0
        let totalSellingAmount = 0

        for (let index = 0; index < rows.length; index += 1) {
            const row = rows[index]
            const productId = Number(row.productId)

            if (!Number.isInteger(productId) || productId <= 0) {
                throw new Error(`Строка ${index + 1}: товар не выбран`)
            }

            const productResult = await client.query<ProductRow>(
                `SELECT
                    id,
                    name,
                    category,
                    barcode,
                    purchase_price,
                    selling_price,
                    unit,
                    stock
                 FROM products
                 WHERE id = $1
                 FOR UPDATE`,
                [productId]
            )

            const product = productResult.rows[0]

            if (!product) {
                throw new Error(`Строка ${index + 1}: товар не найден в базе`)
            }

            const unit = normalizeUnit(product.unit)
            const qty = quantity(row.quantity, unit)

            if (!Number.isFinite(qty) || qty <= 0) {
                throw new Error(`Строка ${index + 1}: некорректное количество`)
            }

            if (unit === 'piece' && !Number.isInteger(qty)) {
                throw new Error(`Строка ${index + 1}: для штучного товара количество должно быть целым`)
            }

            const previousStock = quantity(product.stock, unit)

            if (qty > previousStock) {
                throw new Error(
                    `Недостаточно остатка у товара «${product.name}». Доступно: ${previousStock} ${unit === 'weight' ? 'кг' : 'шт.'}`
                )
            }

            const newStock = quantity(previousStock - qty, unit)
            const purchasePrice = money(row.purchasePrice ?? product.purchase_price)
            const sellingPrice = money(row.sellingPrice ?? product.selling_price)
            const category = String(row.category ?? product.category ?? '').trim()

            await client.query(
                'UPDATE products SET stock = $1 WHERE id = $2',
                [newStock, productId]
            )

            const insertResult = await client.query(
                `INSERT INTO writeoff_items (
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
                RETURNING *`,
                [
                    id,
                    productId,
                    String(row.rowId || `writeoff-${id}-${index + 1}`),
                    index + 1,
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

            insertedRows.push(mapWriteoffItem(insertResult.rows[0]))

            totalQuantity += qty
            totalPurchaseAmount += qty * purchasePrice
            totalSellingAmount += qty * sellingPrice
        }

        const updatedResult = await client.query(
            `UPDATE writeoffs
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
             WHERE id = $1
             RETURNING *`,
            [
                id,
                reason,
                reasonLabel,
                responsible,
                comment,
                insertedRows.length,
                totalQuantity,
                money(totalPurchaseAmount),
                money(totalSellingAmount),
            ]
        )

        await client.query('COMMIT')

        return NextResponse.json({
            ...mapWriteoff(updatedResult.rows[0]),
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

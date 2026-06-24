import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ProductUnit = 'piece' | 'weight'

type RouteContext = {
    params: { id: string } | Promise<{ id: string }>
}

type ProductRow = {
    id: number
    name: string
    category: string
    barcode: string
    purchase_price: string | number
    selling_price: string | number
    unit: ProductUnit
    stock: string | number
    min_stock: string | number
    image: string | null
}

type ShipmentRow = {
    id: number
    number: string
    shipper: string | null
    consignee: string | null
    total_rows: number
    total_quantity: string | number
    total_amount: string | number
    status: string
    created_at: string
    updated_at: string
}

type ShipmentItemRow = {
    id: number
    shipment_id: number
    product_id: number | null
    row_number: number
    product_name: string
    category: string
    barcode: string
    unit: ProductUnit
    quantity: string | number
    purchase_price: string | number
    selling_price: string | number
    previous_stock: string | number | null
    new_stock: string | number | null
    result: string
    error: string | null
}

type ShipmentEditRow = {
    shipmentItemId?: number | null
    productId?: number | null
    rowId?: string
    rowNumber?: number
    name?: string
    category?: string
    barcode?: string
    unit?: ProductUnit
    quantity?: string | number
    purchasePrice?: string | number
    sellingPrice?: string | number
}

type ShipmentEditBody = {
    shipper?: string
    consignee?: string
    rows?: ShipmentEditRow[]
}

async function getParams(context: RouteContext) {
    return await context.params
}

function toNumber(value: unknown) {
    const parsed = Number(String(value ?? '0').replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : 0
}

function cleanString(value: unknown) {
    return String(value ?? '').trim()
}

function mapShipment(row: ShipmentRow, rows: ShipmentItemRow[]) {
    return {
        id: Number(row.id),
        number: row.number,
        shipper: row.shipper || '',
        consignee: row.consignee || '',
        totalRows: Number(row.total_rows || 0),
        totalQuantity: Number(row.total_quantity || 0),
        totalAmount: Number(row.total_amount || 0),
        status: row.status || 'completed',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        rows: rows.map(item => ({
            shipmentItemId: Number(item.id),
            productId: item.product_id ? Number(item.product_id) : null,
            rowId: `shipment-item-${item.id}`,
            rowNumber: Number(item.row_number || 0),
            name: item.product_name || '',
            category: item.category || '',
            barcode: item.barcode || '',
            unit: item.unit || 'piece',
            quantity: String(item.quantity ?? '0'),
            purchasePrice: String(item.purchase_price ?? '0'),
            sellingPrice: String(item.selling_price ?? '0'),
            previousStock: item.previous_stock === null ? null : Number(item.previous_stock),
            newStock: item.new_stock === null ? null : Number(item.new_stock),
            result: item.result || 'shipped',
            error: item.error || null,
        })),
    }
}

async function loadShipmentDetail(id: number) {
    const shipmentResult = await pool.query<ShipmentRow>(
        `
        SELECT
            id,
            number,
            shipper,
            consignee,
            total_rows,
            total_quantity,
            total_amount,
            status,
            created_at,
            updated_at
        FROM product_shipments
        WHERE id = $1
        `,
        [id]
    )

    const shipment = shipmentResult.rows[0]

    if (!shipment) {
        return null
    }

    const itemsResult = await pool.query<ShipmentItemRow>(
        `
        SELECT
            id,
            shipment_id,
            product_id,
            row_number,
            product_name,
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
        FROM product_shipment_items
        WHERE shipment_id = $1
        ORDER BY row_number ASC, id ASC
        `,
        [id]
    )

    return mapShipment(shipment, itemsResult.rows)
}

export async function GET(_request: NextRequest, context: RouteContext) {
    try {
        const params = await getParams(context)
        const id = Number(params.id)

        if (!Number.isInteger(id) || id <= 0) {
            return NextResponse.json({ message: 'Некорректный ID отгрузки' }, { status: 400 })
        }

        const detail = await loadShipmentDetail(id)

        if (!detail) {
            return NextResponse.json({ message: 'Отгрузка не найдена' }, { status: 404 })
        }

        return NextResponse.json(detail)
    } catch (error) {
        console.error('GET /api/shipment/history/[id] error:', error)

        return NextResponse.json(
            {
                message: error instanceof Error
                    ? error.message
                    : 'Не удалось открыть отгрузку',
            },
            { status: 500 }
        )
    }
}

export async function PUT(request: NextRequest, context: RouteContext) {
    const client = await pool.connect()

    try {
        const params = await getParams(context)
        const id = Number(params.id)

        if (!Number.isInteger(id) || id <= 0) {
            return NextResponse.json({ message: 'Некорректный ID отгрузки' }, { status: 400 })
        }

        const body = await request.json() as ShipmentEditBody
        const rows = Array.isArray(body.rows) ? body.rows : []
        const shipper = cleanString(body.shipper)
        const consignee = cleanString(body.consignee)

        if (rows.length === 0) {
            return NextResponse.json({ message: 'В отгрузке должна быть хотя бы одна позиция' }, { status: 400 })
        }

        await client.query('BEGIN')

        const shipmentResult = await client.query<ShipmentRow>(
            `
            SELECT
                id,
                number,
                shipper,
                consignee,
                total_rows,
                total_quantity,
                total_amount,
                status,
                created_at,
                updated_at
            FROM product_shipments
            WHERE id = $1
            FOR UPDATE
            `,
            [id]
        )

        const shipment = shipmentResult.rows[0]

        if (!shipment) {
            throw new Error('Отгрузка не найдена')
        }

        const oldItemsResult = await client.query<ShipmentItemRow>(
            `
            SELECT
                id,
                shipment_id,
                product_id,
                row_number,
                product_name,
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
            FROM product_shipment_items
            WHERE shipment_id = $1
            FOR UPDATE
            `,
            [id]
        )

        for (const oldItem of oldItemsResult.rows) {
            if (!oldItem.product_id) continue

            await client.query(
                `
                UPDATE products
                SET stock = stock + $1
                WHERE id = $2
                `,
                [toNumber(oldItem.quantity), Number(oldItem.product_id)]
            )
        }

        await client.query('DELETE FROM product_shipment_items WHERE shipment_id = $1', [id])

        let totalQuantity = 0
        let totalAmount = 0
        const updatedProducts: ProductRow[] = []

        for (let index = 0; index < rows.length; index += 1) {
            const row = rows[index]
            const productId = Number(row.productId)
            const quantity = toNumber(row.quantity)

            if (!Number.isInteger(productId) || productId <= 0) {
                throw new Error(`Строка ${index + 1}: некорректный ID товара`)
            }

            if (!Number.isFinite(quantity) || quantity <= 0) {
                throw new Error(`Строка ${index + 1}: некорректное количество`)
            }

            const productResult = await client.query<ProductRow>(
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
                    image
                FROM products
                WHERE id = $1
                FOR UPDATE
                `,
                [productId]
            )

            const product = productResult.rows[0]

            if (!product) {
                throw new Error(`Строка ${index + 1}: товар с ID ${productId} не найден`)
            }

            const previousStock = Number(product.stock)

            if (previousStock < quantity) {
                throw new Error(
                    `Строка ${index + 1}: недостаточно остатка "${product.name}". Доступно: ${previousStock}`
                )
            }

            const updateResult = await client.query<ProductRow>(
                `
                UPDATE products
                SET stock = stock - $1
                WHERE id = $2
                RETURNING
                    id,
                    name,
                    category,
                    barcode,
                    purchase_price,
                    selling_price,
                    unit,
                    stock,
                    min_stock,
                    image
                `,
                [quantity, productId]
            )

            const updatedProduct = updateResult.rows[0]
            const purchasePrice = Number(product.purchase_price || 0)
            const sellingPrice = toNumber(row.sellingPrice || product.selling_price || 0)
            const newStock = Number(updatedProduct.stock)

            await client.query(
                `
                INSERT INTO product_shipment_items (
                    shipment_id,
                    product_id,
                    row_number,
                    product_name,
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
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'shipped', NULL)
                `,
                [
                    id,
                    productId,
                    index + 1,
                    product.name || cleanString(row.name),
                    product.category || cleanString(row.category),
                    product.barcode || cleanString(row.barcode),
                    product.unit || row.unit || 'piece',
                    quantity,
                    purchasePrice,
                    sellingPrice,
                    previousStock,
                    newStock,
                ]
            )

            totalQuantity += quantity
            totalAmount += quantity * sellingPrice
            updatedProducts.push(updatedProduct)
        }

        await client.query(
            `
            UPDATE product_shipments
            SET
                shipper = $1,
                consignee = $2,
                total_rows = $3,
                total_quantity = $4,
                total_amount = $5,
                status = 'completed',
                errors = '[]'::jsonb,
                updated_at = NOW()
            WHERE id = $6
            `,
            [shipper || null, consignee || null, rows.length, totalQuantity, totalAmount, id]
        )

        await client.query('COMMIT')

        const detail = await loadShipmentDetail(id)

        return NextResponse.json({
            shipmentId: id,
            number: shipment.number,
            shipmentNumber: shipment.number,
            totalRows: rows.length,
            updated: updatedProducts.length,
            detail,
        })
    } catch (error) {
        await client.query('ROLLBACK')

        console.error('PUT /api/shipment/history/[id] error:', error)

        return NextResponse.json(
            {
                message: error instanceof Error
                    ? error.message
                    : 'Не удалось сохранить отгрузку',
            },
            { status: 500 }
        )
    } finally {
        client.release()
    }
}

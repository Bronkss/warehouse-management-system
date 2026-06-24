import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ProductUnit = 'piece' | 'weight'

interface ProductRow {
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

interface ShipmentItem {
    productId: number
    quantity: number
}

type ShipmentBody = {
    items?: ShipmentItem[]
    shipper?: string
    consignee?: string
}

const mapProduct = (row: ProductRow) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    barcode: row.barcode,
    purchasePrice: Number(row.purchase_price),
    sellingPrice: Number(row.selling_price),
    unit: row.unit,
    stock: Number(row.stock),
    minStock: Number(row.min_stock),
    image: row.image || '',
})

function generateShipmentNumber() {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')

    return `TTN-${date}-${random}`
}

function toNumber(value: unknown) {
    const parsed = Number(String(value ?? '0').replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : 0
}

function cleanString(value: unknown) {
    return String(value ?? '').trim()
}

export async function POST(request: NextRequest) {
    const client = await pool.connect()

    try {
        const body = await request.json() as ShipmentBody
        const items = body.items
        const shipper = cleanString(body.shipper)
        const consignee = cleanString(body.consignee)

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { message: 'Список товаров пуст' },
                { status: 400 }
            )
        }

        for (const item of items) {
            const productId = Number(item.productId)
            const quantity = toNumber(item.quantity)

            if (!Number.isInteger(productId) || productId <= 0) {
                return NextResponse.json(
                    { message: 'Некорректный ID товара' },
                    { status: 400 }
                )
            }

            if (!Number.isFinite(quantity) || quantity <= 0) {
                return NextResponse.json(
                    { message: 'Некорректное количество товара' },
                    { status: 400 }
                )
            }
        }

        await client.query('BEGIN')

        const shipmentNumber = generateShipmentNumber()
        const shipmentResult = await client.query<{ id: number }>(
            `
            INSERT INTO product_shipments (
                number,
                shipper,
                consignee,
                total_rows,
                total_quantity,
                total_amount,
                status,
                errors
            )
            VALUES ($1, $2, $3, 0, 0, 0, 'completed', '[]'::jsonb)
            RETURNING id
            `,
            [shipmentNumber, shipper || null, consignee || null]
        )

        const shipmentId = shipmentResult.rows[0].id
        const updatedProducts = []
        let totalQuantity = 0
        let totalAmount = 0

        for (let index = 0; index < items.length; index += 1) {
            const item = items[index]
            const productId = Number(item.productId)
            const quantity = toNumber(item.quantity)

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
                throw new Error(`Товар с ID ${productId} не найден`)
            }

            const previousStock = Number(product.stock)

            if (previousStock < quantity) {
                throw new Error(
                    `Недостаточно остатка: ${product.name}. Доступно: ${previousStock}`
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
                [
                    quantity,
                    productId,
                ]
            )

            const updatedProduct = updateResult.rows[0]
            const sellingPrice = Number(product.selling_price || 0)
            const purchasePrice = Number(product.purchase_price || 0)
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
                    shipmentId,
                    productId,
                    index + 1,
                    product.name || '',
                    product.category || '',
                    product.barcode || '',
                    product.unit || 'piece',
                    quantity,
                    purchasePrice,
                    sellingPrice,
                    previousStock,
                    newStock,
                ]
            )

            totalQuantity += quantity
            totalAmount += quantity * sellingPrice
            updatedProducts.push(mapProduct(updatedProduct))
        }

        await client.query(
            `
            UPDATE product_shipments
            SET
                total_rows = $1,
                total_quantity = $2,
                total_amount = $3,
                updated_at = NOW()
            WHERE id = $4
            `,
            [items.length, totalQuantity, totalAmount, shipmentId]
        )

        await client.query('COMMIT')

        return NextResponse.json({
            id: shipmentId,
            shipmentId,
            number: shipmentNumber,
            shipmentNumber,
            updated: updatedProducts.length,
            products: updatedProducts,
        })
    } catch (error) {
        await client.query('ROLLBACK')

        console.error('POST /api/shipment error:', error)

        return NextResponse.json(
            {
                message: error instanceof Error
                    ? error.message
                    : 'Ошибка отгрузки товара',
            },
            { status: 500 }
        )
    } finally {
        client.release()
    }
}

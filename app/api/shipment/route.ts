import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'

export const runtime = 'nodejs'

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

export async function POST(request: NextRequest) {
    const client = await pool.connect()

    try {
        const body = await request.json()
        const items = body.items as ShipmentItem[]

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { message: 'Список товаров пуст' },
                { status: 400 }
            )
        }

        for (const item of items) {
            const productId = Number(item.productId)
            const quantity = Number(item.quantity)

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
        const updatedProducts = []

        for (const item of items) {
            const productId = Number(item.productId)
            const quantity = Number(item.quantity)

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

            if (Number(product.stock) < quantity) {
                throw new Error(
                    `Недостаточно остатка: ${product.name}. Доступно: ${Number(product.stock)}`
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

            updatedProducts.push(mapProduct(updateResult.rows[0]))
        }

        await client.query('COMMIT')

        return NextResponse.json({
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
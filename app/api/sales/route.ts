import { NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'

export const runtime = 'nodejs'

type SaleItemInput = {
    productId: number | string
    name: string
    barcode?: string
    category?: string
    unit?: string
    quantity: number
    price: number
    total: number
}

const createReceiptNumber = () => {
    const now = new Date()
    const date = now.toISOString().slice(0, 10).replaceAll('-', '')
    const time = String(now.getTime()).slice(-6)

    return `${date}-${time}`
}

export async function GET() {
    try {
        const result = await pool.query(`
            SELECT
                id,
                receipt_number AS "receiptNumber",
                created_at AS "createdAt",
                payment_method AS "paymentMethod",
                payment_label AS "paymentLabel",
                total::float AS total,
                received_amount::float AS "receivedAmount",
                change_amount::float AS change,
                items
            FROM receipts
            ORDER BY created_at DESC
        `)

        return NextResponse.json(result.rows)
    } catch (error) {
        console.error(error)

        return NextResponse.json(
            { message: 'Ошибка получения чеков' },
            { status: 500 }
        )
    }
}

export async function POST(request: Request) {
    const client = await pool.connect()

    try {
        const body = await request.json()

        const items: SaleItemInput[] = body.items || []
        const paymentMethod = body.paymentMethod
        const total = Number(body.total)
        const receivedAmount = body.receivedAmount === undefined ? null : Number(body.receivedAmount)
        const change = body.change === undefined ? null : Number(body.change)

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { message: 'Чек не может быть пустым' },
                { status: 400 }
            )
        }

        if (!['card', 'cash'].includes(paymentMethod)) {
            return NextResponse.json(
                { message: 'Некорректный способ оплаты' },
                { status: 400 }
            )
        }

        if (!Number.isFinite(total) || total <= 0) {
            return NextResponse.json(
                { message: 'Некорректная сумма чека' },
                { status: 400 }
            )
        }

        // Добавляем проверку на null
        if (paymentMethod === 'cash' && (receivedAmount === null || !Number.isFinite(receivedAmount) || receivedAmount < total)) {
            return NextResponse.json(
                { message: 'Полученная сумма меньше суммы чека' },
                { status: 400 }
            )
        }

        await client.query('BEGIN')

        for (const item of items) {
            const productId = Number(item.productId)
            const quantity = Number(item.quantity)

            if (!Number.isFinite(productId) || !Number.isFinite(quantity) || quantity <= 0) {
                throw new Error(`Некорректная позиция чека: ${item.name}`)
            }

            const productResult = await client.query(
                `
                SELECT id, name, stock
                FROM products
                WHERE id = $1
                FOR UPDATE
                `,
                [productId]
            )

            if (productResult.rows.length === 0) {
                throw new Error(`Товар «${item.name}» не найден в БД`)
            }

            const product = productResult.rows[0]
            const currentStock = Number(product.stock)

            if (currentStock < quantity) {
                throw new Error(
                    `Недостаточно остатка: «${product.name}». В наличии ${currentStock}, в чеке ${quantity}`
                )
            }

            await client.query(
                `
                UPDATE products
                SET stock = stock - $1
                WHERE id = $2
                `,
                [quantity, productId]
            )
        }

        const receiptNumber = createReceiptNumber()
        const paymentLabel = paymentMethod === 'card' ? 'Карта' : 'Наличные'

        const receiptResult = await client.query(
            `
            INSERT INTO receipts (
                receipt_number,
                payment_method,
                payment_label,
                total,
                received_amount,
                change_amount,
                items
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING
                id,
                receipt_number AS "receiptNumber",
                created_at AS "createdAt",
                payment_method AS "paymentMethod",
                payment_label AS "paymentLabel",
                total::float AS total,
                received_amount::float AS "receivedAmount",
                change_amount::float AS change,
                items
            `,
            [
                receiptNumber,
                paymentMethod,
                paymentLabel,
                total,
                // Здесь тоже проверяем на null
                paymentMethod === 'cash' && receivedAmount !== null ? receivedAmount : total,
                paymentMethod === 'cash' && change !== null ? change : 0,
                JSON.stringify(items),
            ]
        )

        await client.query('COMMIT')

        return NextResponse.json(receiptResult.rows[0], { status: 201 })
    } catch (error) {
        await client.query('ROLLBACK')

        console.error(error)

        return NextResponse.json(
            {
                message: error instanceof Error
                    ? error.message
                    : 'Ошибка создания чека',
            },
            { status: 500 }
        )
    } finally {
        client.release()
    }
}
import { NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'

export const runtime = 'nodejs'

// Обновляем тип - params теперь Promise
type RouteContext = {
    params: Promise<{ id: string }>
}

export async function GET(_request: Request, { params }: RouteContext) {
    try {
        // Дожидаемся params перед использованием
        const { id } = await params

        const result = await pool.query(
            `
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
            WHERE id = $1
            `,
            [id]
        )

        if (result.rows.length === 0) {
            return NextResponse.json(
                { message: 'Чек не найден' },
                { status: 404 }
            )
        }

        return NextResponse.json(result.rows[0])
    } catch (error) {
        console.error(error)

        return NextResponse.json(
            { message: 'Ошибка получения чека' },
            { status: 500 }
        )
    }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
    try {
        // Дожидаемся params перед использованием
        const { id } = await params

        const result = await pool.query(
            `
            DELETE FROM receipts
            WHERE id = $1
            RETURNING id
            `,
            [id]
        )

        if (result.rows.length === 0) {
            return NextResponse.json(
                { message: 'Чек не найден' },
                { status: 404 }
            )
        }

        return NextResponse.json({ message: 'Чек удалён' })
    } catch (error) {
        console.error(error)

        return NextResponse.json(
            { message: 'Ошибка удаления чека' },
            { status: 500 }
        )
    }
}
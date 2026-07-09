import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'
import { requireWarehouseSection } from '@/app/lib/serverWarehouseAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
    params: Promise<{ id: string }> | { id: string }
}

async function getReceiptId(context: RouteContext): Promise<string> {
    const params = await context.params

    return params.id
}

export async function GET(request: NextRequest, context: RouteContext) {
    try {
        const id = await getReceiptId(context)
        const access = await requireWarehouseSection(pool, request, 'sales')

        if (!access.ok) {
            return access.response
        }

        const { location } = access.context

        const result = await pool.query(
            `
            SELECT
                r.id,
                r.receipt_number AS "receiptNumber",
                r.created_at AS "createdAt",
                r.payment_method AS "paymentMethod",
                r.payment_label AS "paymentLabel",
                r.total::float AS total,
                r.received_amount::float AS "receivedAmount",
                r.change_amount::float AS change,
                r.items,
                COALESCE(r.cashier_name, '') AS "cashierName",
                COALESCE(r.cashier_login, '') AS "cashierLogin",
                l.name AS "locationName",
                l.slug AS "locationSlug"
            FROM receipts r
            JOIN locations l ON l.id = r.location_id
            WHERE r.id = $1
              AND r.location_id = $2
            `,
            [id, location.id]
        )

        if (result.rows.length === 0) {
            return NextResponse.json(
                { message: 'Чек не найден в текущей зоне' },
                { status: 404 }
            )
        }

        return NextResponse.json(result.rows[0])
    } catch (error) {
        console.error('GET /api/sales/[id] error:', error)

        return NextResponse.json(
            { message: 'Ошибка получения чека' },
            { status: 500 }
        )
    }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
    try {
        const id = await getReceiptId(context)
        const access = await requireWarehouseSection(pool, request, 'sales')

        if (!access.ok) {
            return access.response
        }

        const { location } = access.context

        const result = await pool.query(
            `
            DELETE FROM receipts
            WHERE id = $1
              AND location_id = $2
            RETURNING id
            `,
            [id, location.id]
        )

        if (result.rows.length === 0) {
            return NextResponse.json(
                { message: 'Чек не найден в текущей зоне' },
                { status: 404 }
            )
        }

        return NextResponse.json({ message: 'Чек удалён' })
    } catch (error) {
        console.error('DELETE /api/sales/[id] error:', error)

        return NextResponse.json(
            { message: 'Ошибка удаления чека' },
            { status: 500 }
        )
    }
}

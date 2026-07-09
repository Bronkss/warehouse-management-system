import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'
import { resolveWarehouseContext } from '@/app/lib/serverWarehouseLocation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function forbiddenDeliveriesResponse() {
    return NextResponse.json(
        { message: 'Раздел «Доставки» доступен только в зоне ТОЧКА' },
        { status: 403 },
    )
}

export async function GET(request: NextRequest) {
    try {
        const { location } = await resolveWarehouseContext(pool, request)

        if (location.slug !== 'tochka') {
            return forbiddenDeliveriesResponse()
        }

        const result = await pool.query(
            `
            SELECT
                id::text,
                order_number AS "orderNumber",
                customer_name AS "customerName",
                customer_phone AS "customerPhone",
                address,
                total::float AS total,
                created_at AS "createdAt"
            FROM orders
            WHERE status = 'new'
            ORDER BY created_at ASC, id ASC
            LIMIT 20
            `,
        )

        return NextResponse.json({
            count: result.rows.length,
            orders: result.rows,
        })
    } catch (error) {
        console.error('GET /api/deliveries/notifications error:', error)

        return NextResponse.json(
            { message: 'Не удалось проверить новые доставки' },
            { status: 500 },
        )
    }
}

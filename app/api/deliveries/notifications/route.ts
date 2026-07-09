import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'
import { requireWarehouseSection } from '@/app/lib/serverWarehouseAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'


export async function GET(request: NextRequest) {
    try {
        const access = await requireWarehouseSection(pool, request, 'deliveries')

        if (!access.ok) {
            return access.response
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

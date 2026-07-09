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

function assertTochkaLocation(locationSlug: string) {
    if (locationSlug !== 'tochka') {
        throw new Error('DELIVERIES_FORBIDDEN')
    }
}

export async function GET(request: NextRequest) {
    try {
        const { location } = await resolveWarehouseContext(pool, request)
        assertTochkaLocation(location.slug)

        const { searchParams } = new URL(request.url)

        const search = searchParams.get('search')?.trim() || ''
        const scope = searchParams.get('scope') || 'all'

        const params: unknown[] = []
        const where: string[] = []

        if (scope === 'current') {
            where.push(`o.status IN ('new', 'accepted', 'assembling', 'delivering')`)
        }

        if (scope === 'history') {
            where.push(`o.status IN ('completed', 'cancelled')`)
        }

        if (search) {
            params.push(`%${search}%`)

            where.push(`
                (
                    o.order_number ILIKE $${params.length}
                    OR o.customer_name ILIKE $${params.length}
                    OR o.customer_phone ILIKE $${params.length}
                    OR o.address ILIKE $${params.length}
                    OR COALESCE(o.courier_name, '') ILIKE $${params.length}
                )
            `)
        }

        const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

        const result = await pool.query(
            `
            WITH items AS (
                SELECT
                    oi.order_id,
                    COALESCE(
                        jsonb_agg(
                            jsonb_build_object(
                                'id', oi.id::text,
                                'productId', oi.product_id,
                                'title', oi.title,
                                'quantity', oi.quantity,
                                'price', oi.price,
                                'total', oi.quantity * oi.price,
                                'createdAt', oi.created_at
                            )
                            ORDER BY oi.id ASC
                        ),
                        '[]'::jsonb
                    ) AS items
                FROM order_items oi
                GROUP BY oi.order_id
            ),
            status_history AS (
                SELECT
                    h.order_id,
                    COALESCE(
                        jsonb_agg(
                            jsonb_build_object(
                                'id', h.id::text,
                                'oldStatus', h.old_status,
                                'newStatus', h.new_status,
                                'changedByTelegramId', h.changed_by_telegram_id,
                                'changedByName', h.changed_by_name,
                                'createdAt', h.created_at
                            )
                            ORDER BY h.created_at ASC, h.id ASC
                        ),
                        '[]'::jsonb
                    ) AS history
                FROM order_status_history h
                GROUP BY h.order_id
            )
            SELECT
                o.id::text,
                o.order_number AS "orderNumber",
                o.status,
                o.address,
                o.customer_name AS "customerName",
                o.customer_phone AS "customerPhone",
                o.apartment,
                o.payment_method AS "paymentMethod",
                o.comments,
                o.total::float AS total,
                o.telegram_status AS "telegramStatus",
                o.telegram_chat_id AS "telegramChatId",
                o.telegram_message_id AS "telegramMessageId",
                o.telegram_sent_at AS "telegramSentAt",
                o.courier_telegram_id AS "courierTelegramId",
                o.courier_name AS "courierName",
                o.created_at AS "createdAt",
                o.updated_at AS "updatedAt",
                COALESCE(items.items, '[]'::jsonb) AS items,
                COALESCE(status_history.history, '[]'::jsonb) AS history
            FROM orders o
            LEFT JOIN items ON items.order_id = o.id
            LEFT JOIN status_history ON status_history.order_id = o.id
            ${whereSql}
            ORDER BY
                CASE
                    WHEN o.status = 'new' THEN 0
                    WHEN o.status IN ('accepted', 'assembling', 'delivering') THEN 1
                    ELSE 2
                END ASC,
                o.created_at DESC
            `,
            params,
        )

        return NextResponse.json(result.rows)
    } catch (error) {
        if (error instanceof Error && error.message === 'DELIVERIES_FORBIDDEN') {
            return forbiddenDeliveriesResponse()
        }

        console.error(error)

        return NextResponse.json(
            { message: 'Ошибка получения доставок' },
            { status: 500 },
        )
    }
}

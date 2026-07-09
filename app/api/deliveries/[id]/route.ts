import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'
import { resolveWarehouseContext } from '@/app/lib/serverWarehouseLocation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
    params: Promise<{ id: string }> | { id: string }
}

type OrderStatus =
    | 'new'
    | 'accepted'
    | 'assembling'
    | 'delivering'
    | 'completed'
    | 'cancelled'

const ORDER_STATUSES: OrderStatus[] = [
    'new',
    'accepted',
    'assembling',
    'delivering',
    'completed',
    'cancelled',
]

async function getRouteParams(context: RouteContext) {
    return await context.params
}

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

async function getDeliveryById(id: string) {
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
        WHERE o.id = $1
        LIMIT 1
        `,
        [id],
    )

    return result.rows[0] || null
}

export async function GET(request: NextRequest, context: RouteContext) {
    try {
        const { location } = await resolveWarehouseContext(pool, request)
        assertTochkaLocation(location.slug)

        const { id } = await getRouteParams(context)
        const delivery = await getDeliveryById(id)

        if (!delivery) {
            return NextResponse.json(
                { message: 'Доставка не найдена' },
                { status: 404 },
            )
        }

        return NextResponse.json(delivery)
    } catch (error) {
        if (error instanceof Error && error.message === 'DELIVERIES_FORBIDDEN') {
            return forbiddenDeliveriesResponse()
        }

        console.error(error)

        return NextResponse.json(
            { message: 'Ошибка получения доставки' },
            { status: 500 },
        )
    }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
    const client = await pool.connect()

    try {
        const { location, user } = await resolveWarehouseContext(pool, request)
        assertTochkaLocation(location.slug)

        const { id } = await getRouteParams(context)
        const body = await request.json()

        const status = String(body.status || '').trim() as OrderStatus
        const changedByName = user.name || user.login || 'Сотрудник ТОЧКИ'

        if (!ORDER_STATUSES.includes(status)) {
            return NextResponse.json(
                { message: 'Некорректный статус доставки' },
                { status: 400 },
            )
        }

        await client.query('BEGIN')

        const currentResult = await client.query(
            `
            SELECT id, status
            FROM orders
            WHERE id = $1
            FOR UPDATE
            `,
            [id],
        )

        if (currentResult.rows.length === 0) {
            await client.query('ROLLBACK')

            return NextResponse.json(
                { message: 'Доставка не найдена' },
                { status: 404 },
            )
        }

        const oldStatus = currentResult.rows[0].status as OrderStatus

        if (oldStatus !== status) {
            await client.query(
                `
                UPDATE orders
                SET
                    status = $2,
                    updated_at = NOW()
                WHERE id = $1
                `,
                [id, status],
            )

            await client.query(
                `
                INSERT INTO order_status_history (
                    order_id,
                    old_status,
                    new_status,
                    changed_by_name
                )
                VALUES ($1, $2, $3, $4)
                `,
                [id, oldStatus, status, changedByName],
            )
        }

        await client.query('COMMIT')

        const updatedDelivery = await getDeliveryById(id)

        return NextResponse.json(updatedDelivery)
    } catch (error) {
        await client.query('ROLLBACK')

        if (error instanceof Error && error.message === 'DELIVERIES_FORBIDDEN') {
            return forbiddenDeliveriesResponse()
        }

        console.error(error)

        return NextResponse.json(
            {
                message:
                    error instanceof Error
                        ? error.message
                        : 'Ошибка обновления доставки',
            },
            { status: 500 },
        )
    } finally {
        client.release()
    }
}

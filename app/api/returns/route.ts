import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LOCATION_HEADER = 'x-warehouse-location'
const USER_LOGIN_HEADER = 'x-warehouse-user-login'

type ProductUnit = 'piece' | 'weight'

type ReturnItem = {
    productId: number | string
    quantity: number | string
}

type ReturnBody = {
    items?: ReturnItem[]
    comment?: string
}

function toNumber(value: unknown): number {
    const parsed = Number(
        String(value ?? '0')
            .replace(',', '.')
            .replace(/\s/g, '')
    )

    return Number.isFinite(parsed) ? parsed : 0
}

function roundQuantity(value: number): number {
    return Math.round(value * 1000) / 1000
}

export async function POST(request: NextRequest) {
    const client = await pool.connect()

    try {
        const locationSlug = String(
            request.headers.get(LOCATION_HEADER) || ''
        ).trim()

        const userLogin = String(
            request.headers.get(USER_LOGIN_HEADER) || ''
        ).trim()

        if (!locationSlug) {
            return NextResponse.json(
                {
                    message: 'Не определена текущая зона',
                },
                {
                    status: 400,
                }
            )
        }

        const body = (await request.json()) as ReturnBody

        const items = Array.isArray(body.items)
            ? body.items
            : []

        const comment = String(
            body.comment || ''
        ).trim()

        if (items.length === 0) {
            return NextResponse.json(
                {
                    message: 'Добавьте хотя бы один товар для возврата',
                },
                {
                    status: 400,
                }
            )
        }

        await client.query('BEGIN')

        const locationResult = await client.query(
            `
                SELECT
                    id,
                    name,
                    slug,
                    type,
                    is_active
                FROM locations
                WHERE slug = $1
                LIMIT 1
                FOR UPDATE
            `,
            [locationSlug]
        )

        const location = locationResult.rows[0]

        if (!location) {
            throw new Error(
                `Зона «${locationSlug}» не найдена`
            )
        }

        if (!location.is_active) {
            throw new Error(
                `Зона «${location.name}» отключена`
            )
        }

        const locationId = Number(location.id)

        const resultItems: Array<{
            productId: number
            name: string
            unit: ProductUnit
            quantity: number
            previousStock: number
            newStock: number
        }> = []

        for (
            let index = 0;
            index < items.length;
            index += 1
        ) {
            const item = items[index]

            const productId =
                Number(item.productId)

            if (
                !Number.isInteger(productId) ||
                productId <= 0
            ) {
                throw new Error(
                    `Строка ${index + 1}: некорректный товар`
                )
            }

            const productResult =
                await client.query(
                    `
                        SELECT
                            id,
                            name,
                            unit
                        FROM products
                        WHERE id = $1
                        FOR UPDATE
                    `,
                    [productId]
                )

            const product =
                productResult.rows[0]

            if (!product) {
                throw new Error(
                    `Строка ${index + 1}: товар не найден`
                )
            }

            const unit: ProductUnit =
                product.unit === 'weight'
                    ? 'weight'
                    : 'piece'

            let quantity =
                toNumber(item.quantity)

            if (unit === 'weight') {
                quantity =
                    roundQuantity(quantity)
            } else {
                quantity =
                    Math.floor(quantity)
            }

            if (
                !Number.isFinite(quantity) ||
                quantity <= 0
            ) {
                throw new Error(
                    `Строка ${index + 1}: количество должно быть больше 0`
                )
            }

            if (
                unit === 'piece' &&
                !Number.isInteger(quantity)
            ) {
                throw new Error(
                    `Строка ${index + 1}: для штучного товара количество должно быть целым`
                )
            }

            /*
             * Сначала гарантируем наличие строки
             * product_stocks для текущей зоны.
             */
            await client.query(
                `
                    INSERT INTO product_stocks (
                        product_id,
                        location_id,
                        stock,
                        updated_at
                    )
                    VALUES ($1, $2, 0, NOW())
                    ON CONFLICT (
                        product_id,
                        location_id
                    )
                    DO NOTHING
                `,
                [
                    productId,
                    locationId,
                ]
            )

            /*
             * Блокируем текущий остаток.
             */
            const stockResult =
                await client.query(
                    `
                        SELECT stock
                        FROM product_stocks
                        WHERE
                            product_id = $1
                            AND location_id = $2
                        FOR UPDATE
                    `,
                    [
                        productId,
                        locationId,
                    ]
                )

            const previousStock =
                roundQuantity(
                    toNumber(
                        stockResult.rows[0]?.stock
                    )
                )

            const newStock =
                roundQuantity(
                    previousStock +
                    quantity
                )

            /*
             * Возвращаем товар именно
             * в текущую зону.
             */
            await client.query(
                `
                    UPDATE product_stocks
                    SET
                        stock = $1,
                        updated_at = NOW()
                    WHERE
                        product_id = $2
                        AND location_id = $3
                `,
                [
                    newStock,
                    productId,
                    locationId,
                ]
            )

            /*
             * У нас исторически products.stock
             * используется как остаток ТОЧКИ.
             * Сохраняем совместимость.
             */
            if (locationSlug === 'tochka') {
                await client.query(
                    `
                        UPDATE products
                        SET
                            stock = $1,
                            updated_at = NOW()
                        WHERE id = $2
                    `,
                    [
                        newStock,
                        productId,
                    ]
                )
            }

            /*
             * Записываем движение.
             * quantity_delta положительный,
             * поскольку товар возвращается
             * на остаток.
             */
            await client.query(
                `
                    INSERT INTO stock_movements (
                        product_id,
                        location_id,
                        movement_type,
                        quantity_delta,
                        stock_after,
                        document_type,
                        document_id,
                        comment,
                        created_by,
                        created_at
                    )
                    VALUES (
                        $1,
                        $2,
                        'return',
                        $3,
                        $4,
                        'pos_return',
                        NULL,
                        $5,
                        $6,
                        NOW()
                    )
                `,
                [
                    productId,
                    locationId,
                    quantity,
                    newStock,
                    comment ||
                    'Возврат товара через кассу',
                    userLogin || null,
                ]
            )

            resultItems.push({
                productId,
                name: String(
                    product.name || ''
                ),
                unit,
                quantity,
                previousStock,
                newStock,
            })
        }

        await client.query('COMMIT')

        return NextResponse.json({
            ok: true,

            message:
                'Возврат успешно проведён',

            location: {
                id: locationId,
                slug: location.slug,
                name: location.name,
            },

            items: resultItems,

            totalItems:
            resultItems.length,

            totalQuantity:
                resultItems.reduce(
                    (sum, item) =>
                        sum +
                        item.quantity,
                    0
                ),
        })
    } catch (error) {
        await client
            .query('ROLLBACK')
            .catch(() => undefined)

        console.error(
            'POST /api/returns error:',
            error
        )

        return NextResponse.json(
            {
                message:
                    error instanceof Error
                        ? error.message
                        : 'Не удалось провести возврат',
            },
            {
                status: 500,
            }
        )
    } finally {
        client.release()
    }
}
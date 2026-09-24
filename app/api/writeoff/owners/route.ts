import {
    NextRequest,
    NextResponse,
} from 'next/server'

import type {
    PoolClient,
} from 'pg'

import { pool } from '@/app/lib/db'
import type { WarehouseLocation } from '@/app/lib/serverWarehouseLocation'
import { requireWarehouseSection } from '@/app/lib/serverWarehouseAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type WriteoffItemInput = {
    productId: number | string
    quantity: number
}

type WrittenOffItem = {
    productId: number
    name: string
    unit: string
    quantity: number
    stockAfter: number
}

const OWNER_REPRESENTATIVES = new Set([
    'Якимов Александр',
    'Леньшина Ольга',
    'Якимова-Леньшина Лада',
    'Леньшин Илья',
])

const roundStock = (
    value: number
): number => {
    return Math.round(
        (
            value +
            Number.EPSILON
        ) * 1000
    ) / 1000
}

async function ensureProductStockRow(
    client: PoolClient,
    productId: number,
    locationId: number
) {
    await client.query(
        `
            INSERT INTO product_stocks (
                product_id,
                location_id,
                stock
            )
            SELECT
                $1,
                $2,
                0
            WHERE EXISTS (
                SELECT 1
                FROM products
                WHERE id = $1
            )
            ON CONFLICT (
                product_id,
                location_id
            ) DO NOTHING
        `,
        [
            productId,
            locationId,
        ]
    )
}

async function syncLegacyTochkaStock(
    client: PoolClient,
    location: WarehouseLocation,
    productId: number,
    stock: number
) {
    if (
        location.slug !==
        'tochka'
    ) {
        return
    }

    await client.query(
        `
            UPDATE products
            SET
                stock = $1,
                updated_at = NOW()
            WHERE id = $2
        `,
        [
            stock,
            productId,
        ]
    )
}

export async function POST(
    request: NextRequest
) {
    const client =
        await pool.connect()

    try {
        const body =
            await request.json() as
                Record<string, unknown>

        const representative =
            String(
                body.representative ||
                ''
            ).trim()

        const items =
            (
                Array.isArray(
                    body.items
                )
                    ? body.items
                    : []
            ) as WriteoffItemInput[]

        if (
            !OWNER_REPRESENTATIVES.has(
                representative
            )
        ) {
            return NextResponse.json(
                {
                    message:
                        'Выберите представителя из списка',
                },
                {
                    status: 400,
                }
            )
        }

        if (
            items.length ===
            0
        ) {
            return NextResponse.json(
                {
                    message:
                        'Список товаров пуст',
                },
                {
                    status: 400,
                }
            )
        }

        await client.query(
            'BEGIN'
        )

        const access =
            await requireWarehouseSection(
                client,
                request,
                'writeoff'
            )

        if (!access.ok) {
            await client.query(
                'ROLLBACK'
            )

            return access.response
        }

        const {
            location,
            user,
        } =
            access.context

        const writtenOffItems:
            WrittenOffItem[] = []

        for (
            const item
            of items
            ) {
            const productId =
                Number(
                    item.productId
                )

            const quantity =
                roundStock(
                    Number(
                        item.quantity
                    )
                )

            if (
                !Number.isInteger(
                    productId
                ) ||
                productId <= 0 ||
                !Number.isFinite(
                    quantity
                ) ||
                quantity <= 0
            ) {
                throw new Error(
                    'Некорректная позиция списания'
                )
            }

            await ensureProductStockRow(
                client,
                productId,
                location.id
            )

            const productResult =
                await client.query(
                    `
                        SELECT
                            p.id,
                            p.name,
                            p.unit,
                            ps.stock::float
                                AS stock
                        FROM products p
                        JOIN product_stocks ps
                            ON ps.product_id = p.id
                            AND ps.location_id = $2
                        WHERE p.id = $1
                        FOR UPDATE OF ps
                    `,
                    [
                        productId,
                        location.id,
                    ]
                )

            if (
                productResult.rows.length ===
                0
            ) {
                throw new Error(
                    `Товар с ID ${productId} не найден`
                )
            }

            const product =
                productResult.rows[0]

            const currentStock =
                roundStock(
                    Number(
                        product.stock
                    )
                )

            if (
                currentStock +
                0.0005 <
                quantity
            ) {
                throw new Error(
                    `Недостаточно остатка в зоне «${location.name}»: «${product.name}». В наличии ${currentStock}, нужно ${quantity}`
                )
            }

            const nextStock =
                roundStock(
                    currentStock -
                    quantity
                )

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
                    nextStock,
                    productId,
                    location.id,
                ]
            )

            await syncLegacyTochkaStock(
                client,
                location,
                productId,
                nextStock
            )

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
                        'writeoff',
                        $3,
                        $4,
                        'writeoff',
                        NULL,
                        $5,
                        $6,
                        NOW()
                    )
                `,
                [
                    productId,
                    location.id,
                    -quantity,
                    nextStock,
                    `Для своих · ${representative}`,
                    user.login,
                ]
            )

            writtenOffItems.push(
                {
                    productId,
                    name:
                        String(
                            product.name ||
                            ''
                        ),
                    unit:
                        String(
                            product.unit ||
                            'piece'
                        ),
                    quantity,
                    stockAfter:
                    nextStock,
                }
            )
        }

        await client.query(
            'COMMIT'
        )

        return NextResponse.json(
            {
                ok: true,
                reason:
                    'Для своих',
                representative,
                location: {
                    id:
                    location.id,
                    name:
                    location.name,
                    slug:
                    location.slug,
                },
                items:
                writtenOffItems,
            },
            {
                status: 201,
            }
        )
    } catch (error) {
        await client
            .query(
                'ROLLBACK'
            )
            .catch(
                () => undefined
            )

        console.error(
            'POST /api/writeoff/owners error:',
            error
        )

        return NextResponse.json(
            {
                message:
                    error instanceof Error
                        ? error.message
                        : 'Ошибка внутреннего списания',
            },
            {
                status: 400,
            }
        )
    } finally {
        client.release()
    }
}

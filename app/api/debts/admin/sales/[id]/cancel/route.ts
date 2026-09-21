import {
    NextRequest,
    NextResponse,
} from 'next/server'

import { pool } from '@/app/lib/db'
import {
    ensureProductStockRow,
    getCustomerDebt,
    insertDebtEvent,
    roundMoney,
    roundQuantity,
    syncLegacyTochkaStock,
    toNumber,
} from '@/app/lib/debts'
import { requireWarehouseSection } from '@/app/lib/serverWarehouseAccess'
import type { WarehouseLocation } from '@/app/lib/serverWarehouseLocation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
    params:
        | Promise<{
        id: string
    }>
        | {
        id: string
    }
}

function parseId(
    value: string
): number {
    const id =
        Number(value)

    if (
        !Number.isInteger(id) ||
        id <= 0
    ) {
        throw new Error(
            'Некорректный долговой документ'
        )
    }

    return id
}

export async function POST(
    request: NextRequest,
    context: RouteContext
) {
    const client =
        await pool.connect()

    try {
        const access =
            await requireWarehouseSection(
                client,
                request,
                'debts'
            )

        if (!access.ok) {
            return access.response
        }

        const {
            user,
        } = access.context

        const params =
            await context.params

        const debtSaleId =
            parseId(
                params.id
            )

        const body =
            await request.json()

        const reason =
            String(
                body.reason || ''
            ).trim()

        if (
            reason.length < 3
        ) {
            return NextResponse.json(
                {
                    message:
                        'Укажите причину отмены документа',
                },
                {
                    status: 400,
                }
            )
        }

        await client.query(
            'BEGIN'
        )

        const saleResult =
            await client.query(
                `
                    SELECT
                        ds.id,
                        ds.debt_number,
                        ds.customer_id,
                        ds.location_id,
                        ds.status,

                        ds.total::float
                            AS total,

                        ds.returned_total::float
                            AS returned_total,

                        ds.paid_total::float
                            AS paid_total,

                        ds.refunded_total::float
                            AS refunded_total,

                        l.name
                            AS location_name,

                        l.slug
                            AS location_slug,

                        l.type
                            AS location_type,

                        l.is_active
                            AS location_is_active,

                        dc.first_name,
                        dc.last_name

                    FROM debt_sales ds

                    JOIN locations l
                        ON l.id =
                            ds.location_id

                    JOIN debt_customers dc
                        ON dc.id =
                            ds.customer_id

                    WHERE
                        ds.id = $1

                    FOR UPDATE OF ds, l, dc
                `,
                [
                    debtSaleId,
                ]
            )

        if (
            saleResult.rows.length === 0
        ) {
            throw new Error(
                'Долговой документ не найден'
            )
        }

        const sale =
            saleResult.rows[0]

        if (
            sale.status ===
            'cancelled'
        ) {
            throw new Error(
                'Документ уже отменён'
            )
        }

        const returnedTotal =
            roundMoney(
                toNumber(
                    sale.returned_total
                )
            )

        const paidTotal =
            roundMoney(
                toNumber(
                    sale.paid_total
                )
            )

        const refundedTotal =
            roundMoney(
                toNumber(
                    sale.refunded_total
                )
            )

        if (
            returnedTotal > 0.009 ||
            paidTotal > 0.009 ||
            refundedTotal > 0.009
        ) {
            throw new Error(
                'Нельзя сторнировать документ, по которому уже были оплаты, возвраты товара или денежные возвраты. Используйте обычные операции возврата.'
            )
        }

        const itemsResult =
            await client.query(
                `
                    SELECT
                        id,
                        product_id,
                        product_name,
                        unit,
                        quantity::float
                            AS quantity

                    FROM debt_sale_items

                    WHERE
                        debt_sale_id = $1

                    ORDER BY id ASC

                    FOR UPDATE
                `,
                [
                    debtSaleId,
                ]
            )

        if (
            itemsResult.rows.length === 0
        ) {
            throw new Error(
                'У долгового документа отсутствуют товарные позиции'
            )
        }

        const saleLocation:
            WarehouseLocation = {
            id:
                Number(
                    sale.location_id
                ),

            name:
                String(
                    sale.location_name
                ),

            slug:
                String(
                    sale.location_slug
                ),

            type:
                sale.location_type ===
                'warehouse'
                    ? 'warehouse'
                    : 'store',
        }

        const restoredItems:
            Array<Record<string, unknown>> =
            []

        for (
            const item
            of itemsResult.rows
            ) {
            const productId =
                Number(
                    item.product_id
                )

            const unit =
                item.unit === 'weight'
                    ? 'weight'
                    : 'piece'

            const quantity =
                unit === 'weight'
                    ? roundQuantity(
                        toNumber(
                            item.quantity
                        )
                    )
                    : Math.floor(
                        toNumber(
                            item.quantity
                        )
                    )

            await ensureProductStockRow(
                client,
                productId,
                saleLocation.id
            )

            const stockResult =
                await client.query(
                    `
                        SELECT
                            stock::float
                                AS stock
                        FROM product_stocks
                        WHERE
                            product_id = $1
                            AND location_id = $2
                        FOR UPDATE
                    `,
                    [
                        productId,
                        saleLocation.id,
                    ]
                )

            const previousStock =
                roundQuantity(
                    toNumber(
                        stockResult.rows[0]
                            ?.stock
                    )
                )

            const newStock =
                roundQuantity(
                    previousStock
                    + quantity
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
                    newStock,
                    productId,
                    saleLocation.id,
                ]
            )

            await syncLegacyTochkaStock(
                client,
                saleLocation,
                productId,
                newStock
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
                        created_by
                    )
                    VALUES (
                        $1,
                        $2,
                        'return',
                        $3,
                        $4,
                        'debt_sale_cancel',
                        $5,
                        $6,
                        $7
                    )
                `,
                [
                    productId,
                    saleLocation.id,
                    quantity,
                    newStock,
                    debtSaleId,
                    `Сторно долгового документа ${sale.debt_number}: ${reason}`,
                    user.login,
                ]
            )

            restoredItems.push(
                {
                    productId,
                    name:
                        String(
                            item.product_name
                        ),
                    unit,
                    quantity,
                    previousStock,
                    newStock,
                }
            )
        }

        await client.query(
            `
                UPDATE debt_sales
                SET
                    status = 'cancelled',
                    cancelled_at = NOW(),
                    cancelled_by = $2,
                    cancellation_reason = $3,
                    updated_at = NOW()
                WHERE id = $1
            `,
            [
                debtSaleId,
                user.login,
                reason,
            ]
        )

        const customerId =
            Number(
                sale.customer_id
            )

        await insertDebtEvent(
            client,
            {
                customerId,
                eventType:
                    'debt_sale_cancelled',
                debtSaleId,
                locationId:
                saleLocation.id,
                amount:
                    -roundMoney(
                        toNumber(
                            sale.total
                        )
                    ),
                payload: {
                    debtNumber:
                        String(
                            sale.debt_number
                        ),
                    reason,
                    restoredItems,
                },
                createdBy:
                user.login,
                createdByName:
                user.name,
            }
        )

        const currentDebt =
            await getCustomerDebt(
                client,
                customerId
            )

        await client.query(
            'COMMIT'
        )

        return NextResponse.json(
            {
                ok: true,
                debtSale: {
                    id:
                    debtSaleId,
                    debtNumber:
                        String(
                            sale.debt_number
                        ),
                    status:
                        'cancelled',
                    reason,
                },
                restoredToLocation: {
                    id:
                    saleLocation.id,
                    name:
                    saleLocation.name,
                    slug:
                    saleLocation.slug,
                },
                restoredItems,
                customer: {
                    id:
                    customerId,
                    currentDebt,
                },
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
            'POST /api/debts/admin/sales/[id]/cancel error:',
            error
        )

        return NextResponse.json(
            {
                message:
                    error instanceof Error
                        ? error.message
                        : 'Не удалось отменить долговой документ',
            },
            {
                status: 500,
            }
        )
    } finally {
        client.release()
    }
}

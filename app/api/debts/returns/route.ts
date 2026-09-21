import {
    NextRequest,
    NextResponse,
} from 'next/server'

import { pool } from '@/app/lib/db'
import {
    type DebtPaymentMethod,
    ensureProductStockRow,
    getCustomerDebt,
    getDebtStatus,
    insertDebtEvent,
    nextDebtRefundNumber,
    nextDebtReturnNumber,
    roundMoney,
    roundQuantity,
    syncLegacyTochkaStock,
    toNumber,
} from '@/app/lib/debts'
import { requireWarehouseSection } from '@/app/lib/serverWarehouseAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type DebtReturnItemInput = {
    debtSaleItemId:
        | number
        | string

    quantity:
        | number
        | string
}

type DebtReturnBody = {
    debtSaleId?:
        | number
        | string

    items?:
        DebtReturnItemInput[]

    comment?: string

    refundMethod?:
        DebtPaymentMethod
}

type AggregatedReturnItem = {
    debtSaleItemId: number
    quantity: number
}

type LockedSaleItem = {
    id: number

    productId: number
    productName: string
    unit:
        | 'piece'
        | 'weight'

    quantity: number
    returnedQuantity: number

    sellingPrice: number

    returnQuantity: number
    returnTotal: number
}

const REFUND_METHODS =
    new Set<DebtPaymentMethod>(
        [
            'cash',
            'card',
            'transfer',
        ]
    )

function aggregateReturnItems(
    rawItems: unknown
): AggregatedReturnItem[] {
    if (
        !Array.isArray(
            rawItems
        ) ||
        rawItems.length === 0
    ) {
        throw new Error(
            'Добавьте товар для возврата'
        )
    }

    const map =
        new Map<
            number,
            number
        >()

    for (
        let index = 0;
        index < rawItems.length;
        index += 1
    ) {
        const raw =
            rawItems[index] as DebtReturnItemInput

        const debtSaleItemId =
            Number(
                raw.debtSaleItemId
            )

        const quantity =
            roundQuantity(
                toNumber(
                    raw.quantity,
                    NaN
                )
            )

        if (
            !Number.isInteger(
                debtSaleItemId
            ) ||
            debtSaleItemId <= 0
        ) {
            throw new Error(
                `Строка ${index + 1}: некорректная позиция долгового документа`
            )
        }

        if (
            !Number.isFinite(
                quantity
            ) ||
            quantity <= 0
        ) {
            throw new Error(
                `Строка ${index + 1}: некорректное количество возврата`
            )
        }

        map.set(
            debtSaleItemId,

            roundQuantity(
                (
                    map.get(
                        debtSaleItemId
                    ) || 0
                ) + quantity
            )
        )
    }

    return Array.from(
        map.entries()
    ).map(
        (
            [
                debtSaleItemId,
                quantity,
            ]
        ) => ({
            debtSaleItemId,
            quantity,
        })
    )
}

export async function POST(
    request: NextRequest
) {
    const client =
        await pool.connect()

    try {
        const access =
            await requireWarehouseSection(
                client,
                request,
                'sales'
            )

        if (!access.ok) {
            return access.response
        }

        const {
            location,
            user,
        } = access.context

        const body =
            (
                await request.json()
            ) as DebtReturnBody

        const debtSaleId =
            Number(
                body.debtSaleId
            )

        if (
            !Number.isInteger(
                debtSaleId
            ) ||
            debtSaleId <= 0
        ) {
            return NextResponse.json(
                {
                    message:
                        'Некорректный долговой документ',
                },
                {
                    status: 400,
                }
            )
        }

        const requestedItems =
            aggregateReturnItems(
                body.items
            )

        const comment =
            String(
                body.comment || ''
            ).trim()

        const refundMethod =
            body.refundMethod

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

                        ds.status,

                        ds.total::float
                            AS total,

                        ds.returned_total::float
                            AS returned_total,

                        ds.paid_total::float
                            AS paid_total,

                        ds.refunded_total::float
                            AS refunded_total,

                        dc.first_name,
                        dc.last_name,
                        dc.middle_name,

                        dc.phone,
                        dc.address,

                        dc.credit_limit::float
                            AS credit_limit

                    FROM debt_sales ds

                    JOIN debt_customers dc
                        ON dc.id =
                            ds.customer_id

                    WHERE
                        ds.id = $1

                    FOR UPDATE OF ds, dc
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
            sale.status === 'cancelled'
        ) {
            throw new Error(
                'Отменённый долговой документ нельзя возвращать'
            )
        }

        const customerId =
            Number(
                sale.customer_id
            )

        const previousDebt =
            await getCustomerDebt(
                client,
                customerId
            )

        const saleTotal =
            roundMoney(
                toNumber(
                    sale.total
                )
            )

        const oldReturnedTotal =
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

        const oldRefundedTotal =
            roundMoney(
                toNumber(
                    sale.refunded_total
                )
            )

        const saleOutstanding =
            roundMoney(
                Math.max(
                    0,
                    saleTotal
                    - oldReturnedTotal
                    - paidTotal
                    + oldRefundedTotal
                )
            )

        const lockedItems:
            LockedSaleItem[] =
            []

        for (
            const requested
            of requestedItems
            ) {
            const itemResult =
                await client.query(
                    `
                        SELECT
                            id,

                            product_id
                                AS "productId",

                            product_name
                                AS "productName",

                            unit,

                            quantity::float
                                AS quantity,

                            returned_quantity::float
                                AS "returnedQuantity",

                            selling_price::float
                                AS "sellingPrice"

                        FROM debt_sale_items

                        WHERE
                            id = $1
                            AND debt_sale_id = $2

                        FOR UPDATE
                    `,
                    [
                        requested.debtSaleItemId,
                        debtSaleId,
                    ]
                )

            if (
                itemResult.rows.length === 0
            ) {
                throw new Error(
                    `Позиция ${requested.debtSaleItemId} не найдена в документе ${sale.debt_number}`
                )
            }

            const item =
                itemResult.rows[0]

            const unit =
                item.unit === 'weight'
                    ? 'weight'
                    : 'piece'

            const returnQuantity =
                unit === 'weight'
                    ? roundQuantity(
                        requested.quantity
                    )
                    : Math.floor(
                        requested.quantity
                    )

            if (
                returnQuantity <= 0
            ) {
                throw new Error(
                    `Некорректное количество возврата: ${item.productName}`
                )
            }

            if (
                unit === 'piece' &&
                !Number.isInteger(
                    returnQuantity
                )
            ) {
                throw new Error(
                    `Для товара «${item.productName}» количество возврата должно быть целым`
                )
            }

            const originalQuantity =
                roundQuantity(
                    toNumber(
                        item.quantity
                    )
                )

            const returnedQuantity =
                roundQuantity(
                    toNumber(
                        item.returnedQuantity
                    )
                )

            const availableToReturn =
                roundQuantity(
                    Math.max(
                        0,
                        originalQuantity
                        - returnedQuantity
                    )
                )

            if (
                returnQuantity
                > availableToReturn + 0.0009
            ) {
                throw new Error(
                    `Нельзя вернуть ${returnQuantity} по товару «${item.productName}». Доступно к возврату: ${availableToReturn}.`
                )
            }

            const sellingPrice =
                roundMoney(
                    toNumber(
                        item.sellingPrice
                    )
                )

            const returnTotal =
                roundMoney(
                    sellingPrice
                    * returnQuantity
                )

            lockedItems.push(
                {
                    id:
                        Number(
                            item.id
                        ),

                    productId:
                        Number(
                            item.productId
                        ),

                    productName:
                        String(
                            item.productName
                        ),

                    unit,

                    quantity:
                    originalQuantity,

                    returnedQuantity,

                    sellingPrice,

                    returnQuantity,
                    returnTotal,
                }
            )
        }

        const returnTotal =
            roundMoney(
                lockedItems.reduce(
                    (
                        sum,
                        item
                    ) =>
                        sum +
                        item.returnTotal,
                    0
                )
            )

        if (
            returnTotal <= 0
        ) {
            throw new Error(
                'Сумма возврата должна быть больше 0'
            )
        }

        const debtReduction =
            roundMoney(
                Math.min(
                    returnTotal,
                    saleOutstanding
                )
            )

        const refundAmount =
            roundMoney(
                Math.max(
                    0,
                    returnTotal
                    - saleOutstanding
                )
            )

        const netPaid =
            roundMoney(
                Math.max(
                    0,
                    paidTotal
                    - oldRefundedTotal
                )
            )

        if (
            refundAmount
            > netPaid + 0.009
        ) {
            throw new Error(
                'Сумма денежного возврата превышает фактически полученную оплату по документу'
            )
        }

        if (
            refundAmount > 0.009 &&
            !REFUND_METHODS.has(
                refundMethod as DebtPaymentMethod
            )
        ) {
            throw new Error(
                `Нужно выбрать способ возврата денег клиенту на сумму ${refundAmount.toFixed(2)} ₽`
            )
        }

        const returnNumber =
            await nextDebtReturnNumber(
                client
            )

        const returnResult =
            await client.query<{
                id: number | string
                createdAt: string
            }>(
                `
                    INSERT INTO debt_returns (
                        return_number,

                        debt_sale_id,
                        customer_id,
                        location_id,

                        total,
                        comment,

                        cashier_name,
                        cashier_login
                    )
                    VALUES (
                        $1,

                        $2,
                        $3,
                        $4,

                        $5,
                        NULLIF($6, ''),

                        $7,
                        $8
                    )
                    RETURNING
                        id,

                        created_at
                            AS "createdAt"
                `,
                [
                    returnNumber,

                    debtSaleId,
                    customerId,
                    location.id,

                    returnTotal,
                    comment,

                    user.name,
                    user.login,
                ]
            )

        const debtReturnId =
            Number(
                returnResult.rows[0].id
            )

        const responseItems:
            Array<Record<string, unknown>> =
            []

        for (
            const item
            of lockedItems
            ) {
            await ensureProductStockRow(
                client,
                item.productId,
                location.id
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
                        item.productId,
                        location.id,
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
                    + item.returnQuantity
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
                    item.productId,
                    location.id,
                ]
            )

            await syncLegacyTochkaStock(
                client,
                location,
                item.productId,
                newStock
            )

            const newReturnedQuantity =
                roundQuantity(
                    item.returnedQuantity
                    + item.returnQuantity
                )

            await client.query(
                `
                    UPDATE debt_sale_items
                    SET
                        returned_quantity = $2
                    WHERE id = $1
                `,
                [
                    item.id,
                    newReturnedQuantity,
                ]
            )

            await client.query(
                `
                    INSERT INTO debt_return_items (
                        debt_return_id,
                        debt_sale_item_id,
                        product_id,

                        quantity,
                        selling_price,
                        total
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,

                        $4,
                        $5,
                        $6
                    )
                `,
                [
                    debtReturnId,
                    item.id,
                    item.productId,

                    item.returnQuantity,
                    item.sellingPrice,
                    item.returnTotal,
                ]
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

                        'debt_return',
                        $5,

                        $6,
                        $7
                    )
                `,
                [
                    item.productId,
                    location.id,

                    item.returnQuantity,
                    newStock,

                    debtReturnId,

                    `Возврат из долга ${sale.debt_number}, документ возврата ${returnNumber}`,

                    user.login,
                ]
            )

            responseItems.push(
                {
                    debtSaleItemId:
                    item.id,

                    productId:
                    item.productId,

                    name:
                    item.productName,

                    unit:
                    item.unit,

                    quantity:
                    item.returnQuantity,

                    sellingPrice:
                    item.sellingPrice,

                    total:
                    item.returnTotal,

                    previousStock,
                    newStock,

                    totalReturnedQuantity:
                    newReturnedQuantity,
                }
            )
        }

        let refund:
            | {
            id: number
            refundNumber: string
            amount: number
            paymentMethod: DebtPaymentMethod
            createdAt: string
        }
            | null = null

        if (
            refundAmount > 0.009
        ) {
            const refundNumber =
                await nextDebtRefundNumber(
                    client
                )

            const refundResult =
                await client.query<{
                    id: number | string
                    createdAt: string
                }>(
                    `
                        INSERT INTO debt_refunds (
                            refund_number,
                            debt_return_id,
                            debt_sale_id,
                            customer_id,
                            location_id,
                            payment_method,
                            amount,
                            reason,
                            cashier_name,
                            cashier_login
                        )
                        VALUES (
                            $1,
                            $2,
                            $3,
                            $4,
                            $5,
                            $6,
                            $7,
                            $8,
                            $9,
                            $10
                        )
                        RETURNING
                            id,
                            created_at
                                AS "createdAt"
                    `,
                    [
                        refundNumber,
                        debtReturnId,
                        debtSaleId,
                        customerId,
                        location.id,
                        refundMethod,
                        refundAmount,
                        comment ||
                        `Возврат оплаченной части по ${sale.debt_number}`,
                        user.name,
                        user.login,
                    ]
                )

            refund = {
                id:
                    Number(
                        refundResult.rows[0].id
                    ),

                refundNumber,
                amount:
                refundAmount,

                paymentMethod:
                    refundMethod as DebtPaymentMethod,

                createdAt:
                refundResult.rows[0]
                    .createdAt,
            }
        }

        const newReturnedTotal =
            roundMoney(
                oldReturnedTotal
                + returnTotal
            )

        const newRefundedTotal =
            roundMoney(
                oldRefundedTotal
                + refundAmount
            )

        const newStatus =
            getDebtStatus(
                saleTotal,
                newReturnedTotal,
                paidTotal,
                newRefundedTotal
            )

        await client.query(
            `
                UPDATE debt_sales
                SET
                    returned_total = $2,
                    refunded_total = $3,
                    status = $4,
                    updated_at = NOW()
                WHERE id = $1
            `,
            [
                debtSaleId,
                newReturnedTotal,
                newRefundedTotal,
                newStatus,
            ]
        )

        const currentDebt =
            roundMoney(
                Math.max(
                    0,
                    previousDebt
                    - debtReduction
                )
            )

        await insertDebtEvent(
            client,
            {
                customerId,

                eventType:
                    'debt_return_created',

                debtSaleId,

                returnId:
                debtReturnId,

                locationId:
                location.id,

                amount:
                    -debtReduction,

                payload: {
                    debtNumber:
                        String(
                            sale.debt_number
                        ),

                    returnNumber,

                    previousDebt,
                    currentDebt,

                    returnTotal,
                    debtReduction,
                    refundAmount,
                    refundMethod:
                        refund || null,

                    itemCount:
                    responseItems.length,
                },

                createdBy:
                user.login,

                createdByName:
                user.name,
            }
        )

        if (refund) {
            await insertDebtEvent(
                client,
                {
                    customerId,
                    eventType:
                        'debt_refund_created',
                    debtSaleId,
                    returnId:
                    debtReturnId,
                    refundId:
                    refund.id,
                    locationId:
                    location.id,
                    amount:
                    refund.amount,
                    payload: {
                        debtNumber:
                            String(
                                sale.debt_number
                            ),
                        returnNumber,
                        refundNumber:
                        refund.refundNumber,
                        paymentMethod:
                        refund.paymentMethod,
                    },
                    createdBy:
                    user.login,
                    createdByName:
                    user.name,
                }
            )
        }

        await client.query(
            'COMMIT'
        )

        const creditLimit =
            roundMoney(
                toNumber(
                    sale.credit_limit
                )
            )

        return NextResponse.json(
            {
                ok: true,

                debtReturn: {
                    id:
                    debtReturnId,

                    returnNumber,

                    debtSaleId,

                    debtNumber:
                        String(
                            sale.debt_number
                        ),

                    total:
                    returnTotal,

                    debtReduction,
                    refundAmount,
                    refund,

                    comment,

                    createdAt:
                    returnResult.rows[0]
                        .createdAt,

                    location: {
                        id:
                        location.id,

                        name:
                        location.name,

                        slug:
                        location.slug,
                    },

                    cashier: {
                        name:
                        user.name,

                        login:
                        user.login,
                    },

                    items:
                    responseItems,
                },

                debtSale: {
                    id:
                    debtSaleId,

                    debtNumber:
                        String(
                            sale.debt_number
                        ),

                    status:
                    newStatus,

                    total:
                    saleTotal,

                    returnedTotal:
                    newReturnedTotal,

                    paidTotal,

                    refundedTotal:
                    newRefundedTotal,

                    remainingAmount:
                        roundMoney(
                            Math.max(
                                0,
                                saleTotal
                                - newReturnedTotal
                                - paidTotal
                                + newRefundedTotal
                            )
                        ),
                },

                customer: {
                    id:
                    customerId,

                    firstName:
                        String(
                            sale.first_name
                        ),

                    lastName:
                        String(
                            sale.last_name
                        ),

                    middleName:
                        String(
                            sale.middle_name || ''
                        ),

                    fullName: [
                        sale.last_name,
                        sale.first_name,
                        sale.middle_name,
                    ]
                        .filter(Boolean)
                        .join(' '),

                    phone:
                        String(
                            sale.phone
                        ),

                    address:
                        String(
                            sale.address
                        ),

                    creditLimit,

                    previousDebt,

                    currentDebt,

                    availableCredit:
                        roundMoney(
                            Math.max(
                                0,
                                creditLimit
                                - currentDebt
                            )
                        ),
                },
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
            'POST /api/debts/returns error:',
            error
        )

        return NextResponse.json(
            {
                message:
                    error instanceof Error
                        ? error.message
                        : 'Не удалось провести возврат из долга',
            },
            {
                status: 500,
            }
        )
    } finally {
        client.release()
    }
}

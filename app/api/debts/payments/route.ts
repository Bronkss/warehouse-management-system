import {
    NextRequest,
    NextResponse,
} from 'next/server'

import { pool } from '@/app/lib/db'
import {
    type DebtPaymentMethod,
    getCustomerDebt,
    getDebtStatus,
    insertDebtEvent,
    nextDebtPaymentNumber,
    roundMoney,
    toNumber,
} from '@/app/lib/debts'
import { requireWarehouseSection } from '@/app/lib/serverWarehouseAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAYMENT_METHODS =
    new Set<DebtPaymentMethod>(
        [
            'cash',
            'card',
            'transfer',
        ]
    )

type DebtPaymentBody = {
    customerId?:
        | number
        | string
    amount?:
        | number
        | string
    paymentMethod?: string
    comment?: string
}

function isPaymentMethod(
    value: unknown
): value is DebtPaymentMethod {
    return (
        typeof value === 'string' &&
        PAYMENT_METHODS.has(
            value as DebtPaymentMethod
        )
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
            ) as DebtPaymentBody

        const customerId =
            Number(body.customerId)

        const amount =
            roundMoney(
                toNumber(
                    body.amount,
                    NaN
                )
            )

        const paymentMethod =
            body.paymentMethod

        const comment =
            String(
                body.comment || ''
            ).trim()

        if (
            !Number.isInteger(
                customerId
            ) ||
            customerId <= 0
        ) {
            return NextResponse.json(
                {
                    message:
                        'Выберите клиента',
                },
                {
                    status: 400,
                }
            )
        }

        if (
            !Number.isFinite(amount) ||
            amount <= 0
        ) {
            return NextResponse.json(
                {
                    message:
                        'Сумма погашения должна быть больше 0',
                },
                {
                    status: 400,
                }
            )
        }

        if (
            !isPaymentMethod(
                paymentMethod
            )
        ) {
            return NextResponse.json(
                {
                    message:
                        'Некорректный способ оплаты',
                },
                {
                    status: 400,
                }
            )
        }

        await client.query('BEGIN')

        const customerResult =
            await client.query(
                `
                    SELECT
                        id,
                        first_name,
                        last_name,
                        middle_name,
                        phone,
                        address,
                        credit_limit::float
                            AS credit_limit
                    FROM debt_customers
                    WHERE id = $1
                    FOR UPDATE
                `,
                [customerId]
            )

        if (
            customerResult.rows.length === 0
        ) {
            throw new Error(
                'Клиент не найден'
            )
        }

        const customer =
            customerResult.rows[0]

        const previousDebt =
            await getCustomerDebt(
                client,
                customerId
            )

        if (
            previousDebt <= 0.009
        ) {
            throw new Error(
                'У клиента нет задолженности'
            )
        }

        if (
            amount
            > previousDebt + 0.009
        ) {
            throw new Error(
                `Сумма погашения больше текущего долга. Текущий долг: ${previousDebt.toFixed(2)} ₽.`
            )
        }

        const salesResult =
            await client.query(
                `
                    SELECT
                        id,
                        debt_number,
                        total::float
                            AS total,
                        returned_total::float
                            AS returned_total,
                        paid_total::float
                            AS paid_total,

                        refunded_total::float
                            AS refunded_total
                    FROM debt_sales
                    WHERE
                        customer_id = $1
                        AND status <> 'cancelled'
                        AND (
                            total
                            - returned_total
                            - paid_total
                            + refunded_total
                        ) > 0.009
                    ORDER BY
                        created_at ASC,
                        id ASC
                    FOR UPDATE
                `,
                [customerId]
            )

        if (
            salesResult.rows.length === 0
        ) {
            throw new Error(
                'Не найдено открытых долговых документов'
            )
        }

        const paymentNumber =
            await nextDebtPaymentNumber(
                client
            )

        const paymentResult =
            await client.query<{
                id: number | string
                createdAt: string
            }>(
                `
                    INSERT INTO debt_payments (
                        payment_number,
                        customer_id,
                        location_id,
                        payment_method,
                        amount,
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
                    paymentNumber,
                    customerId,
                    location.id,
                    paymentMethod,
                    amount,
                    comment,
                    user.name,
                    user.login,
                ]
            )

        const paymentId =
            Number(
                paymentResult.rows[0].id
            )

        let remainingToAllocate =
            amount

        const allocations:
            Array<{
                debtSaleId: number
                debtNumber: string
                amount: number
                remainingAmount: number
            }> = []

        for (
            const row
            of salesResult.rows
            ) {
            if (
                remainingToAllocate
                <= 0.009
            ) {
                break
            }

            const debtSaleId =
                Number(row.id)

            const total =
                roundMoney(
                    toNumber(row.total)
                )

            const returnedTotal =
                roundMoney(
                    toNumber(
                        row.returned_total
                    )
                )

            const oldPaidTotal =
                roundMoney(
                    toNumber(
                        row.paid_total
                    )
                )

            const refundedTotal =
                roundMoney(
                    toNumber(
                        row.refunded_total
                    )
                )

            const outstanding =
                roundMoney(
                    Math.max(
                        0,
                        total
                        - returnedTotal
                        - oldPaidTotal
                        + refundedTotal
                    )
                )

            if (
                outstanding <= 0.009
            ) {
                continue
            }

            const allocation =
                roundMoney(
                    Math.min(
                        remainingToAllocate,
                        outstanding
                    )
                )

            if (allocation <= 0) {
                continue
            }

            const newPaidTotal =
                roundMoney(
                    oldPaidTotal
                    + allocation
                )

            const newStatus =
                getDebtStatus(
                    total,
                    returnedTotal,
                    newPaidTotal,
                    refundedTotal
                )

            await client.query(
                `
                    INSERT INTO debt_payment_allocations (
                        payment_id,
                        debt_sale_id,
                        amount
                    )
                    VALUES (
                        $1,
                        $2,
                        $3
                    )
                `,
                [
                    paymentId,
                    debtSaleId,
                    allocation,
                ]
            )

            await client.query(
                `
                    UPDATE debt_sales
                    SET
                        paid_total = $2,
                        status = $3,
                        updated_at = NOW()
                    WHERE id = $1
                `,
                [
                    debtSaleId,
                    newPaidTotal,
                    newStatus,
                ]
            )

            const remainingAmount =
                roundMoney(
                    Math.max(
                        0,
                        total
                        - returnedTotal
                        - newPaidTotal
                        + refundedTotal
                    )
                )

            allocations.push(
                {
                    debtSaleId,
                    debtNumber:
                        String(
                            row.debt_number
                        ),
                    amount:
                    allocation,
                    remainingAmount,
                }
            )

            remainingToAllocate =
                roundMoney(
                    remainingToAllocate
                    - allocation
                )
        }

        if (
            remainingToAllocate > 0.009
        ) {
            throw new Error(
                'Не удалось полностью распределить платёж по долгам'
            )
        }

        const currentDebt =
            roundMoney(
                previousDebt - amount
            )

        await insertDebtEvent(
            client,
            {
                customerId,
                eventType:
                    'debt_payment_created',
                paymentId,
                locationId:
                location.id,
                amount:
                    -amount,
                payload: {
                    paymentNumber,
                    paymentMethod,
                    previousDebt,
                    currentDebt,
                    allocations,
                },
                createdBy:
                user.login,
                createdByName:
                user.name,
            }
        )

        await client.query('COMMIT')

        const creditLimit =
            roundMoney(
                toNumber(
                    customer.credit_limit
                )
            )

        return NextResponse.json(
            {
                ok: true,
                payment: {
                    id:
                    paymentId,
                    paymentNumber,
                    paymentMethod,
                    amount,
                    comment,
                    createdAt:
                    paymentResult.rows[0]
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
                    allocations,
                },
                customer: {
                    id:
                    customerId,
                    firstName:
                        String(
                            customer.first_name
                        ),
                    lastName:
                        String(
                            customer.last_name
                        ),
                    middleName:
                        String(
                            customer.middle_name || ''
                        ),
                    fullName: [
                        customer.last_name,
                        customer.first_name,
                        customer.middle_name,
                    ]
                        .filter(Boolean)
                        .join(' '),
                    phone:
                        String(
                            customer.phone
                        ),
                    address:
                        String(
                            customer.address
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
            .query('ROLLBACK')
            .catch(
                () => undefined
            )

        console.error(
            'POST /api/debts/payments error:',
            error
        )

        return NextResponse.json(
            {
                message:
                    error instanceof Error
                        ? error.message
                        : 'Не удалось провести погашение долга',
            },
            {
                status: 500,
            }
        )
    } finally {
        client.release()
    }
}

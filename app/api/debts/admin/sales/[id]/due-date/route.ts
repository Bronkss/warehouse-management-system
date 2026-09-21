import {
    NextRequest,
    NextResponse,
} from 'next/server'

import { pool } from '@/app/lib/db'
import {
    insertDebtEvent,
    roundMoney,
    toNumber,
} from '@/app/lib/debts'
import { requireWarehouseSection } from '@/app/lib/serverWarehouseAccess'

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

async function getRouteParams(
    context: RouteContext
) {
    return await context.params
}

function parseSaleId(
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

function normalizeDueDate(
    value: unknown
): string | null {
    if (
        value === null ||
        value === undefined ||
        String(value).trim() === ''
    ) {
        return null
    }

    const raw =
        String(value)
            .trim()

    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
            raw
        )
    ) {
        throw new Error(
            'Дата должна быть в формате ГГГГ-ММ-ДД'
        )
    }

    const [
        yearRaw,
        monthRaw,
        dayRaw,
    ] =
        raw.split('-')

    const year =
        Number(yearRaw)

    const month =
        Number(monthRaw)

    const day =
        Number(dayRaw)

    const parsed =
        new Date(
            Date.UTC(
                year,
                month - 1,
                day
            )
        )

    if (
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month - 1 ||
        parsed.getUTCDate() !== day
    ) {
        throw new Error(
            'Некорректная дата погашения'
        )
    }

    return raw
}

export async function PATCH(
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
            location,
            user,
        } =
            access.context

        const {
            id: rawId,
        } =
            await getRouteParams(
                context
            )

        const debtSaleId =
            parseSaleId(
                rawId
            )

        const body =
            await request.json()

        const dueDate =
            normalizeDueDate(
                body.dueDate
            )

        await client.query(
            'BEGIN'
        )

        const saleResult =
            await client.query(
                `
                    SELECT
                        id,
                        customer_id,
                        debt_number,
                        due_date,
                        status,

                        GREATEST(
                            total
                            - returned_total
                            - paid_total
                            + refunded_total,
                            0
                        )::float
                            AS remaining_amount

                    FROM debt_sales

                    WHERE id = $1

                    FOR UPDATE
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
                'Для отменённого документа срок не изменяется'
            )
        }

        const remainingAmount =
            roundMoney(
                toNumber(
                    sale.remaining_amount
                )
            )

        if (
            remainingAmount <= 0.009
        ) {
            throw new Error(
                'Долговой документ уже полностью закрыт'
            )
        }

        const previousDueDate =
            sale.due_date
                ? String(
                    sale.due_date
                ).slice(
                    0,
                    10
                )
                : null

        await client.query(
            `
                UPDATE debt_sales
                SET
                    due_date = $2::date,
                    updated_at = NOW()
                WHERE id = $1
            `,
            [
                debtSaleId,
                dueDate,
            ]
        )

        await insertDebtEvent(
            client,
            {
                customerId:
                    Number(
                        sale.customer_id
                    ),

                eventType:
                    'debt_due_date_updated_admin',

                debtSaleId,

                locationId:
                location.id,

                payload: {
                    debtNumber:
                        String(
                            sale.debt_number
                        ),

                    previousDueDate,
                    dueDate,
                    remainingAmount,
                },

                createdBy:
                user.login,

                createdByName:
                user.name,
            }
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

                    dueDate,
                    remainingAmount,
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
            'PATCH /api/debts/admin/sales/[id]/due-date error:',
            error
        )

        return NextResponse.json(
            {
                message:
                    error instanceof Error
                        ? error.message
                        : 'Не удалось изменить срок погашения',
            },
            {
                status: 500,
            }
        )
    } finally {
        client.release()
    }
}

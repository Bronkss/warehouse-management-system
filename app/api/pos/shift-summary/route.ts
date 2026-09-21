import {
    NextRequest,
    NextResponse,
} from 'next/server'

import { pool } from '@/app/lib/db'
import { requireWarehouseSection } from '@/app/lib/serverWarehouseAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PaymentMethod =
    | 'cash'
    | 'card'
    | 'transfer'

type PaymentBucket = {
    count: number
    total: number
}

type PaymentBreakdown = Record<
    PaymentMethod,
    PaymentBucket
>

type PaymentRow = {
    payment_method: string
    count: number | string
    total: number | string
}

type AggregateRow = {
    count: number | string
    total: number | string
}

const PAYMENT_METHODS:
    PaymentMethod[] = [
    'cash',
    'card',
    'transfer',
]

const MAX_RANGE_MS =
    7 * 24 * 60 * 60 * 1000

function toNumber(
    value: unknown
): number {
    const parsed =
        Number(
            value
        )

    return Number.isFinite(
        parsed
    )
        ? parsed
        : 0
}

function roundMoney(
    value: number
): number {
    return Math.round(
        (
            value +
            Number.EPSILON
        ) * 100
    ) / 100
}

function emptyBreakdown():
    PaymentBreakdown {
    return {
        cash: {
            count: 0,
            total: 0,
        },

        card: {
            count: 0,
            total: 0,
        },

        transfer: {
            count: 0,
            total: 0,
        },
    }
}

function parseDateParam(
    value: string | null,
    fieldName: string
): Date {
    if (!value) {
        throw new Error(
            `Не указано поле ${fieldName}`
        )
    }

    const parsed =
        new Date(
            value
        )

    if (
        Number.isNaN(
            parsed.getTime()
        )
    ) {
        throw new Error(
            `Некорректное поле ${fieldName}`
        )
    }

    return parsed
}

function applyPaymentRows(
    target: PaymentBreakdown,
    rows: PaymentRow[]
) {
    for (
        const row
        of rows
        ) {
        const method =
            String(
                row.payment_method ||
                ''
            ) as PaymentMethod

        if (
            !PAYMENT_METHODS.includes(
                method
            )
        ) {
            continue
        }

        target[method] = {
            count:
                Math.max(
                    0,
                    Math.floor(
                        toNumber(
                            row.count
                        )
                    )
                ),

            total:
                roundMoney(
                    toNumber(
                        row.total
                    )
                ),
        }
    }
}

function sumBreakdown(
    breakdown: PaymentBreakdown
): number {
    return roundMoney(
        PAYMENT_METHODS.reduce(
            (
                sum,
                method
            ) =>
                sum +
                breakdown[
                    method
                    ].total,
            0
        )
    )
}

function countBreakdown(
    breakdown: PaymentBreakdown
): number {
    return PAYMENT_METHODS.reduce(
        (
            sum,
            method
        ) =>
            sum +
            breakdown[
                method
                ].count,
        0
    )
}

export async function GET(
    request: NextRequest
) {
    try {
        const access =
            await requireWarehouseSection(
                pool,
                request,
                'sales'
            )

        if (!access.ok) {
            return access.response
        }

        const {
            location,
        } = access.context

        const url =
            new URL(
                request.url
            )

        const from =
            parseDateParam(
                url.searchParams.get(
                    'from'
                ),
                'from'
            )

        const requestedTo =
            url.searchParams.get(
                'to'
            )

        const now =
            new Date()

        const to =
            requestedTo
                ? parseDateParam(
                    requestedTo,
                    'to'
                )
                : now

        if (
            from.getTime() >
            to.getTime()
        ) {
            return NextResponse.json(
                {
                    message:
                        'Начало смены не может быть позже конца смены',
                },
                {
                    status: 400,
                }
            )
        }

        if (
            to.getTime() -
            from.getTime() >
            MAX_RANGE_MS
        ) {
            return NextResponse.json(
                {
                    message:
                        'Диапазон смены не может превышать 7 дней',
                },
                {
                    status: 400,
                }
            )
        }

        const [
            receiptPaymentResult,
            debtPaymentResult,
            debtRefundResult,
            debtIssuedResult,
            debtReturnsResult,
            receiptAggregateResult,
        ] =
            await Promise.all(
                [
                    pool.query<PaymentRow>(
                        `
                            SELECT
                                payment_method,

                                COUNT(*)::int
                                    AS count,

                                COALESCE(
                                    SUM(amount),
                                    0
                                )::float
                                    AS total

                            FROM (
                                SELECT
                                    'cash'::text
                                        AS payment_method,
                                    cash_amount::float
                                        AS amount
                                FROM receipts
                                WHERE
                                    location_id = $1
                                    AND created_at >= $2::timestamptz
                                    AND created_at < $3::timestamptz
                                    AND cash_amount > 0

                                UNION ALL

                                SELECT
                                    'card'::text,
                                    card_amount::float
                                FROM receipts
                                WHERE
                                    location_id = $1
                                    AND created_at >= $2::timestamptz
                                    AND created_at < $3::timestamptz
                                    AND card_amount > 0

                                UNION ALL

                                SELECT
                                    'transfer'::text,
                                    transfer_amount::float
                                FROM receipts
                                WHERE
                                    location_id = $1
                                    AND created_at >= $2::timestamptz
                                    AND created_at < $3::timestamptz
                                    AND transfer_amount > 0
                            ) payment_parts

                            GROUP BY
                                payment_method
                        `,
                        [
                            location.id,
                            from.toISOString(),
                            to.toISOString(),
                        ]
                    ),

                    pool.query<PaymentRow>(
                        `
                            SELECT
                                payment_method,

                                COUNT(*)::int
                                    AS count,

                                COALESCE(
                                    SUM(amount),
                                    0
                                )::float
                                    AS total

                            FROM debt_payments

                            WHERE
                                location_id = $1

                                AND created_at
                                    >= $2::timestamptz

                                AND created_at
                                    < $3::timestamptz

                            GROUP BY
                                payment_method
                        `,
                        [
                            location.id,
                            from.toISOString(),
                            to.toISOString(),
                        ]
                    ),

                    pool.query<PaymentRow>(
                        `
                            SELECT
                                payment_method,

                                COUNT(*)::int
                                    AS count,

                                COALESCE(
                                    SUM(amount),
                                    0
                                )::float
                                    AS total

                            FROM debt_refunds

                            WHERE
                                location_id = $1

                                AND created_at
                                    >= $2::timestamptz

                                AND created_at
                                    < $3::timestamptz

                            GROUP BY
                                payment_method
                        `,
                        [
                            location.id,
                            from.toISOString(),
                            to.toISOString(),
                        ]
                    ),

                    pool.query<AggregateRow>(
                        `
                            SELECT
                                COUNT(*)::int
                                    AS count,

                                COALESCE(
                                    SUM(total),
                                    0
                                )::float
                                    AS total

                            FROM debt_sales

                            WHERE
                                location_id = $1

                                AND status
                                    <> 'cancelled'

                                AND created_at
                                    >= $2::timestamptz

                                AND created_at
                                    < $3::timestamptz
                        `,
                        [
                            location.id,
                            from.toISOString(),
                            to.toISOString(),
                        ]
                    ),

                    pool.query<AggregateRow>(
                        `
                            SELECT
                                COUNT(*)::int
                                    AS count,

                                COALESCE(
                                    SUM(total),
                                    0
                                )::float
                                    AS total

                            FROM debt_returns

                            WHERE
                                location_id = $1

                                AND created_at
                                    >= $2::timestamptz

                                AND created_at
                                    < $3::timestamptz
                        `,
                        [
                            location.id,
                            from.toISOString(),
                            to.toISOString(),
                        ]
                    ),

                    pool.query<AggregateRow>(
                        `
                            SELECT
                                COUNT(*)::int AS count,
                                COALESCE(SUM(total), 0)::float AS total
                            FROM receipts
                            WHERE
                                location_id = $1
                                AND created_at >= $2::timestamptz
                                AND created_at < $3::timestamptz
                        `,
                        [
                            location.id,
                            from.toISOString(),
                            to.toISOString(),
                        ]
                    ),
                ]
            )

        const salesByPayment =
            emptyBreakdown()

        const debtPaymentsByPayment =
            emptyBreakdown()

        const debtRefundsByPayment =
            emptyBreakdown()

        applyPaymentRows(
            salesByPayment,
            receiptPaymentResult.rows
        )

        applyPaymentRows(
            debtPaymentsByPayment,
            debtPaymentResult.rows
        )

        applyPaymentRows(
            debtRefundsByPayment,
            debtRefundResult.rows
        )

        const combinedByPayment =
            emptyBreakdown()

        for (
            const method
            of PAYMENT_METHODS
            ) {
            combinedByPayment[
                method
                ] = {
                count:
                    salesByPayment[
                        method
                        ].count +
                    debtPaymentsByPayment[
                        method
                        ].count +
                    debtRefundsByPayment[
                        method
                        ].count,

                total:
                    roundMoney(
                        salesByPayment[
                            method
                            ].total +
                        debtPaymentsByPayment[
                            method
                            ].total -
                        debtRefundsByPayment[
                            method
                            ].total
                    ),
            }
        }

        const receiptTotal =
            sumBreakdown(
                salesByPayment
            )

        const debtPaymentTotal =
            sumBreakdown(
                debtPaymentsByPayment
            )

        const debtRefundTotal =
            sumBreakdown(
                debtRefundsByPayment
            )

        const totalReceived =
            roundMoney(
                receiptTotal +
                debtPaymentTotal -
                debtRefundTotal
            )

        const debtIssuedRow =
            debtIssuedResult.rows[0]

        const debtReturnsRow =
            debtReturnsResult.rows[0]

        const debtIssued = {
            count:
                Math.max(
                    0,
                    Math.floor(
                        toNumber(
                            debtIssuedRow
                                ?.count
                        )
                    )
                ),

            total:
                roundMoney(
                    toNumber(
                        debtIssuedRow
                            ?.total
                    )
                ),
        }

        const debtReturns = {
            count:
                Math.max(
                    0,
                    Math.floor(
                        toNumber(
                            debtReturnsRow
                                ?.count
                        )
                    )
                ),

            total:
                roundMoney(
                    toNumber(
                        debtReturnsRow
                            ?.total
                    )
                ),
        }

        return NextResponse.json(
            {
                from:
                    from.toISOString(),

                to:
                    to.toISOString(),

                location: {
                    id:
                    location.id,

                    name:
                    location.name,

                    slug:
                    location.slug,
                },

                ordinarySales: {
                    count:
                        Math.max(
                            0,
                            Math.floor(
                                toNumber(
                                    receiptAggregateResult.rows[0]?.count
                                )
                            )
                        ),

                    total:
                    receiptTotal,

                    byPayment:
                    salesByPayment,
                },

                debtPayments: {
                    count:
                        countBreakdown(
                            debtPaymentsByPayment
                        ),

                    total:
                    debtPaymentTotal,

                    byPayment:
                    debtPaymentsByPayment,
                },

                debtRefunds: {
                    count:
                        countBreakdown(
                            debtRefundsByPayment
                        ),

                    total:
                    debtRefundTotal,

                    byPayment:
                    debtRefundsByPayment,
                },

                received: {
                    count:
                        countBreakdown(
                            combinedByPayment
                        ),

                    total:
                    totalReceived,

                    byPayment:
                    combinedByPayment,
                },

                debtIssued,
                debtReturns,
            },
            {
                headers: {
                    'Cache-Control':
                        'private, no-store',
                },
            }
        )
    } catch (error) {
        console.error(
            'GET /api/pos/shift-summary error:',
            error
        )

        return NextResponse.json(
            {
                message:
                    error instanceof Error
                        ? error.message
                        : 'Не удалось получить данные текущей смены',
            },
            {
                status: 500,
            }
        )
    }
}

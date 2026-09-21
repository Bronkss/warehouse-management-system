import {
    NextRequest,
    NextResponse,
} from 'next/server'

import { pool } from '@/app/lib/db'
import {
    roundMoney,
    toNumber,
} from '@/app/lib/debts'
import { requireWarehouseSection } from '@/app/lib/serverWarehouseAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CustomerRow = {
    id: number | string
    first_name: string
    last_name: string
    middle_name: string | null
    phone: string
    address: string
    credit_limit: number | string
    is_active: boolean
    comment: string | null

    current_debt: number | string | null
    overdue_debt: number | string | null
    due_today_debt: number | string | null
    due_soon_debt: number | string | null
    no_due_date_debt: number | string | null

    debt_sale_count: number | string | null
    overdue_document_count: number | string | null
    payment_count: number | string | null
    return_count: number | string | null

    nearest_due_date: string | null
    oldest_overdue_due_date: string | null
    last_activity_at: string | null
}

type SummaryRow = {
    customer_count: number | string | null
    customers_with_debt: number | string | null
    blocked_customers: number | string | null
    overdue_customers: number | string | null

    total_credit_limit: number | string | null
    total_outstanding: number | string | null
    overdue_outstanding: number | string | null
    due_today_outstanding: number | string | null
    due_soon_outstanding: number | string | null
    no_due_date_outstanding: number | string | null
}

type LocationDebtRow = {
    id: number | string
    name: string
    slug: string
    outstanding: number | string | null
    overdue: number | string | null
    customers: number | string | null
    overdue_customers: number | string | null
    documents: number | string | null
}

function normalizeSearch(
    value: string | null
): string {
    return String(value || '')
        .trim()
        .toLowerCase()
}

function daysBetweenToday(
    value: string | null
): number | null {
    if (!value) {
        return null
    }

    const raw =
        String(value)
            .slice(0, 10)

    const match =
        raw.match(
            /^(\d{4})-(\d{2})-(\d{2})$/
        )

    if (!match) {
        return null
    }

    const target =
        Date.UTC(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3])
        )

    const now =
        new Date()

    const today =
        Date.UTC(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
        )

    return Math.round(
        (
            target -
            today
        ) /
        86_400_000
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
                'debts'
            )

        if (!access.ok) {
            return access.response
        }

        const url =
            new URL(request.url)

        const search =
            normalizeSearch(
                url.searchParams.get(
                    'search'
                )
            )

        const status =
            String(
                url.searchParams.get(
                    'status'
                ) || 'debt'
            ).trim()

        const deadline =
            String(
                url.searchParams.get(
                    'deadline'
                ) || 'all'
            ).trim()

        const customersResult =
            await pool.query<CustomerRow>(
                `
                    WITH debt_summary AS (
                        SELECT
                            ds.customer_id,

                            COALESCE(
                                SUM(
                                    GREATEST(
                                        ds.total
                                        - ds.returned_total
                                        - ds.paid_total
                                        + ds.refunded_total,
                                        0
                                    )
                                ),
                                0
                            ) AS current_debt,

                            COALESCE(
                                SUM(
                                    GREATEST(
                                        ds.total
                                        - ds.returned_total
                                        - ds.paid_total
                                        + ds.refunded_total,
                                        0
                                    )
                                ) FILTER (
                                    WHERE
                                        ds.due_date IS NOT NULL
                                        AND ds.due_date < CURRENT_DATE
                                        AND (
                                            ds.total
                                            - ds.returned_total
                                            - ds.paid_total
                                            + ds.refunded_total
                                        ) > 0.009
                                ),
                                0
                            ) AS overdue_debt,

                            COALESCE(
                                SUM(
                                    GREATEST(
                                        ds.total
                                        - ds.returned_total
                                        - ds.paid_total
                                        + ds.refunded_total,
                                        0
                                    )
                                ) FILTER (
                                    WHERE
                                        ds.due_date = CURRENT_DATE
                                        AND (
                                            ds.total
                                            - ds.returned_total
                                            - ds.paid_total
                                            + ds.refunded_total
                                        ) > 0.009
                                ),
                                0
                            ) AS due_today_debt,

                            COALESCE(
                                SUM(
                                    GREATEST(
                                        ds.total
                                        - ds.returned_total
                                        - ds.paid_total
                                        + ds.refunded_total,
                                        0
                                    )
                                ) FILTER (
                                    WHERE
                                        ds.due_date > CURRENT_DATE
                                        AND ds.due_date <= CURRENT_DATE + 7
                                        AND (
                                            ds.total
                                            - ds.returned_total
                                            - ds.paid_total
                                            + ds.refunded_total
                                        ) > 0.009
                                ),
                                0
                            ) AS due_soon_debt,

                            COALESCE(
                                SUM(
                                    GREATEST(
                                        ds.total
                                        - ds.returned_total
                                        - ds.paid_total
                                        + ds.refunded_total,
                                        0
                                    )
                                ) FILTER (
                                    WHERE
                                        ds.due_date IS NULL
                                        AND (
                                            ds.total
                                            - ds.returned_total
                                            - ds.paid_total
                                            + ds.refunded_total
                                        ) > 0.009
                                ),
                                0
                            ) AS no_due_date_debt,

                            COUNT(*) FILTER (
                                WHERE
                                    ds.status <> 'cancelled'
                            ) AS debt_sale_count,

                            COUNT(*) FILTER (
                                WHERE
                                    ds.status <> 'cancelled'
                                    AND ds.due_date IS NOT NULL
                                    AND ds.due_date < CURRENT_DATE
                                    AND (
                                        ds.total
                                        - ds.returned_total
                                        - ds.paid_total
                                        + ds.refunded_total
                                    ) > 0.009
                            ) AS overdue_document_count,

                            MIN(
                                ds.due_date
                            ) FILTER (
                                WHERE
                                    ds.status <> 'cancelled'
                                    AND ds.due_date IS NOT NULL
                                    AND (
                                        ds.total
                                        - ds.returned_total
                                        - ds.paid_total
                                        + ds.refunded_total
                                    ) > 0.009
                            ) AS nearest_due_date,

                            MIN(
                                ds.due_date
                            ) FILTER (
                                WHERE
                                    ds.status <> 'cancelled'
                                    AND ds.due_date IS NOT NULL
                                    AND ds.due_date < CURRENT_DATE
                                    AND (
                                        ds.total
                                        - ds.returned_total
                                        - ds.paid_total
                                        + ds.refunded_total
                                    ) > 0.009
                            ) AS oldest_overdue_due_date,

                            MAX(
                                ds.created_at
                            ) FILTER (
                                WHERE
                                    ds.status <> 'cancelled'
                            ) AS last_debt_at

                        FROM debt_sales ds
                        GROUP BY ds.customer_id
                    ),

                    payment_summary AS (
                        SELECT
                            customer_id,
                            COUNT(*) AS payment_count,
                            MAX(created_at) AS last_payment_at
                        FROM debt_payments
                        GROUP BY customer_id
                    ),

                    return_summary AS (
                        SELECT
                            customer_id,
                            COUNT(*) AS return_count,
                            MAX(created_at) AS last_return_at
                        FROM debt_returns
                        GROUP BY customer_id
                    ),

                    refund_summary AS (
                        SELECT
                            customer_id,
                            MAX(created_at) AS last_refund_at
                        FROM debt_refunds
                        GROUP BY customer_id
                    )

                    SELECT
                        dc.id,
                        dc.first_name,
                        dc.last_name,
                        dc.middle_name,
                        dc.phone,
                        dc.address,
                        dc.credit_limit::float AS credit_limit,
                        dc.is_active,
                        dc.comment,

                        COALESCE(
                            ds.current_debt,
                            0
                        )::float AS current_debt,

                        COALESCE(
                            ds.overdue_debt,
                            0
                        )::float AS overdue_debt,

                        COALESCE(
                            ds.due_today_debt,
                            0
                        )::float AS due_today_debt,

                        COALESCE(
                            ds.due_soon_debt,
                            0
                        )::float AS due_soon_debt,

                        COALESCE(
                            ds.no_due_date_debt,
                            0
                        )::float AS no_due_date_debt,

                        COALESCE(
                            ds.debt_sale_count,
                            0
                        )::int AS debt_sale_count,

                        COALESCE(
                            ds.overdue_document_count,
                            0
                        )::int AS overdue_document_count,

                        COALESCE(
                            ps.payment_count,
                            0
                        )::int AS payment_count,

                        COALESCE(
                            rs.return_count,
                            0
                        )::int AS return_count,

                        ds.nearest_due_date,
                        ds.oldest_overdue_due_date,

                        GREATEST(
                            COALESCE(
                                ds.last_debt_at,
                                '-infinity'::timestamptz
                            ),
                            COALESCE(
                                ps.last_payment_at,
                                '-infinity'::timestamptz
                            ),
                            COALESCE(
                                rs.last_return_at,
                                '-infinity'::timestamptz
                            ),
                            COALESCE(
                                rfs.last_refund_at,
                                '-infinity'::timestamptz
                            ),
                            dc.updated_at
                        ) AS last_activity_at

                    FROM debt_customers dc
                    LEFT JOIN debt_summary ds
                        ON ds.customer_id = dc.id
                    LEFT JOIN payment_summary ps
                        ON ps.customer_id = dc.id
                    LEFT JOIN return_summary rs
                        ON rs.customer_id = dc.id
                    LEFT JOIN refund_summary rfs
                        ON rfs.customer_id = dc.id

                    WHERE
                        (
                            $1 = ''
                            OR LOWER(
                                CONCAT_WS(
                                    ' ',
                                    dc.last_name,
                                    dc.first_name,
                                    dc.middle_name
                                )
                            ) LIKE '%' || $1 || '%'
                            OR LOWER(dc.phone)
                                LIKE '%' || $1 || '%'
                            OR LOWER(dc.address)
                                LIKE '%' || $1 || '%'
                        )

                        AND (
                            $2 = 'all'
                            OR (
                                $2 = 'debt'
                                AND COALESCE(
                                    ds.current_debt,
                                    0
                                ) > 0.009
                            )
                            OR (
                                $2 = 'clear'
                                AND COALESCE(
                                    ds.current_debt,
                                    0
                                ) <= 0.009
                            )
                            OR (
                                $2 = 'blocked'
                                AND dc.is_active = FALSE
                            )
                            OR (
                                $2 = 'limit'
                                AND COALESCE(
                                    ds.current_debt,
                                    0
                                ) >= dc.credit_limit
                                AND COALESCE(
                                    ds.current_debt,
                                    0
                                ) > 0.009
                            )
                        )

                        AND (
                            $3 = 'all'
                            OR (
                                $3 = 'overdue'
                                AND COALESCE(
                                    ds.overdue_debt,
                                    0
                                ) > 0.009
                            )
                            OR (
                                $3 = 'today'
                                AND COALESCE(
                                    ds.due_today_debt,
                                    0
                                ) > 0.009
                            )
                            OR (
                                $3 = 'week'
                                AND COALESCE(
                                    ds.due_soon_debt,
                                    0
                                ) > 0.009
                            )
                            OR (
                                $3 = 'no-date'
                                AND COALESCE(
                                    ds.no_due_date_debt,
                                    0
                                ) > 0.009
                            )
                        )

                    ORDER BY
                        CASE
                            WHEN COALESCE(
                                ds.overdue_debt,
                                0
                            ) > 0.009
                            THEN 0
                            WHEN COALESCE(
                                ds.current_debt,
                                0
                            ) > 0.009
                            THEN 1
                            ELSE 2
                        END,
                        COALESCE(
                            ds.overdue_debt,
                            0
                        ) DESC,
                        COALESCE(
                            ds.current_debt,
                            0
                        ) DESC,
                        dc.last_name ASC,
                        dc.first_name ASC

                    LIMIT 1000
                `,
                [
                    search,
                    status,
                    deadline,
                ]
            )

        const summaryResult =
            await pool.query<SummaryRow>(
                `
                    WITH open_sales AS (
                        SELECT
                            ds.customer_id,
                            ds.due_date,

                            GREATEST(
                                ds.total
                                - ds.returned_total
                                - ds.paid_total
                                + ds.refunded_total,
                                0
                            ) AS outstanding

                        FROM debt_sales ds

                        WHERE
                            ds.status <> 'cancelled'
                            AND (
                                ds.total
                                - ds.returned_total
                                - ds.paid_total
                                + ds.refunded_total
                            ) > 0.009
                    ),

                    customer_totals AS (
                        SELECT
                            dc.id,
                            dc.is_active,
                            dc.credit_limit,

                            COALESCE(
                                SUM(
                                    os.outstanding
                                ),
                                0
                            ) AS current_debt,

                            COALESCE(
                                SUM(
                                    os.outstanding
                                ) FILTER (
                                    WHERE
                                        os.due_date IS NOT NULL
                                        AND os.due_date < CURRENT_DATE
                                ),
                                0
                            ) AS overdue_debt

                        FROM debt_customers dc

                        LEFT JOIN open_sales os
                            ON os.customer_id = dc.id

                        GROUP BY
                            dc.id,
                            dc.is_active,
                            dc.credit_limit
                    )

                    SELECT
                        COUNT(*)::int
                            AS customer_count,

                        COUNT(*) FILTER (
                            WHERE
                                current_debt > 0.009
                        )::int
                            AS customers_with_debt,

                        COUNT(*) FILTER (
                            WHERE
                                is_active = FALSE
                        )::int
                            AS blocked_customers,

                        COUNT(*) FILTER (
                            WHERE
                                overdue_debt > 0.009
                        )::int
                            AS overdue_customers,

                        COALESCE(
                            SUM(
                                credit_limit
                            ),
                            0
                        )::float
                            AS total_credit_limit,

                        COALESCE(
                            (
                                SELECT
                                    SUM(
                                        outstanding
                                    )
                                FROM open_sales
                            ),
                            0
                        )::float
                            AS total_outstanding,

                        COALESCE(
                            (
                                SELECT
                                    SUM(
                                        outstanding
                                    )
                                FROM open_sales
                                WHERE
                                    due_date IS NOT NULL
                                    AND due_date < CURRENT_DATE
                            ),
                            0
                        )::float
                            AS overdue_outstanding,

                        COALESCE(
                            (
                                SELECT
                                    SUM(
                                        outstanding
                                    )
                                FROM open_sales
                                WHERE
                                    due_date = CURRENT_DATE
                            ),
                            0
                        )::float
                            AS due_today_outstanding,

                        COALESCE(
                            (
                                SELECT
                                    SUM(
                                        outstanding
                                    )
                                FROM open_sales
                                WHERE
                                    due_date > CURRENT_DATE
                                    AND due_date <= CURRENT_DATE + 7
                            ),
                            0
                        )::float
                            AS due_soon_outstanding,

                        COALESCE(
                            (
                                SELECT
                                    SUM(
                                        outstanding
                                    )
                                FROM open_sales
                                WHERE
                                    due_date IS NULL
                            ),
                            0
                        )::float
                            AS no_due_date_outstanding

                    FROM customer_totals
                `
            )

        const byLocationResult =
            await pool.query<LocationDebtRow>(
                `
                    SELECT
                        l.id,
                        l.name,
                        l.slug,

                        COALESCE(
                            SUM(
                                GREATEST(
                                    ds.total
                                    - ds.returned_total
                                    - ds.paid_total
                                    + ds.refunded_total,
                                    0
                                )
                            ),
                            0
                        )::float AS outstanding,

                        COALESCE(
                            SUM(
                                GREATEST(
                                    ds.total
                                    - ds.returned_total
                                    - ds.paid_total
                                    + ds.refunded_total,
                                    0
                                )
                            ) FILTER (
                                WHERE
                                    ds.due_date IS NOT NULL
                                    AND ds.due_date < CURRENT_DATE
                                    AND (
                                        ds.total
                                        - ds.returned_total
                                        - ds.paid_total
                                        + ds.refunded_total
                                    ) > 0.009
                            ),
                            0
                        )::float AS overdue,

                        COUNT(
                            DISTINCT CASE
                                WHEN (
                                    ds.total
                                    - ds.returned_total
                                    - ds.paid_total
                                    + ds.refunded_total
                                ) > 0.009
                                THEN ds.customer_id
                                ELSE NULL
                            END
                        )::int AS customers,

                        COUNT(
                            DISTINCT CASE
                                WHEN
                                    ds.due_date IS NOT NULL
                                    AND ds.due_date < CURRENT_DATE
                                    AND (
                                        ds.total
                                        - ds.returned_total
                                        - ds.paid_total
                                        + ds.refunded_total
                                    ) > 0.009
                                THEN ds.customer_id
                                ELSE NULL
                            END
                        )::int AS overdue_customers,

                        COUNT(*) FILTER (
                            WHERE
                                ds.status <> 'cancelled'
                                AND (
                                    ds.total
                                    - ds.returned_total
                                    - ds.paid_total
                                    + ds.refunded_total
                                ) > 0.009
                        )::int AS documents

                    FROM locations l

                    LEFT JOIN debt_sales ds
                        ON ds.location_id = l.id
                        AND ds.status <> 'cancelled'

                    WHERE
                        l.type = 'store'
                        AND l.is_active = TRUE

                    GROUP BY
                        l.id,
                        l.name,
                        l.slug

                    ORDER BY
                        overdue DESC,
                        outstanding DESC,
                        l.name ASC
                `
            )

        const summary =
            summaryResult.rows[0]

        return NextResponse.json(
            {
                filters: {
                    search,
                    status,
                    deadline,
                },

                summary: {
                    customerCount:
                        Math.max(
                            0,
                            Math.floor(
                                toNumber(
                                    summary?.customer_count
                                )
                            )
                        ),

                    customersWithDebt:
                        Math.max(
                            0,
                            Math.floor(
                                toNumber(
                                    summary?.customers_with_debt
                                )
                            )
                        ),

                    blockedCustomers:
                        Math.max(
                            0,
                            Math.floor(
                                toNumber(
                                    summary?.blocked_customers
                                )
                            )
                        ),

                    overdueCustomers:
                        Math.max(
                            0,
                            Math.floor(
                                toNumber(
                                    summary?.overdue_customers
                                )
                            )
                        ),

                    totalCreditLimit:
                        roundMoney(
                            toNumber(
                                summary?.total_credit_limit
                            )
                        ),

                    totalOutstanding:
                        roundMoney(
                            toNumber(
                                summary?.total_outstanding
                            )
                        ),

                    overdueOutstanding:
                        roundMoney(
                            toNumber(
                                summary?.overdue_outstanding
                            )
                        ),

                    dueTodayOutstanding:
                        roundMoney(
                            toNumber(
                                summary?.due_today_outstanding
                            )
                        ),

                    dueSoonOutstanding:
                        roundMoney(
                            toNumber(
                                summary?.due_soon_outstanding
                            )
                        ),

                    noDueDateOutstanding:
                        roundMoney(
                            toNumber(
                                summary?.no_due_date_outstanding
                            )
                        ),
                },

                customers:
                    customersResult.rows.map(
                        row => {
                            const currentDebt =
                                roundMoney(
                                    toNumber(
                                        row.current_debt
                                    )
                                )

                            const creditLimit =
                                roundMoney(
                                    toNumber(
                                        row.credit_limit
                                    )
                                )

                            const overdueDebt =
                                roundMoney(
                                    toNumber(
                                        row.overdue_debt
                                    )
                                )

                            const oldestOverdue =
                                row.oldest_overdue_due_date

                            const oldestOverdueDelta =
                                daysBetweenToday(
                                    oldestOverdue
                                )

                            return {
                                id:
                                    Number(
                                        row.id
                                    ),

                                firstName:
                                row.first_name,

                                lastName:
                                row.last_name,

                                middleName:
                                    row.middle_name ||
                                    '',

                                fullName: [
                                    row.last_name,
                                    row.first_name,
                                    row.middle_name,
                                ]
                                    .filter(Boolean)
                                    .join(' '),

                                phone:
                                row.phone,

                                address:
                                row.address,

                                creditLimit,
                                currentDebt,

                                availableCredit:
                                    roundMoney(
                                        Math.max(
                                            0,
                                            creditLimit -
                                            currentDebt
                                        )
                                    ),

                                creditUsagePercent:
                                    creditLimit > 0
                                        ? Math.round(
                                            (
                                                currentDebt /
                                                creditLimit
                                            ) * 100
                                        )
                                        : (
                                            currentDebt >
                                            0
                                                ? 100
                                                : 0
                                        ),

                                isActive:
                                    Boolean(
                                        row.is_active
                                    ),

                                comment:
                                    row.comment ||
                                    '',

                                debtSaleCount:
                                    Math.max(
                                        0,
                                        Math.floor(
                                            toNumber(
                                                row.debt_sale_count
                                            )
                                        )
                                    ),

                                paymentCount:
                                    Math.max(
                                        0,
                                        Math.floor(
                                            toNumber(
                                                row.payment_count
                                            )
                                        )
                                    ),

                                returnCount:
                                    Math.max(
                                        0,
                                        Math.floor(
                                            toNumber(
                                                row.return_count
                                            )
                                        )
                                    ),

                                overdueDebt,

                                hasOverdueDebt:
                                    overdueDebt >
                                    0.009,

                                overdueDocumentCount:
                                    Math.max(
                                        0,
                                        Math.floor(
                                            toNumber(
                                                row.overdue_document_count
                                            )
                                        )
                                    ),

                                dueTodayDebt:
                                    roundMoney(
                                        toNumber(
                                            row.due_today_debt
                                        )
                                    ),

                                dueSoonDebt:
                                    roundMoney(
                                        toNumber(
                                            row.due_soon_debt
                                        )
                                    ),

                                noDueDateDebt:
                                    roundMoney(
                                        toNumber(
                                            row.no_due_date_debt
                                        )
                                    ),

                                nearestDueDate:
                                row.nearest_due_date,

                                oldestOverdueDueDate:
                                oldestOverdue,

                                daysUntilNearestDue:
                                    daysBetweenToday(
                                        row.nearest_due_date
                                    ),

                                daysOverdue:
                                    oldestOverdueDelta ===
                                    null
                                        ? 0
                                        : Math.max(
                                            0,
                                            -oldestOverdueDelta
                                        ),

                                lastActivityAt:
                                row.last_activity_at,
                            }
                        }
                    ),

                byLocation:
                    byLocationResult.rows.map(
                        row => ({
                            id:
                                Number(
                                    row.id
                                ),

                            name:
                            row.name,

                            slug:
                            row.slug,

                            outstanding:
                                roundMoney(
                                    toNumber(
                                        row.outstanding
                                    )
                                ),

                            overdue:
                                roundMoney(
                                    toNumber(
                                        row.overdue
                                    )
                                ),

                            customers:
                                Math.max(
                                    0,
                                    Math.floor(
                                        toNumber(
                                            row.customers
                                        )
                                    )
                                ),

                            overdueCustomers:
                                Math.max(
                                    0,
                                    Math.floor(
                                        toNumber(
                                            row.overdue_customers
                                        )
                                    )
                                ),

                            documents:
                                Math.max(
                                    0,
                                    Math.floor(
                                        toNumber(
                                            row.documents
                                        )
                                    )
                                ),
                        })
                    ),
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
            'GET /api/debts/admin/overview error:',
            error
        )

        return NextResponse.json(
            {
                message:
                    error instanceof Error
                        ? error.message
                        : 'Не удалось загрузить реестр долгов',
            },
            {
                status: 500,
            }
        )
    }
}

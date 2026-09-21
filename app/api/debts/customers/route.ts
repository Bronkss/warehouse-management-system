import {
    NextRequest,
    NextResponse,
} from 'next/server'

import { pool } from '@/app/lib/db'
import {
    getCustomerDebt,
    insertDebtEvent,
    normalizePhone,
    roundMoney,
    toNumber,
} from '@/app/lib/debts'
import { requireWarehouseSection } from '@/app/lib/serverWarehouseAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CustomerRow = {
    id: number | string
    firstName: string
    lastName: string
    middleName: string | null
    phone: string
    address: string
    creditLimit: number | string
    isActive: boolean
    comment: string | null
    currentDebt: number | string
    availableCredit: number | string
    overdueDebt: number | string
    nearestDueDate: string | null
    openWithoutDueDateDebt: number | string
    createdAt: string
    updatedAt: string
}

function mapCustomer(
    row: CustomerRow
) {
    return {
        id: Number(row.id),
        firstName: row.firstName,
        lastName: row.lastName,
        middleName: row.middleName || '',
        fullName: [
            row.lastName,
            row.firstName,
            row.middleName,
        ]
            .filter(Boolean)
            .join(' '),
        phone: row.phone,
        address: row.address,
        creditLimit: roundMoney(
            toNumber(row.creditLimit)
        ),
        currentDebt: roundMoney(
            toNumber(row.currentDebt)
        ),
        availableCredit: roundMoney(
            toNumber(row.availableCredit)
        ),
        isActive: Boolean(row.isActive),
        comment: row.comment || '',
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    }
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

        const url =
            new URL(request.url)

        const search =
            String(
                url.searchParams.get('search') || ''
            )
                .trim()
                .toLowerCase()

        const phoneSearch =
            normalizePhone(search)

        const result =
            await pool.query<CustomerRow>(
                `
                    SELECT
                        dc.id,
                        dc.first_name AS "firstName",
                        dc.last_name AS "lastName",
                        dc.middle_name AS "middleName",
                        dc.phone,
                        dc.address,
                        dc.credit_limit::float AS "creditLimit",
                        dc.is_active AS "isActive",
                        dc.comment,

                        COALESCE(
                            debt.current_debt,
                            0
                        )::float AS "currentDebt",

                        GREATEST(
                            dc.credit_limit
                            - COALESCE(
                                debt.current_debt,
                                0
                            ),
                            0
                        )::float AS "availableCredit",

                        COALESCE(
                            debt.overdue_debt,
                            0
                        )::float AS "overdueDebt",

                        debt.nearest_due_date
                            AS "nearestDueDate",

                        COALESCE(
                            debt.open_without_due_date_debt,
                            0
                        )::float AS "openWithoutDueDateDebt",

                        dc.created_at AS "createdAt",
                        dc.updated_at AS "updatedAt"

                    FROM debt_customers dc

                    LEFT JOIN LATERAL (
                        SELECT
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

                            MIN(
                                ds.due_date
                            ) FILTER (
                                WHERE
                                    ds.due_date IS NOT NULL
                                    AND (
                                        ds.total
                                        - ds.returned_total
                                        - ds.paid_total
                                        + ds.refunded_total
                                    ) > 0.009
                            ) AS nearest_due_date,

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
                            ) AS open_without_due_date_debt

                        FROM debt_sales ds
                        WHERE
                            ds.customer_id = dc.id
                            AND ds.status <> 'cancelled'
                    ) debt
                        ON TRUE

                    WHERE
                        $1 = ''
                        OR LOWER(
                            CONCAT_WS(
                                ' ',
                                dc.last_name,
                                dc.first_name,
                                dc.middle_name
                            )
                        ) LIKE '%' || $1 || '%'

                        OR LOWER(
                            dc.address
                        ) LIKE '%' || $1 || '%'

                        OR (
                            $2 <> ''
                            AND dc.phone_normalized
                                LIKE '%' || $2 || '%'
                        )

                    ORDER BY
                        CASE
                            WHEN COALESCE(
                                debt.current_debt,
                                0
                            ) > 0
                            THEN 0
                            ELSE 1
                        END ASC,
                        dc.last_name ASC,
                        dc.first_name ASC,
                        dc.id DESC

                    LIMIT 100
                `,
                [
                    search,
                    phoneSearch,
                ]
            )

        return NextResponse.json(
            {
                items:
                    result.rows.map(
                        mapCustomer
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
            'GET /api/debts/customers error:',
            error
        )

        return NextResponse.json(
            {
                message:
                    error instanceof Error
                        ? error.message
                        : 'Не удалось загрузить клиентов',
            },
            {
                status: 500,
            }
        )
    }
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
            await request.json()

        const firstName =
            String(
                body.firstName || ''
            ).trim()

        const lastName =
            String(
                body.lastName || ''
            ).trim()

        const middleName =
            String(
                body.middleName || ''
            ).trim()

        const phone =
            String(
                body.phone || ''
            ).trim()

        const phoneNormalized =
            normalizePhone(phone)

        const address =
            String(
                body.address || ''
            ).trim()

        const creditLimit =
            roundMoney(
                toNumber(
                    body.creditLimit,
                    NaN
                )
            )

        const comment =
            String(
                body.comment || ''
            ).trim()

        if (!firstName) {
            return NextResponse.json(
                {
                    message:
                        'Укажите имя клиента',
                },
                {
                    status: 400,
                }
            )
        }

        if (!lastName) {
            return NextResponse.json(
                {
                    message:
                        'Укажите фамилию клиента',
                },
                {
                    status: 400,
                }
            )
        }

        if (
            phoneNormalized.length < 10
        ) {
            return NextResponse.json(
                {
                    message:
                        'Укажите корректный номер телефона',
                },
                {
                    status: 400,
                }
            )
        }

        if (!address) {
            return NextResponse.json(
                {
                    message:
                        'Укажите адрес клиента',
                },
                {
                    status: 400,
                }
            )
        }

        if (
            !Number.isFinite(
                creditLimit
            ) ||
            creditLimit <= 0
        ) {
            return NextResponse.json(
                {
                    message:
                        'Кредитный лимит должен быть больше 0',
                },
                {
                    status: 400,
                }
            )
        }

        await client.query('BEGIN')

        const duplicate =
            await client.query(
                `
                    SELECT id
                    FROM debt_customers
                    WHERE
                        phone_normalized = $1
                        AND LOWER(first_name)
                            = LOWER($2)
                        AND LOWER(last_name)
                            = LOWER($3)
                    LIMIT 1
                    FOR UPDATE
                `,
                [
                    phoneNormalized,
                    firstName,
                    lastName,
                ]
            )

        if (
            duplicate.rows.length > 0
        ) {
            await client.query(
                'ROLLBACK'
            )

            return NextResponse.json(
                {
                    message:
                        'Клиент с таким именем, фамилией и телефоном уже существует',
                    customerId:
                        Number(
                            duplicate.rows[0].id
                        ),
                },
                {
                    status: 409,
                }
            )
        }

        const result =
            await client.query<{
                id: number | string
            }>(
                `
                    INSERT INTO debt_customers (
                        first_name,
                        last_name,
                        middle_name,
                        phone,
                        phone_normalized,
                        address,
                        credit_limit,
                        is_active,
                        comment,
                        created_by,
                        updated_by
                    )
                    VALUES (
                        $1,
                        $2,
                        NULLIF($3, ''),
                        $4,
                        $5,
                        $6,
                        $7,
                        TRUE,
                        NULLIF($8, ''),
                        $9,
                        $9
                    )
                    RETURNING id
                `,
                [
                    firstName,
                    lastName,
                    middleName,
                    phone,
                    phoneNormalized,
                    address,
                    creditLimit,
                    comment,
                    user.login,
                ]
            )

        const customerId =
            Number(
                result.rows[0].id
            )

        await insertDebtEvent(
            client,
            {
                customerId,
                eventType:
                    'customer_created',
                locationId:
                location.id,
                payload: {
                    firstName,
                    lastName,
                    middleName,
                    phone,
                    address,
                    creditLimit,
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

        const currentDebt =
            await getCustomerDebt(
                client,
                customerId
            )

        return NextResponse.json(
            {
                id: customerId,
                firstName,
                lastName,
                middleName,
                fullName: [
                    lastName,
                    firstName,
                    middleName,
                ]
                    .filter(Boolean)
                    .join(' '),
                phone,
                address,
                creditLimit,
                currentDebt,
                availableCredit:
                    roundMoney(
                        creditLimit
                        - currentDebt
                    ),
                isActive: true,
                comment,
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
            'POST /api/debts/customers error:',
            error
        )

        return NextResponse.json(
            {
                message:
                    error instanceof Error
                        ? error.message
                        : 'Не удалось создать клиента',
            },
            {
                status: 500,
            }
        )
    } finally {
        client.release()
    }
}

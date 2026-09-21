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

type RouteContext = {
    params:
        | Promise<{ id: string }>
        | { id: string }
}

async function getRouteParams(
    context: RouteContext
) {
    return await context.params
}

function parseCustomerId(
    rawId: string
): number {
    const id = Number(rawId)

    if (
        !Number.isInteger(id) ||
        id <= 0
    ) {
        throw new Error(
            'Некорректный идентификатор клиента'
        )
    }

    return id
}

export async function GET(
    request: NextRequest,
    context: RouteContext
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

        const { id: rawId } =
            await getRouteParams(context)

        const customerId =
            parseCustomerId(rawId)

        const customerResult =
            await pool.query(
                `
                    SELECT
                        dc.id,
                        dc.first_name AS "firstName",
                        dc.last_name AS "lastName",
                        COALESCE(
                            dc.middle_name,
                            ''
                        ) AS "middleName",
                        dc.phone,
                        dc.address,
                        dc.credit_limit::float
                            AS "creditLimit",
                        dc.is_active
                            AS "isActive",
                        COALESCE(
                            dc.comment,
                            ''
                        ) AS comment,
                        dc.created_at
                            AS "createdAt",
                        dc.updated_at
                            AS "updatedAt"
                    FROM debt_customers dc
                    WHERE dc.id = $1
                    LIMIT 1
                `,
                [customerId]
            )

        if (
            customerResult.rows.length === 0
        ) {
            return NextResponse.json(
                {
                    message:
                        'Клиент не найден',
                },
                {
                    status: 404,
                }
            )
        }

        const customer =
            customerResult.rows[0]

        const currentDebtResult =
            await pool.query<{
                debt: number | string
            }>(
                `
                    SELECT
                        COALESCE(
                            SUM(
                                GREATEST(
                                    total
                                    - returned_total
                                    - paid_total
                                    + refunded_total,
                                    0
                                )
                            ),
                            0
                        )::float AS debt
                    FROM debt_sales
                    WHERE
                        customer_id = $1
                        AND status <> 'cancelled'
                `,
                [customerId]
            )

        const debt =
            roundMoney(
                toNumber(
                    currentDebtResult
                        .rows[0]?.debt
                )
            )

        const salesResult =
            await pool.query(
                `
                    SELECT
                        ds.id,
                        ds.debt_number
                            AS "debtNumber",
                        ds.status,
                        ds.total::float
                            AS total,
                        ds.returned_total::float
                            AS "returnedTotal",
                        ds.paid_total::float
                            AS "paidTotal",

                        ds.refunded_total::float
                            AS "refundedTotal",

                        ds.due_date
                            AS "dueDate",

                        CASE
                            WHEN
                                ds.status <> 'cancelled'
                                AND ds.due_date IS NOT NULL
                                AND ds.due_date < CURRENT_DATE
                                AND (
                                    ds.total
                                    - ds.returned_total
                                    - ds.paid_total
                                    + ds.refunded_total
                                ) > 0.009
                            THEN TRUE
                            ELSE FALSE
                        END AS "isOverdue",

                        CASE
                            WHEN
                                ds.status <> 'cancelled'
                                AND ds.due_date IS NOT NULL
                                AND ds.due_date < CURRENT_DATE
                                AND (
                                    ds.total
                                    - ds.returned_total
                                    - ds.paid_total
                                    + ds.refunded_total
                                ) > 0.009
                            THEN (
                                CURRENT_DATE
                                - ds.due_date
                            )::int
                            ELSE 0
                        END AS "daysOverdue",

                        CASE
                            WHEN
                                ds.status <> 'cancelled'
                                AND ds.due_date IS NOT NULL
                                AND (
                                    ds.total
                                    - ds.returned_total
                                    - ds.paid_total
                                    + ds.refunded_total
                                ) > 0.009
                            THEN (
                                ds.due_date
                                - CURRENT_DATE
                            )::int
                            ELSE NULL
                        END AS "daysUntilDue",

                        GREATEST(
                            ds.total
                            - ds.returned_total
                            - ds.paid_total
                            + ds.refunded_total,
                            0
                        )::float
                            AS "remainingAmount",
                        COALESCE(
                            ds.comment,
                            ''
                        ) AS comment,
                        ds.cashier_name
                            AS "cashierName",
                        ds.cashier_login
                            AS "cashierLogin",
                        ds.created_at
                            AS "createdAt",
                        l.id
                            AS "locationId",
                        l.name
                            AS "locationName",
                        l.slug
                            AS "locationSlug",
                        COALESCE(
                            jsonb_agg(
                                jsonb_build_object(
                                    'id',
                                    dsi.id,
                                    'productId',
                                    dsi.product_id,
                                    'name',
                                    dsi.product_name,
                                    'barcode',
                                    dsi.barcode,
                                    'category',
                                    dsi.category,
                                    'unit',
                                    dsi.unit,
                                    'quantity',
                                    dsi.quantity::float,
                                    'returnedQuantity',
                                    dsi.returned_quantity::float,
                                    'availableToReturn',
                                    GREATEST(
                                        dsi.quantity
                                        - dsi.returned_quantity,
                                        0
                                    )::float,
                                    'purchasePrice',
                                    dsi.purchase_price::float,
                                    'sellingPrice',
                                    dsi.selling_price::float,
                                    'total',
                                    dsi.total::float,
                                    'marked',
                                    dsi.marked,
                                    'markingCode',
                                    dsi.marking_code,
                                    'markingStatus',
                                    dsi.marking_status,
                                    'markingMessage',
                                    dsi.marking_message,
                                    'markingPackageMode',
                                    dsi.marking_package_mode,
                                    'markingPackageQuantity',
                                    dsi.marking_package_quantity::float
                                )
                                ORDER BY
                                    dsi.id ASC
                            )
                            FILTER (
                                WHERE dsi.id IS NOT NULL
                            ),
                            '[]'::jsonb
                        ) AS items
                    FROM debt_sales ds
                    JOIN locations l
                        ON l.id = ds.location_id
                    LEFT JOIN debt_sale_items dsi
                        ON dsi.debt_sale_id = ds.id
                    WHERE
                        ds.customer_id = $1
                    GROUP BY
                        ds.id,
                        l.id,
                        l.name,
                        l.slug
                    ORDER BY
                        ds.created_at DESC,
                        ds.id DESC
                `,
                [customerId]
            )

        const paymentsResult =
            await pool.query(
                `
                    SELECT
                        dp.id,
                        dp.payment_number
                            AS "paymentNumber",
                        dp.payment_method
                            AS "paymentMethod",
                        dp.amount::float
                            AS amount,
                        COALESCE(
                            dp.comment,
                            ''
                        ) AS comment,
                        dp.cashier_name
                            AS "cashierName",
                        dp.cashier_login
                            AS "cashierLogin",
                        dp.created_at
                            AS "createdAt",
                        l.id
                            AS "locationId",
                        l.name
                            AS "locationName",
                        l.slug
                            AS "locationSlug",
                        COALESCE(
                            jsonb_agg(
                                jsonb_build_object(
                                    'debtSaleId',
                                    dpa.debt_sale_id,
                                    'debtNumber',
                                    ds.debt_number,
                                    'amount',
                                    dpa.amount::float
                                )
                                ORDER BY
                                    dpa.id ASC
                            )
                            FILTER (
                                WHERE dpa.id IS NOT NULL
                            ),
                            '[]'::jsonb
                        ) AS allocations
                    FROM debt_payments dp
                    JOIN locations l
                        ON l.id = dp.location_id
                    LEFT JOIN debt_payment_allocations dpa
                        ON dpa.payment_id = dp.id
                    LEFT JOIN debt_sales ds
                        ON ds.id = dpa.debt_sale_id
                    WHERE
                        dp.customer_id = $1
                    GROUP BY
                        dp.id,
                        l.id,
                        l.name,
                        l.slug
                    ORDER BY
                        dp.created_at DESC,
                        dp.id DESC
                `,
                [customerId]
            )

        const returnsResult =
            await pool.query(
                `
                    SELECT
                        dr.id,
                        dr.return_number
                            AS "returnNumber",
                        dr.debt_sale_id
                            AS "debtSaleId",
                        ds.debt_number
                            AS "debtNumber",
                        dr.total::float
                            AS total,
                        COALESCE(
                            dr.comment,
                            ''
                        ) AS comment,
                        dr.cashier_name
                            AS "cashierName",
                        dr.cashier_login
                            AS "cashierLogin",
                        dr.created_at
                            AS "createdAt",
                        l.id
                            AS "locationId",
                        l.name
                            AS "locationName",
                        l.slug
                            AS "locationSlug",
                        COALESCE(
                            jsonb_agg(
                                jsonb_build_object(
                                    'id',
                                    dri.id,
                                    'debtSaleItemId',
                                    dri.debt_sale_item_id,
                                    'productId',
                                    dri.product_id,
                                    'productName',
                                    dsi.product_name,
                                    'unit',
                                    dsi.unit,
                                    'quantity',
                                    dri.quantity::float,
                                    'sellingPrice',
                                    dri.selling_price::float,
                                    'total',
                                    dri.total::float
                                )
                                ORDER BY
                                    dri.id ASC
                            )
                            FILTER (
                                WHERE dri.id IS NOT NULL
                            ),
                            '[]'::jsonb
                        ) AS items
                    FROM debt_returns dr
                    JOIN debt_sales ds
                        ON ds.id = dr.debt_sale_id
                    JOIN locations l
                        ON l.id = dr.location_id
                    LEFT JOIN debt_return_items dri
                        ON dri.debt_return_id = dr.id
                    LEFT JOIN debt_sale_items dsi
                        ON dsi.id = dri.debt_sale_item_id
                    WHERE
                        dr.customer_id = $1
                    GROUP BY
                        dr.id,
                        ds.debt_number,
                        l.id,
                        l.name,
                        l.slug
                    ORDER BY
                        dr.created_at DESC,
                        dr.id DESC
                `,
                [customerId]
            )

        const refundsResult =
            await pool.query(
                `
                    SELECT
                        drf.id,

                        drf.refund_number
                            AS "refundNumber",

                        drf.debt_return_id
                            AS "debtReturnId",

                        dr.return_number
                            AS "returnNumber",

                        drf.debt_sale_id
                            AS "debtSaleId",

                        ds.debt_number
                            AS "debtNumber",

                        drf.payment_method
                            AS "paymentMethod",

                        drf.amount::float
                            AS amount,

                        drf.reason,

                        drf.cashier_name
                            AS "cashierName",

                        drf.cashier_login
                            AS "cashierLogin",

                        drf.created_at
                            AS "createdAt",

                        l.id
                            AS "locationId",

                        l.name
                            AS "locationName",

                        l.slug
                            AS "locationSlug"

                    FROM debt_refunds drf

                    JOIN debt_returns dr
                        ON dr.id =
                            drf.debt_return_id

                    JOIN debt_sales ds
                        ON ds.id =
                            drf.debt_sale_id

                    JOIN locations l
                        ON l.id =
                            drf.location_id

                    WHERE
                        drf.customer_id = $1

                    ORDER BY
                        drf.created_at DESC,
                        drf.id DESC
                `,
                [
                    customerId,
                ]
            )

        const eventsResult =
            await pool.query(
                `
                    SELECT
                        de.id,
                        de.event_type
                            AS "eventType",
                        de.debt_sale_id
                            AS "debtSaleId",
                        ds.debt_number
                            AS "debtNumber",
                        de.payment_id
                            AS "paymentId",
                        dp.payment_number
                            AS "paymentNumber",
                        de.return_id
                            AS "returnId",
                        dr.return_number
                            AS "returnNumber",
                        de.refund_id
                            AS "refundId",
                        drf.refund_number
                            AS "refundNumber",
                        de.amount::float
                            AS amount,
                        de.payload,
                        de.created_by
                            AS "createdBy",
                        de.created_by_name
                            AS "createdByName",
                        de.created_at
                            AS "createdAt",
                        l.name
                            AS "locationName",
                        l.slug
                            AS "locationSlug"
                    FROM debt_events de
                    LEFT JOIN debt_sales ds
                        ON ds.id = de.debt_sale_id
                    LEFT JOIN debt_payments dp
                        ON dp.id = de.payment_id
                    LEFT JOIN debt_returns dr
                        ON dr.id = de.return_id
                    LEFT JOIN debt_refunds drf
                        ON drf.id = de.refund_id
                    LEFT JOIN locations l
                        ON l.id = de.location_id
                    WHERE
                        de.customer_id = $1
                    ORDER BY
                        de.created_at DESC,
                        de.id DESC
                    LIMIT 300
                `,
                [customerId]
            )

        const creditLimit =
            roundMoney(
                toNumber(
                    customer.creditLimit
                )
            )

        return NextResponse.json(
            {
                customer: {
                    id:
                        Number(customer.id),
                    firstName:
                    customer.firstName,
                    lastName:
                    customer.lastName,
                    middleName:
                    customer.middleName,
                    fullName: [
                        customer.lastName,
                        customer.firstName,
                        customer.middleName,
                    ]
                        .filter(Boolean)
                        .join(' '),
                    phone:
                    customer.phone,
                    address:
                    customer.address,
                    creditLimit,
                    currentDebt:
                    debt,
                    availableCredit:
                        roundMoney(
                            Math.max(
                                0,
                                creditLimit - debt
                            )
                        ),
                    isActive:
                        Boolean(
                            customer.isActive
                        ),
                    comment:
                    customer.comment,
                    createdAt:
                    customer.createdAt,
                    updatedAt:
                    customer.updatedAt,
                },
                sales:
                salesResult.rows,
                payments:
                paymentsResult.rows,
                returns:
                returnsResult.rows,
                refunds:
                refundsResult.rows,
                events:
                eventsResult.rows,
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
            'GET /api/debts/customers/[id] error:',
            error
        )

        return NextResponse.json(
            {
                message:
                    error instanceof Error
                        ? error.message
                        : 'Не удалось открыть карточку клиента',
            },
            {
                status: 500,
            }
        )
    }
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
                'sales'
            )

        if (!access.ok) {
            return access.response
        }

        const {
            location,
            user,
        } = access.context

        const { id: rawId } =
            await getRouteParams(context)

        const customerId =
            parseCustomerId(rawId)

        const body =
            await request.json()

        await client.query('BEGIN')

        const currentResult =
            await client.query(
                `
                    SELECT *
                    FROM debt_customers
                    WHERE id = $1
                    FOR UPDATE
                `,
                [customerId]
            )

        if (
            currentResult.rows.length === 0
        ) {
            await client.query(
                'ROLLBACK'
            )

            return NextResponse.json(
                {
                    message:
                        'Клиент не найден',
                },
                {
                    status: 404,
                }
            )
        }

        const current =
            currentResult.rows[0]

        const firstName =
            body.firstName === undefined
                ? String(current.first_name)
                : String(
                    body.firstName || ''
                ).trim()

        const lastName =
            body.lastName === undefined
                ? String(current.last_name)
                : String(
                    body.lastName || ''
                ).trim()

        const middleName =
            body.middleName === undefined
                ? String(
                    current.middle_name || ''
                )
                : String(
                    body.middleName || ''
                ).trim()

        const phone =
            body.phone === undefined
                ? String(current.phone)
                : String(
                    body.phone || ''
                ).trim()

        const phoneNormalized =
            normalizePhone(phone)

        const address =
            body.address === undefined
                ? String(current.address)
                : String(
                    body.address || ''
                ).trim()

        const creditLimit =
            body.creditLimit === undefined
                ? roundMoney(
                    toNumber(
                        current.credit_limit
                    )
                )
                : roundMoney(
                    toNumber(
                        body.creditLimit,
                        NaN
                    )
                )

        const isActive =
            body.isActive === undefined
                ? Boolean(
                    current.is_active
                )
                : Boolean(
                    body.isActive
                )

        const comment =
            body.comment === undefined
                ? String(
                    current.comment || ''
                )
                : String(
                    body.comment || ''
                ).trim()

        if (
            !firstName ||
            !lastName
        ) {
            throw new Error(
                'Имя и фамилия обязательны'
            )
        }

        if (
            phoneNormalized.length < 10
        ) {
            throw new Error(
                'Укажите корректный номер телефона'
            )
        }

        if (!address) {
            throw new Error(
                'Адрес клиента обязателен'
            )
        }

        if (
            !Number.isFinite(
                creditLimit
            ) ||
            creditLimit < 0
        ) {
            throw new Error(
                'Некорректный кредитный лимит'
            )
        }

        const duplicate =
            await client.query(
                `
                    SELECT id
                    FROM debt_customers
                    WHERE
                        id <> $1
                        AND phone_normalized = $2
                        AND LOWER(first_name)
                            = LOWER($3)
                        AND LOWER(last_name)
                            = LOWER($4)
                    LIMIT 1
                `,
                [
                    customerId,
                    phoneNormalized,
                    firstName,
                    lastName,
                ]
            )

        if (
            duplicate.rows.length > 0
        ) {
            throw new Error(
                'Другой клиент с таким именем, фамилией и телефоном уже существует'
            )
        }

        const debt =
            await getCustomerDebt(
                client,
                customerId
            )

        if (
            creditLimit + 0.009
            < debt
        ) {
            throw new Error(
                `Нельзя установить лимит ниже текущего долга: ${debt.toFixed(2)} ₽`
            )
        }

        await client.query(
            `
                UPDATE debt_customers
                SET
                    first_name = $2,
                    last_name = $3,
                    middle_name = NULLIF($4, ''),
                    phone = $5,
                    phone_normalized = $6,
                    address = $7,
                    credit_limit = $8,
                    is_active = $9,
                    comment = NULLIF($10, ''),
                    updated_by = $11,
                    updated_at = NOW()
                WHERE id = $1
            `,
            [
                customerId,
                firstName,
                lastName,
                middleName,
                phone,
                phoneNormalized,
                address,
                creditLimit,
                isActive,
                comment,
                user.login,
            ]
        )

        await insertDebtEvent(
            client,
            {
                customerId,
                eventType:
                    'customer_updated',
                locationId:
                location.id,
                payload: {
                    before: {
                        firstName:
                        current.first_name,
                        lastName:
                        current.last_name,
                        middleName:
                        current.middle_name,
                        phone:
                        current.phone,
                        address:
                        current.address,
                        creditLimit:
                            toNumber(
                                current.credit_limit
                            ),
                        isActive:
                            Boolean(
                                current.is_active
                            ),
                        comment:
                        current.comment,
                    },
                    after: {
                        firstName,
                        lastName,
                        middleName,
                        phone,
                        address,
                        creditLimit,
                        isActive,
                        comment,
                    },
                },
                createdBy:
                user.login,
                createdByName:
                user.name,
            }
        )

        await client.query('COMMIT')

        return NextResponse.json(
            {
                ok: true,
                customer: {
                    id:
                    customerId,
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
                    currentDebt:
                    debt,
                    availableCredit:
                        roundMoney(
                            Math.max(
                                0,
                                creditLimit - debt
                            )
                        ),
                    isActive,
                    comment,
                },
            }
        )
    } catch (error) {
        await client
            .query('ROLLBACK')
            .catch(
                () => undefined
            )

        console.error(
            'PATCH /api/debts/customers/[id] error:',
            error
        )

        return NextResponse.json(
            {
                message:
                    error instanceof Error
                        ? error.message
                        : 'Не удалось изменить клиента',
            },
            {
                status: 500,
            }
        )
    } finally {
        client.release()
    }
}

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

type SaleItemInput = {
    productId: number | string
    name: string
    barcode?: string
    category?: string
    unit?: string
    quantity: number
    price: number
    total: number
}

type PaymentMethod =
    | 'card'
    | 'cash'
    | 'transfer'
    | 'mixed'

type PaymentBreakdown = {
    cashAmount: number
    cardAmount: number
    transferAmount: number
}

type StockMovementDraft = {
    productId: number
    quantityDelta: number
    stockAfter: number
    comment: string
}

const PAYMENT_LABELS:
    Record<
        PaymentMethod,
        string
    > = {
    card: 'Карта',
    cash: 'Наличные',
    transfer: 'Перевод',
    mixed: 'Смешанная',
}

const PAYMENT_METHODS =
    new Set<PaymentMethod>([
        'card',
        'cash',
        'transfer',
        'mixed',
    ])

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

function toMoney(
    value: unknown
): number {
    const parsed =
        Number(
            String(
                value ?? 0
            )
                .replace(',', '.')
                .replace(/\s/g, '')
        )

    return Number.isFinite(
        parsed
    )
        ? roundMoney(
            parsed
        )
        : 0
}

const createReceiptNumber = () => {
    const now =
        new Date()

    const date =
        now
            .toISOString()
            .slice(0, 10)
            .replaceAll('-', '')

    const time =
        String(
            now.getTime()
        ).slice(-6)

    return `${date}-${time}`
}

const isPaymentMethod = (
    value: unknown
): value is PaymentMethod => {
    return (
        typeof value ===
        'string' &&
        PAYMENT_METHODS.has(
            value as PaymentMethod
        )
    )
}

const isWeightUnit = (
    value: unknown
): boolean => {
    return (
        String(
            value || ''
        )
            .trim()
            .toLowerCase() ===
        'weight'
    )
}

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

function resolvePaymentBreakdown(
    paymentMethod: PaymentMethod,
    total: number,
    body: Record<string, unknown>
): PaymentBreakdown {
    if (
        paymentMethod ===
        'cash'
    ) {
        return {
            cashAmount:
            total,

            cardAmount:
                0,

            transferAmount:
                0,
        }
    }

    if (
        paymentMethod ===
        'card'
    ) {
        return {
            cashAmount:
                0,

            cardAmount:
            total,

            transferAmount:
                0,
        }
    }

    if (
        paymentMethod ===
        'transfer'
    ) {
        return {
            cashAmount:
                0,

            cardAmount:
                0,

            transferAmount:
            total,
        }
    }

    const cashAmount =
        toMoney(
            body.cashAmount
        )

    const cardAmount =
        toMoney(
            body.cardAmount
        )

    const transferAmount =
        toMoney(
            body.transferAmount
        )

    if (
        cashAmount < 0 ||
        cardAmount < 0 ||
        transferAmount < 0
    ) {
        throw new Error(
            'Части смешанной оплаты не могут быть отрицательными'
        )
    }

    const positiveParts = [
        cashAmount,
        cardAmount,
        transferAmount,
    ].filter(
        amount =>
            amount > 0.009
    ).length

    if (
        positiveParts < 2
    ) {
        throw new Error(
            'Смешанная оплата должна содержать минимум два способа оплаты'
        )
    }

    const breakdownTotal =
        roundMoney(
            cashAmount +
            cardAmount +
            transferAmount
        )

    if (
        Math.abs(
            breakdownTotal -
            total
        ) > 0.01
    ) {
        throw new Error(
            `Сумма частей оплаты ${breakdownTotal.toFixed(2)} ₽ не совпадает с суммой чека ${total.toFixed(2)} ₽`
        )
    }

    return {
        cashAmount,
        cardAmount,
        transferAmount,
    }
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
        } =
            access.context

        const result =
            await pool.query(
                `
                    SELECT
                        r.id,

                        r.client_receipt_id
                            AS "clientReceiptId",

                        r.receipt_number
                            AS "receiptNumber",

                        r.created_at
                            AS "createdAt",

                        r.payment_method
                            AS "paymentMethod",

                        r.payment_label
                            AS "paymentLabel",

                        r.total::float
                            AS total,

                        r.received_amount::float
                            AS "receivedAmount",

                        r.change_amount::float
                            AS change,

                        r.cash_amount::float
                            AS "cashAmount",

                        r.card_amount::float
                            AS "cardAmount",

                        r.transfer_amount::float
                            AS "transferAmount",

                        r.items,

                        COALESCE(
                            r.cashier_name,
                            ''
                        ) AS "cashierName",

                        COALESCE(
                            r.cashier_login,
                            ''
                        ) AS "cashierLogin",

                        l.name
                            AS "locationName",

                        l.slug
                            AS "locationSlug"

                    FROM receipts r

                    JOIN locations l
                        ON l.id =
                            r.location_id

                    WHERE
                        r.location_id = $1

                    ORDER BY
                        r.created_at DESC
                `,
                [
                    location.id,
                ]
            )

        return NextResponse.json(
            result.rows,
            {
                headers: {
                    'Cache-Control':
                        'private, no-store',
                },
            }
        )
    } catch (error) {
        console.error(
            'GET /api/sales error:',
            error
        )

        return NextResponse.json(
            {
                message:
                    'Ошибка получения чеков',
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

    let locationIdForIdempotency:
        number |
        null = null

    let clientReceiptIdForIdempotency:
        string |
        null = null

    try {
        const body =
            await request.json() as
                Record<string, unknown>

        const clientReceiptId =
            String(
                body.id ||
                body.clientReceiptId ||
                ''
            ).trim() ||
            null

        const items =
            (
                Array.isArray(
                    body.items
                )
                    ? body.items
                    : []
            ) as SaleItemInput[]

        const paymentMethod =
            body.paymentMethod

        const total =
            roundMoney(
                Number(
                    body.total
                )
            )

        const receivedAmount =
            body.receivedAmount ===
            undefined
                ? null
                : Number(
                    body.receivedAmount
                )

        const change =
            body.change ===
            undefined
                ? null
                : Number(
                    body.change
                )

        if (
            !Array.isArray(
                items
            ) ||
            items.length === 0
        ) {
            return NextResponse.json(
                {
                    message:
                        'Чек не может быть пустым',
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

        if (
            !Number.isFinite(
                total
            ) ||
            total <= 0
        ) {
            return NextResponse.json(
                {
                    message:
                        'Некорректная сумма чека',
                },
                {
                    status: 400,
                }
            )
        }

        if (
            paymentMethod ===
            'cash' &&
            (
                receivedAmount ===
                null ||
                !Number.isFinite(
                    receivedAmount
                ) ||
                receivedAmount <
                total
            )
        ) {
            return NextResponse.json(
                {
                    message:
                        'Полученная сумма меньше суммы чека',
                },
                {
                    status: 400,
                }
            )
        }

        const paymentBreakdown =
            resolvePaymentBreakdown(
                paymentMethod,
                total,
                body
            )

        await client.query(
            'BEGIN'
        )

        const access =
            await requireWarehouseSection(
                client,
                request,
                'sales'
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

        locationIdForIdempotency =
            location.id

        clientReceiptIdForIdempotency =
            clientReceiptId

        if (clientReceiptId) {
            const existingReceipt =
                await client.query(
                    `
                        SELECT
                            r.id,

                            r.client_receipt_id
                                AS "clientReceiptId",

                            r.receipt_number
                                AS "receiptNumber",

                            r.created_at
                                AS "createdAt",

                            r.payment_method
                                AS "paymentMethod",

                            r.payment_label
                                AS "paymentLabel",

                            r.total::float
                                AS total,

                            r.received_amount::float
                                AS "receivedAmount",

                            r.change_amount::float
                                AS change,

                            r.cash_amount::float
                                AS "cashAmount",

                            r.card_amount::float
                                AS "cardAmount",

                            r.transfer_amount::float
                                AS "transferAmount",

                            r.items,

                            COALESCE(
                                r.cashier_name,
                                ''
                            ) AS "cashierName",

                            COALESCE(
                                r.cashier_login,
                                ''
                            ) AS "cashierLogin"

                        FROM receipts r

                        WHERE
                            r.location_id = $1
                            AND r.client_receipt_id = $2

                        LIMIT 1
                    `,
                    [
                        location.id,
                        clientReceiptId,
                    ]
                )

            if (
                existingReceipt.rows.length >
                0
            ) {
                await client.query(
                    'COMMIT'
                )

                return NextResponse.json(
                    {
                        ...existingReceipt.rows[0],

                        locationName:
                        location.name,

                        locationSlug:
                        location.slug,

                        idempotent:
                            true,
                    },
                    {
                        status:
                            200,
                    }
                )
            }
        }

        const stockMovements:
            StockMovementDraft[] = []

        for (
            const item
            of items
            ) {
            const productId =
                Number(
                    item.productId
                )

            const quantity =
                Number(
                    item.quantity
                )

            if (
                !Number.isFinite(
                    productId
                ) ||
                !Number.isFinite(
                    quantity
                ) ||
                quantity <= 0
            ) {
                throw new Error(
                    `Некорректная позиция чека: ${item.name}`
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
                            ON ps.product_id =
                                p.id

                            AND ps.location_id =
                                $2

                        WHERE
                            p.id = $1

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
                    `Товар «${item.name}» не найден в БД`
                )
            }

            const product =
                productResult.rows[0]

            const currentStock =
                Number(
                    product.stock
                )

            const allowNegativeStock =
                isWeightUnit(
                    product.unit
                ) ||
                isWeightUnit(
                    item.unit
                )

            if (
                !allowNegativeStock &&
                currentStock <
                quantity
            ) {
                throw new Error(
                    `Недостаточно остатка в зоне «${location.name}»: «${product.name}». В наличии ${currentStock}, в чеке ${quantity}`
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

            stockMovements.push(
                {
                    productId,
                    quantityDelta:
                        -quantity,
                    stockAfter:
                    nextStock,
                    comment:
                        `Продажа из зоны ${location.name}`,
                }
            )
        }

        const receiptNumber =
            createReceiptNumber()

        const paymentLabel =
            PAYMENT_LABELS[
                paymentMethod
                ]

        const storedReceivedAmount =
            paymentMethod ===
            'cash' &&
            receivedAmount !==
            null
                ? receivedAmount
                : total

        const storedChange =
            paymentMethod ===
            'cash' &&
            change !==
            null
                ? change
                : 0

        const receiptResult =
            await client.query(
                `
                    INSERT INTO receipts (
                        receipt_number,
                        location_id,
                        client_receipt_id,

                        payment_method,
                        payment_label,

                        total,
                        received_amount,
                        change_amount,

                        cash_amount,
                        card_amount,
                        transfer_amount,

                        items,

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
                        $10,
                        $11,

                        $12,

                        $13,
                        $14
                    )
                    RETURNING
                        id,

                        client_receipt_id
                            AS "clientReceiptId",

                        receipt_number
                            AS "receiptNumber",

                        created_at
                            AS "createdAt",

                        payment_method
                            AS "paymentMethod",

                        payment_label
                            AS "paymentLabel",

                        total::float
                            AS total,

                        received_amount::float
                            AS "receivedAmount",

                        change_amount::float
                            AS change,

                        cash_amount::float
                            AS "cashAmount",

                        card_amount::float
                            AS "cardAmount",

                        transfer_amount::float
                            AS "transferAmount",

                        items,

                        COALESCE(
                            cashier_name,
                            ''
                        ) AS "cashierName",

                        COALESCE(
                            cashier_login,
                            ''
                        ) AS "cashierLogin"
                `,
                [
                    receiptNumber,
                    location.id,
                    clientReceiptId,

                    paymentMethod,
                    paymentLabel,

                    total,
                    storedReceivedAmount,
                    storedChange,

                    paymentBreakdown.cashAmount,
                    paymentBreakdown.cardAmount,
                    paymentBreakdown.transferAmount,

                    JSON.stringify(
                        items
                    ),

                    user.name,
                    user.login,
                ]
            )

        const savedReceipt =
            receiptResult.rows[0]

        const receiptId =
            Number(
                savedReceipt.id
            )

        for (
            const movement
            of stockMovements
            ) {
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

                        'sale',
                        $3,
                        $4,

                        'receipt',
                        $5,

                        $6,
                        $7
                    )
                `,
                [
                    movement.productId,
                    location.id,
                    movement.quantityDelta,
                    movement.stockAfter,
                    receiptId,
                    movement.comment,
                    user.login,
                ]
            )
        }

        await client.query(
            'COMMIT'
        )

        return NextResponse.json(
            {
                ...savedReceipt,

                locationName:
                location.name,

                locationSlug:
                location.slug,
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

        if (
            error &&
            typeof error ===
            'object' &&
            'code' in error &&
            String(
                (
                    error as {
                        code?: unknown
                    }
                ).code ||
                ''
            ) ===
            '23505' &&
            locationIdForIdempotency !==
            null &&
            clientReceiptIdForIdempotency
        ) {
            const duplicate =
                await pool.query(
                    `
                        SELECT
                            r.id,

                            r.client_receipt_id
                                AS "clientReceiptId",

                            r.receipt_number
                                AS "receiptNumber",

                            r.created_at
                                AS "createdAt",

                            r.payment_method
                                AS "paymentMethod",

                            r.payment_label
                                AS "paymentLabel",

                            r.total::float
                                AS total,

                            r.received_amount::float
                                AS "receivedAmount",

                            r.change_amount::float
                                AS change,

                            r.cash_amount::float
                                AS "cashAmount",

                            r.card_amount::float
                                AS "cardAmount",

                            r.transfer_amount::float
                                AS "transferAmount",

                            r.items,

                            COALESCE(
                                r.cashier_name,
                                ''
                            ) AS "cashierName",

                            COALESCE(
                                r.cashier_login,
                                ''
                            ) AS "cashierLogin",

                            l.name
                                AS "locationName",

                            l.slug
                                AS "locationSlug"

                        FROM receipts r

                        JOIN locations l
                            ON l.id =
                                r.location_id

                        WHERE
                            r.location_id = $1
                            AND r.client_receipt_id = $2

                        LIMIT 1
                    `,
                    [
                        locationIdForIdempotency,
                        clientReceiptIdForIdempotency,
                    ]
                )

            if (
                duplicate.rows.length >
                0
            ) {
                return NextResponse.json(
                    {
                        ...duplicate.rows[0],
                        idempotent:
                            true,
                    },
                    {
                        status:
                            200,
                    }
                )
            }
        }

        console.error(
            'POST /api/sales error:',
            error
        )

        return NextResponse.json(
            {
                message:
                    error instanceof Error
                        ? error.message
                        : 'Ошибка сохранения продажи',
            },
            {
                status: 500,
            }
        )
    } finally {
        client.release()
    }
}

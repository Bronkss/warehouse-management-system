import {
    NextRequest,
    NextResponse,
} from 'next/server'

import { pool } from '@/app/lib/db'
import {
    canDebtProductGoNegative,
    ensureProductStockRow,
    getCustomerDebt,
    insertDebtEvent,
    nextDebtSaleNumber,
    roundMoney,
    roundQuantity,
    syncLegacyTochkaStock,
    toNumber,
} from '@/app/lib/debts'
import { requireWarehouseSection } from '@/app/lib/serverWarehouseAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type DebtSaleItemInput = {
    productId:
        | number
        | string
    quantity:
        | number
        | string
    price:
        | number
        | string
    markingCode?: string
    markingStatus?: string
    markingMessage?: string
    markingPackageMode?: string
    markingPackageQuantity?:
        | number
        | string
}

type DebtSaleBody = {
    customerId?:
        | number
        | string
    items?:
        DebtSaleItemInput[]
    comment?: string
    dueDate?: string
}

type PreparedItem = {
    productId: number
    quantity: number
    price: number
    markingCode: string
    markingStatus: string
    markingMessage: string
    markingPackageMode: string
    markingPackageQuantity:
        | number
        | null
}


function normalizeDueDate(
    value: unknown
): string {
    const raw =
        String(
            value || ''
        ).trim()

    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
            raw
        )
    ) {
        throw new Error(
            'Укажите срок погашения долга'
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

function prepareItems(
    rawItems: unknown
): PreparedItem[] {
    if (
        !Array.isArray(rawItems) ||
        rawItems.length === 0
    ) {
        throw new Error(
            'Добавьте товары в долг'
        )
    }

    return rawItems.map(
        (
            rawItem,
            index
        ) => {
            const item =
                rawItem as DebtSaleItemInput

            const productId =
                Number(item.productId)

            const quantity =
                roundQuantity(
                    toNumber(
                        item.quantity,
                        NaN
                    )
                )

            const price =
                roundMoney(
                    toNumber(
                        item.price,
                        NaN
                    )
                )

            if (
                !Number.isInteger(
                    productId
                ) ||
                productId <= 0
            ) {
                throw new Error(
                    `Строка ${index + 1}: некорректный товар`
                )
            }

            if (
                !Number.isFinite(
                    quantity
                ) ||
                quantity <= 0
            ) {
                throw new Error(
                    `Строка ${index + 1}: некорректное количество`
                )
            }

            if (
                !Number.isFinite(price) ||
                price < 0
            ) {
                throw new Error(
                    `Строка ${index + 1}: некорректная цена`
                )
            }

            const packageQuantity =
                item.markingPackageQuantity === undefined
                    ? null
                    : roundQuantity(
                        toNumber(
                            item.markingPackageQuantity,
                            0
                        )
                    )

            return {
                productId,
                quantity,
                price,
                markingCode:
                    String(
                        item.markingCode || ''
                    ).trim(),
                markingStatus:
                    String(
                        item.markingStatus || ''
                    ).trim(),
                markingMessage:
                    String(
                        item.markingMessage || ''
                    ).trim(),
                markingPackageMode:
                    String(
                        item.markingPackageMode || ''
                    ).trim(),
                markingPackageQuantity:
                    packageQuantity &&
                    packageQuantity > 0
                        ? packageQuantity
                        : null,
            }
        }
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
            ) as DebtSaleBody

        const customerId =
            Number(body.customerId)

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

        const dueDate =
            normalizeDueDate(
                body.dueDate
            )

        const preparedItems =
            prepareItems(body.items)

        const requestedTotal =
            roundMoney(
                preparedItems.reduce(
                    (
                        sum,
                        item
                    ) =>
                        sum +
                        item.price
                        * item.quantity,
                    0
                )
            )

        if (
            requestedTotal <= 0
        ) {
            return NextResponse.json(
                {
                    message:
                        'Сумма долга должна быть больше 0',
                },
                {
                    status: 400,
                }
            )
        }

        const comment =
            String(
                body.comment || ''
            ).trim()

        const dueDateCheck =
            await client.query<{
                isPast: boolean
            }>(
                `
                    SELECT
                        ($1::date < CURRENT_DATE)
                            AS "isPast"
                `,
                [
                    dueDate,
                ]
            )

        if (
            Boolean(
                dueDateCheck.rows[0]
                    ?.isPast
            )
        ) {
            return NextResponse.json(
                {
                    message:
                        'Срок погашения не может быть раньше сегодняшней даты',
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
                            AS credit_limit,
                        is_active
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

        if (
            !Boolean(
                customer.is_active
            )
        ) {
            throw new Error(
                'Карточка клиента заблокирована. Выдача товара в долг запрещена.'
            )
        }

        const previousDebt =
            await getCustomerDebt(
                client,
                customerId
            )

        const creditLimit =
            roundMoney(
                toNumber(
                    customer.credit_limit
                )
            )

        const debtNumber =
            await nextDebtSaleNumber(
                client
            )

        const saleResult =
            await client.query<{
                id: number | string
                createdAt: string
            }>(
                `
                    INSERT INTO debt_sales (
                        debt_number,
                        customer_id,
                        location_id,
                        status,
                        total,
                        returned_total,
                        paid_total,
                        due_date,
                        comment,
                        cashier_name,
                        cashier_login
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        'active',
                        $4,
                        0,
                        0,
                        $5::date,
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
                    debtNumber,
                    customerId,
                    location.id,
                    requestedTotal,
                    dueDate,
                    comment,
                    user.name,
                    user.login,
                ]
            )

        const debtSaleId =
            Number(
                saleResult.rows[0].id
            )

        const responseItems:
            Array<Record<string, unknown>> =
            []

        for (
            let index = 0;
            index < preparedItems.length;
            index += 1
        ) {
            const item =
                preparedItems[index]

            await ensureProductStockRow(
                client,
                item.productId,
                location.id
            )

            const productResult =
                await client.query(
                    `
                        SELECT
                            p.id,
                            p.name,
                            p.category,
                            p.barcode,
                            p.purchase_price::float
                                AS purchase_price,
                            p.selling_price::float
                                AS current_selling_price,
                            p.unit,
                            COALESCE(
                                p.marked,
                                FALSE
                            ) AS marked,
                            ps.stock::float
                                AS stock
                        FROM products p
                        JOIN product_stocks ps
                            ON ps.product_id = p.id
                            AND ps.location_id = $2
                        WHERE
                            p.id = $1
                        FOR UPDATE OF ps
                    `,
                    [
                        item.productId,
                        location.id,
                    ]
                )

            if (
                productResult.rows.length === 0
            ) {
                throw new Error(
                    `Строка ${index + 1}: товар не найден`
                )
            }

            const product =
                productResult.rows[0]

            const unit =
                String(
                    product.unit || ''
                )
                    .trim()
                    .toLowerCase() === 'weight'
                    ? 'weight'
                    : 'piece'

            const quantity =
                roundQuantity(
                    item.quantity
                )

            if (
                unit === 'piece' &&
                !Number.isInteger(
                    quantity
                )
            ) {
                throw new Error(
                    `Для товара «${product.name}» количество должно быть целым`
                )
            }

            if (quantity <= 0) {
                throw new Error(
                    `Некорректное количество: ${product.name}`
                )
            }

            const marked =
                Boolean(product.marked)

            if (marked) {
                if (
                    !item.markingCode
                ) {
                    throw new Error(
                        `Для маркированного товара «${product.name}» отсутствует DataMatrix`
                    )
                }

                if (
                    item.markingStatus
                    !== 'M+'
                ) {
                    throw new Error(
                        `Маркированный товар «${product.name}» не прошёл проверку [M+]`
                    )
                }
            }

            const currentStock =
                roundQuantity(
                    toNumber(
                        product.stock
                    )
                )

            const allowNegativeStock =
                canDebtProductGoNegative(
                    unit,
                    marked
                )

            if (
                !allowNegativeStock &&
                currentStock < quantity
            ) {
                throw new Error(
                    `Недостаточно остатка в зоне «${location.name}»: «${product.name}». В наличии ${currentStock}, нужно ${quantity}.`
                )
            }

            const nextStock =
                roundQuantity(
                    currentStock
                    - quantity
                )

            const currentSellingPrice =
                roundMoney(
                    toNumber(
                        product.current_selling_price
                    )
                )

            if (
                !Number.isFinite(
                    currentSellingPrice
                ) ||
                currentSellingPrice < 0
            ) {
                throw new Error(
                    `Некорректная цена товара «${product.name}» в базе`
                )
            }

            const lineTotal =
                roundMoney(
                    currentSellingPrice
                    * quantity
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
                    item.productId,
                    location.id,
                ]
            )

            await syncLegacyTochkaStock(
                client,
                location,
                item.productId,
                nextStock
            )

            const itemResult =
                await client.query<{
                    id: number | string
                }>(
                    `
                        INSERT INTO debt_sale_items (
                            debt_sale_id,
                            product_id,
                            product_name,
                            barcode,
                            category,
                            unit,
                            quantity,
                            returned_quantity,
                            purchase_price,
                            selling_price,
                            total,
                            marked,
                            marking_code,
                            marking_status,
                            marking_message,
                            marking_package_mode,
                            marking_package_quantity
                        )
                        VALUES (
                            $1,
                            $2,
                            $3,
                            NULLIF($4, ''),
                            NULLIF($5, ''),
                            $6,
                            $7,
                            0,
                            $8,
                            $9,
                            $10,
                            $11,
                            NULLIF($12, ''),
                            NULLIF($13, ''),
                            NULLIF($14, ''),
                            NULLIF($15, ''),
                            $16
                        )
                        RETURNING id
                    `,
                    [
                        debtSaleId,
                        item.productId,
                        String(
                            product.name || 'Товар'
                        ),
                        String(
                            product.barcode || ''
                        ),
                        String(
                            product.category || ''
                        ),
                        unit,
                        quantity,
                        roundMoney(
                            toNumber(
                                product.purchase_price
                            )
                        ),
                        currentSellingPrice,
                        lineTotal,
                        marked,
                        item.markingCode,
                        item.markingStatus,
                        item.markingMessage,
                        item.markingPackageMode,
                        item.markingPackageQuantity,
                    ]
                )

            const debtSaleItemId =
                Number(
                    itemResult.rows[0].id
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
                        'sale',
                        $3,
                        $4,
                        'debt_sale',
                        $5,
                        $6,
                        $7
                    )
                `,
                [
                    item.productId,
                    location.id,
                    -quantity,
                    nextStock,
                    debtSaleId,
                    `Выдача товара в долг ${debtNumber} клиенту ${customer.last_name} ${customer.first_name}`,
                    user.login,
                ]
            )

            responseItems.push(
                {
                    id:
                    debtSaleItemId,
                    productId:
                    item.productId,
                    name:
                        String(
                            product.name || ''
                        ),
                    barcode:
                        String(
                            product.barcode || ''
                        ),
                    category:
                        String(
                            product.category || ''
                        ),
                    unit,
                    quantity,
                    purchasePrice:
                        roundMoney(
                            toNumber(
                                product.purchase_price
                            )
                        ),
                    sellingPrice:
                    currentSellingPrice,
                    total:
                    lineTotal,
                    marked,
                    markingCode:
                        item.markingCode || null,
                    markingStatus:
                        item.markingStatus || null,
                    markingPackageMode:
                        item.markingPackageMode || null,
                    previousStock:
                    currentStock,
                    newStock:
                    nextStock,
                }
            )
        }

        const actualTotal =
            roundMoney(
                responseItems.reduce(
                    (
                        sum,
                        item
                    ) =>
                        sum +
                        toNumber(
                            item.total
                        ),
                    0
                )
            )

        if (
            Math.abs(
                actualTotal
                - requestedTotal
            ) > 0.01
        ) {
            await client.query(
                `
                    UPDATE debt_sales
                    SET
                        total = $2,
                        updated_at = NOW()
                    WHERE id = $1
                `,
                [
                    debtSaleId,
                    actualTotal,
                ]
            )
        }

        const finalDebt =
            roundMoney(
                previousDebt
                + actualTotal
            )

        if (
            finalDebt
            > creditLimit + 0.009
        ) {
            throw new Error(
                'После проверки товаров кредитный лимит оказался превышен. Операция отменена.'
            )
        }

        await insertDebtEvent(
            client,
            {
                customerId,
                eventType:
                    'debt_sale_created',
                debtSaleId,
                locationId:
                location.id,
                amount:
                actualTotal,
                payload: {
                    debtNumber,
                    itemCount:
                    responseItems.length,
                    previousDebt,
                    newDebt:
                    finalDebt,
                    creditLimit,
                    dueDate,
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
                debtSale: {
                    id:
                    debtSaleId,
                    debtNumber,
                    status:
                        'active',
                    total:
                    actualTotal,
                    returnedTotal:
                        0,
                    paidTotal:
                        0,
                    remainingAmount:
                    actualTotal,
                    comment,
                    dueDate,
                    createdAt:
                    saleResult.rows[0]
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
                    currentDebt:
                    finalDebt,
                    availableCredit:
                        roundMoney(
                            Math.max(
                                0,
                                creditLimit
                                - finalDebt
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
            'POST /api/debts/sales error:',
            error
        )

        return NextResponse.json(
            {
                message:
                    error instanceof Error
                        ? error.message
                        : 'Не удалось оформить товар в долг',
            },
            {
                status: 500,
            }
        )
    } finally {
        client.release()
    }
}

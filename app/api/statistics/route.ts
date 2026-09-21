import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'
import { requireWarehouseSection } from '@/app/lib/serverWarehouseAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PeriodKey =
    | 'today'
    | 'yesterday'
    | 'week'
    | 'month'
    | 'year'
    | 'custom'

type PaymentMethod =
    | 'card'
    | 'cash'
    | 'transfer'
    | string

type ReceiptRow = {
    id: number | string
    created_at: string
    payment_method: PaymentMethod | null
    total: number | string | null
    cash_amount: number | string | null
    card_amount: number | string | null
    transfer_amount: number | string | null
    items: unknown
    location_id: number
    location_name: string
    location_slug: string
}

type ProductFallbackRow = {
    id: number
    purchase_price: number | string | null
    selling_price: number | string | null
}

type StoreLocationRow = {
    id: number
    name: string
    slug: string
}

type DebtSaleItemRow = {
    debt_sale_id: number | string
    debt_number: string

    product_id: number | string
    product_name: string
    unit: string

    quantity: number | string
    purchase_price: number | string
    selling_price: number | string
    total: number | string

    location_id: number
    location_name: string
    location_slug: string
}

type DebtPaymentRow = {
    id: number | string
    payment_method: PaymentMethod
    amount: number | string

    location_id: number
    location_name: string
    location_slug: string
}

type DebtRefundRow = {
    id: number | string
    payment_method: PaymentMethod
    amount: number | string
    location_id: number
    location_name: string
    location_slug: string
}

type DebtReturnItemRow = {
    debt_return_id: number | string
    return_number: string

    debt_sale_id: number | string
    debt_number: string

    product_id: number | string
    product_name: string
    unit: string

    quantity: number | string
    purchase_price: number | string
    selling_price: number | string
    total: number | string

    location_id: number
    location_name: string
    location_slug: string
}

type ParsedSaleItem = {
    productId: number | null
    name: string
    unit: string

    quantity: number

    purchasePrice: number
    sellingPrice: number

    revenue: number
    cost: number

    locationSlug: string
    locationName: string
}

type LocationAccumulator = {
    slug: string
    name: string

    receiptCount: number
    debtSaleCount: number
    saleDocumentCount: number

    receiptRevenue: number
    debtIssued: number
    debtReturns: number
    salesRevenue: number

    debtPaymentCount: number
    debtPayments: number
    debtRefundCount: number
    debtRefunds: number
    cashIn: number

    cost: number
    estimatedProfit: number
    soldItems: number
}

type PaymentAccumulator = {
    method: string
    label: string

    receiptCount: number
    receiptTotal: number

    debtPaymentCount: number
    debtPaymentTotal: number

    debtRefundCount: number
    debtRefundTotal: number

    count: number
    total: number
}

type ProductAccumulator = {
    key: string
    productId: number | null
    name: string

    quantity: number
    revenue: number
    cost: number
    estimatedProfit: number
}

const PERIODS = new Set<PeriodKey>([
    'today',
    'yesterday',
    'week',
    'month',
    'year',
    'custom',
])

const PAYMENT_LABELS: Record<string, string> = {
    card: 'Карта',
    cash: 'Наличные',
    transfer: 'Перевод',
}

function toNumber(
    value: unknown,
    fallback = 0
): number {
    if (
        value === null ||
        value === undefined ||
        value === ''
    ) {
        return fallback
    }

    const parsed = Number(
        String(value)
            .replace(',', '.')
            .replace(/\s/g, '')
    )

    return Number.isFinite(parsed)
        ? parsed
        : fallback
}

function roundMoney(
    value: number
): number {
    return Math.round(
        (value + Number.EPSILON) * 100
    ) / 100
}

function roundQty(
    value: number
): number {
    return Math.round(
        (value + Number.EPSILON) * 1000
    ) / 1000
}

function normalizePeriod(
    value: unknown
): PeriodKey {
    const period =
        String(value || '')
            .trim() as PeriodKey

    return PERIODS.has(period)
        ? period
        : 'today'
}

function startOfLocalDay(
    date: Date
): Date {
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        0,
        0,
        0,
        0
    )
}

function addDays(
    date: Date,
    days: number
): Date {
    const next = new Date(date)

    next.setDate(
        next.getDate() + days
    )

    return next
}

function addMonths(
    date: Date,
    months: number
): Date {
    const next = new Date(date)

    next.setMonth(
        next.getMonth() + months
    )

    return next
}

function addYears(
    date: Date,
    years: number
): Date {
    const next = new Date(date)

    next.setFullYear(
        next.getFullYear() + years
    )

    return next
}

function parseDateInput(
    value: string | null,
    fallback: Date
): Date {
    if (!value) {
        return fallback
    }

    const match =
        value.match(
            /^(\d{4})-(\d{2})-(\d{2})$/
        )

    if (!match) {
        return fallback
    }

    const year =
        Number(match[1])

    const month =
        Number(match[2]) - 1

    const day =
        Number(match[3])

    const parsed =
        new Date(
            year,
            month,
            day,
            0,
            0,
            0,
            0
        )

    return Number.isNaN(
        parsed.getTime()
    )
        ? fallback
        : parsed
}

function getDateRange(
    request: NextRequest
) {
    const url =
        new URL(
            request.url
        )

    const period =
        normalizePeriod(
            url.searchParams.get(
                'period'
            )
        )

    const today =
        startOfLocalDay(
            new Date()
        )

    if (
        period === 'custom'
    ) {
        const fallbackFrom =
            addDays(
                today,
                -6
            )

        const from =
            parseDateInput(
                url.searchParams.get(
                    'from'
                ),
                fallbackFrom
            )

        const toDate =
            parseDateInput(
                url.searchParams.get(
                    'to'
                ),
                today
            )

        const to =
            addDays(
                toDate,
                1
            )

        return {
            period,
            from,
            to,
        }
    }

    if (
        period === 'yesterday'
    ) {
        const from =
            addDays(
                today,
                -1
            )

        return {
            period,
            from,
            to: today,
        }
    }

    if (
        period === 'week'
    ) {
        return {
            period,
            from:
                addDays(
                    today,
                    -6
                ),
            to:
                addDays(
                    today,
                    1
                ),
        }
    }

    if (
        period === 'month'
    ) {
        const from =
            new Date(
                today.getFullYear(),
                today.getMonth(),
                1,
                0,
                0,
                0,
                0
            )

        return {
            period,
            from,
            to:
                addMonths(
                    from,
                    1
                ),
        }
    }

    if (
        period === 'year'
    ) {
        const from =
            new Date(
                today.getFullYear(),
                0,
                1,
                0,
                0,
                0,
                0
            )

        return {
            period,
            from,
            to:
                addYears(
                    from,
                    1
                ),
        }
    }

    return {
        period,
        from: today,
        to:
            addDays(
                today,
                1
            ),
    }
}

function asArray(
    value: unknown
): unknown[] {
    return Array.isArray(value)
        ? value
        : []
}

function readItemProductId(
    item: any
): number | null {
    const candidates = [
        item?.productId,
        item?.product_id,
        item?.id,
        item?.product?.id,
    ]

    for (
        const candidate
        of candidates
        ) {
        const parsed =
            Number(candidate)

        if (
            Number.isInteger(parsed) &&
            parsed > 0
        ) {
            return parsed
        }
    }

    return null
}

function readItemName(
    item: any
): string {
    return String(
        item?.name ??
        item?.title ??
        item?.productName ??
        item?.product?.name ??
        'Товар'
    ).trim() || 'Товар'
}

function readItemUnit(
    item: any
): string {
    const unit =
        String(
            item?.unit ??
            item?.product?.unit ??
            ''
        )
            .trim()
            .toLowerCase()

    return unit === 'weight'
        ? 'weight'
        : 'piece'
}

function readPurchasePrice(
    item: any,
    productFallback?: ProductFallbackRow
): number {
    const raw =
        item?.purchasePrice ??
        item?.purchase_price ??
        item?.product?.purchasePrice ??
        item?.product?.purchase_price

    const parsed =
        toNumber(
            raw,
            NaN
        )

    if (
        Number.isFinite(parsed)
    ) {
        return parsed
    }

    return toNumber(
        productFallback
            ?.purchase_price,
        0
    )
}

function readSellingPrice(
    item: any,
    productFallback?: ProductFallbackRow
): number {
    const raw =
        item?.price ??
        item?.sellingPrice ??
        item?.selling_price ??
        item?.product?.sellingPrice ??
        item?.product?.selling_price

    const parsed =
        toNumber(
            raw,
            NaN
        )

    if (
        Number.isFinite(parsed)
    ) {
        return parsed
    }

    return toNumber(
        productFallback
            ?.selling_price,
        0
    )
}

function formatDateForPayload(
    date: Date
): string {
    return date.toISOString()
}

function soldUnitsForStatistics(
    unit: string,
    quantity: number
): number {
    return unit === 'weight'
        ? 1
        : quantity
}

function addProductStat(
    productMap:
        Map<
            string,
            ProductAccumulator
        >,
    item: ParsedSaleItem,
    multiplier = 1
) {
    const key =
        item.productId
            ? `id:${item.productId}`
            : `name:${item.name}`

    const current =
        productMap.get(key) || {
            key,
            productId:
            item.productId,
            name:
            item.name,

            quantity: 0,
            revenue: 0,
            cost: 0,
            estimatedProfit: 0,
        }

    current.quantity +=
        item.quantity * multiplier

    current.revenue +=
        item.revenue * multiplier

    current.cost +=
        item.cost * multiplier

    current.estimatedProfit =
        current.revenue -
        current.cost

    productMap.set(
        key,
        current
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
                'statistics'
            )

        if (!access.ok) {
            return access.response
        }

        const url =
            new URL(
                request.url
            )

        const selectedLocation =
            String(
                url.searchParams.get(
                    'location'
                ) || 'all'
            ).trim()

        const {
            period,
            from,
            to,
        } =
            getDateRange(
                request
            )

        const storeLocationsResult =
            await pool.query<StoreLocationRow>(
                `
                    SELECT
                        id,
                        name,
                        slug
                    FROM locations
                    WHERE
                        type = 'store'
                        AND is_active = TRUE
                    ORDER BY id ASC
                `
            )

        const allowedStoreSlugs =
            new Set(
                storeLocationsResult.rows.map(
                    row => row.slug
                )
            )

        const locationFilter =
            selectedLocation !== 'all' &&
            allowedStoreSlugs.has(
                selectedLocation
            )
                ? selectedLocation
                : 'all'

        const buildLocationFilter = (
            alias: string,
            params: unknown[]
        ) => {
            if (
                locationFilter === 'all'
            ) {
                return ''
            }

            params.push(
                locationFilter
            )

            return `AND ${alias}.slug = $${params.length}`
        }

        /*
         * 1. Обычные продажи.
         */
        const receiptParams:
            unknown[] = [
            from.toISOString(),
            to.toISOString(),
        ]

        const receiptLocationSql =
            buildLocationFilter(
                'l',
                receiptParams
            )

        const receiptsResult =
            await pool.query<ReceiptRow>(
                `
                    SELECT
                        r.id,
                        r.created_at,
                        r.payment_method,
                        r.total,
                        r.cash_amount,
                        r.card_amount,
                        r.transfer_amount,
                        r.items,

                        l.id
                            AS location_id,

                        l.name
                            AS location_name,

                        l.slug
                            AS location_slug

                    FROM receipts r

                    JOIN locations l
                        ON l.id =
                            r.location_id

                    WHERE
                        l.type = 'store'

                        AND r.created_at
                            >= $1::timestamptz

                        AND r.created_at
                            < $2::timestamptz

                        ${receiptLocationSql}

                    ORDER BY
                        r.created_at DESC,
                        r.id DESC
                `,
                receiptParams
            )

        /*
         * Подтягиваем fallback-цены для старых чеков,
         * в которых закупочная цена могла ещё не сохраняться.
         */
        const receiptProductIds =
            new Set<number>()

        for (
            const receipt
            of receiptsResult.rows
            ) {
            for (
                const item
                of asArray(
                receipt.items
            )
                ) {
                const productId =
                    readItemProductId(
                        item
                    )

                if (productId) {
                    receiptProductIds.add(
                        productId
                    )
                }
            }
        }

        const productFallbacks =
            new Map<
                number,
                ProductFallbackRow
            >()

        if (
            receiptProductIds.size > 0
        ) {
            const productsResult =
                await pool.query<ProductFallbackRow>(
                    `
                        SELECT
                            id,
                            purchase_price,
                            selling_price
                        FROM products
                        WHERE id =
                            ANY($1::int[])
                    `,
                    [
                        Array.from(
                            receiptProductIds
                        ),
                    ]
                )

            for (
                const product
                of productsResult.rows
                ) {
                productFallbacks.set(
                    Number(
                        product.id
                    ),
                    product
                )
            }
        }

        const receiptItems:
            ParsedSaleItem[] =
            []

        for (
            const receipt
            of receiptsResult.rows
            ) {
            for (
                const rawItem
                of asArray(
                receipt.items
            )
                ) {
                const item =
                    rawItem as any

                const productId =
                    readItemProductId(
                        item
                    )

                const fallback =
                    productId
                        ? productFallbacks.get(
                            productId
                        )
                        : undefined

                const quantity =
                    roundQty(
                        toNumber(
                            item?.quantity,
                            0
                        )
                    )

                if (
                    quantity <= 0
                ) {
                    continue
                }

                const sellingPrice =
                    readSellingPrice(
                        item,
                        fallback
                    )

                const purchasePrice =
                    readPurchasePrice(
                        item,
                        fallback
                    )

                const rawTotal =
                    toNumber(
                        item?.total,
                        NaN
                    )

                const revenue =
                    roundMoney(
                        Number.isFinite(
                            rawTotal
                        )
                            ? rawTotal
                            : quantity
                            * sellingPrice
                    )

                const cost =
                    roundMoney(
                        quantity
                        * purchasePrice
                    )

                receiptItems.push(
                    {
                        productId,

                        name:
                            readItemName(
                                item
                            ),

                        unit:
                            readItemUnit(
                                item
                            ),

                        quantity,

                        purchasePrice,
                        sellingPrice,

                        revenue,
                        cost,

                        locationSlug:
                        receipt.location_slug,

                        locationName:
                        receipt.location_name,
                    }
                )
            }
        }

        /*
         * 2. Выдачи товара в долг.
         *
         * В товарной статистике это полноценная реализация:
         * товар уже покинул магазин и stock был уменьшен.
         */
        const debtSaleParams:
            unknown[] = [
            from.toISOString(),
            to.toISOString(),
        ]

        const debtSaleLocationSql =
            buildLocationFilter(
                'l',
                debtSaleParams
            )

        const debtSaleItemsResult =
            await pool.query<DebtSaleItemRow>(
                `
                    SELECT
                        ds.id
                            AS debt_sale_id,

                        ds.debt_number,

                        dsi.product_id,
                        dsi.product_name,
                        dsi.unit,

                        dsi.quantity::float
                            AS quantity,

                        dsi.purchase_price::float
                            AS purchase_price,

                        dsi.selling_price::float
                            AS selling_price,

                        dsi.total::float
                            AS total,

                        l.id
                            AS location_id,

                        l.name
                            AS location_name,

                        l.slug
                            AS location_slug

                    FROM debt_sales ds

                    JOIN debt_sale_items dsi
                        ON dsi.debt_sale_id =
                            ds.id

                    JOIN locations l
                        ON l.id =
                            ds.location_id

                    WHERE
                        l.type = 'store'

                        AND ds.status
                            <> 'cancelled'

                        AND ds.created_at
                            >= $1::timestamptz

                        AND ds.created_at
                            < $2::timestamptz

                        ${debtSaleLocationSql}

                    ORDER BY
                        ds.created_at DESC,
                        ds.id DESC,
                        dsi.id ASC
                `,
                debtSaleParams
            )

        const debtSaleIds =
            new Set<number>()

        const debtSaleItems:
            ParsedSaleItem[] =
            debtSaleItemsResult.rows.map(
                row => {
                    debtSaleIds.add(
                        Number(
                            row.debt_sale_id
                        )
                    )

                    const quantity =
                        roundQty(
                            toNumber(
                                row.quantity
                            )
                        )

                    const purchasePrice =
                        roundMoney(
                            toNumber(
                                row.purchase_price
                            )
                        )

                    const sellingPrice =
                        roundMoney(
                            toNumber(
                                row.selling_price
                            )
                        )

                    const revenue =
                        roundMoney(
                            toNumber(
                                row.total,
                                quantity
                                * sellingPrice
                            )
                        )

                    return {
                        productId:
                            Number(
                                row.product_id
                            ),

                        name:
                            String(
                                row.product_name ||
                                'Товар'
                            ),

                        unit:
                            row.unit ===
                            'weight'
                                ? 'weight'
                                : 'piece',

                        quantity,

                        purchasePrice,
                        sellingPrice,

                        revenue,

                        cost:
                            roundMoney(
                                quantity
                                * purchasePrice
                            ),

                        locationSlug:
                        row.location_slug,

                        locationName:
                        row.location_name,
                    }
                }
            )

        /*
         * 3. Возвраты из долга.
         *
         * Они уменьшают товарную реализацию и себестоимость.
         * Для статистики торговой точки корректировка относится
         * к точке исходной выдачи долга, а не к точке,
         * куда физически приняли возвращённый товар.
         */
        const debtReturnParams:
            unknown[] = [
            from.toISOString(),
            to.toISOString(),
        ]

        const debtReturnLocationSql =
            buildLocationFilter(
                'sale_location',
                debtReturnParams
            )

        const debtReturnItemsResult =
            await pool.query<DebtReturnItemRow>(
                `
                    SELECT
                        dr.id
                            AS debt_return_id,

                        dr.return_number,

                        ds.id
                            AS debt_sale_id,

                        ds.debt_number,

                        dri.product_id,

                        dsi.product_name,
                        dsi.unit,

                        dri.quantity::float
                            AS quantity,

                        dsi.purchase_price::float
                            AS purchase_price,

                        dri.selling_price::float
                            AS selling_price,

                        dri.total::float
                            AS total,

                        sale_location.id
                            AS location_id,

                        sale_location.name
                            AS location_name,

                        sale_location.slug
                            AS location_slug

                    FROM debt_returns dr

                    JOIN debt_return_items dri
                        ON dri.debt_return_id =
                            dr.id

                    JOIN debt_sale_items dsi
                        ON dsi.id =
                            dri.debt_sale_item_id

                    JOIN debt_sales ds
                        ON ds.id =
                            dr.debt_sale_id

                    JOIN locations sale_location
                        ON sale_location.id =
                            ds.location_id

                    WHERE
                        sale_location.type =
                            'store'

                        AND dr.created_at
                            >= $1::timestamptz

                        AND dr.created_at
                            < $2::timestamptz

                        ${debtReturnLocationSql}

                    ORDER BY
                        dr.created_at DESC,
                        dr.id DESC,
                        dri.id ASC
                `,
                debtReturnParams
            )

        const debtReturnIds =
            new Set<number>()

        const debtReturnItems:
            ParsedSaleItem[] =
            debtReturnItemsResult.rows.map(
                row => {
                    debtReturnIds.add(
                        Number(
                            row.debt_return_id
                        )
                    )

                    const quantity =
                        roundQty(
                            toNumber(
                                row.quantity
                            )
                        )

                    const purchasePrice =
                        roundMoney(
                            toNumber(
                                row.purchase_price
                            )
                        )

                    const sellingPrice =
                        roundMoney(
                            toNumber(
                                row.selling_price
                            )
                        )

                    const revenue =
                        roundMoney(
                            toNumber(
                                row.total,
                                quantity
                                * sellingPrice
                            )
                        )

                    return {
                        productId:
                            Number(
                                row.product_id
                            ),

                        name:
                            String(
                                row.product_name ||
                                'Товар'
                            ),

                        unit:
                            row.unit ===
                            'weight'
                                ? 'weight'
                                : 'piece',

                        quantity,

                        purchasePrice,
                        sellingPrice,

                        revenue,

                        cost:
                            roundMoney(
                                quantity
                                * purchasePrice
                            ),

                        locationSlug:
                        row.location_slug,

                        locationName:
                        row.location_name,
                    }
                }
            )

        /*
         * 4. Погашения долгов.
         *
         * Это денежный приход в день и точку погашения,
         * но это НЕ повторная товарная продажа.
         */
        const debtPaymentParams:
            unknown[] = [
            from.toISOString(),
            to.toISOString(),
        ]

        const debtPaymentLocationSql =
            buildLocationFilter(
                'l',
                debtPaymentParams
            )

        const debtPaymentsResult =
            await pool.query<DebtPaymentRow>(
                `
                    SELECT
                        dp.id,
                        dp.payment_method,

                        dp.amount::float
                            AS amount,

                        l.id
                            AS location_id,

                        l.name
                            AS location_name,

                        l.slug
                            AS location_slug

                    FROM debt_payments dp

                    JOIN locations l
                        ON l.id =
                            dp.location_id

                    WHERE
                        l.type = 'store'

                        AND dp.created_at
                            >= $1::timestamptz

                        AND dp.created_at
                            < $2::timestamptz

                        ${debtPaymentLocationSql}

                    ORDER BY
                        dp.created_at DESC,
                        dp.id DESC
                `,
                debtPaymentParams
            )

        /*
         * 5. Денежные возвраты по уже оплаченной части долга.
         * Они уменьшают фактически полученные деньги периода.
         */
        const debtRefundParams:
            unknown[] = [
            from.toISOString(),
            to.toISOString(),
        ]

        const debtRefundLocationSql =
            buildLocationFilter(
                'l',
                debtRefundParams
            )

        const debtRefundsResult =
            await pool.query<DebtRefundRow>(
                `
                    SELECT
                        drf.id,
                        drf.payment_method,

                        drf.amount::float
                            AS amount,

                        l.id
                            AS location_id,

                        l.name
                            AS location_name,

                        l.slug
                            AS location_slug

                    FROM debt_refunds drf

                    JOIN locations l
                        ON l.id =
                            drf.location_id

                    WHERE
                        l.type = 'store'

                        AND drf.created_at
                            >= $1::timestamptz

                        AND drf.created_at
                            < $2::timestamptz

                        ${debtRefundLocationSql}

                    ORDER BY
                        drf.created_at DESC,
                        drf.id DESC
                `,
                debtRefundParams
            )

        /*
         * 6. Текущая дебиторская задолженность.
         *
         * Она не ограничена выбранным периодом, потому что это
         * текущий остаток долга "на сейчас".
         * При выборе точки показывается долг, возникший в этой точке.
         */
        const outstandingParams:
            unknown[] = []

        let outstandingLocationSql =
            ''

        if (
            locationFilter !== 'all'
        ) {
            outstandingParams.push(
                locationFilter
            )

            outstandingLocationSql =
                `AND l.slug = $${outstandingParams.length}`
        }

        const outstandingResult =
            await pool.query<{
                outstanding: number | string
                customers: number | string
            }>(
                `
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
                        )::float
                            AS outstanding,

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
                        )::int
                            AS customers

                    FROM debt_sales ds

                    JOIN locations l
                        ON l.id =
                            ds.location_id

                    WHERE
                        ds.status <>
                            'cancelled'

                        AND l.type =
                            'store'

                        ${outstandingLocationSql}
                `,
                outstandingParams
            )

        /*
         * Общие суммы.
         */
        const receiptCount =
            receiptsResult.rows.length

        const debtSaleCount =
            debtSaleIds.size

        const saleDocumentCount =
            receiptCount +
            debtSaleCount

        const receiptRevenue =
            roundMoney(
                receiptsResult.rows.reduce(
                    (
                        sum,
                        row
                    ) =>
                        sum +
                        toNumber(
                            row.total
                        ),
                    0
                )
            )

        const debtIssued =
            roundMoney(
                debtSaleItems.reduce(
                    (
                        sum,
                        item
                    ) =>
                        sum +
                        item.revenue,
                    0
                )
            )

        const debtReturns =
            roundMoney(
                debtReturnItems.reduce(
                    (
                        sum,
                        item
                    ) =>
                        sum +
                        item.revenue,
                    0
                )
            )

        const salesRevenue =
            roundMoney(
                receiptRevenue +
                debtIssued -
                debtReturns
            )

        const debtPayments =
            roundMoney(
                debtPaymentsResult.rows.reduce(
                    (
                        sum,
                        row
                    ) =>
                        sum +
                        toNumber(
                            row.amount
                        ),
                    0
                )
            )

        const debtRefunds =
            roundMoney(
                debtRefundsResult.rows.reduce(
                    (
                        sum,
                        row
                    ) =>
                        sum +
                        toNumber(
                            row.amount
                        ),
                    0
                )
            )

        const cashIn =
            roundMoney(
                receiptRevenue +
                debtPayments -
                debtRefunds
            )

        const receiptCost =
            roundMoney(
                receiptItems.reduce(
                    (
                        sum,
                        item
                    ) =>
                        sum +
                        item.cost,
                    0
                )
            )

        const debtIssuedCost =
            roundMoney(
                debtSaleItems.reduce(
                    (
                        sum,
                        item
                    ) =>
                        sum +
                        item.cost,
                    0
                )
            )

        const debtReturnCost =
            roundMoney(
                debtReturnItems.reduce(
                    (
                        sum,
                        item
                    ) =>
                        sum +
                        item.cost,
                    0
                )
            )

        const cost =
            roundMoney(
                receiptCost +
                debtIssuedCost -
                debtReturnCost
            )

        const estimatedProfit =
            roundMoney(
                salesRevenue -
                cost
            )

        const receiptSoldItems =
            receiptItems.reduce(
                (
                    sum,
                    item
                ) =>
                    sum +
                    soldUnitsForStatistics(
                        item.unit,
                        item.quantity
                    ),
                0
            )

        const debtSoldItems =
            debtSaleItems.reduce(
                (
                    sum,
                    item
                ) =>
                    sum +
                    soldUnitsForStatistics(
                        item.unit,
                        item.quantity
                    ),
                0
            )

        const debtReturnedItems =
            debtReturnItems.reduce(
                (
                    sum,
                    item
                ) =>
                    sum +
                    soldUnitsForStatistics(
                        item.unit,
                        item.quantity
                    ),
                0
            )

        const soldItems =
            roundQty(
                receiptSoldItems +
                debtSoldItems -
                debtReturnedItems
            )

        const averageCheck =
            saleDocumentCount > 0
                ? roundMoney(
                    (
                        receiptRevenue +
                        debtIssued
                    ) /
                    saleDocumentCount
                )
                : 0

        const debtOutstanding =
            roundMoney(
                toNumber(
                    outstandingResult.rows[0]
                        ?.outstanding
                )
            )

        const debtCustomers =
            Math.max(
                0,
                Math.floor(
                    toNumber(
                        outstandingResult.rows[0]
                            ?.customers
                    )
                )
            )

        /*
         * Разбивка по торговым точкам.
         */
        const byLocationMap =
            new Map<
                string,
                LocationAccumulator
            >()

        for (
            const storeLocation
            of storeLocationsResult.rows
            ) {
            if (
                locationFilter !== 'all' &&
                storeLocation.slug !==
                locationFilter
            ) {
                continue
            }

            byLocationMap.set(
                storeLocation.slug,
                {
                    slug:
                    storeLocation.slug,

                    name:
                    storeLocation.name,

                    receiptCount: 0,
                    debtSaleCount: 0,
                    saleDocumentCount: 0,

                    receiptRevenue: 0,
                    debtIssued: 0,
                    debtReturns: 0,
                    salesRevenue: 0,

                    debtPaymentCount: 0,
                    debtPayments: 0,
                    debtRefundCount: 0,
                    debtRefunds: 0,
                    cashIn: 0,

                    cost: 0,
                    estimatedProfit: 0,
                    soldItems: 0,
                }
            )
        }

        for (
            const receipt
            of receiptsResult.rows
            ) {
            const record =
                byLocationMap.get(
                    receipt.location_slug
                )

            if (!record) {
                continue
            }

            record.receiptCount += 1
            record.receiptRevenue +=
                toNumber(
                    receipt.total
                )
        }

        const debtSaleIdsByLocation =
            new Map<
                string,
                Set<number>
            >()

        for (
            const item
            of debtSaleItemsResult.rows
            ) {
            const slug =
                item.location_slug

            let ids =
                debtSaleIdsByLocation.get(
                    slug
                )

            if (!ids) {
                ids =
                    new Set<number>()

                debtSaleIdsByLocation.set(
                    slug,
                    ids
                )
            }

            ids.add(
                Number(
                    item.debt_sale_id
                )
            )
        }

        for (
            const [
                slug,
                ids,
            ]
            of debtSaleIdsByLocation
            ) {
            const record =
                byLocationMap.get(
                    slug
                )

            if (record) {
                record.debtSaleCount =
                    ids.size
            }
        }

        for (
            const item
            of receiptItems
            ) {
            const record =
                byLocationMap.get(
                    item.locationSlug
                )

            if (!record) {
                continue
            }

            record.cost +=
                item.cost

            record.soldItems +=
                soldUnitsForStatistics(
                    item.unit,
                    item.quantity
                )
        }

        for (
            const item
            of debtSaleItems
            ) {
            const record =
                byLocationMap.get(
                    item.locationSlug
                )

            if (!record) {
                continue
            }

            record.debtIssued +=
                item.revenue

            record.cost +=
                item.cost

            record.soldItems +=
                soldUnitsForStatistics(
                    item.unit,
                    item.quantity
                )
        }

        for (
            const item
            of debtReturnItems
            ) {
            const record =
                byLocationMap.get(
                    item.locationSlug
                )

            if (!record) {
                continue
            }

            record.debtReturns +=
                item.revenue

            record.cost -=
                item.cost

            record.soldItems -=
                soldUnitsForStatistics(
                    item.unit,
                    item.quantity
                )
        }

        for (
            const payment
            of debtPaymentsResult.rows
            ) {
            const record =
                byLocationMap.get(
                    payment.location_slug
                )

            if (!record) {
                continue
            }

            record.debtPaymentCount += 1

            record.debtPayments +=
                toNumber(
                    payment.amount
                )
        }

        for (
            const refund
            of debtRefundsResult.rows
            ) {
            const record =
                byLocationMap.get(
                    refund.location_slug
                )

            if (!record) {
                continue
            }

            record.debtRefundCount += 1

            record.debtRefunds +=
                toNumber(
                    refund.amount
                )
        }

        const byLocation =
            Array.from(
                byLocationMap.values()
            ).map(
                record => {
                    const receiptRevenueValue =
                        roundMoney(
                            record.receiptRevenue
                        )

                    const debtIssuedValue =
                        roundMoney(
                            record.debtIssued
                        )

                    const debtReturnsValue =
                        roundMoney(
                            record.debtReturns
                        )

                    const salesRevenueValue =
                        roundMoney(
                            receiptRevenueValue +
                            debtIssuedValue -
                            debtReturnsValue
                        )

                    const debtPaymentsValue =
                        roundMoney(
                            record.debtPayments
                        )

                    const debtRefundsValue =
                        roundMoney(
                            record.debtRefunds
                        )

                    const cashInValue =
                        roundMoney(
                            receiptRevenueValue +
                            debtPaymentsValue -
                            debtRefundsValue
                        )

                    const costValue =
                        roundMoney(
                            record.cost
                        )

                    const saleDocumentCountValue =
                        record.receiptCount +
                        record.debtSaleCount

                    return {
                        ...record,

                        saleDocumentCount:
                        saleDocumentCountValue,

                        receiptRevenue:
                        receiptRevenueValue,

                        debtIssued:
                        debtIssuedValue,

                        debtReturns:
                        debtReturnsValue,

                        salesRevenue:
                        salesRevenueValue,

                        debtPayments:
                        debtPaymentsValue,

                        debtRefunds:
                        debtRefundsValue,

                        cashIn:
                        cashInValue,

                        cost:
                        costValue,

                        estimatedProfit:
                            roundMoney(
                                salesRevenueValue -
                                costValue
                            ),

                        averageCheck:
                            saleDocumentCountValue > 0
                                ? roundMoney(
                                    (
                                        receiptRevenueValue +
                                        debtIssuedValue
                                    ) /
                                    saleDocumentCountValue
                                )
                                : 0,

                        soldItems:
                            roundQty(
                                record.soldItems
                            ),
                    }
                }
            )

        /*
         * Денежные поступления по способам оплаты.
         */
        const byPaymentMap =
            new Map<
                string,
                PaymentAccumulator
            >()

        const ensurePaymentRecord = (
            method: string
        ) => {
            const normalized =
                String(
                    method || 'unknown'
                )

            let current =
                byPaymentMap.get(
                    normalized
                )

            if (!current) {
                current = {
                    method:
                    normalized,

                    label:
                        PAYMENT_LABELS[
                            normalized
                            ] || normalized,

                    receiptCount: 0,
                    receiptTotal: 0,

                    debtPaymentCount: 0,
                    debtPaymentTotal: 0,

                    debtRefundCount: 0,
                    debtRefundTotal: 0,

                    count: 0,
                    total: 0,
                }

                byPaymentMap.set(
                    normalized,
                    current
                )
            }

            return current
        }

        for (
            const receipt
            of receiptsResult.rows
            ) {
            const parts = [
                {
                    method: 'cash',
                    amount: toNumber(
                        receipt.cash_amount
                    ),
                },
                {
                    method: 'card',
                    amount: toNumber(
                        receipt.card_amount
                    ),
                },
                {
                    method: 'transfer',
                    amount: toNumber(
                        receipt.transfer_amount
                    ),
                },
            ]

            for (
                const part
                of parts
                ) {
                if (
                    part.amount <=
                    0.009
                ) {
                    continue
                }

                const current =
                    ensurePaymentRecord(
                        part.method
                    )

                current.receiptCount +=
                    1

                current.receiptTotal +=
                    part.amount
            }
        }

        for (
            const payment
            of debtPaymentsResult.rows
            ) {
            const method =
                String(
                    payment.payment_method ||
                    'unknown'
                )

            const current =
                ensurePaymentRecord(
                    method
                )

            current.debtPaymentCount +=
                1

            current.debtPaymentTotal +=
                toNumber(
                    payment.amount
                )
        }

        for (
            const refund
            of debtRefundsResult.rows
            ) {
            const method =
                String(
                    refund.payment_method ||
                    'unknown'
                )

            const current =
                ensurePaymentRecord(
                    method
                )

            current.debtRefundCount +=
                1

            current.debtRefundTotal +=
                toNumber(
                    refund.amount
                )
        }

        const preferredPaymentOrder = [
            'cash',
            'card',
            'transfer',
        ]

        const byPayment =
            Array.from(
                byPaymentMap.values()
            )
                .map(
                    record => ({
                        ...record,

                        receiptTotal:
                            roundMoney(
                                record.receiptTotal
                            ),

                        debtPaymentTotal:
                            roundMoney(
                                record.debtPaymentTotal
                            ),

                        debtRefundTotal:
                            roundMoney(
                                record.debtRefundTotal
                            ),

                        count:
                            record.receiptCount +
                            record.debtPaymentCount +
                            record.debtRefundCount,

                        total:
                            roundMoney(
                                record.receiptTotal +
                                record.debtPaymentTotal -
                                record.debtRefundTotal
                            ),
                    })
                )
                .sort(
                    (
                        a,
                        b
                    ) => {
                        const aIndex =
                            preferredPaymentOrder.indexOf(
                                a.method
                            )

                        const bIndex =
                            preferredPaymentOrder.indexOf(
                                b.method
                            )

                        if (
                            aIndex !== -1 ||
                            bIndex !== -1
                        ) {
                            return (
                                (
                                    aIndex === -1
                                        ? 999
                                        : aIndex
                                ) -
                                (
                                    bIndex === -1
                                        ? 999
                                        : bIndex
                                )
                            )
                        }

                        return a.label.localeCompare(
                            b.label,
                            'ru'
                        )
                    }
                )

        /*
         * Топ товаров: обычные продажи + товар в долг - возвраты из долга.
         */
        const productMap =
            new Map<
                string,
                ProductAccumulator
            >()

        for (
            const item
            of receiptItems
            ) {
            addProductStat(
                productMap,
                item,
                1
            )
        }

        for (
            const item
            of debtSaleItems
            ) {
            addProductStat(
                productMap,
                item,
                1
            )
        }

        for (
            const item
            of debtReturnItems
            ) {
            addProductStat(
                productMap,
                item,
                -1
            )
        }

        const topProducts =
            Array.from(
                productMap.values()
            )
                .map(
                    record => ({
                        ...record,

                        quantity:
                            roundQty(
                                record.quantity
                            ),

                        revenue:
                            roundMoney(
                                record.revenue
                            ),

                        cost:
                            roundMoney(
                                record.cost
                            ),

                        estimatedProfit:
                            roundMoney(
                                record.estimatedProfit
                            ),
                    })
                )
                .filter(
                    record =>
                        Math.abs(
                            record.quantity
                        ) > 0.0009 ||
                        Math.abs(
                            record.revenue
                        ) > 0.009
                )
                .sort(
                    (
                        a,
                        b
                    ) =>
                        b.revenue -
                        a.revenue
                )
                .slice(
                    0,
                    20
                )

        return NextResponse.json(
            {
                period,

                from:
                    formatDateForPayload(
                        from
                    ),

                to:
                    formatDateForPayload(
                        to
                    ),

                selectedLocation:
                locationFilter,

                storeLocations:
                    storeLocationsResult.rows.map(
                        row => ({
                            id:
                                Number(
                                    row.id
                                ),

                            name:
                            row.name,

                            slug:
                            row.slug,
                        })
                    ),

                summary: {
                    receiptCount,
                    debtSaleCount,
                    saleDocumentCount,

                    receiptRevenue,
                    debtIssued,
                    debtReturns,
                    salesRevenue,

                    debtPaymentCount:
                    debtPaymentsResult.rows.length,

                    debtPayments,

                    debtRefundCount:
                    debtRefundsResult.rows.length,

                    debtRefunds,
                    cashIn,

                    averageCheck,

                    cost,
                    estimatedProfit,
                    soldItems,

                    debtOutstanding,
                    debtCustomers,
                },

                byLocation,
                byPayment,
                topProducts,

                debt: {
                    issued:
                    debtIssued,

                    payments:
                    debtPayments,

                    refunds:
                    debtRefunds,

                    returns:
                    debtReturns,

                    outstanding:
                    debtOutstanding,

                    customers:
                    debtCustomers,

                    saleCount:
                    debtSaleCount,

                    paymentCount:
                    debtPaymentsResult.rows.length,

                    refundCount:
                    debtRefundsResult.rows.length,

                    returnCount:
                    debtReturnIds.size,
                },
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
            'GET /api/statistics error:',
            error
        )

        return NextResponse.json(
            {
                message:
                    error instanceof Error
                        ? error.message
                        : 'Не удалось загрузить статистику',
            },
            {
                status:
                    error instanceof Error &&
                    error.message.includes(
                        'Главный склад'
                    )
                        ? 403
                        : 500,
            }
        )
    }
}

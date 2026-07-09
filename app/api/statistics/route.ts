import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'
import { resolveWarehouseContext } from '@/app/lib/serverWarehouseLocation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PeriodKey = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom'
type PaymentMethod = 'card' | 'cash' | 'transfer' | string

type ReceiptRow = {
    id: number | string
    created_at: string
    payment_method: PaymentMethod | null
    total: number | string | null
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

type ParsedReceiptItem = {
    productId: number | null
    name: string
    unit: string
    quantity: number
    purchasePrice: number
    sellingPrice: number
    total: number
    locationSlug: string
    locationName: string
}

const PERIODS = new Set<PeriodKey>(['today', 'yesterday', 'week', 'month', 'year', 'custom'])

const PAYMENT_LABELS: Record<string, string> = {
    card: 'Карта',
    cash: 'Наличные',
    transfer: 'Перевод',
}

function toNumber(value: unknown, fallback = 0): number {
    if (value === null || value === undefined || value === '') {
        return fallback
    }

    const parsed = Number(String(value).replace(',', '.').replace(/\s/g, ''))

    return Number.isFinite(parsed) ? parsed : fallback
}

function normalizePeriod(value: unknown): PeriodKey {
    const period = String(value || '').trim() as PeriodKey

    return PERIODS.has(period) ? period : 'today'
}

function startOfLocalDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

function addDays(date: Date, days: number): Date {
    const next = new Date(date)
    next.setDate(next.getDate() + days)
    return next
}

function addMonths(date: Date, months: number): Date {
    const next = new Date(date)
    next.setMonth(next.getMonth() + months)
    return next
}

function addYears(date: Date, years: number): Date {
    const next = new Date(date)
    next.setFullYear(next.getFullYear() + years)
    return next
}

function parseDateInput(value: string | null, fallback: Date): Date {
    if (!value) {
        return fallback
    }

    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)

    if (!match) {
        return fallback
    }

    const year = Number(match[1])
    const month = Number(match[2]) - 1
    const day = Number(match[3])
    const parsed = new Date(year, month, day, 0, 0, 0, 0)

    return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

function getDateRange(request: NextRequest) {
    const url = new URL(request.url)
    const period = normalizePeriod(url.searchParams.get('period'))
    const today = startOfLocalDay(new Date())

    if (period === 'custom') {
        const fallbackFrom = addDays(today, -6)
        const from = parseDateInput(url.searchParams.get('from'), fallbackFrom)
        const toDate = parseDateInput(url.searchParams.get('to'), today)
        const to = addDays(toDate, 1)

        return { period, from, to }
    }

    if (period === 'yesterday') {
        const from = addDays(today, -1)
        return { period, from, to: today }
    }

    if (period === 'week') {
        return { period, from: addDays(today, -6), to: addDays(today, 1) }
    }

    if (period === 'month') {
        const from = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0)
        return { period, from, to: addMonths(from, 1) }
    }

    if (period === 'year') {
        const from = new Date(today.getFullYear(), 0, 1, 0, 0, 0, 0)
        return { period, from, to: addYears(from, 1) }
    }

    return { period, from: today, to: addDays(today, 1) }
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : []
}

function readItemProductId(item: any): number | null {
    const candidates = [
        item?.productId,
        item?.product_id,
        item?.id,
        item?.product?.id,
    ]

    for (const candidate of candidates) {
        const parsed = Number(candidate)

        if (Number.isInteger(parsed) && parsed > 0) {
            return parsed
        }
    }

    return null
}

function readItemName(item: any): string {
    return String(
        item?.name ??
        item?.title ??
        item?.productName ??
        item?.product?.name ??
        'Товар'
    ).trim() || 'Товар'
}

function readItemUnit(item: any): string {
    const unit = String(item?.unit ?? item?.product?.unit ?? '').trim().toLowerCase()

    return unit === 'weight' ? 'weight' : 'piece'
}

function readPurchasePrice(item: any, productFallback?: ProductFallbackRow): number {
    const raw =
        item?.purchasePrice ??
        item?.purchase_price ??
        item?.product?.purchasePrice ??
        item?.product?.purchase_price

    const parsed = toNumber(raw, NaN)

    if (Number.isFinite(parsed)) {
        return parsed
    }

    return toNumber(productFallback?.purchase_price, 0)
}

function readSellingPrice(item: any, productFallback?: ProductFallbackRow): number {
    const raw =
        item?.price ??
        item?.sellingPrice ??
        item?.selling_price ??
        item?.product?.sellingPrice ??
        item?.product?.selling_price

    const parsed = toNumber(raw, NaN)

    if (Number.isFinite(parsed)) {
        return parsed
    }

    return toNumber(productFallback?.selling_price, 0)
}

function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundQty(value: number): number {
    return Math.round((value + Number.EPSILON) * 1000) / 1000
}

function formatDateForPayload(date: Date): string {
    return date.toISOString()
}

function assertMainWarehouse(locationSlug: string) {
    if (locationSlug !== 'main-warehouse') {
        throw new Error('Раздел доступен только в зоне Главный склад')
    }
}

export async function GET(request: NextRequest) {
    try {
        const { location } = await resolveWarehouseContext(pool, request)
        assertMainWarehouse(location.slug)

        const url = new URL(request.url)
        const selectedLocation = String(url.searchParams.get('location') || 'all').trim()
        const { period, from, to } = getDateRange(request)

        const storeLocationsResult = await pool.query<StoreLocationRow>(
            `
            SELECT id, name, slug
            FROM locations
            WHERE type = 'store' AND is_active = TRUE
            ORDER BY id ASC
            `
        )

        const allowedStoreSlugs = new Set(storeLocationsResult.rows.map(row => row.slug))
        const locationFilter = selectedLocation !== 'all' && allowedStoreSlugs.has(selectedLocation)
            ? selectedLocation
            : 'all'

        const params: unknown[] = [from.toISOString(), to.toISOString()]
        let locationSql = ''

        if (locationFilter !== 'all') {
            params.push(locationFilter)
            locationSql = `AND l.slug = $${params.length}`
        }

        const receiptsResult = await pool.query<ReceiptRow>(
            `
            SELECT
                r.id,
                r.created_at,
                r.payment_method,
                r.total,
                r.items,
                l.id AS location_id,
                l.name AS location_name,
                l.slug AS location_slug
            FROM receipts r
            JOIN locations l ON l.id = r.location_id
            WHERE l.type = 'store'
              AND r.created_at >= $1::timestamptz
              AND r.created_at < $2::timestamptz
              ${locationSql}
            ORDER BY r.created_at DESC, r.id DESC
            `,
            params
        )

        const productIds = new Set<number>()

        for (const receipt of receiptsResult.rows) {
            for (const item of asArray(receipt.items)) {
                const productId = readItemProductId(item)

                if (productId) {
                    productIds.add(productId)
                }
            }
        }

        const productFallbacks = new Map<number, ProductFallbackRow>()

        if (productIds.size > 0) {
            const productsResult = await pool.query<ProductFallbackRow>(
                `
                SELECT id, purchase_price, selling_price
                FROM products
                WHERE id = ANY($1::int[])
                `,
                [Array.from(productIds)]
            )

            for (const product of productsResult.rows) {
                productFallbacks.set(Number(product.id), product)
            }
        }

        const receiptCount = receiptsResult.rows.length
        const revenue = roundMoney(receiptsResult.rows.reduce((sum, row) => sum + toNumber(row.total, 0), 0))
        const averageCheck = receiptCount > 0 ? roundMoney(revenue / receiptCount) : 0

        const parsedItems: ParsedReceiptItem[] = []

        for (const receipt of receiptsResult.rows) {
            for (const rawItem of asArray(receipt.items)) {
                const item = rawItem as any
                const productId = readItemProductId(item)
                const productFallback = productId ? productFallbacks.get(productId) : undefined
                const quantity = roundQty(toNumber(item?.quantity, 0))
                const sellingPrice = readSellingPrice(item, productFallback)
                const purchasePrice = readPurchasePrice(item, productFallback)
                const rawTotal = toNumber(item?.total, NaN)
                const total = Number.isFinite(rawTotal) ? rawTotal : quantity * sellingPrice

                if (quantity <= 0) {
                    continue
                }

                parsedItems.push({
                    productId,
                    name: readItemName(item),
                    unit: readItemUnit(item),
                    quantity,
                    purchasePrice,
                    sellingPrice,
                    total: roundMoney(total),
                    locationSlug: receipt.location_slug,
                    locationName: receipt.location_name,
                })
            }
        }

        const cost = roundMoney(parsedItems.reduce((sum, item) => sum + item.quantity * item.purchasePrice, 0))
        const estimatedProfit = roundMoney(revenue - cost)
        const soldItems = roundQty(parsedItems.reduce((sum, item) => sum + (item.unit === 'weight' ? 1 : item.quantity), 0))

        const byLocationMap = new Map<string, {
            slug: string
            name: string
            receiptCount: number
            revenue: number
            cost: number
            estimatedProfit: number
            soldItems: number
        }>()

        for (const storeLocation of storeLocationsResult.rows) {
            if (locationFilter !== 'all' && storeLocation.slug !== locationFilter) {
                continue
            }

            byLocationMap.set(storeLocation.slug, {
                slug: storeLocation.slug,
                name: storeLocation.name,
                receiptCount: 0,
                revenue: 0,
                cost: 0,
                estimatedProfit: 0,
                soldItems: 0,
            })
        }

        for (const receipt of receiptsResult.rows) {
            const record = byLocationMap.get(receipt.location_slug)

            if (!record) {
                continue
            }

            record.receiptCount += 1
            record.revenue += toNumber(receipt.total, 0)
        }

        for (const item of parsedItems) {
            const record = byLocationMap.get(item.locationSlug)

            if (!record) {
                continue
            }

            record.cost += item.quantity * item.purchasePrice
            record.soldItems += item.unit === 'weight' ? 1 : item.quantity
        }

        const byLocation = Array.from(byLocationMap.values()).map(record => ({
            ...record,
            revenue: roundMoney(record.revenue),
            cost: roundMoney(record.cost),
            estimatedProfit: roundMoney(record.revenue - record.cost),
            averageCheck: record.receiptCount > 0 ? roundMoney(record.revenue / record.receiptCount) : 0,
            soldItems: roundQty(record.soldItems),
        }))

        const byPaymentMap = new Map<string, { method: string; label: string; count: number; total: number }>()

        for (const receipt of receiptsResult.rows) {
            const method = String(receipt.payment_method || 'unknown')
            const current = byPaymentMap.get(method) || {
                method,
                label: PAYMENT_LABELS[method] || method,
                count: 0,
                total: 0,
            }

            current.count += 1
            current.total += toNumber(receipt.total, 0)
            byPaymentMap.set(method, current)
        }

        const byPayment = Array.from(byPaymentMap.values()).map(record => ({
            ...record,
            total: roundMoney(record.total),
        }))

        const productMap = new Map<string, {
            key: string
            productId: number | null
            name: string
            quantity: number
            revenue: number
            cost: number
            estimatedProfit: number
        }>()

        for (const item of parsedItems) {
            const key = item.productId ? `id:${item.productId}` : `name:${item.name}`
            const current = productMap.get(key) || {
                key,
                productId: item.productId,
                name: item.name,
                quantity: 0,
                revenue: 0,
                cost: 0,
                estimatedProfit: 0,
            }

            current.quantity += item.quantity
            current.revenue += item.total
            current.cost += item.quantity * item.purchasePrice
            current.estimatedProfit = current.revenue - current.cost
            productMap.set(key, current)
        }

        const topProducts = Array.from(productMap.values())
            .map(record => ({
                ...record,
                quantity: roundQty(record.quantity),
                revenue: roundMoney(record.revenue),
                cost: roundMoney(record.cost),
                estimatedProfit: roundMoney(record.estimatedProfit),
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 20)

        return NextResponse.json({
            period,
            from: formatDateForPayload(from),
            to: formatDateForPayload(to),
            selectedLocation: locationFilter,
            storeLocations: storeLocationsResult.rows.map(row => ({
                id: Number(row.id),
                name: row.name,
                slug: row.slug,
            })),
            summary: {
                receiptCount,
                revenue,
                averageCheck,
                cost,
                estimatedProfit,
                soldItems,
            },
            byLocation,
            byPayment,
            topProducts,
        })
    } catch (error) {
        console.error('GET /api/statistics error:', error)

        return NextResponse.json(
            { message: error instanceof Error ? error.message : 'Не удалось загрузить статистику' },
            { status: error instanceof Error && error.message.includes('Главный склад') ? 403 : 500 }
        )
    }
}

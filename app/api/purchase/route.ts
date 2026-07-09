import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'
import { resolveWarehouseContext } from '@/app/lib/serverWarehouseLocation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ProductUnit = 'piece' | 'weight'

type PurchaseRow = {
    product_id: number
    name: string
    category: string
    barcode: string
    unit: ProductUnit | string | null
    purchase_price: string | number | null
    selling_price: string | number | null
    min_stock: string | number | null
    location_id: number
    location_name: string
    location_slug: string
    stock: string | number | null
}

type StoreLocationRow = {
    id: number
    name: string
    slug: string
}

type PurchaseLocationItem = {
    locationId: number
    locationName: string
    locationSlug: string
    stock: number
    suggestedQuantity: number
    estimatedPurchaseAmount: number
}

type PurchaseItem = {
    productId: number
    name: string
    category: string
    barcode: string
    unit: ProductUnit
    purchasePrice: number
    sellingPrice: number
    minStock: number
    totalSuggestedQuantity: number
    totalEstimatedPurchaseAmount: number
    locations: PurchaseLocationItem[]
}

type NormalizedPurchaseRow = {
    productId: number
    name: string
    category: string
    barcode: string
    unit: ProductUnit
    purchasePrice: number
    sellingPrice: number
    minStock: number
    locationId: number
    locationName: string
    locationSlug: string
    stock: number
    suggestedQuantity: number
    estimatedPurchaseAmount: number
}

function toNumber(value: unknown): number {
    const parsed = Number(String(value ?? '0').replace(',', '.').replace(/\s/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
}

function normalizeUnit(value: unknown): ProductUnit {
    return value === 'weight' ? 'weight' : 'piece'
}

function roundQuantity(value: number, unit: ProductUnit): number {
    if (unit === 'weight') {
        return Math.round((value + Number.EPSILON) * 1000) / 1000
    }

    return Math.ceil(value)
}

function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100
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
        const selectedCategory = String(url.searchParams.get('category') || 'all').trim()
        const mode = String(url.searchParams.get('mode') || 'below-min').trim()

        const storesResult = await pool.query<StoreLocationRow>(
            `
            SELECT id, name, slug
            FROM locations
            WHERE type = 'store' AND is_active = TRUE
            ORDER BY id ASC
            `
        )

        const storeSlugSet = new Set(storesResult.rows.map(row => row.slug))
        const locationFilter = selectedLocation !== 'all' && storeSlugSet.has(selectedLocation)
            ? selectedLocation
            : 'all'

        const categoryResult = await pool.query<{ category: string }>(
            `
            SELECT DISTINCT COALESCE(NULLIF(TRIM(category), ''), 'Без категории') AS category
            FROM products
            ORDER BY category ASC
            `
        )

        const params: unknown[] = []
        const where: string[] = [
            `l.type = 'store'`,
            `l.is_active = TRUE`,
        ]

        if (locationFilter !== 'all') {
            params.push(locationFilter)
            where.push(`l.slug = $${params.length}`)
        }

        if (selectedCategory !== 'all') {
            params.push(selectedCategory)
            where.push(`COALESCE(NULLIF(TRIM(p.category), ''), 'Без категории') = $${params.length}`)
        }

        const result = await pool.query<PurchaseRow>(
            `
            SELECT
                p.id AS product_id,
                p.name,
                COALESCE(NULLIF(TRIM(p.category), ''), 'Без категории') AS category,
                COALESCE(p.barcode, '') AS barcode,
                COALESCE(p.unit, 'piece') AS unit,
                p.purchase_price,
                p.selling_price,
                p.min_stock,
                l.id AS location_id,
                l.name AS location_name,
                l.slug AS location_slug,
                COALESCE(ps.stock, 0) AS stock
            FROM products p
            CROSS JOIN locations l
            LEFT JOIN product_stocks ps ON ps.product_id = p.id AND ps.location_id = l.id
            WHERE ${where.join(' AND ')}
            ORDER BY p.category ASC, p.name ASC, l.id ASC
            `,
            params
        )

        const rows: NormalizedPurchaseRow[] = result.rows.map(row => {
            const unit = normalizeUnit(row.unit)
            const stock = toNumber(row.stock)
            const minStock = toNumber(row.min_stock)
            const shortageRaw = minStock - stock
            const suggestedQuantity = shortageRaw > 0 ? roundQuantity(shortageRaw, unit) : 0
            const purchasePrice = toNumber(row.purchase_price)

            return {
                productId: Number(row.product_id),
                name: row.name,
                category: row.category,
                barcode: row.barcode,
                unit,
                purchasePrice,
                sellingPrice: toNumber(row.selling_price),
                minStock,
                locationId: Number(row.location_id),
                locationName: row.location_name,
                locationSlug: row.location_slug,
                stock,
                suggestedQuantity,
                estimatedPurchaseAmount: roundMoney(suggestedQuantity * purchasePrice),
            }
        }).filter(row => {
            if (mode === 'all') {
                return true
            }

            if (mode === 'zero') {
                return row.stock <= 0
            }

            return row.suggestedQuantity > 0
        })

        const productMap = new Map<number, PurchaseItem>()

        for (const row of rows) {
            const existing = productMap.get(row.productId)
            const current: PurchaseItem = existing ?? {
                productId: row.productId,
                name: row.name,
                category: row.category,
                barcode: row.barcode,
                unit: row.unit,
                purchasePrice: row.purchasePrice,
                sellingPrice: row.sellingPrice,
                minStock: row.minStock,
                totalSuggestedQuantity: 0,
                totalEstimatedPurchaseAmount: 0,
                locations: [],
            }

            current.totalSuggestedQuantity += row.suggestedQuantity
            current.totalEstimatedPurchaseAmount += row.estimatedPurchaseAmount
            current.locations.push({
                locationId: row.locationId,
                locationName: row.locationName,
                locationSlug: row.locationSlug,
                stock: row.stock,
                suggestedQuantity: row.suggestedQuantity,
                estimatedPurchaseAmount: row.estimatedPurchaseAmount,
            })

            productMap.set(row.productId, current)
        }

        const items = Array.from(productMap.values())
            .map((item): PurchaseItem => ({
                ...item,
                totalSuggestedQuantity: roundQuantity(item.totalSuggestedQuantity, item.unit),
                totalEstimatedPurchaseAmount: roundMoney(item.totalEstimatedPurchaseAmount),
            }))
            .sort((a, b) => {
                if (a.category !== b.category) {
                    return a.category.localeCompare(b.category, 'ru')
                }

                return a.name.localeCompare(b.name, 'ru')
            })

        const summary = {
            productCount: items.length,
            totalSuggestedQuantity: roundMoney(items.reduce((sum, item) => sum + item.totalSuggestedQuantity, 0)),
            totalEstimatedPurchaseAmount: roundMoney(items.reduce((sum, item) => sum + item.totalEstimatedPurchaseAmount, 0)),
        }

        return NextResponse.json({
            selectedLocation: locationFilter,
            selectedCategory,
            mode,
            locations: storesResult.rows.map(row => ({
                id: Number(row.id),
                name: row.name,
                slug: row.slug,
            })),
            categories: categoryResult.rows.map(row => row.category),
            summary,
            items,
        })
    } catch (error) {
        console.error('GET /api/purchase error:', error)

        return NextResponse.json(
            { message: error instanceof Error ? error.message : 'Не удалось сформировать закупочный лист' },
            { status: error instanceof Error && error.message.includes('Главный склад') ? 403 : 500 }
        )
    }
}

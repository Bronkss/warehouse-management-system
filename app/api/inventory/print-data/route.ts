import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'
import { resolveWarehouseContext } from '@/app/lib/serverWarehouseLocation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ProductUnit = 'piece' | 'weight'

type InventoryProductRow = {
    id: number
    name: string
    category: string | null
    barcode: string | null
    unit: ProductUnit | string | null
    stock: string | number | null
}

function normalizeCategory(value: unknown): string {
    return String(value ?? '').trim() || 'Без категории'
}

function normalizeUnit(value: unknown): ProductUnit {
    return value === 'weight' ? 'weight' : 'piece'
}

function toNumber(value: unknown): number {
    const parsed = Number(String(value ?? '0').replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : 0
}

function getSelectedCategories(request: NextRequest): string[] {
    const url = new URL(request.url)
    const repeated = url.searchParams.getAll('category')
    const commaSeparated = String(url.searchParams.get('categories') || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)

    const categories = [...repeated, ...commaSeparated]
        .map(normalizeCategory)
        .filter(Boolean)

    return Array.from(new Set(categories))
}

function makeInventoryNumber(): string {
    const now = new Date()
    const pad = (value: number) => String(value).padStart(2, '0')

    const date = [
        now.getFullYear(),
        pad(now.getMonth() + 1),
        pad(now.getDate()),
    ].join('')

    const time = [
        pad(now.getHours()),
        pad(now.getMinutes()),
        pad(now.getSeconds()),
    ].join('')

    return `INV-${date}-${time}`
}

export async function GET(request: NextRequest) {
    try {
        const { location, user } = await resolveWarehouseContext(pool, request)
        const categories = getSelectedCategories(request)

        if (categories.length === 0) {
            return NextResponse.json(
                { message: 'Выберите хотя бы одну категорию для инвентаризации' },
                { status: 400 }
            )
        }

        const result = await pool.query<InventoryProductRow>(
            `
            SELECT
                p.id,
                p.name,
                COALESCE(NULLIF(TRIM(p.category), ''), 'Без категории') AS category,
                p.barcode,
                p.unit,
                COALESCE(ps.stock, 0) AS stock
            FROM products p
            LEFT JOIN product_stocks ps
                ON ps.product_id = p.id
               AND ps.location_id = $1
            WHERE COALESCE(NULLIF(TRIM(p.category), ''), 'Без категории') = ANY($2::text[])
            ORDER BY
                COALESCE(NULLIF(TRIM(p.category), ''), 'Без категории') ASC,
                LOWER(p.name) ASC,
                p.id ASC
            `,
            [location.id, categories]
        )

        return NextResponse.json({
            documentNumber: makeInventoryNumber(),
            createdAt: new Date().toISOString(),
            location,
            user: {
                login: user.login,
                name: user.name,
                role: user.role,
            },
            categories,
            products: result.rows.map(row => ({
                id: Number(row.id),
                name: row.name,
                category: normalizeCategory(row.category),
                barcode: row.barcode || '',
                unit: normalizeUnit(row.unit),
                stock: toNumber(row.stock),
            })),
        })
    } catch (error) {
        console.error('GET /api/inventory/print-data error:', error)

        return NextResponse.json(
            {
                message: error instanceof Error
                    ? error.message
                    : 'Не удалось сформировать инвентаризационную ведомость',
            },
            { status: 500 }
        )
    }
}

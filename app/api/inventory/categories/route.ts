import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'
import { resolveWarehouseContext } from '@/app/lib/serverWarehouseLocation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CategoryRow = {
    category: string | null
    products_count: string | number
    total_stock: string | number
    zero_stock_count: string | number
}

function toNumber(value: unknown): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

export async function GET(request: NextRequest) {
    try {
        const { location, user } = await resolveWarehouseContext(pool, request)

        const result = await pool.query<CategoryRow>(
            `
            SELECT
                COALESCE(NULLIF(TRIM(p.category), ''), 'Без категории') AS category,
                COUNT(p.id) AS products_count,
                COALESCE(SUM(COALESCE(ps.stock, 0)), 0) AS total_stock,
                COUNT(p.id) FILTER (WHERE COALESCE(ps.stock, 0) <= 0) AS zero_stock_count
            FROM products p
            LEFT JOIN product_stocks ps
                ON ps.product_id = p.id
               AND ps.location_id = $1
            GROUP BY COALESCE(NULLIF(TRIM(p.category), ''), 'Без категории')
            ORDER BY COALESCE(NULLIF(TRIM(p.category), ''), 'Без категории') ASC
            `,
            [location.id]
        )

        return NextResponse.json({
            location,
            user: {
                login: user.login,
                name: user.name,
                role: user.role,
            },
            categories: result.rows.map(row => ({
                category: row.category || 'Без категории',
                productsCount: toNumber(row.products_count),
                totalStock: toNumber(row.total_stock),
                zeroStockCount: toNumber(row.zero_stock_count),
            })),
        })
    } catch (error) {
        console.error('GET /api/inventory/categories error:', error)

        return NextResponse.json(
            {
                message: error instanceof Error
                    ? error.message
                    : 'Не удалось загрузить категории для инвентаризации',
            },
            { status: 500 }
        )
    }
}

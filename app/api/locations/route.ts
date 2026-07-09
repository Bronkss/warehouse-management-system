import { NextRequest, NextResponse } from 'next/server'
import type { QueryResultRow } from 'pg'
import { pool } from '@/app/lib/db'
import { resolveWarehouseLocation } from '@/app/lib/serverWarehouseLocation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type LocationRow = QueryResultRow & {
    id: number
    name: string
    slug: string
    type: 'warehouse' | 'store'
}

export async function GET(request: NextRequest) {
    try {
        const currentLocation = await resolveWarehouseLocation(pool, request)

        const result = await pool.query<LocationRow>(
            `
            SELECT id, name, slug, type
            FROM locations
            WHERE is_active = TRUE
            ORDER BY
                CASE WHEN type = 'warehouse' THEN 0 ELSE 1 END,
                id ASC
            `
        )

        return NextResponse.json({
            currentLocation,
            items: result.rows.map(row => ({
                id: Number(row.id),
                name: row.name,
                slug: row.slug,
                type: row.type,
                isCurrent: Number(row.id) === currentLocation.id,
            })),
        }, {
            headers: {
                'Cache-Control': 'private, no-store',
            },
        })
    } catch (error) {
        console.error('GET /api/locations error:', error)

        return NextResponse.json(
            { message: 'Не удалось загрузить торговые зоны' },
            { status: 500 }
        )
    }
}

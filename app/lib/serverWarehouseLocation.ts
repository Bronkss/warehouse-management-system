import type { QueryResult, QueryResultRow } from 'pg'
import type { NextRequest } from 'next/server'

export const DEFAULT_WAREHOUSE_LOCATION_SLUG = 'tochka'
export const WAREHOUSE_LOCATION_COOKIE = 'warehouse_location_slug'
export const WAREHOUSE_LOCATION_HEADER = 'x-warehouse-locations'

export type WarehouseLocation = {
    id: number
    name: string
    slug: string
    type: 'warehouse' | 'store'
}

type WarehouseLocationRow = QueryResultRow & {
    id: number
    name: string
    slug: string
    type: 'warehouse' | 'store'
}

type Queryable = {
    query<T extends QueryResultRow = QueryResultRow>(
        queryText: string,
        values?: readonly unknown[]
    ): Promise<QueryResult<T>>
}

export function normalizeWarehouseLocationSlug(value: unknown): string {
    const raw = String(value || '').trim().toLowerCase()

    if (!raw) {
        return DEFAULT_WAREHOUSE_LOCATION_SLUG
    }

    if (raw === 'main' || raw === 'warehouse' || raw === 'sklad' || raw === 'glavny-sklad') {
        return 'main-warehouse'
    }

    if (raw === 'точка') {
        return 'tochka'
    }

    if (raw === 'родник') {
        return 'rodnik'
    }

    return raw.replace(/[^a-z0-9_-]/g, '') || DEFAULT_WAREHOUSE_LOCATION_SLUG
}

export function getWarehouseLocationSlugFromRequest(request: NextRequest): string {
    const url = new URL(request.url)

    return normalizeWarehouseLocationSlug(
        request.cookies.get(WAREHOUSE_LOCATION_COOKIE)?.value ||
        request.headers.get(WAREHOUSE_LOCATION_HEADER) ||
        url.searchParams.get('location') ||
        url.searchParams.get('locationSlug') ||
        DEFAULT_WAREHOUSE_LOCATION_SLUG
    )
}

export async function resolveWarehouseLocation(
    queryable: Queryable,
    request: NextRequest
): Promise<WarehouseLocation> {
    const slug = getWarehouseLocationSlugFromRequest(request)

    const result = await queryable.query<WarehouseLocationRow>(
        `
        SELECT id, name, slug, type
        FROM locations
        WHERE slug = $1 AND is_active = TRUE
        LIMIT 1
        `,
        [slug]
    )

    if (result.rows[0]) {
        return {
            id: Number(result.rows[0].id),
            name: result.rows[0].name,
            slug: result.rows[0].slug,
            type: result.rows[0].type,
        }
    }

    if (slug !== DEFAULT_WAREHOUSE_LOCATION_SLUG) {
        const fallback = await queryable.query<WarehouseLocationRow>(
            `
            SELECT id, name, slug, type
            FROM locations
            WHERE slug = $1 AND is_active = TRUE
            LIMIT 1
            `,
            [DEFAULT_WAREHOUSE_LOCATION_SLUG]
        )

        if (fallback.rows[0]) {
            return {
                id: Number(fallback.rows[0].id),
                name: fallback.rows[0].name,
                slug: fallback.rows[0].slug,
                type: fallback.rows[0].type,
            }
        }
    }

    throw new Error('Торговая зона не найдена. Сначала выполните SQL-миграцию locations/product_stocks.')
}

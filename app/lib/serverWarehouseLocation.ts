import type { QueryResult, QueryResultRow } from 'pg'
import type { NextRequest } from 'next/server'

export const DEFAULT_WAREHOUSE_LOCATION_SLUG = 'tochka'
export const WAREHOUSE_LOCATION_COOKIE = 'warehouse_location_slug'
export const WAREHOUSE_LOCATION_HEADER = 'x-warehouse-location'

export const WAREHOUSE_USER_LOGIN_COOKIE = 'warehouse_user_login'
export const WAREHOUSE_USER_NAME_COOKIE = 'warehouse_user_name'
export const WAREHOUSE_USER_ROLE_COOKIE = 'warehouse_user_role'
export const WAREHOUSE_USER_LOGIN_HEADER = 'x-warehouse-user-login'
export const WAREHOUSE_USER_NAME_HEADER = 'x-warehouse-user-name'
export const WAREHOUSE_USER_ROLE_HEADER = 'x-warehouse-user-role'

export type WarehouseLocation = {
    id: number
    name: string
    slug: string
    type: 'warehouse' | 'store'
}

export type WarehouseUser = {
    login: string
    name: string
    role: 'admin' | 'warehouse' | 'cashier'
    locationSlugs: string[]
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

const WAREHOUSE_USERS: WarehouseUser[] = [
    {
        login: 'admin',
        name: 'Администратор',
        role: 'admin',
        locationSlugs: ['main-warehouse', 'tochka', 'rodnik'],
    },
    {
        login: 'sklad',
        name: 'Главный склад',
        role: 'warehouse',
        locationSlugs: ['main-warehouse'],
    },
    {
        login: 'tochka_lada',
        name: 'Лада Якимова',
        role: 'cashier',
        locationSlugs: ['tochka'],
    },
    {
        login: 'tochka_elena',
        name: 'Елена Цыганкова',
        role: 'cashier',
        locationSlugs: ['tochka'],
    },
    {
        login: 'tochka_anastasia',
        name: 'Анастасия Котова',
        role: 'cashier',
        locationSlugs: ['tochka'],
    },
    {
        login: 'rodnik_anastasia',
        name: 'Анастасия Котова',
        role: 'cashier',
        locationSlugs: ['rodnik'],
    },
    {
        login: 'rodnik_tatyana',
        name: 'Татьяна',
        role: 'cashier',
        locationSlugs: ['rodnik'],
    },
]

function normalizeText(value: unknown): string {
    return String(value ?? '').trim()
}

function decodeCookieValue(value: string): string {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}

function readRequestValue(request: NextRequest, cookieName: string, headerName: string): string {
    const headerValue = request.headers.get(headerName)

    if (headerValue) {
        return normalizeText(headerValue)
    }

    const cookieValue = request.cookies.get(cookieName)?.value

    return normalizeText(cookieValue ? decodeCookieValue(cookieValue) : '')
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

export function getWarehouseUserFromRequest(request: NextRequest): WarehouseUser {
    const login = normalizeText(
        readRequestValue(request, WAREHOUSE_USER_LOGIN_COOKIE, WAREHOUSE_USER_LOGIN_HEADER)
    ).toLowerCase()

    if (!login) {
        throw new Error('Пользователь не определён. Выйдите из системы и войдите заново.')
    }

    const knownUser = WAREHOUSE_USERS.find(user => user.login === login)

    if (knownUser) {
        return knownUser
    }

    const name = readRequestValue(request, WAREHOUSE_USER_NAME_COOKIE, WAREHOUSE_USER_NAME_HEADER)
    const rawRole = readRequestValue(request, WAREHOUSE_USER_ROLE_COOKIE, WAREHOUSE_USER_ROLE_HEADER)
    const role: WarehouseUser['role'] = rawRole === 'admin' || rawRole === 'warehouse' ? rawRole : 'cashier'

    return {
        login,
        name: name || login,
        role,
        locationSlugs: [getWarehouseLocationSlugFromRequest(request)],
    }
}

export function assertWarehouseUserCanUseLocation(user: WarehouseUser, location: WarehouseLocation) {
    if (user.role === 'admin') {
        return
    }

    if (!user.locationSlugs.includes(location.slug)) {
        throw new Error(`Пользователь «${user.name}» не имеет доступа к зоне «${location.name}»`)
    }
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

export async function resolveWarehouseContext(queryable: Queryable, request: NextRequest) {
    const location = await resolveWarehouseLocation(queryable, request)
    const user = getWarehouseUserFromRequest(request)

    assertWarehouseUserCanUseLocation(user, location)

    return {
        location,
        user,
    }
}

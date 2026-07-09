import { NextRequest, NextResponse } from 'next/server'
import type { QueryResult, QueryResultRow } from 'pg'
import { resolveWarehouseContext, type WarehouseLocation, type WarehouseUser } from '@/app/lib/serverWarehouseLocation'
import {
    canUseWarehouseSection,
    getForbiddenSectionMessage,
    type WarehouseSection,
} from '@/app/lib/warehouseAccess'

type Queryable = {
    query<T extends QueryResultRow = QueryResultRow>(
        queryText: string,
        values?: readonly unknown[]
    ): Promise<QueryResult<T>>
}

type WarehouseApiContext = {
    location: WarehouseLocation
    user: WarehouseUser
}

type WarehouseAccessAllowed = {
    ok: true
    context: WarehouseApiContext
}

type WarehouseAccessDenied = {
    ok: false
    response: NextResponse
}

export type WarehouseAccessResult = WarehouseAccessAllowed | WarehouseAccessDenied

function getAuthErrorStatus(error: unknown): number {
    const message = error instanceof Error ? error.message : ''

    if (message.includes('Пользователь не определён')) {
        return 401
    }

    if (message.includes('не имеет доступа')) {
        return 403
    }

    return 500
}

export async function requireWarehouseSection(
    queryable: Queryable,
    request: NextRequest,
    section: WarehouseSection
): Promise<WarehouseAccessResult> {
    try {
        const context = await resolveWarehouseContext(queryable, request)

        if (!canUseWarehouseSection(context.location.slug, context.location.type, section)) {
            return {
                ok: false,
                response: NextResponse.json(
                    { message: getForbiddenSectionMessage(context.location.name, section) },
                    { status: 403 }
                ),
            }
        }

        return {
            ok: true,
            context,
        }
    } catch (error) {
        console.error(`Warehouse access check error for section ${section}:`, error)

        return {
            ok: false,
            response: NextResponse.json(
                {
                    message: error instanceof Error
                        ? error.message
                        : 'Не удалось проверить доступ пользователя',
                },
                { status: getAuthErrorStatus(error) }
            ),
        }
    }
}

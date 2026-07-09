import { NextRequest, NextResponse } from 'next/server'
import type { QueryResultRow } from 'pg'
import { pool } from '@/app/lib/db'
import { resolveWarehouseContext } from '@/app/lib/serverWarehouseLocation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type WriteoffHistoryRow = QueryResultRow & {
    id: number
    number: string
    reason: string | null
    reason_label: string | null
    responsible: string | null
    comment: string | null
    total_rows: number | string | null
    total_quantity: number | string | null
    total_purchase_amount: number | string | null
    total_selling_amount: number | string | null
    status: string | null
    created_at: string
    updated_at: string
    location_id: number
    location_name: string
    location_slug: string
}

function toNumber(value: unknown): number {
    const parsed = Number(String(value ?? '0').replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : 0
}

export async function GET(request: NextRequest) {
    try {
        const { location } = await resolveWarehouseContext(pool, request)

        const result = await pool.query<WriteoffHistoryRow>(
            `
            SELECT
                w.id,
                w.number,
                w.reason,
                w.reason_label,
                w.responsible,
                w.comment,
                w.total_rows,
                w.total_quantity,
                w.total_purchase_amount,
                w.total_selling_amount,
                w.status,
                w.created_at,
                w.updated_at,
                COALESCE(w.created_by_name, '') AS created_by_name,
                COALESCE(w.created_by_login, '') AS created_by_login,
                w.location_id,
                l.name AS location_name,
                l.slug AS location_slug
            FROM writeoffs w
            JOIN locations l ON l.id = w.location_id
            WHERE w.location_id = $1
            ORDER BY w.created_at DESC, w.id DESC
            LIMIT 300
            `,
            [location.id]
        )

        return NextResponse.json(
            result.rows.map(row => ({
                id: Number(row.id),
                number: String(row.number || ''),
                reason: String(row.reason || ''),
                reasonLabel: String(row.reason_label || ''),
                responsible: String(row.responsible || ''),
                comment: String(row.comment || ''),
                locationId: Number(row.location_id),
                locationName: String(row.location_name || location.name),
                locationSlug: String(row.location_slug || location.slug),
                totalRows: Number(row.total_rows || 0),
                totalQuantity: toNumber(row.total_quantity),
                totalPurchaseAmount: toNumber(row.total_purchase_amount),
                totalSellingAmount: toNumber(row.total_selling_amount),
                status: String(row.status || ''),
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                createdByName: (row as any).created_by_name || '',
                createdByLogin: (row as any).created_by_login || '',
            }))
        )
    } catch (error) {
        console.error('Writeoff history GET error:', error)

        return NextResponse.json(
            { message: 'Не удалось загрузить историю списаний' },
            { status: 500 }
        )
    }
}

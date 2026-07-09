import { NextRequest, NextResponse } from 'next/server'
import type { QueryResultRow } from 'pg'
import { pool } from '@/app/lib/db'
import { resolveWarehouseContext } from '@/app/lib/serverWarehouseLocation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ShipmentHistoryRow = QueryResultRow & {
    id: number
    number: string
    transfer_barcode: string | null
    shipper: string | null
    consignee: string | null
    total_rows: number
    total_quantity: string | number
    total_amount: string | number
    status: string
    created_at: string
    updated_at: string
    shipped_at: string | null
    received_at: string | null
    from_location_id: number | null
    to_location_id: number | null
    from_location_name: string | null
    from_location_slug: string | null
    to_location_name: string | null
    to_location_slug: string | null
}

function mapHistoryItem(row: ShipmentHistoryRow, currentLocationId: number) {
    const fromLocationId = row.from_location_id ? Number(row.from_location_id) : null
    const toLocationId = row.to_location_id ? Number(row.to_location_id) : null

    let direction: 'outgoing' | 'incoming' | 'legacy' = 'legacy'

    if (fromLocationId === currentLocationId) {
        direction = 'outgoing'
    } else if (toLocationId === currentLocationId) {
        direction = 'incoming'
    }

    return {
        id: Number(row.id),
        number: row.number,
        transferBarcode: row.transfer_barcode || '',
        shipper: row.shipper || '',
        consignee: row.consignee || '',
        totalRows: Number(row.total_rows || 0),
        totalQuantity: Number(row.total_quantity || 0),
        totalAmount: Number(row.total_amount || 0),
        status: row.status || 'shipped',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        shippedAt: row.shipped_at,
        receivedAt: row.received_at,
        fromLocationId,
        toLocationId,
        fromLocationName: row.from_location_name || '',
        fromLocationSlug: row.from_location_slug || '',
        toLocationName: row.to_location_name || '',
        toLocationSlug: row.to_location_slug || '',
        direction,
        createdByName: (row as any).created_by_name || '',
        createdByLogin: (row as any).created_by_login || '',
    }
}

export async function GET(request: NextRequest) {
    try {
        const { location } = await resolveWarehouseContext(pool, request)

        const result = await pool.query<ShipmentHistoryRow>(
            `
            SELECT
                s.id,
                s.number,
                s.transfer_barcode,
                s.shipper,
                s.consignee,
                s.total_rows,
                s.total_quantity,
                s.total_amount,
                s.status,
                s.created_at,
                s.updated_at,
                s.shipped_at,
                s.received_at,
                s.from_location_id,
                s.to_location_id,
                from_l.name AS from_location_name,
                from_l.slug AS from_location_slug,
                to_l.name AS to_location_name,
                to_l.slug AS to_location_slug,
                COALESCE(s.created_by_name, '') AS created_by_name,
                COALESCE(s.created_by_login, '') AS created_by_login
            FROM product_shipments s
            LEFT JOIN locations from_l ON from_l.id = s.from_location_id
            LEFT JOIN locations to_l ON to_l.id = s.to_location_id
            WHERE s.from_location_id = $1
               OR s.to_location_id = $1
            ORDER BY s.created_at DESC, s.id DESC
            LIMIT 200
            `,
            [location.id]
        )

        return NextResponse.json(result.rows.map(row => mapHistoryItem(row, location.id)), {
            headers: {
                'Cache-Control': 'private, no-store',
            },
        })
    } catch (error) {
        console.error('GET /api/shipment/history error:', error)

        return NextResponse.json(
            {
                message: error instanceof Error
                    ? error.message
                    : 'Не удалось загрузить историю отгрузок',
            },
            { status: 500 }
        )
    }
}

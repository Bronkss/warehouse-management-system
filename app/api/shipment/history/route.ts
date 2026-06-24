import { NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ShipmentHistoryRow = {
    id: number
    number: string
    shipper: string | null
    consignee: string | null
    total_rows: number
    total_quantity: string | number
    total_amount: string | number
    status: string
    created_at: string
    updated_at: string
}

function mapHistoryItem(row: ShipmentHistoryRow) {
    return {
        id: Number(row.id),
        number: row.number,
        shipper: row.shipper || '',
        consignee: row.consignee || '',
        totalRows: Number(row.total_rows || 0),
        totalQuantity: Number(row.total_quantity || 0),
        totalAmount: Number(row.total_amount || 0),
        status: row.status || 'completed',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

export async function GET() {
    try {
        const result = await pool.query<ShipmentHistoryRow>(
            `
            SELECT
                id,
                number,
                shipper,
                consignee,
                total_rows,
                total_quantity,
                total_amount,
                status,
                created_at,
                updated_at
            FROM product_shipments
            ORDER BY created_at DESC, id DESC
            LIMIT 200
            `
        )

        return NextResponse.json(result.rows.map(mapHistoryItem))
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

import { NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function toNumber(value: unknown): number {
    const parsed = Number(String(value ?? '0').replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : 0
}

export async function GET() {
    try {
        const result = await pool.query(
            `SELECT
                id,
                number,
                reason,
                reason_label,
                responsible,
                comment,
                total_rows,
                total_quantity,
                total_purchase_amount,
                total_selling_amount,
                status,
                created_at,
                updated_at
             FROM writeoffs
             ORDER BY created_at DESC, id DESC
             LIMIT 300`
        )

        return NextResponse.json(
            result.rows.map(row => ({
                id: Number(row.id),
                number: String(row.number || ''),
                reason: String(row.reason || ''),
                reasonLabel: String(row.reason_label || ''),
                responsible: String(row.responsible || ''),
                comment: String(row.comment || ''),
                totalRows: Number(row.total_rows || 0),
                totalQuantity: toNumber(row.total_quantity),
                totalPurchaseAmount: toNumber(row.total_purchase_amount),
                totalSellingAmount: toNumber(row.total_selling_amount),
                status: String(row.status || ''),
                createdAt: row.created_at,
                updatedAt: row.updated_at,
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

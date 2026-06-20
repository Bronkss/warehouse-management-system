import { NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const result = await pool.query(
            `SELECT
                id,
                number,
                source_file_name,
                supplier,
                invoice_number,
                comment,
                total_rows,
                created_count,
                updated_count,
                skipped_count,
                error_count,
                status,
                created_at,
                updated_at
             FROM product_acceptances
             ORDER BY created_at DESC
             LIMIT 100`
        )

        return NextResponse.json(
            result.rows.map(row => ({
                id: Number(row.id),
                number: row.number,
                sourceFileName: row.source_file_name,
                supplier: row.supplier,
                invoiceNumber: row.invoice_number,
                comment: row.comment,
                totalRows: Number(row.total_rows ?? 0),
                created: Number(row.created_count ?? 0),
                updated: Number(row.updated_count ?? 0),
                skipped: Number(row.skipped_count ?? 0),
                errors: Number(row.error_count ?? 0),
                status: row.status,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            }))
        )
    } catch (error) {
        console.error('GET /api/products/import/history error:', error)

        return NextResponse.json(
            { message: 'Не удалось загрузить историю приёмок' },
            { status: 500 }
        )
    }
}

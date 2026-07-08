import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'
import { resolveWarehouseLocation } from '@/app/lib/serverWarehouseLocation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    try {
        const location = await resolveWarehouseLocation(pool, request)

        const result = await pool.query(
            `SELECT
                pa.id,
                pa.number,
                pa.source_file_name,
                pa.supplier,
                pa.invoice_number,
                pa.comment,
                pa.total_rows,
                pa.created_count,
                pa.updated_count,
                pa.skipped_count,
                pa.error_count,
                pa.status,
                pa.created_at,
                pa.updated_at,
                l.name AS location_name,
                l.slug AS location_slug
             FROM product_acceptances pa
             JOIN locations l ON l.id = pa.location_id
             WHERE pa.location_id = $1
             ORDER BY pa.created_at DESC
             LIMIT 100`,
            [location.id]
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
                locationName: row.location_name,
                locationSlug: row.location_slug,
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

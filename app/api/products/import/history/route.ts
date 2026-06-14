import { NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'

type AcceptanceRow = {
    id: string
    number: string
    source_file_name: string | null
    total_rows: number
    created_count: number
    updated_count: number
    skipped_count: number
    status: string
    created_at: string
}

export async function GET() {
    try {
        const result = await pool.query<AcceptanceRow>(
            `
            SELECT
                id,
                number,
                source_file_name,
                total_rows,
                created_count,
                updated_count,
                skipped_count,
                status,
                created_at
            FROM product_acceptances
            ORDER BY created_at DESC
            LIMIT 50
            `
        )

        return NextResponse.json(
            result.rows.map(row => ({
                id: Number(row.id),
                number: row.number,
                sourceFileName: row.source_file_name,
                totalRows: row.total_rows,
                created: row.created_count,
                updated: row.updated_count,
                skipped: row.skipped_count,
                status: row.status,
                createdAt: row.created_at,
            }))
        )
    } catch (error) {
        console.error('GET /api/products/import/history error:', error)

        return NextResponse.json(
            { message: 'Ошибка получения истории приёмок' },
            { status: 500 }
        )
    }
}
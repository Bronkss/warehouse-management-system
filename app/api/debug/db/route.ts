import { NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const rawDatabaseUrl = process.env.DATABASE_URL || ''

        let databaseUrlInfo: {
            configured: boolean
            host: string | null
            port: string | null
            database: string | null
            user: string | null
        } = {
            configured: Boolean(rawDatabaseUrl),
            host: null,
            port: null,
            database: null,
            user: null,
        }

        if (rawDatabaseUrl) {
            try {
                const parsedUrl = new URL(rawDatabaseUrl)

                const databaseName =
                    parsedUrl.pathname.startsWith('/')
                        ? parsedUrl.pathname.slice(1)
                        : parsedUrl.pathname

                databaseUrlInfo = {
                    configured: true,
                    host: parsedUrl.hostname || null,
                    port: parsedUrl.port || '5432',
                    database: databaseName || null,
                    user: parsedUrl.username || null,
                }
            } catch {
                databaseUrlInfo = {
                    configured: true,
                    host: 'INVALID_DATABASE_URL',
                    port: null,
                    database: null,
                    user: null,
                }
            }
        }

        const result = await pool.query(`
            SELECT
                current_database() AS database_name,
                current_user AS database_user,
                current_schema() AS current_schema,
                current_setting('search_path') AS search_path,

                to_regclass('public.locations')::text
                    AS locations_table,

                to_regclass('public.products')::text
                    AS products_table,

                to_regclass('public.debt_customers')::text
                    AS debt_customers_table,

                to_regclass('public.debt_sales')::text
                    AS debt_sales_table,

                to_regclass('public.debt_sale_items')::text
                    AS debt_sale_items_table,

                to_regclass('public.debt_payments')::text
                    AS debt_payments_table,

                to_regclass('public.debt_payment_allocations')::text
                    AS debt_payment_allocations_table,

                to_regclass('public.debt_returns')::text
                    AS debt_returns_table,

                to_regclass('public.debt_return_items')::text
                    AS debt_return_items_table,

                to_regclass('public.debt_refunds')::text
                    AS debt_refunds_table,

                to_regclass('public.debt_events')::text
                    AS debt_events_table
        `)

        return NextResponse.json(
            {
                ok: true,
                env: {
                    nodeEnv: process.env.NODE_ENV || null,
                    databaseUrl: databaseUrlInfo,
                },

                postgres: result.rows[0] || null,
            },
            {
                headers: {
                    'Cache-Control': 'no-store, max-age=0',
                },
            }
        )
    } catch (error) {
        console.error(
            'GET /api/debug/db error:',
            error
        )

        return NextResponse.json(
            {
                ok: false,

                message:
                    error instanceof Error
                        ? error.message
                        : 'Не удалось проверить подключение к БД',
            },
            {
                status: 500,

                headers: {
                    'Cache-Control': 'no-store, max-age=0',
                },
            }
        )
    }
}
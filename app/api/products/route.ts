import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'
import { resolveWarehouseLocation } from '@/app/lib/serverWarehouseLocation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ProductUnit = 'piece' | 'weight'

const DEFAULT_PRODUCT_IMAGE = '/icons/products.jpg'

interface ProductRow {
    id: number
    name: string
    category: string
    barcode: string
    purchase_price: string
    selling_price: string
    unit: ProductUnit
    stock: string
    min_stock: string
    marked: boolean
    image: string
}

function mapProduct(row: ProductRow) {
    const marked = Boolean(row.marked)

    return {
        id: Number(row.id),
        name: row.name,
        category: row.category,
        barcode: row.barcode,
        purchasePrice: Number(row.purchase_price),
        sellingPrice: Number(row.selling_price),
        unit: row.unit,
        stock: Number(row.stock),
        minStock: Number(row.min_stock),
        marked,
        isMarked: marked,
        image: row.image || DEFAULT_PRODUCT_IMAGE,
    }
}

function normalizeImageUrl(value: unknown): string {
    const image = String(value || '').trim()

    if (!image) {
        return DEFAULT_PRODUCT_IMAGE
    }

    if (image.startsWith('data:image/')) {
        throw new Error('Изображение нужно сначала загрузить в хранилище, а в товар сохранить только URL')
    }

    return image
}

function generateBarcode(): string {
    const prefix = '200'

    const randomPart = Math.floor(Math.random() * 1000000000)
        .toString()
        .padStart(9, '0')

    const barcodeWithoutCheckDigit = prefix + randomPart
    const digits = barcodeWithoutCheckDigit.split('').map(Number)

    const sum = digits.reduce((acc, digit, index) => {
        return acc + (index % 2 === 0 ? digit : digit * 3)
    }, 0)

    const checkDigit = (10 - (sum % 10)) % 10

    return barcodeWithoutCheckDigit + checkDigit
}

function parseLimit(value: string | null): number {
    const parsed = Number(value || 50)

    if (Number.isNaN(parsed)) {
        return 50
    }

    return Math.min(Math.max(parsed, 1), 100)
}

function parseCursor(value: string | null): number | null {
    if (!value) {
        return null
    }

    const parsed = Number(value)

    if (Number.isNaN(parsed) || parsed <= 0) {
        return null
    }

    return parsed
}

function parseNumber(value: unknown, fallback = 0): number {
    if (value === undefined || value === null || value === '') {
        return fallback
    }

    const parsed = Number(value)

    return Number.isNaN(parsed) ? fallback : parsed
}

function parseMarked(value: unknown): boolean {
    if (typeof value === 'boolean') {
        return value
    }

    if (typeof value === 'number') {
        return value === 1
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()

        return (
            normalized === 'true' ||
            normalized === '1' ||
            normalized === 'yes' ||
            normalized === 'on' ||
            normalized === 'да'
        )
    }

    return false
}

function getMarkedFromBody(body: any): boolean {
    return parseMarked(
        body?.marked ??
        body?.isMarked ??
        body?.is_marked ??
        body?.marking ??
        body?.markedProduct
    )
}

export async function GET(request: NextRequest) {
    const startedAt = performance.now()

    try {
        const location = await resolveWarehouseLocation(pool, request)
        const { searchParams } = new URL(request.url)

        const search = String(searchParams.get('search') || '').trim()
        const limit = parseLimit(searchParams.get('limit'))
        const cursor = parseCursor(searchParams.get('cursor'))

        const values: Array<string | number> = [location.id, DEFAULT_PRODUCT_IMAGE]
        const locationIndex = 1
        const defaultImageIndex = 2
        const whereParts: string[] = []

        if (search) {
            const isBarcodeLike = /^\d{4,20}$/.test(search)

            if (isBarcodeLike) {
                values.push(search)
                const exactBarcodeIndex = values.length

                values.push(`%${search}%`)
                const likeIndex = values.length

                whereParts.push(`
                    (
                        p.barcode = $${exactBarcodeIndex}
                        OR p.barcode ILIKE $${likeIndex}
                        OR p.name ILIKE $${likeIndex}
                    )
                `)
            } else {
                values.push(`%${search}%`)
                const likeIndex = values.length

                whereParts.push(`
                    (
                        p.name ILIKE $${likeIndex}
                        OR p.barcode ILIKE $${likeIndex}
                        OR p.category ILIKE $${likeIndex}
                    )
                `)
            }
        }

        if (cursor) {
            values.push(cursor)
            const cursorIndex = values.length

            whereParts.push(`p.id < $${cursorIndex}`)
        }

        const whereSql = whereParts.length > 0
            ? `WHERE ${whereParts.join(' AND ')}`
            : ''

        values.push(limit + 1)
        const limitIndex = values.length

        const result = await pool.query<ProductRow>(
            `
            SELECT
                p.id,
                p.name,
                p.category,
                p.barcode,
                p.purchase_price,
                p.selling_price,
                p.unit,
                COALESCE(ps.stock, 0) AS stock,
                p.min_stock,
                COALESCE(p.marked, false) AS marked,
                COALESCE(NULLIF(p.image_url, ''), NULLIF(p.image, ''), $${defaultImageIndex}) AS image
            FROM products p
            LEFT JOIN product_stocks ps
                ON ps.product_id = p.id
               AND ps.location_id = $${locationIndex}
            ${whereSql}
            ORDER BY p.id DESC
            LIMIT $${limitIndex}
            `,
            values
        )

        const mappedRows = result.rows.map(mapProduct)

        const hasMore = mappedRows.length > limit
        const items = hasMore ? mappedRows.slice(0, limit) : mappedRows

        const nextCursor = hasMore && items.length > 0
            ? items[items.length - 1].id
            : null

        const durationMs = Math.round(performance.now() - startedAt)

        return NextResponse.json(
            {
                items,
                nextCursor,
                hasMore,
                limit,
                durationMs,
                location,
            },
            {
                headers: {
                    'Cache-Control': 'private, no-store',
                    'Server-Timing': `db;dur=${durationMs}`,
                },
            }
        )
    } catch (error) {
        console.error('GET /api/products error:', error)

        return NextResponse.json(
            { message: error instanceof Error ? error.message : 'Ошибка при получении товаров' },
            { status: 500 }
        )
    }
}

export async function POST(request: NextRequest) {
    const client = await pool.connect()

    try {
        const body = await request.json()
        const location = await resolveWarehouseLocation(client, request)

        const name = String(body.name || '').trim()
        const category = String(body.category || '').trim()
        const barcode = String(body.barcode || generateBarcode()).trim()
        const unit = body.unit as ProductUnit

        const purchasePrice = parseNumber(body.purchasePrice, NaN)
        const sellingPrice = parseNumber(body.sellingPrice, 0)
        const stock = parseNumber(body.stock, 0)
        const minStock = parseNumber(body.minStock, 10)
        const marked = getMarkedFromBody(body)
        const image = normalizeImageUrl(body.image)

        if (!name) {
            return NextResponse.json(
                { message: 'Название товара обязательно' },
                { status: 400 }
            )
        }

        if (!category) {
            return NextResponse.json(
                { message: 'Категория обязательна' },
                { status: 400 }
            )
        }

        if (!barcode) {
            return NextResponse.json(
                { message: 'Штрихкод обязателен' },
                { status: 400 }
            )
        }

        if (unit !== 'piece' && unit !== 'weight') {
            return NextResponse.json(
                { message: 'Некорректная единица измерения' },
                { status: 400 }
            )
        }

        if (Number.isNaN(purchasePrice) || purchasePrice < 0) {
            return NextResponse.json(
                { message: 'Некорректная закупочная цена' },
                { status: 400 }
            )
        }

        if (sellingPrice < 0) {
            return NextResponse.json(
                { message: 'Некорректная цена продажи' },
                { status: 400 }
            )
        }

        if (stock < 0) {
            return NextResponse.json(
                { message: 'Некорректное количество товара' },
                { status: 400 }
            )
        }

        if (minStock < 0) {
            return NextResponse.json(
                { message: 'Некорректный минимальный остаток' },
                { status: 400 }
            )
        }

        await client.query('BEGIN')

        const result = await client.query<{ id: number }>(
            `
            INSERT INTO products (
                name,
                category,
                barcode,
                purchase_price,
                selling_price,
                unit,
                stock,
                min_stock,
                marked,
                image_url
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
            `,
            [
                name,
                category,
                barcode,
                purchasePrice,
                sellingPrice,
                unit,
                location.slug === 'tochka' ? stock : 0,
                minStock,
                marked,
                image,
            ]
        )

        const productId = Number(result.rows[0].id)

        await client.query(
            `
            INSERT INTO product_stocks (product_id, location_id, stock)
            VALUES ($1, $2, $3)
            ON CONFLICT (product_id, location_id) DO UPDATE
            SET stock = EXCLUDED.stock,
                updated_at = NOW()
            `,
            [productId, location.id, stock]
        )

        if (stock !== 0) {
            await client.query(
                `
                INSERT INTO stock_movements (
                    product_id,
                    location_id,
                    movement_type,
                    quantity_delta,
                    stock_after,
                    document_type,
                    document_id,
                    comment,
                    created_by
                )
                VALUES ($1, $2, 'product_create', $3, $3, 'products', $1, $4, 'products-api')
                `,
                [productId, location.id, stock, `Создание товара в зоне ${location.name}`]
            )
        }

        const selected = await client.query<ProductRow>(
            `
            SELECT
                p.id,
                p.name,
                p.category,
                p.barcode,
                p.purchase_price,
                p.selling_price,
                p.unit,
                COALESCE(ps.stock, 0) AS stock,
                p.min_stock,
                COALESCE(p.marked, false) AS marked,
                COALESCE(NULLIF(p.image_url, ''), NULLIF(p.image, ''), $3) AS image
            FROM products p
            LEFT JOIN product_stocks ps
                ON ps.product_id = p.id
               AND ps.location_id = $2
            WHERE p.id = $1
            LIMIT 1
            `,
            [productId, location.id, DEFAULT_PRODUCT_IMAGE]
        )

        await client.query('COMMIT')

        return NextResponse.json(mapProduct(selected.rows[0]), { status: 201 })
    } catch (error: any) {
        await client.query('ROLLBACK').catch(() => undefined)

        console.error('POST /api/products error:', error)

        if (error?.code === '23505') {
            return NextResponse.json(
                { message: 'Товар с таким штрихкодом уже существует' },
                { status: 409 }
            )
        }

        if (error instanceof Error && error.message.includes('Изображение')) {
            return NextResponse.json(
                { message: error.message },
                { status: 400 }
            )
        }

        return NextResponse.json(
            { message: error instanceof Error ? error.message : 'Ошибка при создании товара' },
            { status: 500 }
        )
    } finally {
        client.release()
    }
}

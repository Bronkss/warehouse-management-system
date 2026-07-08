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

type RouteContext = {
    params: Promise<{ id: string }> | { id: string }
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

async function getProductId(context: RouteContext): Promise<number | null> {
    const params = await context.params
    const id = Number(params.id)

    if (Number.isNaN(id) || id <= 0) {
        return null
    }

    return id
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

export async function PUT(request: NextRequest, context: RouteContext) {
    const client = await pool.connect()

    try {
        const productId = await getProductId(context)

        if (!productId) {
            return NextResponse.json(
                { message: 'Некорректный ID товара' },
                { status: 400 }
            )
        }

        const body = await request.json()
        const location = await resolveWarehouseLocation(client, request)

        const name = String(body.name || '').trim()
        const category = String(body.category || '').trim()
        const barcode = String(body.barcode || '').trim()
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

        const existingStockResult = await client.query<{ stock: string }>(
            `
            SELECT COALESCE(stock, 0) AS stock
            FROM product_stocks
            WHERE product_id = $1 AND location_id = $2
            LIMIT 1
            `,
            [productId, location.id]
        )

        const previousStock = Number(existingStockResult.rows[0]?.stock ?? 0)
        const quantityDelta = stock - previousStock

        const result = await client.query<{ id: number }>(
            `
            UPDATE products
            SET
                name = $1,
                category = $2,
                barcode = $3,
                purchase_price = $4,
                selling_price = $5,
                unit = $6,
                stock = CASE WHEN $12 = 'tochka' THEN $7 ELSE stock END,
                min_stock = $8,
                marked = $9,
                image_url = $10,
                updated_at = NOW()
            WHERE id = $11
            RETURNING id
            `,
            [
                name,
                category,
                barcode,
                purchasePrice,
                sellingPrice,
                unit,
                stock,
                minStock,
                marked,
                image,
                productId,
                location.slug,
            ]
        )

        if (result.rowCount === 0) {
            await client.query('ROLLBACK')

            return NextResponse.json(
                { message: 'Товар не найден' },
                { status: 404 }
            )
        }

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

        if (quantityDelta !== 0) {
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
                VALUES ($1, $2, 'stock_manual_update', $3, $4, 'products', $1, $5, 'products-api')
                `,
                [productId, location.id, quantityDelta, stock, `Ручное изменение остатка товара в зоне ${location.name}`]
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

        return NextResponse.json(mapProduct(selected.rows[0]))
    } catch (error: any) {
        await client.query('ROLLBACK').catch(() => undefined)

        console.error('PUT /api/products/[id] error:', error)

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
            { message: error instanceof Error ? error.message : 'Ошибка при изменении товара' },
            { status: 500 }
        )
    } finally {
        client.release()
    }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
    try {
        const productId = await getProductId(context)

        if (!productId) {
            return NextResponse.json(
                { message: 'Некорректный ID товара' },
                { status: 400 }
            )
        }

        const result = await pool.query(
            `
            DELETE FROM products
            WHERE id = $1
            RETURNING id
            `,
            [productId]
        )

        if (result.rowCount === 0) {
            return NextResponse.json(
                { message: 'Товар не найден' },
                { status: 404 }
            )
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('DELETE /api/products/[id] error:', error)

        return NextResponse.json(
            { message: 'Ошибка при удалении товара' },
            { status: 500 }
        )
    }
}

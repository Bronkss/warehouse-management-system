import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'

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
    image: string
}

type RouteContext = {
    params: Promise<{ id: string }> | { id: string }
}

function mapProduct(row: ProductRow) {
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
    try {
        const productId = await getProductId(context)

        if (!productId) {
            return NextResponse.json(
                { message: 'Некорректный ID товара' },
                { status: 400 }
            )
        }

        const body = await request.json()

        const name = String(body.name || '').trim()
        const category = String(body.category || '').trim()
        const barcode = String(body.barcode || '').trim()
        const unit = body.unit as ProductUnit

        const purchasePrice = parseNumber(body.purchasePrice, NaN)
        const sellingPrice = parseNumber(body.sellingPrice, 0)
        const stock = parseNumber(body.stock, 0)
        const minStock = parseNumber(body.minStock, 10)
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

        const result = await pool.query<ProductRow>(
            `
            UPDATE products
            SET
                name = $1,
                category = $2,
                barcode = $3,
                purchase_price = $4,
                selling_price = $5,
                unit = $6,
                stock = $7,
                min_stock = $8,
                image_url = $9
            WHERE id = $10
            RETURNING
                id,
                name,
                category,
                barcode,
                purchase_price,
                selling_price,
                unit,
                stock,
                min_stock,
                COALESCE(NULLIF(image_url, ''), $11) AS image
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
                image,
                productId,
                DEFAULT_PRODUCT_IMAGE,
            ]
        )

        if (result.rowCount === 0) {
            return NextResponse.json(
                { message: 'Товар не найден' },
                { status: 404 }
            )
        }

        return NextResponse.json(mapProduct(result.rows[0]))
    } catch (error: any) {
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
            { message: 'Ошибка при изменении товара' },
            { status: 500 }
        )
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
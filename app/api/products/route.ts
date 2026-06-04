import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'


type ProductUnit = 'piece' | 'weight'

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

function mapProduct(row: ProductRow) {
    return {
        id: row.id,
        name: row.name,
        category: row.category,
        barcode: row.barcode,
        purchasePrice: Number(row.purchase_price),
        sellingPrice: Number(row.selling_price),
        unit: row.unit,
        stock: Number(row.stock),
        minStock: Number(row.min_stock),
        image: row.image,
    }
}

function generateBarcode(): string {
    const prefix = '200'
    const random = Math.floor(Math.random() * 10000000000)
        .toString()
        .padStart(10, '0')

    const barcode = prefix + random

    const digits = barcode.split('').map(Number)

    const sum = digits.reduce((acc, digit, index) => {
        return acc + (index % 2 === 0 ? digit : digit * 3)
    }, 0)

    const checkDigit = (10 - (sum % 10)) % 10

    return barcode + checkDigit
}

export async function GET() {
    try {
        const result = await pool.query<ProductRow>(`
            SELECT 
                id,
                name,
                category,
                barcode,
                purchase_price,
                selling_price,
                unit,
                stock,
                min_stock,
                image
            FROM products
            ORDER BY id DESC
        `)

        return NextResponse.json(result.rows.map(mapProduct))
    } catch (error) {
        console.error('GET /api/products error:', error)

        return NextResponse.json(
            { message: 'Ошибка при получении товаров' },
            { status: 500 }
        )
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()

        const name = String(body.name || '').trim()
        const category = String(body.category || '').trim()
        const barcode = String(body.barcode || generateBarcode()).trim()
        const unit = body.unit as ProductUnit

        const purchasePrice = Number(body.purchasePrice)
        const sellingPrice = Number(body.sellingPrice || 0)
        const stock = Number(body.stock || 0)
        const minStock = Number(body.minStock || 10)

        const image = body.image || '/icons/products.jpg'

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

        if (unit !== 'piece' && unit !== 'weight') {
            return NextResponse.json(
                { message: 'Некорректная единица измерения' },
                { status: 400 }
            )
        }

        if (Number.isNaN(purchasePrice)) {
            return NextResponse.json(
                { message: 'Некорректная закупочная цена' },
                { status: 400 }
            )
        }

        const result = await pool.query<ProductRow>(
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
                image
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
                image
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
            ]
        )

        return NextResponse.json(mapProduct(result.rows[0]), { status: 201 })
    } catch (error: any) {
        console.error('POST /api/products error:', error)

        if (error.code === '23505') {
            return NextResponse.json(
                { message: 'Товар с таким штрихкодом уже существует' },
                { status: 409 }
            )
        }

        return NextResponse.json(
            { message: 'Ошибка при создании товара' },
            { status: 500 }
        )
    }
}
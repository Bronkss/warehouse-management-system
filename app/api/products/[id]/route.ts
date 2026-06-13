import {NextRequest, NextResponse} from 'next/server'
import {pool} from '../../../lib/db'

interface ProductRow {
    id: number
    name: string
    category: string
    barcode: string
    purchase_price: string | number
    selling_price: string | number
    unit: 'piece' | 'weight'
    stock: string | number
    min_stock: string | number
    image: string | null
}

const mapProduct = (row: ProductRow) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    barcode: row.barcode,
    purchasePrice: Number(row.purchase_price),
    sellingPrice: Number(row.selling_price),
    unit: row.unit,
    stock: Number(row.stock),
    minStock: Number(row.min_stock),
    image: row.image || '',
})

type RouteContext = {
    params: Promise<{ id: string }> | { id: string }
}

const getProductId = async (params: RouteContext['params']) => {
    const resolvedParams = await params
    return Number(resolvedParams.id)
}

export async function DELETE(
    request: NextRequest,
    {params}: RouteContext
) {
    try {
        const id = await getProductId(params)

        if (!Number.isInteger(id) || id <= 0) {
            return NextResponse.json(
                {message: 'Некорректный ID товара'},
                {status: 400}
            )
        }

        const result = await pool.query(
            `DELETE FROM products
             WHERE id = $1
             RETURNING id`,
            [id]
        )

        if (result.rowCount === 0) {
            return NextResponse.json(
                {message: 'Товар не найден'},
                {status: 404}
            )
        }

        return NextResponse.json({
            message: 'Товар удалён',
            id,
        })
    } catch (error) {
        console.error(error)

        return NextResponse.json(
            {message: 'Ошибка удаления товара'},
            {status: 500}
        )
    }
}

export async function PUT(
    request: NextRequest,
    {params}: RouteContext
) {
    try {
        const id = await getProductId(params)

        if (!Number.isInteger(id) || id <= 0) {
            return NextResponse.json(
                {message: 'Некорректный ID товара'},
                {status: 400}
            )
        }

        const body = await request.json()

        const {
            name,
            category,
            barcode,
            purchasePrice,
            sellingPrice,
            unit,
            stock,
            minStock,
            image,
        } = body

        if (!name || !category || !unit) {
            return NextResponse.json(
                {message: 'Заполните название, категорию и единицу измерения'},
                {status: 400}
            )
        }

        if (unit !== 'piece' && unit !== 'weight') {
            return NextResponse.json(
                {message: 'Некорректная единица измерения'},
                {status: 400}
            )
        }

        const result = await pool.query(
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
                image = COALESCE($9, image)
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
                image
            `,
            [
                String(name).trim(),
                String(category).trim(),
                barcode ? String(barcode).trim() : '',
                Number(purchasePrice),
                Number(sellingPrice),
                unit,
                Number(stock),
                Number(minStock),
                image ?? null,
                id,
            ]
        )

        if (result.rowCount === 0) {
            return NextResponse.json(
                {message: 'Товар не найден'},
                {status: 404}
            )
        }

        return NextResponse.json(mapProduct(result.rows[0]))
    } catch (error) {
        console.error(error)

        return NextResponse.json(
            {message: 'Ошибка редактирования товара'},
            {status: 500}
        )
    }
}
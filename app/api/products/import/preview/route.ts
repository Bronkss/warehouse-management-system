import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'
import {
    buildPreviewRow,
    mapExcelRow,
    normalizeProductName,
    readExcelRows,
    type ExistingProduct,
    type ProductUnit,
} from '../_utils'

export const runtime = 'nodejs'

type ProductRow = {
    id: number
    name: string
    category: string
    barcode: string
    purchase_price: string
    selling_price: string
    unit: ProductUnit
    stock: string
    min_stock: string
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData()
        const file = formData.get('file')

        if (!file || !(file instanceof File)) {
            return NextResponse.json(
                { message: 'Файл не найден' },
                { status: 400 }
            )
        }

        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        const excelRows = readExcelRows(buffer)

        if (excelRows.length === 0) {
            return NextResponse.json(
                { message: 'В Excel-файле нет строк для импорта' },
                { status: 400 }
            )
        }

        const productsResult = await pool.query<ProductRow>(`
            SELECT
                id,
                name,
                category,
                barcode,
                purchase_price,
                selling_price,
                unit,
                stock,
                min_stock
            FROM products
            ORDER BY id DESC
        `)

        const existingProducts: ExistingProduct[] = productsResult.rows.map(row => ({
            id: row.id,
            name: row.name,
            category: row.category,
            barcode: row.barcode,
            purchasePrice: Number(row.purchase_price),
            sellingPrice: Number(row.selling_price),
            unit: row.unit,
            stock: Number(row.stock),
            minStock: Number(row.min_stock),
            normalizedName: normalizeProductName(row.name),
        }))

        const previewRows = excelRows.map((row, index) => {
            const rowNumber = index + 2
            const product = mapExcelRow(row)

            return buildPreviewRow(product, rowNumber, existingProducts)
        })

        return NextResponse.json({
            totalRows: previewRows.length,
            rows: previewRows,
            summary: {
                matched: previewRows.filter(row => row.status === 'matched').length,
                review: previewRows.filter(row => row.status === 'review').length,
                new: previewRows.filter(row => row.status === 'new').length,
                error: previewRows.filter(row => row.status === 'error').length,
            },
        })
    } catch (error: any) {
        console.error('POST /api/products/import/preview error:', error)

        return NextResponse.json(
            {
                message: error?.message || 'Ошибка предпросмотра импорта',
            },
            { status: 500 }
        )
    }
}
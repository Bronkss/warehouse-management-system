import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/app/lib/db'
import {
    generateBarcode,
    parseNumber,
    type ImportAction,
    type ProductUnit,
} from '../_utils'

export const runtime = 'nodejs'

type CommitRow = {
    rowId: string
    rowNumber: number
    status?: string
    action: ImportAction
    matchType?: string
    matchScore?: number
    matchedProductId: number | null
    matchedProductName?: string
    matchedProductBarcode?: string

    name: string
    category: string
    barcode: string
    purchasePrice: string
    sellingPrice: string
    unit: ProductUnit
    stock: string
    minStock: string
    image: string
}

async function generateUniqueBarcode(client: any): Promise<string> {
    for (let i = 0; i < 20; i++) {
        const barcode = generateBarcode()

        const result = await client.query(
            `
            SELECT id
            FROM products
            WHERE barcode = $1
            LIMIT 1
            `,
            [barcode]
        )

        if (result.rows.length === 0) {
            return barcode
        }
    }

    throw new Error('Не удалось сгенерировать уникальный штрихкод')
}

function validateCommitRow(row: CommitRow): string | null {
    if (row.action === 'skip') {
        return null
    }

    if (!row.name.trim()) {
        return `Строка ${row.rowNumber}: не указано название`
    }

    if (!row.category.trim()) {
        return `Строка ${row.rowNumber}: не указана категория`
    }

    if (parseNumber(row.purchasePrice) <= 0) {
        return `Строка ${row.rowNumber}: некорректная цена закупки`
    }

    if (parseNumber(row.sellingPrice) <= 0) {
        return `Строка ${row.rowNumber}: некорректная цена продажи`
    }

    if (parseNumber(row.stock) <= 0) {
        return `Строка ${row.rowNumber}: некорректное количество`
    }

    if (row.action === 'update' && !row.matchedProductId) {
        return `Строка ${row.rowNumber}: не выбран товар из базы для обновления`
    }

    return null
}

function createAcceptanceNumber(id: number): string {
    const datePart = new Date()
        .toISOString()
        .slice(0, 10)
        .replaceAll('-', '')

    return `PR-${datePart}-${String(id).padStart(6, '0')}`
}

async function insertAcceptanceItem(
    client: any,
    params: {
        acceptanceId: number
        row: CommitRow
        result: string
        productId: number | null
        productName: string
        barcode: string
        error: string | null
    }
) {
    const purchasePrice = parseNumber(params.row.purchasePrice)
    const sellingPrice = Math.ceil(parseNumber(params.row.sellingPrice))
    const quantity = parseNumber(params.row.stock)
    const minStock = parseNumber(params.row.minStock) > 0
        ? parseNumber(params.row.minStock)
        : 10

    await client.query(
        `
        INSERT INTO product_acceptance_items (
            acceptance_id,
            row_number,
            action,
            result,
            product_id,
            product_name,
            imported_name,
            category,
            barcode,
            purchase_price,
            selling_price,
            quantity,
            unit,
            min_stock,
            match_type,
            match_score,
            error
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        `,
        [
            params.acceptanceId,
            params.row.rowNumber,
            params.row.action,
            params.result,
            params.productId,
            params.productName || null,
            params.row.name.trim(),
            params.row.category.trim(),
            params.barcode || params.row.barcode || null,
            purchasePrice,
            sellingPrice,
            quantity,
            params.row.unit,
            minStock,
            params.row.matchType || null,
            params.row.matchScore || 0,
            params.error,
        ]
    )
}

export async function POST(request: NextRequest) {
    const client = await pool.connect()

    try {
        const body = await request.json()
        const rows = Array.isArray(body.rows) ? body.rows as CommitRow[] : []
        const sourceFileName = String(body.sourceFileName || '').trim()

        if (rows.length === 0) {
            return NextResponse.json(
                { message: 'Нет строк для импорта' },
                { status: 400 }
            )
        }

        let created = 0
        let updated = 0
        let skipped = 0
        const errors: string[] = []

        await client.query('BEGIN')

        const acceptanceResult = await client.query<{ id: number }>(
            `
            INSERT INTO product_acceptances (
                source_file_name,
                total_rows,
                status
            )
            VALUES ($1, $2, $3)
            RETURNING id
            `,
            [
                sourceFileName || null,
                rows.length,
                'processing',
            ]
        )

        const acceptanceId = acceptanceResult.rows[0].id
        const acceptanceNumber = createAcceptanceNumber(acceptanceId)

        await client.query(
            `
            UPDATE product_acceptances
            SET number = $1
            WHERE id = $2
            `,
            [acceptanceNumber, acceptanceId]
        )

        for (const row of rows) {
            const validationError = validateCommitRow(row)

            if (validationError) {
                skipped += 1
                errors.push(validationError)

                await insertAcceptanceItem(client, {
                    acceptanceId,
                    row,
                    result: 'error',
                    productId: null,
                    productName: '',
                    barcode: row.barcode,
                    error: validationError,
                })

                continue
            }

            if (row.action === 'skip') {
                skipped += 1

                await insertAcceptanceItem(client, {
                    acceptanceId,
                    row,
                    result: 'skipped',
                    productId: row.matchedProductId,
                    productName: row.matchedProductName || '',
                    barcode: row.barcode,
                    error: null,
                })

                continue
            }

            const purchasePrice = parseNumber(row.purchasePrice)
            const sellingPrice = Math.ceil(parseNumber(row.sellingPrice))
            const stock = parseNumber(row.stock)
            const minStock = parseNumber(row.minStock) > 0 ? parseNumber(row.minStock) : 10

            if (row.action === 'update') {
                const result = await client.query<{ id: number; name: string; barcode: string }>(
                    `
                    UPDATE products
                    SET stock = stock + $1
                    WHERE id = $2
                    RETURNING id, name, barcode
                    `,
                    [
                        stock,
                        row.matchedProductId,
                    ]
                )

                if (result.rows.length === 0) {
                    const message = `Строка ${row.rowNumber}: товар из базы не найден`

                    skipped += 1
                    errors.push(message)

                    await insertAcceptanceItem(client, {
                        acceptanceId,
                        row,
                        result: 'error',
                        productId: row.matchedProductId,
                        productName: row.matchedProductName || '',
                        barcode: row.barcode,
                        error: message,
                    })

                    continue
                }

                updated += 1

                await insertAcceptanceItem(client, {
                    acceptanceId,
                    row,
                    result: 'updated',
                    productId: result.rows[0].id,
                    productName: result.rows[0].name,
                    barcode: result.rows[0].barcode,
                    error: null,
                })

                continue
            }

            if (row.action === 'create') {
                let finalBarcode = String(row.barcode || '').trim()

                if (finalBarcode) {
                    const existingByBarcode = await client.query(
                        `
                        SELECT id
                        FROM products
                        WHERE barcode = $1
                        LIMIT 1
                        `,
                        [finalBarcode]
                    )

                    if (existingByBarcode.rows.length > 0) {
                        const message = `Строка ${row.rowNumber}: товар со штрихкодом ${finalBarcode} уже существует`

                        skipped += 1
                        errors.push(message)

                        await insertAcceptanceItem(client, {
                            acceptanceId,
                            row,
                            result: 'error',
                            productId: null,
                            productName: '',
                            barcode: finalBarcode,
                            error: message,
                        })

                        continue
                    }
                } else {
                    finalBarcode = await generateUniqueBarcode(client)
                }

                const createdResult = await client.query<{ id: number; name: string; barcode: string }>(
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
                    RETURNING id, name, barcode
                    `,
                    [
                        row.name.trim(),
                        row.category.trim(),
                        finalBarcode,
                        purchasePrice,
                        sellingPrice,
                        row.unit,
                        stock,
                        minStock,
                        row.image || '/icons/products.jpg',
                    ]
                )

                created += 1

                await insertAcceptanceItem(client, {
                    acceptanceId,
                    row: {
                        ...row,
                        barcode: finalBarcode,
                    },
                    result: 'created',
                    productId: createdResult.rows[0].id,
                    productName: createdResult.rows[0].name,
                    barcode: createdResult.rows[0].barcode,
                    error: null,
                })
            }
        }

        const finalStatus = errors.length > 0 ? 'completed_with_errors' : 'completed'

        await client.query(
            `
            UPDATE product_acceptances
            SET
                created_count = $1,
                updated_count = $2,
                skipped_count = $3,
                errors = $4::jsonb,
                status = $5
            WHERE id = $6
            `,
            [
                created,
                updated,
                skipped,
                JSON.stringify(errors),
                finalStatus,
                acceptanceId,
            ]
        )

        await client.query('COMMIT')

        return NextResponse.json({
            acceptanceId,
            acceptanceNumber,
            totalRows: rows.length,
            created,
            updated,
            skipped,
            errors,
        })
    } catch (error: any) {
        await client.query('ROLLBACK')

        console.error('POST /api/products/import/commit error:', error)

        return NextResponse.json(
            {
                message: error?.message || 'Ошибка применения импорта',
            },
            { status: 500 }
        )
    } finally {
        client.release()
    }
}
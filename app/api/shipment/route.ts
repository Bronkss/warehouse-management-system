import { NextRequest, NextResponse } from 'next/server'
import type { PoolClient, QueryResultRow } from 'pg'
import { pool } from '@/app/lib/db'
import { resolveWarehouseLocation, normalizeWarehouseLocationSlug, type WarehouseLocation } from '@/app/lib/serverWarehouseLocation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ProductUnit = 'piece' | 'weight'

type ProductStockRow = QueryResultRow & {
    id: number
    name: string
    category: string
    barcode: string
    purchase_price: string | number
    selling_price: string | number
    unit: ProductUnit
    stock: string | number
    min_stock: string | number
    image: string | null
}

type LocationRow = QueryResultRow & {
    id: number
    name: string
    slug: string
    type: 'warehouse' | 'store'
}

type ShipmentIdRow = QueryResultRow & {
    id: number
}

type ShipmentItem = {
    productId: number
    quantity: number
    category?: string
    purchasePrice?: number
    sellingPrice?: number
}

type ShipmentBody = {
    items?: ShipmentItem[]
    shipper?: string
    consignee?: string
    toLocationId?: number | string
    toLocationSlug?: string
}

const mapProduct = (row: ProductStockRow) => ({
    id: Number(row.id),
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

function cleanString(value: unknown) {
    return String(value ?? '').trim()
}

function toNumber(value: unknown) {
    const parsed = Number(String(value ?? '0').replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : 0
}

function roundStock(value: number): number {
    return Math.round((value + Number.EPSILON) * 1000) / 1000
}

function makeShipmentNumber(id: number) {
    const date = new Date()
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')

    return `TRF-${y}${m}${d}-${String(id).padStart(6, '0')}`
}

function makeTransferBarcode(id: number) {
    return `DOC-TRF-${String(id).padStart(8, '0')}`
}

async function resolveTargetLocation(
    client: PoolClient,
    body: ShipmentBody
): Promise<WarehouseLocation> {
    const rawId = Number(body.toLocationId)

    if (Number.isInteger(rawId) && rawId > 0) {
        const result = await client.query<LocationRow>(
            `
            SELECT id, name, slug, type
            FROM locations
            WHERE id = $1 AND is_active = TRUE
            LIMIT 1
            `,
            [rawId]
        )

        if (result.rows[0]) {
            return {
                id: Number(result.rows[0].id),
                name: result.rows[0].name,
                slug: result.rows[0].slug,
                type: result.rows[0].type,
            }
        }
    }

    const slug = normalizeWarehouseLocationSlug(body.toLocationSlug)

    const result = await client.query<LocationRow>(
        `
        SELECT id, name, slug, type
        FROM locations
        WHERE slug = $1 AND is_active = TRUE
        LIMIT 1
        `,
        [slug]
    )

    if (!result.rows[0]) {
        throw new Error('Выберите зону-получателя отгрузки')
    }

    return {
        id: Number(result.rows[0].id),
        name: result.rows[0].name,
        slug: result.rows[0].slug,
        type: result.rows[0].type,
    }
}

async function ensureProductStockRows(client: PoolClient, productId: number) {
    await client.query(
        `
        INSERT INTO product_stocks (product_id, location_id, stock)
        SELECT $1, l.id, 0
        FROM locations l
        WHERE l.is_active = TRUE
        ON CONFLICT (product_id, location_id) DO NOTHING
        `,
        [productId]
    )
}

async function getProductStockForUpdate(
    client: PoolClient,
    productId: number,
    locationId: number
): Promise<ProductStockRow | null> {
    await ensureProductStockRows(client, productId)

    const result = await client.query<ProductStockRow>(
        `
        SELECT
            p.id,
            p.name,
            p.category,
            p.barcode,
            p.purchase_price,
            p.selling_price,
            p.unit,
            ps.stock,
            p.min_stock,
            COALESCE(NULLIF(p.image_url, ''), p.image, '') AS image
        FROM products p
        JOIN product_stocks ps ON ps.product_id = p.id
        WHERE p.id = $1 AND ps.location_id = $2
        FOR UPDATE OF p, ps
        `,
        [productId, locationId]
    )

    return result.rows[0] || null
}

async function syncLegacyTochkaStock(
    client: PoolClient,
    location: WarehouseLocation,
    productId: number,
    stock: number
) {
    if (location.slug !== 'tochka') {
        return
    }

    await client.query(
        `
        UPDATE products
        SET
            stock = $1,
            updated_at = NOW()
        WHERE id = $2
        `,
        [stock, productId]
    )
}

export async function POST(request: NextRequest) {
    const client = await pool.connect()

    try {
        const body = await request.json() as ShipmentBody
        const items = body.items
        const shipper = cleanString(body.shipper)
        const consigneeFromBody = cleanString(body.consignee)

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { message: 'Список товаров пуст' },
                { status: 400 }
            )
        }

        for (const item of items) {
            const productId = Number(item.productId)
            const quantity = toNumber(item.quantity)

            if (!Number.isInteger(productId) || productId <= 0) {
                return NextResponse.json(
                    { message: 'Некорректный ID товара' },
                    { status: 400 }
                )
            }

            if (!Number.isFinite(quantity) || quantity <= 0) {
                return NextResponse.json(
                    { message: 'Некорректное количество товара' },
                    { status: 400 }
                )
            }
        }

        await client.query('BEGIN')

        const fromLocation = await resolveWarehouseLocation(client, request)
        const toLocation = await resolveTargetLocation(client, body)

        if (fromLocation.id === toLocation.id) {
            throw new Error('Нельзя отгрузить товар в ту же самую зону')
        }

        const consignee = consigneeFromBody || toLocation.name

        const shipmentResult = await client.query<ShipmentIdRow>(
            `
            INSERT INTO product_shipments (
                number,
                transfer_barcode,
                from_location_id,
                to_location_id,
                shipper,
                consignee,
                total_rows,
                total_quantity,
                total_amount,
                status,
                errors,
                shipped_at
            )
            VALUES ('TEMP', NULL, $1, $2, $3, $4, 0, 0, 0, 'shipped', '[]'::jsonb, NOW())
            RETURNING id
            `,
            [fromLocation.id, toLocation.id, shipper || fromLocation.name, consignee]
        )

        const shipmentId = Number(shipmentResult.rows[0].id)
        const shipmentNumber = makeShipmentNumber(shipmentId)
        const transferBarcode = makeTransferBarcode(shipmentId)

        await client.query(
            `
            UPDATE product_shipments
            SET number = $1, transfer_barcode = $2
            WHERE id = $3
            `,
            [shipmentNumber, transferBarcode, shipmentId]
        )

        const updatedProducts = []
        let totalQuantity = 0
        let totalAmount = 0

        for (let index = 0; index < items.length; index += 1) {
            const item = items[index]
            const productId = Number(item.productId)
            const quantity = toNumber(item.quantity)

            const product = await getProductStockForUpdate(client, productId, fromLocation.id)

            if (!product) {
                throw new Error(`Товар с ID ${productId} не найден`)
            }

            const previousStock = Number(product.stock)

            if (previousStock < quantity) {
                throw new Error(
                    `Недостаточно остатка: ${product.name}. Доступно в зоне ${fromLocation.name}: ${previousStock}`
                )
            }

            const nextStock = roundStock(previousStock - quantity)

            const stockResult = await client.query<{ stock: string } & QueryResultRow>(
                `
                UPDATE product_stocks
                SET stock = $1, updated_at = NOW()
                WHERE product_id = $2 AND location_id = $3
                RETURNING stock
                `,
                [nextStock, productId, fromLocation.id]
            )

            await syncLegacyTochkaStock(client, fromLocation, productId, Number(stockResult.rows[0].stock))

            const sellingPrice = Number(product.selling_price || 0)
            const purchasePrice = Number(product.purchase_price || 0)

            await client.query(
                `
                INSERT INTO product_shipment_items (
                    shipment_id,
                    product_id,
                    row_number,
                    product_name,
                    category,
                    barcode,
                    unit,
                    quantity,
                    purchase_price,
                    selling_price,
                    previous_stock,
                    new_stock,
                    result,
                    error
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'shipped', NULL)
                `,
                [
                    shipmentId,
                    productId,
                    index + 1,
                    product.name || '',
                    product.category || '',
                    product.barcode || '',
                    product.unit || 'piece',
                    quantity,
                    purchasePrice,
                    sellingPrice,
                    previousStock,
                    nextStock,
                ]
            )

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
                VALUES ($1, $2, 'transfer_out', $3, $4, 'product_shipment', $5, $6, 'system')
                `,
                [
                    productId,
                    fromLocation.id,
                    -quantity,
                    nextStock,
                    shipmentId,
                    `Отгрузка ${shipmentNumber} из ${fromLocation.name} в ${toLocation.name}`,
                ]
            )

            totalQuantity += quantity
            totalAmount += quantity * sellingPrice
            updatedProducts.push(mapProduct({ ...product, stock: nextStock }))
        }

        await client.query(
            `
            UPDATE product_shipments
            SET
                total_rows = $1,
                total_quantity = $2,
                total_amount = $3,
                updated_at = NOW()
            WHERE id = $4
            `,
            [items.length, totalQuantity, totalAmount, shipmentId]
        )

        await client.query('COMMIT')

        return NextResponse.json({
            id: shipmentId,
            shipmentId,
            number: shipmentNumber,
            shipmentNumber,
            transferBarcode,
            fromLocationName: fromLocation.name,
            fromLocationSlug: fromLocation.slug,
            toLocationName: toLocation.name,
            toLocationSlug: toLocation.slug,
            status: 'shipped',
            updated: updatedProducts.length,
            products: updatedProducts,
        })
    } catch (error) {
        await client.query('ROLLBACK')

        console.error('POST /api/shipment error:', error)

        return NextResponse.json(
            {
                message: error instanceof Error
                    ? error.message
                    : 'Ошибка отгрузки товара',
            },
            { status: 500 }
        )
    } finally {
        client.release()
    }
}

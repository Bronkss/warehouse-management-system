import { NextRequest, NextResponse } from 'next/server'
import type { PoolClient, QueryResultRow } from 'pg'
import { pool } from '@/app/lib/db'
import { resolveWarehouseContext, type WarehouseLocation } from '@/app/lib/serverWarehouseLocation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ProductUnit = 'piece' | 'weight'

type RouteContext = {
    params: { id: string } | Promise<{ id: string }>
}

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

type ShipmentRow = QueryResultRow & {
    id: number
    number: string
    transfer_barcode: string | null
    shipper: string | null
    consignee: string | null
    total_rows: number
    total_quantity: string | number
    total_amount: string | number
    status: string
    created_at: string
    updated_at: string
    shipped_at: string | null
    received_at: string | null
    from_location_id: number | null
    to_location_id: number | null
    from_location_name: string | null
    from_location_slug: string | null
    to_location_name: string | null
    to_location_slug: string | null
}

type ShipmentItemRow = QueryResultRow & {
    id: number
    shipment_id: number
    product_id: number | null
    row_number: number
    product_name: string
    category: string
    barcode: string
    unit: ProductUnit
    quantity: string | number
    purchase_price: string | number
    selling_price: string | number
    previous_stock: string | number | null
    new_stock: string | number | null
    result: string
    error: string | null
}

type ShipmentEditRow = {
    shipmentItemId?: number | null
    productId?: number | null
    rowId?: string
    rowNumber?: number
    name?: string
    category?: string
    barcode?: string
    unit?: ProductUnit
    quantity?: string | number
    purchasePrice?: string | number
    sellingPrice?: string | number
}

type ShipmentEditBody = {
    shipper?: string
    consignee?: string
    rows?: ShipmentEditRow[]
}

async function getParams(context: RouteContext) {
    return await context.params
}

function toNumber(value: unknown) {
    const parsed = Number(String(value ?? '0').replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : 0
}

function cleanString(value: unknown) {
    return String(value ?? '').trim()
}

function roundStock(value: number): number {
    return Math.round((value + Number.EPSILON) * 1000) / 1000
}

function isShipmentVisibleForLocation(shipment: ShipmentRow, location: WarehouseLocation) {
    return Number(shipment.from_location_id) === location.id || Number(shipment.to_location_id) === location.id
}

function isShipmentEditableByLocation(shipment: ShipmentRow, location: WarehouseLocation) {
    return Number(shipment.from_location_id) === location.id
}

function mapShipment(row: ShipmentRow, rows: ShipmentItemRow[], currentLocationId: number) {
    const fromLocationId = row.from_location_id ? Number(row.from_location_id) : null
    const toLocationId = row.to_location_id ? Number(row.to_location_id) : null

    let direction: 'outgoing' | 'incoming' | 'legacy' = 'legacy'

    if (fromLocationId === currentLocationId) {
        direction = 'outgoing'
    } else if (toLocationId === currentLocationId) {
        direction = 'incoming'
    }

    return {
        id: Number(row.id),
        number: row.number,
        transferBarcode: row.transfer_barcode || '',
        shipper: row.shipper || '',
        consignee: row.consignee || '',
        totalRows: Number(row.total_rows || 0),
        totalQuantity: Number(row.total_quantity || 0),
        totalAmount: Number(row.total_amount || 0),
        status: row.status || 'shipped',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        shippedAt: row.shipped_at,
        receivedAt: row.received_at,
        fromLocationId,
        toLocationId,
        fromLocationName: row.from_location_name || '',
        fromLocationSlug: row.from_location_slug || '',
        toLocationName: row.to_location_name || '',
        toLocationSlug: row.to_location_slug || '',
        direction,
        createdByName: (row as any).created_by_name || '',
        createdByLogin: (row as any).created_by_login || '',
        updatedByName: (row as any).updated_by_name || '',
        updatedByLogin: (row as any).updated_by_login || '',
        rows: rows.map(item => ({
            shipmentItemId: Number(item.id),
            productId: item.product_id ? Number(item.product_id) : null,
            rowId: `shipment-item-${item.id}`,
            rowNumber: Number(item.row_number || 0),
            name: item.product_name || '',
            category: item.category || '',
            barcode: item.barcode || '',
            unit: item.unit || 'piece',
            quantity: String(item.quantity ?? '0'),
            purchasePrice: String(item.purchase_price ?? '0'),
            sellingPrice: String(item.selling_price ?? '0'),
            previousStock: item.previous_stock === null ? null : Number(item.previous_stock),
            newStock: item.new_stock === null ? null : Number(item.new_stock),
            result: item.result || 'shipped',
            error: item.error || null,
        })),
    }
}

async function loadShipmentHeader(
    clientOrPool: PoolClient | typeof pool,
    id: number,
    lock = false
): Promise<ShipmentRow | null> {
    const result = await clientOrPool.query<ShipmentRow>(
        `
        SELECT
            s.id,
            s.number,
            s.transfer_barcode,
            s.shipper,
            s.consignee,
            s.total_rows,
            s.total_quantity,
            s.total_amount,
            s.status,
            s.created_at,
            s.updated_at,
            s.shipped_at,
            s.received_at,
            s.from_location_id,
            s.to_location_id,
            from_l.name AS from_location_name,
            from_l.slug AS from_location_slug,
            to_l.name AS to_location_name,
            to_l.slug AS to_location_slug,
            COALESCE(s.created_by_name, '') AS created_by_name,
            COALESCE(s.created_by_login, '') AS created_by_login,
            COALESCE(s.updated_by_name, '') AS updated_by_name,
            COALESCE(s.updated_by_login, '') AS updated_by_login
        FROM product_shipments s
        LEFT JOIN locations from_l ON from_l.id = s.from_location_id
        LEFT JOIN locations to_l ON to_l.id = s.to_location_id
        WHERE s.id = $1
        ${lock ? 'FOR UPDATE OF s' : ''}
        `,
        [id]
    )

    return result.rows[0] || null
}

async function loadShipmentItems(
    clientOrPool: PoolClient | typeof pool,
    id: number,
    lock = false
): Promise<ShipmentItemRow[]> {
    const result = await clientOrPool.query<ShipmentItemRow>(
        `
        SELECT
            id,
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
        FROM product_shipment_items
        WHERE shipment_id = $1
        ORDER BY row_number ASC, id ASC
        ${lock ? 'FOR UPDATE' : ''}
        `,
        [id]
    )

    return result.rows
}

async function loadShipmentDetail(
    id: number,
    location: WarehouseLocation
) {
    const shipment = await loadShipmentHeader(pool, id)

    if (!shipment || !isShipmentVisibleForLocation(shipment, location)) {
        return null
    }

    const rows = await loadShipmentItems(pool, id)

    return mapShipment(shipment, rows, location.id)
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

export async function GET(request: NextRequest, context: RouteContext) {
    try {
        const { location } = await resolveWarehouseContext(pool, request)
        const params = await getParams(context)
        const id = Number(params.id)

        if (!Number.isInteger(id) || id <= 0) {
            return NextResponse.json({ message: 'Некорректный ID отгрузки' }, { status: 400 })
        }

        const detail = await loadShipmentDetail(id, location)

        if (!detail) {
            return NextResponse.json({ message: 'Отгрузка не найдена в текущей зоне' }, { status: 404 })
        }

        return NextResponse.json(detail, {
            headers: {
                'Cache-Control': 'private, no-store',
            },
        })
    } catch (error) {
        console.error('GET /api/shipment/history/[id] error:', error)

        return NextResponse.json(
            {
                message: error instanceof Error
                    ? error.message
                    : 'Не удалось открыть отгрузку',
            },
            { status: 500 }
        )
    }
}

export async function PUT(request: NextRequest, context: RouteContext) {
    const client = await pool.connect()

    try {
        const { location, user } = await resolveWarehouseContext(client, request)
        const params = await getParams(context)
        const id = Number(params.id)

        if (!Number.isInteger(id) || id <= 0) {
            return NextResponse.json({ message: 'Некорректный ID отгрузки' }, { status: 400 })
        }

        const body = await request.json() as ShipmentEditBody
        const rows = Array.isArray(body.rows) ? body.rows : []
        const consignee = cleanString(body.consignee)

        if (rows.length === 0) {
            return NextResponse.json({ message: 'В отгрузке должна быть хотя бы одна позиция' }, { status: 400 })
        }

        await client.query('BEGIN')

        const shipment = await loadShipmentHeader(client, id, true)

        if (!shipment) {
            throw new Error('Отгрузка не найдена')
        }

        if (!isShipmentEditableByLocation(shipment, location)) {
            throw new Error('Редактировать отгрузку может только зона-отправитель')
        }

        if (shipment.status === 'received') {
            throw new Error('Нельзя редактировать отгрузку, которую уже приняли в зоне-получателе')
        }

        const oldItems = await loadShipmentItems(client, id, true)

        for (const oldItem of oldItems) {
            if (!oldItem.product_id) continue

            const productId = Number(oldItem.product_id)
            const quantity = toNumber(oldItem.quantity)
            const product = await getProductStockForUpdate(client, productId, location.id)

            if (!product) continue

            const restoredStock = roundStock(Number(product.stock) + quantity)

            await client.query(
                `
                UPDATE product_stocks
                SET stock = $1, updated_at = NOW()
                WHERE product_id = $2 AND location_id = $3
                `,
                [restoredStock, productId, location.id]
            )

            await syncLegacyTochkaStock(client, location, productId, restoredStock)
        }

        await client.query('DELETE FROM product_shipment_items WHERE shipment_id = $1', [id])

        let totalQuantity = 0
        let totalAmount = 0
        const updatedProducts: ProductStockRow[] = []

        for (let index = 0; index < rows.length; index += 1) {
            const row = rows[index]
            const productId = Number(row.productId)
            const quantity = toNumber(row.quantity)

            if (!Number.isInteger(productId) || productId <= 0) {
                throw new Error(`Строка ${index + 1}: некорректный ID товара`)
            }

            if (!Number.isFinite(quantity) || quantity <= 0) {
                throw new Error(`Строка ${index + 1}: некорректное количество`)
            }

            const product = await getProductStockForUpdate(client, productId, location.id)

            if (!product) {
                throw new Error(`Строка ${index + 1}: товар с ID ${productId} не найден`)
            }

            const previousStock = Number(product.stock)

            if (previousStock < quantity) {
                throw new Error(
                    `Строка ${index + 1}: недостаточно остатка "${product.name}". Доступно в зоне ${location.name}: ${previousStock}`
                )
            }

            const newStock = roundStock(previousStock - quantity)
            const sellingPrice = toNumber(row.sellingPrice || product.selling_price || 0)
            const purchasePrice = Number(product.purchase_price || 0)

            await client.query(
                `
                UPDATE product_stocks
                SET stock = $1, updated_at = NOW()
                WHERE product_id = $2 AND location_id = $3
                `,
                [newStock, productId, location.id]
            )

            await syncLegacyTochkaStock(client, location, productId, newStock)

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
                    id,
                    productId,
                    index + 1,
                    product.name || cleanString(row.name),
                    product.category || cleanString(row.category),
                    product.barcode || cleanString(row.barcode),
                    product.unit || row.unit || 'piece',
                    quantity,
                    purchasePrice,
                    sellingPrice,
                    previousStock,
                    newStock,
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
                VALUES ($1, $2, 'transfer_out_edit', $3, $4, 'product_shipment', $5, $6, $7)
                `,
                [
                    productId,
                    location.id,
                    -quantity,
                    newStock,
                    id,
                    `Редактирование отгрузки ${shipment.number}`,
                    user.login,
                ]
            )

            totalQuantity += quantity
            totalAmount += quantity * sellingPrice
            updatedProducts.push({ ...product, stock: newStock })
        }

        await client.query(
            `
            UPDATE product_shipments
            SET
                shipper = $1,
                consignee = $2,
                updated_by_name = $3,
                updated_by_login = $4,
                total_rows = $5,
                total_quantity = $6,
                total_amount = $7,
                status = 'shipped',
                errors = '[]'::jsonb,
                updated_at = NOW()
            WHERE id = $8
            `,
            [location.name, consignee || null, user.name, user.login, rows.length, totalQuantity, totalAmount, id]
        )

        await client.query('COMMIT')

        const detail = await loadShipmentDetail(id, location)

        return NextResponse.json({
            shipmentId: id,
            number: shipment.number,
            shipmentNumber: shipment.number,
            transferBarcode: shipment.transfer_barcode || '',
            totalRows: rows.length,
            updated: updatedProducts.length,
            updatedByName: user.name,
            updatedByLogin: user.login,
            detail,
        })
    } catch (error) {
        await client.query('ROLLBACK')

        console.error('PUT /api/shipment/history/[id] error:', error)

        return NextResponse.json(
            {
                message: error instanceof Error
                    ? error.message
                    : 'Не удалось сохранить отгрузку',
            },
            { status: 500 }
        )
    } finally {
        client.release()
    }
}

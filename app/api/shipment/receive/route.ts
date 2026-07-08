import { NextRequest, NextResponse } from 'next/server'
import type { PoolClient, QueryResultRow } from 'pg'
import { pool } from '@/app/lib/db'
import { resolveWarehouseLocation, type WarehouseLocation } from '@/app/lib/serverWarehouseLocation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ShipmentRow = QueryResultRow & {
    id: number
    number: string
    transfer_barcode: string | null
    status: string
    from_location_id: number | null
    to_location_id: number | null
    from_location_name: string | null
    to_location_name: string | null
}

type ShipmentItemRow = QueryResultRow & {
    id: number
    product_id: number
    quantity: string | number
    product_name: string
}

type StockRow = QueryResultRow & {
    stock: string
}

type ReceiveBody = {
    barcode?: string
    number?: string
    shipmentId?: number | string
}

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

async function findShipmentForReceive(client: PoolClient, body: ReceiveBody): Promise<ShipmentRow | null> {
    const shipmentId = Number(body.shipmentId)
    const code = cleanString(body.barcode || body.number)

    if (Number.isInteger(shipmentId) && shipmentId > 0) {
        const result = await client.query<ShipmentRow>(
            `
            SELECT
                s.id,
                s.number,
                s.transfer_barcode,
                s.status,
                s.from_location_id,
                s.to_location_id,
                from_l.name AS from_location_name,
                to_l.name AS to_location_name
            FROM product_shipments s
            LEFT JOIN locations from_l ON from_l.id = s.from_location_id
            LEFT JOIN locations to_l ON to_l.id = s.to_location_id
            WHERE s.id = $1
            FOR UPDATE OF s
            `,
            [shipmentId]
        )

        return result.rows[0] || null
    }

    if (!code) {
        return null
    }

    const result = await client.query<ShipmentRow>(
        `
        SELECT
            s.id,
            s.number,
            s.transfer_barcode,
            s.status,
            s.from_location_id,
            s.to_location_id,
            from_l.name AS from_location_name,
            to_l.name AS to_location_name
        FROM product_shipments s
        LEFT JOIN locations from_l ON from_l.id = s.from_location_id
        LEFT JOIN locations to_l ON to_l.id = s.to_location_id
        WHERE s.transfer_barcode = $1 OR s.number = $1
        FOR UPDATE OF s
        `,
        [code]
    )

    return result.rows[0] || null
}

export async function POST(request: NextRequest) {
    const client = await pool.connect()

    try {
        const body = await request.json() as ReceiveBody

        await client.query('BEGIN')

        const location = await resolveWarehouseLocation(client, request)
        const shipment = await findShipmentForReceive(client, body)

        if (!shipment) {
            throw new Error('Перемещение по этому штрихкоду не найдено')
        }

        if (!shipment.to_location_id) {
            throw new Error('У этой старой отгрузки не указана зона-получатель. Её нельзя принять по штрихкоду.')
        }

        if (Number(shipment.to_location_id) !== location.id) {
            throw new Error(
                `Эта отгрузка предназначена для зоны «${shipment.to_location_name || 'другая зона'}», а вы вошли в «${location.name}»`
            )
        }

        if (shipment.status === 'received') {
            throw new Error('Это перемещение уже было принято ранее')
        }

        if (shipment.status !== 'shipped') {
            throw new Error(`Нельзя принять перемещение со статусом «${shipment.status}»`)
        }

        const itemsResult = await client.query<ShipmentItemRow>(
            `
            SELECT id, product_id, quantity, product_name
            FROM product_shipment_items
            WHERE shipment_id = $1
            ORDER BY row_number ASC, id ASC
            `,
            [shipment.id]
        )

        if (itemsResult.rows.length === 0) {
            throw new Error('В перемещении нет товаров')
        }

        let acceptedRows = 0
        let acceptedQuantity = 0

        for (const item of itemsResult.rows) {
            const productId = Number(item.product_id)
            const quantity = toNumber(item.quantity)

            if (!Number.isInteger(productId) || productId <= 0 || quantity <= 0) {
                continue
            }

            await ensureProductStockRows(client, productId)

            const stockResult = await client.query<StockRow>(
                `
                SELECT stock
                FROM product_stocks
                WHERE product_id = $1 AND location_id = $2
                FOR UPDATE
                `,
                [productId, location.id]
            )

            const currentStock = Number(stockResult.rows[0]?.stock || 0)
            const nextStock = roundStock(currentStock + quantity)

            await client.query(
                `
                UPDATE product_stocks
                SET stock = $1, updated_at = NOW()
                WHERE product_id = $2 AND location_id = $3
                `,
                [nextStock, productId, location.id]
            )

            await syncLegacyTochkaStock(client, location, productId, nextStock)

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
                VALUES ($1, $2, 'transfer_in', $3, $4, 'product_shipment', $5, $6, 'system')
                `,
                [
                    productId,
                    location.id,
                    quantity,
                    nextStock,
                    shipment.id,
                    `Приём перемещения ${shipment.number} из ${shipment.from_location_name || 'другой зоны'}`,
                ]
            )

            acceptedRows += 1
            acceptedQuantity += quantity
        }

        await client.query(
            `
            UPDATE product_shipments
            SET
                status = 'received',
                received_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
            `,
            [shipment.id]
        )

        await client.query('COMMIT')

        return NextResponse.json({
            ok: true,
            shipmentId: Number(shipment.id),
            number: shipment.number,
            transferBarcode: shipment.transfer_barcode || '',
            status: 'received',
            fromLocationName: shipment.from_location_name || '',
            toLocationName: shipment.to_location_name || location.name,
            acceptedRows,
            acceptedQuantity,
            message: `Перемещение ${shipment.number} принято в зону «${location.name}»`,
        })
    } catch (error) {
        await client.query('ROLLBACK')

        console.error('POST /api/shipment/receive error:', error)

        return NextResponse.json(
            {
                message: error instanceof Error
                    ? error.message
                    : 'Ошибка приёмки перемещения',
            },
            { status: 500 }
        )
    } finally {
        client.release()
    }
}

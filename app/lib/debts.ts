import type { PoolClient } from 'pg'
import type { WarehouseLocation } from '@/app/lib/serverWarehouseLocation'

export type DebtStatus =
    | 'active'
    | 'partially_paid'
    | 'closed'
    | 'cancelled'

export type DebtPaymentMethod =
    | 'cash'
    | 'card'
    | 'transfer'

export function toNumber(
    value: unknown,
    fallback = 0
): number {
    if (
        value === null ||
        value === undefined ||
        value === ''
    ) {
        return fallback
    }

    const parsed = Number(
        String(value)
            .replace(',', '.')
            .replace(/\s/g, '')
    )

    return Number.isFinite(parsed)
        ? parsed
        : fallback
}

export function roundMoney(
    value: number
): number {
    return Math.round(
        (value + Number.EPSILON) * 100
    ) / 100
}

export function roundQuantity(
    value: number
): number {
    return Math.round(
        (value + Number.EPSILON) * 1000
    ) / 1000
}

export function normalizePhone(
    value: unknown
): string {
    let digits = String(value || '')
        .replace(/\D/g, '')

    if (
        digits.length === 11 &&
        digits.startsWith('8')
    ) {
        digits = `7${digits.slice(1)}`
    }

    if (digits.length === 10) {
        digits = `7${digits}`
    }

    return digits
}

export function getDebtStatus(
    total: number,
    returnedTotal: number,
    paidTotal: number,
    refundedTotal = 0
): DebtStatus {
    const remaining = roundMoney(
        total - returnedTotal - paidTotal + refundedTotal
    )

    if (remaining <= 0.009) {
        return 'closed'
    }

    if (
        returnedTotal > 0.009 ||
        paidTotal > 0.009
    ) {
        return 'partially_paid'
    }

    return 'active'
}

function formatDocumentNumber(
    prefix: string,
    sequenceValue: number
): string {
    return `${prefix}-${String(sequenceValue).padStart(6, '0')}`
}

async function nextSequenceValue(
    client: PoolClient,
    sequenceName:
        | 'debt_sale_number_seq'
        | 'debt_payment_number_seq'
        | 'debt_return_number_seq'
        | 'debt_refund_number_seq'
): Promise<number> {
    const result = await client.query<{
        value: string | number
    }>(
        `SELECT nextval('${sequenceName}') AS value`
    )

    const value = Number(
        result.rows[0]?.value
    )

    if (
        !Number.isInteger(value) ||
        value <= 0
    ) {
        throw new Error(
            'Не удалось сформировать номер документа'
        )
    }

    return value
}

export async function nextDebtSaleNumber(
    client: PoolClient
): Promise<string> {
    const value = await nextSequenceValue(
        client,
        'debt_sale_number_seq'
    )

    return formatDocumentNumber(
        'DEBT',
        value
    )
}

export async function nextDebtPaymentNumber(
    client: PoolClient
): Promise<string> {
    const value = await nextSequenceValue(
        client,
        'debt_payment_number_seq'
    )

    return formatDocumentNumber(
        'DEBT-PAY',
        value
    )
}

export async function nextDebtReturnNumber(
    client: PoolClient
): Promise<string> {
    const value = await nextSequenceValue(
        client,
        'debt_return_number_seq'
    )

    return formatDocumentNumber(
        'DEBT-RET',
        value
    )
}

export async function nextDebtRefundNumber(
    client: PoolClient
): Promise<string> {
    const value = await nextSequenceValue(
        client,
        'debt_refund_number_seq'
    )

    return formatDocumentNumber(
        'DEBT-REF',
        value
    )
}

export async function getCustomerDebt(
    client: PoolClient,
    customerId: number
): Promise<number> {
    const result = await client.query<{
        debt: string | number | null
    }>(
        `
            SELECT
                COALESCE(
                    SUM(
                        GREATEST(
                            total
                            - returned_total
                            - paid_total
                            + refunded_total,
                            0
                        )
                    ),
                    0
                )::float AS debt
            FROM debt_sales
            WHERE customer_id = $1
              AND status <> 'cancelled'
        `,
        [customerId]
    )

    return roundMoney(
        toNumber(
            result.rows[0]?.debt
        )
    )
}

export async function ensureProductStockRow(
    client: PoolClient,
    productId: number,
    locationId: number
): Promise<void> {
    await client.query(
        `
            INSERT INTO product_stocks (
                product_id,
                location_id,
                stock
            )
            SELECT
                $1,
                $2,
                0
            WHERE EXISTS (
                SELECT 1
                FROM products
                WHERE id = $1
            )
            ON CONFLICT (
                product_id,
                location_id
            )
            DO NOTHING
        `,
        [
            productId,
            locationId,
        ]
    )
}

export async function syncLegacyTochkaStock(
    client: PoolClient,
    location: WarehouseLocation,
    productId: number,
    stock: number
): Promise<void> {
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
        [
            stock,
            productId,
        ]
    )
}

export function canDebtProductGoNegative(
    unit: unknown,
    marked: unknown
): boolean {
    return (
        String(unit || '')
            .trim()
            .toLowerCase() === 'weight' &&
        !Boolean(marked)
    )
}

type DebtEventInput = {
    customerId: number
    eventType: string

    debtSaleId?: number | null
    paymentId?: number | null
    returnId?: number | null
    refundId?: number | null
    locationId?: number | null

    amount?: number | null

    payload?: Record<string, unknown>

    createdBy?: string | null
    createdByName?: string | null
}

export async function insertDebtEvent(
    client: PoolClient,
    input: DebtEventInput
): Promise<void> {
    await client.query(
        `
            INSERT INTO debt_events (
                customer_id,
                event_type,
                debt_sale_id,
                payment_id,
                return_id,
                refund_id,
                location_id,
                amount,
                payload,
                created_by,
                created_by_name
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9::jsonb,
                $10,
                $11
            )
        `,
        [
            input.customerId,
            input.eventType,
            input.debtSaleId ?? null,
            input.paymentId ?? null,
            input.returnId ?? null,
            input.refundId ?? null,
            input.locationId ?? null,
            input.amount ?? null,
            JSON.stringify(
                input.payload || {}
            ),
            input.createdBy ?? null,
            input.createdByName ?? null,
        ]
    )
}

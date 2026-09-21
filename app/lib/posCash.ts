import type {
    QueryResult,
    QueryResultRow,
} from 'pg'

export type Queryable = {
    query<T extends QueryResultRow = QueryResultRow>(
        queryText: string,
        values?: readonly unknown[]
    ): Promise<QueryResult<T>>
}

export type PosShiftRow = QueryResultRow & {
    id: number | string
    location_id: number | string
    status: 'open' | 'closed'
    opened_at: string
    closed_at: string | null
    opened_by_login: string
    opened_by_name: string
    closed_by_login: string | null
    closed_by_name: string | null
    opening_cash: number | string
    cash_sales_total: number | string
    cash_debt_payments_total: number | string
    cash_debt_refunds_total: number | string
    cash_deposits_total: number | string
    cash_withdrawals_total: number | string
    supplier_payments_total: number | string
    closing_withdrawal: number | string
    calculated_cash_before_close: number | string | null
    closing_cash: number | string | null
    close_comment: string | null
}

export type CashMovementType =
    | 'deposit'
    | 'withdrawal'
    | 'supplier_payment'
    | 'shift_withdrawal'

export type ShiftCashTotals = {
    openingCash: number
    cashSales: number
    cashDebtPayments: number
    cashDebtRefunds: number
    deposits: number
    withdrawals: number
    supplierPayments: number
    shiftWithdrawals: number
    cashIn: number
    cashOut: number
    calculatedCash: number
}

type SumRow = QueryResultRow & {
    total: number | string | null
}

type MovementSumRow = QueryResultRow & {
    movement_type: string
    total: number | string | null
}

export function toNumber(value: unknown): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

export function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100
}

export function serializeShift(row: PosShiftRow) {
    return {
        id: Number(row.id),
        locationId: Number(row.location_id),
        status: row.status,
        openedAt: row.opened_at,
        closedAt: row.closed_at,
        openedBy: {
            login: row.opened_by_login,
            name: row.opened_by_name,
        },
        closedBy: row.closed_by_login
            ? {
                login: row.closed_by_login,
                name: row.closed_by_name || row.closed_by_login,
            }
            : null,
        openingCash: roundMoney(toNumber(row.opening_cash)),
        cashSalesTotal: roundMoney(toNumber(row.cash_sales_total)),
        cashDebtPaymentsTotal: roundMoney(toNumber(row.cash_debt_payments_total)),
        cashDebtRefundsTotal: roundMoney(toNumber(row.cash_debt_refunds_total)),
        cashDepositsTotal: roundMoney(toNumber(row.cash_deposits_total)),
        cashWithdrawalsTotal: roundMoney(toNumber(row.cash_withdrawals_total)),
        supplierPaymentsTotal: roundMoney(toNumber(row.supplier_payments_total)),
        closingWithdrawal: roundMoney(toNumber(row.closing_withdrawal)),
        calculatedCashBeforeClose:
            row.calculated_cash_before_close === null
                ? null
                : roundMoney(toNumber(row.calculated_cash_before_close)),
        closingCash:
            row.closing_cash === null
                ? null
                : roundMoney(toNumber(row.closing_cash)),
        closeComment: row.close_comment || '',
    }
}

export async function getOpenShift(
    queryable: Queryable,
    locationId: number
): Promise<PosShiftRow | null> {
    const result = await queryable.query<PosShiftRow>(
        `
            SELECT *
            FROM pos_shifts
            WHERE location_id = $1 AND status = 'open'
            ORDER BY opened_at DESC
            LIMIT 1
        `,
        [locationId]
    )

    return result.rows[0] || null
}

export async function getLastClosedShift(
    queryable: Queryable,
    locationId: number
): Promise<PosShiftRow | null> {
    const result = await queryable.query<PosShiftRow>(
        `
            SELECT *
            FROM pos_shifts
            WHERE location_id = $1 AND status = 'closed'
            ORDER BY closed_at DESC NULLS LAST
            LIMIT 1
        `,
        [locationId]
    )

    return result.rows[0] || null
}

export async function calculateShiftCash(
    queryable: Queryable,
    shift: PosShiftRow,
    toDate: Date | null = null
): Promise<ShiftCashTotals> {
    const from = new Date(shift.opened_at)
    const to = toDate || new Date()

    const [
        salesResult,
        debtPaymentsResult,
        debtRefundsResult,
        movementsResult,
    ] = await Promise.all([
        queryable.query<SumRow>(
            `
                SELECT COALESCE(SUM(cash_amount), 0)::float AS total
                FROM receipts
                WHERE
                    location_id = $1
                    AND created_at >= $2::timestamptz
                    AND created_at < $3::timestamptz
            `,
            [Number(shift.location_id), from.toISOString(), to.toISOString()]
        ),

        queryable.query<SumRow>(
            `
                SELECT COALESCE(SUM(amount), 0)::float AS total
                FROM debt_payments
                WHERE
                    location_id = $1
                    AND payment_method = 'cash'
                    AND created_at >= $2::timestamptz
                    AND created_at < $3::timestamptz
            `,
            [Number(shift.location_id), from.toISOString(), to.toISOString()]
        ),

        queryable.query<SumRow>(
            `
                SELECT COALESCE(SUM(amount), 0)::float AS total
                FROM debt_refunds
                WHERE
                    location_id = $1
                    AND payment_method = 'cash'
                    AND created_at >= $2::timestamptz
                    AND created_at < $3::timestamptz
            `,
            [Number(shift.location_id), from.toISOString(), to.toISOString()]
        ),

        queryable.query<MovementSumRow>(
            `
                SELECT
                    movement_type,
                    COALESCE(SUM(amount), 0)::float AS total
                FROM pos_cash_movements
                WHERE shift_id = $1
                GROUP BY movement_type
            `,
            [Number(shift.id)]
        ),
    ])

    const movementTotals: Record<CashMovementType, number> = {
        deposit: 0,
        withdrawal: 0,
        supplier_payment: 0,
        shift_withdrawal: 0,
    }

    for (const row of movementsResult.rows) {
        const type = String(row.movement_type) as CashMovementType

        if (type in movementTotals) {
            movementTotals[type] = roundMoney(toNumber(row.total))
        }
    }

    const openingCash = roundMoney(toNumber(shift.opening_cash))
    const cashSales = roundMoney(toNumber(salesResult.rows[0]?.total))
    const cashDebtPayments = roundMoney(toNumber(debtPaymentsResult.rows[0]?.total))
    const cashDebtRefunds = roundMoney(toNumber(debtRefundsResult.rows[0]?.total))
    const deposits = movementTotals.deposit
    const withdrawals = movementTotals.withdrawal
    const supplierPayments = movementTotals.supplier_payment
    const shiftWithdrawals = movementTotals.shift_withdrawal

    const cashIn = roundMoney(
        cashSales +
        cashDebtPayments +
        deposits
    )

    const cashOut = roundMoney(
        cashDebtRefunds +
        withdrawals +
        supplierPayments +
        shiftWithdrawals
    )

    const calculatedCash = roundMoney(
        Math.max(
            0,
            openingCash +
            cashIn -
            cashOut
        )
    )

    return {
        openingCash,
        cashSales,
        cashDebtPayments,
        cashDebtRefunds,
        deposits,
        withdrawals,
        supplierPayments,
        shiftWithdrawals,
        cashIn,
        cashOut,
        calculatedCash,
    }
}

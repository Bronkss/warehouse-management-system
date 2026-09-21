import {
    NextRequest,
    NextResponse,
} from 'next/server'

import { pool } from '@/app/lib/db'
import {
    calculateShiftCash,
    getLastClosedShift,
    getOpenShift,
    roundMoney,
    serializeShift,
    toNumber,
    type PosShiftRow,
} from '@/app/lib/posCash'
import { requireWarehouseSection } from '@/app/lib/serverWarehouseAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = {
    action?: 'open' | 'close'
    withdrawalAmount?: number | string
    comment?: string
}

function normalizeAmount(value: unknown): number {
    const raw =
        typeof value === 'string'
            ? value.replace(',', '.').replace(/\s/g, '')
            : value

    const parsed = Number(raw)

    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error('Некорректная сумма изъятия')
    }

    return roundMoney(parsed)
}

export async function GET(request: NextRequest) {
    try {
        const access = await requireWarehouseSection(
            pool,
            request,
            'sales'
        )

        if (!access.ok) {
            return access.response
        }

        const { location } = access.context
        const url = new URL(request.url)

        const requestedLimit = Number(
            url.searchParams.get('limit') || 30
        )

        const limit = Math.min(
            100,
            Math.max(
                1,
                Math.floor(
                    Number.isFinite(requestedLimit)
                        ? requestedLimit
                        : 30
                )
            )
        )

        const [openShift, historyResult] = await Promise.all([
            getOpenShift(
                pool,
                location.id
            ),

            pool.query<PosShiftRow>(
                `
                    SELECT *
                    FROM pos_shifts
                    WHERE
                        location_id = $1
                        AND status = 'closed'
                    ORDER BY closed_at DESC NULLS LAST
                    LIMIT $2
                `,
                [
                    location.id,
                    limit,
                ]
            ),
        ])

        const liveCash = openShift
            ? await calculateShiftCash(
                pool,
                openShift
            )
            : null

        return NextResponse.json(
            {
                location: {
                    id: location.id,
                    name: location.name,
                    slug: location.slug,
                },

                currentShift: openShift
                    ? {
                        ...serializeShift(
                            openShift
                        ),
                        liveCash,
                    }
                    : null,

                history: historyResult.rows.map(
                    serializeShift
                ),
            },
            {
                headers: {
                    'Cache-Control': 'no-store, max-age=0',
                },
            }
        )
    } catch (error) {
        console.error(
            'GET /api/pos/shifts error:',
            error
        )

        return NextResponse.json(
            {
                message:
                    error instanceof Error
                        ? error.message
                        : 'Не удалось загрузить историю смен',
            },
            {
                status: 500,
            }
        )
    }
}

export async function POST(request: NextRequest) {
    const client = await pool.connect()

    try {
        const access = await requireWarehouseSection(
            client,
            request,
            'sales'
        )

        if (!access.ok) {
            return access.response
        }

        const { location, user } = access.context
        const body = (await request.json()) as Body

        if (
            body.action !== 'open' &&
            body.action !== 'close'
        ) {
            return NextResponse.json(
                {
                    message: 'Неизвестное действие со сменой',
                },
                {
                    status: 400,
                }
            )
        }

        await client.query('BEGIN')

        if (body.action === 'open') {
            const existing = await getOpenShift(
                client,
                location.id
            )

            if (existing) {
                const liveCash = await calculateShiftCash(
                    client,
                    existing
                )

                await client.query('COMMIT')

                return NextResponse.json({
                    ok: true,
                    alreadyOpen: true,
                    shift: {
                        ...serializeShift(existing),
                        liveCash,
                    },
                })
            }

            const lastClosed = await getLastClosedShift(
                client,
                location.id
            )

            const openingCash = roundMoney(
                Math.max(
                    0,
                    toNumber(
                        lastClosed?.closing_cash
                    )
                )
            )

            const result = await client.query<PosShiftRow>(
                `
                    INSERT INTO pos_shifts (
                        location_id,
                        status,
                        opened_at,
                        opened_by_login,
                        opened_by_name,
                        opening_cash
                    )
                    VALUES (
                        $1,
                        'open',
                        NOW(),
                        $2,
                        $3,
                        $4
                    )
                    RETURNING *
                `,
                [
                    location.id,
                    user.login,
                    user.name,
                    openingCash,
                ]
            )

            await client.query('COMMIT')

            return NextResponse.json({
                ok: true,
                alreadyOpen: false,
                shift: {
                    ...serializeShift(
                        result.rows[0]
                    ),
                    liveCash: {
                        openingCash,
                        cashSales: 0,
                        cashDebtPayments: 0,
                        cashDebtRefunds: 0,
                        deposits: 0,
                        withdrawals: 0,
                        supplierPayments: 0,
                        shiftWithdrawals: 0,
                        cashIn: 0,
                        cashOut: 0,
                        calculatedCash: openingCash,
                    },
                },
            })
        }

        const shift = await getOpenShift(
            client,
            location.id
        )

        if (!shift) {
            throw new Error(
                'Открытая кассовая смена не найдена'
            )
        }

        const withdrawalAmount = normalizeAmount(
            body.withdrawalAmount
        )

        const comment = String(
            body.comment || ''
        ).trim()

        const closedAt = new Date()

        const cashBeforeClose = await calculateShiftCash(
            client,
            shift,
            closedAt
        )

        if (
            withdrawalAmount >
            cashBeforeClose.calculatedCash + 0.009
        ) {
            throw new Error(
                `Нельзя изъять ${withdrawalAmount.toFixed(2)} ₽: ` +
                `в кассе расчётно ${cashBeforeClose.calculatedCash.toFixed(2)} ₽`
            )
        }

        if (withdrawalAmount > 0) {
            await client.query(
                `
                    INSERT INTO pos_cash_movements (
                        shift_id,
                        location_id,
                        movement_type,
                        amount,
                        comment,
                        cashier_login,
                        cashier_name
                    )
                    VALUES (
                        $1,
                        $2,
                        'shift_withdrawal',
                        $3,
                        NULLIF($4, ''),
                        $5,
                        $6
                    )
                `,
                [
                    Number(shift.id),
                    location.id,
                    withdrawalAmount,
                    comment,
                    user.login,
                    user.name,
                ]
            )
        }

        const closingCash = roundMoney(
            Math.max(
                0,
                cashBeforeClose.calculatedCash -
                withdrawalAmount
            )
        )

        const result = await client.query<PosShiftRow>(
            `
                UPDATE pos_shifts
                SET
                    status = 'closed',
                    closed_at = $2,
                    closed_by_login = $3,
                    closed_by_name = $4,
                    cash_sales_total = $5,
                    cash_debt_payments_total = $6,
                    cash_debt_refunds_total = $7,
                    cash_deposits_total = $8,
                    cash_withdrawals_total = $9,
                    supplier_payments_total = $10,
                    closing_withdrawal = $11,
                    calculated_cash_before_close = $12,
                    closing_cash = $13,
                    close_comment = NULLIF($14, ''),
                    updated_at = NOW()
                WHERE id = $1
                RETURNING *
            `,
            [
                Number(shift.id),
                closedAt.toISOString(),
                user.login,
                user.name,
                cashBeforeClose.cashSales,
                cashBeforeClose.cashDebtPayments,
                cashBeforeClose.cashDebtRefunds,
                cashBeforeClose.deposits,
                cashBeforeClose.withdrawals,
                cashBeforeClose.supplierPayments,
                withdrawalAmount,
                cashBeforeClose.calculatedCash,
                closingCash,
                comment,
            ]
        )

        await client.query('COMMIT')

        return NextResponse.json({
            ok: true,
            shift: serializeShift(
                result.rows[0]
            ),
            cashBeforeClose,
            withdrawalAmount,
            closingCash,
        })
    } catch (error) {
        await client
            .query('ROLLBACK')
            .catch(() => undefined)

        console.error(
            'POST /api/pos/shifts error:',
            error
        )

        return NextResponse.json(
            {
                message:
                    error instanceof Error
                        ? error.message
                        : 'Не удалось изменить состояние кассовой смены',
            },
            {
                status: 500,
            }
        )
    } finally {
        client.release()
    }
}

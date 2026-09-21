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
} from '@/app/lib/posCash'
import { requireWarehouseSection } from '@/app/lib/serverWarehouseAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type MovementBody = {
    type?: 'deposit' | 'withdrawal' | 'supplier_payment'
    amount?: number | string
    counterparty?: string
    comment?: string
}

function normalizeAmount(value: unknown): number {
    const raw =
        typeof value === 'string'
            ? value.replace(',', '.').replace(/\s/g, '')
            : value

    const parsed = Number(raw)

    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(
            'Сумма должна быть больше нуля'
        )
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

        const openShift = await getOpenShift(
            pool,
            location.id
        )

        if (!openShift) {
            const lastClosed = await getLastClosedShift(
                pool,
                location.id
            )

            return NextResponse.json(
                {
                    location: {
                        id: location.id,
                        name: location.name,
                        slug: location.slug,
                    },
                    isOpen: false,
                    shift: null,
                    currentCash: roundMoney(
                        Number(
                            lastClosed?.closing_cash || 0
                        )
                    ),
                    lastClosedShift: lastClosed
                        ? serializeShift(lastClosed)
                        : null,
                    movements: [],
                },
                {
                    headers: {
                        'Cache-Control': 'no-store, max-age=0',
                    },
                }
            )
        }

        const [cash, movementsResult] = await Promise.all([
            calculateShiftCash(
                pool,
                openShift
            ),

            pool.query(
                `
                    SELECT
                        id,
                        movement_type,
                        amount::float AS amount,
                        counterparty,
                        comment,
                        cashier_login,
                        cashier_name,
                        created_at
                    FROM pos_cash_movements
                    WHERE shift_id = $1
                    ORDER BY created_at DESC
                    LIMIT 100
                `,
                [
                    Number(openShift.id),
                ]
            ),
        ])

        return NextResponse.json(
            {
                location: {
                    id: location.id,
                    name: location.name,
                    slug: location.slug,
                },
                isOpen: true,
                shift: serializeShift(
                    openShift
                ),
                cash,
                currentCash: cash.calculatedCash,
                movements: movementsResult.rows.map(
                    row => ({
                        id: Number(row.id),
                        type: String(row.movement_type),
                        amount: roundMoney(
                            Number(row.amount)
                        ),
                        counterparty:
                            row.counterparty || '',
                        comment:
                            row.comment || '',
                        cashierLogin:
                        row.cashier_login,
                        cashierName:
                        row.cashier_name,
                        createdAt:
                        row.created_at,
                    })
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
            'GET /api/pos/cash error:',
            error
        )

        return NextResponse.json(
            {
                message:
                    error instanceof Error
                        ? error.message
                        : 'Не удалось загрузить кассовый остаток',
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
        const body = (await request.json()) as MovementBody

        const type = String(body.type || '')

        if (
            type !== 'deposit' &&
            type !== 'withdrawal' &&
            type !== 'supplier_payment'
        ) {
            return NextResponse.json(
                {
                    message: 'Неизвестный тип кассовой операции',
                },
                {
                    status: 400,
                }
            )
        }

        const amount = normalizeAmount(
            body.amount
        )

        const counterparty = String(
            body.counterparty || ''
        ).trim()

        const comment = String(
            body.comment || ''
        ).trim()

        if (
            type === 'supplier_payment' &&
            counterparty.length < 2
        ) {
            return NextResponse.json(
                {
                    message: 'Укажите поставщика',
                },
                {
                    status: 400,
                }
            )
        }

        await client.query('BEGIN')

        const shift = await getOpenShift(
            client,
            location.id
        )

        if (!shift) {
            throw new Error(
                'Кассовая смена закрыта. Сначала откройте смену.'
            )
        }

        const before = await calculateShiftCash(
            client,
            shift
        )

        const isOutflow =
            type === 'withdrawal' ||
            type === 'supplier_payment'

        if (
            isOutflow &&
            amount >
            before.calculatedCash + 0.009
        ) {
            throw new Error(
                `В кассе недостаточно наличных. ` +
                `Расчётный остаток: ${before.calculatedCash.toFixed(2)} ₽`
            )
        }

        const result = await client.query(
            `
                INSERT INTO pos_cash_movements (
                    shift_id,
                    location_id,
                    movement_type,
                    amount,
                    counterparty,
                    comment,
                    cashier_login,
                    cashier_name
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    NULLIF($5, ''),
                    NULLIF($6, ''),
                    $7,
                    $8
                )
                RETURNING
                    id,
                    movement_type,
                    amount::float AS amount,
                    counterparty,
                    comment,
                    cashier_login,
                    cashier_name,
                    created_at
            `,
            [
                Number(shift.id),
                location.id,
                type,
                amount,
                counterparty,
                comment,
                user.login,
                user.name,
            ]
        )

        const after = await calculateShiftCash(
            client,
            shift
        )

        await client.query('COMMIT')

        return NextResponse.json({
            ok: true,
            movement: result.rows[0],
            cashBefore: before,
            cashAfter: after,
        })
    } catch (error) {
        await client
            .query('ROLLBACK')
            .catch(() => undefined)

        console.error(
            'POST /api/pos/cash error:',
            error
        )

        return NextResponse.json(
            {
                message:
                    error instanceof Error
                        ? error.message
                        : 'Не удалось выполнить кассовую операцию',
            },
            {
                status: 500,
            }
        )
    } finally {
        client.release()
    }
}

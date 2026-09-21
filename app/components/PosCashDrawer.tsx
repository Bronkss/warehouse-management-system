'use client'

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import {
    AnimatePresence,
    motion,
} from 'framer-motion'
import {
    AiOutlineClose,
    AiOutlineDollarCircle,
    AiOutlineHistory,
    AiOutlineMinusCircle,
    AiOutlinePlusCircle,
    AiOutlineReload,
    AiOutlineShop,
} from 'react-icons/ai'

type ShiftStatus = 'open' | 'closed'

type CashTotals = {
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

type PaymentMethod =
    | 'cash'
    | 'card'
    | 'transfer'

type PaymentBucket = {
    count: number
    total: number
}

type PaymentBreakdown = Record<
    PaymentMethod,
    PaymentBucket
>

type ShiftSummary = {
    from: string
    to: string

    location: {
        id: number
        name: string
        slug: string
    }

    ordinarySales: {
        count: number
        total: number
        byPayment: PaymentBreakdown
    }

    debtPayments: {
        count: number
        total: number
        byPayment: PaymentBreakdown
    }

    debtRefunds?: {
        count: number
        total: number
        byPayment: PaymentBreakdown
    }

    received: {
        count: number
        total: number
        byPayment: PaymentBreakdown
    }

    debtIssued: {
        count: number
        total: number
    }

    debtReturns: {
        count: number
        total: number
    }
}

type Shift = {
    id: number
    status: 'open' | 'closed'
    openedAt: string
    closedAt: string | null

    openedBy: {
        login: string
        name: string
    }

    closedBy:
        | {
        login: string
        name: string
    }
        | null

    openingCash: number
    cashSalesTotal: number
    cashDebtPaymentsTotal: number
    cashDebtRefundsTotal: number
    cashDepositsTotal: number
    cashWithdrawalsTotal: number
    supplierPaymentsTotal: number
    closingWithdrawal: number
    calculatedCashBeforeClose: number | null
    closingCash: number | null
    closeComment: string
}

type CurrentShift =
    Shift & {
    liveCash: CashTotals
}

type CashMovement = {
    id: number
    type:
        | 'deposit'
        | 'withdrawal'
        | 'supplier_payment'
        | 'shift_withdrawal'
    amount: number
    counterparty: string
    comment: string
    cashierLogin: string
    cashierName: string
    createdAt: string
}

type CashResponse = {
    location: {
        id: number
        name: string
        slug: string
    }

    isOpen: boolean
    shift: Shift | null
    cash?: CashTotals
    currentCash: number
    lastClosedShift?: Shift | null
    movements: CashMovement[]
}

type ShiftsResponse = {
    location: {
        id: number
        name: string
        slug: string
    }

    currentShift: CurrentShift | null
    history: Shift[]
}

type ApiError = {
    message?: string
}

type MovementMode =
    | 'deposit'
    | 'withdrawal'
    | 'supplier_payment'

const SHIFT_STATUS_KEY = 'pos_kkt_shift_status'
const POLL_MS = 300

const PAYMENT_META:
    Array<{
        method: PaymentMethod
        label: string
    }> = [
    {
        method: 'cash',
        label: 'Наличные',
    },
    {
        method: 'card',
        label: 'Карта',
    },
    {
        method: 'transfer',
        label: 'Перевод',
    },
]

function money(value: number): string {
    return new Intl.NumberFormat(
        'ru-RU',
        {
            style: 'currency',
            currency: 'RUB',
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        }
    ).format(
        Number(value || 0)
    )
}

function dateTime(
    value:
        | string
        | null
        | undefined
): string {
    if (!value) {
        return '—'
    }

    const date = new Date(value)

    return Number.isNaN(date.getTime())
        ? value
        : date.toLocaleString('ru-RU')
}

async function readJsonSafe<T>(
    response: Response
): Promise<T | null> {
    try {
        return await response.json() as T
    } catch {
        return null
    }
}

function apiMessage(
    value: unknown,
    fallback: string
): string {
    if (
        value &&
        typeof value === 'object' &&
        'message' in value
    ) {
        const message =
            (value as ApiError).message

        if (message) {
            return message
        }
    }

    return fallback
}

function movementLabel(
    type: CashMovement['type']
): string {
    if (type === 'deposit') {
        return 'Внесение'
    }

    if (type === 'withdrawal') {
        return 'Изъятие'
    }

    if (type === 'supplier_payment') {
        return 'Выдано поставщику'
    }

    return 'Изъятие при закрытии'
}

function isOutflow(
    type: CashMovement['type']
): boolean {
    return type !== 'deposit'
}

function suggestedWithdrawal(
    currentCash: number
): number {
    if (currentCash < 1000) {
        return 0
    }

    return Math.floor(
        currentCash / 1000
    ) * 1000
}

export default function PosCashDrawer() {
    const [isModalOpen, setIsModalOpen] =
        useState(false)

    const [isHistoryOpen, setIsHistoryOpen] =
        useState(false)

    const [isLoading, setIsLoading] =
        useState(false)

    const [error, setError] =
        useState<string | null>(null)

    const [kktStatus, setKktStatus] =
        useState<ShiftStatus>('closed')

    const [cash, setCash] =
        useState<CashResponse | null>(null)

    const [shifts, setShifts] =
        useState<ShiftsResponse | null>(null)

    const [shiftSummary, setShiftSummary] =
        useState<ShiftSummary | null>(null)

    const [movementMode, setMovementMode] =
        useState<MovementMode | null>(null)

    const [movementAmount, setMovementAmount] =
        useState('')

    const [counterparty, setCounterparty] =
        useState('')

    const [movementComment, setMovementComment] =
        useState('')

    const [isSavingMovement, setIsSavingMovement] =
        useState(false)

    const [isClosingMode, setIsClosingMode] =
        useState(false)

    const [closingWithdrawal, setClosingWithdrawal] =
        useState('')

    const [closeComment, setCloseComment] =
        useState('')

    const [isClosingShift, setIsClosingShift] =
        useState(false)

    const lastObservedKktStatus =
        useRef<ShiftStatus | null>(null)

    const loadCash =
        useCallback(
            async () => {
                const response =
                    await fetch(
                        '/api/pos/cash',
                        {
                            method: 'GET',
                            cache: 'no-store',
                            credentials: 'same-origin',
                        }
                    )

                const data =
                    await readJsonSafe<
                        CashResponse |
                        ApiError
                    >(response)

                if (!response.ok) {
                    throw new Error(
                        apiMessage(
                            data,
                            'Не удалось загрузить кассу'
                        )
                    )
                }

                const result =
                    data as CashResponse

                setCash(result)

                return result
            },
            []
        )

    const loadShifts =
        useCallback(
            async () => {
                const response =
                    await fetch(
                        '/api/pos/shifts?limit=50',
                        {
                            method: 'GET',
                            cache: 'no-store',
                            credentials: 'same-origin',
                        }
                    )

                const data =
                    await readJsonSafe<
                        ShiftsResponse |
                        ApiError
                    >(response)

                if (!response.ok) {
                    throw new Error(
                        apiMessage(
                            data,
                            'Не удалось загрузить смены'
                        )
                    )
                }

                const result =
                    data as ShiftsResponse

                setShifts(result)

                return result
            },
            []
        )

    const loadSummary =
        useCallback(
            async (
                from: string,
                to:
                    | string
                    | null
            ) => {
                const params =
                    new URLSearchParams({
                        from,
                    })

                if (to) {
                    params.set(
                        'to',
                        to
                    )
                }

                const response =
                    await fetch(
                        `/api/pos/shift-summary?${params.toString()}`,
                        {
                            method:
                                'GET',

                            cache:
                                'no-store',

                            credentials:
                                'same-origin',
                        }
                    )

                const data =
                    await readJsonSafe<
                        ShiftSummary |
                        ApiError
                    >(
                        response
                    )

                if (!response.ok) {
                    throw new Error(
                        apiMessage(
                            data,
                            'Не удалось загрузить итог смены'
                        )
                    )
                }

                const result =
                    data as ShiftSummary

                setShiftSummary(
                    result
                )

                return result
            },
            []
        )

    const refreshAll =
        useCallback(
            async () => {
                try {
                    setIsLoading(true)
                    setError(null)

                    const [
                        cashData,
                        shiftData,
                    ] = await Promise.all([
                        loadCash(),
                        loadShifts(),
                    ])

                    const selectedShift =
                        shiftData.currentShift ||
                        shiftData.history[0] ||
                        null

                    if (selectedShift) {
                        await loadSummary(
                            selectedShift.openedAt,
                            selectedShift.closedAt
                        )
                    } else {
                        setShiftSummary(
                            null
                        )
                    }

                    return {
                        cashData,
                        shiftData,
                    }
                } catch (refreshError) {
                    console.error(
                        'POS cash drawer refresh error:',
                        refreshError
                    )

                    setError(
                        refreshError instanceof Error
                            ? refreshError.message
                            : 'Не удалось обновить кассу'
                    )

                    return null
                } finally {
                    setIsLoading(false)
                }
            },
            [
                loadCash,
                loadShifts,
                loadSummary,
            ]
        )

    const ensureShiftOpen =
        useCallback(
            async () => {
                const response =
                    await fetch(
                        '/api/pos/shifts',
                        {
                            method: 'POST',

                            headers: {
                                'Content-Type':
                                    'application/json',
                            },

                            credentials:
                                'same-origin',

                            body:
                                JSON.stringify({
                                    action: 'open',
                                }),
                        }
                    )

                const data =
                    await readJsonSafe<
                        {
                            ok?: boolean
                        } |
                        ApiError
                    >(response)

                if (!response.ok) {
                    throw new Error(
                        apiMessage(
                            data,
                            'Не удалось открыть кассовую смену в учёте'
                        )
                    )
                }

                await refreshAll()
            },
            [
                refreshAll,
            ]
        )

    useEffect(
        () => {
            let disposed = false

            const sync = async () => {
                if (disposed) {
                    return
                }

                const nextStatus:
                    ShiftStatus =
                    localStorage.getItem(
                        SHIFT_STATUS_KEY
                    ) === 'open'
                        ? 'open'
                        : 'closed'

                setKktStatus(nextStatus)

                const previous =
                    lastObservedKktStatus.current

                if (
                    nextStatus === 'open' &&
                    previous !== 'open'
                ) {
                    try {
                        await ensureShiftOpen()
                    } catch (openError) {
                        setError(
                            openError instanceof Error
                                ? openError.message
                                : 'Не удалось синхронизировать открытие смены'
                        )
                    }
                }

                if (
                    nextStatus === 'closed' &&
                    previous === 'open'
                ) {
                    const state =
                        await refreshAll()

                    const pendingShift =
                        state?.shiftData.currentShift

                    if (pendingShift) {
                        const suggested =
                            suggestedWithdrawal(
                                pendingShift
                                    .liveCash
                                    .calculatedCash
                            )

                        setClosingWithdrawal(
                            String(suggested)
                        )

                        setIsClosingMode(true)
                        setIsModalOpen(true)
                    }
                }

                if (
                    nextStatus === 'closed' &&
                    previous === null
                ) {
                    const state =
                        await refreshAll()

                    if (
                        state?.shiftData.currentShift
                    ) {
                        const suggested =
                            suggestedWithdrawal(
                                state
                                    .shiftData
                                    .currentShift
                                    .liveCash
                                    .calculatedCash
                            )

                        setClosingWithdrawal(
                            String(suggested)
                        )

                        setIsClosingMode(true)
                        setIsModalOpen(true)
                    }
                }

                lastObservedKktStatus.current =
                    nextStatus
            }

            void sync()

            const intervalId =
                window.setInterval(
                    () => {
                        void sync()
                    },
                    POLL_MS
                )

            return () => {
                disposed = true
                window.clearInterval(intervalId)
            }
        },
        [
            ensureShiftOpen,
            refreshAll,
        ]
    )

    useEffect(
        () => {
            if (!isModalOpen) {
                return
            }

            void refreshAll()
        },
        [
            isModalOpen,
            refreshAll,
        ]
    )

    const currentShift =
        shifts?.currentShift || null

    const cashTotals =
        cash?.cash ||
        currentShift?.liveCash ||
        null

    const history =
        shifts?.history || []

    const currentCash =
        cash?.currentCash ??
        currentShift?.liveCash.calculatedCash ??
        history[0]?.closingCash ??
        0

    const parsedMovementAmount =
        useMemo(
            () => {
                const value =
                    Number(
                        movementAmount
                            .replace(',', '.')
                            .replace(/\s/g, '')
                    )

                return Number.isFinite(value)
                    ? value
                    : 0
            },
            [
                movementAmount,
            ]
        )

    const parsedClosingWithdrawal =
        useMemo(
            () => {
                const value =
                    Number(
                        closingWithdrawal
                            .replace(',', '.')
                            .replace(/\s/g, '')
                    )

                return Number.isFinite(value)
                    ? value
                    : 0
            },
            [
                closingWithdrawal,
            ]
        )

    const retainedAfterClose =
        Math.max(
            0,
            currentCash -
            parsedClosingWithdrawal
        )

    const selectMovement =
        (
            mode: MovementMode
        ) => {
            setMovementMode(mode)
            setMovementAmount('')
            setCounterparty('')
            setMovementComment('')
            setError(null)
        }

    const submitMovement =
        async () => {
            if (!movementMode) {
                return
            }

            try {
                setIsSavingMovement(true)
                setError(null)

                const response =
                    await fetch(
                        '/api/pos/cash',
                        {
                            method: 'POST',

                            headers: {
                                'Content-Type':
                                    'application/json',
                            },

                            credentials:
                                'same-origin',

                            body:
                                JSON.stringify({
                                    type:
                                    movementMode,

                                    amount:
                                    movementAmount,

                                    counterparty,

                                    comment:
                                    movementComment,
                                }),
                        }
                    )

                const data =
                    await readJsonSafe<
                        {
                            ok?: boolean
                        } |
                        ApiError
                    >(response)

                if (!response.ok) {
                    throw new Error(
                        apiMessage(
                            data,
                            'Не удалось выполнить кассовую операцию'
                        )
                    )
                }

                setMovementMode(null)
                setMovementAmount('')
                setCounterparty('')
                setMovementComment('')

                await refreshAll()
            } catch (movementError) {
                setError(
                    movementError instanceof Error
                        ? movementError.message
                        : 'Не удалось выполнить кассовую операцию'
                )
            } finally {
                setIsSavingMovement(false)
            }
        }

    const finalizeShift =
        async () => {
            try {
                setIsClosingShift(true)
                setError(null)

                const response =
                    await fetch(
                        '/api/pos/shifts',
                        {
                            method: 'POST',

                            headers: {
                                'Content-Type':
                                    'application/json',
                            },

                            credentials:
                                'same-origin',

                            body:
                                JSON.stringify({
                                    action: 'close',

                                    withdrawalAmount:
                                    closingWithdrawal,

                                    comment:
                                    closeComment,
                                }),
                        }
                    )

                const data =
                    await readJsonSafe<
                        {
                            ok?: boolean
                        } |
                        ApiError
                    >(response)

                if (!response.ok) {
                    throw new Error(
                        apiMessage(
                            data,
                            'Не удалось зафиксировать закрытие смены'
                        )
                    )
                }

                setIsClosingMode(false)
                setCloseComment('')

                await refreshAll()
            } catch (closeError) {
                setError(
                    closeError instanceof Error
                        ? closeError.message
                        : 'Не удалось зафиксировать закрытие смены'
                )
            } finally {
                setIsClosingShift(false)
            }
        }

    return (
        <>
            <button
                type="button"
                onClick={() =>
                    setIsModalOpen(true)
                }
                className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800 hover:bg-emerald-100"
            >
                <span className="inline-flex items-center gap-2">
                    <AiOutlineDollarCircle size={19}/>
                    Деньги смены
                </span>
            </button>

            <AnimatePresence>
                {isModalOpen && (
                    <div
                        className="fixed inset-0 z-[760] flex items-center justify-center bg-black/60 p-3 sm:p-5"
                        onClick={() => {
                            if (!isClosingShift) {
                                setIsModalOpen(false)
                            }
                        }}
                    >
                        <motion.div
                            initial={{
                                opacity: 0,
                                scale: 0.97,
                            }}
                            animate={{
                                opacity: 1,
                                scale: 1,
                            }}
                            exit={{
                                opacity: 0,
                                scale: 0.97,
                            }}
                            onClick={event =>
                                event.stopPropagation()
                            }
                            className="max-h-[94vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl"
                        >
                            <div className="border-b border-gray-100 p-5 sm:p-6">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <div
                                            className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${
                                                kktStatus === 'open'
                                                    ? 'bg-emerald-100 text-emerald-800'
                                                    : 'bg-gray-100 text-gray-700'
                                            }`}
                                        >
                                            {kktStatus === 'open'
                                                ? 'Смена открыта'
                                                : 'Смена закрыта'}
                                        </div>

                                        <h2 className="mt-2 text-2xl font-black text-gray-900">
                                            Касса и деньги смены
                                        </h2>

                                        <div className="mt-1 text-sm text-gray-500">
                                            Расчётный остаток наличных
                                        </div>

                                        <div className="mt-2 text-4xl font-black text-gray-950">
                                            {money(currentCash)}
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-2">
                                        <button
                                            type="button"
                                            disabled={isLoading}
                                            onClick={() =>
                                                void refreshAll()
                                            }
                                            className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                                            aria-label="Обновить"
                                        >
                                            <AiOutlineReload
                                                size={19}
                                                className={
                                                    isLoading
                                                        ? 'animate-spin'
                                                        : ''
                                                }
                                            />
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                setIsModalOpen(false)
                                            }
                                            className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                                            aria-label="Закрыть"
                                        >
                                            <AiOutlineClose size={19}/>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="max-h-[calc(94vh-160px)] overflow-y-auto px-5 pb-24 pt-5 sm:px-6 sm:pb-28 sm:pt-6">
                                {error && (
                                    <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                                        {error}
                                    </div>
                                )}

                                {isClosingMode &&
                                    currentShift && (
                                        <div className="mb-5 rounded-3xl border border-amber-300 bg-amber-50 p-5">
                                            <div className="text-xs font-black uppercase tracking-[0.14em] text-amber-700">
                                                Закрытие смены
                                            </div>

                                            <h3 className="mt-2 text-xl font-black text-amber-950">
                                                Сколько наличных изымаем?
                                            </h3>

                                            <div className="mt-2 text-sm leading-6 text-amber-800">
                                                Предложенная сумма оставляет в кассе мелочь меньше 1 000 ₽.
                                                Её можно изменить вручную.
                                            </div>

                                            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                                                <div className="rounded-2xl bg-white p-4">
                                                    <div className="text-xs font-bold uppercase tracking-wide text-gray-400">
                                                        В кассе
                                                    </div>

                                                    <div className="mt-1 text-2xl font-black">
                                                        {money(currentCash)}
                                                    </div>
                                                </div>

                                                <div className="rounded-2xl bg-white p-4">
                                                    <label className="text-xs font-bold uppercase tracking-wide text-gray-400">
                                                        Изъять
                                                    </label>

                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="1"
                                                        value={
                                                            closingWithdrawal
                                                        }
                                                        onChange={event =>
                                                            setClosingWithdrawal(
                                                                event.target.value
                                                            )
                                                        }
                                                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-xl font-black outline-none focus:ring-2 focus:ring-amber-500"
                                                    />
                                                </div>

                                                <div className="rounded-2xl bg-white p-4">
                                                    <div className="text-xs font-bold uppercase tracking-wide text-gray-400">
                                                        Останется
                                                    </div>

                                                    <div className="mt-1 text-2xl font-black text-emerald-700">
                                                        {money(
                                                            retainedAfterClose
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <textarea
                                                value={closeComment}
                                                onChange={event =>
                                                    setCloseComment(
                                                        event.target.value
                                                    )
                                                }
                                                placeholder="Комментарий к закрытию"
                                                className="mt-3 h-20 w-full resize-none rounded-xl border border-amber-200 bg-white p-3 outline-none focus:ring-2 focus:ring-amber-500"
                                            />

                                            <div className="mt-3 flex justify-end">
                                                <button
                                                    type="button"
                                                    disabled={
                                                        isClosingShift ||
                                                        parsedClosingWithdrawal < 0 ||
                                                        parsedClosingWithdrawal >
                                                        currentCash
                                                    }
                                                    onClick={() =>
                                                        void finalizeShift()
                                                    }
                                                    className="rounded-xl bg-amber-600 px-5 py-3 font-black text-white hover:bg-amber-700 disabled:opacity-50"
                                                >
                                                    {isClosingShift
                                                        ? 'Сохраняю...'
                                                        : 'Зафиксировать закрытие'}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                        <div className="text-xs font-black uppercase tracking-[0.12em] text-gray-500">
                                            На открытие
                                        </div>
                                        <div className="mt-2 text-2xl font-black">
                                            {money(
                                                cashTotals?.openingCash ||
                                                history[0]?.closingCash ||
                                                0
                                            )}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                                        <div className="text-xs font-black uppercase tracking-[0.12em] text-blue-600">
                                            Наличные продажи
                                        </div>
                                        <div className="mt-2 text-2xl font-black text-blue-900">
                                            {money(
                                                cashTotals?.cashSales || 0
                                            )}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                                        <div className="text-xs font-black uppercase tracking-[0.12em] text-emerald-600">
                                            Внесения
                                        </div>
                                        <div className="mt-2 text-2xl font-black text-emerald-900">
                                            +{money(
                                            cashTotals?.deposits || 0
                                        )}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                                        <div className="text-xs font-black uppercase tracking-[0.12em] text-red-600">
                                            Расход наличных
                                        </div>
                                        <div className="mt-2 text-2xl font-black text-red-900">
                                            -{money(
                                            (cashTotals?.withdrawals || 0) +
                                            (cashTotals?.supplierPayments || 0) +
                                            (cashTotals?.cashDebtRefunds || 0)
                                        )}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                                    <button
                                        type="button"
                                        disabled={
                                            kktStatus !== 'open' ||
                                            !currentShift
                                        }
                                        onClick={() =>
                                            selectMovement('deposit')
                                        }
                                        className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-4 font-black text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        <AiOutlinePlusCircle size={20}/>
                                        Внести
                                    </button>

                                    <button
                                        type="button"
                                        disabled={
                                            kktStatus !== 'open' ||
                                            !currentShift
                                        }
                                        onClick={() =>
                                            selectMovement('withdrawal')
                                        }
                                        className="flex items-center justify-center gap-2 rounded-2xl border border-red-300 bg-red-50 px-4 py-4 font-black text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        <AiOutlineMinusCircle size={20}/>
                                        Изъять
                                    </button>

                                    <button
                                        type="button"
                                        disabled={
                                            kktStatus !== 'open' ||
                                            !currentShift
                                        }
                                        onClick={() =>
                                            selectMovement(
                                                'supplier_payment'
                                            )
                                        }
                                        className="flex items-center justify-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4 font-black text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        <AiOutlineShop size={20}/>
                                        Поставщику
                                    </button>
                                </div>

                                <div className="mt-5 rounded-3xl border border-gray-100 bg-white">
                                    <div className="border-b border-gray-100 px-4 py-3">
                                        <div className="font-black text-gray-900">
                                            Итог смены
                                        </div>

                                        <div className="mt-1 text-xs text-gray-500">
                                            Все продажи и денежные операции по текущей смене, включая карту и перевод
                                        </div>
                                    </div>

                                    {shiftSummary ? (
                                        <>
                                            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
                                                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                                                    <div className="text-xs font-black uppercase tracking-[0.12em] text-blue-600">
                                                        Обычные продажи
                                                    </div>

                                                    <div className="mt-2 text-2xl font-black text-blue-900">
                                                        {money(
                                                            shiftSummary
                                                                .ordinarySales
                                                                .total
                                                        )}
                                                    </div>

                                                    <div className="mt-1 text-xs font-semibold text-blue-600">
                                                        Чеков: {shiftSummary.ordinarySales.count}
                                                    </div>
                                                </div>

                                                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                                                    <div className="text-xs font-black uppercase tracking-[0.12em] text-emerald-600">
                                                        Погашения долгов
                                                    </div>

                                                    <div className="mt-2 text-2xl font-black text-emerald-900">
                                                        {money(
                                                            shiftSummary
                                                                .debtPayments
                                                                .total
                                                        )}
                                                    </div>

                                                    <div className="mt-1 text-xs font-semibold text-emerald-600">
                                                        Платежей: {shiftSummary.debtPayments.count}
                                                    </div>
                                                </div>

                                                <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                                                    <div className="text-xs font-black uppercase tracking-[0.12em] text-red-600">
                                                        Возвраты денег
                                                    </div>

                                                    <div className="mt-2 text-2xl font-black text-red-900">
                                                        -{money(
                                                        shiftSummary
                                                            .debtRefunds
                                                            ?.total ||
                                                        0
                                                    )}
                                                    </div>

                                                    <div className="mt-1 text-xs font-semibold text-red-600">
                                                        Возвратов: {shiftSummary.debtRefunds?.count || 0}
                                                    </div>
                                                </div>

                                                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                                                    <div className="text-xs font-black uppercase tracking-[0.12em] text-indigo-600">
                                                        Фактически получено
                                                    </div>

                                                    <div className="mt-2 text-2xl font-black text-indigo-900">
                                                        {money(
                                                            shiftSummary
                                                                .received
                                                                .total
                                                        )}
                                                    </div>

                                                    <div className="mt-1 text-xs font-semibold text-indigo-600">
                                                        Денежных операций: {shiftSummary.received.count}
                                                    </div>
                                                </div>

                                                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                                                    <div className="text-xs font-black uppercase tracking-[0.12em] text-amber-700">
                                                        Выдано в долг
                                                    </div>

                                                    <div className="mt-2 text-2xl font-black text-amber-900">
                                                        {money(
                                                            shiftSummary
                                                                .debtIssued
                                                                .total
                                                        )}
                                                    </div>

                                                    <div className="mt-1 text-xs font-semibold text-amber-700">
                                                        Документов: {shiftSummary.debtIssued.count}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="border-t border-gray-100">
                                                <div className="overflow-x-auto">
                                                    <table className="w-full min-w-[760px] text-sm">
                                                        <thead className="bg-gray-50 text-gray-500">
                                                        <tr>
                                                            <th className="p-3 text-left">
                                                                Способ оплаты
                                                            </th>

                                                            <th className="p-3 text-right">
                                                                Продажи
                                                            </th>

                                                            <th className="p-3 text-right">
                                                                Погашения
                                                            </th>

                                                            <th className="p-3 text-right">
                                                                Возвраты
                                                            </th>

                                                            <th className="p-3 text-right">
                                                                Получено
                                                            </th>
                                                        </tr>
                                                        </thead>

                                                        <tbody>
                                                        {PAYMENT_META.map(
                                                            item => {
                                                                const sales =
                                                                    shiftSummary
                                                                        .ordinarySales
                                                                        .byPayment[
                                                                        item.method
                                                                        ]

                                                                const debts =
                                                                    shiftSummary
                                                                        .debtPayments
                                                                        .byPayment[
                                                                        item.method
                                                                        ]

                                                                const refunds =
                                                                    shiftSummary
                                                                        .debtRefunds
                                                                        ?.byPayment[
                                                                        item.method
                                                                        ] || {
                                                                        count:
                                                                            0,

                                                                        total:
                                                                            0,
                                                                    }

                                                                const received =
                                                                    shiftSummary
                                                                        .received
                                                                        .byPayment[
                                                                        item.method
                                                                        ]

                                                                return (
                                                                    <tr
                                                                        key={
                                                                            item.method
                                                                        }
                                                                        className="border-t border-gray-100"
                                                                    >
                                                                        <td className="p-3">
                                                                            <div className="font-black text-gray-900">
                                                                                {item.label}
                                                                            </div>

                                                                            <div className="mt-1 text-xs text-gray-400">
                                                                                Операций: {received.count}
                                                                            </div>
                                                                        </td>

                                                                        <td className="p-3 text-right">
                                                                            <div className="font-bold text-blue-700">
                                                                                {money(
                                                                                    sales.total
                                                                                )}
                                                                            </div>

                                                                            <div className="mt-1 text-xs text-gray-400">
                                                                                {sales.count} чек.
                                                                            </div>
                                                                        </td>

                                                                        <td className="p-3 text-right">
                                                                            <div className="font-bold text-emerald-700">
                                                                                {money(
                                                                                    debts.total
                                                                                )}
                                                                            </div>

                                                                            <div className="mt-1 text-xs text-gray-400">
                                                                                {debts.count} плат.
                                                                            </div>
                                                                        </td>

                                                                        <td className="p-3 text-right">
                                                                            <div className="font-bold text-red-700">
                                                                                -{money(
                                                                                refunds.total
                                                                            )}
                                                                            </div>

                                                                            <div className="mt-1 text-xs text-gray-400">
                                                                                {refunds.count} возв.
                                                                            </div>
                                                                        </td>

                                                                        <td className="p-3 text-right">
                                                                            <div className="text-lg font-black text-gray-900">
                                                                                {money(
                                                                                    received.total
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                )
                                                            }
                                                        )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="p-6 text-center text-sm text-gray-500">
                                            Итог появится после открытия первой смены.
                                        </div>
                                    )}
                                </div>

                                <div className="mt-5 rounded-3xl border border-gray-100 bg-white">
                                    <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                                        <div>
                                            <div className="font-black text-gray-900">
                                                Кассовые операции
                                            </div>
                                            <div className="mt-1 text-xs text-gray-500">
                                                Внесения, изъятия и поставщики
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                setIsHistoryOpen(
                                                    value => !value
                                                )
                                            }
                                            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 hover:bg-gray-50"
                                        >
                                            <AiOutlineHistory/>
                                            История
                                        </button>
                                    </div>

                                    <div className="divide-y divide-gray-100">
                                        {(cash?.movements || []).map(
                                            movement => (
                                                <div
                                                    key={movement.id}
                                                    className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                                                >
                                                    <div>
                                                        <div className="font-black text-gray-900">
                                                            {movementLabel(
                                                                movement.type
                                                            )}
                                                            {movement.counterparty
                                                                ? ` · ${movement.counterparty}`
                                                                : ''}
                                                        </div>

                                                        <div className="mt-1 text-xs text-gray-500">
                                                            {dateTime(
                                                                movement.createdAt
                                                            )}
                                                            {' · '}
                                                            {movement.cashierName}
                                                            {movement.comment
                                                                ? ` · ${movement.comment}`
                                                                : ''}
                                                        </div>
                                                    </div>

                                                    <div
                                                        className={`text-lg font-black ${
                                                            isOutflow(
                                                                movement.type
                                                            )
                                                                ? 'text-red-700'
                                                                : 'text-emerald-700'
                                                        }`}
                                                    >
                                                        {isOutflow(
                                                            movement.type
                                                        )
                                                            ? '−'
                                                            : '+'}
                                                        {money(
                                                            movement.amount
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        )}

                                        {(cash?.movements.length || 0) === 0 && (
                                            <div className="p-6 text-center text-sm text-gray-500">
                                                Операций в этой смене пока нет.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {isHistoryOpen && (
                                    <div className="mt-5 rounded-3xl border border-gray-100 bg-gray-50 p-4">
                                        <div className="font-black text-gray-900">
                                            История закрытых смен
                                        </div>

                                        <div className="mt-3 space-y-2">
                                            {history.map(
                                                shift => (
                                                    <div
                                                        key={shift.id}
                                                        className="rounded-2xl border border-gray-200 bg-white p-4"
                                                    >
                                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                            <div>
                                                                <div className="font-black">
                                                                    {dateTime(
                                                                        shift.closedAt
                                                                    )}
                                                                </div>

                                                                <div className="mt-1 text-xs text-gray-500">
                                                                    Кассир: {shift.closedBy?.name || shift.openedBy.name}
                                                                </div>
                                                            </div>

                                                            <div className="text-right">
                                                                <div className="text-sm text-gray-500">
                                                                    Изъято: {money(shift.closingWithdrawal)}
                                                                </div>

                                                                <div className="mt-1 text-lg font-black text-emerald-700">
                                                                    Осталось: {money(shift.closingCash || 0)}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            )}

                                            {history.length === 0 && (
                                                <div className="rounded-xl bg-white p-5 text-center text-sm text-gray-500">
                                                    История появится после первого закрытия смены.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="h-6"/>
                            </div>
                        </motion.div>
                    </div>
                )}

                {movementMode && (
                    <div
                        className="fixed inset-0 z-[780] flex items-center justify-center bg-black/60 p-4"
                        onClick={() => {
                            if (!isSavingMovement) {
                                setMovementMode(null)
                            }
                        }}
                    >
                        <motion.div
                            initial={{
                                opacity: 0,
                                scale: 0.97,
                            }}
                            animate={{
                                opacity: 1,
                                scale: 1,
                            }}
                            exit={{
                                opacity: 0,
                                scale: 0.97,
                            }}
                            onClick={event =>
                                event.stopPropagation()
                            }
                            className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl"
                        >
                            <div className="text-xs font-black uppercase tracking-[0.14em] text-gray-400">
                                Кассовая операция
                            </div>

                            <h3 className="mt-1 text-xl font-black">
                                {movementMode === 'deposit'
                                    ? 'Внести деньги'
                                    : movementMode === 'supplier_payment'
                                        ? 'Выдать поставщику'
                                        : 'Изъять деньги'}
                            </h3>

                            <div className="mt-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
                                Сейчас в кассе:{' '}
                                <strong className="text-gray-900">
                                    {money(currentCash)}
                                </strong>
                            </div>

                            <label className="mt-4 block text-sm font-bold text-gray-700">
                                Сумма
                            </label>

                            <input
                                autoFocus
                                type="number"
                                min="0"
                                step="0.01"
                                value={movementAmount}
                                onChange={event =>
                                    setMovementAmount(
                                        event.target.value
                                    )
                                }
                                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-xl font-black outline-none focus:ring-2 focus:ring-indigo-500"
                            />

                            {movementMode === 'supplier_payment' && (
                                <>
                                    <label className="mt-4 block text-sm font-bold text-gray-700">
                                        Поставщик
                                    </label>

                                    <input
                                        type="text"
                                        value={counterparty}
                                        onChange={event =>
                                            setCounterparty(
                                                event.target.value
                                            )
                                        }
                                        placeholder="Например: ИП Иванов"
                                        className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </>
                            )}

                            <label className="mt-4 block text-sm font-bold text-gray-700">
                                Комментарий
                            </label>

                            <textarea
                                value={movementComment}
                                onChange={event =>
                                    setMovementComment(
                                        event.target.value
                                    )
                                }
                                placeholder={
                                    movementMode === 'supplier_payment'
                                        ? 'За какой товар / накладную'
                                        : 'Причина операции'
                                }
                                className="mt-2 h-24 w-full resize-none rounded-xl border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-indigo-500"
                            />

                            <div className="mt-5 flex justify-end gap-2">
                                <button
                                    type="button"
                                    disabled={isSavingMovement}
                                    onClick={() =>
                                        setMovementMode(null)
                                    }
                                    className="rounded-xl border border-gray-300 px-4 py-2.5 font-bold text-gray-700"
                                >
                                    Отмена
                                </button>

                                <button
                                    type="button"
                                    disabled={
                                        isSavingMovement ||
                                        parsedMovementAmount <= 0 ||
                                        (
                                            movementMode === 'supplier_payment' &&
                                            counterparty.trim().length < 2
                                        )
                                    }
                                    onClick={() =>
                                        void submitMovement()
                                    }
                                    className="rounded-xl bg-indigo-600 px-4 py-2.5 font-black text-white disabled:opacity-50"
                                >
                                    {isSavingMovement
                                        ? 'Сохраняю...'
                                        : 'Подтвердить'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    )
}

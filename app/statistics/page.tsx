'use client'

import * as React from 'react'
import System from '@/app/components/SystemShell'

type PeriodKey =
    | 'today'
    | 'yesterday'
    | 'week'
    | 'month'
    | 'year'
    | 'custom'

type StoreLocation = {
    id: number
    name: string
    slug: string
}

type Summary = {
    receiptCount: number
    debtSaleCount: number
    saleDocumentCount: number

    receiptRevenue: number
    debtIssued: number
    debtReturns: number
    salesRevenue: number

    debtPaymentCount: number
    debtPayments: number
    debtRefundCount: number
    debtRefunds: number
    cashIn: number

    averageCheck: number

    cost: number
    estimatedProfit: number
    soldItems: number

    debtOutstanding: number
    debtCustomers: number
}

type LocationStat = Summary & {
    slug: string
    name: string
}

type PaymentStat = {
    method: string
    label: string

    receiptCount: number
    receiptTotal: number

    debtPaymentCount: number
    debtPaymentTotal: number
    debtRefundCount: number
    debtRefundTotal: number

    count: number
    total: number
}

type TopProduct = {
    key: string
    productId: number | null
    name: string

    quantity: number
    revenue: number
    cost: number
    estimatedProfit: number
}

type DebtStat = {
    issued: number
    payments: number
    refunds: number
    returns: number

    outstanding: number
    customers: number

    saleCount: number
    paymentCount: number
    refundCount: number
    returnCount: number
}

type StatisticsResponse = {
    period: PeriodKey

    from: string
    to: string

    selectedLocation: string

    storeLocations:
        StoreLocation[]

    summary: Summary

    byLocation:
        LocationStat[]

    byPayment:
        PaymentStat[]

    topProducts:
        TopProduct[]

    debt: DebtStat
}

type ApiError = {
    message?: string
}

const PERIOD_OPTIONS:
    Array<{
        value: PeriodKey
        label: string
    }> = [
    {
        value: 'today',
        label: 'Сегодня',
    },
    {
        value: 'yesterday',
        label: 'Вчера',
    },
    {
        value: 'week',
        label: '7 дней',
    },
    {
        value: 'month',
        label: 'Месяц',
    },
    {
        value: 'year',
        label: 'Год',
    },
    {
        value: 'custom',
        label: 'Период',
    },
]

function money(
    value: number
) {
    return new Intl.NumberFormat(
        'ru-RU',
        {
            style: 'currency',
            currency: 'RUB',

            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }
    ).format(
        Math.round(
            value || 0
        )
    )
}

function quantity(
    value: number
) {
    return new Intl.NumberFormat(
        'ru-RU',
        {
            minimumFractionDigits: 0,
            maximumFractionDigits: 3,
        }
    ).format(
        value || 0
    )
}

function formatDate(
    value: string
) {
    if (!value) {
        return '—'
    }

    return new Date(
        value
    ).toLocaleDateString(
        'ru-RU'
    )
}

function todayInputValue() {
    const date =
        new Date()

    const month =
        String(
            date.getMonth() + 1
        ).padStart(
            2,
            '0'
        )

    const day =
        String(
            date.getDate()
        ).padStart(
            2,
            '0'
        )

    return `${date.getFullYear()}-${month}-${day}`
}

function weekAgoInputValue() {
    const date =
        new Date()

    date.setDate(
        date.getDate() - 6
    )

    const month =
        String(
            date.getMonth() + 1
        ).padStart(
            2,
            '0'
        )

    const day =
        String(
            date.getDate()
        ).padStart(
            2,
            '0'
        )

    return `${date.getFullYear()}-${month}-${day}`
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

function getApiErrorMessage(
    data: unknown,
    fallback: string
): string {
    if (
        data &&
        typeof data === 'object' &&
        'message' in data
    ) {
        const message =
            (
                data as ApiError
            ).message

        if (message) {
            return message
        }
    }

    return fallback
}

const EMPTY_SUMMARY:
    Summary = {
    receiptCount: 0,
    debtSaleCount: 0,
    saleDocumentCount: 0,

    receiptRevenue: 0,
    debtIssued: 0,
    debtReturns: 0,
    salesRevenue: 0,

    debtPaymentCount: 0,
    debtPayments: 0,
    debtRefundCount: 0,
    debtRefunds: 0,
    cashIn: 0,

    averageCheck: 0,

    cost: 0,
    estimatedProfit: 0,
    soldItems: 0,

    debtOutstanding: 0,
    debtCustomers: 0,
}

function SummaryCard({
                         title,
                         value,
                         subtitle,
                         tone = 'default',
                     }: {
    title: string
    value: React.ReactNode
    subtitle?: React.ReactNode
    tone?:
        | 'default'
        | 'green'
        | 'blue'
        | 'amber'
        | 'red'
        | 'violet'
}) {
    const toneClasses = {
        default:
            'border-gray-100 bg-white text-gray-900',

        green:
            'border-emerald-100 bg-emerald-50/60 text-emerald-800',

        blue:
            'border-blue-100 bg-blue-50/60 text-blue-800',

        amber:
            'border-amber-100 bg-amber-50/70 text-amber-900',

        red:
            'border-red-100 bg-red-50/60 text-red-800',

        violet:
            'border-violet-100 bg-violet-50/60 text-violet-800',
    }

    return (
        <div
            className={`rounded-2xl border p-4 shadow-sm ${toneClasses[tone]}`}
        >
            <div className="text-xs font-black uppercase tracking-[0.12em] opacity-60">
                {title}
            </div>

            <div className="mt-2 text-2xl font-black">
                {value}
            </div>

            {subtitle && (
                <div className="mt-2 text-xs font-semibold leading-5 opacity-70">
                    {subtitle}
                </div>
            )}
        </div>
    )
}

export default function Page() {
    const [
        period,
        setPeriod,
    ] =
        React.useState<PeriodKey>(
            'today'
        )

    const [
        locationSlug,
        setLocationSlug,
    ] =
        React.useState(
            'all'
        )

    const [
        fromDate,
        setFromDate,
    ] =
        React.useState(
            weekAgoInputValue
        )

    const [
        toDate,
        setToDate,
    ] =
        React.useState(
            todayInputValue
        )

    const [
        data,
        setData,
    ] =
        React.useState<
            StatisticsResponse | null
        >(
            null
        )

    const [
        isLoading,
        setIsLoading,
    ] =
        React.useState(
            true
        )

    const [
        error,
        setError,
    ] =
        React.useState<
            string | null
        >(
            null
        )

    const loadStatistics =
        React.useCallback(
            async () => {
                try {
                    setIsLoading(
                        true
                    )

                    setError(
                        null
                    )

                    const params =
                        new URLSearchParams()

                    params.set(
                        'period',
                        period
                    )

                    params.set(
                        'location',
                        locationSlug
                    )

                    if (
                        period ===
                        'custom'
                    ) {
                        params.set(
                            'from',
                            fromDate
                        )

                        params.set(
                            'to',
                            toDate
                        )
                    }

                    const response =
                        await fetch(
                            `/api/statistics?${params.toString()}`,
                            {
                                method:
                                    'GET',

                                cache:
                                    'no-store',
                            }
                        )

                    const payload =
                        await readJsonSafe<
                            StatisticsResponse |
                            ApiError
                        >(
                            response
                        )

                    if (
                        !response.ok
                    ) {
                        throw new Error(
                            getApiErrorMessage(
                                payload,
                                'Не удалось загрузить статистику'
                            )
                        )
                    }

                    setData(
                        payload as StatisticsResponse
                    )
                } catch (error) {
                    console.error(
                        error
                    )

                    setError(
                        error instanceof Error
                            ? error.message
                            : 'Не удалось загрузить статистику'
                    )
                } finally {
                    setIsLoading(
                        false
                    )
                }
            },
            [
                fromDate,
                locationSlug,
                period,
                toDate,
            ]
        )

    React.useEffect(
        () => {
            void loadStatistics()
        },
        [
            loadStatistics,
        ]
    )

    const summary =
        data?.summary ||
        EMPTY_SUMMARY

    return (
        <System>
            <section className="min-h-screen w-full bg-gray-50 p-4">
                <div className="mx-auto max-w-[1800px] space-y-4">
                    <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div>
                                <div className="inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">
                                    Главный склад
                                </div>

                                <h1 className="mt-2 text-2xl font-black text-gray-900">
                                    Статистика продаж и долгов
                                </h1>

                                <p className="mt-1 max-w-4xl text-sm leading-6 text-gray-500">
                                    Реализация показывает стоимость товара, который фактически покинул магазин:
                                    обычные продажи + выдачи в долг − возвраты из долга.
                                    Денежный приход показывает реально полученные деньги:
                                    обычные оплаченные продажи + погашения долгов.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() =>
                                    void loadStatistics()
                                }
                                disabled={
                                    isLoading
                                }
                                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-black text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isLoading
                                    ? 'Обновляю...'
                                    : 'Обновить'}
                            </button>
                        </div>

                        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
                            <div>
                                <label className="mb-1 block text-xs font-black uppercase tracking-wide text-gray-500">
                                    Период
                                </label>

                                <select
                                    value={
                                        period
                                    }
                                    onChange={event =>
                                        setPeriod(
                                            event.target.value as PeriodKey
                                        )
                                    }
                                    className="h-11 w-full rounded-xl border border-gray-300 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    {PERIOD_OPTIONS.map(
                                        item => (
                                            <option
                                                key={
                                                    item.value
                                                }
                                                value={
                                                    item.value
                                                }
                                            >
                                                {
                                                    item.label
                                                }
                                            </option>
                                        )
                                    )}
                                </select>
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-black uppercase tracking-wide text-gray-500">
                                    Точка
                                </label>

                                <select
                                    value={
                                        locationSlug
                                    }
                                    onChange={event =>
                                        setLocationSlug(
                                            event.target.value
                                        )
                                    }
                                    className="h-11 w-full rounded-xl border border-gray-300 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="all">
                                        Все точки
                                    </option>

                                    {(data?.storeLocations || []).map(
                                        location => (
                                            <option
                                                key={
                                                    location.slug
                                                }
                                                value={
                                                    location.slug
                                                }
                                            >
                                                {
                                                    location.name
                                                }
                                            </option>
                                        )
                                    )}
                                </select>
                            </div>

                            {period ===
                                'custom' && (
                                    <>
                                        <div>
                                            <label className="mb-1 block text-xs font-black uppercase tracking-wide text-gray-500">
                                                С даты
                                            </label>

                                            <input
                                                type="date"
                                                value={
                                                    fromDate
                                                }
                                                onChange={event =>
                                                    setFromDate(
                                                        event.target.value
                                                    )
                                                }
                                                className="h-11 w-full rounded-xl border border-gray-300 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="mb-1 block text-xs font-black uppercase tracking-wide text-gray-500">
                                                По дату
                                            </label>

                                            <input
                                                type="date"
                                                value={
                                                    toDate
                                                }
                                                onChange={event =>
                                                    setToDate(
                                                        event.target.value
                                                    )
                                                }
                                                className="h-11 w-full rounded-xl border border-gray-300 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </>
                                )}

                            {data && (
                                <div className="rounded-xl bg-gray-50 p-3 md:col-span-2 xl:col-span-2">
                                    <div className="text-xs text-gray-500">
                                        Диапазон отчёта
                                    </div>

                                    <div className="mt-1 font-black text-gray-900">
                                        {formatDate(
                                            data.from
                                        )}{' '}
                                        —{' '}
                                        {formatDate(
                                            data.to
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {error && (
                            <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">
                                {error}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
                        <SummaryCard
                            title="Реализация"
                            value={
                                money(
                                    summary.salesRevenue
                                )
                            }
                            subtitle={
                                <>
                                    Обычные продажи{' '}
                                    {money(
                                        summary.receiptRevenue
                                    )}
                                    {' + '}в долг{' '}
                                    {money(
                                        summary.debtIssued
                                    )}
                                    {' − '}возвраты{' '}
                                    {money(
                                        summary.debtReturns
                                    )}
                                </>
                            }
                            tone="blue"
                        />

                        <SummaryCard
                            title="Денежный приход"
                            value={
                                money(
                                    summary.cashIn
                                )
                            }
                            subtitle={
                                <>
                                    Продажи{' '}
                                    {money(
                                        summary.receiptRevenue
                                    )}
                                    {' + '}погашения{' '}
                                    {money(
                                        summary.debtPayments
                                    )}
                                    {' − '}возвраты денег{' '}
                                    {money(
                                        summary.debtRefunds
                                    )}
                                </>
                            }
                            tone="green"
                        />

                        <SummaryCard
                            title="Себестоимость"
                            value={
                                money(
                                    summary.cost
                                )
                            }
                            subtitle="С учётом товара, выданного и возвращённого из долга"
                        />

                        <SummaryCard
                            title="Предп. доход"
                            value={
                                money(
                                    summary.estimatedProfit
                                )
                            }
                            subtitle="Реализация минус себестоимость"
                            tone={
                                summary.estimatedProfit >=
                                0
                                    ? 'green'
                                    : 'red'
                            }
                        />

                        <SummaryCard
                            title="Продаж"
                            value={
                                summary.saleDocumentCount
                            }
                            subtitle={
                                <>
                                    Чеков: {
                                    summary.receiptCount
                                } · Долговых выдач: {
                                    summary.debtSaleCount
                                }
                                </>
                            }
                        />

                        <SummaryCard
                            title="Средняя продажа"
                            value={
                                money(
                                    summary.averageCheck
                                )
                            }
                            subtitle="Среднее по обычным чекам и выдачам в долг"
                        />
                    </div>

                    <div className="rounded-3xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <div className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-amber-800">
                                    Долговая система
                                </div>

                                <h2 className="mt-2 text-xl font-black text-gray-900">
                                    Движение задолженности
                                </h2>

                                <p className="mt-1 text-sm text-gray-500">
                                    Выдачи, погашения и возвраты относятся к выбранному периоду.
                                    Текущий долг — остаток задолженности на данный момент и от периода не зависит.
                                </p>
                            </div>

                            <div className="text-sm font-bold text-amber-900">
                                Клиентов с открытым долгом:{' '}
                                <span className="text-lg font-black">
                                    {
                                        summary.debtCustomers
                                    }
                                </span>
                            </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                            <SummaryCard
                                title="Выдано в долг"
                                value={
                                    money(
                                        summary.debtIssued
                                    )
                                }
                                subtitle={
                                    <>
                                        Документов: {
                                        summary.debtSaleCount
                                    }
                                    </>
                                }
                                tone="amber"
                            />

                            <SummaryCard
                                title="Погашено долгов"
                                value={
                                    money(
                                        summary.debtPayments
                                    )
                                }
                                subtitle={
                                    <>
                                        Платежей: {
                                        summary.debtPaymentCount
                                    }
                                    </>
                                }
                                tone="green"
                            />

                            <SummaryCard
                                title="Возвраты из долга"
                                value={
                                    money(
                                        summary.debtReturns
                                    )
                                }
                                subtitle="Уменьшают реализацию и задолженность"
                                tone="violet"
                            />

                            <SummaryCard
                                title="Возвраты денег"
                                value={
                                    money(
                                        summary.debtRefunds
                                    )
                                }
                                subtitle="Деньги возвращены по уже оплаченной части долга"
                                tone="red"
                            />

                            <SummaryCard
                                title="Текущий общий долг"
                                value={
                                    money(
                                        summary.debtOutstanding
                                    )
                                }
                                subtitle="На текущий момент, независимо от выбранного периода"
                                tone={
                                    summary.debtOutstanding >
                                    0
                                        ? 'red'
                                        : 'green'
                                }
                            />

                            <SummaryCard
                                title="Товаров реализовано"
                                value={
                                    quantity(
                                        summary.soldItems
                                    )
                                }
                                subtitle="Обычные продажи + долг − долговые возвраты"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,0.8fr)]">
                        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                            <div>
                                <h2 className="text-lg font-black text-gray-900">
                                    По торговым точкам
                                </h2>

                                <p className="mt-1 text-xs leading-5 text-gray-500">
                                    Погашение отражается в точке, где фактически приняли деньги.
                                    Возврат из долга корректирует реализацию точки исходной выдачи.
                                </p>
                            </div>

                            <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-100">
                                <table className="w-full min-w-[1250px] text-sm">
                                    <thead className="bg-gray-100 text-gray-600">
                                    <tr>
                                        <th className="p-3 text-left">
                                            Точка
                                        </th>

                                        <th className="p-3 text-right">
                                            Обычные продажи
                                        </th>

                                        <th className="p-3 text-right">
                                            Выдано в долг
                                        </th>

                                        <th className="p-3 text-right">
                                            Возвраты долга
                                        </th>

                                        <th className="p-3 text-right">
                                            Реализация
                                        </th>

                                        <th className="p-3 text-right">
                                            Погашения
                                        </th>

                                        <th className="p-3 text-right">
                                            Денежный приход
                                        </th>

                                        <th className="p-3 text-right">
                                            Доход
                                        </th>
                                    </tr>
                                    </thead>

                                    <tbody>
                                    {(data?.byLocation || []).map(
                                        item => (
                                            <tr
                                                key={
                                                    item.slug
                                                }
                                                className="border-t border-gray-100"
                                            >
                                                <td className="p-3">
                                                    <div className="font-black text-gray-900">
                                                        {
                                                            item.name
                                                        }
                                                    </div>

                                                    <div className="mt-1 text-xs text-gray-400">
                                                        Чеков: {
                                                        item.receiptCount
                                                    } · Долг: {
                                                        item.debtSaleCount
                                                    }
                                                    </div>
                                                </td>

                                                <td className="p-3 text-right font-semibold">
                                                    {money(
                                                        item.receiptRevenue
                                                    )}
                                                </td>

                                                <td className="p-3 text-right font-semibold text-amber-700">
                                                    {money(
                                                        item.debtIssued
                                                    )}
                                                </td>

                                                <td className="p-3 text-right font-semibold text-violet-700">
                                                    {money(
                                                        item.debtReturns
                                                    )}
                                                </td>

                                                <td className="p-3 text-right font-black text-blue-700">
                                                    {money(
                                                        item.salesRevenue
                                                    )}
                                                </td>

                                                <td className="p-3 text-right font-semibold text-emerald-700">
                                                    {money(
                                                        item.debtPayments
                                                    )}
                                                </td>

                                                <td className="p-3 text-right font-black text-emerald-700">
                                                    {money(
                                                        item.cashIn
                                                    )}
                                                </td>

                                                <td className={`p-3 text-right font-black ${
                                                    item.estimatedProfit >=
                                                    0
                                                        ? 'text-green-700'
                                                        : 'text-red-700'
                                                }`}>
                                                    {money(
                                                        item.estimatedProfit
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                            <div>
                                <h2 className="text-lg font-black text-gray-900">
                                    Денежные поступления
                                </h2>

                                <p className="mt-1 text-xs leading-5 text-gray-500">
                                    Здесь обычные продажи и погашения долга объединяются только как движение денег.
                                    Товар повторно не считается проданным.
                                </p>
                            </div>

                            <div className="mt-4 space-y-3">
                                {(data?.byPayment || []).length ===
                                    0 && (
                                        <div className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-500">
                                            Денежных поступлений за период нет
                                        </div>
                                    )}

                                {(data?.byPayment || []).map(
                                    item => (
                                        <div
                                            key={
                                                item.method
                                            }
                                            className="rounded-2xl border border-gray-100 bg-gray-50 p-4"
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <div className="font-black text-gray-900">
                                                        {
                                                            item.label
                                                        }
                                                    </div>

                                                    <div className="mt-1 text-xs text-gray-500">
                                                        Операций: {
                                                        item.count
                                                    }
                                                    </div>
                                                </div>

                                                <div className="text-xl font-black text-gray-900">
                                                    {money(
                                                        item.total
                                                    )}
                                                </div>
                                            </div>

                                            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                                                <div className="rounded-xl bg-white p-3">
                                                    <div className="text-gray-400">
                                                        Продажи
                                                    </div>

                                                    <div className="mt-1 font-black text-gray-800">
                                                        {money(
                                                            item.receiptTotal
                                                        )}
                                                    </div>

                                                    <div className="mt-1 text-gray-400">
                                                        {
                                                            item.receiptCount
                                                        } чек.
                                                    </div>
                                                </div>

                                                <div className="rounded-xl bg-emerald-50 p-3">
                                                    <div className="text-emerald-600">
                                                        Погашения
                                                    </div>

                                                    <div className="mt-1 font-black text-emerald-800">
                                                        {money(
                                                            item.debtPaymentTotal
                                                        )}
                                                    </div>

                                                    <div className="mt-1 text-emerald-500">
                                                        {
                                                            item.debtPaymentCount
                                                        } плат.
                                                    </div>
                                                </div>

                                                <div className="rounded-xl bg-red-50 p-3">
                                                    <div className="text-red-600">Возвраты денег</div>
                                                    <div className="mt-1 font-black text-red-800">-{money(item.debtRefundTotal)}</div>
                                                    <div className="mt-1 text-red-500">{item.debtRefundCount} возв.</div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                        <div>
                            <h2 className="text-lg font-black text-gray-900">
                                Топ товаров по реализации
                            </h2>

                            <p className="mt-1 text-xs leading-5 text-gray-500">
                                Включает обычные продажи и товары, выданные в долг.
                                Возвраты из долга вычитаются по исторической цене и себестоимости исходного долгового документа.
                            </p>
                        </div>

                        <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-100">
                            <table className="w-full min-w-[900px] text-sm">
                                <thead className="bg-gray-100 text-gray-600">
                                <tr>
                                    <th className="w-12 p-3 text-left">
                                        №
                                    </th>

                                    <th className="p-3 text-left">
                                        Товар
                                    </th>

                                    <th className="p-3 text-right">
                                        Кол-во
                                    </th>

                                    <th className="p-3 text-right">
                                        Реализация
                                    </th>

                                    <th className="p-3 text-right">
                                        Себестоимость
                                    </th>

                                    <th className="p-3 text-right">
                                        Доход
                                    </th>
                                </tr>
                                </thead>

                                <tbody>
                                {(data?.topProducts || []).length ===
                                    0 && (
                                        <tr>
                                            <td
                                                colSpan={
                                                    6
                                                }
                                                className="p-8 text-center text-gray-500"
                                            >
                                                Реализаций за период нет
                                            </td>
                                        </tr>
                                    )}

                                {(data?.topProducts || []).map(
                                    (
                                        item,
                                        index
                                    ) => (
                                        <tr
                                            key={
                                                item.key
                                            }
                                            className="border-t border-gray-100"
                                        >
                                            <td className="p-3 text-gray-400">
                                                {
                                                    index +
                                                    1
                                                }
                                            </td>

                                            <td className="p-3 font-semibold text-gray-900">
                                                {
                                                    item.name
                                                }
                                            </td>

                                            <td className="p-3 text-right">
                                                {quantity(
                                                    item.quantity
                                                )}
                                            </td>

                                            <td className="p-3 text-right font-semibold">
                                                {money(
                                                    item.revenue
                                                )}
                                            </td>

                                            <td className="p-3 text-right">
                                                {money(
                                                    item.cost
                                                )}
                                            </td>

                                            <td className={`p-3 text-right font-black ${
                                                item.estimatedProfit >=
                                                0
                                                    ? 'text-green-700'
                                                    : 'text-red-700'
                                            }`}>
                                                {money(
                                                    item.estimatedProfit
                                                )}
                                            </td>
                                        </tr>
                                    )
                                )}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-3 rounded-xl bg-gray-50 px-4 py-3 text-xs leading-5 text-gray-500">
                            Обычный чек считается денежной и товарной операцией одновременно.
                            Выдача в долг считается только товарной реализацией.
                            Погашение долга считается только денежным поступлением.
                            Поэтому погашение не увеличивает повторно количество проданных товаров и прибыль.
                        </div>
                    </div>
                </div>
            </section>
        </System>
    )
}

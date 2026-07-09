'use client'

import * as React from 'react'
import System from '@/app/components/SystemShell'

type PeriodKey = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom'

type StoreLocation = {
    id: number
    name: string
    slug: string
}

type Summary = {
    receiptCount: number
    revenue: number
    averageCheck: number
    cost: number
    estimatedProfit: number
    soldItems: number
}

type LocationStat = Summary & {
    slug: string
    name: string
}

type PaymentStat = {
    method: string
    label: string
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

type StatisticsResponse = {
    period: PeriodKey
    from: string
    to: string
    selectedLocation: string
    storeLocations: StoreLocation[]
    summary: Summary
    byLocation: LocationStat[]
    byPayment: PaymentStat[]
    topProducts: TopProduct[]
}

type ApiError = {
    message?: string
}

const PERIOD_OPTIONS: Array<{ value: PeriodKey; label: string }> = [
    { value: 'today', label: 'Сегодня' },
    { value: 'yesterday', label: 'Вчера' },
    { value: 'week', label: '7 дней' },
    { value: 'month', label: 'Месяц' },
    { value: 'year', label: 'Год' },
    { value: 'custom', label: 'Период' },
]

function money(value: number) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(Math.round(value || 0))
}

function quantity(value: number) {
    return new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
    }).format(value || 0)
}

function formatDate(value: string) {
    if (!value) return '—'

    return new Date(value).toLocaleDateString('ru-RU')
}

function todayInputValue() {
    const date = new Date()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    return `${date.getFullYear()}-${month}-${day}`
}

function weekAgoInputValue() {
    const date = new Date()
    date.setDate(date.getDate() - 6)
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    return `${date.getFullYear()}-${month}-${day}`
}

async function readJsonSafe<T>(response: Response): Promise<T | null> {
    try {
        return await response.json() as T
    } catch {
        return null
    }
}

function getApiErrorMessage(data: unknown, fallback: string): string {
    if (data && typeof data === 'object' && 'message' in data) {
        const message = (data as ApiError).message

        if (message) {
            return message
        }
    }

    return fallback
}

export default function Page() {
    const [period, setPeriod] = React.useState<PeriodKey>('today')
    const [locationSlug, setLocationSlug] = React.useState('all')
    const [fromDate, setFromDate] = React.useState(weekAgoInputValue)
    const [toDate, setToDate] = React.useState(todayInputValue)
    const [data, setData] = React.useState<StatisticsResponse | null>(null)
    const [isLoading, setIsLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)

    const loadStatistics = React.useCallback(async () => {
        try {
            setIsLoading(true)
            setError(null)

            const params = new URLSearchParams()
            params.set('period', period)
            params.set('location', locationSlug)

            if (period === 'custom') {
                params.set('from', fromDate)
                params.set('to', toDate)
            }

            const response = await fetch(`/api/statistics?${params.toString()}`, {
                method: 'GET',
                cache: 'no-store',
            })

            const payload = await readJsonSafe<StatisticsResponse | ApiError>(response)

            if (!response.ok) {
                throw new Error(getApiErrorMessage(payload, 'Не удалось загрузить статистику'))
            }

            setData(payload as StatisticsResponse)
        } catch (error) {
            console.error(error)
            setError(error instanceof Error ? error.message : 'Не удалось загрузить статистику')
        } finally {
            setIsLoading(false)
        }
    }, [fromDate, locationSlug, period, toDate])

    React.useEffect(() => {
        void loadStatistics()
    }, [loadStatistics])

    const summary = data?.summary || {
        receiptCount: 0,
        revenue: 0,
        averageCheck: 0,
        cost: 0,
        estimatedProfit: 0,
        soldItems: 0,
    }

    return (
        <System>
            <section className="w-full min-h-screen bg-gray-50 p-4">
                <div className="mx-auto max-w-[1700px] space-y-4">
                    <div className="rounded-2xl bg-white p-5 shadow-sm">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div>
                                <div className="inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
                                    Главный склад
                                </div>

                                <h1 className="mt-2 text-2xl font-bold text-gray-900">
                                    Статистика продаж
                                </h1>

                                <p className="mt-1 max-w-3xl text-sm text-gray-500">
                                    Сводка по торговым точкам: выручка, средний чек, предполагаемый доход, способы оплаты и топ товаров.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => void loadStatistics()}
                                disabled={isLoading}
                                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isLoading ? 'Обновляю...' : 'Обновить'}
                            </button>
                        </div>

                        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
                            <div>
                                <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">
                                    Период
                                </label>
                                <select
                                    value={period}
                                    onChange={(event) => setPeriod(event.target.value as PeriodKey)}
                                    className="h-11 w-full rounded-xl border border-gray-300 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    {PERIOD_OPTIONS.map(item => (
                                        <option key={item.value} value={item.value}>
                                            {item.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">
                                    Точка
                                </label>
                                <select
                                    value={locationSlug}
                                    onChange={(event) => setLocationSlug(event.target.value)}
                                    className="h-11 w-full rounded-xl border border-gray-300 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="all">Все точки</option>
                                    {(data?.storeLocations || []).map(location => (
                                        <option key={location.slug} value={location.slug}>
                                            {location.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {period === 'custom' && (
                                <>
                                    <div>
                                        <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">
                                            С даты
                                        </label>
                                        <input
                                            type="date"
                                            value={fromDate}
                                            onChange={(event) => setFromDate(event.target.value)}
                                            className="h-11 w-full rounded-xl border border-gray-300 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">
                                            По дату
                                        </label>
                                        <input
                                            type="date"
                                            value={toDate}
                                            onChange={(event) => setToDate(event.target.value)}
                                            className="h-11 w-full rounded-xl border border-gray-300 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                </>
                            )}

                            {data && (
                                <div className="rounded-xl bg-gray-50 p-3 md:col-span-2 xl:col-span-2">
                                    <div className="text-xs text-gray-500">Диапазон</div>
                                    <div className="mt-1 font-bold text-gray-900">
                                        {formatDate(data.from)} — {formatDate(data.to)}
                                    </div>
                                </div>
                            )}
                        </div>

                        {error && (
                            <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                                {error}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
                        <div className="rounded-2xl bg-white p-4 shadow-sm">
                            <div className="text-xs font-bold uppercase tracking-wide text-gray-400">Выручка</div>
                            <div className="mt-2 text-2xl font-black text-gray-900">{money(summary.revenue)}</div>
                        </div>

                        <div className="rounded-2xl bg-white p-4 shadow-sm">
                            <div className="text-xs font-bold uppercase tracking-wide text-gray-400">Чеков</div>
                            <div className="mt-2 text-2xl font-black text-gray-900">{summary.receiptCount}</div>
                        </div>

                        <div className="rounded-2xl bg-white p-4 shadow-sm">
                            <div className="text-xs font-bold uppercase tracking-wide text-gray-400">Средний чек</div>
                            <div className="mt-2 text-2xl font-black text-gray-900">{money(summary.averageCheck)}</div>
                        </div>

                        <div className="rounded-2xl bg-white p-4 shadow-sm">
                            <div className="text-xs font-bold uppercase tracking-wide text-gray-400">Себестоимость</div>
                            <div className="mt-2 text-2xl font-black text-gray-900">{money(summary.cost)}</div>
                        </div>

                        <div className="rounded-2xl bg-white p-4 shadow-sm">
                            <div className="text-xs font-bold uppercase tracking-wide text-gray-400">Предп. доход</div>
                            <div className="mt-2 text-2xl font-black text-green-700">{money(summary.estimatedProfit)}</div>
                        </div>

                        <div className="rounded-2xl bg-white p-4 shadow-sm">
                            <div className="text-xs font-bold uppercase tracking-wide text-gray-400">Товаров продано</div>
                            <div className="mt-2 text-2xl font-black text-gray-900">{quantity(summary.soldItems)}</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <div className="rounded-2xl bg-white p-5 shadow-sm">
                            <h2 className="text-lg font-bold text-gray-900">По торговым точкам</h2>

                            <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100">
                                <table className="w-full min-w-[760px] text-sm">
                                    <thead className="bg-gray-100 text-gray-600">
                                    <tr>
                                        <th className="p-3 text-left">Точка</th>
                                        <th className="p-3 text-right">Чеки</th>
                                        <th className="p-3 text-right">Выручка</th>
                                        <th className="p-3 text-right">Средний чек</th>
                                        <th className="p-3 text-right">Доход</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {(data?.byLocation || []).map(item => (
                                        <tr key={item.slug} className="border-t border-gray-100">
                                            <td className="p-3 font-bold text-gray-900">{item.name}</td>
                                            <td className="p-3 text-right">{item.receiptCount}</td>
                                            <td className="p-3 text-right font-semibold">{money(item.revenue)}</td>
                                            <td className="p-3 text-right">{money(item.averageCheck)}</td>
                                            <td className="p-3 text-right font-semibold text-green-700">{money(item.estimatedProfit)}</td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="rounded-2xl bg-white p-5 shadow-sm">
                            <h2 className="text-lg font-bold text-gray-900">Оплаты</h2>

                            <div className="mt-4 space-y-2">
                                {(data?.byPayment || []).length === 0 && (
                                    <div className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-500">
                                        Оплат за период нет
                                    </div>
                                )}

                                {(data?.byPayment || []).map(item => (
                                    <div key={item.method} className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
                                        <div>
                                            <div className="font-bold text-gray-900">{item.label}</div>
                                            <div className="text-xs text-gray-500">Чеков: {item.count}</div>
                                        </div>

                                        <div className="text-lg font-black text-gray-900">
                                            {money(item.total)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl bg-white p-5 shadow-sm">
                        <h2 className="text-lg font-bold text-gray-900">Топ товаров по выручке</h2>

                        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100">
                            <table className="w-full min-w-[900px] text-sm">
                                <thead className="bg-gray-100 text-gray-600">
                                <tr>
                                    <th className="w-12 p-3 text-left">№</th>
                                    <th className="p-3 text-left">Товар</th>
                                    <th className="p-3 text-right">Кол-во</th>
                                    <th className="p-3 text-right">Выручка</th>
                                    <th className="p-3 text-right">Себестоимость</th>
                                    <th className="p-3 text-right">Доход</th>
                                </tr>
                                </thead>
                                <tbody>
                                {(data?.topProducts || []).length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-gray-500">
                                            Продаж за период нет
                                        </td>
                                    </tr>
                                )}

                                {(data?.topProducts || []).map((item, index) => (
                                    <tr key={item.key} className="border-t border-gray-100">
                                        <td className="p-3 text-gray-400">{index + 1}</td>
                                        <td className="p-3 font-semibold text-gray-900">{item.name}</td>
                                        <td className="p-3 text-right">{quantity(item.quantity)}</td>
                                        <td className="p-3 text-right font-semibold">{money(item.revenue)}</td>
                                        <td className="p-3 text-right">{money(item.cost)}</td>
                                        <td className="p-3 text-right font-semibold text-green-700">{money(item.estimatedProfit)}</td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-3 text-xs text-gray-500">
                            Доход считается как выручка минус закупочная стоимость из позиции чека. Если в старом чеке закупочной цены не было, используется текущая закупочная цена товара.
                        </div>
                    </div>
                </div>
            </section>
        </System>
    )
}

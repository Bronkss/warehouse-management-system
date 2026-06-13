'use client'

import * as React from 'react'
import System from '@/app/system/page'

type PaymentMethod = 'card' | 'cash'

type ReceiptItem = {
    productId: string | number
    name: string
    barcode?: string
    category?: string
    unit?: string
    quantity: number
    price: number
    total: number
}

type Receipt = {
    id: string
    createdAt: string
    paymentMethod: PaymentMethod
    paymentLabel: string
    items: ReceiptItem[]
    total: number
    receivedAmount?: number
    change?: number
}

const formatCurrency = (amount: number | undefined | null): string => {
    const safeAmount = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0

    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(safeAmount)
}

export default function Page() {
    const [receipts, setReceipts] = React.useState<Receipt[]>([])
    const [isLoading, setIsLoading] = React.useState(true)
    const [error, setError] = React.useState('')
    const [searchQuery, setSearchQuery] = React.useState('')
    const [paymentFilter, setPaymentFilter] = React.useState<'all' | PaymentMethod>('all')
    const [dateFrom, setDateFrom] = React.useState(new Date().toISOString().split('T')[0])
    const [dateTo, setDateTo] = React.useState('')

    const fetchReceipts = React.useCallback(async () => {
        try {
            setIsLoading(true)
            setError('')

            const response = await fetch('/api/sales', {
                cache: 'no-store',
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.message || 'Не удалось загрузить чеки')
            }

            setReceipts(data)
        } catch (error) {
            console.error(error)
            setError(error instanceof Error ? error.message : 'Ошибка загрузки чеков')
        } finally {
            setIsLoading(false)
        }
    }, [])

    React.useEffect(() => {
        fetchReceipts()
    }, [fetchReceipts])

    const filteredReceipts = React.useMemo(() => {
        const query = searchQuery.trim().toLowerCase()

        return receipts.filter(receipt => {
            const receiptDate = receipt.createdAt.slice(0, 10)

            const matchesSearch = query
                ? receipt.id.toLowerCase().includes(query) ||
                receipt.paymentLabel.toLowerCase().includes(query) ||
                receipt.items.some(item =>
                    item.name.toLowerCase().includes(query) ||
                    String(item.barcode || '').toLowerCase().includes(query) ||
                    String(item.category || '').toLowerCase().includes(query)
                )
                : true

            const matchesPayment = paymentFilter === 'all'
                ? true
                : receipt.paymentMethod === paymentFilter

            const matchesDateFrom = dateFrom
                ? receiptDate >= dateFrom
                : true

            const matchesDateTo = dateTo
                ? receiptDate <= dateTo
                : true

            return matchesSearch && matchesPayment && matchesDateFrom && matchesDateTo
        })
    }, [receipts, searchQuery, paymentFilter, dateFrom, dateTo])

    const totalRevenue = filteredReceipts.reduce((sum, receipt) => sum + receipt.total, 0)

    const totalItems = filteredReceipts.reduce((sum, receipt) => {
        return sum + receipt.items.reduce((itemSum, item) => itemSum + item.quantity, 0)
    }, 0)

    const clearFilters = () => {
        setSearchQuery('')
        setPaymentFilter('all')
        setDateFrom('')
        setDateTo('')
    }

    return (
        <System>
            <div className="w-full p-6">
                <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">
                            Все онлайн продажи в магазине ТОЧКА .
                        </h1>

                    </div>

                    <button
                        type="button"
                        onClick={fetchReceipts}
                        className="rounded-xl bg-indigo-600 px-5 py-3 text-white hover:bg-indigo-700"
                    >
                        Обновить
                    </button>
                </div>

                {error && (
                    <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="rounded-2xl bg-white shadow p-5">
                        <div className="text-sm text-gray-500">
                            Чеков
                        </div>

                        <div className="text-3xl font-bold text-indigo-700">
                            {filteredReceipts.length}
                        </div>
                    </div>

                    <div className="rounded-2xl bg-white shadow p-5">
                        <div className="text-sm text-gray-500">
                            Товаров продано
                        </div>

                        <div className="text-3xl font-bold text-emerald-700">
                            {totalItems}
                        </div>
                    </div>

                    <div className="rounded-2xl bg-white shadow p-5">
                        <div className="text-sm text-gray-500">
                            Выручка
                        </div>

                        <div className="text-3xl font-bold text-blue-700">
                            {formatCurrency(totalRevenue)}
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl bg-white shadow p-5 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_170px_170px_auto] gap-3">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Поиск по номеру чека, товару, категории или штрихкоду"
                            className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                        />

                        <select
                            value={paymentFilter}
                            onChange={(e) => setPaymentFilter(e.target.value as 'all' | PaymentMethod)}
                            className="rounded-xl border border-gray-300 px-4 py-3 bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="all">Все оплаты</option>
                            <option value="card">Карта</option>
                            <option value="cash">Наличные</option>
                        </select>

                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                        />

                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                        />

                        <button
                            type="button"
                            onClick={clearFilters}
                            className="rounded-xl border border-gray-300 px-5 py-3 hover:bg-gray-50"
                        >
                            Сбросить
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <div className="rounded-2xl bg-white shadow p-10 text-center text-gray-500">
                        Загрузка чеков...
                    </div>
                ) : filteredReceipts.length === 0 ? (
                    <div className="rounded-2xl bg-white shadow p-10 text-center text-gray-500">
                        Продажи не найдены
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredReceipts.map((receipt) => (
                            <article
                                key={receipt.id}
                                className="rounded-2xl bg-white shadow overflow-hidden"
                            >
                                <div className="p-5 border-b border-gray-100 flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <div className="text-lg font-bold text-indigo-700">
                                            Чек № {receipt.id}
                                        </div>

                                        <div className="text-sm text-gray-500 mt-1">
                                            {new Date(receipt.createdAt).toLocaleString('ru-RU')}
                                        </div>

                                        <div className="text-sm text-gray-500 mt-1">
                                            Оплата: {receipt.paymentLabel}
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-4">
                                        <div className="text-right">
                                            <div className="text-sm text-gray-500">
                                                Сумма чека
                                            </div>

                                            <div className="text-2xl font-bold text-indigo-700">
                                                {formatCurrency(receipt.total)}
                                            </div>

                                            {receipt.paymentMethod === 'cash' && (
                                                <div className="text-sm text-gray-500 mt-1">
                                                    Получено: {formatCurrency(receipt.receivedAmount || 0)}
                                                    <br />
                                                    Сдача: {formatCurrency(receipt.change || 0)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="p-5 overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                        <tr className="text-left text-gray-500 border-b">
                                            <th className="py-2 pr-4">Товар</th>
                                            <th className="py-2 pr-4">Категория</th>
                                            <th className="py-2 pr-4">ШК</th>
                                            <th className="py-2 pr-4 text-right">Цена</th>
                                            <th className="py-2 pr-4 text-right">Кол-во</th>
                                            <th className="py-2 text-right">Сумма</th>
                                        </tr>
                                        </thead>

                                        <tbody>
                                        {receipt.items.map((item, index) => (
                                            <tr
                                                key={`${receipt.id}-${item.productId}-${index}`}
                                                className="border-b last:border-b-0"
                                            >
                                                <td className="py-3 pr-4 font-medium text-gray-800">
                                                    {item.name}
                                                </td>

                                                <td className="py-3 pr-4 text-gray-500">
                                                    {item.category || '—'}
                                                </td>

                                                <td className="py-3 pr-4 text-gray-500 font-mono">
                                                    {item.barcode || '—'}
                                                </td>

                                                <td className="py-3 pr-4 text-right">
                                                    {formatCurrency(item.price)}
                                                </td>

                                                <td className="py-3 pr-4 text-right">
                                                    {item.quantity}
                                                </td>

                                                <td className="py-3 text-right font-semibold">
                                                    {formatCurrency(item.total)}
                                                </td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </div>
        </System>
    )
}
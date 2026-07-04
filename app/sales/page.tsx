'use client'

import * as React from 'react'
import System from '@/app/components/SystemShell'

type PaymentMethod = 'card' | 'cash' | 'transfer'

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

    const cardRevenue = filteredReceipts
        .filter(receipt => receipt.paymentMethod === 'card')
        .reduce((sum, receipt) => sum + receipt.total, 0)

    const cashRevenue = filteredReceipts
        .filter(receipt => receipt.paymentMethod === 'cash')
        .reduce((sum, receipt) => sum + receipt.total, 0)

    const transferRevenue = filteredReceipts
        .filter(receipt => receipt.paymentMethod === 'transfer')
        .reduce((sum, receipt) => sum + receipt.total, 0)

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
            <div className="sales-page w-full p-6">
                <div className="sales-header mb-6 flex items-start justify-between gap-4">
                    <div>
                        <h1 className="sales-title text-3xl font-bold text-gray-800">
                            Все онлайн продажи в магазине ТОЧКА .
                        </h1>
                    </div>

                    <button
                        type="button"
                        onClick={fetchReceipts}
                        className="sales-refresh rounded-xl bg-indigo-600 px-5 py-3 text-white hover:bg-indigo-700"
                    >
                        Обновить
                    </button>
                </div>

                {error && (
                    <div className="sales-error mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                        {error}
                    </div>
                )}

                <div className="sales-stats grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
                    <div className="sales-stat-card rounded-2xl bg-white shadow p-5">
                        <div className="text-sm text-gray-500">
                            Чеков
                        </div>

                        <div className="sales-stat-value text-3xl font-bold text-indigo-700">
                            {filteredReceipts.length}
                        </div>
                    </div>

                    <div className="sales-stat-card rounded-2xl bg-white shadow p-5">
                        <div className="text-sm text-gray-500">
                            Товаров продано
                        </div>

                        <div className="sales-stat-value text-3xl font-bold text-emerald-700">
                            {totalItems}
                        </div>
                    </div>

                    <div className="sales-stat-card rounded-2xl bg-white shadow p-5">
                        <div className="text-sm text-gray-500">
                            Выручка
                        </div>

                        <div className="sales-stat-value text-3xl font-bold text-blue-700">
                            {formatCurrency(totalRevenue)}
                        </div>
                    </div>

                    <div className="sales-stat-card rounded-2xl bg-white shadow p-5">
                        <div className="text-sm text-gray-500">
                            Картой
                        </div>

                        <div className="sales-stat-value text-3xl font-bold text-indigo-700">
                            {formatCurrency(cardRevenue)}
                        </div>
                    </div>

                    <div className="sales-stat-card rounded-2xl bg-white shadow p-5">
                        <div className="text-sm text-gray-500">
                            Наличными
                        </div>

                        <div className="sales-stat-value text-3xl font-bold text-emerald-700">
                            {formatCurrency(cashRevenue)}
                        </div>
                    </div>

                    <div className="sales-stat-card rounded-2xl bg-white shadow p-5">
                        <div className="text-sm text-gray-500">
                            Переводами
                        </div>

                        <div className="sales-stat-value text-3xl font-bold text-blue-700">
                            {formatCurrency(transferRevenue)}
                        </div>
                    </div>
                </div>

                <div className="sales-filters rounded-2xl bg-white shadow p-5 mb-6">
                    <div className="sales-filters-grid grid grid-cols-1 md:grid-cols-[1fr_180px_170px_170px_auto] gap-3">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Поиск по номеру чека, товару, категории или штрихкоду"
                            className="sales-field rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                        />

                        <select
                            value={paymentFilter}
                            onChange={(e) => setPaymentFilter(e.target.value as 'all' | PaymentMethod)}
                            className="sales-field rounded-xl border border-gray-300 px-4 py-3 bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="all">Все оплаты</option>
                            <option value="card">Карта</option>
                            <option value="cash">Наличные</option>
                            <option value="transfer">Перевод</option>
                        </select>

                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="sales-field rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                        />

                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="sales-field rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                        />

                        <button
                            type="button"
                            onClick={clearFilters}
                            className="sales-reset rounded-xl border border-gray-300 px-5 py-3 hover:bg-gray-50"
                        >
                            Сбросить
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <div className="sales-empty rounded-2xl bg-white shadow p-10 text-center text-gray-500">
                        Загрузка чеков...
                    </div>
                ) : filteredReceipts.length === 0 ? (
                    <div className="sales-empty rounded-2xl bg-white shadow p-10 text-center text-gray-500">
                        Продажи не найдены
                    </div>
                ) : (
                    <div className="sales-list space-y-4">
                        {filteredReceipts.map((receipt) => (
                            <article
                                key={receipt.id}
                                className="sales-receipt rounded-2xl bg-white shadow overflow-hidden"
                            >
                                <div className="sales-receipt-header p-5 border-b border-gray-100 flex flex-wrap items-start justify-between gap-4">
                                    <div className="sales-receipt-info">
                                        <div className="sales-receipt-id text-lg font-bold text-indigo-700">
                                            Чек № {receipt.id}
                                        </div>

                                        <div className="sales-receipt-date text-sm text-gray-500 mt-1">
                                            {new Date(receipt.createdAt).toLocaleString('ru-RU')}
                                        </div>

                                        <div className="sales-receipt-payment text-sm text-gray-500 mt-1">
                                            Оплата: {receipt.paymentLabel}
                                        </div>
                                    </div>

                                    <div className="sales-receipt-total-block flex items-start gap-4">
                                        <div className="sales-receipt-total text-right">
                                            <div className="text-sm text-gray-500">
                                                Сумма чека
                                            </div>

                                            <div className="sales-receipt-total-value text-2xl font-bold text-indigo-700">
                                                {formatCurrency(receipt.total)}
                                            </div>

                                            {receipt.paymentMethod === 'cash' && (
                                                <div className="sales-cash-info text-sm text-gray-500 mt-1">
                                                    Получено: {formatCurrency(receipt.receivedAmount || 0)}
                                                    <br />
                                                    Сдача: {formatCurrency(receipt.change || 0)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="sales-table-wrap p-5 overflow-x-auto">
                                    <table className="sales-table w-full text-sm">
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
                                                <td
                                                    data-label="Товар"
                                                    className="py-3 pr-4 font-medium text-gray-800"
                                                >
                                                    {item.name}
                                                </td>

                                                <td
                                                    data-label="Категория"
                                                    className="py-3 pr-4 text-gray-500"
                                                >
                                                    {item.category || '—'}
                                                </td>

                                                <td
                                                    data-label="ШК"
                                                    className="py-3 pr-4 text-gray-500 font-mono"
                                                >
                                                    {item.barcode || '—'}
                                                </td>

                                                <td
                                                    data-label="Цена"
                                                    className="py-3 pr-4 text-right"
                                                >
                                                    {formatCurrency(item.price)}
                                                </td>

                                                <td
                                                    data-label="Кол-во"
                                                    className="py-3 pr-4 text-right"
                                                >
                                                    {item.quantity}
                                                </td>

                                                <td
                                                    data-label="Сумма"
                                                    className="py-3 text-right font-semibold"
                                                >
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

                <style>{`
                    .sales-table {
                        min-width: 760px;
                    }

                    @media (max-width: 1024px) {
                        .sales-page {
                            padding: 20px;
                        }

                        .sales-title {
                            font-size: 28px;
                            line-height: 1.2;
                        }

                        .sales-filters-grid {
                            grid-template-columns: 1fr 1fr;
                        }

                        .sales-field,
                        .sales-reset {
                            width: 100%;
                        }
                    }

                    @media (max-width: 768px) {
                        .sales-page {
                            padding: 16px;
                        }

                        .sales-header {
                            flex-direction: column;
                            align-items: stretch;
                            gap: 16px;
                            margin-bottom: 20px;
                        }

                        .sales-title {
                            font-size: 24px;
                            line-height: 1.25;
                        }

                        .sales-refresh {
                            width: 100%;
                            padding: 12px 18px;
                            border-radius: 14px;
                        }

                        .sales-stats {
                            gap: 12px;
                            margin-bottom: 18px;
                        }

                        .sales-stat-card {
                            padding: 18px;
                            border-radius: 18px;
                        }

                        .sales-stat-value {
                            font-size: 28px;
                            line-height: 1.2;
                        }

                        .sales-filters {
                            padding: 16px;
                            border-radius: 18px;
                            margin-bottom: 18px;
                        }

                        .sales-filters-grid {
                            grid-template-columns: 1fr;
                            gap: 12px;
                        }

                        .sales-field,
                        .sales-reset {
                            min-height: 48px;
                            font-size: 15px;
                            border-radius: 14px;
                        }

                        .sales-empty {
                            padding: 32px 18px;
                            border-radius: 18px;
                        }

                        .sales-receipt {
                            border-radius: 18px;
                        }

                        .sales-receipt-header {
                            flex-direction: column;
                            padding: 18px;
                            gap: 14px;
                        }

                        .sales-receipt-total-block {
                            width: 100%;
                        }

                        .sales-receipt-total {
                            width: 100%;
                            text-align: left;
                            border-radius: 16px;
                            background: #f8fafc;
                            padding: 14px;
                        }

                        .sales-receipt-total-value {
                            font-size: 24px;
                        }

                        .sales-table-wrap {
                            padding: 16px;
                        }
                    }

                    @media (max-width: 640px) {
                        .sales-table-wrap {
                            overflow-x: visible;
                        }

                        .sales-table {
                            min-width: 0;
                        }

                        .sales-table,
                        .sales-table thead,
                        .sales-table tbody,
                        .sales-table tr,
                        .sales-table th,
                        .sales-table td {
                            display: block;
                            width: 100%;
                        }

                        .sales-table thead {
                            display: none;
                        }

                        .sales-table tbody {
                            display: grid;
                            gap: 12px;
                        }

                        .sales-table tr {
                            border: 1px solid #e5e7eb;
                            border-radius: 16px;
                            padding: 12px;
                            background: #ffffff;
                        }

                        .sales-table td {
                            display: flex;
                            align-items: flex-start;
                            justify-content: space-between;
                            gap: 16px;
                            border-bottom: 1px dashed #e5e7eb;
                            padding: 8px 0;
                            text-align: right;
                        }

                        .sales-table td:last-child {
                            border-bottom: 0;
                        }

                        .sales-table td::before {
                            content: attr(data-label);
                            flex: 0 0 90px;
                            text-align: left;
                            font-weight: 600;
                            color: #6b7280;
                        }

                        .sales-table td:first-child {
                            display: block;
                            text-align: left;
                            font-size: 15px;
                        }

                        .sales-table td:first-child::before {
                            display: block;
                            margin-bottom: 4px;
                        }
                    }

                    @media (max-width: 480px) {
                        .sales-page {
                            padding: 12px;
                        }

                        .sales-title {
                            font-size: 21px;
                        }

                        .sales-refresh {
                            padding: 11px 16px;
                            font-size: 15px;
                        }

                        .sales-stat-card {
                            padding: 16px;
                        }

                        .sales-stat-value {
                            font-size: 25px;
                        }

                        .sales-filters {
                            padding: 14px;
                        }

                        .sales-field,
                        .sales-reset {
                            padding: 11px 14px;
                            font-size: 14px;
                        }

                        .sales-receipt-header {
                            padding: 16px;
                        }

                        .sales-receipt-id {
                            font-size: 16px;
                            word-break: break-word;
                        }

                        .sales-receipt-date,
                        .sales-receipt-payment,
                        .sales-cash-info {
                            font-size: 13px;
                        }

                        .sales-receipt-total-value {
                            font-size: 21px;
                        }

                        .sales-table-wrap {
                            padding: 12px;
                        }

                        .sales-table tr {
                            padding: 10px;
                            border-radius: 14px;
                        }

                        .sales-table td {
                            gap: 10px;
                            font-size: 13px;
                        }

                        .sales-table td::before {
                            flex-basis: 78px;
                        }
                    }

                    @media (max-width: 360px) {
                        .sales-page {
                            padding: 10px;
                        }

                        .sales-title {
                            font-size: 19px;
                        }

                        .sales-stat-value {
                            font-size: 23px;
                        }

                        .sales-table td {
                            flex-direction: column;
                            gap: 4px;
                            text-align: left;
                        }

                        .sales-table td::before {
                            flex-basis: auto;
                        }
                    }
                `}</style>
            </div>
        </System>
    )
}
'use client'

import * as React from 'react'

import System from '@/app/components/SystemShell'

type PaymentMethod =
    | 'card'
    | 'cash'
    | 'transfer'
    | 'mixed'

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
    id: string | number
    receiptNumber?: string

    createdAt: string

    paymentMethod: PaymentMethod
    paymentLabel: string

    items: ReceiptItem[]

    total: number

    receivedAmount?: number
    change?: number

    cashAmount?: number
    cardAmount?: number
    transferAmount?: number
    customerName?: string

    cashierName?: string
    cashierLogin?: string

    locationName?: string
    locationSlug?: string
}

const DEFAULT_LOCATION_NAME =
    'ТОЧКА'

function numberValue(
    value:
        | number
        | string
        | null
        | undefined
): number {
    const parsed =
        Number(
            value || 0
        )

    return Number.isFinite(
        parsed
    )
        ? parsed
        : 0
}

function formatCurrency(
    amount:
        | number
        | undefined
        | null
): string {
    return new Intl.NumberFormat(
        'ru-RU',
        {
            style:
                'currency',

            currency:
                'RUB',

            minimumFractionDigits:
                2,

            maximumFractionDigits:
                2,
        }
    ).format(
        numberValue(
            amount
        )
    )
}

function formatQuantityNumber(
    amount:
        | number
        | undefined
        | null,
    maximumFractionDigits =
        3
): string {
    return new Intl.NumberFormat(
        'ru-RU',
        {
            minimumFractionDigits:
                0,

            maximumFractionDigits,
        }
    ).format(
        numberValue(
            amount
        )
    )
}

function isWeightReceiptItem(
    item: ReceiptItem
): boolean {
    const unit =
        String(
            item.unit ||
            ''
        )
            .trim()
            .toLowerCase()

    return [
        'weight',
        'kg',
        'кг',
        'килограмм',
        'килограммы',
    ].includes(
        unit
    )
}

function getSoldItemsCount(
    item: ReceiptItem
): number {
    if (
        isWeightReceiptItem(
            item
        )
    ) {
        return 1
    }

    const quantity =
        Number(
            item.quantity
        )

    return (
        Number.isFinite(
            quantity
        ) &&
        quantity > 0
    )
        ? quantity
        : 0
}

function formatReceiptItemQuantity(
    item: ReceiptItem
): React.ReactNode {
    if (
        isWeightReceiptItem(
            item
        )
    ) {
        return (
            <span className="inline-flex flex-col items-end gap-0.5">
                <span className="font-semibold">
                    1 ед.
                </span>

                <span className="text-xs text-gray-400">
                    {formatQuantityNumber(
                        item.quantity,
                        3
                    )}{' '}
                    кг
                </span>
            </span>
        )
    }

    return formatQuantityNumber(
        item.quantity,
        3
    )
}

function getReceiptNumber(
    receipt: Receipt
): string {
    return String(
        receipt.receiptNumber ||
        receipt.id
    )
}

function getCashAmount(
    receipt: Receipt
): number {
    if (
        receipt.cashAmount !==
        undefined
    ) {
        return numberValue(
            receipt.cashAmount
        )
    }

    return (
        receipt.paymentMethod ===
        'cash'
    )
        ? numberValue(
            receipt.total
        )
        : 0
}

function getCardAmount(
    receipt: Receipt
): number {
    if (
        receipt.cardAmount !==
        undefined
    ) {
        return numberValue(
            receipt.cardAmount
        )
    }

    return (
        receipt.paymentMethod ===
        'card'
    )
        ? numberValue(
            receipt.total
        )
        : 0
}

function getTransferAmount(
    receipt: Receipt
): number {
    if (
        receipt.transferAmount !==
        undefined
    ) {
        return numberValue(
            receipt.transferAmount
        )
    }

    return (
        receipt.paymentMethod ===
        'transfer'
    )
        ? numberValue(
            receipt.total
        )
        : 0
}

function PaymentBreakdown({
                              receipt,
                          }: {
    receipt: Receipt
}) {
    const cash =
        getCashAmount(
            receipt
        )

    const card =
        getCardAmount(
            receipt
        )

    const transfer =
        getTransferAmount(
            receipt
        )

    const parts = [
        {
            key:
                'cash',

            label:
                'Наличные',

            value:
            cash,

            className:
                'text-emerald-700',
        },
        {
            key:
                'card',

            label:
                'Карта',

            value:
            card,

            className:
                'text-indigo-700',
        },
        {
            key:
                'transfer',

            label:
                'Перевод',

            value:
            transfer,

            className:
                'text-blue-700',
        },
    ].filter(
        part =>
            part.value >
            0.009
    )

    if (
        parts.length <=
        1
    ) {
        return null
    }

    return (
        <div className="mt-2 rounded-xl border border-violet-100 bg-violet-50 p-3">
            <div className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-violet-700">
                Разбивка смешанной оплаты
            </div>

            <div className="space-y-1.5 text-sm">
                {parts.map(
                    part => (
                        <div
                            key={
                                part.key
                            }
                            className="flex items-center justify-between gap-4"
                        >
                            <span className="text-gray-600">
                                {part.label}
                            </span>

                            <span className={`font-black ${part.className}`}>
                                {formatCurrency(
                                    part.value
                                )}
                            </span>
                        </div>
                    )
                )}
            </div>
        </div>
    )
}

export default function Page() {
    const [
        receipts,
        setReceipts,
    ] =
        React.useState<
            Receipt[]
        >(
            []
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
        React.useState(
            ''
        )

    const [
        searchQuery,
        setSearchQuery,
    ] =
        React.useState(
            ''
        )

    const [
        paymentFilter,
        setPaymentFilter,
    ] =
        React.useState<
            'all' |
            PaymentMethod
        >(
            'all'
        )

    const [
        dateFrom,
        setDateFrom,
    ] =
        React.useState(
            new Date()
                .toISOString()
                .split(
                    'T'
                )[0]
        )

    const [
        dateTo,
        setDateTo,
    ] =
        React.useState(
            ''
        )

    const [
        locationName,
        setLocationName,
    ] =
        React.useState(
            DEFAULT_LOCATION_NAME
        )

    const fetchReceipts =
        React.useCallback(
            async () => {
                try {
                    setIsLoading(
                        true
                    )

                    setError(
                        ''
                    )

                    const response =
                        await fetch(
                            '/api/sales',
                            {
                                cache:
                                    'no-store',

                                credentials:
                                    'same-origin',
                            }
                        )

                    const data =
                        await response.json()

                    if (
                        !response.ok
                    ) {
                        throw new Error(
                            data.message ||
                            'Не удалось загрузить чеки'
                        )
                    }

                    const items =
                        Array.isArray(
                            data
                        )
                            ? data
                            : []

                    setReceipts(
                        items
                    )

                    const serverLocationName =
                        items[0]
                            ?.locationName

                    if (
                        serverLocationName
                    ) {
                        setLocationName(
                            String(
                                serverLocationName
                            )
                        )
                    }
                } catch (
                    fetchError
                    ) {
                    console.error(
                        fetchError
                    )

                    setError(
                        fetchError instanceof Error
                            ? fetchError.message
                            : 'Ошибка загрузки чеков'
                    )
                } finally {
                    setIsLoading(
                        false
                    )
                }
            },
            []
        )

    React.useEffect(
        () => {
            void fetchReceipts()
        },
        [
            fetchReceipts,
        ]
    )

    const filteredReceipts =
        React.useMemo(
            () => {
                const query =
                    searchQuery
                        .trim()
                        .toLowerCase()

                return receipts.filter(
                    receipt => {
                        const receiptDate =
                            String(
                                receipt.createdAt
                            ).slice(
                                0,
                                10
                            )

                        const matchesSearch =
                            query
                                ? (
                                    getReceiptNumber(
                                        receipt
                                    )
                                        .toLowerCase()
                                        .includes(
                                            query
                                        ) ||

                                    String(
                                        receipt.paymentLabel ||
                                        ''
                                    )
                                        .toLowerCase()
                                        .includes(
                                            query
                                        ) ||

                                    String(
                                        receipt.cashierName ||
                                        ''
                                    )
                                        .toLowerCase()
                                        .includes(
                                            query
                                        ) ||

                                    String(
                                        receipt.customerName ||
                                        ''
                                    )
                                        .toLowerCase()
                                        .includes(
                                            query
                                        ) ||

                                    receipt.items.some(
                                        item =>
                                            item.name
                                                .toLowerCase()
                                                .includes(
                                                    query
                                                ) ||

                                            String(
                                                item.barcode ||
                                                ''
                                            )
                                                .toLowerCase()
                                                .includes(
                                                    query
                                                ) ||

                                            String(
                                                item.category ||
                                                ''
                                            )
                                                .toLowerCase()
                                                .includes(
                                                    query
                                                )
                                    )
                                )
                                : true

                        const matchesPayment =
                            paymentFilter ===
                            'all'
                                ? true
                                : receipt.paymentMethod ===
                                paymentFilter

                        const matchesDateFrom =
                            dateFrom
                                ? receiptDate >=
                                dateFrom
                                : true

                        const matchesDateTo =
                            dateTo
                                ? receiptDate <=
                                dateTo
                                : true

                        return (
                            matchesSearch &&
                            matchesPayment &&
                            matchesDateFrom &&
                            matchesDateTo
                        )
                    }
                )
            },
            [
                receipts,
                searchQuery,
                paymentFilter,
                dateFrom,
                dateTo,
            ]
        )

    const totalRevenue =
        filteredReceipts.reduce(
            (
                sum,
                receipt
            ) =>
                sum +
                numberValue(
                    receipt.total
                ),
            0
        )

    const cashRevenue =
        filteredReceipts.reduce(
            (
                sum,
                receipt
            ) =>
                sum +
                getCashAmount(
                    receipt
                ),
            0
        )

    const cardRevenue =
        filteredReceipts.reduce(
            (
                sum,
                receipt
            ) =>
                sum +
                getCardAmount(
                    receipt
                ),
            0
        )

    const transferRevenue =
        filteredReceipts.reduce(
            (
                sum,
                receipt
            ) =>
                sum +
                getTransferAmount(
                    receipt
                ),
            0
        )

    const mixedReceipts =
        filteredReceipts.filter(
            receipt =>
                receipt.paymentMethod ===
                'mixed'
        ).length

    const totalItems =
        filteredReceipts.reduce(
            (
                sum,
                receipt
            ) =>
                sum +
                receipt.items.reduce(
                    (
                        itemSum,
                        item
                    ) =>
                        itemSum +
                        getSoldItemsCount(
                            item
                        ),
                    0
                ),
            0
        )

    const clearFilters =
        () => {
            setSearchQuery(
                ''
            )

            setPaymentFilter(
                'all'
            )

            setDateFrom(
                ''
            )

            setDateTo(
                ''
            )
        }

    return (
        <System>
            <div className="w-full p-4 sm:p-6">
                <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 sm:text-3xl">
                            Продажи: {locationName}
                        </h1>

                        <p className="mt-1 text-sm text-gray-500">
                            Чеки и фактическая разбивка поступлений по наличным, карте и переводу.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={
                            fetchReceipts
                        }
                        className="rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white hover:bg-indigo-700"
                    >
                        Обновить
                    </button>
                </div>

                {error && (
                    <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-700">
                        {error}
                    </div>
                )}

                <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
                    <div className="rounded-2xl bg-white p-5 shadow-sm">
                        <div className="text-sm text-gray-500">
                            Чеков
                        </div>

                        <div className="mt-1 text-3xl font-black text-gray-900">
                            {filteredReceipts.length}
                        </div>
                    </div>

                    <div className="rounded-2xl bg-white p-5 shadow-sm">
                        <div className="text-sm text-gray-500">
                            Выручка
                        </div>

                        <div className="mt-1 text-3xl font-black text-gray-900">
                            {formatCurrency(
                                totalRevenue
                            )}
                        </div>
                    </div>

                    <div className="rounded-2xl bg-emerald-50 p-5 shadow-sm">
                        <div className="text-sm font-bold text-emerald-700">
                            Наличными
                        </div>

                        <div className="mt-1 text-3xl font-black text-emerald-800">
                            {formatCurrency(
                                cashRevenue
                            )}
                        </div>
                    </div>

                    <div className="rounded-2xl bg-indigo-50 p-5 shadow-sm">
                        <div className="text-sm font-bold text-indigo-700">
                            Картой
                        </div>

                        <div className="mt-1 text-3xl font-black text-indigo-800">
                            {formatCurrency(
                                cardRevenue
                            )}
                        </div>
                    </div>

                    <div className="rounded-2xl bg-blue-50 p-5 shadow-sm">
                        <div className="text-sm font-bold text-blue-700">
                            Переводами
                        </div>

                        <div className="mt-1 text-3xl font-black text-blue-800">
                            {formatCurrency(
                                transferRevenue
                            )}
                        </div>
                    </div>

                    <div className="rounded-2xl bg-violet-50 p-5 shadow-sm">
                        <div className="text-sm font-bold text-violet-700">
                            Смешанных чеков
                        </div>

                        <div className="mt-1 text-3xl font-black text-violet-800">
                            {mixedReceipts}
                        </div>

                        <div className="mt-1 text-xs text-violet-600">
                            Товаров: {formatQuantityNumber(
                            totalItems,
                            3
                        )}
                        </div>
                    </div>
                </div>

                <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_190px_170px_170px_auto]">
                        <input
                            type="text"
                            value={
                                searchQuery
                            }
                            onChange={
                                event =>
                                    setSearchQuery(
                                        event.target.value
                                    )
                            }
                            placeholder="Поиск по чеку, товару, категории или штрихкоду"
                            className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                        />

                        <select
                            value={
                                paymentFilter
                            }
                            onChange={
                                event =>
                                    setPaymentFilter(
                                        event.target.value as
                                            | 'all'
                                            | PaymentMethod
                                    )
                            }
                            className="rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="all">
                                Все оплаты
                            </option>

                            <option value="cash">
                                Наличные
                            </option>

                            <option value="card">
                                Карта
                            </option>

                            <option value="transfer">
                                Перевод
                            </option>

                            <option value="mixed">
                                Смешанная
                            </option>
                        </select>

                        <input
                            type="date"
                            value={
                                dateFrom
                            }
                            onChange={
                                event =>
                                    setDateFrom(
                                        event.target.value
                                    )
                            }
                            className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                        />

                        <input
                            type="date"
                            value={
                                dateTo
                            }
                            onChange={
                                event =>
                                    setDateTo(
                                        event.target.value
                                    )
                            }
                            className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                        />

                        <button
                            type="button"
                            onClick={
                                clearFilters
                            }
                            className="rounded-xl border border-gray-300 px-5 py-3 font-bold text-gray-700 hover:bg-gray-50"
                        >
                            Сбросить
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <div className="rounded-2xl bg-white p-10 text-center text-gray-500 shadow-sm">
                        Загрузка чеков...
                    </div>
                ) : filteredReceipts.length ===
                0 ? (
                    <div className="rounded-2xl bg-white p-10 text-center text-gray-500 shadow-sm">
                        Продажи не найдены
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredReceipts.map(
                            receipt => (
                                <article
                                    key={
                                        String(
                                            receipt.id
                                        )
                                    }
                                    className="overflow-hidden rounded-2xl bg-white shadow-sm"
                                >
                                    <div className="flex flex-col gap-4 border-b border-gray-100 p-5 lg:flex-row lg:items-start lg:justify-between">
                                        <div>
                                            <div className="text-lg font-black text-indigo-700">
                                                Чек № {getReceiptNumber(
                                                receipt
                                            )}
                                            </div>

                                            <div className="mt-1 text-sm text-gray-500">
                                                {new Date(
                                                    receipt.createdAt
                                                ).toLocaleString(
                                                    'ru-RU'
                                                )}
                                            </div>

                                            <div className="mt-1 text-sm text-gray-500">
                                                Оплата:{' '}
                                                <span className="font-bold text-gray-700">
                                                    {receipt.paymentLabel}
                                                </span>
                                            </div>

                                            {receipt.paymentMethod ===
                                                'transfer' &&
                                                receipt.customerName && (
                                                    <div className="mt-1 text-sm text-blue-700">
                                                        Кто перевёл:{' '}
                                                        <span className="font-black">
                                                            {receipt.customerName}
                                                        </span>
                                                    </div>
                                                )}

                                            <div className="mt-1 text-sm text-gray-500">
                                                Кассир:{' '}
                                                {receipt.cashierName ||
                                                    'Не указан'}
                                            </div>

                                            <PaymentBreakdown
                                                receipt={
                                                    receipt
                                                }
                                            />
                                        </div>

                                        <div className="rounded-2xl bg-gray-50 p-4 lg:text-right">
                                            <div className="text-sm text-gray-500">
                                                Сумма чека
                                            </div>

                                            <div className="mt-1 text-2xl font-black text-gray-900">
                                                {formatCurrency(
                                                    receipt.total
                                                )}
                                            </div>

                                            {receipt.paymentMethod ===
                                                'cash' && (
                                                    <div className="mt-2 text-sm text-gray-500">
                                                        Получено:{' '}
                                                        {formatCurrency(
                                                            receipt.receivedAmount ||
                                                            0
                                                        )}
                                                        <br/>
                                                        Сдача:{' '}
                                                        {formatCurrency(
                                                            receipt.change ||
                                                            0
                                                        )}
                                                    </div>
                                                )}
                                        </div>
                                    </div>

                                    <div className="overflow-x-auto p-5">
                                        <table className="w-full min-w-[720px] text-sm">
                                            <thead>
                                            <tr className="border-b text-left text-gray-500">
                                                <th className="py-2 pr-4">
                                                    Товар
                                                </th>

                                                <th className="py-2 pr-4">
                                                    Категория
                                                </th>

                                                <th className="py-2 pr-4">
                                                    ШК
                                                </th>

                                                <th className="py-2 pr-4 text-right">
                                                    Цена
                                                </th>

                                                <th className="py-2 pr-4 text-right">
                                                    Кол-во
                                                </th>

                                                <th className="py-2 text-right">
                                                    Сумма
                                                </th>
                                            </tr>
                                            </thead>

                                            <tbody>
                                            {receipt.items.map(
                                                (
                                                    item,
                                                    index
                                                ) => (
                                                    <tr
                                                        key={`${getReceiptNumber(receipt)}-${item.productId}-${index}`}
                                                        className="border-b last:border-b-0"
                                                    >
                                                        <td className="py-3 pr-4 font-medium text-gray-800">
                                                            {item.name}
                                                        </td>

                                                        <td className="py-3 pr-4 text-gray-500">
                                                            {item.category ||
                                                                '—'}
                                                        </td>

                                                        <td className="py-3 pr-4 font-mono text-gray-500">
                                                            {item.barcode ||
                                                                '—'}
                                                        </td>

                                                        <td className="py-3 pr-4 text-right">
                                                            {formatCurrency(
                                                                item.price
                                                            )}
                                                        </td>

                                                        <td className="py-3 pr-4 text-right">
                                                            {formatReceiptItemQuantity(
                                                                item
                                                            )}
                                                        </td>

                                                        <td className="py-3 text-right font-bold">
                                                            {formatCurrency(
                                                                item.total
                                                            )}
                                                        </td>
                                                    </tr>
                                                )
                                            )}
                                            </tbody>
                                        </table>
                                    </div>
                                </article>
                            )
                        )}
                    </div>
                )}
            </div>
        </System>
    )
}

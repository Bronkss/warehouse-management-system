'use client'

import * as React from 'react'
import System from '@/app/components/SystemShell'

type OrderStatus =
    | 'new'
    | 'accepted'
    | 'assembling'
    | 'delivering'
    | 'completed'
    | 'cancelled'

type PaymentMethod = 'cash' | 'card'

interface OrderItem {
    id: string
    productId: string
    title: string
    quantity: number
    price: number
    total: number
    createdAt: string
}

interface OrderHistoryItem {
    id: string
    oldStatus: OrderStatus | null
    newStatus: OrderStatus
    changedByTelegramId: string | null
    changedByName: string | null
    createdAt: string
}

interface DeliveryOrder {
    id: string
    orderNumber: string
    status: OrderStatus
    address: string
    customerName: string
    customerPhone: string
    apartment: string | null
    paymentMethod: PaymentMethod
    comments: string | null
    total: number
    telegramStatus: string
    telegramChatId: string | null
    telegramMessageId: number | null
    telegramSentAt: string | null
    courierTelegramId: string | null
    courierName: string | null
    createdAt: string
    updatedAt: string
    items: OrderItem[]
    history: OrderHistoryItem[]
}

type TabKey = 'current' | 'history' | 'all'

type ApiErrorResponse = {
    message?: string
}

const STATUS_LABELS: Record<OrderStatus, string> = {
    new: 'Новый',
    accepted: 'Принят',
    assembling: 'Собирается',
    delivering: 'В доставке',
    completed: 'Завершён',
    cancelled: 'Отменён',
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
    cash: 'Наличные',
    card: 'Карта',
}

const CURRENT_STATUSES: OrderStatus[] = [
    'new',
    'accepted',
    'assembling',
    'delivering',
]

const HISTORY_STATUSES: OrderStatus[] = ['completed', 'cancelled']

function formatDate(value: string | null) {
    if (!value) return '—'

    return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value))
}

function formatMoney(value: number) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(Math.round(value || 0))
}

function isCurrentDelivery(order: DeliveryOrder) {
    return CURRENT_STATUSES.includes(order.status)
}

function isHistoryDelivery(order: DeliveryOrder) {
    return HISTORY_STATUSES.includes(order.status)
}

function getStatusClass(status: OrderStatus) {
    if (status === 'new') return 'bg-blue-50 text-blue-700 border-blue-100'
    if (status === 'accepted') return 'bg-cyan-50 text-cyan-700 border-cyan-100'
    if (status === 'assembling') return 'bg-orange-50 text-orange-700 border-orange-100'
    if (status === 'delivering') return 'bg-purple-50 text-purple-700 border-purple-100'
    if (status === 'completed') return 'bg-green-50 text-green-700 border-green-100'
    return 'bg-red-50 text-red-700 border-red-100'
}

async function readApiJson<T>(response: Response): Promise<T> {
    const text = await response.text()

    try {
        return JSON.parse(text) as T
    } catch {
        console.error('API вернул не JSON:', {
            status: response.status,
            statusText: response.statusText,
            url: response.url,
            body: text.slice(0, 1000),
        })

        throw new Error(
            `API вернул не JSON. Статус: ${response.status}. Проверь маршрут ${response.url}`,
        )
    }
}

export default function Page() {
    const [orders, setOrders] = React.useState<DeliveryOrder[]>([])
    const [isLoading, setIsLoading] = React.useState(true)
    const [isRefreshing, setIsRefreshing] = React.useState(false)
    const [error, setError] = React.useState('')
    const [search, setSearch] = React.useState('')
    const [activeTab, setActiveTab] = React.useState<TabKey>('current')
    const [openedOrderId, setOpenedOrderId] = React.useState<string | null>(null)
    const [updatingOrderId, setUpdatingOrderId] = React.useState<string | null>(null)

    const loadOrders = React.useCallback(async () => {
        try {
            setError('')

            const params = new URLSearchParams()

            if (search.trim()) {
                params.set('search', search.trim())
            }

            params.set('scope', activeTab)

            const response = await fetch(`/api/deliveries?${params.toString()}`, {
                method: 'GET',
                cache: 'no-store',
            })

            const data = await readApiJson<DeliveryOrder[] | ApiErrorResponse>(response)

            if (!response.ok) {
                throw new Error(
                    !Array.isArray(data) && data.message
                        ? data.message
                        : 'Не удалось загрузить доставки',
                )
            }

            setOrders(Array.isArray(data) ? data : [])
        } catch (err) {
            console.error(err)
            setError(err instanceof Error ? err.message : 'Ошибка загрузки доставок')
        } finally {
            setIsLoading(false)
            setIsRefreshing(false)
        }
    }, [activeTab, search])

    React.useEffect(() => {
        const timer = window.setTimeout(() => {
            void loadOrders()
        }, 250)

        return () => window.clearTimeout(timer)
    }, [loadOrders])

    const currentOrders = React.useMemo(
        () => orders.filter(isCurrentDelivery),
        [orders],
    )

    const historyOrders = React.useMemo(
        () => orders.filter(isHistoryDelivery),
        [orders],
    )

    const handleRefresh = async () => {
        setIsRefreshing(true)
        await loadOrders()
    }

    const handleChangeStatus = async (orderId: string, status: OrderStatus) => {
        try {
            setUpdatingOrderId(orderId)
            setError('')

            const response = await fetch(`/api/deliveries/${orderId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    status,
                    changedByName: 'Администратор',
                }),
            })

            const data = await readApiJson<DeliveryOrder | ApiErrorResponse>(response)

            if (!response.ok) {
                throw new Error(
                    'message' in data && data.message
                        ? data.message
                        : 'Не удалось обновить статус',
                )
            }

            if (!('id' in data)) {
                throw new Error('API не вернул обновлённую доставку')
            }

            const updatedOrder = data as DeliveryOrder

            setOrders((prev) => {
                const next = prev.map((order) =>
                    order.id === updatedOrder.id ? updatedOrder : order,
                )

                if (activeTab === 'current' && !isCurrentDelivery(updatedOrder)) {
                    return next.filter((order) => order.id !== updatedOrder.id)
                }

                if (activeTab === 'history' && !isHistoryDelivery(updatedOrder)) {
                    return next.filter((order) => order.id !== updatedOrder.id)
                }

                return next
            })
        } catch (err) {
            console.error(err)
            setError(err instanceof Error ? err.message : 'Ошибка обновления статуса')
        } finally {
            setUpdatingOrderId(null)
        }
    }

    return (
        <System>
            <section className="relative z-0 w-full min-h-screen bg-gray-50 p-4">
                <div className="mx-auto max-w-[1700px] space-y-4">
                    <div className="rounded-2xl bg-white p-5 shadow-sm">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                                <div className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                                    Доставки
                                </div>

                                <h1 className="mt-2 text-2xl font-bold text-gray-900">
                                    Все доставки
                                </h1>

                                <p className="mt-1 text-sm text-gray-500">
                                    Текущие заказы, история доставок, состав заказа и история смены статусов.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={handleRefresh}
                                disabled={isRefreshing || isLoading}
                                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isRefreshing ? 'Обновляем...' : 'Обновить'}
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div className="rounded-xl bg-white p-4 shadow-sm">
                            <div className="text-xs text-gray-500">Текущие</div>
                            <div className="mt-1 text-2xl font-bold text-gray-900">
                                {currentOrders.length}
                            </div>
                        </div>

                        <div className="rounded-xl bg-white p-4 shadow-sm">
                            <div className="text-xs text-gray-500">История</div>
                            <div className="mt-1 text-2xl font-bold text-gray-900">
                                {historyOrders.length}
                            </div>
                        </div>

                        <div className="rounded-xl bg-white p-4 shadow-sm">
                            <div className="text-xs text-gray-500">Всего на экране</div>
                            <div className="mt-1 text-2xl font-bold text-gray-900">
                                {orders.length}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex rounded-xl bg-gray-100 p-1">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('current')}
                                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                                        activeTab === 'current'
                                            ? 'bg-white text-blue-700 shadow-sm'
                                            : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    Текущие
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setActiveTab('history')}
                                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                                        activeTab === 'history'
                                            ? 'bg-white text-blue-700 shadow-sm'
                                            : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    История
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setActiveTab('all')}
                                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                                        activeTab === 'all'
                                            ? 'bg-white text-blue-700 shadow-sm'
                                            : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    Все
                                </button>
                            </div>

                            <input
                                type="search"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Поиск: номер, клиент, телефон, адрес, курьер"
                                className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-1 focus:ring-blue-500 lg:max-w-[460px]"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    {isLoading ? (
                        <div className="rounded-2xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
                            Загружаем доставки...
                        </div>
                    ) : orders.length === 0 ? (
                        <div className="rounded-2xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
                            {activeTab === 'current'
                                ? 'Текущих доставок нет'
                                : activeTab === 'history'
                                    ? 'История доставок пока пустая'
                                    : 'Доставки не найдены'}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                            {orders.map((order) => {
                                const isOpened = openedOrderId === order.id

                                return (
                                    <article
                                        key={order.id}
                                        className="rounded-2xl bg-white p-5 shadow-sm"
                                    >
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            <div>
                                                <div className="text-lg font-bold text-gray-900">
                                                    {order.orderNumber}
                                                </div>

                                                <div className="mt-1 text-xs text-gray-500">
                                                    Создан: {formatDate(order.createdAt)}
                                                </div>
                                            </div>

                                            <div className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClass(order.status)}`}>
                                                {STATUS_LABELS[order.status]}
                                            </div>
                                        </div>

                                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                                            <div className="rounded-xl bg-gray-50 p-3">
                                                <div className="text-xs text-gray-500">
                                                    Клиент
                                                </div>

                                                <div className="mt-1 font-semibold text-gray-900">
                                                    {order.customerName}
                                                </div>

                                                <a
                                                    href={`tel:${order.customerPhone}`}
                                                    className="mt-1 block text-sm font-medium text-blue-600"
                                                >
                                                    {order.customerPhone}
                                                </a>
                                            </div>

                                            <div className="rounded-xl bg-gray-50 p-3">
                                                <div className="text-xs text-gray-500">
                                                    Оплата
                                                </div>

                                                <div className="mt-1 font-semibold text-gray-900">
                                                    {PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod}
                                                </div>

                                                <div className="mt-1 text-sm font-bold text-gray-900">
                                                    {formatMoney(order.total)}
                                                </div>
                                            </div>

                                            <div className="rounded-xl bg-gray-50 p-3">
                                                <div className="text-xs text-gray-500">
                                                    Курьер
                                                </div>

                                                <div className="mt-1 font-semibold text-gray-900">
                                                    {order.courierName || 'Не назначен'}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-3 rounded-xl bg-gray-50 p-3">
                                            <div className="text-xs text-gray-500">
                                                Адрес
                                            </div>

                                            <div className="mt-1 font-semibold text-gray-900">
                                                {order.address}
                                            </div>

                                            {order.apartment && (
                                                <div className="mt-1 text-xs text-gray-500">
                                                    Квартира/офис: {order.apartment}
                                                </div>
                                            )}
                                        </div>

                                        {order.comments && (
                                            <div className="mt-3 rounded-xl border border-orange-100 bg-orange-50 p-3 text-sm text-orange-800">
                                                <span className="font-semibold">
                                                    Комментарий:{' '}
                                                </span>
                                                {order.comments}
                                            </div>
                                        )}

                                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex flex-col gap-1 sm:w-[220px]">
                                                <label className="text-xs font-medium text-gray-500">
                                                    Статус доставки
                                                </label>

                                                <select
                                                    value={order.status}
                                                    disabled={updatingOrderId === order.id}
                                                    onChange={(event) =>
                                                        handleChangeStatus(
                                                            order.id,
                                                            event.target.value as OrderStatus,
                                                        )
                                                    }
                                                    className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                                                >
                                                    <option value="new">Новый</option>
                                                    <option value="accepted">Принят</option>
                                                    <option value="assembling">Собирается</option>
                                                    <option value="delivering">В доставке</option>
                                                    <option value="completed">Завершён</option>
                                                    <option value="cancelled">Отменён</option>
                                                </select>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setOpenedOrderId(isOpened ? null : order.id)
                                                }
                                                className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
                                            >
                                                {isOpened ? 'Скрыть детали' : 'Показать детали'}
                                            </button>
                                        </div>

                                        {isOpened && (
                                            <div className="mt-4 grid grid-cols-1 gap-4 border-t border-gray-100 pt-4 lg:grid-cols-2">
                                                <div>
                                                    <h3 className="text-sm font-semibold text-gray-900">
                                                        Состав заказа
                                                    </h3>

                                                    <div className="mt-3 space-y-2">
                                                        {order.items.length === 0 ? (
                                                            <div className="text-sm text-gray-500">
                                                                Товаров в заказе нет
                                                            </div>
                                                        ) : (
                                                            order.items.map((item) => (
                                                                <div
                                                                    key={item.id}
                                                                    className="flex items-start justify-between gap-3 rounded-xl bg-gray-50 p-3 text-sm"
                                                                >
                                                                    <div>
                                                                        <div className="font-semibold text-gray-900">
                                                                            {item.title}
                                                                        </div>

                                                                        <div className="mt-1 text-xs text-gray-500">
                                                                            {item.quantity} × {formatMoney(item.price)}
                                                                        </div>
                                                                    </div>

                                                                    <div className="shrink-0 font-bold text-gray-900">
                                                                        {formatMoney(item.total)}
                                                                    </div>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>

                                                <div>
                                                    <h3 className="text-sm font-semibold text-gray-900">
                                                        История статусов
                                                    </h3>

                                                    <div className="mt-3 space-y-2">
                                                        {order.history.length === 0 ? (
                                                            <div className="text-sm text-gray-500">
                                                                История статусов пока пустая
                                                            </div>
                                                        ) : (
                                                            order.history.map((historyItem) => (
                                                                <div
                                                                    key={historyItem.id}
                                                                    className="rounded-xl bg-gray-50 p-3 text-sm"
                                                                >
                                                                    <div className="font-semibold text-gray-900">
                                                                        {historyItem.oldStatus
                                                                            ? `${STATUS_LABELS[historyItem.oldStatus]} → `
                                                                            : ''}
                                                                        {STATUS_LABELS[historyItem.newStatus]}
                                                                    </div>

                                                                    <div className="mt-1 text-xs text-gray-500">
                                                                        {formatDate(historyItem.createdAt)}
                                                                    </div>

                                                                    <div className="mt-1 text-xs text-gray-400">
                                                                        Изменил:{' '}
                                                                        {historyItem.changedByName ||
                                                                            historyItem.changedByTelegramId ||
                                                                            '—'}
                                                                    </div>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </article>
                                )
                            })}
                        </div>
                    )}
                </div>
            </section>
        </System>
    )
}
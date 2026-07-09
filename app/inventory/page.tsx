'use client'

import * as React from 'react'
import System from '@/app/components/SystemShell'

type ProductUnit = 'piece' | 'weight'

type WarehouseLocation = {
    id: number
    name: string
    slug: string
    type: 'warehouse' | 'store'
}

type WarehouseUser = {
    login: string
    name: string
    role: string
}

type InventoryCategory = {
    category: string
    productsCount: number
    totalStock: number
    zeroStockCount: number
}

type InventoryProduct = {
    id: number
    name: string
    category: string
    barcode: string
    unit: ProductUnit
    stock: number
}

type CategoriesResponse = {
    location: WarehouseLocation
    user: WarehouseUser
    categories: InventoryCategory[]
}

type PrintDataResponse = {
    documentNumber: string
    createdAt: string
    location: WarehouseLocation
    user: WarehouseUser
    categories: string[]
    products: InventoryProduct[]
}

type ApiError = {
    message?: string
}

const LOCATION_STORAGE_KEY = 'warehouse_location_slug'
const USER_LOGIN_STORAGE_KEY = 'warehouse_auth_login'
const USER_NAME_STORAGE_KEY = 'warehouse_user_name'
const USER_ROLE_STORAGE_KEY = 'warehouse_user_role'

function buildWarehouseHeaders(): HeadersInit {
    if (typeof window === 'undefined') {
        return {}
    }

    return {
        'x-warehouse-location': window.localStorage.getItem(LOCATION_STORAGE_KEY) || '',
        'x-warehouse-user-login': window.localStorage.getItem(USER_LOGIN_STORAGE_KEY) || '',
        'x-warehouse-user-name': window.localStorage.getItem(USER_NAME_STORAGE_KEY) || '',
        'x-warehouse-user-role': window.localStorage.getItem(USER_ROLE_STORAGE_KEY) || '',
    }
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

function unitLabel(unit: ProductUnit): string {
    return unit === 'weight' ? 'кг' : 'шт.'
}

function formatQuantity(value: number, unit: ProductUnit): string {
    if (unit === 'weight') {
        return `${value.toFixed(3).replace(/\.?0+$/, '') || '0'} кг`
    }

    return `${Math.floor(value)} шт.`
}

function formatDate(value: string): string {
    if (!value) return '—'

    return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value))
}

function escapeHtml(value: string): string {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
}

function buildInventoryHtml(data: PrintDataResponse): string {
    const categoriesText = data.categories.join(', ')

    const rowsHtml = data.products.map((product, index) => `
        <tr>
            <td class="center">${index + 1}</td>
            <td>
                <strong>${escapeHtml(product.name)}</strong>
                <div class="muted">ID: ${product.id}</div>
            </td>
            <td>${escapeHtml(product.category || 'Без категории')}</td>
            <td class="mono">${escapeHtml(product.barcode || '-')}</td>
            <td class="center">${unitLabel(product.unit)}</td>
            <td class="right">${formatQuantity(product.stock, product.unit)}</td>
            <td class="empty"></td>
            <td class="empty"></td>
            <td class="empty comment"></td>
        </tr>
    `).join('')

    return `
        <!doctype html>
        <html lang="ru">
        <head>
            <meta charset="utf-8" />
            <title>Инвентаризация ${escapeHtml(data.documentNumber)}</title>
            <style>
                @page {
                    size: A4 landscape;
                    margin: 9mm;
                }

                * {
                    box-sizing: border-box;
                }

                body {
                    margin: 0;
                    font-family: Arial, sans-serif;
                    color: #111827;
                    font-size: 10.5px;
                }

                h1 {
                    margin: 0 0 8px;
                    text-align: center;
                    font-size: 18px;
                    letter-spacing: 0.02em;
                }

                .meta {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 6px 16px;
                    margin-bottom: 10px;
                    font-size: 11px;
                }

                .meta-box {
                    border-bottom: 1px solid #111827;
                    min-height: 18px;
                    padding: 2px 0 1px;
                }

                .meta-wide {
                    grid-column: 1 / -1;
                }

                table {
                    width: 100%;
                    border-collapse: collapse;
                    table-layout: fixed;
                }

                th,
                td {
                    border: 1px solid #111827;
                    padding: 4px;
                    vertical-align: top;
                    overflow-wrap: anywhere;
                }

                th {
                    background: #f3f4f6;
                    text-align: center;
                    font-weight: 700;
                }

                .center {
                    text-align: center;
                }

                .right {
                    text-align: right;
                }

                .mono {
                    font-family: Consolas, monospace;
                    font-size: 10px;
                }

                .muted {
                    margin-top: 2px;
                    color: #6b7280;
                    font-size: 9px;
                }

                .empty {
                    height: 24px;
                }

                .comment {
                    width: 160px;
                }

                .footer {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 24px;
                    margin-top: 24px;
                    font-size: 11px;
                }

                .signature {
                    border-top: 1px solid #111827;
                    padding-top: 5px;
                    text-align: center;
                }
            </style>
        </head>
        <body>
            <h1>ИНВЕНТАРИЗАЦИОННАЯ ВЕДОМОСТЬ № ${escapeHtml(data.documentNumber)}</h1>

            <div class="meta">
                <div>
                    <strong>Зона:</strong>
                    <div class="meta-box">${escapeHtml(data.location.name)}</div>
                </div>

                <div>
                    <strong>Дата формирования:</strong>
                    <div class="meta-box">${escapeHtml(formatDate(data.createdAt))}</div>
                </div>

                <div>
                    <strong>Сформировал:</strong>
                    <div class="meta-box">${escapeHtml(data.user.name || data.user.login || '-')}</div>
                </div>

                <div class="meta-wide">
                    <strong>Категории:</strong>
                    <div class="meta-box">${escapeHtml(categoriesText)}</div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="width: 34px;">№</th>
                        <th>Товар</th>
                        <th style="width: 150px;">Категория</th>
                        <th style="width: 120px;">Штрихкод</th>
                        <th style="width: 44px;">Ед.</th>
                        <th style="width: 86px;">Остаток<br />в системе</th>
                        <th style="width: 78px;">Факт</th>
                        <th style="width: 90px;">Расхождение</th>
                        <th style="width: 160px;">Комментарий</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>

            <div class="footer">
                <div class="signature">Проверил</div>
                <div class="signature">Ответственный</div>
                <div class="signature">Подпись</div>
            </div>
        </body>
        </html>
    `
}

function printHtml(html: string): void {
    const iframe = document.createElement('iframe')

    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'

    document.body.appendChild(iframe)

    const iframeWindow = iframe.contentWindow
    const iframeDocument = iframe.contentDocument || iframeWindow?.document

    if (!iframeWindow || !iframeDocument) {
        document.body.removeChild(iframe)
        alert('Не удалось открыть печать')
        return
    }

    iframeDocument.open()
    iframeDocument.write(html)
    iframeDocument.close()
    iframeWindow.focus()

    window.setTimeout(() => {
        iframeWindow.print()

        window.setTimeout(() => {
            document.body.removeChild(iframe)
        }, 1000)
    }, 300)
}

export default function Page() {
    const [categories, setCategories] = React.useState<InventoryCategory[]>([])
    const [selectedCategories, setSelectedCategories] = React.useState<string[]>([])
    const [search, setSearch] = React.useState('')
    const [location, setLocation] = React.useState<WarehouseLocation | null>(null)
    const [user, setUser] = React.useState<WarehouseUser | null>(null)
    const [isLoading, setIsLoading] = React.useState(true)
    const [isPrinting, setIsPrinting] = React.useState(false)
    const [error, setError] = React.useState('')
    const [notice, setNotice] = React.useState('')

    const filteredCategories = React.useMemo(() => {
        const query = search.trim().toLowerCase()

        if (!query) {
            return categories
        }

        return categories.filter(item => item.category.toLowerCase().includes(query))
    }, [categories, search])

    const selectedSet = React.useMemo(() => new Set(selectedCategories), [selectedCategories])

    const selectedProductsCount = React.useMemo(() => {
        return categories.reduce((sum, item) => {
            return selectedSet.has(item.category) ? sum + item.productsCount : sum
        }, 0)
    }, [categories, selectedSet])

    const loadCategories = React.useCallback(async () => {
        try {
            setIsLoading(true)
            setError('')

            const response = await fetch('/api/inventory/categories', {
                method: 'GET',
                cache: 'no-store',
                headers: buildWarehouseHeaders(),
            })

            const data = await readJsonSafe<CategoriesResponse | ApiError>(response)

            if (!response.ok) {
                throw new Error(getApiErrorMessage(data, 'Не удалось загрузить категории'))
            }

            const result = data as CategoriesResponse

            setCategories(Array.isArray(result.categories) ? result.categories : [])
            setLocation(result.location)
            setUser(result.user)
        } catch (error) {
            console.error(error)
            setError(error instanceof Error ? error.message : 'Не удалось загрузить категории')
        } finally {
            setIsLoading(false)
        }
    }, [])

    React.useEffect(() => {
        void loadCategories()
    }, [loadCategories])

    const toggleCategory = (category: string) => {
        setSelectedCategories(prev => {
            if (prev.includes(category)) {
                return prev.filter(item => item !== category)
            }

            return [...prev, category]
        })
        setNotice('')
    }

    const selectFilteredCategories = () => {
        setSelectedCategories(prev => {
            const next = new Set(prev)
            filteredCategories.forEach(item => next.add(item.category))
            return Array.from(next)
        })
        setNotice('')
    }

    const clearSelectedCategories = () => {
        setSelectedCategories([])
        setNotice('')
    }

    const printInventory = async () => {
        if (selectedCategories.length === 0) {
            setError('Выберите хотя бы одну категорию')
            return
        }

        try {
            setIsPrinting(true)
            setError('')
            setNotice('')

            const params = new URLSearchParams()
            selectedCategories.forEach(category => params.append('category', category))

            const response = await fetch(`/api/inventory/print-data?${params.toString()}`, {
                method: 'GET',
                cache: 'no-store',
                headers: buildWarehouseHeaders(),
            })

            const data = await readJsonSafe<PrintDataResponse | ApiError>(response)

            if (!response.ok) {
                throw new Error(getApiErrorMessage(data, 'Не удалось сформировать ведомость'))
            }

            const printData = data as PrintDataResponse

            if (!Array.isArray(printData.products) || printData.products.length === 0) {
                throw new Error('В выбранных категориях нет товаров')
            }

            printHtml(buildInventoryHtml(printData))
            setNotice(`Ведомость ${printData.documentNumber} отправлена на печать. История не сохраняется.`)
        } catch (error) {
            console.error(error)
            setError(error instanceof Error ? error.message : 'Не удалось распечатать инвентаризацию')
        } finally {
            setIsPrinting(false)
        }
    }

    return (
        <System>
            <section className="relative min-h-screen w-full bg-gray-50 p-4">
                <div className="mx-auto max-w-[1500px] space-y-4">
                    <div className="rounded-2xl bg-white p-5 shadow-sm">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                                <div className="inline-flex rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                                    Локальная ревизия
                                </div>

                                <h1 className="mt-2 text-2xl font-bold text-gray-900">
                                    Инвентаризация
                                </h1>

                                <p className="mt-1 max-w-3xl text-sm text-gray-500">
                                    Выберите категории текущей зоны, распечатайте ведомость и проведите ревизию на бумаге. История в базе не сохраняется.
                                </p>
                            </div>

                            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                                <div>
                                    <span className="text-gray-400">Зона:</span>{' '}
                                    <span className="font-bold text-gray-900">{location?.name || '—'}</span>
                                </div>
                                <div className="mt-1">
                                    <span className="text-gray-400">Пользователь:</span>{' '}
                                    <span className="font-bold text-gray-900">{user?.name || '—'}</span>
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                                {error}
                            </div>
                        )}

                        {notice && (
                            <div className="mt-4 rounded-xl border border-green-100 bg-green-50 p-3 text-sm text-green-700">
                                {notice}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
                        <div className="rounded-2xl bg-white p-5 shadow-sm">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900">
                                        Категории товаров
                                    </h2>

                                    <p className="mt-1 text-sm text-gray-500">
                                        Можно выбрать одну категорию или сразу несколько.
                                    </p>
                                </div>

                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <button
                                        type="button"
                                        onClick={selectFilteredCategories}
                                        disabled={filteredCategories.length === 0 || isLoading}
                                        className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-bold text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Выбрать найденные
                                    </button>

                                    <button
                                        type="button"
                                        onClick={clearSelectedCategories}
                                        disabled={selectedCategories.length === 0}
                                        className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Очистить выбор
                                    </button>
                                </div>
                            </div>

                            <input
                                type="search"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Поиск категории"
                                className="mt-4 h-11 w-full rounded-xl border border-gray-300 px-4 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                            />

                            {isLoading ? (
                                <div className="mt-5 rounded-xl bg-gray-50 p-8 text-center text-sm text-gray-500">
                                    Загружаю категории...
                                </div>
                            ) : filteredCategories.length === 0 ? (
                                <div className="mt-5 rounded-xl bg-gray-50 p-8 text-center text-sm text-gray-500">
                                    Категории не найдены
                                </div>
                            ) : (
                                <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                    {filteredCategories.map(category => {
                                        const checked = selectedSet.has(category.category)

                                        return (
                                            <button
                                                key={category.category}
                                                type="button"
                                                onClick={() => toggleCategory(category.category)}
                                                className={`rounded-2xl border p-4 text-left transition-colors ${
                                                    checked
                                                        ? 'border-violet-300 bg-violet-50 ring-2 ring-violet-100'
                                                        : 'border-gray-100 bg-gray-50 hover:border-violet-200 hover:bg-violet-50'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="truncate text-base font-bold text-gray-900">
                                                            {category.category}
                                                        </div>

                                                        <div className="mt-1 text-xs text-gray-500">
                                                            Товаров: {category.productsCount} · нулевых: {category.zeroStockCount}
                                                        </div>
                                                    </div>

                                                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                                                        checked
                                                            ? 'border-violet-500 bg-violet-600 text-white'
                                                            : 'border-gray-300 bg-white text-transparent'
                                                    }`}
                                                    >
                                                        ✓
                                                    </div>
                                                </div>

                                                <div className="mt-3 rounded-xl bg-white p-2 text-xs text-gray-500">
                                                    Суммарный остаток: <span className="font-bold text-gray-900">{category.totalStock}</span>
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        <aside className="rounded-2xl bg-white p-5 shadow-sm">
                            <h2 className="text-lg font-bold text-gray-900">
                                Печать ведомости
                            </h2>

                            <div className="mt-4 space-y-3 text-sm">
                                <div className="rounded-xl bg-gray-50 p-3">
                                    <div className="text-gray-400">Выбрано категорий</div>
                                    <div className="mt-1 text-2xl font-bold text-gray-900">
                                        {selectedCategories.length}
                                    </div>
                                </div>

                                <div className="rounded-xl bg-gray-50 p-3">
                                    <div className="text-gray-400">Товаров в ведомости</div>
                                    <div className="mt-1 text-2xl font-bold text-gray-900">
                                        {selectedProductsCount}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-violet-100 bg-violet-50 p-3 text-violet-800">
                                    Ведомость печатается сразу. В базе документ не сохраняется.
                                </div>
                            </div>

                            {selectedCategories.length > 0 && (
                                <div className="mt-4 max-h-56 overflow-y-auto rounded-xl border border-gray-100 p-3">
                                    <div className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
                                        Выбранные категории
                                    </div>

                                    <div className="space-y-1">
                                        {selectedCategories.map(category => (
                                            <div
                                                key={category}
                                                className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm"
                                            >
                                                <span className="truncate text-gray-700">{category}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleCategory(category)}
                                                    className="text-xs font-bold text-red-600 hover:text-red-700"
                                                >
                                                    убрать
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={() => void printInventory()}
                                disabled={isPrinting || selectedCategories.length === 0}
                                className="mt-5 w-full rounded-xl bg-violet-600 px-5 py-3 text-base font-bold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isPrinting ? 'Формирую...' : 'Распечатать ведомость'}
                            </button>

                            <button
                                type="button"
                                onClick={() => void loadCategories()}
                                disabled={isLoading || isPrinting}
                                className="mt-3 w-full rounded-xl border border-gray-300 bg-white px-5 py-3 text-base font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Обновить категории
                            </button>
                        </aside>
                    </div>
                </div>
            </section>
        </System>
    )
}

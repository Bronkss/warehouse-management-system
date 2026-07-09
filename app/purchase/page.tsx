'use client'

import * as React from 'react'
import System from '@/app/components/SystemShell'

type ProductUnit = 'piece' | 'weight'

type StoreLocation = {
    id: number
    name: string
    slug: string
}

type PurchaseLocationLine = {
    locationId: number
    locationName: string
    locationSlug: string
    stock: number
    suggestedQuantity: number
    estimatedPurchaseAmount: number
}

type PurchaseItem = {
    productId: number
    name: string
    category: string
    barcode: string
    unit: ProductUnit
    purchasePrice: number
    sellingPrice: number
    minStock: number
    totalSuggestedQuantity: number
    totalEstimatedPurchaseAmount: number
    locations: PurchaseLocationLine[]
}

type PurchaseResponse = {
    selectedLocation: string
    selectedCategory: string
    mode: string
    locations: StoreLocation[]
    categories: string[]
    summary: {
        productCount: number
        totalSuggestedQuantity: number
        totalEstimatedPurchaseAmount: number
    }
    items: PurchaseItem[]
}

type ApiError = {
    message?: string
}

const MODE_OPTIONS = [
    { value: 'below-min', label: 'Ниже минимума' },
    { value: 'zero', label: 'Нулевой остаток' },
    { value: 'all', label: 'Все товары' },
]

function money(value: number) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(Math.round(value || 0))
}

function quantity(value: number, unit?: ProductUnit) {
    return new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: 0,
        maximumFractionDigits: unit === 'weight' ? 3 : 0,
    }).format(value || 0)
}

function unitLabel(unit: ProductUnit) {
    return unit === 'weight' ? 'кг' : 'шт.'
}

function escapeHtml(value: string) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
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

function buildPurchasePrintHtml(data: PurchaseResponse) {
    const createdAt = new Date().toLocaleString('ru-RU')
    const locations = data.selectedLocation === 'all'
        ? 'Все торговые точки'
        : data.locations.find(location => location.slug === data.selectedLocation)?.name || data.selectedLocation
    const category = data.selectedCategory === 'all' ? 'Все категории' : data.selectedCategory
    const number = `PUR-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}`

    const rowsHtml = data.items.map((item, index) => {
        const locationsHtml = item.locations.map(line => {
            return `${escapeHtml(line.locationName)}: остаток ${quantity(line.stock, item.unit)} / минимум ${quantity(item.minStock, item.unit)} / докупить ${quantity(line.suggestedQuantity, item.unit)}`
        }).join('<br />')

        return `
            <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(item.name)}</td>
                <td>${escapeHtml(item.barcode || '-')}</td>
                <td>${escapeHtml(item.category || '-')}</td>
                <td>${unitLabel(item.unit)}</td>
                <td>${money(item.purchasePrice)}</td>
                <td>${locationsHtml}</td>
                <td>${quantity(item.totalSuggestedQuantity, item.unit)} ${unitLabel(item.unit)}</td>
                <td>${money(item.totalEstimatedPurchaseAmount)}</td>
            </tr>
        `
    }).join('')

    return `
        <!doctype html>
        <html lang="ru">
        <head>
            <meta charset="utf-8" />
            <title>Закупочный лист ${escapeHtml(number)}</title>
            <style>
                * { box-sizing: border-box; }
                body {
                    font-family: Arial, sans-serif;
                    color: #111827;
                    margin: 20px;
                    font-size: 11px;
                }
                h1 {
                    text-align: center;
                    font-size: 20px;
                    margin: 0 0 14px;
                }
                .meta {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 8px 24px;
                    margin-bottom: 14px;
                    font-size: 12px;
                }
                .line {
                    border-bottom: 1px solid #111827;
                    min-height: 20px;
                    padding-top: 4px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                }
                th,
                td {
                    border: 1px solid #111827;
                    padding: 5px;
                    text-align: left;
                    vertical-align: top;
                }
                th { background: #f3f4f6; }
                .total {
                    margin-top: 12px;
                    text-align: right;
                    font-size: 15px;
                    font-weight: 700;
                }
                .signature {
                    margin-top: 42px;
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 40px;
                }
                .signature div {
                    border-top: 1px solid #111827;
                    padding-top: 6px;
                    text-align: center;
                }
                @media print { body { margin: 10mm; } }
            </style>
        </head>
        <body>
            <h1>Закупочный лист № ${escapeHtml(number)}</h1>

            <div class="meta">
                <div>
                    <strong>Дата формирования:</strong>
                    <div class="line">${escapeHtml(createdAt)}</div>
                </div>
                <div>
                    <strong>Торговые точки:</strong>
                    <div class="line">${escapeHtml(locations)}</div>
                </div>
                <div>
                    <strong>Категории:</strong>
                    <div class="line">${escapeHtml(category)}</div>
                </div>
                <div>
                    <strong>Позиции:</strong>
                    <div class="line">${data.summary.productCount}</div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>№</th>
                        <th>Товар</th>
                        <th>Штрихкод</th>
                        <th>Категория</th>
                        <th>Ед.</th>
                        <th>Закупка</th>
                        <th>По точкам</th>
                        <th>Итого докупить</th>
                        <th>Сумма</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>

            <div class="total">
                Итого ориентировочно: ${money(data.summary.totalEstimatedPurchaseAmount)}
            </div>

            <div class="signature">
                <div>Сформировал</div>
                <div>Проверил</div>
            </div>
        </body>
        </html>
    `
}

function printHtml(html: string) {
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

    setTimeout(() => {
        iframeWindow.print()

        setTimeout(() => {
            document.body.removeChild(iframe)
        }, 1000)
    }, 300)
}

export default function Page() {
    const [locationSlug, setLocationSlug] = React.useState('all')
    const [category, setCategory] = React.useState('all')
    const [mode, setMode] = React.useState('below-min')
    const [data, setData] = React.useState<PurchaseResponse | null>(null)
    const [isLoading, setIsLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)

    const loadPurchase = React.useCallback(async () => {
        try {
            setIsLoading(true)
            setError(null)

            const params = new URLSearchParams()
            params.set('location', locationSlug)
            params.set('category', category)
            params.set('mode', mode)

            const response = await fetch(`/api/purchase?${params.toString()}`, {
                method: 'GET',
                cache: 'no-store',
            })

            const payload = await readJsonSafe<PurchaseResponse | ApiError>(response)

            if (!response.ok) {
                throw new Error(getApiErrorMessage(payload, 'Не удалось сформировать закупочный лист'))
            }

            setData(payload as PurchaseResponse)
        } catch (error) {
            console.error(error)
            setError(error instanceof Error ? error.message : 'Не удалось сформировать закупочный лист')
        } finally {
            setIsLoading(false)
        }
    }, [category, locationSlug, mode])

    React.useEffect(() => {
        void loadPurchase()
    }, [loadPurchase])

    const handlePrint = () => {
        if (!data) {
            return
        }

        printHtml(buildPurchasePrintHtml(data))
    }

    return (
        <System>
            <section className="w-full min-h-screen bg-gray-50 p-4">
                <div className="mx-auto max-w-[1700px] space-y-4">
                    <div className="rounded-2xl bg-white p-5 shadow-sm">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div>
                                <div className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                                    Главный склад
                                </div>

                                <h1 className="mt-2 text-2xl font-bold text-gray-900">
                                    Закупка
                                </h1>

                                <p className="mt-1 max-w-3xl text-sm text-gray-500">
                                    Система собирает остатки по торговым точкам и формирует список того, что нужно докупить по минимальным остаткам.
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => void loadPurchase()}
                                    disabled={isLoading}
                                    className="rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isLoading ? 'Обновляю...' : 'Обновить'}
                                </button>

                                <button
                                    type="button"
                                    onClick={handlePrint}
                                    disabled={!data || data.items.length === 0}
                                    className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Печать закупочного листа
                                </button>
                            </div>
                        </div>

                        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div>
                                <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">
                                    Точка
                                </label>
                                <select
                                    value={locationSlug}
                                    onChange={(event) => setLocationSlug(event.target.value)}
                                    className="h-11 w-full rounded-xl border border-gray-300 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                                >
                                    <option value="all">Все точки</option>
                                    {(data?.locations || []).map(location => (
                                        <option key={location.slug} value={location.slug}>
                                            {location.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">
                                    Категория
                                </label>
                                <select
                                    value={category}
                                    onChange={(event) => setCategory(event.target.value)}
                                    className="h-11 w-full rounded-xl border border-gray-300 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                                >
                                    <option value="all">Все категории</option>
                                    {(data?.categories || []).map(item => (
                                        <option key={item} value={item}>
                                            {item}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">
                                    Режим
                                </label>
                                <select
                                    value={mode}
                                    onChange={(event) => setMode(event.target.value)}
                                    className="h-11 w-full rounded-xl border border-gray-300 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                                >
                                    {MODE_OPTIONS.map(item => (
                                        <option key={item.value} value={item.value}>
                                            {item.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="rounded-xl bg-gray-50 p-3">
                                <div className="text-xs text-gray-500">Ориентировочная сумма</div>
                                <div className="mt-1 text-xl font-black text-gray-900">
                                    {money(data?.summary.totalEstimatedPurchaseAmount || 0)}
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                                {error}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div className="rounded-2xl bg-white p-4 shadow-sm">
                            <div className="text-xs font-bold uppercase tracking-wide text-gray-400">Позиций</div>
                            <div className="mt-2 text-2xl font-black text-gray-900">{data?.summary.productCount || 0}</div>
                        </div>

                        <div className="rounded-2xl bg-white p-4 shadow-sm">
                            <div className="text-xs font-bold uppercase tracking-wide text-gray-400">Единиц к закупке</div>
                            <div className="mt-2 text-2xl font-black text-gray-900">{quantity(data?.summary.totalSuggestedQuantity || 0)}</div>
                        </div>

                        <div className="rounded-2xl bg-white p-4 shadow-sm">
                            <div className="text-xs font-bold uppercase tracking-wide text-gray-400">Сумма закупки</div>
                            <div className="mt-2 text-2xl font-black text-emerald-700">{money(data?.summary.totalEstimatedPurchaseAmount || 0)}</div>
                        </div>
                    </div>

                    <div className="rounded-2xl bg-white p-5 shadow-sm">
                        <h2 className="text-lg font-bold text-gray-900">Закупочный лист</h2>

                        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100">
                            <table className="w-full min-w-[1200px] text-sm">
                                <thead className="bg-gray-100 text-gray-600">
                                <tr>
                                    <th className="w-12 p-3 text-left">№</th>
                                    <th className="p-3 text-left">Товар</th>
                                    <th className="p-3 text-left">Штрихкод</th>
                                    <th className="p-3 text-left">Категория</th>
                                    <th className="p-3 text-left">Ед.</th>
                                    <th className="p-3 text-right">Закупка</th>
                                    <th className="p-3 text-left">По точкам</th>
                                    <th className="p-3 text-right">Итого</th>
                                    <th className="p-3 text-right">Сумма</th>
                                </tr>
                                </thead>
                                <tbody>
                                {isLoading && (
                                    <tr>
                                        <td colSpan={9} className="p-8 text-center text-gray-500">
                                            Формирую закупочный лист...
                                        </td>
                                    </tr>
                                )}

                                {!isLoading && (!data || data.items.length === 0) && (
                                    <tr>
                                        <td colSpan={9} className="p-8 text-center text-gray-500">
                                            Сейчас закупать нечего по выбранным фильтрам
                                        </td>
                                    </tr>
                                )}

                                {!isLoading && (data?.items || []).map((item, index) => (
                                    <tr key={item.productId} className="border-t border-gray-100 align-top">
                                        <td className="p-3 text-gray-400">{index + 1}</td>
                                        <td className="p-3 font-bold text-gray-900">{item.name}</td>
                                        <td className="p-3 font-mono text-gray-500">{item.barcode || '—'}</td>
                                        <td className="p-3 text-gray-600">{item.category || '—'}</td>
                                        <td className="p-3 text-gray-600">{unitLabel(item.unit)}</td>
                                        <td className="p-3 text-right font-semibold">{money(item.purchasePrice)}</td>
                                        <td className="p-3">
                                            <div className="space-y-1">
                                                {item.locations.map(location => (
                                                    <div key={location.locationSlug} className="rounded-lg bg-gray-50 px-3 py-2">
                                                        <div className="font-semibold text-gray-900">{location.locationName}</div>
                                                        <div className="mt-0.5 text-xs text-gray-500">
                                                            Остаток: {quantity(location.stock, item.unit)} / минимум: {quantity(item.minStock, item.unit)} / докупить: <span className="font-bold text-emerald-700">{quantity(location.suggestedQuantity, item.unit)} {unitLabel(item.unit)}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="p-3 text-right font-black text-emerald-700">
                                            {quantity(item.totalSuggestedQuantity, item.unit)} {unitLabel(item.unit)}
                                        </td>
                                        <td className="p-3 text-right font-black text-gray-900">
                                            {money(item.totalEstimatedPurchaseAmount)}
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-3 text-xs text-gray-500">
                            Закупка считается по формуле: минимальный остаток товара минус текущий остаток в торговой точке. История не сохраняется — документ печатается и используется как рабочий закупочный лист.
                        </div>
                    </div>
                </div>
            </section>
        </System>
    )
}

'use client'

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'

type ProductUnit = 'piece' | 'weight'
type MovementMode = 'acceptance' | 'shipment'

type Product = {
    id: number
    name: string
    category: string
    barcode: string
    purchasePrice: number
    sellingPrice: number
    unit: ProductUnit
    stock: number
    minStock: number
    image: string
}

type MovementItem = {
    product: Product
    quantity: string
    category: string
    purchasePrice: string
    sellingPrice: string
}

type Props = {
    mode: MovementMode
}

type AddOverrides = {
    quantity?: string
    category?: string
    purchasePrice?: string
    sellingPrice?: string
}

const inputClass = 'w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-500'
const tableInputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-blue-500'
const buttonClass = 'rounded-xl px-6 py-3 text-base font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50'

function parseNumber(value: string | number) {
    return Number(String(value).replace(',', '.'))
}

function unitLabel(unit: ProductUnit) {
    return unit === 'weight' ? 'кг' : 'шт.'
}

function money(value: number) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        maximumFractionDigits: 2,
    }).format(value || 0)
}

function escapeHtml(value: string) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
}

function isBeerProduct(category: string, name?: string) {
    const text = `${category || ''} ${name || ''}`.toLowerCase()

    return text.includes('пиво') || text.includes('beer')
}

function calcSellingPrice(purchasePrice: string, category: string, name?: string) {
    const price = parseNumber(purchasePrice)

    if (!Number.isFinite(price) || price <= 0) {
        return ''
    }

    const markup = isBeerProduct(category, name) ? 1.35 : 1.3
    const result = Math.round(price * markup * 100) / 100

    return String(result)
}

function findBestProduct(products: Product[], query: string) {
    const normalizedQuery = query.trim().toLowerCase()

    const exact = products.find(product =>
        product.barcode === query.trim() ||
        product.name.toLowerCase() === normalizedQuery
    )

    return exact || products[0] || null
}

export default function ProductMovementForm({ mode }: Props) {
    const isShipment = mode === 'shipment'
    const isAcceptance = mode === 'acceptance'

    const [searchQuery, setSearchQuery] = useState('')
    const [suggestions, setSuggestions] = useState<Product[]>([])
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

    const [quantity, setQuantity] = useState('1')
    const [items, setItems] = useState<MovementItem[]>([])

    const [acceptanceCategory, setAcceptanceCategory] = useState('')
    const [acceptancePurchasePrice, setAcceptancePurchasePrice] = useState('')
    const [acceptanceSellingPrice, setAcceptanceSellingPrice] = useState('')

    const [isSearchLoading, setIsSearchLoading] = useState(false)
    const [isCommitLoading, setIsCommitLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [shipper, setShipper] = useState('')
    const [consignee, setConsignee] = useState('')
    const [driver, setDriver] = useState('')
    const [vehicle, setVehicle] = useState('')

    const searchProducts = async (query: string) => {
        const response = await fetch(`/api/products?search=${encodeURIComponent(query)}`)

        if (!response.ok) {
            throw new Error('Не удалось найти товары')
        }

        const data: Product[] = await response.json()

        return data
    }

    useEffect(() => {
        const query = searchQuery.trim()

        if (query.length < 2) {
            setSuggestions([])
            setSelectedProduct(null)
            return
        }

        const timeoutId = setTimeout(async () => {
            try {
                setIsSearchLoading(true)

                const data = await searchProducts(query)
                setSuggestions(data)

                const exactProduct = data.find(product =>
                    product.barcode === query ||
                    product.name.toLowerCase() === query.toLowerCase()
                )

                const bestProduct = exactProduct || data[0] || null

                if (bestProduct) {
                    setSelectedProduct(bestProduct)

                    if (isAcceptance) {
                        const category = String(bestProduct.category || '').trim()
                        const purchasePrice = String(bestProduct.purchasePrice || '')

                        setAcceptanceCategory(category)
                        setAcceptancePurchasePrice(purchasePrice)
                        setAcceptanceSellingPrice(
                            calcSellingPrice(purchasePrice, category, bestProduct.name)
                        )
                    }
                } else {
                    setSelectedProduct(null)

                    if (isAcceptance) {
                        setAcceptanceCategory('')
                        setAcceptancePurchasePrice('')
                        setAcceptanceSellingPrice('')
                    }
                }
            } catch (error) {
                console.error(error)
                setSuggestions([])
                setSelectedProduct(null)
            } finally {
                setIsSearchLoading(false)
            }
        }, 250)

        return () => clearTimeout(timeoutId)
    }, [searchQuery, isAcceptance])

    useEffect(() => {
        if (!isAcceptance) {
            return
        }

        setAcceptanceSellingPrice(
            calcSellingPrice(
                acceptancePurchasePrice,
                acceptanceCategory,
                selectedProduct?.name
            )
        )
    }, [isAcceptance, acceptancePurchasePrice, acceptanceCategory, selectedProduct])

    const resetDraftRow = () => {
        setSearchQuery('')
        setSuggestions([])
        setSelectedProduct(null)
        setQuantity('1')
        setAcceptanceCategory('')
        setAcceptancePurchasePrice('')
        setAcceptanceSellingPrice('')
    }

    const total = useMemo(() => {
        return items.reduce((sum, item) => {
            const qty = parseNumber(item.quantity)

            if (!Number.isFinite(qty)) {
                return sum
            }

            const price = isShipment
                ? parseNumber(item.sellingPrice)
                : parseNumber(item.purchasePrice)

            return sum + qty * price
        }, 0)
    }, [items, isShipment])

    const addProductToItems = (product: Product, overrides: AddOverrides = {}) => {
        const qty = parseNumber(overrides.quantity ?? quantity)

        if (!Number.isFinite(qty) || qty <= 0) {
            setError('Введите корректное количество')
            return
        }

        const existingItem = items.find(item => item.product.id === product.id)
        const existingQty = existingItem ? parseNumber(existingItem.quantity) : 0
        const newQty = existingQty + qty

        if (isShipment && newQty > Number(product.stock)) {
            setError(`Недостаточно остатка. Сейчас доступно: ${product.stock} ${unitLabel(product.unit)}`)
            return
        }

        const category = isAcceptance
            ? String(overrides.category ?? acceptanceCategory ?? product.category ?? '').trim()
            : product.category

        const purchasePrice = isAcceptance
            ? String(overrides.purchasePrice ?? acceptancePurchasePrice ?? product.purchasePrice ?? '')
            : String(product.purchasePrice || 0)

        const sellingPrice = isAcceptance
            ? String(
                overrides.sellingPrice ??
                acceptanceSellingPrice ??
                calcSellingPrice(purchasePrice, category, product.name) ??
                ''
            )
            : String(product.sellingPrice || 0)

        if (isAcceptance) {
            const purchasePriceNumber = parseNumber(purchasePrice)
            const sellingPriceNumber = parseNumber(sellingPrice)

            if (!category) {
                setError('Введите категорию')
                return
            }

            if (!Number.isFinite(purchasePriceNumber) || purchasePriceNumber <= 0) {
                setError('Введите корректную цену закупки')
                return
            }

            if (!Number.isFinite(sellingPriceNumber) || sellingPriceNumber <= 0) {
                setError('Цена продажи рассчитана некорректно')
                return
            }
        }

        const newItem: MovementItem = {
            product,
            quantity: String(qty),
            category,
            purchasePrice,
            sellingPrice,
        }

        setItems(prev => {
            const exists = prev.some(item => item.product.id === product.id)

            if (!exists) {
                return [...prev, newItem]
            }

            return prev.map(item => {
                if (item.product.id !== product.id) {
                    return item
                }

                return {
                    ...item,
                    quantity: String(parseNumber(item.quantity) + qty),
                    category: isAcceptance ? category || item.category : item.category,
                    purchasePrice: isAcceptance ? purchasePrice || item.purchasePrice : item.purchasePrice,
                    sellingPrice: isAcceptance ? sellingPrice || item.sellingPrice : item.sellingPrice,
                }
            })
        })

        setError(null)
        resetDraftRow()
    }

    const handleSuggestionClick = (product: Product) => {
        const category = isAcceptance
            ? String(acceptanceCategory || product.category || '').trim()
            : product.category

        /**
         * ВАЖНО:
         * цена закупки берётся из product.purchasePrice,
         * это поле приходит из БД purchase_price.
         * Цена продажи product.sellingPrice здесь не используется как закупочная.
         */
        const purchasePrice = isAcceptance
            ? String(acceptancePurchasePrice || product.purchasePrice || '')
            : String(product.purchasePrice || 0)

        const sellingPrice = isAcceptance
            ? calcSellingPrice(purchasePrice, category, product.name)
            : String(product.sellingPrice || 0)

        addProductToItems(product, {
            category,
            purchasePrice,
            sellingPrice,
        })
    }

    const handleAddFromDraft = async () => {
        const query = searchQuery.trim()

        if (query.length < 2) {
            setError('Введите название товара или штрихкод')
            return
        }

        try {
            setIsSearchLoading(true)

            let product = selectedProduct || findBestProduct(suggestions, query)

            if (!product) {
                const data = await searchProducts(query)
                setSuggestions(data)
                product = findBestProduct(data, query)
            }

            if (!product) {
                setError('Товар не найден')
                return
            }

            const category = isAcceptance
                ? String(acceptanceCategory || product.category || '').trim()
                : product.category

            /**
             * ВАЖНО:
             * если поле закупки уже заполнено, берём его;
             * иначе берём product.purchasePrice из БД purchase_price.
             */
            const purchasePrice = isAcceptance
                ? String(acceptancePurchasePrice || product.purchasePrice || '')
                : String(product.purchasePrice || 0)

            const sellingPrice = isAcceptance
                ? calcSellingPrice(purchasePrice, category, product.name)
                : String(product.sellingPrice || 0)

            addProductToItems(product, {
                category,
                purchasePrice,
                sellingPrice,
            })
        } catch (error) {
            console.error(error)
            setError(error instanceof Error ? error.message : 'Ошибка поиска товара')
        } finally {
            setIsSearchLoading(false)
        }
    }

    const handleDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault()
            void handleAddFromDraft()
        }
    }

    const updateItemQty = (productId: number, value: string) => {
        setItems(prev =>
            prev.map(item =>
                item.product.id === productId
                    ? { ...item, quantity: value }
                    : item
            )
        )
    }

    const updateItemCategory = (productId: number, category: string) => {
        setItems(prev =>
            prev.map(item =>
                item.product.id === productId
                    ? {
                        ...item,
                        category,
                        sellingPrice: calcSellingPrice(item.purchasePrice, category, item.product.name),
                    }
                    : item
            )
        )
    }

    const updateItemPurchasePrice = (productId: number, purchasePrice: string) => {
        setItems(prev =>
            prev.map(item =>
                item.product.id === productId
                    ? {
                        ...item,
                        purchasePrice,
                        sellingPrice: calcSellingPrice(purchasePrice, item.category, item.product.name),
                    }
                    : item
            )
        )
    }

    const removeItem = (productId: number) => {
        setItems(prev => prev.filter(item => item.product.id !== productId))
    }

    const validateItems = () => {
        if (items.length === 0) {
            return 'Добавьте хотя бы один товар'
        }

        for (const item of items) {
            const qty = parseNumber(item.quantity)

            if (!Number.isFinite(qty) || qty <= 0) {
                return `Некорректное количество у товара "${item.product.name}"`
            }

            if (isShipment && qty > Number(item.product.stock)) {
                return `Недостаточно остатка у товара "${item.product.name}". Доступно: ${item.product.stock} ${unitLabel(item.product.unit)}`
            }

            if (isAcceptance) {
                const purchasePrice = parseNumber(item.purchasePrice)
                const sellingPrice = parseNumber(item.sellingPrice)

                if (!item.category.trim()) {
                    return `Не указана категория у товара "${item.product.name}"`
                }

                if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) {
                    return `Некорректная цена закупки у товара "${item.product.name}"`
                }

                if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
                    return `Некорректная цена продажи у товара "${item.product.name}"`
                }
            }
        }

        return null
    }

    const buildWaybillHtml = (documentNumber: string, rows: MovementItem[]) => {
        const date = new Date().toLocaleDateString('ru-RU')

        const rowsHtml = rows.map((item, index) => {
            const qty = parseNumber(item.quantity)
            const price = parseNumber(item.sellingPrice)
            const sum = qty * price

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${escapeHtml(item.product.name)}</td>
                    <td>${escapeHtml(item.product.barcode || '-')}</td>
                    <td>${unitLabel(item.product.unit)}</td>
                    <td>${qty}</td>
                    <td>${money(price)}</td>
                    <td>${money(sum)}</td>
                </tr>
            `
        }).join('')

        return `
            <!doctype html>
            <html lang="ru">
            <head>
                <meta charset="utf-8" />
                <title>ТТН ${escapeHtml(documentNumber)}</title>
                <style>
                    * {
                        box-sizing: border-box;
                    }

                    body {
                        font-family: Arial, sans-serif;
                        color: #111827;
                        margin: 24px;
                        font-size: 13px;
                    }

                    h1 {
                        text-align: center;
                        font-size: 20px;
                        margin: 0 0 16px;
                    }

                    .meta {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 8px 24px;
                        margin-bottom: 20px;
                    }

                    .line {
                        border-bottom: 1px solid #111827;
                        min-height: 22px;
                        padding-top: 4px;
                    }

                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 12px;
                    }

                    th,
                    td {
                        border: 1px solid #111827;
                        padding: 6px;
                        text-align: left;
                    }

                    th {
                        background: #f3f4f6;
                    }

                    .total {
                        margin-top: 12px;
                        text-align: right;
                        font-size: 16px;
                        font-weight: 700;
                    }

                    .signatures {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 40px;
                        margin-top: 48px;
                    }

                    .signature-line {
                        border-top: 1px solid #111827;
                        padding-top: 6px;
                        text-align: center;
                    }

                    @media print {
                        body {
                            margin: 12mm;
                        }
                    }
                </style>
            </head>
            <body>
                <h1>Товарно-транспортная накладная № ${escapeHtml(documentNumber)}</h1>

                <div class="meta">
                    <div>
                        <strong>Дата:</strong>
                        <div class="line">${date}</div>
                    </div>

                    <div>
                        <strong>Номер документа:</strong>
                        <div class="line">${escapeHtml(documentNumber)}</div>
                    </div>

                    <div>
                        <strong>Грузоотправитель:</strong>
                        <div class="line">${escapeHtml(shipper || '-')}</div>
                    </div>

                    <div>
                        <strong>Грузополучатель:</strong>
                        <div class="line">${escapeHtml(consignee || '-')}</div>
                    </div>

                </div>

                <table>
                    <thead>
                        <tr>
                            <th>№</th>
                            <th>Товар</th>
                            <th>Штрихкод</th>
                            <th>Ед.</th>
                            <th>Кол-во</th>
                            <th>Цена</th>
                            <th>Сумма</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>

                <div class="total">
                    Итого: ${money(rows.reduce((sum, item) => sum + parseNumber(item.quantity) * parseNumber(item.sellingPrice), 0))}
                </div>

                <div class="signatures">
                    <div class="signature-line">Отпустил</div>
                    <div class="signature-line">Получил</div>
                </div>
            </body>
            </html>
        `
    }

    const printWaybill = (documentNumber: string, rows: MovementItem[]) => {
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
        iframeDocument.write(buildWaybillHtml(documentNumber, rows))
        iframeDocument.close()

        iframeWindow.focus()

        setTimeout(() => {
            iframeWindow.print()

            setTimeout(() => {
                document.body.removeChild(iframe)
            }, 1000)
        }, 300)
    }

    const handleCommit = async () => {
        const validationError = validateItems()

        if (validationError) {
            setError(validationError)
            return
        }

        const snapshot = [...items]

        try {
            setIsCommitLoading(true)
            setError(null)

            const response = await fetch(isShipment ? '/api/shipment' : '/api/acceptance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    items: snapshot.map(item => ({
                        productId: item.product.id,
                        quantity: parseNumber(item.quantity),
                        category: item.category,
                        purchasePrice: parseNumber(item.purchasePrice),
                        sellingPrice: parseNumber(item.sellingPrice),
                    })),
                }),
            })

            const text = await response.text()

            let data: any = null

            if (text) {
                try {
                    data = JSON.parse(text)
                } catch {
                    data = null
                }
            }

            if (!response.ok) {
                console.error('Operation API error:', {
                    status: response.status,
                    statusText: response.statusText,
                    data,
                    text,
                })

                throw new Error(
                    data?.message ||
                    text ||
                    `Ошибка API ${response.status}: ${response.statusText}`
                )
            }

            if (!data?.number) {
                throw new Error('API не вернул номер документа')
            }

            if (isShipment) {
                printWaybill(data.number, snapshot)
            } else {
                alert(`Приёмка применена. Номер: ${data.number}`)
            }

            setItems([])
            resetDraftRow()
        } catch (error) {
            console.error(error)

            setError(
                error instanceof Error
                    ? error.message
                    : 'Ошибка применения операции'
            )
        } finally {
            setIsCommitLoading(false)
        }
    }

    const previewProduct = selectedProduct || suggestions[0] || null
    const draftQty = parseNumber(quantity)

    const draftPrice = isShipment
        ? parseNumber(previewProduct?.sellingPrice || 0)
        : parseNumber(acceptancePurchasePrice || previewProduct?.purchasePrice || 0)

    const draftSum = Number.isFinite(draftQty) ? draftQty * draftPrice : 0

    return (
        <div className="w-full rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-bold text-gray-900">
                    {isShipment ? 'Отгрузки' : 'Ручная приёмка'}
                </h1>

                <p className="text-base text-gray-500">
                    Вводите товар прямо в первой строке таблицы. Нажмите Enter, чтобы добавить найденный товар.
                </p>
            </div>

            {isShipment && (
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <input
                        value={shipper}
                        onChange={(e) => setShipper(e.target.value)}
                        placeholder="Грузоотправитель"
                        className={inputClass}
                    />

                    <input
                        value={consignee}
                        onChange={(e) => setConsignee(e.target.value)}
                        placeholder="Грузополучатель"
                        className={inputClass}
                    />
                </div>
            )}

            {error && (
                <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4 text-base text-red-700">
                    {error}
                </div>
            )}

            <div className="mt-6 w-full overflow-x-auto rounded-2xl border border-gray-100">
                <table className="w-full min-w-[1650px] text-base">
                    <thead className="bg-gray-100 text-gray-700">
                    <tr>
                        <th className="w-[360px] p-4 text-left">Товар</th>
                        <th className="w-[190px] p-4 text-left">Штрихкод</th>
                        <th className="w-[150px] p-4 text-left">Остаток</th>

                        {isAcceptance && (
                            <>
                                <th className="w-[220px] p-4 text-left">Категория</th>
                                <th className="w-[160px] p-4 text-left">Закупка</th>
                                <th className="w-[160px] p-4 text-left">Продажа</th>
                            </>
                        )}

                        <th className="w-[170px] p-4 text-left">Количество</th>
                        <th className="w-[170px] p-4 text-left">{isShipment ? 'Сумма' : 'Сумма закупки'}</th>
                        <th className="w-[130px] p-4 text-right">Действие</th>
                    </tr>
                    </thead>

                    <tbody>
                    <tr className="border-t border-blue-100 bg-blue-50 align-top">
                        <td className="relative p-4">
                            <input
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value)
                                    setSelectedProduct(null)
                                }}
                                onKeyDown={handleDraftKeyDown}
                                placeholder="Название или штрихкод, затем Enter"
                                className={tableInputClass}
                            />

                            <div className="mt-2 text-sm text-blue-700">
                                {isSearchLoading
                                    ? 'Поиск...'
                                    : previewProduct
                                        ? `Найден: ${previewProduct.name}`
                                        : 'Enter добавит первый найденный товар'}
                            </div>

                            {(suggestions.length > 0 || isSearchLoading) && searchQuery.trim().length >= 2 && (
                                <div className="absolute left-4 right-4 top-[78px] z-30 max-h-80 overflow-auto rounded-xl border border-gray-200 bg-white shadow-xl">
                                    {isSearchLoading && (
                                        <div className="px-4 py-3 text-base text-gray-500">
                                            Поиск...
                                        </div>
                                    )}

                                    {!isSearchLoading && suggestions.map(product => (
                                        <button
                                            key={product.id}
                                            type="button"
                                            onMouseDown={(e) => {
                                                e.preventDefault()
                                                handleSuggestionClick(product)
                                            }}
                                            className="flex w-full items-center justify-between gap-4 border-b border-gray-100 px-4 py-4 text-left text-base hover:bg-blue-50"
                                        >
                                            <span>
                                                <span className="font-semibold text-gray-900">
                                                    {product.name}
                                                </span>

                                                <span className="mt-1 block text-sm text-gray-500">
                                                    {product.barcode || 'Без штрихкода'} · {product.category}
                                                </span>
                                            </span>

                                            <span className="whitespace-nowrap text-sm text-gray-500">
                                                Остаток: {product.stock} {unitLabel(product.unit)}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </td>

                        <td className="p-4 text-gray-600">
                            {previewProduct?.barcode || '—'}
                        </td>

                        <td className="p-4 text-gray-600">
                            {previewProduct
                                ? `${previewProduct.stock} ${unitLabel(previewProduct.unit)}`
                                : '—'}
                        </td>

                        {isAcceptance && (
                            <>
                                <td className="p-4">
                                    <input
                                        value={acceptanceCategory}
                                        onChange={(e) => setAcceptanceCategory(e.target.value)}
                                        onKeyDown={handleDraftKeyDown}
                                        placeholder="Категория"
                                        className={tableInputClass}
                                    />
                                </td>

                                <td className="p-4">
                                    <input
                                        value={acceptancePurchasePrice}
                                        onChange={(e) => setAcceptancePurchasePrice(e.target.value)}
                                        onKeyDown={handleDraftKeyDown}
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="Закупка"
                                        className={tableInputClass}
                                    />

                                    <div className="mt-2 text-xs text-gray-500">
                                        Из поля БД purchase_price
                                    </div>
                                </td>

                                <td className="p-4">
                                    <input
                                        value={acceptanceSellingPrice}
                                        readOnly
                                        type="number"
                                        placeholder="Авто"
                                        className={`${tableInputClass} bg-gray-100`}
                                    />

                                    <div className="mt-2 text-sm text-gray-500">
                                        {isBeerProduct(acceptanceCategory, previewProduct?.name) ? '+35%' : '+30%'}
                                    </div>
                                </td>
                            </>
                        )}

                        <td className="p-4">
                            <input
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                onKeyDown={handleDraftKeyDown}
                                type="number"
                                min="0"
                                step="0.001"
                                placeholder="Кол-во"
                                className={tableInputClass}
                            />
                        </td>

                        <td className="p-4 font-semibold text-gray-900">
                            {money(draftSum)}
                        </td>

                        <td className="p-4 text-right">
                            <span className="rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-700">
                                Enter ↵
                            </span>
                        </td>
                    </tr>

                    {items.length === 0 && (
                        <tr>
                            <td colSpan={isAcceptance ? 9 : 7} className="p-8 text-center text-base text-gray-500">
                                Товары пока не добавлены
                            </td>
                        </tr>
                    )}

                    {items.map(item => {
                        const qty = parseNumber(item.quantity)
                        const price = isShipment
                            ? parseNumber(item.sellingPrice)
                            : parseNumber(item.purchasePrice)

                        return (
                            <tr key={item.product.id} className="border-t border-gray-100">
                                <td className="p-4 font-semibold text-gray-900">
                                    {item.product.name}
                                </td>

                                <td className="p-4 text-gray-500">
                                    {item.product.barcode || '-'}
                                </td>

                                <td className="p-4 text-gray-500">
                                    {item.product.stock} {unitLabel(item.product.unit)}
                                </td>

                                {isAcceptance && (
                                    <>
                                        <td className="p-4">
                                            <input
                                                value={item.category}
                                                onChange={(e) => updateItemCategory(item.product.id, e.target.value)}
                                                className={tableInputClass}
                                            />
                                        </td>

                                        <td className="p-4">
                                            <input
                                                value={item.purchasePrice}
                                                onChange={(e) => updateItemPurchasePrice(item.product.id, e.target.value)}
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                className={tableInputClass}
                                            />
                                        </td>

                                        <td className="p-4">
                                            <input
                                                value={item.sellingPrice}
                                                readOnly
                                                type="number"
                                                className={`${tableInputClass} bg-gray-100`}
                                            />
                                        </td>
                                    </>
                                )}

                                <td className="p-4">
                                    <input
                                        value={item.quantity}
                                        onChange={(e) => updateItemQty(item.product.id, e.target.value)}
                                        type="number"
                                        min="0"
                                        step="0.001"
                                        className={tableInputClass}
                                    />

                                    <span className="ml-2 text-gray-500">
                                        {unitLabel(item.product.unit)}
                                    </span>
                                </td>

                                <td className="p-4 font-semibold">
                                    {Number.isFinite(qty) ? money(qty * price) : money(0)}
                                </td>

                                <td className="p-4 text-right">
                                    <button
                                        type="button"
                                        onClick={() => removeItem(item.product.id)}
                                        className="font-medium text-red-600 hover:text-red-700"
                                    >
                                        Удалить
                                    </button>
                                </td>
                            </tr>
                        )
                    })}
                    </tbody>
                </table>
            </div>

            <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="text-2xl font-bold text-gray-900">
                    Итого: {money(total)}
                </div>

                <button
                    type="button"
                    onClick={handleCommit}
                    disabled={isCommitLoading || items.length === 0}
                    className={`${buttonClass} ${isShipment ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                    {isCommitLoading
                        ? 'Применение...'
                        : isShipment
                            ? 'Списать и распечатать ТТН'
                            : 'Добавить на остаток'}
                </button>
            </div>
        </div>
    )
}
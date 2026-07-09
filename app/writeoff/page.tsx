'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import System from '@/app/components/SystemShell'

type ProductUnit = 'piece' | 'weight'

type Product = {
    id: number
    name: string
    category: string
    barcode: string
    purchasePrice?: number | string
    purchase_price?: number | string
    sellingPrice?: number | string
    selling_price?: number | string
    unit: ProductUnit
    stock: number | string
    minStock?: number | string
    min_stock?: number | string
    image?: string
}

type ProductsApiResponse = {
    items: Product[]
    nextCursor: number | null
    hasMore: boolean
    limit: number
}

type WriteoffReason = {
    value: string
    label: string
}

type WriteoffItem = {
    product: Product
    quantity: string
    category: string
    purchasePrice: string
    sellingPrice: string
}

type WriteoffHistoryItem = {
    id: number
    number: string
    reason: string
    reasonLabel: string
    responsible: string
    comment: string
    totalRows: number
    totalQuantity: number
    totalPurchaseAmount: number
    totalSellingAmount: number
    status: string
    createdAt: string
    updatedAt: string
}

type WriteoffDetailRow = {
    writeoffItemId?: number | null
    productId: number | null
    rowId: string
    rowNumber: number
    name: string
    category: string
    barcode: string
    unit: ProductUnit
    quantity: string
    purchasePrice: string
    sellingPrice: string
    previousStock: number | null
    newStock: number | null
    result: string
    error: string | null
}

type WriteoffDetail = WriteoffHistoryItem & {
    rows: WriteoffDetailRow[]
}

type WriteoffDraftState = {
    reason: string
    responsible: string
    comment: string
    searchQuery: string
    items: WriteoffItem[]
    historySearch: string
}

type ApiError = {
    message?: string
}

const WRITEOFF_DRAFT_KEY = 'warehouse.writeoff.page.draft.v1'
const AUTH_LOCATION_SLUG_KEY = 'warehouse_location_slug'

function getCurrentLocationSlug() {
    if (typeof window === 'undefined') {
        return 'tochka'
    }

    return localStorage.getItem(AUTH_LOCATION_SLUG_KEY) || 'tochka'
}

function getWriteoffDraftKey() {
    return `${WRITEOFF_DRAFT_KEY}:${getCurrentLocationSlug()}`
}

const WRITEOFF_REASONS: WriteoffReason[] = [
    { value: 'expired', label: 'Истечение срока годности' },
    { value: 'lost_presentation', label: 'Потеря товарного вида' },
    { value: 'damaged_packaging', label: 'Повреждение упаковки' },
    { value: 'spoilage', label: 'Порча товара' },
    { value: 'broken', label: 'Бой / поломка' },
    { value: 'inventory_shortage', label: 'Недостача по инвентаризации' },
    { value: 'stock_correction', label: 'Корректировка остатков' },
    { value: 'loss_or_theft', label: 'Утеря / кража' },
    { value: 'supplier_defect', label: 'Брак поставщика' },
    { value: 'transport_damage', label: 'Повреждение при перевозке' },
    { value: 'sample_or_demo', label: 'Образец / тест / демонстрация' },
    { value: 'internal_use', label: 'Внутреннее использование' },
    { value: 'other', label: 'Другое' },
]

const inputClass = 'w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-500'
const tableInputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-blue-500'
const quantityTableInputClass = 'w-28 shrink-0 rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-blue-500'
const smallInputClass = 'h-9 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-1 focus:ring-blue-500'
const buttonClass = 'rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'

function parseNumber(value: unknown): number {
    const parsed = Number(String(value ?? '0').replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : 0
}

function getPurchasePrice(product: Product): number {
    return parseNumber(product.purchasePrice ?? product.purchase_price)
}

function getSellingPrice(product: Product): number {
    return parseNumber(product.sellingPrice ?? product.selling_price)
}

function getStock(product: Product): number {
    return parseNumber(product.stock)
}

function unitLabel(unit: ProductUnit) {
    return unit === 'weight' ? 'кг' : 'шт.'
}

function isWeightUnit(unit: ProductUnit) {
    return unit === 'weight'
}

function normalizeQuantityInput(value: string, unit: ProductUnit) {
    if (isWeightUnit(unit)) {
        const normalized = value
            .replace(',', '.')
            .replace(/\s/g, '')
            .replace(/[^\d.]/g, '')

        const [integerPart, ...decimalParts] = normalized.split('.')
        const decimalPart = decimalParts.join('').slice(0, 3)

        if (normalized.includes('.')) {
            return `${integerPart}.${decimalPart}`
        }

        return integerPart
    }

    return value
        .replace(',', '.')
        .split('.')[0]
        .replace(/\D/g, '')
}

function roundQuantityForUnit(value: unknown, unit: ProductUnit) {
    const quantity = parseNumber(value)

    if (unit === 'weight') {
        return Math.round((quantity + Number.EPSILON) * 1000) / 1000
    }

    return Math.floor(quantity)
}

function validateQuantityForUnit(value: string | number, unit: ProductUnit) {
    const rawValue = String(value ?? '').trim().replace(',', '.')

    if (!rawValue) {
        return 'Введите количество'
    }

    if (unit === 'weight') {
        if (!/^\d+(\.\d{1,3})?$/.test(rawValue)) {
            return 'Для весового товара количество должно быть до 3 знаков после запятой'
        }
    } else if (!/^\d+$/.test(rawValue)) {
        return 'Для штучного товара количество должно быть целым числом'
    }

    const quantity = parseNumber(rawValue)

    if (!Number.isFinite(quantity) || quantity <= 0) {
        return 'Введите корректное количество'
    }

    return null
}

function getQuantityInputProps(unit: ProductUnit) {
    return unit === 'weight'
        ? {
            type: 'number' as const,
            inputMode: 'decimal' as const,
            min: '0.001',
            step: '0.001',
            placeholder: '0.350',
        }
        : {
            type: 'number' as const,
            inputMode: 'numeric' as const,
            min: '1',
            step: '1',
            placeholder: '1',
        }
}

function money(value: number) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(Math.round(value || 0))
}

function formatQuantity(value: number, unit: ProductUnit) {
    if (unit === 'weight') {
        return `${value.toFixed(3).replace(/\.?0+$/, '')} кг`
    }

    return `${Math.floor(value)} шт.`
}

function formatDate(value: string) {
    if (!value) return '—'
    return new Date(value).toLocaleString('ru-RU')
}

function escapeHtml(value: string) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
}

function normalizeProduct(product: Product): Product {
    return {
        ...product,
        category: product.category || 'Без категории',
        barcode: product.barcode || '',
        unit: product.unit === 'weight' ? 'weight' : 'piece',
        stock: getStock(product),
        purchasePrice: getPurchasePrice(product),
        sellingPrice: getSellingPrice(product),
    }
}

function normalizeProductsResponse(data: unknown): Product[] {
    if (Array.isArray(data)) {
        return data.map(product => normalizeProduct(product as Product))
    }

    if (
        typeof data === 'object' &&
        data !== null &&
        'items' in data &&
        Array.isArray((data as ProductsApiResponse).items)
    ) {
        return (data as ProductsApiResponse).items.map(normalizeProduct)
    }

    return []
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

async function searchProducts(query: string, signal?: AbortSignal): Promise<Product[]> {
    const params = new URLSearchParams()

    params.set('search', query)
    params.set('limit', '10')

    const response = await fetch(`/api/products?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
        signal,
    })

    const data = await readJsonSafe<ProductsApiResponse | Product[] | ApiError>(response)

    if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Не удалось найти товары'))
    }

    return normalizeProductsResponse(data)
}

function findBestProduct(products: Product[], query: string) {
    const normalizedQuery = query.trim().toLowerCase()
    const rawQuery = query.trim()

    const exact = products.find(product =>
        String(product.barcode || '').trim() === rawQuery ||
        String(product.name || '').trim().toLowerCase() === normalizedQuery
    )

    return exact || products[0] || null
}

function getReasonLabel(reason: string) {
    return WRITEOFF_REASONS.find(item => item.value === reason)?.label || 'Другое'
}

function renumberRows(rows: WriteoffDetailRow[]) {
    return rows.map((row, index) => ({ ...row, rowNumber: index + 1 }))
}

function buildWriteoffActHtml(data: WriteoffDetail) {
    const date = data.createdAt ? new Date(data.createdAt).toLocaleDateString('ru-RU') : new Date().toLocaleDateString('ru-RU')

    const rowsHtml = data.rows.map((item, index) => {
        const qty = parseNumber(item.quantity)
        const purchasePrice = parseNumber(item.purchasePrice)
        const sellingPrice = parseNumber(item.sellingPrice)

        return `
            <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(item.name)}</td>
                <td>${escapeHtml(item.barcode || '-')}</td>
                <td>${escapeHtml(item.category || '-')}</td>
                <td>${unitLabel(item.unit)}</td>
                <td>${qty}</td>
                <td>${money(purchasePrice)}</td>
                <td>${money(qty * purchasePrice)}</td>
                <td>${money(sellingPrice)}</td>
                <td>${money(qty * sellingPrice)}</td>
            </tr>
        `
    }).join('')

    const totalPurchase = data.rows.reduce((sum, item) => sum + parseNumber(item.quantity) * parseNumber(item.purchasePrice), 0)
    const totalSelling = data.rows.reduce((sum, item) => sum + parseNumber(item.quantity) * parseNumber(item.sellingPrice), 0)

    return `
        <!doctype html>
        <html lang="ru">
        <head>
            <meta charset="utf-8" />
            <title>Акт списания ${escapeHtml(data.number)}</title>
            <style>
                * { box-sizing: border-box; }
                body {
                    font-family: Arial, sans-serif;
                    color: #111827;
                    margin: 24px;
                    font-size: 12px;
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
                    margin-bottom: 18px;
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
                    padding: 5px;
                    text-align: left;
                    vertical-align: top;
                }
                th { background: #f3f4f6; }
                .totals {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 16px;
                    margin-top: 14px;
                    font-size: 15px;
                    font-weight: 700;
                }
                .total-box {
                    border: 1px solid #111827;
                    padding: 8px;
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
                @media print { body { margin: 12mm; } }
            </style>
        </head>
        <body>
            <h1>Акт списания товара № ${escapeHtml(data.number)}</h1>

            <div class="meta">
                <div>
                    <strong>Дата:</strong>
                    <div class="line">${date}</div>
                </div>
                <div>
                    <strong>Номер документа:</strong>
                    <div class="line">${escapeHtml(data.number)}</div>
                </div>
                <div>
                    <strong>Причина списания:</strong>
                    <div class="line">${escapeHtml(data.reasonLabel || getReasonLabel(data.reason))}</div>
                </div>
                <div>
                    <strong>Ответственный:</strong>
                    <div class="line">${escapeHtml(data.responsible || '-')}</div>
                </div>
                <div style="grid-column: 1 / -1;">
                    <strong>Комментарий:</strong>
                    <div class="line">${escapeHtml(data.comment || '-')}</div>
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
                        <th>Кол-во</th>
                        <th>Закупка</th>
                        <th>Сумма закупки</th>
                        <th>Продажа</th>
                        <th>Сумма продажи</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>

            <div class="totals">
                <div class="total-box">Итого по закупке: ${money(totalPurchase)}</div>
                <div class="total-box">Итого по продаже: ${money(totalSelling)}</div>
            </div>

            <div class="signatures">
                <div class="signature-line">Ответственный за списание</div>
                <div class="signature-line">Проверил</div>
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

function printWriteoffAct(data: WriteoffDetail) {
    printHtml(buildWriteoffActHtml(data))
}

export default function Page() {
    const [reason, setReason] = useState('expired')
    const [responsible, setResponsible] = useState('')
    const [comment, setComment] = useState('')

    const [searchQuery, setSearchQuery] = useState('')
    const [suggestions, setSuggestions] = useState<Product[]>([])
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
    const [items, setItems] = useState<WriteoffItem[]>([])

    const [quantityModalProduct, setQuantityModalProduct] = useState<Product | null>(null)
    const [quantityModalQuantity, setQuantityModalQuantity] = useState('1')

    const [history, setHistory] = useState<WriteoffHistoryItem[]>([])
    const [historySearch, setHistorySearch] = useState('')
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
    const [selectedWriteoff, setSelectedWriteoff] = useState<WriteoffDetail | null>(null)
    const [modalRows, setModalRows] = useState<WriteoffDetailRow[]>([])
    const [modalReason, setModalReason] = useState('expired')
    const [modalResponsible, setModalResponsible] = useState('')
    const [modalComment, setModalComment] = useState('')

    const [isDraftHydrated, setIsDraftHydrated] = useState(false)
    const [isSearchLoading, setIsSearchLoading] = useState(false)
    const [isCommitLoading, setIsCommitLoading] = useState(false)
    const [isHistoryLoading, setIsHistoryLoading] = useState(false)
    const [isDetailLoading, setIsDetailLoading] = useState(false)
    const [isModalSaving, setIsModalSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [modalError, setModalError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)

    const scanInputRef = useRef<HTMLInputElement>(null)
    const quantityModalInputRef = useRef<HTMLInputElement>(null)

    const selectedReasonLabel = getReasonLabel(reason)
    const previewProduct = selectedProduct || suggestions[0] || null

    const total = useMemo(() => {
        return items.reduce((sum, item) => {
            return sum + parseNumber(item.quantity) * parseNumber(item.sellingPrice)
        }, 0)
    }, [items])

    const totalPurchase = useMemo(() => {
        return items.reduce((sum, item) => {
            return sum + parseNumber(item.quantity) * parseNumber(item.purchasePrice)
        }, 0)
    }, [items])

    const filteredHistory = useMemo(() => {
        const query = historySearch.trim().toLowerCase()

        if (!query) return history

        return history.filter(item => {
            const searchable = [
                item.number,
                item.reasonLabel,
                item.responsible,
                item.comment,
                item.status,
                formatDate(item.createdAt),
            ].join(' ').toLowerCase()

            return searchable.includes(query)
        })
    }, [history, historySearch])

    const modalSummary = useMemo(() => {
        return {
            totalRows: modalRows.length,
            totalQuantity: modalRows.reduce((sum, row) => sum + parseNumber(row.quantity), 0),
            totalPurchaseAmount: modalRows.reduce((sum, row) => sum + parseNumber(row.quantity) * parseNumber(row.purchasePrice), 0),
            totalSellingAmount: modalRows.reduce((sum, row) => sum + parseNumber(row.quantity) * parseNumber(row.sellingPrice), 0),
        }
    }, [modalRows])

    const loadHistory = async () => {
        try {
            setIsHistoryLoading(true)
            setError(null)

            const response = await fetch('/api/writeoff/history', {
                method: 'GET',
                cache: 'no-store',
            })

            const data = await readJsonSafe<WriteoffHistoryItem[] | ApiError>(response)

            if (!response.ok) {
                throw new Error(getApiErrorMessage(data, 'Не удалось загрузить историю списаний'))
            }

            setHistory(Array.isArray(data) ? data : [])
        } catch (error) {
            console.error(error)
            setError(error instanceof Error ? error.message : 'Не удалось загрузить историю списаний')
        } finally {
            setIsHistoryLoading(false)
        }
    }

    useEffect(() => {
        let isMounted = true

        const restoreDraft = async () => {
            try {
                const rawDraft = localStorage.getItem(getWriteoffDraftKey())

                if (!isMounted) return

                if (rawDraft) {
                    const draft = JSON.parse(rawDraft) as Partial<WriteoffDraftState>

                    setReason(draft.reason || 'expired')
                    setResponsible(draft.responsible || '')
                    setComment(draft.comment || '')
                    setSearchQuery(draft.searchQuery || '')
                    setItems(Array.isArray(draft.items) ? draft.items.map(item => ({
                        ...item,
                        product: normalizeProduct(item.product),
                    })) : [])
                    setHistorySearch(draft.historySearch || '')
                }
            } catch (error) {
                console.error(error)
            } finally {
                if (isMounted) {
                    setIsDraftHydrated(true)
                }
            }
        }

        void restoreDraft()
        void loadHistory()

        return () => {
            isMounted = false
        }
    }, [])

    useEffect(() => {
        if (!isDraftHydrated) return

        localStorage.setItem(getWriteoffDraftKey(), JSON.stringify({
            reason,
            responsible,
            comment,
            searchQuery,
            items,
            historySearch,
        } satisfies WriteoffDraftState))
    }, [comment, historySearch, isDraftHydrated, items, reason, responsible, searchQuery])

    useEffect(() => {
        const query = searchQuery.trim()

        if (query.length < 2) {
            setSuggestions([])
            setSelectedProduct(null)
            return
        }

        const controller = new AbortController()

        const timeoutId = setTimeout(async () => {
            try {
                setIsSearchLoading(true)
                setError(null)

                const products = await searchProducts(query, controller.signal)

                setSuggestions(products)
                setSelectedProduct(findBestProduct(products, query))
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') return

                console.error(error)
                setSuggestions([])
                setSelectedProduct(null)
                setError(error instanceof Error ? error.message : 'Ошибка поиска товара')
            } finally {
                if (!controller.signal.aborted) {
                    setIsSearchLoading(false)
                }
            }
        }, 220)

        return () => {
            clearTimeout(timeoutId)
            controller.abort()
        }
    }, [searchQuery])

    useEffect(() => {
        if (!quantityModalProduct) return

        window.setTimeout(() => {
            quantityModalInputRef.current?.focus()
            quantityModalInputRef.current?.select()
        }, 0)
    }, [quantityModalProduct])

    useEffect(() => {
        const hasOpenModal = Boolean(quantityModalProduct) || isHistoryModalOpen || isDetailModalOpen

        if (!hasOpenModal) {
            return
        }

        const bodyOverflow = document.body.style.overflow
        const htmlOverflow = document.documentElement.style.overflow

        document.body.style.overflow = 'hidden'
        document.documentElement.style.overflow = 'hidden'

        return () => {
            document.body.style.overflow = bodyOverflow
            document.documentElement.style.overflow = htmlOverflow
        }
    }, [isDetailModalOpen, isHistoryModalOpen, quantityModalProduct])

    const resetScan = () => {
        setSearchQuery('')
        setSuggestions([])
        setSelectedProduct(null)

        requestAnimationFrame(() => {
            scanInputRef.current?.focus()
        })
    }

    const openQuantityModal = (product: Product) => {
        const safeProduct = normalizeProduct(product)

        setQuantityModalProduct(safeProduct)
        setQuantityModalQuantity(safeProduct.unit === 'weight' ? '0.001' : '1')
        setError(null)
        setNotice(null)
    }

    const handleSuggestionClick = (product: Product) => {
        openQuantityModal(product)
    }

    const handleSearchEnter = async () => {
        const query = searchQuery.trim()

        if (query.length < 2) {
            setError('Сканируйте штрихкод или введите название товара')
            return
        }

        try {
            setIsSearchLoading(true)
            setError(null)

            let product = selectedProduct || findBestProduct(suggestions, query)

            if (!product) {
                const products = await searchProducts(query)

                setSuggestions(products)
                product = findBestProduct(products, query)
            }

            if (!product) {
                setError('Товар не найден')
                return
            }

            openQuantityModal(product)
        } catch (error) {
            console.error(error)
            setError(error instanceof Error ? error.message : 'Ошибка поиска товара')
        } finally {
            setIsSearchLoading(false)
        }
    }

    const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return

        event.preventDefault()
        void handleSearchEnter()
    }

    const addProductToItems = (product: Product, quantityValue: string) => {
        const safeProduct = normalizeProduct(product)
        const unit = safeProduct.unit
        const validationError = validateQuantityForUnit(quantityValue, unit)

        if (validationError) {
            setError(validationError)
            return
        }

        const qty = roundQuantityForUnit(quantityValue, unit)
        const existingItem = items.find(item => item.product.id === safeProduct.id)
        const existingQty = existingItem ? parseNumber(existingItem.quantity) : 0
        const nextQty = roundQuantityForUnit(existingQty + qty, unit)
        const stock = getStock(safeProduct)

        if (nextQty > stock) {
            setError(`Недостаточно остатка. Сейчас доступно: ${formatQuantity(stock, unit)}`)
            return
        }

        const newItem: WriteoffItem = {
            product: safeProduct,
            quantity: String(qty),
            category: safeProduct.category || '',
            purchasePrice: String(getPurchasePrice(safeProduct) || 0),
            sellingPrice: String(getSellingPrice(safeProduct) || 0),
        }

        setItems(prev => {
            const withoutProduct = prev.filter(item => item.product.id !== safeProduct.id)

            if (!existingItem) {
                return [newItem, ...withoutProduct]
            }

            return [
                {
                    ...existingItem,
                    quantity: String(nextQty),
                    category: safeProduct.category || existingItem.category,
                    purchasePrice: String(getPurchasePrice(safeProduct) || existingItem.purchasePrice || 0),
                    sellingPrice: String(getSellingPrice(safeProduct) || existingItem.sellingPrice || 0),
                },
                ...withoutProduct,
            ]
        })

        setQuantityModalProduct(null)
        setQuantityModalQuantity('1')
        setError(null)
        resetScan()
    }

    const updateItemQuantity = (productId: number, value: string) => {
        setItems(prev => prev.map(item => {
            if (item.product.id !== productId) return item

            const unit = item.product.unit
            const nextValue = normalizeQuantityInput(value, unit)
            const nextQty = parseNumber(nextValue)
            const stock = getStock(item.product)

            if (nextQty > stock) {
                setError(`Недостаточно остатка. Сейчас доступно: ${formatQuantity(stock, unit)}`)
                return item
            }

            setError(null)

            return {
                ...item,
                quantity: nextValue,
            }
        }))
    }

    const updateItemPurchasePrice = (productId: number, value: string) => {
        setItems(prev => prev.map(item => item.product.id === productId ? { ...item, purchasePrice: value } : item))
    }

    const updateItemSellingPrice = (productId: number, value: string) => {
        setItems(prev => prev.map(item => item.product.id === productId ? { ...item, sellingPrice: value } : item))
    }

    const removeItem = (productId: number) => {
        setItems(prev => prev.filter(item => item.product.id !== productId))
    }

    const clearDraft = () => {
        localStorage.removeItem(getWriteoffDraftKey())
        setReason('expired')
        setResponsible('')
        setComment('')
        setSearchQuery('')
        setSuggestions([])
        setSelectedProduct(null)
        setItems([])
        setError(null)
        setNotice(null)

        requestAnimationFrame(() => {
            scanInputRef.current?.focus()
        })
    }

    const validateItems = () => {
        if (!reason) {
            return 'Выберите причину списания'
        }

        if (items.length === 0) {
            return 'Добавьте хотя бы один товар'
        }

        for (const item of items) {
            const validationError = validateQuantityForUnit(item.quantity, item.product.unit)

            if (validationError) {
                return `${validationError} у товара «${item.product.name}»`
            }

            const qty = parseNumber(item.quantity)
            const stock = getStock(item.product)

            if (qty > stock) {
                return `Недостаточно остатка у товара «${item.product.name}». Доступно: ${formatQuantity(stock, item.product.unit)}`
            }
        }

        return null
    }

    const handleCommit = async () => {
        const validationError = validateItems()

        if (validationError) {
            setError(validationError)
            return
        }

        try {
            setIsCommitLoading(true)
            setError(null)
            setNotice(null)

            const response = await fetch('/api/writeoff', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    reason,
                    reasonLabel: selectedReasonLabel,
                    responsible,
                    comment,
                    items: items.map(item => ({
                        productId: item.product.id,
                        quantity: parseNumber(item.quantity),
                        category: item.category,
                        purchasePrice: parseNumber(item.purchasePrice),
                        sellingPrice: parseNumber(item.sellingPrice),
                    })),
                }),
            })

            const data = await readJsonSafe<WriteoffDetail | ApiError>(response)

            if (!response.ok) {
                throw new Error(getApiErrorMessage(data, 'Не удалось сохранить списание'))
            }

            const savedWriteoff = data as WriteoffDetail

            localStorage.removeItem(getWriteoffDraftKey())
            setItems([])
            setSearchQuery('')
            setSuggestions([])
            setSelectedProduct(null)
            setComment('')
            setNotice(`Списание сохранено: ${savedWriteoff.number}`)

            await loadHistory()
            printWriteoffAct(savedWriteoff)
        } catch (error) {
            console.error(error)
            setError(error instanceof Error ? error.message : 'Не удалось сохранить списание')
        } finally {
            setIsCommitLoading(false)
        }
    }

    const openWriteoffDetail = async (id: number) => {
        try {
            setIsDetailLoading(true)
            setModalError(null)
            setError(null)
            setIsDetailModalOpen(true)
            setSelectedWriteoff(null)
            setModalRows([])

            const response = await fetch(`/api/writeoff/history/${id}`, {
                method: 'GET',
                cache: 'no-store',
            })

            const data = await readJsonSafe<WriteoffDetail | ApiError>(response)

            if (!response.ok) {
                throw new Error(getApiErrorMessage(data, 'Не удалось открыть списание'))
            }

            const detail = data as WriteoffDetail

            setSelectedWriteoff(detail)
            setModalRows(detail.rows || [])
            setModalReason(detail.reason || 'other')
            setModalResponsible(detail.responsible || '')
            setModalComment(detail.comment || '')
        } catch (error) {
            console.error(error)
            setModalError(error instanceof Error ? error.message : 'Не удалось открыть списание')
        } finally {
            setIsDetailLoading(false)
        }
    }

    const closeDetailModal = () => {
        setIsDetailModalOpen(false)
        setSelectedWriteoff(null)
        setModalRows([])
        setModalReason('expired')
        setModalResponsible('')
        setModalComment('')
        setModalError(null)
    }

    const updateModalRow = (rowId: string, field: keyof WriteoffDetailRow, value: WriteoffDetailRow[keyof WriteoffDetailRow]) => {
        setModalRows(prev => prev.map(row => row.rowId === rowId ? { ...row, [field]: value } : row))
    }

    const updateModalRowQuantity = (rowId: string, value: string) => {
        setModalRows(prev => prev.map(row => {
            if (row.rowId !== rowId) return row

            return {
                ...row,
                quantity: normalizeQuantityInput(value, row.unit),
            }
        }))
    }

    const deleteModalRow = (rowId: string) => {
        setModalRows(prev => renumberRows(prev.filter(row => row.rowId !== rowId)))
    }

    const saveModalWriteoff = async () => {
        if (!selectedWriteoff) return

        if (!modalRows.length) {
            setModalError('В списании должна быть хотя бы одна позиция')
            return
        }

        try {
            setIsModalSaving(true)
            setModalError(null)

            const response = await fetch(`/api/writeoff/history/${selectedWriteoff.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    reason: modalReason,
                    reasonLabel: getReasonLabel(modalReason),
                    responsible: modalResponsible,
                    comment: modalComment,
                    rows: renumberRows(modalRows).map(row => ({
                        writeoffItemId: row.writeoffItemId,
                        productId: row.productId,
                        rowId: row.rowId,
                        rowNumber: row.rowNumber,
                        quantity: parseNumber(row.quantity),
                        category: row.category,
                        purchasePrice: parseNumber(row.purchasePrice),
                        sellingPrice: parseNumber(row.sellingPrice),
                    })),
                }),
            })

            const data = await readJsonSafe<WriteoffDetail | ApiError>(response)

            if (!response.ok) {
                throw new Error(getApiErrorMessage(data, 'Не удалось сохранить списание'))
            }

            const detail = data as WriteoffDetail

            setSelectedWriteoff(detail)
            setModalRows(detail.rows || [])
            setModalReason(detail.reason || 'other')
            setModalResponsible(detail.responsible || '')
            setModalComment(detail.comment || '')

            await loadHistory()
            alert('Изменения списания сохранены в БД')
        } catch (error) {
            console.error(error)
            setModalError(error instanceof Error ? error.message : 'Не удалось сохранить списание')
        } finally {
            setIsModalSaving(false)
        }
    }

    const printCurrentModalWriteoff = () => {
        if (!selectedWriteoff) return

        printWriteoffAct({
            ...selectedWriteoff,
            reason: modalReason,
            reasonLabel: getReasonLabel(modalReason),
            responsible: modalResponsible,
            comment: modalComment,
            rows: modalRows,
        })
    }

    return (
        <System>
            <section className="relative w-full min-h-screen bg-gray-50 p-4">
                <div className="mx-auto max-w-[1600px] space-y-4">
                    <div className="rounded-2xl bg-white p-5 shadow-sm">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                                <div className="inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                                    Складская операция
                                </div>

                                <h1 className="mt-2 text-2xl font-bold text-gray-900">
                                    Списание
                                </h1>

                                <p className="mt-1 text-sm text-gray-500">
                                    Сканируйте товар, указывайте количество и причину списания. Документ сохранится в историю и уменьшит остаток товара.
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsHistoryModalOpen(true)
                                        void loadHistory()
                                    }}
                                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-100"
                                >
                                    История списаний ({history.length})
                                </button>

                                <button
                                    type="button"
                                    onClick={loadHistory}
                                    disabled={isHistoryLoading}
                                    className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                                >
                                    {isHistoryLoading ? 'Обновляю...' : 'Обновить'}
                                </button>
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

                    <div className="rounded-2xl bg-white p-6 shadow-sm">
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                            <div>
                                <label className="mb-2 block text-sm font-bold text-gray-700">
                                    Причина списания
                                </label>

                                <select
                                    value={reason}
                                    onChange={(event) => setReason(event.target.value)}
                                    className={inputClass}
                                >
                                    {WRITEOFF_REASONS.map(item => (
                                        <option key={item.value} value={item.value}>
                                            {item.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-bold text-gray-700">
                                    Ответственный
                                </label>

                                <input
                                    value={responsible}
                                    onChange={(event) => setResponsible(event.target.value)}
                                    placeholder="Кто оформляет списание"
                                    className={inputClass}
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-bold text-gray-700">
                                    Комментарий
                                </label>

                                <input
                                    value={comment}
                                    onChange={(event) => setComment(event.target.value)}
                                    placeholder="Например: повреждена упаковка при выкладке"
                                    className={inputClass}
                                />
                            </div>
                        </div>

                        <div className="mt-6 rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 to-white p-5 shadow-sm">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                                <div className="flex-1">
                                    <label className="mb-2 block text-sm font-bold uppercase tracking-wide text-red-700">
                                        Сканер / поиск товара
                                    </label>

                                    <div className="relative">
                                        <input
                                            ref={scanInputRef}
                                            value={searchQuery}
                                            onChange={(event) => {
                                                setSearchQuery(event.target.value)
                                                setSelectedProduct(null)
                                            }}
                                            onKeyDown={handleSearchKeyDown}
                                            placeholder="Сканируйте штрихкод или введите название и нажмите Enter"
                                            autoComplete="off"
                                            className="w-full rounded-2xl border-2 border-red-200 bg-white px-5 py-4 pr-14 font-mono text-xl font-semibold tracking-wide text-gray-900 outline-none transition-colors placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal focus:border-red-500 focus:ring-4 focus:ring-red-100"
                                        />

                                        <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-2xl text-red-400">
                                            ⌁
                                        </div>
                                    </div>

                                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="text-sm text-red-700">
                                            {isSearchLoading
                                                ? 'Ищу товар в базе...'
                                                : previewProduct
                                                    ? `Найден: ${previewProduct.name}. Нажмите Enter, чтобы указать количество.`
                                                    : 'После сканирования откроется окно количества. Товар добавится наверх таблицы.'}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => void handleSearchEnter()}
                                            disabled={isSearchLoading || searchQuery.trim().length < 2}
                                            className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            Открыть количество
                                        </button>
                                    </div>
                                </div>

                                {previewProduct && (
                                    <div className="w-full rounded-2xl border border-red-100 bg-white p-4 xl:w-[360px]">
                                        <div className="text-sm font-bold text-gray-900">
                                            {previewProduct.name}
                                        </div>

                                        <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-gray-500">
                                            <div>
                                                <span className="block text-xs text-gray-400">Штрихкод</span>
                                                <span className="font-mono">{previewProduct.barcode || '—'}</span>
                                            </div>

                                            <div>
                                                <span className="block text-xs text-gray-400">Остаток</span>
                                                <span>{formatQuantity(getStock(previewProduct), previewProduct.unit)}</span>
                                            </div>

                                            <div>
                                                <span className="block text-xs text-gray-400">Категория</span>
                                                <span>{previewProduct.category || '—'}</span>
                                            </div>

                                            <div>
                                                <span className="block text-xs text-gray-400">Ед.</span>
                                                <span>{unitLabel(previewProduct.unit)}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {(suggestions.length > 0 || isSearchLoading) && searchQuery.trim().length >= 2 && (
                                <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                                    {isSearchLoading && (
                                        <div className="px-4 py-3 text-base text-gray-500">
                                            Поиск...
                                        </div>
                                    )}

                                    {!isSearchLoading && suggestions.map(product => (
                                        <button
                                            key={product.id}
                                            type="button"
                                            onMouseDown={(event) => {
                                                event.preventDefault()
                                                handleSuggestionClick(product)
                                            }}
                                            className="flex w-full items-center justify-between gap-4 border-b border-gray-100 px-4 py-4 text-left text-base hover:bg-red-50"
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate font-semibold text-gray-900">
                                                    {product.name}
                                                </span>

                                                <span className="mt-1 block truncate text-sm text-gray-500">
                                                    {product.barcode || 'Без штрихкода'} · {product.category}
                                                </span>
                                            </span>

                                            <span className="whitespace-nowrap text-sm text-gray-500">
                                                Остаток: {formatQuantity(getStock(product), product.unit)}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="mt-6 w-full overflow-x-auto rounded-2xl border border-gray-100">
                            <table className="w-full min-w-[1200px] text-base">
                                <thead className="bg-gray-100 text-gray-700">
                                <tr>
                                    <th className="w-[360px] p-4 text-left">Товар</th>
                                    <th className="w-[190px] p-4 text-left">Штрихкод</th>
                                    <th className="w-[150px] p-4 text-left">Остаток</th>
                                    <th className="w-[180px] p-4 text-left">Закупка</th>
                                    <th className="w-[180px] p-4 text-left">Продажа</th>
                                    <th className="w-[190px] p-4 text-left">Количество</th>
                                    <th className="w-[170px] p-4 text-left">Сумма продажи</th>
                                    <th className="w-[130px] p-4 text-right">Действие</th>
                                </tr>
                                </thead>

                                <tbody>
                                {items.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="p-8 text-center text-base text-gray-500">
                                            Товары пока не добавлены. Сканируйте штрихкод в поле выше.
                                        </td>
                                    </tr>
                                )}

                                {items.map(item => {
                                    const qty = parseNumber(item.quantity)
                                    const sellingPrice = parseNumber(item.sellingPrice)

                                    return (
                                        <tr key={item.product.id} className="border-t border-gray-100">
                                            <td className="p-4 font-semibold text-gray-900">
                                                {item.product.name}
                                                <div className="mt-1 text-sm font-normal text-gray-500">
                                                    {item.category || item.product.category || 'Без категории'}
                                                </div>
                                            </td>

                                            <td className="p-4 font-mono text-gray-500">
                                                {item.product.barcode || '-'}
                                            </td>

                                            <td className="p-4 text-gray-500">
                                                {formatQuantity(getStock(item.product), item.product.unit)}
                                            </td>

                                            <td className="p-4">
                                                <input
                                                    value={item.purchasePrice}
                                                    onChange={(event) => updateItemPurchasePrice(item.product.id, event.target.value)}
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    className={tableInputClass}
                                                />
                                            </td>

                                            <td className="p-4">
                                                <input
                                                    value={item.sellingPrice}
                                                    onChange={(event) => updateItemSellingPrice(item.product.id, event.target.value)}
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    className={tableInputClass}
                                                />
                                            </td>

                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        {...getQuantityInputProps(item.product.unit)}
                                                        value={item.quantity}
                                                        onChange={(event) => updateItemQuantity(item.product.id, event.target.value)}
                                                        className={quantityTableInputClass}
                                                    />

                                                    <span className="shrink-0 text-gray-500">
                                                        {unitLabel(item.product.unit)}
                                                    </span>
                                                </div>
                                            </td>

                                            <td className="p-4 font-semibold">
                                                {Number.isFinite(qty) ? money(qty * sellingPrice) : money(0)}
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
                            <div>
                                <div className="text-2xl font-bold text-gray-900">
                                    Итого по продаже: {money(total)}
                                </div>

                                <div className="mt-1 text-sm text-gray-500">
                                    Итого по закупке: {money(totalPurchase)} · Причина: {selectedReasonLabel}
                                </div>

                                {isDraftHydrated && (items.length > 0 || searchQuery || comment || responsible) && (
                                    <div className="mt-1 text-sm text-gray-500">
                                        Черновик списания сохранён в браузере.
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col gap-2 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={clearDraft}
                                    disabled={isCommitLoading}
                                    className="rounded-xl border border-gray-300 bg-white px-6 py-3 text-base font-semibold text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Очистить черновик
                                </button>

                                <button
                                    type="button"
                                    onClick={handleCommit}
                                    disabled={isCommitLoading || items.length === 0}
                                    className="rounded-xl bg-red-600 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isCommitLoading ? 'Списание...' : 'Списать и распечатать акт'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {quantityModalProduct && (
                    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 px-3 py-3">
                        <div className="flex max-h-[calc(100dvh-24px)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                            <div className="border-b border-gray-100 px-5 py-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h2 className="text-lg font-bold text-gray-900">
                                            Количество для списания
                                        </h2>

                                        <p className="mt-1 text-sm text-gray-500">
                                            {quantityModalProduct.name}
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setQuantityModalProduct(null)}
                                        className="text-2xl leading-none text-gray-400 hover:text-gray-600"
                                    >
                                        ×
                                    </button>
                                </div>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div className="rounded-xl bg-gray-50 p-3">
                                        <div className="text-xs text-gray-400">Штрихкод</div>
                                        <div className="font-mono text-gray-700">{quantityModalProduct.barcode || '—'}</div>
                                    </div>

                                    <div className="rounded-xl bg-gray-50 p-3">
                                        <div className="text-xs text-gray-400">Остаток</div>
                                        <div className="font-semibold text-gray-700">
                                            {formatQuantity(getStock(quantityModalProduct), quantityModalProduct.unit)}
                                        </div>
                                    </div>

                                    <div className="rounded-xl bg-gray-50 p-3">
                                        <div className="text-xs text-gray-400">Категория</div>
                                        <div className="truncate font-semibold text-gray-700">{quantityModalProduct.category || '—'}</div>
                                    </div>

                                    <div className="rounded-xl bg-gray-50 p-3">
                                        <div className="text-xs text-gray-400">Ед.</div>
                                        <div className="font-semibold text-gray-700">{unitLabel(quantityModalProduct.unit)}</div>
                                    </div>
                                </div>

                                <label className="mt-4 mb-2 block text-sm font-bold text-gray-700">
                                    Количество
                                </label>

                                <div className="flex items-center gap-2">
                                    <input
                                        ref={quantityModalInputRef}
                                        {...getQuantityInputProps(quantityModalProduct.unit)}
                                        value={quantityModalQuantity}
                                        onChange={(event) => {
                                            setQuantityModalQuantity(normalizeQuantityInput(event.target.value, quantityModalProduct.unit))
                                            setError(null)
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key !== 'Enter') return

                                            event.preventDefault()
                                            addProductToItems(quantityModalProduct, quantityModalQuantity)
                                        }}
                                        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-2xl font-bold outline-none focus:ring-2 focus:ring-red-500"
                                    />

                                    <span className="shrink-0 text-lg font-semibold text-gray-500">
                                        {unitLabel(quantityModalProduct.unit)}
                                    </span>
                                </div>

                                <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                                    Причина: <span className="font-bold">{selectedReasonLabel}</span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2 border-t border-gray-100 bg-gray-50 px-5 py-4 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={() => setQuantityModalProduct(null)}
                                    className="rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                                >
                                    Отмена
                                </button>

                                <button
                                    type="button"
                                    onClick={() => addProductToItems(quantityModalProduct, quantityModalQuantity)}
                                    className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700"
                                >
                                    Добавить в таблицу
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {isHistoryModalOpen && (
                    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 px-3 py-4">
                        <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                            <div className="border-b border-gray-100 bg-gray-50 px-5 py-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900">
                                            История списаний
                                        </h2>

                                        <p className="mt-1 text-sm text-gray-500">
                                            Открывайте документ для просмотра, печати или корректировки.
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={loadHistory}
                                            disabled={isHistoryLoading}
                                            className={`${buttonClass} border border-gray-300 bg-white text-gray-700 hover:bg-gray-100`}
                                        >
                                            {isHistoryLoading ? 'Обновляю...' : 'Обновить'}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setIsHistoryModalOpen(false)}
                                            className={`${buttonClass} border border-gray-300 bg-white text-gray-700 hover:bg-gray-100`}
                                        >
                                            Закрыть
                                        </button>
                                    </div>
                                </div>

                                <input
                                    type="search"
                                    value={historySearch}
                                    onChange={(event) => setHistorySearch(event.target.value)}
                                    placeholder="Поиск: номер, причина, ответственный, дата"
                                    className="mt-4 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-1 focus:ring-red-500"
                                />
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto p-5">
                                {isHistoryLoading && (
                                    <div className="rounded-xl bg-gray-50 p-6 text-center text-gray-500">
                                        Загрузка...
                                    </div>
                                )}

                                {!isHistoryLoading && filteredHistory.length === 0 && (
                                    <div className="rounded-xl bg-gray-50 p-6 text-center text-gray-500">
                                        Списаний пока нет
                                    </div>
                                )}

                                <div className="space-y-2">
                                    {filteredHistory.map(item => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => openWriteoffDetail(item.id)}
                                            className="block w-full rounded-xl border border-gray-100 bg-gray-50 p-4 text-left transition-colors hover:border-red-200 hover:bg-red-50"
                                        >
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                <div className="min-w-0">
                                                    <div className="font-bold text-red-700">
                                                        {item.number}
                                                    </div>

                                                    <div className="mt-1 text-sm text-gray-600">
                                                        {item.reasonLabel}
                                                    </div>

                                                    <div className="mt-1 text-xs text-gray-500">
                                                        {formatDate(item.createdAt)}{item.responsible ? ` · ${item.responsible}` : ''}
                                                    </div>

                                                    {item.comment && (
                                                        <div className="mt-1 truncate text-xs text-gray-500">
                                                            {item.comment}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="grid grid-cols-3 gap-1 text-center text-xs sm:w-[300px]">
                                                    <div className="rounded bg-white p-1">
                                                        <div className="text-gray-400">стр.</div>
                                                        <div className="font-bold">{item.totalRows}</div>
                                                    </div>

                                                    <div className="rounded bg-red-50 p-1 text-red-700">
                                                        <div>кол.</div>
                                                        <div className="font-bold">{item.totalQuantity}</div>
                                                    </div>

                                                    <div className="rounded bg-green-50 p-1 text-green-700">
                                                        <div>сумма</div>
                                                        <div className="font-bold">{money(item.totalSellingAmount)}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {isDetailModalOpen && (
                    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/50 px-3 py-4">
                        <div className="flex max-h-[92vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                            <div className="border-b border-gray-100 bg-gray-50 px-5 py-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900">
                                            {selectedWriteoff ? `Списание ${selectedWriteoff.number}` : 'Загрузка списания...'}
                                        </h2>

                                        <p className="mt-1 text-sm text-gray-500">
                                            Можно изменить причину, количество и цены. При сохранении старое списание возвращается на остаток, затем применяется новая версия.
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {selectedWriteoff && (
                                            <button
                                                type="button"
                                                onClick={printCurrentModalWriteoff}
                                                className={`${buttonClass} border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100`}
                                            >
                                                Печать акта
                                            </button>
                                        )}

                                        <button
                                            type="button"
                                            onClick={closeDetailModal}
                                            className={`${buttonClass} border border-gray-300 bg-white text-gray-700 hover:bg-gray-100`}
                                        >
                                            Закрыть
                                        </button>
                                    </div>
                                </div>

                                {selectedWriteoff && (
                                    <>
                                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
                                            <div>
                                                <label className="mb-1 block text-xs font-medium text-gray-500">Причина</label>
                                                <select
                                                    value={modalReason}
                                                    onChange={(event) => setModalReason(event.target.value)}
                                                    className={smallInputClass}
                                                >
                                                    {WRITEOFF_REASONS.map(item => (
                                                        <option key={item.value} value={item.value}>
                                                            {item.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div>
                                                <label className="mb-1 block text-xs font-medium text-gray-500">Ответственный</label>
                                                <input
                                                    value={modalResponsible}
                                                    onChange={(event) => setModalResponsible(event.target.value)}
                                                    className={smallInputClass}
                                                />
                                            </div>

                                            <div>
                                                <label className="mb-1 block text-xs font-medium text-gray-500">Комментарий</label>
                                                <input
                                                    value={modalComment}
                                                    onChange={(event) => setModalComment(event.target.value)}
                                                    className={smallInputClass}
                                                />
                                            </div>

                                            <div className="rounded-xl border border-gray-100 bg-white p-3">
                                                <div className="text-xs text-gray-500">Строк</div>
                                                <div className="text-xl font-bold">{modalSummary.totalRows}</div>
                                            </div>

                                            <div className="rounded-xl border border-gray-100 bg-white p-3">
                                                <div className="text-xs text-gray-500">Итого</div>
                                                <div className="text-xl font-bold">{money(modalSummary.totalSellingAmount)}</div>
                                            </div>
                                        </div>

                                        {modalError && (
                                            <div className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                                                {modalError}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="flex-1 overflow-auto p-5">
                                {isDetailLoading && (
                                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-6 text-center text-gray-500">
                                        Загрузка позиций...
                                    </div>
                                )}

                                {!isDetailLoading && selectedWriteoff && (
                                    <div className="overflow-auto rounded-xl border border-gray-100">
                                        <table className="w-full min-w-[1180px] text-xs">
                                            <thead className="sticky top-0 z-10 bg-gray-100 text-gray-600 shadow-sm">
                                            <tr>
                                                <th className="w-12 p-2 text-left">№</th>
                                                <th className="w-72 p-2 text-left">Товар</th>
                                                <th className="w-40 p-2 text-left">Штрихкод</th>
                                                <th className="w-32 p-2 text-left">Категория</th>
                                                <th className="w-20 p-2 text-left">Ед.</th>
                                                <th className="w-32 p-2 text-left">Кол.</th>
                                                <th className="w-28 p-2 text-left">Закупка</th>
                                                <th className="w-28 p-2 text-left">Продажа</th>
                                                <th className="w-32 p-2 text-left">Сумма</th>
                                                <th className="w-28 p-2 text-left">Остаток был</th>
                                                <th className="w-28 p-2 text-left">Остаток стал</th>
                                                <th className="w-20 p-2 text-left"></th>
                                            </tr>
                                            </thead>

                                            <tbody>
                                            {modalRows.map(row => {
                                                const sum = parseNumber(row.quantity) * parseNumber(row.sellingPrice)

                                                return (
                                                    <tr key={row.rowId} className="border-t border-gray-100 align-top hover:bg-gray-50">
                                                        <td className="p-2 font-medium">{row.rowNumber}</td>

                                                        <td className="p-2">
                                                            <div className="font-medium text-gray-900">{row.name}</div>
                                                            <div className="mt-1 text-[11px] text-gray-400">ID товара: {row.productId || '—'}</div>
                                                        </td>

                                                        <td className="p-2 text-gray-500">{row.barcode || '-'}</td>
                                                        <td className="p-2 text-gray-500">{row.category || '-'}</td>
                                                        <td className="p-2 text-gray-500">{unitLabel(row.unit)}</td>

                                                        <td className="p-2">
                                                            <input
                                                                {...getQuantityInputProps(row.unit)}
                                                                value={row.quantity}
                                                                onChange={(event) => updateModalRowQuantity(row.rowId, event.target.value)}
                                                                className={tableInputClass}
                                                            />
                                                        </td>

                                                        <td className="p-2">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                value={row.purchasePrice}
                                                                onChange={(event) => updateModalRow(row.rowId, 'purchasePrice', event.target.value)}
                                                                className={tableInputClass}
                                                            />
                                                        </td>

                                                        <td className="p-2">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="1"
                                                                value={row.sellingPrice}
                                                                onChange={(event) => updateModalRow(row.rowId, 'sellingPrice', event.target.value)}
                                                                className={tableInputClass}
                                                            />
                                                        </td>

                                                        <td className="p-2 font-semibold text-gray-900">{money(sum)}</td>
                                                        <td className="p-2 text-gray-500">{row.previousStock ?? '—'}</td>
                                                        <td className="p-2 text-gray-500">{row.newStock ?? '—'}</td>

                                                        <td className="p-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => deleteModalRow(row.rowId)}
                                                                className="rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700 hover:bg-red-100"
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
                                )}
                            </div>

                            <div className="flex flex-col gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4 md:flex-row md:items-center md:justify-between">
                                <div className="text-sm text-gray-500">
                                    Сохранение пересчитает остатки: старая версия вернётся на склад, новая снова спишется.
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={closeDetailModal}
                                        className={`${buttonClass} border border-gray-300 bg-white text-gray-700 hover:bg-gray-100`}
                                    >
                                        Отмена
                                    </button>

                                    <button
                                        type="button"
                                        onClick={saveModalWriteoff}
                                        disabled={isModalSaving || !selectedWriteoff}
                                        className={`${buttonClass} bg-green-600 text-white hover:bg-green-700`}
                                    >
                                        {isModalSaving ? 'Сохранение...' : 'Сохранить в БД'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </section>
        </System>
    )
}

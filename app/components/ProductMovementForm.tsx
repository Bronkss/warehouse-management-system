'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
    clearPersistentState,
    MANUAL_ACCEPTANCE_MOVEMENT_DRAFT_KEY,
    readPersistentState,
    SHIPMENT_MOVEMENT_DRAFT_KEY,
    writePersistentState,
} from '@/app/lib/acceptanceStateManager'

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

type ProductsApiResponse = {
    items: Product[]
    nextCursor: number | null
    hasMore: boolean
    limit: number
    durationMs?: number
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
    supplier?: string
    invoiceNumber?: string
    comment?: string
    onAcceptanceSaved?: (result: AcceptanceCommitResult) => void | Promise<void>
    onShipmentSaved?: (result: OperationApiResult) => void | Promise<void>
}

type AddOverrides = {
    quantity?: string
    category?: string
    purchasePrice?: string
    sellingPrice?: string
}

type AcceptanceCommitResult = {
    acceptanceId?: number
    acceptanceNumber?: string
    number?: string
    totalRows?: number
    created?: number
    updated?: number
    skipped?: number
    errors?: string[]
    message?: string
}

type OperationApiResult = {
    id?: number
    shipmentId?: number
    number?: string
    shipmentNumber?: string
    updated?: number
    message?: string
}

type MovementDraftState = {
    searchQuery: string
    quantity: string
    items: MovementItem[]
    acceptanceCategory: string
    acceptancePurchasePrice: string
    acceptanceSellingPrice: string
    manualSupplier: string
    manualInvoiceNumber: string
    manualComment: string
    shipper: string
    consignee: string
}

const inputClass = 'w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-500'
const tableInputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-blue-500'
const quantityTableInputClass = 'w-28 shrink-0 rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-blue-500'
const buttonClass = 'rounded-xl px-6 py-3 text-base font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50'

function parseNumber(value: string | number) {
    return Number(String(value).replace(',', '.'))
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

function validateQuantityForUnit(value: string | number, unit: ProductUnit) {
    const rawValue = String(value ?? '').trim().replace(',', '.')

    if (!rawValue) {
        return 'Введите количество'
    }

    if (isWeightUnit(unit)) {
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
    return isWeightUnit(unit)
        ? {
            type: 'number' as const,
            inputMode: 'decimal' as const,
            min: '0.001',
            step: '0.001',
            placeholder: 'Например 0.350',
        }
        : {
            type: 'number' as const,
            inputMode: 'numeric' as const,
            min: '1',
            step: '1',
            placeholder: 'Например 1',
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

    return String(Math.round(price * markup))
}

function normalizeIntegerPrice(value: string | number) {
    const price = parseNumber(value)

    if (!Number.isFinite(price) || price <= 0) {
        return ''
    }

    return String(Math.round(price))
}

function normalizeProductsResponse(data: unknown): Product[] {
    if (Array.isArray(data)) {
        return data as Product[]
    }

    if (
        typeof data === 'object' &&
        data !== null &&
        'items' in data &&
        Array.isArray((data as ProductsApiResponse).items)
    ) {
        return (data as ProductsApiResponse).items
    }

    return []
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

    const data = await response.json()

    if (!response.ok) {
        throw new Error(data?.message || 'Не удалось найти товары')
    }

    return normalizeProductsResponse(data)
}

function findBestProduct(products: Product[], query: string) {
    const normalizedQuery = query.trim().toLowerCase()
    const rawQuery = query.trim()

    const exact = products.find(product =>
        product.barcode === rawQuery ||
        product.name.toLowerCase() === normalizedQuery
    )

    return exact || products[0] || null
}


function buildManualAcceptanceRows(rows: MovementItem[]) {
    return rows.map((item, index) => ({
        productId: item.product.id,
        rowId: `manual-${item.product.id}-${index + 1}`,
        rowNumber: index + 1,
        status: 'matched',
        action: 'update',
        matchType: 'manual',
        matchScore: 1,
        matchedProductId: item.product.id,
        matchedProductName: item.product.name,
        matchedProductBarcode: item.product.barcode || '',
        suggestions: [],
        error: null,
        name: item.product.name,
        category: item.category || item.product.category || '',
        barcode: item.product.barcode || '',
        purchasePrice: String(item.purchasePrice || item.product.purchasePrice || 0),
        sellingPrice: normalizeIntegerPrice(item.sellingPrice || item.product.sellingPrice || 0),
        unit: item.product.unit,
        stock: String(item.quantity || 0),
        minStock: String(item.product.minStock || 0),
        image: item.product.image || '',
    }))
}

export default function ProductMovementForm({
                                                mode,
                                                supplier: externalSupplier,
                                                invoiceNumber: externalInvoiceNumber,
                                                comment: externalComment,
                                                onAcceptanceSaved,
                                                onShipmentSaved,
                                            }: Props) {
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

    const [manualSupplier, setManualSupplier] = useState('')
    const [manualInvoiceNumber, setManualInvoiceNumber] = useState('')
    const [manualComment, setManualComment] = useState('')

    const [quantityModalProduct, setQuantityModalProduct] = useState<Product | null>(null)
    const [quantityModalQuantity, setQuantityModalQuantity] = useState('1')
    const [quantityModalCategory, setQuantityModalCategory] = useState('')
    const [quantityModalPurchasePrice, setQuantityModalPurchasePrice] = useState('')
    const [quantityModalSellingPrice, setQuantityModalSellingPrice] = useState('')

    const scanInputRef = useRef<HTMLInputElement>(null)
    const quantityModalInputRef = useRef<HTMLInputElement>(null)

    const effectiveSupplier = externalSupplier ?? manualSupplier
    const effectiveInvoiceNumber = externalInvoiceNumber ?? manualInvoiceNumber
    const effectiveComment = externalComment ?? manualComment

    const shouldShowAcceptanceDocumentFields =
        isAcceptance &&
        externalSupplier === undefined &&
        externalInvoiceNumber === undefined &&
        externalComment === undefined

    const draftStorageKey = isAcceptance
        ? MANUAL_ACCEPTANCE_MOVEMENT_DRAFT_KEY
        : SHIPMENT_MOVEMENT_DRAFT_KEY

    const [isDraftHydrated, setIsDraftHydrated] = useState(false)

    useEffect(() => {
        let isMounted = true

        setIsDraftHydrated(false)

        const restoreDraft = async () => {
            const draft = await readPersistentState<MovementDraftState>(draftStorageKey)

            if (!isMounted) return

            if (draft) {
                setSearchQuery(draft.searchQuery || '')
                setQuantity(draft.quantity || '1')
                setItems(Array.isArray(draft.items) ? draft.items : [])
                setAcceptanceCategory(draft.acceptanceCategory || '')
                setAcceptancePurchasePrice(draft.acceptancePurchasePrice || '')
                setAcceptanceSellingPrice(draft.acceptanceSellingPrice || '')
                setManualSupplier(draft.manualSupplier || '')
                setManualInvoiceNumber(draft.manualInvoiceNumber || '')
                setManualComment(draft.manualComment || '')
                setShipper(draft.shipper || '')
                setConsignee(draft.consignee || '')
            }

            setIsDraftHydrated(true)
        }

        void restoreDraft()

        return () => {
            isMounted = false
        }
    }, [draftStorageKey])

    useEffect(() => {
        if (!isDraftHydrated) return

        writePersistentState<MovementDraftState>(draftStorageKey, {
            searchQuery,
            quantity,
            items,
            acceptanceCategory,
            acceptancePurchasePrice,
            acceptanceSellingPrice,
            manualSupplier,
            manualInvoiceNumber,
            manualComment,
            shipper,
            consignee,
        })
    }, [
        acceptanceCategory,
        acceptancePurchasePrice,
        acceptanceSellingPrice,
        consignee,
        draftStorageKey,
        isDraftHydrated,
        items,
        manualComment,
        manualInvoiceNumber,
        manualSupplier,
        quantity,
        searchQuery,
        shipper,
    ])

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

                const products = await searchProducts(query, controller.signal)

                setSuggestions(products)

                const bestProduct = findBestProduct(products, query)

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
                if (error instanceof Error && error.name === 'AbortError') {
                    return
                }

                console.error(error)
                setSuggestions([])
                setSelectedProduct(null)
            } finally {
                if (!controller.signal.aborted) {
                    setIsSearchLoading(false)
                }
            }
        }, 250)

        return () => {
            clearTimeout(timeoutId)
            controller.abort()
        }
    }, [searchQuery, isAcceptance])

    useEffect(() => {
        if (!isAcceptance || !isDraftHydrated) {
            return
        }

        if (acceptanceSellingPrice.trim()) {
            return
        }

        setAcceptanceSellingPrice(
            calcSellingPrice(
                acceptancePurchasePrice,
                acceptanceCategory,
                selectedProduct?.name
            )
        )
    }, [
        acceptanceCategory,
        acceptancePurchasePrice,
        acceptanceSellingPrice,
        isAcceptance,
        isDraftHydrated,
        selectedProduct,
    ])

    useEffect(() => {
        if (!quantityModalProduct) {
            return
        }

        window.setTimeout(() => {
            quantityModalInputRef.current?.focus()
            quantityModalInputRef.current?.select()
        }, 0)
    }, [quantityModalProduct])

    const resetDraftRow = () => {
        setSearchQuery('')
        setSuggestions([])
        setSelectedProduct(null)
        setQuantity('1')
        setAcceptanceCategory('')
        setAcceptancePurchasePrice('')
        setAcceptanceSellingPrice('')
    }

    const clearCurrentDraft = () => {
        clearPersistentState(draftStorageKey)
        setItems([])
        resetDraftRow()
        setManualSupplier('')
        setManualInvoiceNumber('')
        setManualComment('')
        setShipper('')
        setConsignee('')
        setError(null)
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

    const openQuantityModal = (product: Product, overrides: AddOverrides = {}) => {
        const category = isAcceptance
            ? String(overrides.category ?? acceptanceCategory ?? product.category ?? '').trim()
            : product.category

        const purchasePrice = isAcceptance
            ? String(overrides.purchasePrice ?? acceptancePurchasePrice ?? product.purchasePrice ?? '')
            : String(product.purchasePrice || 0)

        const rawSellingPrice = isAcceptance
            ? String(
                overrides.sellingPrice ??
                acceptanceSellingPrice ??
                calcSellingPrice(purchasePrice, category, product.name) ??
                ''
            )
            : String(product.sellingPrice || 0)

        const sellingPrice = isAcceptance
            ? normalizeIntegerPrice(rawSellingPrice)
            : rawSellingPrice

        const initialQuantity = normalizeQuantityInput(
            String(overrides.quantity ?? (quantity || '1')),
            product.unit
        ) || '1'

        setQuantityModalProduct(product)
        setQuantityModalQuantity(initialQuantity)
        setQuantityModalCategory(category)
        setQuantityModalPurchasePrice(purchasePrice)
        setQuantityModalSellingPrice(sellingPrice)
        setError(null)
    }

    const closeQuantityModal = () => {
        setQuantityModalProduct(null)
        setQuantityModalQuantity('1')
        setQuantityModalCategory('')
        setQuantityModalPurchasePrice('')
        setQuantityModalSellingPrice('')

        window.setTimeout(() => {
            scanInputRef.current?.focus()
        }, 0)
    }

    const addProductToItems = (product: Product, overrides: AddOverrides = {}): boolean => {
        const rawQuantity = normalizeQuantityInput(
            String(overrides.quantity ?? quantity),
            product.unit
        )
        const quantityError = validateQuantityForUnit(rawQuantity, product.unit)

        if (quantityError) {
            setError(quantityError)
            return false
        }

        const qty = parseNumber(rawQuantity)

        const existingItem = items.find(item => item.product.id === product.id)
        const existingQty = existingItem ? parseNumber(existingItem.quantity) : 0
        const newQty = existingQty + qty

        if (isShipment && newQty > Number(product.stock)) {
            setError(`Недостаточно остатка. Сейчас доступно: ${product.stock} ${unitLabel(product.unit)}`)
            return false
        }

        const category = isAcceptance
            ? String(overrides.category ?? acceptanceCategory ?? product.category ?? '').trim()
            : product.category

        const purchasePrice = isAcceptance
            ? String(overrides.purchasePrice ?? acceptancePurchasePrice ?? product.purchasePrice ?? '')
            : String(product.purchasePrice || 0)

        const rawSellingPrice = isAcceptance
            ? String(
                overrides.sellingPrice ??
                acceptanceSellingPrice ??
                calcSellingPrice(purchasePrice, category, product.name) ??
                ''
            )
            : String(product.sellingPrice || 0)

        const sellingPrice = isAcceptance
            ? normalizeIntegerPrice(rawSellingPrice)
            : rawSellingPrice

        if (isAcceptance) {
            const purchasePriceNumber = parseNumber(purchasePrice)
            const sellingPriceNumber = parseNumber(sellingPrice)

            if (!category) {
                setError('Введите категорию')
                return false
            }

            if (!Number.isFinite(purchasePriceNumber) || purchasePriceNumber <= 0) {
                setError('Введите корректную цену закупки')
                return false
            }

            if (!Number.isFinite(sellingPriceNumber) || sellingPriceNumber <= 0) {
                setError('Цена продажи рассчитана некорректно')
                return false
            }
        }

        const newItem: MovementItem = {
            product,
            quantity: rawQuantity,
            category,
            purchasePrice,
            sellingPrice,
        }

        setItems(prev => {
            const existing = prev.find(item => item.product.id === product.id)

            if (!existing) {
                return [newItem, ...prev]
            }

            const updatedItem: MovementItem = {
                ...existing,
                quantity: isWeightUnit(product.unit)
                    ? String(Math.round((parseNumber(existing.quantity) + qty) * 1000) / 1000)
                    : String(parseNumber(existing.quantity) + qty),
                category: isAcceptance ? category || existing.category : existing.category,
                purchasePrice: isAcceptance ? purchasePrice || existing.purchasePrice : existing.purchasePrice,
                sellingPrice: isAcceptance ? sellingPrice || existing.sellingPrice : existing.sellingPrice,
            }

            return [
                updatedItem,
                ...prev.filter(item => item.product.id !== product.id),
            ]
        })

        setError(null)
        resetDraftRow()
        return true
    }

    const confirmQuantityModal = () => {
        if (!quantityModalProduct) {
            return
        }

        const added = addProductToItems(quantityModalProduct, {
            quantity: quantityModalQuantity,
            category: quantityModalCategory,
            purchasePrice: quantityModalPurchasePrice,
            sellingPrice: quantityModalSellingPrice,
        })

        if (added) {
            closeQuantityModal()
        }
    }

    const handleQuantityModalKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') {
            return
        }

        event.preventDefault()
        confirmQuantityModal()
    }

    const handleSuggestionClick = (product: Product) => {
        const category = isAcceptance
            ? String(product.category || '').trim()
            : product.category

        const purchasePrice = isAcceptance
            ? String(product.purchasePrice || '')
            : String(product.purchasePrice || 0)

        const sellingPrice = isAcceptance
            ? calcSellingPrice(purchasePrice, category, product.name)
            : String(product.sellingPrice || 0)

        openQuantityModal(product, {
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
                const products = await searchProducts(query)

                setSuggestions(products)
                product = findBestProduct(products, query)
            }

            if (!product) {
                setError('Товар не найден')
                return
            }

            const category = isAcceptance
                ? String(acceptanceCategory || product.category || '').trim()
                : product.category

            const purchasePrice = isAcceptance
                ? String(acceptancePurchasePrice || product.purchasePrice || '')
                : String(product.purchasePrice || 0)

            const sellingPrice = isAcceptance
                ? normalizeIntegerPrice(acceptanceSellingPrice || calcSellingPrice(purchasePrice, category, product.name))
                : String(product.sellingPrice || 0)

            openQuantityModal(product, {
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
                    ? { ...item, quantity: normalizeQuantityInput(value, item.product.unit) }
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

    const updateItemSellingPrice = (productId: number, sellingPrice: string) => {
        setItems(prev =>
            prev.map(item =>
                item.product.id === productId
                    ? { ...item, sellingPrice }
                    : item
            )
        )
    }

    const normalizeItemSellingPrice = (productId: number, sellingPrice: string) => {
        updateItemSellingPrice(productId, normalizeIntegerPrice(sellingPrice))
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
            const quantityError = validateQuantityForUnit(item.quantity, item.product.unit)

            if (quantityError) {
                return `${quantityError} у товара "${item.product.name}"`
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

    const buildAcceptanceDocumentHtml = (documentNumber: string, rows: MovementItem[]) => {
        const date = new Date().toLocaleDateString('ru-RU')
        const supplierName = effectiveSupplier?.trim() || '-'
        const invoice = effectiveInvoiceNumber?.trim() || '-'
        const note = effectiveComment?.trim() || '-'

        const rowsHtml = rows.map((item, index) => {
            const qty = parseNumber(item.quantity)
            const purchasePrice = parseNumber(item.purchasePrice)
            const sellingPrice = parseNumber(item.sellingPrice)
            const purchaseSum = qty * purchasePrice
            const sellingSum = qty * sellingPrice

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${escapeHtml(item.product.name)}</td>
                    <td>${escapeHtml(item.product.barcode || '-')}</td>
                    <td>${escapeHtml(item.category || item.product.category || '-')}</td>
                    <td>${unitLabel(item.product.unit)}</td>
                    <td>${qty}</td>
                    <td>${money(purchasePrice)}</td>
                    <td>${money(purchaseSum)}</td>
                    <td>${money(sellingPrice)}</td>
                    <td>${money(sellingSum)}</td>
                </tr>
            `
        }).join('')

        const totalPurchase = rows.reduce((sum, item) => {
            return sum + parseNumber(item.quantity) * parseNumber(item.purchasePrice)
        }, 0)

        const totalSelling = rows.reduce((sum, item) => {
            return sum + parseNumber(item.quantity) * parseNumber(item.sellingPrice)
        }, 0)

        return `
            <!doctype html>
            <html lang="ru">
            <head>
                <meta charset="utf-8" />
                <title>Приёмка ${escapeHtml(documentNumber)}</title>
                <style>
                    * {
                        box-sizing: border-box;
                    }

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

                    th {
                        background: #f3f4f6;
                    }

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

                    @media print {
                        body {
                            margin: 12mm;
                        }
                    }
                </style>
            </head>
            <body>
                <h1>Акт приёмки товара № ${escapeHtml(documentNumber)}</h1>

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
                        <strong>Поставщик:</strong>
                        <div class="line">${escapeHtml(supplierName)}</div>
                    </div>

                    <div>
                        <strong>Накладная поставщика:</strong>
                        <div class="line">${escapeHtml(invoice)}</div>
                    </div>

                    <div style="grid-column: 1 / -1;">
                        <strong>Комментарий:</strong>
                        <div class="line">${escapeHtml(note)}</div>
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
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>

                <div class="totals">
                    <div class="total-box">Итого закупка: ${money(totalPurchase)}</div>
                    <div class="total-box">Итого продажа: ${money(totalSelling)}</div>
                </div>

                <div class="signatures">
                    <div class="signature-line">Сдал / поставщик</div>
                    <div class="signature-line">Принял</div>
                </div>
            </body>
            </html>
        `
    }

    const printAcceptanceDocument = (documentNumber: string, rows: MovementItem[]) => {
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
        iframeDocument.write(buildAcceptanceDocumentHtml(documentNumber, rows))
        iframeDocument.close()

        iframeWindow.focus()

        setTimeout(() => {
            iframeWindow.print()

            setTimeout(() => {
                document.body.removeChild(iframe)
            }, 1000)
        }, 300)
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

    const handleShipmentCommit = async (snapshot: MovementItem[]) => {
        const response = await fetch('/api/shipment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                shipper,
                consignee,
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

        let data: OperationApiResult | null = null

        if (text) {
            try {
                data = JSON.parse(text)
            } catch {
                data = null
            }
        }

        if (!response.ok) {
            console.error('Shipment API error:', {
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

        printWaybill(data.number, snapshot)

        window.dispatchEvent(new CustomEvent('shipment-history-updated', {
            detail: data,
        }))

        await onShipmentSaved?.(data)

        return data
    }

    const handleAcceptanceCommit = async (snapshot: MovementItem[]) => {
        const response = await fetch('/api/products/import/commit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                rows: buildManualAcceptanceRows(snapshot),
                sourceFileName: 'Ручная приёмка',
                supplier: effectiveSupplier,
                invoiceNumber: effectiveInvoiceNumber,
                comment: effectiveComment || 'Создано через ручную приёмку',
            }),
        })

        const text = await response.text()

        let data: AcceptanceCommitResult | null = null

        if (text) {
            try {
                data = JSON.parse(text)
            } catch {
                data = null
            }
        }

        if (!response.ok) {
            console.error('Manual acceptance API error:', {
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

        if (!data) {
            throw new Error('API не вернул данные по приёмке')
        }

        const documentNumber = data.acceptanceNumber || data.number || String(data.acceptanceId || '')

        if (!documentNumber) {
            throw new Error('API не вернул номер документа приёмки')
        }

        window.dispatchEvent(new CustomEvent('acceptance-history-updated', {
            detail: data,
        }))

        await onAcceptanceSaved?.(data)

        printAcceptanceDocument(documentNumber, snapshot)

        alert(`Приёмка сохранена в историю и отправлена на печать. Номер: ${documentNumber}`)

        return data
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

            if (isShipment) {
                await handleShipmentCommit(snapshot)
            } else {
                await handleAcceptanceCommit(snapshot)
            }

            clearPersistentState(draftStorageKey)
            setItems([])
            resetDraftRow()
            setManualSupplier('')
            setManualInvoiceNumber('')
            setManualComment('')
            setShipper('')
            setConsignee('')
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
    return (
        <div className="w-full rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-bold text-gray-900">
                    {isShipment ? 'Отгрузки' : 'Ручная приёмка'}
                </h1>

                <p className="text-base text-gray-500">
                    Сканируйте штрихкод или введите название товара. После сканирования откроется окно количества.
                </p>
            </div>


            {shouldShowAcceptanceDocumentFields && (
                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <input
                        value={manualSupplier}
                        onChange={(e) => setManualSupplier(e.target.value)}
                        placeholder="Поставщик"
                        className={inputClass}
                    />

                    <input
                        value={manualInvoiceNumber}
                        onChange={(e) => setManualInvoiceNumber(e.target.value)}
                        placeholder="Номер накладной"
                        className={inputClass}
                    />

                    <input
                        value={manualComment}
                        onChange={(e) => setManualComment(e.target.value)}
                        placeholder="Комментарий"
                        className={inputClass}
                    />
                </div>
            )}


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

            <div className="mt-6 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                    <div className="flex-1">
                        <label className="mb-2 block text-sm font-bold uppercase tracking-wide text-blue-700">
                            Сканер / поиск товара
                        </label>

                        <div className="relative">
                            <input
                                ref={scanInputRef}
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value)
                                    setSelectedProduct(null)
                                }}
                                onKeyDown={handleDraftKeyDown}
                                placeholder="Сканируйте штрихкод или введите название и нажмите Enter"
                                autoComplete="off"
                                className="w-full rounded-2xl border-2 border-blue-200 bg-white px-5 py-4 pr-14 font-mono text-xl font-semibold tracking-wide text-gray-900 outline-none transition-colors placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                            />

                            <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-2xl text-blue-400">
                                ⌁
                            </div>
                        </div>

                        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-sm text-blue-700">
                                {isSearchLoading
                                    ? 'Ищу товар в базе...'
                                    : previewProduct
                                        ? `Найден: ${previewProduct.name}. Нажмите Enter, чтобы указать количество.`
                                        : 'После сканирования откроется окно количества. Товар добавится наверх таблицы.'}
                            </div>

                            <button
                                type="button"
                                onClick={() => void handleAddFromDraft()}
                                disabled={isSearchLoading || searchQuery.trim().length < 2}
                                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Открыть количество
                            </button>
                        </div>
                    </div>

                    {previewProduct && (
                        <div className="w-full rounded-2xl border border-blue-100 bg-white p-4 xl:w-[360px]">
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
                                    <span>{`${previewProduct.stock} ${unitLabel(previewProduct.unit)}`}</span>
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
                                onMouseDown={(e) => {
                                    e.preventDefault()
                                    handleSuggestionClick(product)
                                }}
                                className="flex w-full items-center justify-between gap-4 border-b border-gray-100 px-4 py-4 text-left text-base hover:bg-blue-50"
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
                                    Остаток: {product.stock} {unitLabel(product.unit)}
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

                        {isAcceptance && (
                            <>
                                <th className="w-[220px] p-4 text-left">Категория</th>
                                <th className="w-[160px] p-4 text-left">Закупка</th>
                                <th className="w-[160px] p-4 text-left">Продажа</th>
                            </>
                        )}

                        <th className="w-[190px] p-4 text-left">Количество</th>
                        <th className="w-[170px] p-4 text-left">
                            {isShipment ? 'Сумма' : 'Сумма закупки'}
                        </th>
                        <th className="w-[130px] p-4 text-right">Действие</th>
                    </tr>
                    </thead>

                    <tbody>
                    {items.length === 0 && (
                        <tr>
                            <td colSpan={isAcceptance ? 9 : 7} className="p-8 text-center text-base text-gray-500">
                                Товары пока не добавлены. Сканируйте штрихкод в поле выше.
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
                                                onChange={(e) => updateItemSellingPrice(item.product.id, e.target.value)}
                                                onBlur={(e) => normalizeItemSellingPrice(item.product.id, e.target.value)}
                                                type="text"
                                                inputMode="numeric"
                                                className={tableInputClass}
                                            />
                                        </td>
                                    </>
                                )}

                                <td className="p-4">
                                    <div className="flex items-center gap-2 whitespace-nowrap">
                                        <input
                                            value={item.quantity}
                                            onChange={(e) => updateItemQty(item.product.id, e.target.value)}
                                            {...getQuantityInputProps(item.product.unit)}
                                            className={quantityTableInputClass}
                                        />

                                        <span className="shrink-0 text-gray-500">
                                            {unitLabel(item.product.unit)}
                                        </span>
                                    </div>
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
                <div>
                    <div className="text-2xl font-bold text-gray-900">
                        Итого: {money(total)}
                    </div>

                    {isDraftHydrated && (items.length > 0 || searchQuery || acceptanceCategory || acceptancePurchasePrice || acceptanceSellingPrice) && (
                        <div className="mt-1 text-sm text-gray-500">
                            Черновик сохранён в браузере. Можно уйти со страницы или закрыть вкладку.
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                        type="button"
                        onClick={clearCurrentDraft}
                        disabled={isCommitLoading}
                        className="rounded-xl border border-gray-300 bg-white px-6 py-3 text-base font-semibold text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Очистить черновик
                    </button>

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
                                : 'Сохранить и распечатать приёмку'}
                    </button>
                </div>
            </div>

            {quantityModalProduct && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 px-3 py-3 sm:px-4"
                    onMouseDown={closeQuantityModal}
                >
                    <div
                        className="my-auto flex max-h-[calc(100dvh-24px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
                            <div className="min-w-0">
                                <div className="text-xs font-bold uppercase tracking-wide text-blue-600">
                                    {isShipment ? 'Отгрузка товара' : 'Приёмка товара'}
                                </div>

                                <h2 className="mt-0.5 text-lg font-bold text-gray-900">
                                    Укажите количество
                                </h2>
                            </div>

                            <button
                                type="button"
                                onClick={closeQuantityModal}
                                className="text-2xl leading-none text-gray-400 hover:text-gray-600"
                            >
                                ×
                            </button>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                            <div className="mb-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                                <div className="line-clamp-2 text-base font-bold leading-5 text-gray-900">
                                    {quantityModalProduct.name}
                                </div>

                                <div className="mt-2 grid grid-cols-1 gap-1.5 text-xs text-gray-600 sm:grid-cols-2">
                                    <div className="min-w-0 truncate">
                                        <span className="text-gray-400">ШК:</span>{' '}
                                        <span className="font-mono">{quantityModalProduct.barcode || '—'}</span>
                                    </div>

                                    <div>
                                        <span className="text-gray-400">Остаток:</span>{' '}
                                        {quantityModalProduct.stock} {unitLabel(quantityModalProduct.unit)}
                                    </div>

                                    <div className="min-w-0 truncate">
                                        <span className="text-gray-400">Категория:</span>{' '}
                                        {quantityModalProduct.category || '—'}
                                    </div>

                                    <div>
                                        <span className="text-gray-400">Ед.:</span>{' '}
                                        {unitLabel(quantityModalProduct.unit)}
                                    </div>
                                </div>
                            </div>

                            {isAcceptance && (
                                <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                                    <div className="sm:col-span-3">
                                        <label className="mb-1 block text-xs font-medium text-gray-700">
                                            Категория
                                        </label>

                                        <input
                                            value={quantityModalCategory}
                                            onChange={(e) => {
                                                const category = e.target.value
                                                setQuantityModalCategory(category)
                                                setQuantityModalSellingPrice(
                                                    calcSellingPrice(quantityModalPurchasePrice, category, quantityModalProduct.name)
                                                )
                                            }}
                                            onKeyDown={handleQuantityModalKeyDown}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-gray-700">
                                            Закупка
                                        </label>

                                        <input
                                            value={quantityModalPurchasePrice}
                                            onChange={(e) => {
                                                const purchasePrice = e.target.value
                                                setQuantityModalPurchasePrice(purchasePrice)
                                                setQuantityModalSellingPrice(
                                                    calcSellingPrice(purchasePrice, quantityModalCategory, quantityModalProduct.name)
                                                )
                                            }}
                                            onKeyDown={handleQuantityModalKeyDown}
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-gray-700">
                                            Продажа
                                        </label>

                                        <input
                                            value={quantityModalSellingPrice}
                                            onChange={(e) => setQuantityModalSellingPrice(e.target.value)}
                                            onBlur={(e) => setQuantityModalSellingPrice(normalizeIntegerPrice(e.target.value))}
                                            onKeyDown={handleQuantityModalKeyDown}
                                            type="text"
                                            inputMode="numeric"
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>

                                    <div className="flex items-end rounded-lg bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500">
                                        Наценка: {isBeerProduct(quantityModalCategory, quantityModalProduct.name) ? '+35%' : '+30%'}
                                    </div>
                                </div>
                            )}

                            <div className="mb-3">
                                <label className="mb-1 block text-sm font-bold text-gray-700">
                                    Количество, {unitLabel(quantityModalProduct.unit)}
                                </label>

                                <input
                                    ref={quantityModalInputRef}
                                    value={quantityModalQuantity}
                                    onChange={(e) => setQuantityModalQuantity(
                                        normalizeQuantityInput(e.target.value, quantityModalProduct.unit)
                                    )}
                                    onKeyDown={handleQuantityModalKeyDown}
                                    {...getQuantityInputProps(quantityModalProduct.unit)}
                                    className="w-full rounded-xl border-2 border-blue-200 px-4 py-3 text-2xl font-bold text-gray-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                                />

                                <div className="mt-1.5 text-xs text-gray-500">
                                    {isWeightUnit(quantityModalProduct.unit)
                                        ? 'Весовой товар: можно вводить дробный вес до 3 знаков, например 0.350.'
                                        : 'Штучный товар: только целое количество, стрелки меняют по 1 шт.'}
                                    {' '}Enter — добавить в верх таблицы.
                                </div>
                            </div>

                            <div className="rounded-xl bg-blue-50 p-3">
                                <div className="text-xs text-blue-700">
                                    Предварительная сумма:
                                </div>

                                <div className="text-2xl font-bold text-blue-800">
                                    {money(
                                        parseNumber(quantityModalQuantity) *
                                        (isShipment
                                            ? parseNumber(quantityModalProduct.sellingPrice || 0)
                                            : parseNumber(quantityModalPurchasePrice || quantityModalProduct.purchasePrice || 0))
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 border-t border-gray-100 px-4 py-3 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={closeQuantityModal}
                                className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                            >
                                Отмена
                            </button>

                            <button
                                type="button"
                                onClick={confirmQuantityModal}
                                className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white ${isShipment ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                            >
                                Добавить
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    )
}
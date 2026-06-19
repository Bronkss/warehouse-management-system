'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import System from '../system/page'
import { useModal } from '../hooks/useModal'
import Modal from '../components/Modal'
import AddProductForm from '../components/AddProductForm'
import CustomSelect from '../components/CustomSelect'
import { getBarcodeDisplay } from '../utils/barcodes'
import type { Product } from '../types/product'
import {
    deleteProductFromIndexedDb,
    getAllProductsFromIndexedDb,
    getProductsFromIndexedDb,
    saveProductToIndexedDb,
    saveProductsToIndexedDb,
    searchProductsInIndexedDb,
} from '../lib/indexed-db/products-db'
import { syncAllProductsToIndexedDb } from '../lib/sync/products-sync'

const PAGE_LIMIT = 20
const FULL_SYNC_PAGE_LIMIT = 100
const DEFAULT_PRODUCT_IMAGE = '/icons/products.jpg'

async function uploadProductImage(file: File): Promise<string> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch('/api/products/images', {
        method: 'POST',
        body: formData,
    })

    const data = await response.json()

    if (!response.ok) {
        throw new Error(data.message || 'Не удалось загрузить изображение')
    }

    return data.url as string
}

async function resolveProductImage(formData: ProductFormData): Promise<string> {
    if (formData.imageFile) {
        return uploadProductImage(formData.imageFile)
    }

    return formData.image || DEFAULT_PRODUCT_IMAGE
}


interface ProductFormData {
    name: string
    category: string
    barcode: string
    purchasePrice: string
    sellingPrice: string
    unit: 'piece' | 'weight'
    stock: string
    minStock: string
    image: string
    imageFile?: File | null
}

interface ProductsApiResponse {
    items: Product[]
    nextCursor: number | null
    hasMore: boolean
    limit: number
    durationMs?: number
}

interface ProductsApiError {
    message?: string
}

const ALL_CATEGORIES = [
    'Бакалея',
    'Алкоголь',
    'Сигареты',
    'Молочные продукты',
    'Хлебобулочные изделия',
    'Мясо и птица',
    'Колбасы и мясная охлажденная продукция',
    'Рыба и морепродукты',
    'Овощи и фрукты',
    'Напитки',
    'Кондитерские изделия',
    'Замороженные продукты',
    'Консервы',
    'Соусы и приправы',
    'Чай и кофе',
    'Снэки',
    'Бытовая химия',
    'Косметика и гигиена',
    'Товары для дома',
    'Другое',
]

export default function Products() {
    const { isOpen, open, close } = useModal()

    const [selectedCategory, setSelectedCategory] = useState<string>('')
    const [searchQuery, setSearchQuery] = useState<string>('')
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('')

    const [products, setProducts] = useState<Product[]>([])
    const [nextCursor, setNextCursor] = useState<number | null>(null)
    const [hasMore, setHasMore] = useState(false)

    const [isLoading, setIsLoading] = useState(true)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [isIndexedDbSyncing, setIsIndexedDbSyncing] = useState(false)
    const [indexedDbLoadedCount, setIndexedDbLoadedCount] = useState(0)
    const [indexedDbSyncError, setIndexedDbSyncError] = useState<string | null>(null)

    const didStartFullSyncRef = useRef(false)
    const syncAbortControllerRef = useRef<AbortController | null>(null)
    const debouncedSearchQueryRef = useRef(debouncedSearchQuery)

    const [editingProduct, setEditingProduct] = useState<Product | null>(null)

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery.trim())
        }, 300)

        return () => clearTimeout(timeoutId)
    }, [searchQuery])

    useEffect(() => {
        debouncedSearchQueryRef.current = debouncedSearchQuery
    }, [debouncedSearchQuery])

    const refreshProductsFromIndexedDb = useCallback(async () => {
        const currentSearch = debouncedSearchQueryRef.current.trim()

        const indexedDbProducts = currentSearch
            ? await searchProductsInIndexedDb(currentSearch, Number.MAX_SAFE_INTEGER)
            : await getAllProductsFromIndexedDb()

        setProducts(indexedDbProducts)
        setNextCursor(null)
        setHasMore(false)
        setError(null)
    }, [])

    const startFullIndexedDbSync = useCallback(() => {
        if (didStartFullSyncRef.current) {
            return
        }

        didStartFullSyncRef.current = true

        const controller = new AbortController()
        syncAbortControllerRef.current = controller

        setIsIndexedDbSyncing(true)
        setIndexedDbSyncError(null)

        syncAllProductsToIndexedDb({
            pageSize: FULL_SYNC_PAGE_LIMIT,
            signal: controller.signal,
            onProgress: ({ loaded, finished }) => {
                if (controller.signal.aborted) {
                    return
                }

                setIndexedDbLoadedCount(loaded)
                setIsIndexedDbSyncing(!finished)
            },
        })
            .then(async result => {
                if (controller.signal.aborted) {
                    return
                }

                setIndexedDbLoadedCount(result.loaded)
                setIsIndexedDbSyncing(false)

                /**
                 * Важный момент:
                 * после полной фоновой синхронизации перечитываем товары из IndexedDB
                 * и обновляем React state. За счёт этого страница обновляется сама,
                 * без window.location.reload() и без ручной перезагрузки браузера.
                 */
                await refreshProductsFromIndexedDb()
            })
            .catch(error => {
                if (error instanceof Error && error.name === 'AbortError') {
                    return
                }

                console.error('IndexedDB products sync error:', error)
                setIsIndexedDbSyncing(false)
                setIndexedDbSyncError(
                    error instanceof Error
                        ? error.message
                        : 'Не удалось синхронизировать IndexedDB'
                )
            })
    }, [refreshProductsFromIndexedDb])

    useEffect(() => {
        let cancelled = false

        async function hydrateProductsFromIndexedDb() {
            try {
                const cachedProducts = await getProductsFromIndexedDb(PAGE_LIMIT)

                if (cancelled || cachedProducts.length === 0) {
                    return
                }

                setProducts(cachedProducts)
                setIsLoading(false)
            } catch (error) {
                console.warn('IndexedDB hydrate products error:', error)
            }
        }

        hydrateProductsFromIndexedDb()

        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        return () => {
            syncAbortControllerRef.current?.abort()
        }
    }, [])

    const fetchProducts = useCallback(
        async ({
                   mode,
                   search,
                   cursor,
                   signal,
               }: {
            mode: 'replace' | 'append'
            search: string
            cursor?: number | null
            signal?: AbortSignal
        }) => {
            try {
                if (mode === 'replace') {
                    setIsLoading(true)
                    setError(null)
                } else {
                    setIsLoadingMore(true)
                }

                const params = new URLSearchParams()
                params.set('limit', String(PAGE_LIMIT))

                if (search) {
                    params.set('search', search)
                }

                if (mode === 'append' && cursor) {
                    params.set('cursor', String(cursor))
                }

                const response = await fetch(`/api/products?${params.toString()}`, {
                    method: 'GET',
                    cache: 'no-store',
                    signal,
                })

                const data = (await response.json()) as ProductsApiResponse | ProductsApiError

                if (!response.ok) {
                    throw new Error(
                        'message' in data && data.message
                            ? data.message
                            : 'Не удалось загрузить товары'
                    )
                }

                const payload = data as ProductsApiResponse

                setProducts(prevProducts => {
                    if (mode === 'append') {
                        const existingIds = new Set(prevProducts.map(product => product.id))
                        const newItems = payload.items.filter(product => !existingIds.has(product.id))

                        return [...prevProducts, ...newItems]
                    }

                    return payload.items
                })

                setNextCursor(payload.nextCursor)
                setHasMore(payload.hasMore)
                setError(null)

                void saveProductsToIndexedDb(payload.items).catch(error => {
                    console.warn('IndexedDB save products page error:', error)
                })

                if (mode === 'replace' && !search) {
                    startFullIndexedDbSync()
                }
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') {
                    return
                }

                console.error(error)

                if (mode === 'replace') {
                    try {
                        const cachedProducts = search
                            ? await searchProductsInIndexedDb(search, PAGE_LIMIT)
                            : await getProductsFromIndexedDb(PAGE_LIMIT)

                        if (cachedProducts.length > 0) {
                            setProducts(cachedProducts)
                            setNextCursor(null)
                            setHasMore(false)
                            setError(null)
                            return
                        }
                    } catch (indexedDbError) {
                        console.warn('IndexedDB fallback products error:', indexedDbError)
                    }

                    setProducts([])
                    setNextCursor(null)
                    setHasMore(false)
                }

                setError(error instanceof Error ? error.message : 'Ошибка загрузки товаров')
            } finally {
                if (!signal?.aborted) {
                    if (mode === 'replace') {
                        setIsLoading(false)
                    } else {
                        setIsLoadingMore(false)
                    }
                }
            }
        },
        [startFullIndexedDbSync]
    )

    useEffect(() => {
        const controller = new AbortController()

        fetchProducts({
            mode: 'replace',
            search: debouncedSearchQuery,
            cursor: null,
            signal: controller.signal,
        })

        return () => controller.abort()
    }, [debouncedSearchQuery, fetchProducts])

    const handleLoadMore = useCallback(() => {
        if (!hasMore || !nextCursor || isLoadingMore) {
            return
        }

        fetchProducts({
            mode: 'append',
            search: debouncedSearchQuery,
            cursor: nextCursor,
        })
    }, [debouncedSearchQuery, fetchProducts, hasMore, isLoadingMore, nextCursor])

    const filteredProducts = useMemo(() => {
        if (!selectedCategory) {
            return products
        }

        return products.filter(product => product.category === selectedCategory)
    }, [products, selectedCategory])

    const categoryCounts = useMemo(() => {
        return products.reduce<Record<string, number>>((acc, product) => {
            acc[product.category] = (acc[product.category] || 0) + 1
            return acc
        }, {})
    }, [products])

    const availableCategories = useMemo(() => {
        return ALL_CATEGORIES.filter(category => categoryCounts[category] > 0)
    }, [categoryCounts])

    const categoryOptions = useMemo(() => {
        return [
            { value: '', label: 'Все категории' },
            ...availableCategories.map(category => ({
                value: category,
                label: category,
            })),
        ]
    }, [availableCategories])

    const stockStats = useMemo(() => {
        return {
            empty: filteredProducts.filter(product => product.stock === 0).length,
            low: filteredProducts.filter(
                product => product.stock > 0 && product.stock <= product.minStock
            ).length,
            available: filteredProducts.filter(product => product.stock > product.minStock).length,
        }
    }, [filteredProducts])

    const handleOpenAddProduct = () => {
        setEditingProduct(null)
        open()
    }

    const handleOpenEditProduct = (product: Product) => {
        setEditingProduct(product)
        open()
    }

    const handleAddProduct = async (formData: ProductFormData) => {
        try {
            const image = await resolveProductImage(formData)

            const response = await fetch('/api/products', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: formData.name,
                    category: formData.category,
                    barcode: formData.barcode,
                    purchasePrice: formData.purchasePrice,
                    sellingPrice: formData.sellingPrice,
                    unit: formData.unit,
                    stock: formData.stock,
                    minStock: formData.minStock,
                    image,
                }),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.message || 'Не удалось добавить товар')
            }

            const createdProduct: Product = {
                ...(data as Product),
                image: (data as Product).image || DEFAULT_PRODUCT_IMAGE,
            }

            setProducts(prevProducts => [
                createdProduct,
                ...prevProducts.filter(product => product.id !== createdProduct.id),
            ])

            void saveProductToIndexedDb(createdProduct).catch(error => {
                console.warn('IndexedDB save created product error:', error)
            })

            close()
        } catch (error) {
            console.error(error)
            alert(error instanceof Error ? error.message : 'Ошибка добавления товара')
        }
    }

    const handleDeleteProduct = async (productId: number) => {
        const isConfirmed = confirm('Удалить этот товар?')

        if (!isConfirmed) {
            return
        }

        try {
            const response = await fetch(`/api/products/${productId}`, {
                method: 'DELETE',
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.message || 'Не удалось удалить товар')
            }

            setProducts(prevProducts =>
                prevProducts.filter(product => product.id !== productId)
            )

            setIndexedDbLoadedCount(prevCount => Math.max(prevCount - 1, 0))

            void deleteProductFromIndexedDb(productId).catch(error => {
                console.warn('IndexedDB delete product error:', error)
            })
        } catch (error) {
            console.error(error)
            alert(error instanceof Error ? error.message : 'Ошибка удаления товара')
        }
    }

    const handleEditProduct = async (formData: ProductFormData) => {
        if (!editingProduct) {
            return
        }

        try {
            const image = await resolveProductImage(formData)

            const response = await fetch(`/api/products/${editingProduct.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: formData.name,
                    category: formData.category,
                    barcode: formData.barcode,
                    purchasePrice: formData.purchasePrice,
                    sellingPrice: formData.sellingPrice,
                    unit: formData.unit,
                    stock: formData.stock,
                    minStock: formData.minStock,
                    image,
                }),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.message || 'Не удалось изменить товар')
            }

            const updatedProduct: Product = {
                ...editingProduct,
                ...(data as Product),
                image: (data as Product).image || DEFAULT_PRODUCT_IMAGE,
            }

            setProducts(prevProducts =>
                prevProducts.map(product =>
                    product.id === editingProduct.id ? updatedProduct : product
                )
            )

            void saveProductToIndexedDb(updatedProduct).catch(error => {
                console.warn('IndexedDB save updated product error:', error)
            })

            setEditingProduct(null)
            close()
        } catch (error) {
            console.error(error)
            alert(error instanceof Error ? error.message : 'Ошибка редактирования товара')
        }
    }

    const getStockStatus = (product: Product) => {
        if (product.stock === 0) {
            return {
                color: 'text-red-700',
                label: 'Нет в наличии',
                bgColor: 'bg-red-50',
                barColor: 'bg-red-500',
            }
        }

        if (product.stock <= product.minStock) {
            return {
                color: 'text-orange-700',
                label: 'Заканчивается',
                bgColor: 'bg-orange-50',
                barColor: 'bg-orange-500',
            }
        }

        if (product.stock <= product.minStock * 1.5) {
            return {
                color: 'text-yellow-700',
                label: 'Мало',
                bgColor: 'bg-yellow-50',
                barColor: 'bg-yellow-500',
            }
        }

        return {
            color: 'text-green-700',
            label: 'В наличии',
            bgColor: 'bg-green-50',
            barColor: 'bg-green-500',
        }
    }

    const formatStock = (product: Product): string => {
        if (product.unit === 'weight') {
            return `${product.stock.toFixed(1)} кг`
        }

        return `${product.stock} шт.`
    }

    const hasProducts = filteredProducts.length > 0
    const showEmptyState = !isLoading && !error && !hasProducts

    return (
        <div className="products-page">
            <System>
                <section className="products-layout w-screen h-auto flex gap-6 p-6 overflow-x-clip">
                    <aside className="products-sidebar w-80 flex-shrink-0 bg-white rounded-lg shadow-md p-6 h-fit sticky top-6">
                        <button
                            className="products-add-button w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors font-semibold mb-8"
                            onClick={handleOpenAddProduct}
                        >
                            + Добавить товар
                        </button>

                        <nav className="products-categories">
                            <h3 className="products-sidebar-title text-lg font-semibold text-gray-700 mb-4">
                                Категории
                            </h3>

                            <ul className="products-category-list space-y-1">
                                <li>
                                    <button
                                        onClick={() => setSelectedCategory('')}
                                        className={`products-category-button w-full text-left px-4 py-2 rounded-lg transition-colors ${
                                            selectedCategory === ''
                                                ? 'bg-blue-100 text-blue-700 font-medium'
                                                : 'text-gray-700 hover:bg-gray-100'
                                        }`}
                                    >
                                        Все категории ({products.length})
                                    </button>
                                </li>

                                {availableCategories.map(category => (
                                    <li key={category}>
                                        <button
                                            onClick={() => setSelectedCategory(category)}
                                            className={`products-category-button w-full text-left px-4 py-2 rounded-lg transition-colors ${
                                                selectedCategory === category
                                                    ? 'bg-blue-100 text-blue-700 font-medium'
                                                    : 'text-gray-700 hover:bg-gray-100'
                                            }`}
                                        >
                                            {category} ({categoryCounts[category] || 0})
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </nav>

                        <div className="products-stock-info mt-6 pt-6 border-t">
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">Остатки</h4>

                            <div className="products-stock-grid space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600">🔴 Нет в наличии:</span>
                                    <span className="font-semibold text-red-600">
                                        {stockStats.empty}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600">🟡 Заканчиваются:</span>
                                    <span className="font-semibold text-orange-600">
                                        {stockStats.low}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600">🟢 В наличии:</span>
                                    <span className="font-semibold text-green-600">
                                        {stockStats.available}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="products-loaded-info mt-6 pt-6 border-t">
                            <p className="text-xs text-gray-500 leading-relaxed">
                                <span>На экране: {products.length}</span>
                                <br />

                                <span>
                                    IndexedDB:{' '}
                                    {isIndexedDbSyncing
                                        ? `синхронизация, ${indexedDbLoadedCount}`
                                        : indexedDbLoadedCount > 0
                                            ? `сохранено ${indexedDbLoadedCount}`
                                            : 'ожидание синхронизации'}
                                </span>
                                <br />

                                <span>
                                    {hasMore ? 'Можно загрузить ещё с сервера.' : 'Текущая выдача загружена.'}
                                </span>

                                {indexedDbSyncError && (
                                    <>
                                        <br />
                                        <span className="text-red-500">{indexedDbSyncError}</span>
                                    </>
                                )}
                            </p>
                        </div>
                    </aside>

                    <main className="products-content flex-1 min-w-0">
                        <div className="products-topbar mb-6 flex gap-4">
                            <div className="products-search relative flex-1">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={event => setSearchQuery(event.target.value)}
                                    placeholder="Поиск товаров по названию или штрихкоду..."
                                    className="products-search-input w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />

                                <svg
                                    className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                    />
                                </svg>
                            </div>

                            <div className="products-select w-64">
                                <CustomSelect
                                    value={selectedCategory}
                                    onChange={setSelectedCategory}
                                    options={categoryOptions}
                                    placeholder="Все категории"
                                />
                            </div>
                        </div>

                        {selectedCategory && (
                            <div className="products-active-category mb-4 flex items-center gap-2">
                                <span className="text-sm text-gray-600">Категория:</span>

                                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                                    {selectedCategory}
                                </span>

                                <button
                                    onClick={() => setSelectedCategory('')}
                                    className="text-sm text-red-500 hover:text-red-700"
                                >
                                    ✕ Сбросить
                                </button>
                            </div>
                        )}

                        {isLoading && (
                            <div className="text-center py-12">
                                <p className="text-gray-500 text-lg">Загрузка товаров...</p>
                            </div>
                        )}

                        {error && (
                            <div className="text-center py-12">
                                <p className="text-red-500 text-lg mb-4">{error}</p>

                                <button
                                    onClick={() =>
                                        fetchProducts({
                                            mode: 'replace',
                                            search: debouncedSearchQuery,
                                            cursor: null,
                                        })
                                    }
                                    className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                                >
                                    Повторить
                                </button>
                            </div>
                        )}

                        {!isLoading && !error && hasProducts && (
                            <>
                                <div className="products-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                                    {filteredProducts.map(product => {
                                        const status = getStockStatus(product)

                                        return (
                                            <article
                                                key={product.id}
                                                className="product-card bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
                                            >
                                                <div className="product-image-wrap relative h-40 bg-gray-100">
                                                    <img
                                                        src={product.image || DEFAULT_PRODUCT_IMAGE}
                                                        alt={product.name}
                                                        loading="lazy"
                                                        decoding="async"
                                                        onError={event => {
                                                            event.currentTarget.src = DEFAULT_PRODUCT_IMAGE
                                                        }}
                                                        className="w-full h-full object-contain bg-white"
                                                    />

                                                    <div className="absolute top-2 left-2">
                                                        <span
                                                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                                product.unit === 'weight'
                                                                    ? 'bg-green-100 text-green-700'
                                                                    : 'bg-blue-100 text-blue-700'
                                                            }`}
                                                        >
                                                            {product.unit === 'weight' ? 'Весовой' : 'Штучный'}
                                                        </span>
                                                    </div>

                                                    <div
                                                        className={`absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-medium ${status.bgColor} ${status.color}`}
                                                    >
                                                        {status.label}
                                                    </div>
                                                </div>

                                                <div className="product-actions flex gap-2">
                                                    <button
                                                        onClick={() => handleOpenEditProduct(product)}
                                                        className="group flex-1 relative flex items-center justify-center gap-2 bg-gradient-to-br from-gray-50 to-gray-100 py-2.5 px-4 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(59,130,246,0.15)] transition-all duration-300 border border-gray-200/60 hover:border-blue-300 text-sm font-medium text-gray-700 hover:text-blue-600"
                                                    >
                                                        <span className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/0 to-blue-500/0 group-hover:from-blue-500/5 group-hover:via-blue-400/5 group-hover:to-blue-300/5 rounded-xl transition-all duration-500" />

                                                        <svg
                                                            className="w-4 h-4 transition-all duration-100 group-hover:-translate-y-0.5 group-hover:rotate-6"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            viewBox="0 0 24 24"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={1.8}
                                                                d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                                                            />
                                                        </svg>

                                                        <span className="font-medium tracking-wide">Изменить</span>
                                                    </button>

                                                    <button
                                                        onClick={() => handleDeleteProduct(product.id)}
                                                        className="group product-delete-button flex-1 relative flex items-center justify-center gap-2 bg-gradient-to-br from-gray-50 to-gray-100 py-2.5 px-4 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(239,68,68,0.15)] transition-all duration-300 border border-gray-200/60 hover:border-red-300 text-sm font-medium text-gray-700 hover:text-red-600"
                                                    >
                                                        <span className="absolute inset-0 bg-gradient-to-r from-red-500/0 via-red-500/0 to-red-500/0 group-hover:from-red-500/5 group-hover:via-red-400/5 group-hover:to-red-300/5 rounded-xl transition-all duration-500" />

                                                        <svg
                                                            className="w-4 h-4 transition-all duration-100 group-hover:-translate-y-0.5 group-hover:rotate-12"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            viewBox="0 0 24 24"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={1.8}
                                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                            />
                                                        </svg>
                                                    </button>
                                                </div>

                                                <div className="product-body p-4">
                                                    <h4 className="product-title font-semibold text-gray-800 text-lg mb-1">
                                                        {product.name}
                                                    </h4>

                                                    <p className="product-category text-sm text-gray-500 mb-2">
                                                        {product.category}
                                                    </p>

                                                    {product.barcode && (
                                                        <div className="mb-2 flex items-start gap-2">
                                                            <svg
                                                                className="w-4 h-4 text-gray-400 mt-0.5"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                viewBox="0 0 24 24"
                                                            >
                                                                <path
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    strokeWidth={1.5}
                                                                    d="M3 5h2M3 9h4M3 13h2M3 17h4M7 5h2M7 9h2M7 13h2M7 17h2M11 5h2M11 9h2M11 13h2M11 17h2M15 5h2M15 9h4M15 13h2M15 17h4M19 5h2M19 13h2"
                                                                />
                                                            </svg>

                                                            <span className="text-xs text-gray-500 font-mono break-all">
                                                                {getBarcodeDisplay(product.barcode)}
                                                            </span>
                                                        </div>
                                                    )}

                                                    <div className={`p-3 rounded-lg mb-3 ${status.bgColor}`}>
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-sm font-medium text-gray-700">
                                                                Остаток:
                                                            </span>

                                                            <span className={`font-bold ${status.color}`}>
                                                                {formatStock(product)}
                                                            </span>
                                                        </div>

                                                        <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                                                            <div
                                                                className={`h-2 rounded-full ${status.barColor}`}
                                                                style={{
                                                                    width: `${Math.min(
                                                                        100,
                                                                        (product.stock / Math.max(product.minStock * 2, 1)) * 100
                                                                    )}%`,
                                                                }}
                                                            />
                                                        </div>

                                                        <div className="flex justify-between mt-1">
                                                            <span className="text-xs text-gray-500">
                                                                Мин: {product.minStock}{' '}
                                                                {product.unit === 'weight' ? 'кг' : 'шт.'}
                                                            </span>

                                                            {product.stock <= product.minStock && product.stock > 0 && (
                                                                <span className="text-xs text-orange-600 font-medium">
                                                                    ⚠️ Пополнить
                                                                </span>
                                                            )}

                                                            {product.stock === 0 && (
                                                                <span className="text-xs text-red-600 font-medium">
                                                                    ❌ Отсутствует
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="product-prices flex items-center justify-between mt-3">
                                                        <div>
                                                            <span className="text-sm font-bold text-blue-600">
                                                                Цена продажи: {product.sellingPrice} ₽
                                                            </span>

                                                            <br />

                                                            <span className="text-sm font-bold text-blue-600">
                                                                Цена закупки: {product.purchasePrice} ₽
                                                            </span>

                                                            {product.category.toLowerCase().includes('пиво') && (
                                                                <span className="text-xs text-amber-600 ml-1">🍺</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </article>
                                        )
                                    })}
                                </div>

                                {hasMore && (
                                    <div className="flex justify-center mt-8">
                                        <button
                                            onClick={handleLoadMore}
                                            disabled={isLoadingMore}
                                            className="products-load-more px-6 py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                        >
                                            {isLoadingMore ? 'Загружаем...' : 'Показать ещё'}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}

                        {showEmptyState && (
                            <div className="text-center py-12">
                                <p className="text-gray-500 text-lg">Товары не найдены</p>

                                {selectedCategory && (
                                    <button
                                        onClick={() => setSelectedCategory('')}
                                        className="mt-2 text-blue-500 hover:text-blue-700"
                                    >
                                        Показать все загруженные товары
                                    </button>
                                )}
                            </div>
                        )}
                    </main>
                </section>
            </System>

            <Modal
                key={editingProduct ? editingProduct.id : 'new'}
                isOpen={isOpen}
                onClose={close}
                title={editingProduct ? 'Редактировать товар' : 'Добавить новый товар'}
            >
                <AddProductForm
                    onSave={editingProduct ? handleEditProduct : handleAddProduct}
                    onCancel={close}
                    initialData={
                        editingProduct
                            ? {
                                name: editingProduct.name,
                                category: editingProduct.category,
                                barcode: editingProduct.barcode,
                                purchasePrice: String(editingProduct.purchasePrice),
                                sellingPrice: String(editingProduct.sellingPrice),
                                unit: editingProduct.unit,
                                stock: String(editingProduct.stock),
                                minStock: String(editingProduct.minStock),
                                image: editingProduct.image || '',
                            }
                            : undefined
                    }
                />
            </Modal>

            <style jsx>{`
                @media (max-width: 767px) {
                    .products-page {
                        width: 100%;
                        overflow-x: hidden;
                    }

                    .products-layout {
                        width: 100%;
                        flex-direction: column;
                        gap: 16px;
                        padding: 16px;
                        overflow-x: hidden;
                    }

                    .products-sidebar {
                        position: static;
                        top: auto;
                        width: 100%;
                        padding: 16px;
                        border-radius: 18px;
                    }

                    .products-add-button {
                        margin-bottom: 16px;
                        border-radius: 14px;
                    }

                    .products-sidebar-title {
                        margin-bottom: 10px;
                        font-size: 16px;
                    }

                    .products-category-list {
                        max-height: 220px;
                        overflow-y: auto;
                        padding-right: 4px;
                    }

                    .products-category-button {
                        padding: 10px 12px;
                        font-size: 14px;
                        border-radius: 12px;
                    }

                    .products-stock-info {
                        margin-top: 16px;
                        padding-top: 16px;
                    }

                    .products-stock-grid {
                        display: grid;
                        grid-template-columns: 1fr;
                        gap: 8px;
                    }

                    .products-loaded-info {
                        margin-top: 16px;
                        padding-top: 16px;
                    }

                    .products-content {
                        width: 100%;
                    }

                    .products-topbar {
                        flex-direction: column;
                        gap: 12px;
                        margin-bottom: 16px;
                    }

                    .products-search {
                        width: 100%;
                    }

                    .products-search-input {
                        height: 48px;
                        border-radius: 14px;
                        font-size: 14px;
                    }

                    .products-select {
                        width: 100%;
                    }

                    .products-active-category {
                        flex-wrap: wrap;
                        gap: 8px;
                    }

                    .products-grid {
                        grid-template-columns: 1fr;
                        gap: 16px;
                    }

                    .product-card {
                        border-radius: 18px;
                        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.08);
                    }

                    .product-image-wrap {
                        height: 190px;
                    }

                    .product-actions {
                        padding: 10px 10px 0;
                    }

                    .product-actions button {
                        min-height: 44px;
                        border-radius: 14px;
                    }

                    .product-delete-button {
                        max-width: 64px;
                    }

                    .product-body {
                        padding: 14px;
                    }

                    .product-title {
                        font-size: 17px;
                        line-height: 22px;
                    }

                    .product-category {
                        font-size: 13px;
                    }

                    .product-prices {
                        align-items: flex-start;
                    }

                    .products-load-more {
                        width: 100%;
                        border-radius: 14px;
                    }
                }

                @media (min-width: 768px) and (max-width: 1180px) {
                    .products-layout {
                        width: 100%;
                        padding: 20px;
                        gap: 20px;
                    }

                    .products-sidebar {
                        width: 280px;
                    }

                    .products-grid {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                }

                @media (min-width: 1181px) and (max-width: 1450px) {
                    .products-grid {
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                    }
                }
            `}</style>
        </div>
    )
}
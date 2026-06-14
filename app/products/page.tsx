'use client'

import {useEffect, useState} from 'react'
import System from "../system/page"
import {useModal} from '../hooks/useModal'
import Modal from '../components/Modal'
import AddProductForm from '../components/AddProductForm'
import CustomSelect from '../components/CustomSelect'

interface Product {
    id: number
    name: string
    category: string
    barcode: string
    purchasePrice: number
    sellingPrice: number
    unit: 'piece' | 'weight'
    stock: number
    minStock: number
    image: string
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
}

const ALL_CATEGORIES = [
    'Бакалея',
    'Алкоголь',
    'Сигареты',
    'Молочные продукты',
    'Хлебобулочные изделия',
    'Мясо и птица',
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
    'Другое'
]

export default function Products() {
    const imageProductBase = 'https://i.pinimg.com/736x/11/6a/2b/116a2b68ea33003c15614ca669a22a25.jpg'
    const {isOpen, open, close} = useModal()
    const [selectedCategory, setSelectedCategory] = useState<string>('')
    const [searchQuery, setSearchQuery] = useState<string>('')

    const [products, setProducts] = useState<Product[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [editingProduct, setEditingProduct] = useState<Product | null>(null)

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                setIsLoading(true)

                const params = new URLSearchParams()

                if (searchQuery.trim()) {
                    params.set('search', searchQuery.trim())
                }

                const url = params.toString()
                    ? `/api/products?${params.toString()}`
                    : '/api/products'

                const response = await fetch(url)

                if (!response.ok) {
                    throw new Error('Не удалось загрузить товары')
                }

                const data: Product[] = await response.json()

                setProducts(data)
                setError(null)
            } catch (error) {
                console.error(error)
                setError('Ошибка загрузки товаров')
            } finally {
                setIsLoading(false)
            }
        }

        const timeoutId = setTimeout(fetchProducts, 300)

        return () => clearTimeout(timeoutId)
    }, [searchQuery])

    const filteredProducts = selectedCategory
        ? products.filter(p => p.category === selectedCategory)
        : products

    const availableCategories = ALL_CATEGORIES.filter(cat =>
        products.some(p => p.category === cat)
    )

    const categoryOptions = [
        {value: '', label: 'Все категории'},
        ...availableCategories.map(cat => ({value: cat, label: cat}))
    ]

    const generateBarcode = (): string => {
        const prefix = "200"
        const random = Math.floor(Math.random() * 10000000000).toString().padStart(10, '0')
        const barcode = prefix + random

        const digits = barcode.split('').map(Number)
        const sum = digits.reduce((acc, digit, index) => {
            return acc + (index % 2 === 0 ? digit : digit * 3)
        }, 0)
        const checkDigit = (10 - (sum % 10)) % 10

        return barcode + checkDigit
    }

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
                    image: formData.image || '',
                }),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.message || 'Не удалось добавить товар')
            }

            setProducts(prev => [data, ...prev])
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

            setProducts(prev => prev.filter(product => product.id !== productId))
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
                    image: formData.image || '',
                }),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.message || 'Не удалось изменить товар')
            }

            setProducts(prev =>
                prev.map(product =>
                    product.id === editingProduct.id
                        ? {
                            ...product,
                            ...data,
                            image: data.image ?? formData.image ?? '',
                        }
                        : product
                )
            )

            setEditingProduct(null)
            close()
        } catch (error) {
            console.error(error)
            alert(error instanceof Error ? error.message : 'Ошибка редактирования товара')
        }
    }

    const getStockStatus = (product: Product) => {
        if (product.stock === 0) {
            return {color: 'text-red-700', label: 'Нет в наличии', bgColor: 'bg-red-50', barColor: 'bg-red-500'}
        }
        if (product.stock <= product.minStock) {
            return {
                color: 'text-orange-700',
                label: 'Заканчивается',
                bgColor: 'bg-orange-50',
                barColor: 'bg-orange-500'
            }
        }
        if (product.stock <= product.minStock * 1.5) {
            return {color: 'text-yellow-700', label: 'Мало', bgColor: 'bg-yellow-50', barColor: 'bg-yellow-500'}
        }
        return {color: 'text-green-700', label: 'В наличии', bgColor: 'bg-green-50', barColor: 'bg-green-500'}
    }

    const formatStock = (product: Product): string => {
        if (product.unit === 'weight') {
            return `${product.stock.toFixed(1)} кг`
        }
        return `${product.stock} шт.`
    }

    const updateStock = (productId: number, change: number) => {
        setProducts(prev => prev.map(product => {
            if (product.id === productId) {
                const newStock = Math.max(0, product.stock + change)
                return {...product, stock: newStock}
            }
            return product
        }))
    }

    return (
        <div>
            <System>
                <section className="w-screen h-auto flex gap-6 p-6 overflow-x-clip">
                    <aside className="w-80 flex-shrink-0 bg-white rounded-lg shadow-md p-6 h-fit sticky top-6">
                        <button
                            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors font-semibold mb-8"
                            onClick={handleOpenAddProduct}
                        >
                            + Добавить товар
                        </button>

                        <nav>
                            <h3 className="text-lg font-semibold text-gray-700 mb-4">Категории</h3>
                            <ul className="space-y-1">
                                <li>
                                    <button
                                        onClick={() => setSelectedCategory('')}
                                        className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                                            selectedCategory === ''
                                                ? 'bg-blue-100 text-blue-700 font-medium'
                                                : 'text-gray-700 hover:bg-gray-100'
                                        }`}
                                    >
                                        Все категории ({products.length})
                                    </button>
                                </li>
                                {availableCategories.map(cat => (
                                    <li key={cat}>
                                        <button
                                            onClick={() => setSelectedCategory(cat)}
                                            className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                                                selectedCategory === cat
                                                    ? 'bg-blue-100 text-blue-700 font-medium'
                                                    : 'text-gray-700 hover:bg-gray-100'
                                            }`}
                                        >
                                            {cat} ({products.filter(p => p.category === cat).length})
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </nav>

                        <div className="mt-6 pt-6 border-t">
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">Остатки</h4>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600">🔴 Нет в наличии:</span>
                                    <span className="font-semibold text-red-600">
                                        {filteredProducts.filter(p => p.stock === 0).length}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600">🟡 Заканчиваются:</span>
                                    <span className="font-semibold text-orange-600">
                                        {filteredProducts.filter(p => p.stock > 0 && p.stock <= p.minStock).length}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600">🟢 В наличии:</span>
                                    <span className="font-semibold text-green-600">
                                        {filteredProducts.filter(p => p.stock > p.minStock).length}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </aside>

                    <main className="flex-1 min-w-0">
                        <div className="mb-6 flex gap-4">
                            <div className="relative flex-1">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Поиск товаров по названию или штрихкоду..."
                                    className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

                            {/* Кастомный селект для фильтрации */}
                            <div className="w-64">
                                <CustomSelect
                                    value={selectedCategory}
                                    onChange={setSelectedCategory}
                                    options={categoryOptions}
                                    placeholder="Все категории"
                                />
                            </div>
                        </div>

                        {selectedCategory && (
                            <div className="mb-4 flex items-center gap-2">
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

                        {/* Эффект загрузки */}
                        {isLoading && (
                            <div className="text-center py-12">
                                <p className="text-gray-500 text-lg">Загрузка товаров...</p>
                            </div>
                        )}

                        {error && (
                            <div className="text-center py-12">
                                <p className="text-red-500 text-lg">{error}</p>
                            </div>
                        )}

                        {!isLoading && !error && (
                            <div
                                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                                {filteredProducts.map((product) => {
                                    const status = getStockStatus(product)

                                    return (
                                        <article
                                            key={product.id}
                                            className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
                                        >
                                            <div className="relative h-40 bg-gray-100">
                                                <img
                                                    src={product.image || '/icons/products.jpg'}
                                                    alt={product.name}
                                                    className="w-full h-full object-contain bg-white"
                                                />
                                                <div className="absolute top-2 left-2">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                        product.unit === 'weight' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                                    }`}>
                                                        {product.unit === 'weight' ? 'Весовой' : 'Штучный'}
                                                    </span>
                                                </div>

                                                <div
                                                    className={`absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-medium ${status.bgColor} ${status.color}`}
                                                >
                                                    {status.label}
                                                </div>
                                            </div>

                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleOpenEditProduct(product)}
                                                    className="group flex-1 relative flex items-center justify-center gap-2 bg-gradient-to-br from-gray-50 to-gray-100 py-2.5 px-4 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(59,130,246,0.15)] transition-all duration-300 border border-gray-200/60 hover:border-blue-300 text-sm font-medium text-gray-700 hover:text-blue-600"
                                                >
                                                    <span
                                                        className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/0 to-blue-500/0 group-hover:from-blue-500/5 group-hover:via-blue-400/5 group-hover:to-blue-300/5 rounded-xl transition-all duration-500"/>
                                                    <svg
                                                        className="w-4 h-4 transition-all duration-100 group-hover:-translate-y-0.5 group-hover:rotate-6"
                                                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round"
                                                              strokeWidth={1.8}
                                                              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/>
                                                    </svg>
                                                    <span className="font-medium tracking-wide">Изменить</span>
                                                </button>

                                                <button
                                                    onClick={() => handleDeleteProduct(product.id)}
                                                    className="group flex-1 relative flex items-center justify-center gap-2 bg-gradient-to-br from-gray-50 to-gray-100 py-2.5 px-4 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(239,68,68,0.15)] transition-all duration-300 border border-gray-200/60 hover:border-red-300 text-sm font-medium text-gray-700 hover:text-red-600"
                                                >
                                                    <span
                                                        className="absolute inset-0 bg-gradient-to-r from-red-500/0 via-red-500/0 to-red-500/0 group-hover:from-red-500/5 group-hover:via-red-400/5 group-hover:to-red-300/5 rounded-xl transition-all duration-500"/>
                                                    <svg
                                                        className="w-4 h-4 transition-all duration-100 group-hover:-translate-y-0.5 group-hover:rotate-12"
                                                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round"
                                                              strokeWidth={1.8}
                                                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                                    </svg>
                                                </button>
                                            </div>

                                            <div className="p-4">
                                                <h4 className="font-semibold text-gray-800 text-lg mb-1">
                                                    {product.name}
                                                </h4>
                                                <p className="text-sm text-gray-500 mb-2">
                                                    {product.category}
                                                </p>

                                                {product.barcode && (
                                                    <div className="mb-2 flex items-center gap-2">
                                                        <svg className="w-4 h-4 text-gray-400" fill="none"
                                                             stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round"
                                                                  strokeWidth={1.5}
                                                                  d="M3 5h2M3 9h4M3 13h2M3 17h4M7 5h2M7 9h2M7 13h2M7 17h2M11 5h2M11 9h2M11 13h2M11 17h2M15 5h2M15 9h4M15 13h2M15 17h4M19 5h2M19 13h2"/>
                                                        </svg>
                                                        <span className="text-xs text-gray-500 font-mono">
                                                            {product.barcode}
                                                        </span>
                                                    </div>
                                                )}

                                                <div className={`p-3 rounded-lg mb-3 ${status.bgColor}`}>
                                                    <div className="flex items-center justify-between">
                                                        <span
                                                            className="text-sm font-medium text-gray-700">Остаток:</span>
                                                        <span className={`font-bold ${status.color}`}>
                                                            {formatStock(product)}
                                                        </span>
                                                    </div>
                                                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                                                        <div
                                                            className={`h-2 rounded-full ${status.barColor}`}
                                                            style={{
                                                                width: `${Math.min(100, (product.stock / (product.minStock * 2)) * 100)}%`
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="flex justify-between mt-1">
                                                        <span className="text-xs text-gray-500">
                                                            Мин: {product.minStock} {product.unit === 'weight' ? 'кг' : 'шт.'}
                                                        </span>
                                                        {product.stock <= product.minStock && product.stock > 0 && (
                                                            <span className="text-xs text-orange-600 font-medium">⚠️ Пополнить</span>
                                                        )}
                                                        {product.stock === 0 && (
                                                            <span className="text-xs text-red-600 font-medium">❌ Отсутствует</span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between mt-3">
                                                    <div>
                                                        <span className="text-sm font-bold text-blue-600">
                                                            Цена продажи: {product.sellingPrice} ₽
                                                        </span>
                                                        <br/>
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
                        )}

                        {filteredProducts.length === 0 && (
                            <div className="text-center py-12">
                                <p className="text-gray-500 text-lg">Товары не найдены</p>
                                {selectedCategory && (
                                    <button
                                        onClick={() => setSelectedCategory('')}
                                        className="mt-2 text-blue-500 hover:text-blue-700"
                                    >
                                        Показать все товары
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
        </div>
    )
}
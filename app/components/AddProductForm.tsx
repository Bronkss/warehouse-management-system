// components/AddProductForm.tsx
'use client'

import { useState } from 'react'
import CustomSelect from '../components/CustomSelect'

interface ProductFormData {
    name: string
    category: string
    barcode: string
    purchasePrice: string
    sellingPrice: string
    unit: 'piece' | 'weight'
    stock: string
    minStock: string
}

interface AddProductFormProps {
    onSave: (data: ProductFormData) => void
    onCancel: () => void
}

const CATEGORIES = [
    { value: '', label: 'Выберите категорию', disabled: true },
    { value: 'Бакалея', label: 'Бакалея' },
    { value: 'Алкоголь', label: 'Алкоголь' },
    { value: 'Сигареты', label: 'Сигареты' },
    { value: 'Молочные продукты', label: 'Молочные продукты' },
    { value: 'Хлебобулочные изделия', label: 'Хлебобулочные изделия' },
    { value: 'Мясо и птица', label: 'Мясо и птица' },
    { value: 'Рыба и морепродукты', label: 'Рыба и морепродукты' },
    { value: 'Овощи и фрукты', label: 'Овощи и фрукты' },
    { value: 'Напитки', label: 'Напитки' },
    { value: 'Кондитерские изделия', label: 'Кондитерские изделия' },
    { value: 'Замороженные продукты', label: 'Замороженные продукты' },
    { value: 'Консервы', label: 'Консервы' },
    { value: 'Соусы и приправы', label: 'Соусы и приправы' },
    { value: 'Чай и кофе', label: 'Чай и кофе' },
    { value: 'Снэки', label: 'Снэки' },
    { value: 'Бытовая химия', label: 'Бытовая химия' },
    { value: 'Косметика и гигиена', label: 'Косметика и гигиена' },
    { value: 'Товары для дома', label: 'Товары для дома' },
    { value: 'Другое', label: 'Другое' }
]

export default function AddProductForm({ onSave, onCancel }: AddProductFormProps) {
    const [name, setName] = useState('')
    const [category, setCategory] = useState('')
    const [barcode, setBarcode] = useState('')
    const [purchasePrice, setPurchasePrice] = useState('')
    const [unit, setUnit] = useState<'piece' | 'weight'>('piece')
    const [stock, setStock] = useState('0')
    const [minStock, setMinStock] = useState('10')
    const [errors, setErrors] = useState<Record<string, string>>({})

    const calculateMarkup = (price: string, cat: string): string => {
        const cost = parseFloat(price)
        if (isNaN(cost) || cost <= 0) return ''

        if (cat.toLowerCase().includes('пиво')) {
            return (cost * 1.35).toFixed(2)
        }

        return (cost * 1.30).toFixed(2)
    }

    const sellingPrice = purchasePrice ? calculateMarkup(purchasePrice, category) : ''

    const getMarkupLabel = (): string => {
        if (category.toLowerCase().includes('пиво')) return '35%'
        return '30%'
    }

    const formatBarcode = (value: string): string => {
        const numbers = value.replace(/\D/g, '')
        return numbers.slice(0, 14)
    }

    const validateEAN13 = (barcode: string): boolean => {
        if (barcode.length !== 13) return false

        const digits = barcode.split('').map(Number)
        const checkDigit = digits.pop() || 0

        const sum = digits.reduce((acc, digit, index) => {
            return acc + (index % 2 === 0 ? digit : digit * 3)
        }, 0)

        const calculatedCheckDigit = (10 - (sum % 10)) % 10
        return calculatedCheckDigit === checkDigit
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()

        const newErrors: Record<string, string> = {}

        if (!name.trim()) newErrors.name = 'Введите название товара'
        if (!category) newErrors.category = 'Выберите категорию товара'

        if (barcode && barcode.length > 0 && barcode.length < 8) {
            newErrors.barcode = 'Штрихкод должен содержать от 8 до 14 цифр'
        }

        if (!purchasePrice || parseFloat(purchasePrice) <= 0) {
            newErrors.purchasePrice = 'Введите корректную цену закупки'
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors)
            return
        }

        onSave({
            name,
            category,
            barcode,
            purchasePrice,
            sellingPrice: sellingPrice || '0',
            unit,
            stock,
            minStock
        })
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Название товара */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Название товара *
                </label>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                        setName(e.target.value)
                        if (errors.name) setErrors(prev => ({ ...prev, name: '' }))
                    }}
                    placeholder="Введите название товара"
                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.name ? 'border-red-500' : 'border-gray-300'
                    }`}
                />
                {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
            </div>

            {/* Категория товара */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Категория товара *
                </label>
                <CustomSelect
                    value={category}
                    onChange={(value) => {
                        setCategory(value)
                        if (errors.category) setErrors(prev => ({ ...prev, category: '' }))
                    }}
                    options={CATEGORIES}
                    placeholder="Выберите категорию"
                    error={errors.category}
                />
                {errors.category && <p className="mt-1 text-sm text-red-500">{errors.category}</p>}

                {category === 'Алкоголь' && (
                    <p className="mt-1 text-xs text-amber-600">
                        🍺 Для категории "Алкоголь" доступна специальная наценка на пиво
                    </p>
                )}
                {category === 'Сигареты' && (
                    <p className="mt-1 text-xs text-gray-500">
                        🚬 Для табачных изделий действуют особые правила продажи
                    </p>
                )}
                {category === 'Молочные продукты' && (
                    <p className="mt-1 text-xs text-blue-600">
                        🥛 Скоропортящийся товар. Следите за сроками годности
                    </p>
                )}
            </div>

            {/* Штрихкод товара */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Штрихкод товара
                    <span className="text-xs text-gray-500 ml-1">(EAN-13, UPC или другой формат)</span>
                </label>
                <div className="relative">
                    <input
                        type="text"
                        value={barcode}
                        onChange={(e) => {
                            const formatted = formatBarcode(e.target.value)
                            setBarcode(formatted)
                            if (errors.barcode) setErrors(prev => ({ ...prev, barcode: '' }))
                        }}
                        placeholder="Например: 4601234567890"
                        maxLength={14}
                        className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${
                            errors.barcode ? 'border-red-500' : 'border-gray-300'
                        }`}
                    />
                    <svg
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
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
                </div>
                {errors.barcode && <p className="mt-1 text-sm text-red-500">{errors.barcode}</p>}
                {barcode && barcode.length === 13 && (
                    <p className={`mt-1 text-xs ${validateEAN13(barcode) ? 'text-green-600' : 'text-orange-600'}`}>
                        {validateEAN13(barcode)
                            ? '✓ Штрихкод EAN-13 валиден'
                            : '⚠ Контрольная цифра не совпадает'}
                    </p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                    Введите цифры штрихкода (до 14 символов). Для автоматической генерации оставьте поле пустым.
                </p>
            </div>

            {/* Цены */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Цена в закупке (₽) *
                    </label>
                    <input
                        type="number"
                        value={purchasePrice}
                        onChange={(e) => {
                            setPurchasePrice(e.target.value)
                            if (errors.purchasePrice) setErrors(prev => ({ ...prev, purchasePrice: '' }))
                        }}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            errors.purchasePrice ? 'border-red-500' : 'border-gray-300'
                        }`}
                    />
                    {errors.purchasePrice && <p className="mt-1 text-sm text-red-500">{errors.purchasePrice}</p>}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Цена в продаже (₽)
                        {purchasePrice && (
                            <span className="text-xs text-gray-500 ml-1">
                (наценка {getMarkupLabel()})
              </span>
                        )}
                    </label>
                    <input
                        type="number"
                        value={sellingPrice}
                        readOnly
                        placeholder="Автоматический расчет"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                    />
                    {purchasePrice && sellingPrice && (
                        <div className="mt-2 text-xs text-gray-500 bg-blue-50 p-2 rounded">
                            <span className="font-semibold">Расчет:</span>{' '}
                            {purchasePrice} ₽ × {getMarkupLabel() === '35%' ? '1.35' : '1.30'} = {sellingPrice} ₽
                            {category.toLowerCase().includes('пиво') && (
                                <span className="block mt-1 text-amber-600">🍺 Для пива наценка 35%</span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Остатки */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Текущий остаток ({unit === 'weight' ? 'кг' : 'шт.'})
                    </label>
                    <input
                        type="number"
                        value={stock}
                        onChange={(e) => setStock(e.target.value)}
                        placeholder="0"
                        step={unit === 'weight' ? '0.1' : '1'}
                        min="0"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Мин. остаток * ({unit === 'weight' ? 'кг' : 'шт.'})
                    </label>
                    <input
                        type="number"
                        value={minStock}
                        onChange={(e) => setMinStock(e.target.value)}
                        placeholder="10"
                        step={unit === 'weight' ? '0.1' : '1'}
                        min="1"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                        При достижении появится уведомление
                    </p>
                </div>
            </div>

            {/* Единица измерения */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Единица измерения *
                </label>
                <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="unit"
                            value="piece"
                            checked={unit === 'piece'}
                            onChange={() => setUnit('piece')}
                            className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-gray-700">Штучно</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="unit"
                            value="weight"
                            checked={unit === 'weight'}
                            onChange={() => setUnit('weight')}
                            className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-gray-700">Весовой</span>
                    </label>
                </div>
            </div>

            {/* Предпросмотр */}
            {name && category && (
                <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium text-gray-700 mb-2">Предпросмотр:</h4>
                    <div className="space-y-1 text-sm">
                        <p><span className="text-gray-500">Название:</span> {name}</p>
                        <p><span className="text-gray-500">Категория:</span> {category}</p>
                        {barcode && <p><span className="text-gray-500">Штрихкод:</span> {barcode}</p>}
                        <p><span className="text-gray-500">Закупка:</span> {purchasePrice} ₽</p>
                        <p><span className="text-gray-500">Продажа:</span> {sellingPrice || '—'} ₽</p>
                        <p><span className="text-gray-500">Тип:</span> {unit === 'piece' ? 'Штучный' : 'Весовой'}</p>
                        <p><span className="text-gray-500">Остаток:</span> {stock} {unit === 'weight' ? 'кг' : 'шт.'}</p>
                        <p><span className="text-gray-500">Мин. остаток:</span> {minStock} {unit === 'weight' ? 'кг' : 'шт.'}</p>
                    </div>
                </div>
            )}

            {/* Кнопки */}
            <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                    Отмена
                </button>
                <button
                    type="submit"
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors z-100"
                >
                    Добавить товар
                </button>
            </div>
        </form>
    )
}
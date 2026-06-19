'use client'

import {
    useState,
    useRef,
    useCallback,
    useEffect,
    type ChangeEvent,
    type FormEvent,
} from 'react'
import CustomSelect from '../components/CustomSelect'
import {
    formatBarcodeInput,
    parseBarcodeList,
    serializeBarcodeList,
} from '../utils/barcodes'

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

interface AddProductFormProps {
    onSave: (data: ProductFormData) => void | Promise<void>
    onCancel: () => void
    initialData?: ProductFormData
}

interface ProductFormState {
    name: string
    category: string
    barcodeList: string[]
    purchasePrice: string
    sellingPrice: string
    unit: 'piece' | 'weight'
    stock: string
    minStock: string
    image: string
    imagePreview: string
    imageFile: File | null
}

const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024

const ALLOWED_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
])

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
    { value: 'Другое', label: 'Другое' },
]

const normalizeNumberString = (value: string): string => {
    return value.replace(',', '.').replace(/\s/g, '')
}

const parsePrice = (value: string): number => {
    const parsed = parseFloat(normalizeNumberString(value))
    return Number.isFinite(parsed) ? parsed : 0
}

const roundUpPriceString = (value: string): string => {
    const parsed = parsePrice(value)

    if (parsed <= 0) {
        return ''
    }

    return String(Math.ceil(parsed))
}

const calculateMarkup = (price: string, cat: string): string => {
    const cost = parsePrice(price)

    if (cost <= 0) {
        return ''
    }

    const multiplier = cat.toLowerCase().includes('пиво') ? 1.35 : 1.30

    return String(Math.ceil(cost * multiplier))
}

const getInitialState = (data?: ProductFormData): ProductFormState => {
    const barcodeList = parseBarcodeList(data?.barcode)

    return {
        name: data?.name || '',
        category: data?.category || '',
        barcodeList: barcodeList.length > 0 ? barcodeList : [''],
        purchasePrice: data?.purchasePrice || '',
        sellingPrice: data?.sellingPrice || '',
        unit: data?.unit || 'piece',
        stock: data?.stock || '0',
        minStock: data?.minStock || '10',
        image: data?.image || '',
        imagePreview: data?.image || '',
        imageFile: null,
    }
}

export default function AddProductForm({ onSave, onCancel, initialData }: AddProductFormProps) {
    const [formState, setFormState] = useState<ProductFormState>(() => getInitialState(initialData))
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [isSellingPriceManual, setIsSellingPriceManual] = useState(Boolean(initialData?.sellingPrice))
    const [isSaving, setIsSaving] = useState(false)

    const fileInputRef = useRef<HTMLInputElement>(null)
    const previewObjectUrlRef = useRef<string | null>(null)
    const [formKey, setFormKey] = useState(0)

    const currentInitialJson = JSON.stringify(initialData ?? null)
    const prevInitialJson = useRef(currentInitialJson)

    useEffect(() => {
        return () => {
            if (previewObjectUrlRef.current) {
                URL.revokeObjectURL(previewObjectUrlRef.current)
            }
        }
    }, [])

    useEffect(() => {
        if (prevInitialJson.current === currentInitialJson) {
            return
        }

        prevInitialJson.current = currentInitialJson

        const parsedInitialData = JSON.parse(currentInitialJson) as ProductFormData | null

        if (previewObjectUrlRef.current) {
            URL.revokeObjectURL(previewObjectUrlRef.current)
            previewObjectUrlRef.current = null
        }

        setFormState(getInitialState(parsedInitialData ?? undefined))
        setIsSellingPriceManual(Boolean(parsedInitialData?.sellingPrice))
        setErrors({})
        setFormKey(prev => prev + 1)

        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }, [currentInitialJson])

    const clearFieldError = useCallback((field: string) => {
        setErrors(prev => {
            if (!prev[field]) {
                return prev
            }

            const next = { ...prev }
            delete next[field]
            return next
        })
    }, [])

    const updateField = useCallback((field: keyof ProductFormState, value: string) => {
        setFormState(prev => ({ ...prev, [field]: value }))
        clearFieldError(field)
    }, [clearFieldError])

    const updatePurchasePrice = (value: string) => {
        setFormState(prev => {
            const nextState = {
                ...prev,
                purchasePrice: value,
            }

            if (!isSellingPriceManual) {
                nextState.sellingPrice = calculateMarkup(value, prev.category)
            }

            return nextState
        })

        clearFieldError('purchasePrice')
    }

    const updateCategory = (value: string) => {
        setFormState(prev => {
            const nextState = {
                ...prev,
                category: value,
            }

            if (!isSellingPriceManual) {
                nextState.sellingPrice = calculateMarkup(prev.purchasePrice, value)
            }

            return nextState
        })

        clearFieldError('category')
    }

    const updateSellingPrice = (value: string) => {
        setIsSellingPriceManual(true)
        updateField('sellingPrice', value)
    }

    const handleSellingPriceBlur = () => {
        setFormState(prev => ({
            ...prev,
            sellingPrice: roundUpPriceString(prev.sellingPrice),
        }))
    }

    const getMarkupLabel = (): string => {
        if (formState.category.toLowerCase().includes('пиво')) {
            return '35%'
        }

        return '30%'
    }

    const updateBarcodeAt = (index: number, value: string) => {
        const formatted = formatBarcodeInput(value)

        setFormState(prev => {
            const nextBarcodeList = [...prev.barcodeList]
            nextBarcodeList[index] = formatted

            return {
                ...prev,
                barcodeList: nextBarcodeList,
            }
        })

        clearFieldError('barcode')
    }

    const addBarcodeField = () => {
        setFormState(prev => ({
            ...prev,
            barcodeList: [...prev.barcodeList, ''],
        }))
    }

    const removeBarcodeField = (index: number) => {
        setFormState(prev => {
            const nextBarcodeList = prev.barcodeList.filter((_, itemIndex) => itemIndex !== index)

            return {
                ...prev,
                barcodeList: nextBarcodeList.length > 0 ? nextBarcodeList : [''],
            }
        })

        clearFieldError('barcode')
    }

    const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]

        if (!file) {
            return
        }

        if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
            setErrors(prev => ({
                ...prev,
                image: 'Выберите изображение JPG, PNG или WEBP',
            }))

            if (fileInputRef.current) {
                fileInputRef.current.value = ''
            }

            return
        }

        if (file.size > MAX_IMAGE_SIZE_BYTES) {
            setErrors(prev => ({
                ...prev,
                image: 'Размер файла не должен превышать 4 МБ',
            }))

            if (fileInputRef.current) {
                fileInputRef.current.value = ''
            }

            return
        }

        if (previewObjectUrlRef.current) {
            URL.revokeObjectURL(previewObjectUrlRef.current)
        }

        const previewUrl = URL.createObjectURL(file)
        previewObjectUrlRef.current = previewUrl

        setFormState(prev => ({
            ...prev,
            imageFile: file,
            imagePreview: previewUrl,
        }))

        clearFieldError('image')
    }

    const handleRemoveImage = () => {
        if (previewObjectUrlRef.current) {
            URL.revokeObjectURL(previewObjectUrlRef.current)
            previewObjectUrlRef.current = null
        }

        setFormState(prev => ({
            ...prev,
            image: '',
            imagePreview: '',
            imageFile: null,
        }))

        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }

        clearFieldError('image')
    }

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault()

        const newErrors: Record<string, string> = {}

        if (!formState.name.trim()) {
            newErrors.name = 'Введите название товара'
        }

        if (!formState.category) {
            newErrors.category = 'Выберите категорию товара'
        }

        const finalBarcodes = formState.barcodeList
            .map(code => formatBarcodeInput(code))
            .filter(Boolean)

        const hasInvalidBarcode = finalBarcodes.some(code => code.length < 8 || code.length > 14)

        if (hasInvalidBarcode) {
            newErrors.barcode = 'Каждый штрихкод должен содержать от 8 до 14 цифр'
        }

        const hasDuplicateBarcodes = new Set(finalBarcodes).size !== finalBarcodes.length

        if (hasDuplicateBarcodes) {
            newErrors.barcode = 'Штрихкоды не должны повторяться'
        }

        if (!formState.purchasePrice || parsePrice(formState.purchasePrice) <= 0) {
            newErrors.purchasePrice = 'Введите корректную цену закупки'
        }

        const finalSellingPrice = roundUpPriceString(
            formState.sellingPrice || calculateMarkup(formState.purchasePrice, formState.category)
        )

        if (!finalSellingPrice || parsePrice(finalSellingPrice) <= 0) {
            newErrors.sellingPrice = 'Введите корректную цену продажи'
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors)
            return
        }

        try {
            setIsSaving(true)

            await onSave({
                name: formState.name,
                category: formState.category,
                barcode: serializeBarcodeList(formState.barcodeList),
                purchasePrice: formState.purchasePrice,
                sellingPrice: finalSellingPrice,
                unit: formState.unit,
                stock: formState.stock,
                minStock: formState.minStock,
                image: formState.image,
                imageFile: formState.imageFile,
            })
        } finally {
            setIsSaving(false)
        }
    }

    const currentImagePreview = formState.imagePreview || formState.image

    return (
        <form key={formKey} onSubmit={handleSubmit} className="space-y-6">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Изображение товара
                </label>

                {currentImagePreview ? (
                    <div className="relative w-full h-48 rounded-lg overflow-hidden bg-gray-100 mb-3">
                        <img
                            src={currentImagePreview}
                            alt="Предпросмотр"
                            className="w-full h-full object-cover"
                        />

                        <button
                            type="button"
                            onClick={handleRemoveImage}
                            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </button>
                    </div>
                ) : (
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full h-48 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
                    >
                        <svg
                            className="w-12 h-12 text-gray-400 mb-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                        </svg>

                        <p className="text-sm text-gray-500">Нажмите для загрузки</p>
                        <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP до 4 МБ</p>
                    </div>
                )}

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageChange}
                    className="hidden"
                />

                {currentImagePreview && (
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                        Изменить изображение
                    </button>
                )}

                {errors.image && <p className="mt-1 text-sm text-red-500">{errors.image}</p>}
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Название товара *
                </label>

                <input
                    type="text"
                    value={formState.name}
                    onChange={event => updateField('name', event.target.value)}
                    placeholder="Введите название товара"
                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.name ? 'border-red-500' : 'border-gray-300'
                    }`}
                />

                {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Категория товара *
                </label>

                <CustomSelect
                    value={formState.category}
                    onChange={updateCategory}
                    options={CATEGORIES}
                    placeholder="Выберите категорию"
                    error={errors.category}
                />

                {errors.category && <p className="mt-1 text-sm text-red-500">{errors.category}</p>}
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Штрихкоды товара
                    <span className="text-xs text-gray-500 ml-1">
                        можно добавить несколько
                    </span>
                </label>

                <div className="space-y-2">
                    {formState.barcodeList.map((barcode, index) => (
                        <div key={index} className="relative flex gap-2">
                            <div className="relative flex-1">
                                <input
                                    type="text"
                                    value={barcode}
                                    onChange={event => updateBarcodeAt(index, event.target.value)}
                                    placeholder={
                                        index === 0
                                            ? 'Основной штрихкод, например: 4601234567890'
                                            : `Дополнительный штрихкод №${index + 1}`
                                    }
                                    maxLength={14}
                                    className={`w-full px-4 py-2 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${
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

                            {formState.barcodeList.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => removeBarcodeField(index)}
                                    className="px-3 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                <button
                    type="button"
                    onClick={addBarcodeField}
                    className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                    + Добавить ещё штрихкод
                </button>

                {errors.barcode && <p className="mt-1 text-sm text-red-500">{errors.barcode}</p>}

                <p className="mt-1 text-xs text-gray-500">
                    В базе штрихкоды будут храниться в одном поле через разделитель.
                </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Цена в закупке (₽) *
                    </label>

                    <input
                        type="number"
                        value={formState.purchasePrice}
                        onChange={event => updatePurchasePrice(event.target.value)}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            errors.purchasePrice ? 'border-red-500' : 'border-gray-300'
                        }`}
                    />

                    {errors.purchasePrice && (
                        <p className="mt-1 text-sm text-red-500">{errors.purchasePrice}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Цена в продаже (₽)
                    </label>

                    <input
                        type="text"
                        inputMode="decimal"
                        value={formState.sellingPrice}
                        onChange={event => updateSellingPrice(event.target.value)}
                        onBlur={handleSellingPriceBlur}
                        placeholder="Введите цену продажи"
                        className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            errors.sellingPrice ? 'border-red-500' : 'border-gray-300'
                        }`}
                    />

                    {errors.sellingPrice && (
                        <p className="mt-1 text-sm text-red-500">{errors.sellingPrice}</p>
                    )}

                    {formState.purchasePrice && (
                        <span className="text-xs text-lime-600 ml-1">
                            Минимальная наценка {getMarkupLabel()}, округление вверх
                        </span>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Текущий остаток ({formState.unit === 'weight' ? 'кг' : 'шт.'})
                    </label>

                    <input
                        type="number"
                        value={formState.stock}
                        onChange={event => updateField('stock', event.target.value)}
                        placeholder="0"
                        step={formState.unit === 'weight' ? '0.1' : '1'}
                        min="0"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Мин. остаток * ({formState.unit === 'weight' ? 'кг' : 'шт.'})
                    </label>

                    <input
                        type="number"
                        value={formState.minStock}
                        onChange={event => updateField('minStock', event.target.value)}
                        placeholder="10"
                        step={formState.unit === 'weight' ? '0.1' : '1'}
                        min="1"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />

                    <p className="mt-1 text-xs text-gray-500">
                        При достижении появится уведомление
                    </p>
                </div>
            </div>

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
                            checked={formState.unit === 'piece'}
                            onChange={() => updateField('unit', 'piece')}
                            className="w-4 h-4 text-blue-600"
                        />

                        <span className="text-gray-700">Штучно</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="unit"
                            value="weight"
                            checked={formState.unit === 'weight'}
                            onChange={() => updateField('unit', 'weight')}
                            className="w-4 h-4 text-blue-600"
                        />

                        <span className="text-gray-700">Весовой</span>
                    </label>
                </div>
            </div>

            {formState.name && formState.category && (
                <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium text-gray-700 mb-2">Предпросмотр:</h4>

                    <div className="space-y-1 text-sm">
                        {currentImagePreview && (
                            <div className="mb-2 w-20 h-20 rounded overflow-hidden">
                                <img
                                    src={currentImagePreview}
                                    alt={formState.name}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        )}

                        <p>
                            <span className="text-gray-500">Название:</span> {formState.name}
                        </p>

                        <p>
                            <span className="text-gray-500">Категория:</span> {formState.category}
                        </p>

                        {formState.barcodeList.some(Boolean) && (
                            <p>
                                <span className="text-gray-500">Штрихкоды:</span>{' '}
                                {formState.barcodeList.filter(Boolean).join(', ')}
                            </p>
                        )}

                        <p>
                            <span className="text-gray-500">Закупка:</span> {formState.purchasePrice} ₽
                        </p>

                        <p>
                            <span className="text-gray-500">Продажа:</span>{' '}
                            {formState.sellingPrice || '—'} ₽
                        </p>

                        <p>
                            <span className="text-gray-500">Тип:</span>{' '}
                            {formState.unit === 'piece' ? 'Штучный' : 'Весовой'}
                        </p>

                        <p>
                            <span className="text-gray-500">Остаток:</span>{' '}
                            {formState.stock} {formState.unit === 'weight' ? 'кг' : 'шт.'}
                        </p>

                        <p>
                            <span className="text-gray-500">Мин. остаток:</span>{' '}
                            {formState.minStock} {formState.unit === 'weight' ? 'кг' : 'шт.'}
                        </p>
                    </div>
                </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={isSaving}
                    className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    Отмена
                </button>

                <button
                    type="submit"
                    disabled={isSaving}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {isSaving
                        ? 'Сохраняем...'
                        : initialData
                            ? 'Сохранить изменения'
                            : 'Добавить товар'}
                </button>
            </div>
        </form>
    )
}
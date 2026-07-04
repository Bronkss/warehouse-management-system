'use client'

import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type FormEvent,
} from 'react'

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
    marked: boolean
    imageFile?: File | null
}

interface AddCigaretteFormProps {
    onSave: (data: ProductFormData) => void | Promise<void>
    onCancel: () => void
    initialData?: ProductFormData
}

interface CigaretteFormState {
    name: string
    barcode: string
    purchasePrice: string
    sellingPrice: string
    stock: string
    minStock: string
    image: string
    imagePreview: string
    imageFile: File | null
}

const CIGARETTE_CATEGORY = 'Табачные изделия'
const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024

const ALLOWED_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
])

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

const calculateMarkup = (price: string): string => {
    const cost = parsePrice(price)

    if (cost <= 0) {
        return ''
    }

    return String(Math.ceil(cost * 1.30))
}

const normalizeIntegerString = (value: string): string => {
    return value.replace(/\D/g, '')
}

const normalizeCigaretteBarcode = (value: string): string => {
    return value.replace(/\D/g, '').slice(0, 8)
}

const looksLikeDataMatrix = (value: string): boolean => {
    const raw = value.trim()

    return (
        raw.length > 14 ||
        raw.includes('\u001d') ||
        raw.includes('\x1d') ||
        raw.includes('<GS>') ||
        raw.includes('[GS]') ||
        /^01\d{14}21/.test(raw)
    )
}

const getInitialState = (data?: ProductFormData): CigaretteFormState => {
    return {
        name: data?.name || '',
        barcode: normalizeCigaretteBarcode(data?.barcode || ''),
        purchasePrice: data?.purchasePrice || '',
        sellingPrice: data?.sellingPrice || '',
        stock: data?.stock || '0',
        minStock: data?.minStock || '5',
        image: data?.image || '',
        imagePreview: data?.image || '',
        imageFile: null,
    }
}

export default function AddCigaretteForm({ onSave, onCancel, initialData }: AddCigaretteFormProps) {
    const [formState, setFormState] = useState<CigaretteFormState>(() => getInitialState(initialData))
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

    const updateField = useCallback((field: keyof CigaretteFormState, value: string) => {
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
                nextState.sellingPrice = calculateMarkup(value)
            }

            return nextState
        })

        clearFieldError('purchasePrice')
    }

    const updateSellingPrice = (value: string) => {
        setIsSellingPriceManual(true)
        updateField('sellingPrice', value)
    }

    const updateBarcode = (value: string) => {
        if (looksLikeDataMatrix(value)) {
            setErrors(prev => ({
                ...prev,
                barcode: 'Это похоже на DataMatrix с пачки. Здесь нужен только 8-значный штрихкод товара для поиска в кассе.',
            }))
        } else {
            clearFieldError('barcode')
        }

        setFormState(prev => ({
            ...prev,
            barcode: normalizeCigaretteBarcode(value),
        }))
    }

    const updateIntegerField = (field: 'stock' | 'minStock', value: string) => {
        setFormState(prev => ({
            ...prev,
            [field]: normalizeIntegerString(value),
        }))

        clearFieldError(field)
    }

    const handleSellingPriceBlur = () => {
        setFormState(prev => ({
            ...prev,
            sellingPrice: roundUpPriceString(prev.sellingPrice),
        }))
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

        const name = formState.name.trim()
        const barcode = normalizeCigaretteBarcode(formState.barcode)

        if (!name) {
            newErrors.name = 'Введите название сигарет'
        }

        if (!barcode) {
            newErrors.barcode = 'Отсканируйте или введите 8-значный штрихкод пачки'
        } else if (!/^\d{8}$/.test(barcode)) {
            newErrors.barcode = 'Штрихкод сигарет должен состоять строго из 8 цифр'
        }

        if (!formState.purchasePrice || parsePrice(formState.purchasePrice) <= 0) {
            newErrors.purchasePrice = 'Введите корректную цену закупки'
        }

        const finalSellingPrice = roundUpPriceString(
            formState.sellingPrice || calculateMarkup(formState.purchasePrice)
        )

        if (!finalSellingPrice || parsePrice(finalSellingPrice) <= 0) {
            newErrors.sellingPrice = 'Введите корректную цену продажи'
        }

        const stock = Number(formState.stock || 0)
        const minStock = Number(formState.minStock || 0)

        if (!/^\d+$/.test(formState.stock || '0') || stock < 0) {
            newErrors.stock = 'Введите целый остаток в пачках'
        }

        if (!/^\d+$/.test(formState.minStock || '0') || minStock <= 0) {
            newErrors.minStock = 'Введите минимальный остаток в пачках'
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors)
            return
        }

        try {
            setIsSaving(true)

            await onSave({
                name,
                category: CIGARETTE_CATEGORY,
                barcode,
                purchasePrice: normalizeNumberString(formState.purchasePrice),
                sellingPrice: finalSellingPrice,
                unit: 'piece',
                stock: formState.stock || '0',
                minStock: formState.minStock || '5',
                image: formState.image,
                marked: true,
                imageFile: formState.imageFile,
            })
        } finally {
            setIsSaving(false)
        }
    }

    const currentImagePreview = formState.imagePreview || formState.image

    return (
        <form key={formKey} onSubmit={handleSubmit} className="space-y-6">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-xl">
                        🚬
                    </div>

                    <div>
                        <h3 className="text-sm font-bold text-red-950">
                            Добавление сигарет
                        </h3>

                        <p className="mt-1 text-xs leading-5 text-red-800">
                            Товар будет сохранён как штучный, категория “Табачные изделия”, маркировка Честный ЗНАК включена всегда. В это поле сохраняется только 8-значный штрихкод товара для поиска в кассе. DataMatrix с пачки здесь не сохраняем.
                        </p>
                    </div>
                </div>
            </div>

            <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                    Изображение товара
                </label>

                {currentImagePreview ? (
                    <div className="relative mb-3 h-48 w-full overflow-hidden rounded-lg bg-gray-100">
                        <img
                            src={currentImagePreview}
                            alt="Предпросмотр"
                            className="h-full w-full object-cover"
                        />

                        <button
                            type="button"
                            onClick={handleRemoveImage}
                            className="absolute right-2 top-2 rounded-full bg-red-500 p-1.5 text-white transition-colors hover:bg-red-600"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        className="flex h-48 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 transition-colors hover:border-red-400 hover:bg-red-50"
                    >
                        <svg
                            className="mb-2 h-12 w-12 text-gray-400"
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
                        <p className="mt-1 text-xs text-gray-400">JPG, PNG, WEBP до 4 МБ</p>
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
                        className="mt-2 text-sm font-medium text-red-600 hover:text-red-700"
                    >
                        Изменить изображение
                    </button>
                )}

                {errors.image && <p className="mt-1 text-sm text-red-500">{errors.image}</p>}
            </div>

            <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                    Название сигарет *
                </label>

                <input
                    type="text"
                    value={formState.name}
                    onChange={event => updateField('name', event.target.value)}
                    placeholder="Например: Winston Blue Compact"
                    className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 ${
                        errors.name ? 'border-red-500' : 'border-gray-300'
                    }`}
                />

                {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                        Категория
                    </label>

                    <input
                        type="text"
                        value={CIGARETTE_CATEGORY}
                        disabled
                        className="w-full rounded-lg border border-gray-200 bg-gray-100 px-4 py-2 text-gray-600"
                    />
                </div>

                <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                        Тип товара
                    </label>

                    <input
                        type="text"
                        value="Штучный · маркированный"
                        disabled
                        className="w-full rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-amber-900"
                    />
                </div>
            </div>

            <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                    8-значный штрихкод пачки *
                </label>

                <input
                    type="text"
                    inputMode="numeric"
                    value={formState.barcode}
                    onChange={event => updateBarcode(event.target.value)}
                    placeholder="Например: 12345678"
                    maxLength={8}
                    className={`w-full rounded-lg border px-4 py-2 font-mono text-lg tracking-wider focus:outline-none focus:ring-2 focus:ring-red-500 ${
                        errors.barcode ? 'border-red-500' : 'border-gray-300'
                    }`}
                />

                {errors.barcode && <p className="mt-1 text-sm text-red-500">{errors.barcode}</p>}

                <p className="mt-1 text-xs text-gray-500">
                    Этот код нужен только для поиска товара в кассе. В фискальный чек по маркировке должен уходить DataMatrix, который кассир сканирует при продаже.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                        Цена в закупке (₽) *
                    </label>

                    <input
                        type="number"
                        value={formState.purchasePrice}
                        onChange={event => updatePurchasePrice(event.target.value)}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 ${
                            errors.purchasePrice ? 'border-red-500' : 'border-gray-300'
                        }`}
                    />

                    {errors.purchasePrice && (
                        <p className="mt-1 text-sm text-red-500">{errors.purchasePrice}</p>
                    )}
                </div>

                <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                        Цена в продаже (₽) *
                    </label>

                    <input
                        type="text"
                        inputMode="decimal"
                        value={formState.sellingPrice}
                        onChange={event => updateSellingPrice(event.target.value)}
                        onBlur={handleSellingPriceBlur}
                        placeholder="Введите цену продажи"
                        className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 ${
                            errors.sellingPrice ? 'border-red-500' : 'border-gray-300'
                        }`}
                    />

                    {errors.sellingPrice && (
                        <p className="mt-1 text-sm text-red-500">{errors.sellingPrice}</p>
                    )}

                    {formState.purchasePrice && !isSellingPriceManual && (
                        <span className="ml-1 text-xs text-lime-600">
                            Автонаценка 30%, округление вверх
                        </span>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                        Остаток, пачек
                    </label>

                    <input
                        type="text"
                        inputMode="numeric"
                        value={formState.stock}
                        onChange={event => updateIntegerField('stock', event.target.value)}
                        placeholder="0"
                        className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 ${
                            errors.stock ? 'border-red-500' : 'border-gray-300'
                        }`}
                    />

                    {errors.stock && <p className="mt-1 text-sm text-red-500">{errors.stock}</p>}
                </div>

                <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                        Мин. остаток, пачек *
                    </label>

                    <input
                        type="text"
                        inputMode="numeric"
                        value={formState.minStock}
                        onChange={event => updateIntegerField('minStock', event.target.value)}
                        placeholder="5"
                        className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 ${
                            errors.minStock ? 'border-red-500' : 'border-gray-300'
                        }`}
                    />

                    {errors.minStock && <p className="mt-1 text-sm text-red-500">{errors.minStock}</p>}
                </div>
            </div>

            {formState.name && (
                <div className="rounded-lg bg-gray-50 p-4">
                    <h4 className="mb-2 font-medium text-gray-700">Предпросмотр:</h4>

                    <div className="space-y-1 text-sm">
                        {currentImagePreview && (
                            <div className="mb-2 h-20 w-20 overflow-hidden rounded">
                                <img
                                    src={currentImagePreview}
                                    alt={formState.name}
                                    className="h-full w-full object-cover"
                                />
                            </div>
                        )}

                        <p>
                            <span className="text-gray-500">Название:</span> {formState.name}
                        </p>

                        <p>
                            <span className="text-gray-500">Категория:</span> {CIGARETTE_CATEGORY}
                        </p>

                        <p>
                            <span className="text-gray-500">Штрихкод товара:</span>{' '}
                            {formState.barcode || '—'}
                        </p>

                        <p>
                            <span className="text-gray-500">Маркировка:</span> Да, всегда
                        </p>

                        <p>
                            <span className="text-gray-500">Продажа:</span>{' '}
                            {formState.sellingPrice || '—'} ₽
                        </p>

                        <p>
                            <span className="text-gray-500">Остаток:</span>{' '}
                            {formState.stock || 0} пач.
                        </p>
                    </div>
                </div>
            )}

            <div className="flex justify-end gap-3 border-t pt-4">
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={isSaving}
                    className="rounded-lg border border-gray-300 px-6 py-2 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    Отмена
                </button>

                <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-lg bg-red-600 px-6 py-2 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isSaving
                        ? 'Сохраняем...'
                        : initialData
                            ? 'Сохранить сигареты'
                            : 'Добавить сигареты'}
                </button>
            </div>
        </form>
    )
}

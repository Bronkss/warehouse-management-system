'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import System from '@/app/system/page'
import ProductMovementForm from '@/app/components/ProductMovementForm'

type ProductUnit = 'piece' | 'weight'
type ImportAction = 'update' | 'create' | 'skip'
type ImportStatus = 'matched' | 'review' | 'new' | 'error'

type ProductSuggestion = {
    id: number
    name: string
    category: string
    barcode: string
    stock: number
    purchasePrice: number
    sellingPrice: number
    score: number
}

type PreviewRow = {
    acceptanceItemId?: number | null
    productId?: number | null
    rowId: string
    rowNumber: number
    status: ImportStatus
    action: ImportAction
    matchType: string
    matchScore: number
    matchedProductId: number | null
    matchedProductName: string
    matchedProductBarcode: string
    suggestions: ProductSuggestion[]
    error: string | null

    name: string
    category: string
    barcode: string
    purchasePrice: string
    sellingPrice: string
    unit: ProductUnit
    stock: string
    minStock: string
    image: string
}

type CommitResult = {
    acceptanceId: number
    acceptanceNumber?: string
    totalRows: number
    created: number
    updated: number
    skipped: number
    errors: string[]
}

type PreviewResponse = {
    totalRows: number
    rows: PreviewRow[]
    summary: {
        matched: number
        review: number
        new: number
        error: number
    }
}

type AcceptanceHistoryItem = {
    id: number
    number: string
    sourceFileName: string | null
    supplier: string | null
    invoiceNumber: string | null
    comment: string | null
    totalRows: number
    created: number
    updated: number
    skipped: number
    errors: number
    status: string
    createdAt: string
    updatedAt: string
}

type AcceptanceDetail = {
    id: number
    number: string
    sourceFileName: string | null
    supplier: string
    invoiceNumber: string
    comment: string
    totalRows: number
    created: number
    updated: number
    skipped: number
    errors: string[]
    status: string
    createdAt: string
    updatedAt: string
    rows: PreviewRow[]
}

const ACTION_OPTIONS: { value: ImportAction; label: string }[] = [
    { value: 'update', label: 'Добавить остаток' },
    { value: 'create', label: 'Создать товар' },
    { value: 'skip', label: 'Пропустить' },
]

const inputClass = 'h-8 w-full rounded-md border border-gray-300 px-2 text-xs outline-none focus:ring-1 focus:ring-blue-500'
const selectClass = 'h-8 w-full rounded-md border border-gray-300 px-2 pr-5 text-xs outline-none focus:ring-1 focus:ring-blue-500 bg-white'
const labelClass = 'mb-1 block text-xs font-medium text-gray-500'

function getStatusLabel(status: ImportStatus) {
    if (status === 'matched') return 'Совп.'
    if (status === 'review') return 'Проверить'
    if (status === 'new') return 'Новый'
    return 'Ошибка'
}

function getStatusClass(status: ImportStatus) {
    if (status === 'matched') return 'bg-green-50 text-green-700 border-green-100'
    if (status === 'review') return 'bg-orange-50 text-orange-700 border-orange-100'
    if (status === 'new') return 'bg-blue-50 text-blue-700 border-blue-100'
    return 'bg-red-50 text-red-700 border-red-100'
}

function formatDate(value: string) {
    if (!value) return '—'
    return new Date(value).toLocaleString('ru-RU')
}

function toNumber(value: string) {
    const parsed = Number(String(value || '0').replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : 0
}

function calcSellingPrice(purchasePrice: string) {
    return (Math.round(toNumber(purchasePrice) * 1.3 * 100) / 100).toFixed(2)
}

function createEmptyRow(rowNumber: number): PreviewRow {
    return {
        acceptanceItemId: null,
        productId: null,
        rowId: `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        rowNumber,
        status: 'new',
        action: 'create',
        matchType: 'manual',
        matchScore: 0,
        matchedProductId: null,
        matchedProductName: '',
        matchedProductBarcode: '',
        suggestions: [],
        error: null,
        name: '',
        category: '',
        barcode: '',
        purchasePrice: '0',
        sellingPrice: '0',
        unit: 'piece',
        stock: '1',
        minStock: '0',
        image: '',
    }
}

function renumberRows(rows: PreviewRow[]) {
    return rows.map((row, index) => ({ ...row, rowNumber: index + 1 }))
}

export default function Page() {
    const [file, setFile] = useState<File | null>(null)
    const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
    const [history, setHistory] = useState<AcceptanceHistoryItem[]>([])

    const [supplier, setSupplier] = useState('')
    const [invoiceNumber, setInvoiceNumber] = useState('')
    const [comment, setComment] = useState('')
    const [editingAcceptance, setEditingAcceptance] = useState<AcceptanceDetail | null>(null)

    const [isPreviewLoading, setIsPreviewLoading] = useState(false)
    const [isCommitLoading, setIsCommitLoading] = useState(false)
    const [isHistoryLoading, setIsHistoryLoading] = useState(false)
    const [isAcceptanceLoading, setIsAcceptanceLoading] = useState(false)

    const [error, setError] = useState<string | null>(null)
    const [commitResult, setCommitResult] = useState<CommitResult | null>(null)
    const [isResultModalOpen, setIsResultModalOpen] = useState(false)

    const isEditMode = Boolean(editingAcceptance)

    const summary = useMemo(() => {
        return {
            total: previewRows.length,
            update: previewRows.filter(row => row.action === 'update').length,
            create: previewRows.filter(row => row.action === 'create').length,
            skip: previewRows.filter(row => row.action === 'skip').length,
            review: previewRows.filter(row => row.status === 'review').length,
            error: previewRows.filter(row => row.status === 'error').length,
            totalPurchase: previewRows.reduce((sum, row) => {
                if (row.action === 'skip') return sum
                return sum + toNumber(row.purchasePrice) * toNumber(row.stock)
            }, 0),
            totalSelling: previewRows.reduce((sum, row) => {
                if (row.action === 'skip') return sum
                return sum + toNumber(row.sellingPrice) * toNumber(row.stock)
            }, 0),
        }
    }, [previewRows])

    const loadHistory = async () => {
        try {
            setIsHistoryLoading(true)

            const response = await fetch('/api/products/import/history')

            if (!response.ok) {
                throw new Error('Не удалось загрузить историю')
            }

            const data: AcceptanceHistoryItem[] = await response.json()
            setHistory(data)
        } catch (error) {
            console.error(error)
        } finally {
            setIsHistoryLoading(false)
        }
    }

    useEffect(() => {
        loadHistory()
    }, [])

    const updateRow = (rowId: string, field: keyof PreviewRow, value: any) => {
        setPreviewRows(prev =>
            prev.map(row =>
                row.rowId === rowId
                    ? { ...row, [field]: value }
                    : row
            )
        )
    }

    const handleSuggestionChange = (rowId: string, productId: string) => {
        setPreviewRows(prev =>
            prev.map(row => {
                if (row.rowId !== rowId) {
                    return row
                }

                const selected = row.suggestions.find(item => String(item.id) === productId)

                return {
                    ...row,
                    action: selected ? 'update' : row.action,
                    productId: selected?.id ?? row.productId ?? null,
                    matchedProductId: selected?.id ?? null,
                    matchedProductName: selected?.name ?? '',
                    matchedProductBarcode: selected?.barcode ?? '',
                }
            })
        )
    }

    const resetForm = () => {
        setFile(null)
        setPreviewRows([])
        setSupplier('')
        setInvoiceNumber('')
        setComment('')
        setEditingAcceptance(null)
        setCommitResult(null)
        setError(null)
    }

    const handlePreview = async (e: FormEvent) => {
        e.preventDefault()

        if (!file) {
            setError('Выберите Excel-файл')
            return
        }

        try {
            setIsPreviewLoading(true)
            setError(null)
            setCommitResult(null)
            setEditingAcceptance(null)
            setPreviewRows([])

            const formData = new FormData()
            formData.append('file', file)

            const response = await fetch('/api/products/import/preview', {
                method: 'POST',
                body: formData,
            })

            const data: PreviewResponse | { message?: string } = await response.json()

            if (!response.ok) {
                throw new Error('message' in data ? data.message || 'Ошибка предпросмотра' : 'Ошибка предпросмотра')
            }

            setPreviewRows((data as PreviewResponse).rows)
        } catch (error) {
            console.error(error)
            setError(error instanceof Error ? error.message : 'Ошибка предпросмотра Excel')
        } finally {
            setIsPreviewLoading(false)
        }
    }

    const handleOpenAcceptance = async (id: number) => {
        try {
            setIsAcceptanceLoading(true)
            setError(null)
            setCommitResult(null)

            const response = await fetch(`/api/products/import/history/${id}`)
            const data: AcceptanceDetail | { message?: string } = await response.json()

            if (!response.ok) {
                throw new Error('message' in data ? data.message || 'Не удалось открыть приёмку' : 'Не удалось открыть приёмку')
            }

            const detail = data as AcceptanceDetail
            setEditingAcceptance(detail)
            setSupplier(detail.supplier || '')
            setInvoiceNumber(detail.invoiceNumber || '')
            setComment(detail.comment || '')
            setFile(null)
            setPreviewRows(detail.rows)
        } catch (error) {
            console.error(error)
            setError(error instanceof Error ? error.message : 'Не удалось открыть приёмку')
        } finally {
            setIsAcceptanceLoading(false)
        }
    }

    const addManualRow = () => {
        setPreviewRows(prev => [...prev, createEmptyRow(prev.length + 1)])
    }

    const deleteRow = (rowId: string) => {
        setPreviewRows(prev => renumberRows(prev.filter(row => row.rowId !== rowId)))
    }

    const applyMarkupToAll = () => {
        setPreviewRows(prev => prev.map(row => ({
            ...row,
            sellingPrice: calcSellingPrice(row.purchasePrice),
        })))
    }

    const handleCommit = async () => {
        if (previewRows.length === 0) {
            setError('Нет строк для применения')
            return
        }

        try {
            setIsCommitLoading(true)
            setError(null)

            const url = isEditMode
                ? `/api/products/import/history/${editingAcceptance?.id}`
                : '/api/products/import/commit'

            const response = await fetch(url, {
                method: isEditMode ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    rows: renumberRows(previewRows),
                    sourceFileName: file?.name || editingAcceptance?.sourceFileName || '',
                    supplier,
                    invoiceNumber,
                    comment,
                }),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.message || 'Ошибка сохранения приёмки')
            }

            setCommitResult({
                ...data,
                acceptanceNumber: data.acceptanceNumber || editingAcceptance?.number,
            })
            setIsResultModalOpen(true)
            await loadHistory()

            if (isEditMode && editingAcceptance?.id) {
                await handleOpenAcceptance(editingAcceptance.id)
            }
        } catch (error) {
            console.error(error)
            setError(error instanceof Error ? error.message : 'Ошибка сохранения приёмки')
        } finally {
            setIsCommitLoading(false)
        }
    }

    return (
        <System>
            <section className="relative z-0 w-full min-h-screen bg-gray-50 p-4">
                <div className="mx-auto max-w-[1700px] space-y-4">
                    <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-4">
                        <div className="rounded-2xl bg-white p-5 shadow-sm">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                    <div className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                                        {isEditMode ? `Редактирование ${editingAcceptance?.number}` : 'Новая приёмка'}
                                    </div>

                                    <h1 className="mt-2 text-2xl font-bold text-gray-900">
                                        Приёмка товара
                                    </h1>

                                    <p className="mt-1 text-sm text-gray-500">
                                        Загрузите Excel-накладную, проверьте совпадения, измените закупку/продажу и сохраните приёмку в БД.
                                    </p>
                                </div>

                                {isEditMode && (
                                    <button
                                        type="button"
                                        onClick={resetForm}
                                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100"
                                    >
                                        Новая приёмка
                                    </button>
                                )}
                            </div>

                            <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <label className={labelClass}>Поставщик</label>
                                    <input
                                        type="text"
                                        value={supplier}
                                        onChange={(e) => setSupplier(e.target.value)}
                                        placeholder="Например: ООО Поставщик"
                                        className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className={labelClass}>Номер накладной</label>
                                    <input
                                        type="text"
                                        value={invoiceNumber}
                                        onChange={(e) => setInvoiceNumber(e.target.value)}
                                        placeholder="№ документа"
                                        className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className={labelClass}>Комментарий</label>
                                    <input
                                        type="text"
                                        value={comment}
                                        onChange={(e) => setComment(e.target.value)}
                                        placeholder="Необязательно"
                                        className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                </div>
                            </div>

                            {!isEditMode && (
                                <form onSubmit={handlePreview} className="mt-5 flex flex-col md:flex-row gap-3">
                                    <input
                                        type="file"
                                        accept=".xlsx,.xls,.csv"
                                        onChange={(e) => {
                                            setFile(e.target.files?.[0] || null)
                                            setPreviewRows([])
                                            setCommitResult(null)
                                            setError(null)
                                        }}
                                        className="block flex-1 text-sm text-gray-700 border border-gray-300 rounded-lg cursor-pointer bg-white focus:outline-none file:mr-4 file:py-2.5 file:px-4 file:border-0 file:bg-blue-600 file:text-white file:cursor-pointer hover:file:bg-blue-700"
                                    />

                                    <button
                                        type="submit"
                                        disabled={isPreviewLoading || !file}
                                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {isPreviewLoading && (
                                            <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                                        )}
                                        {isPreviewLoading ? 'Анализ...' : 'Предпросмотр'}
                                    </button>
                                </form>
                            )}

                            {error && (
                                <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                                    {error}
                                </div>
                            )}
                        </div>

                        <div className="rounded-2xl bg-white p-5 shadow-sm">
                            <div className="flex items-center justify-between gap-2">
                                <h2 className="text-lg font-semibold text-gray-900">
                                    История приёмок
                                </h2>

                                <button
                                    type="button"
                                    onClick={loadHistory}
                                    className="text-sm text-blue-600 hover:text-blue-700"
                                >
                                    Обновить
                                </button>
                            </div>

                            <div className="mt-4 max-h-[320px] space-y-2 overflow-y-auto pr-1">
                                {(isHistoryLoading || isAcceptanceLoading) && (
                                    <div className="text-sm text-gray-500">
                                        Загрузка...
                                    </div>
                                )}

                                {!isHistoryLoading && history.length === 0 && (
                                    <div className="text-sm text-gray-500">
                                        Приёмок пока нет
                                    </div>
                                )}

                                {history.map(item => (
                                    <div
                                        key={item.id}
                                        className={`rounded-xl border p-3 ${editingAcceptance?.id === item.id ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-gray-50'}`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleOpenAcceptance(item.id)}
                                                className="text-left font-semibold text-blue-700 hover:text-blue-800"
                                            >
                                                {item.number}
                                            </button>

                                            <div className={`rounded-full px-2 py-0.5 text-xs ${
                                                item.status === 'completed'
                                                    ? 'bg-green-100 text-green-700'
                                                    : 'bg-orange-100 text-orange-700'
                                            }`}>
                                                {item.status === 'completed' ? 'Готово' : 'С ошибками'}
                                            </div>
                                        </div>

                                        <div className="mt-1 text-xs text-gray-500">
                                            {formatDate(item.createdAt)}
                                        </div>

                                        {(item.supplier || item.invoiceNumber) && (
                                            <div className="mt-1 truncate text-xs text-gray-500">
                                                {item.supplier || 'Поставщик не указан'}{item.invoiceNumber ? ` · накл. ${item.invoiceNumber}` : ''}
                                            </div>
                                        )}

                                        {item.sourceFileName && (
                                            <div className="mt-1 truncate text-xs text-gray-500">
                                                Файл: {item.sourceFileName}
                                            </div>
                                        )}

                                        <div className="mt-2 grid grid-cols-5 gap-1 text-center text-xs">
                                            <div className="rounded bg-white p-1">
                                                <div className="text-gray-400">стр.</div>
                                                <div className="font-bold">{item.totalRows}</div>
                                            </div>

                                            <div className="rounded bg-green-50 p-1 text-green-700">
                                                <div>созд.</div>
                                                <div className="font-bold">{item.created}</div>
                                            </div>

                                            <div className="rounded bg-blue-50 p-1 text-blue-700">
                                                <div>обн.</div>
                                                <div className="font-bold">{item.updated}</div>
                                            </div>

                                            <div className="rounded bg-orange-50 p-1 text-orange-700">
                                                <div>проп.</div>
                                                <div className="font-bold">{item.skipped}</div>
                                            </div>

                                            <div className="rounded bg-red-50 p-1 text-red-700">
                                                <div>ош.</div>
                                                <div className="font-bold">{item.errors}</div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <ProductMovementForm mode="acceptance" />

                    {previewRows.length > 0 && (
                        <>
                            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
                                <div className="rounded-xl bg-white p-3 shadow-sm">
                                    <div className="text-xs text-gray-500">Всего</div>
                                    <div className="text-xl font-bold">{summary.total}</div>
                                </div>

                                <div className="rounded-xl bg-white p-3 shadow-sm">
                                    <div className="text-xs text-gray-500">Обновить</div>
                                    <div className="text-xl font-bold text-green-700">{summary.update}</div>
                                </div>

                                <div className="rounded-xl bg-white p-3 shadow-sm">
                                    <div className="text-xs text-gray-500">Создать</div>
                                    <div className="text-xl font-bold text-blue-700">{summary.create}</div>
                                </div>

                                <div className="rounded-xl bg-white p-3 shadow-sm">
                                    <div className="text-xs text-gray-500">Пропуск</div>
                                    <div className="text-xl font-bold text-gray-700">{summary.skip}</div>
                                </div>

                                <div className="rounded-xl bg-white p-3 shadow-sm">
                                    <div className="text-xs text-gray-500">Проверить</div>
                                    <div className="text-xl font-bold text-orange-700">{summary.review}</div>
                                </div>

                                <div className="rounded-xl bg-white p-3 shadow-sm">
                                    <div className="text-xs text-gray-500">Ошибки</div>
                                    <div className="text-xl font-bold text-red-700">{summary.error}</div>
                                </div>

                                <div className="rounded-xl bg-white p-3 shadow-sm">
                                    <div className="text-xs text-gray-500">Закупка</div>
                                    <div className="text-xl font-bold">{summary.totalPurchase.toFixed(2)}</div>
                                </div>

                                <div className="rounded-xl bg-white p-3 shadow-sm">
                                    <div className="text-xs text-gray-500">Продажа</div>
                                    <div className="text-xl font-bold">{summary.totalSelling.toFixed(2)}</div>
                                </div>
                            </div>

                            <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
                                <div className="flex flex-col gap-3 border-b border-gray-100 p-4 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                        <h2 className="text-lg font-semibold text-gray-900">
                                            {isEditMode ? 'Редактирование позиций приёмки' : 'Предпросмотр'}
                                        </h2>

                                        <p className="text-xs text-gray-500">
                                            Цена продажи редактируется прямо в строке. При сохранении старая приёмка пересчитывается по разнице остатков.
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={addManualRow}
                                            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100"
                                        >
                                            Добавить строку
                                        </button>

                                        <button
                                            type="button"
                                            onClick={applyMarkupToAll}
                                            className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700 transition-colors hover:bg-blue-100"
                                        >
                                            Продажа = закупка +30%
                                        </button>

                                        <button
                                            type="button"
                                            onClick={handleCommit}
                                            disabled={isCommitLoading}
                                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {isCommitLoading && (
                                                <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                                            )}
                                            {isCommitLoading
                                                ? 'Сохранение...'
                                                : isEditMode
                                                    ? 'Сохранить изменения'
                                                    : 'Применить импорт'}
                                        </button>
                                    </div>
                                </div>

                                <div className="max-h-[62vh] overflow-auto">
                                    <table className="w-full min-w-[1320px] text-xs">
                                        <thead className="sticky top-0 z-10 bg-gray-100 text-gray-600 shadow-sm">
                                        <tr>
                                            <th className="w-12 p-2 text-left">№</th>
                                            <th className="w-24 p-2 text-left">Статус</th>
                                            <th className="w-36 p-2 text-left">Действие</th>
                                            <th className="w-66 p-2 text-left">Товар из БД</th>
                                            <th className="w-72 p-2 text-left">Название</th>
                                            <th className="w-36 p-2 text-left">Категория</th>
                                            <th className="w-36 p-2 text-left">Штрихкод</th>
                                            <th className="w-24 p-2 text-left">Закупка</th>
                                            <th className="w-32 p-2 text-left">Продажа</th>
                                            <th className="w-20 p-2 text-left">Кол.</th>
                                            <th className="w-20 p-2 text-left">Ед.</th>
                                            <th className="w-20 p-2 text-left">Мин.</th>
                                            <th className="w-20 p-2 text-left"></th>
                                        </tr>
                                        </thead>

                                        <tbody>
                                        {previewRows.map(row => (
                                            <tr key={row.rowId} className="border-t border-gray-100 align-top hover:bg-gray-50">
                                                <td className="p-2 font-medium">
                                                    {row.rowNumber}
                                                </td>

                                                <td className="p-2">
                                                    <div className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${getStatusClass(row.status)}`}>
                                                        {getStatusLabel(row.status)}
                                                    </div>

                                                    {row.matchScore > 0 && (
                                                        <div className="mt-1 text-[11px] text-gray-400">
                                                            {Math.round(row.matchScore * 100)}%
                                                        </div>
                                                    )}

                                                    {row.error && (
                                                        <div className="mt-1 max-w-[140px] text-[11px] text-red-600">
                                                            {row.error}
                                                        </div>
                                                    )}
                                                </td>

                                                <td className="p-2">
                                                    <select
                                                        value={row.action}
                                                        onChange={(e) => updateRow(row.rowId, 'action', e.target.value as ImportAction)}
                                                        className={selectClass}
                                                    >
                                                        {ACTION_OPTIONS.map(option => (
                                                            <option key={option.value} value={option.value}>
                                                                {option.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>

                                                <td className="p-2">
                                                    <select
                                                        value={row.matchedProductId ?? ''}
                                                        onChange={(e) => handleSuggestionChange(row.rowId, e.target.value)}
                                                        disabled={row.action !== 'update'}
                                                        className={`${selectClass} disabled:bg-gray-100`}
                                                    >
                                                        <option value="">Выберите товар</option>
                                                        {row.suggestions.map(suggestion => (
                                                            <option key={suggestion.id} value={suggestion.id}>
                                                                {suggestion.name} · ост. {suggestion.stock} · {Math.round(suggestion.score * 100)}%
                                                            </option>
                                                        ))}
                                                    </select>

                                                    {row.matchedProductName && (
                                                        <div className="mt-1 max-w-[270px] truncate text-[11px] text-gray-400">
                                                            {row.matchedProductName}
                                                        </div>
                                                    )}
                                                </td>

                                                <td className="p-2">
                                                    <input
                                                        type="text"
                                                        value={row.name}
                                                        onChange={(e) => updateRow(row.rowId, 'name', e.target.value)}
                                                        className={inputClass}
                                                    />
                                                </td>

                                                <td className="p-2">
                                                    <input
                                                        type="text"
                                                        value={row.category}
                                                        onChange={(e) => updateRow(row.rowId, 'category', e.target.value)}
                                                        className={inputClass}
                                                    />
                                                </td>

                                                <td className="p-2">
                                                    <input
                                                        type="text"
                                                        value={row.barcode}
                                                        onChange={(e) => updateRow(row.rowId, 'barcode', e.target.value)}
                                                        placeholder="auto"
                                                        className={inputClass}
                                                    />
                                                </td>

                                                <td className="p-2">
                                                    <input
                                                        type="number"
                                                        value={row.purchasePrice}
                                                        onChange={(e) => updateRow(row.rowId, 'purchasePrice', e.target.value)}
                                                        className={inputClass}
                                                    />
                                                </td>

                                                <td className="p-2">
                                                    <div className="flex gap-1">
                                                        <input
                                                            type="number"
                                                            value={row.sellingPrice}
                                                            onChange={(e) => updateRow(row.rowId, 'sellingPrice', e.target.value)}
                                                            className={inputClass}
                                                        />

                                                        <button
                                                            type="button"
                                                            onClick={() => updateRow(row.rowId, 'sellingPrice', calcSellingPrice(row.purchasePrice))}
                                                            className="h-8 shrink-0 rounded-md border border-blue-200 bg-blue-50 px-2 text-[11px] text-blue-700 hover:bg-blue-100"
                                                            title="Рассчитать продажу: закупка +30%"
                                                        >
                                                            +30%
                                                        </button>
                                                    </div>
                                                </td>

                                                <td className="p-2">
                                                    <input
                                                        type="number"
                                                        value={row.stock}
                                                        onChange={(e) => updateRow(row.rowId, 'stock', e.target.value)}
                                                        className={inputClass}
                                                    />
                                                </td>

                                                <td className="p-2">
                                                    <select
                                                        value={row.unit}
                                                        onChange={(e) => updateRow(row.rowId, 'unit', e.target.value as ProductUnit)}
                                                        className={selectClass}
                                                    >
                                                        <option value="piece">шт.</option>
                                                        <option value="weight">кг</option>
                                                    </select>
                                                </td>

                                                <td className="p-2">
                                                    <input
                                                        type="number"
                                                        value={row.minStock}
                                                        onChange={(e) => updateRow(row.rowId, 'minStock', e.target.value)}
                                                        className={inputClass}
                                                    />
                                                </td>

                                                <td className="p-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => deleteRow(row.rowId)}
                                                        className="rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700 hover:bg-red-100"
                                                    >
                                                        Удалить
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {isResultModalOpen && commitResult && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4">
                        <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                            <div className="border-b border-green-100 bg-green-50 px-6 py-5">
                                <h2 className="text-xl font-bold text-green-800">
                                    {isEditMode ? 'Приёмка обновлена' : 'Приёмка применена'}
                                </h2>

                                <p className="mt-1 text-sm text-green-700">
                                    Номер приёмки: <span className="font-bold">{commitResult.acceptanceNumber || commitResult.acceptanceId}</span>
                                </p>
                            </div>

                            <div className="px-6 py-5">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                        <div className="text-gray-500">Всего</div>
                                        <div className="mt-1 text-2xl font-bold">{commitResult.totalRows}</div>
                                    </div>

                                    <div className="rounded-xl border border-green-100 bg-green-50 p-4">
                                        <div className="text-green-700">Создано</div>
                                        <div className="mt-1 text-2xl font-bold text-green-800">{commitResult.created}</div>
                                    </div>

                                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                                        <div className="text-blue-700">Обновлено</div>
                                        <div className="mt-1 text-2xl font-bold text-blue-800">{commitResult.updated}</div>
                                    </div>

                                    <div className="rounded-xl border border-orange-100 bg-orange-50 p-4">
                                        <div className="text-orange-700">Пропущено</div>
                                        <div className="mt-1 text-2xl font-bold text-orange-800">{commitResult.skipped}</div>
                                    </div>
                                </div>

                                {commitResult.errors.length > 0 && (
                                    <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4">
                                        <h3 className="font-semibold text-red-800 mb-2">
                                            Ошибки:
                                        </h3>

                                        <ul className="space-y-2 text-sm text-red-700">
                                            {commitResult.errors.map((item, index) => (
                                                <li key={index}>• {item}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
                                <button
                                    type="button"
                                    onClick={() => setIsResultModalOpen(false)}
                                    className="rounded-lg border border-gray-300 bg-white px-5 py-2 text-gray-700 transition-colors hover:bg-gray-100"
                                >
                                    Закрыть
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsResultModalOpen(false)
                                        resetForm()
                                    }}
                                    className="rounded-lg bg-blue-600 px-5 py-2 text-white transition-colors hover:bg-blue-700"
                                >
                                    Новая приёмка
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </section>
        </System>
    )
}

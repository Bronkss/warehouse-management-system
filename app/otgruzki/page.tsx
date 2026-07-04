'use client'

import { useEffect, useMemo, useState } from 'react'
import {
    clearShipmentState,
    readShipmentState,
    SHIPMENT_MODAL_DRAFT_KEY,
    SHIPMENT_PAGE_DRAFT_KEY,
    writeShipmentState,
} from '@/app/lib/shipmentStateManager'
import System from '@/app/components/SystemShell'
import ProductMovementForm from '@/app/components/ProductMovementForm'

type ProductUnit = 'piece' | 'weight'

type ShipmentHistoryItem = {
    id: number
    number: string
    shipper: string
    consignee: string
    totalRows: number
    totalQuantity: number
    totalAmount: number
    status: string
    createdAt: string
    updatedAt: string
}

type ShipmentDetailRow = {
    shipmentItemId?: number | null
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

type ShipmentDetail = {
    id: number
    number: string
    shipper: string
    consignee: string
    totalRows: number
    totalQuantity: number
    totalAmount: number
    status: string
    createdAt: string
    updatedAt: string
    rows: ShipmentDetailRow[]
}

type ShipmentPageDraftState = {
    historySearch: string
}

type ShipmentModalDraftState = {
    isOpen: boolean
    selectedShipment: ShipmentDetail | null
    modalRows: ShipmentDetailRow[]
    modalShipper: string
    modalConsignee: string
}

const inputClass = 'h-9 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-1 focus:ring-blue-500'
const tableInputClass = 'h-8 w-full rounded-md border border-gray-300 px-2 text-xs outline-none focus:ring-1 focus:ring-blue-500'
const buttonClass = 'rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'

function formatDate(value: string) {
    if (!value) return '—'
    return new Date(value).toLocaleString('ru-RU')
}

function toNumber(value: string | number | null | undefined) {
    const parsed = Number(String(value ?? '0').replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : 0
}

function money(value: number) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(Math.round(value || 0))
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

function renumberRows(rows: ShipmentDetailRow[]) {
    return rows.map((row, index) => ({ ...row, rowNumber: index + 1 }))
}

function buildWaybillHtml(data: ShipmentDetail) {
    const date = data.createdAt ? new Date(data.createdAt).toLocaleDateString('ru-RU') : new Date().toLocaleDateString('ru-RU')

    const rowsHtml = data.rows.map((item, index) => {
        const qty = toNumber(item.quantity)
        const price = toNumber(item.sellingPrice)
        const sum = qty * price

        return `
            <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(item.name)}</td>
                <td>${escapeHtml(item.barcode || '-')}</td>
                <td>${unitLabel(item.unit)}</td>
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
            <title>ТТН ${escapeHtml(data.number)}</title>
            <style>
                * { box-sizing: border-box; }
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
                th, td {
                    border: 1px solid #111827;
                    padding: 6px;
                    text-align: left;
                }
                th { background: #f3f4f6; }
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
                @media print { body { margin: 12mm; } }
            </style>
        </head>
        <body>
            <h1>Товарно-транспортная накладная № ${escapeHtml(data.number)}</h1>

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
                    <strong>Грузоотправитель:</strong>
                    <div class="line">${escapeHtml(data.shipper || '-')}</div>
                </div>
                <div>
                    <strong>Грузополучатель:</strong>
                    <div class="line">${escapeHtml(data.consignee || '-')}</div>
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
                <tbody>${rowsHtml}</tbody>
            </table>

            <div class="total">Итого: ${money(data.rows.reduce((sum, item) => sum + toNumber(item.quantity) * toNumber(item.sellingPrice), 0))}</div>

            <div class="signatures">
                <div class="signature-line">Отпустил</div>
                <div class="signature-line">Получил</div>
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
    const [history, setHistory] = useState<ShipmentHistoryItem[]>([])
    const [historySearch, setHistorySearch] = useState('')

    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
    const [isHistoryLoading, setIsHistoryLoading] = useState(false)
    const [isShipmentLoading, setIsShipmentLoading] = useState(false)
    const [isSaveLoading, setIsSaveLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [isModalOpen, setIsModalOpen] = useState(false)
    const [selectedShipment, setSelectedShipment] = useState<ShipmentDetail | null>(null)
    const [modalRows, setModalRows] = useState<ShipmentDetailRow[]>([])
    const [modalShipper, setModalShipper] = useState('')
    const [modalConsignee, setModalConsignee] = useState('')
    const [isPageHydrated, setIsPageHydrated] = useState(false)
    const [isModalHydrated, setIsModalHydrated] = useState(false)

    const filteredHistory = useMemo(() => {
        const query = historySearch.trim().toLowerCase()

        if (!query) return history

        return history.filter(item => {
            const searchable = [
                item.number,
                item.shipper,
                item.consignee,
                item.status,
                formatDate(item.createdAt),
                String(item.totalRows),
                String(item.totalQuantity),
                String(item.totalAmount),
            ].join(' ').toLowerCase()

            return searchable.includes(query)
        })
    }, [history, historySearch])

    const modalSummary = useMemo(() => {
        return {
            totalRows: modalRows.length,
            totalQuantity: modalRows.reduce((sum, row) => sum + toNumber(row.quantity), 0),
            totalAmount: modalRows.reduce((sum, row) => sum + toNumber(row.quantity) * toNumber(row.sellingPrice), 0),
        }
    }, [modalRows])

    const loadHistory = async () => {
        try {
            setIsHistoryLoading(true)
            setError(null)

            const response = await fetch('/api/shipment/history', {
                method: 'GET',
                cache: 'no-store',
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data?.message || 'Не удалось загрузить историю отгрузок')
            }

            setHistory(Array.isArray(data) ? data : [])
        } catch (error) {
            console.error(error)
            setError(error instanceof Error ? error.message : 'Не удалось загрузить историю отгрузок')
        } finally {
            setIsHistoryLoading(false)
        }
    }

    useEffect(() => {
        let isMounted = true

        const restorePageDraft = async () => {
            const draft = await readShipmentState<ShipmentPageDraftState>(SHIPMENT_PAGE_DRAFT_KEY)

            if (!isMounted) return

            if (draft) {
                setHistorySearch(draft.historySearch || '')
            }

            setIsPageHydrated(true)
        }

        const restoreModalDraft = async () => {
            const draft = await readShipmentState<ShipmentModalDraftState>(SHIPMENT_MODAL_DRAFT_KEY)

            if (!isMounted) return

            if (draft?.isOpen && draft.selectedShipment) {
                setIsModalOpen(true)
                setSelectedShipment(draft.selectedShipment)
                setModalRows(Array.isArray(draft.modalRows) ? draft.modalRows : [])
                setModalShipper(draft.modalShipper || '')
                setModalConsignee(draft.modalConsignee || '')
            }

            setIsModalHydrated(true)
        }

        void restorePageDraft()
        void restoreModalDraft()
        void loadHistory()

        const handleShipmentSaved = () => {
            void loadHistory()
        }

        window.addEventListener('shipment-history-updated', handleShipmentSaved)

        return () => {
            isMounted = false
            window.removeEventListener('shipment-history-updated', handleShipmentSaved)
        }
    }, [])

    useEffect(() => {
        if (!isPageHydrated) return

        writeShipmentState<ShipmentPageDraftState>(SHIPMENT_PAGE_DRAFT_KEY, {
            historySearch,
        })
    }, [historySearch, isPageHydrated])

    useEffect(() => {
        if (!isModalHydrated) return

        writeShipmentState<ShipmentModalDraftState>(SHIPMENT_MODAL_DRAFT_KEY, {
            isOpen: isModalOpen,
            selectedShipment,
            modalRows,
            modalShipper,
            modalConsignee,
        })
    }, [isModalOpen, isModalHydrated, modalConsignee, modalRows, modalShipper, selectedShipment])

    const openHistoryModal = () => {
        setIsHistoryModalOpen(true)
        setError(null)
        void loadHistory()
    }

    const closeModal = () => {
        setIsModalOpen(false)
        setSelectedShipment(null)
        setModalRows([])
        setModalShipper('')
        setModalConsignee('')
        clearShipmentState(SHIPMENT_MODAL_DRAFT_KEY)
    }

    const openShipmentModal = async (id: number) => {
        try {
            setIsShipmentLoading(true)
            setError(null)
            setIsHistoryModalOpen(false)
            setIsModalOpen(true)
            setSelectedShipment(null)
            setModalRows([])

            const response = await fetch(`/api/shipment/history/${id}`, {
                method: 'GET',
                cache: 'no-store',
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data?.message || 'Не удалось открыть отгрузку')
            }

            const detail = data as ShipmentDetail
            setSelectedShipment(detail)
            setModalRows(detail.rows || [])
            setModalShipper(detail.shipper || '')
            setModalConsignee(detail.consignee || '')
        } catch (error) {
            console.error(error)
            setError(error instanceof Error ? error.message : 'Не удалось открыть отгрузку')
        } finally {
            setIsShipmentLoading(false)
        }
    }

    const updateModalRow = (rowId: string, field: keyof ShipmentDetailRow, value: ShipmentDetailRow[keyof ShipmentDetailRow]) => {
        setModalRows(prev =>
            prev.map(row =>
                row.rowId === rowId
                    ? { ...row, [field]: value }
                    : row
            )
        )
    }

    const deleteModalRow = (rowId: string) => {
        setModalRows(prev => renumberRows(prev.filter(row => row.rowId !== rowId)))
    }

    const saveModalShipment = async () => {
        if (!selectedShipment) return

        if (modalRows.length === 0) {
            setError('В отгрузке должна быть хотя бы одна позиция')
            return
        }

        try {
            setIsSaveLoading(true)
            setError(null)

            const response = await fetch(`/api/shipment/history/${selectedShipment.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    shipper: modalShipper,
                    consignee: modalConsignee,
                    rows: renumberRows(modalRows).map(row => ({
                        shipmentItemId: row.shipmentItemId,
                        productId: row.productId,
                        rowId: row.rowId,
                        rowNumber: row.rowNumber,
                        name: row.name,
                        category: row.category,
                        barcode: row.barcode,
                        unit: row.unit,
                        quantity: row.quantity,
                        purchasePrice: row.purchasePrice,
                        sellingPrice: row.sellingPrice,
                    })),
                }),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data?.message || 'Не удалось сохранить отгрузку')
            }

            await loadHistory()

            const detailResponse = await fetch(`/api/shipment/history/${selectedShipment.id}`, {
                method: 'GET',
                cache: 'no-store',
            })
            const detail = await detailResponse.json()

            if (detailResponse.ok) {
                setSelectedShipment(detail)
                setModalRows(detail.rows || [])
                setModalShipper(detail.shipper || '')
                setModalConsignee(detail.consignee || '')
            }

            alert('Изменения отгрузки сохранены в БД')
        } catch (error) {
            console.error(error)
            setError(error instanceof Error ? error.message : 'Не удалось сохранить отгрузку')
        } finally {
            setIsSaveLoading(false)
        }
    }

    const printCurrentShipment = () => {
        if (!selectedShipment) return

        printHtml(buildWaybillHtml({
            ...selectedShipment,
            shipper: modalShipper,
            consignee: modalConsignee,
            rows: modalRows,
        }))
    }

    return (
        <System>
            <section className="relative z-0 w-full min-h-screen bg-gray-50 p-4">
                <div className="mx-auto max-w-[1600px] space-y-4">
                    <div className="rounded-2xl bg-white p-5 shadow-sm">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div>
                                <div className="inline-flex rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                                    Новая отгрузка
                                </div>

                                <h1 className="mt-2 text-2xl font-bold text-gray-900">
                                    Отгрузки
                                </h1>

                                <p className="mt-1 max-w-3xl text-sm text-gray-500">
                                    Форма добавления находится сразу под шапкой. История скрыта в отдельном окне и не мешает работе со сканером.
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={openHistoryModal}
                                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
                                >
                                    История отгрузок ({history.length})
                                </button>

                                <button
                                    type="button"
                                    onClick={loadHistory}
                                    disabled={isHistoryLoading}
                                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
                                >
                                    {isHistoryLoading ? 'Обновляю...' : 'Обновить историю'}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                                {error}
                            </div>
                        )}
                    </div>

                    <ProductMovementForm
                        mode="shipment"
                        onShipmentSaved={loadHistory}
                    />
                </div>

                {isHistoryModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-3 py-4">
                        <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                            <div className="border-b border-gray-100 bg-gray-50 px-5 py-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900">
                                            История отгрузок
                                        </h2>

                                        <p className="mt-1 text-sm text-gray-500">
                                            Откройте отгрузку для просмотра, редактирования или печати ТТН.
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={loadHistory}
                                            disabled={isHistoryLoading}
                                            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
                                        >
                                            {isHistoryLoading ? 'Обновляю...' : 'Обновить'}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setIsHistoryModalOpen(false)}
                                            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100"
                                        >
                                            Закрыть
                                        </button>
                                    </div>
                                </div>

                                <input
                                    type="search"
                                    value={historySearch}
                                    onChange={(e) => setHistorySearch(e.target.value)}
                                    placeholder="Поиск: номер, отправитель, получатель, дата"
                                    className="mt-4 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                                />
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto p-5">
                                {(isHistoryLoading || isShipmentLoading) && (
                                    <div className="mb-3 text-sm text-gray-500">
                                        Загрузка...
                                    </div>
                                )}

                                {!isHistoryLoading && filteredHistory.length === 0 && (
                                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-8 text-center text-sm text-gray-500">
                                        Отгрузок пока нет
                                    </div>
                                )}

                                <div className="space-y-2">
                                    {filteredHistory.map(item => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => openShipmentModal(item.id)}
                                            className={`block w-full rounded-xl border p-3 text-left transition-colors hover:bg-blue-50 ${selectedShipment?.id === item.id ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-gray-50'}`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="font-semibold text-blue-700">
                                                    {item.number}
                                                </div>

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

                                            {(item.shipper || item.consignee) && (
                                                <div className="mt-1 truncate text-xs text-gray-500">
                                                    {item.shipper || 'Отправитель не указан'} → {item.consignee || 'Получатель не указан'}
                                                </div>
                                            )}

                                            <div className="mt-3 grid grid-cols-3 gap-1 text-center text-xs">
                                                <div className="rounded bg-white p-1">
                                                    <div className="text-gray-400">стр.</div>
                                                    <div className="font-bold">{item.totalRows}</div>
                                                </div>

                                                <div className="rounded bg-blue-50 p-1 text-blue-700">
                                                    <div>кол.</div>
                                                    <div className="font-bold">{item.totalQuantity}</div>
                                                </div>

                                                <div className="rounded bg-green-50 p-1 text-green-700">
                                                    <div>сумма</div>
                                                    <div className="font-bold">{money(item.totalAmount)}</div>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {isModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-3 py-4">
                        <div className="flex max-h-[92vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                            <div className="border-b border-gray-100 bg-gray-50 px-5 py-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900">
                                            {selectedShipment ? `Отгрузка ${selectedShipment.number}` : 'Загрузка отгрузки...'}
                                        </h2>

                                        <p className="mt-1 text-sm text-gray-500">
                                            Можно посмотреть позиции, изменить количество и сохранить изменения в БД. Остатки пересчитаются автоматически.
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {selectedShipment && (
                                            <button
                                                type="button"
                                                onClick={printCurrentShipment}
                                                className={`${buttonClass} border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100`}
                                            >
                                                Печать ТТН
                                            </button>
                                        )}

                                        <button
                                            type="button"
                                            onClick={closeModal}
                                            className={`${buttonClass} border border-gray-300 bg-white text-gray-700 hover:bg-gray-100`}
                                        >
                                            Закрыть
                                        </button>
                                    </div>
                                </div>

                                {selectedShipment && (
                                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                                        <div>
                                            <label className="mb-1 block text-xs font-medium text-gray-500">Грузоотправитель</label>
                                            <input
                                                value={modalShipper}
                                                onChange={(e) => setModalShipper(e.target.value)}
                                                className={inputClass}
                                            />
                                        </div>

                                        <div>
                                            <label className="mb-1 block text-xs font-medium text-gray-500">Грузополучатель</label>
                                            <input
                                                value={modalConsignee}
                                                onChange={(e) => setModalConsignee(e.target.value)}
                                                className={inputClass}
                                            />
                                        </div>

                                        <div className="rounded-xl border border-gray-100 bg-white p-3">
                                            <div className="text-xs text-gray-500">Кол-во строк</div>
                                            <div className="text-xl font-bold">{modalSummary.totalRows}</div>
                                        </div>

                                        <div className="rounded-xl border border-gray-100 bg-white p-3">
                                            <div className="text-xs text-gray-500">Итого</div>
                                            <div className="text-xl font-bold">{money(modalSummary.totalAmount)}</div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 overflow-auto p-5">
                                {isShipmentLoading && (
                                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-6 text-center text-gray-500">
                                        Загрузка позиций...
                                    </div>
                                )}

                                {!isShipmentLoading && selectedShipment && (
                                    <div className="overflow-auto rounded-xl border border-gray-100">
                                        <table className="w-full min-w-[1100px] text-xs">
                                            <thead className="sticky top-0 z-10 bg-gray-100 text-gray-600 shadow-sm">
                                            <tr>
                                                <th className="w-12 p-2 text-left">№</th>
                                                <th className="w-72 p-2 text-left">Товар</th>
                                                <th className="w-40 p-2 text-left">Штрихкод</th>
                                                <th className="w-32 p-2 text-left">Категория</th>
                                                <th className="w-20 p-2 text-left">Ед.</th>
                                                <th className="w-28 p-2 text-left">Кол.</th>
                                                <th className="w-28 p-2 text-left">Продажа</th>
                                                <th className="w-32 p-2 text-left">Сумма</th>
                                                <th className="w-28 p-2 text-left">Остаток был</th>
                                                <th className="w-28 p-2 text-left">Остаток стал</th>
                                                <th className="w-20 p-2 text-left"></th>
                                            </tr>
                                            </thead>

                                            <tbody>
                                            {modalRows.map(row => {
                                                const sum = toNumber(row.quantity) * toNumber(row.sellingPrice)

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
                                                                type="number"
                                                                min="0"
                                                                step={row.unit === 'weight' ? '0.001' : '1'}
                                                                value={row.quantity}
                                                                onChange={(e) => updateModalRow(row.rowId, 'quantity', e.target.value)}
                                                                className={tableInputClass}
                                                            />
                                                        </td>

                                                        <td className="p-2">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="1"
                                                                value={row.sellingPrice}
                                                                onChange={(e) => updateModalRow(row.rowId, 'sellingPrice', e.target.value)}
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
                                    При сохранении старая отгрузка возвращается на остаток, затем новая версия снова списывается.
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={closeModal}
                                        className={`${buttonClass} border border-gray-300 bg-white text-gray-700 hover:bg-gray-100`}
                                    >
                                        Отмена
                                    </button>

                                    <button
                                        type="button"
                                        onClick={saveModalShipment}
                                        disabled={isSaveLoading || !selectedShipment}
                                        className={`${buttonClass} bg-green-600 text-white hover:bg-green-700`}
                                    >
                                        {isSaveLoading ? 'Сохранение...' : 'Сохранить в БД'}
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

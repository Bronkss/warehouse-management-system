'use client'

import { useEffect, useMemo, useState } from 'react'
import JsBarcode from 'jsbarcode'

import {
    ACCEPTANCE_MODAL_DRAFT_KEY,
    ACCEPTANCE_PAGE_DRAFT_KEY,
    clearPersistentState,
    readPersistentState,
    writePersistentState,
} from '@/app/lib/acceptanceStateManager'

import System from '@/app/components/SystemShell'
import ProductMovementForm from '@/app/components/ProductMovementForm'
import { getPrimaryBarcode } from '@/app/utils/barcodes'

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

type AcceptancePrintData = {
    number: string
    supplier: string
    invoiceNumber: string
    comment: string
    createdAt: string
    rows: PreviewRow[]
}

type AcceptancePageDraftState = {
    supplier: string
    invoiceNumber: string
    comment: string
    historySearch: string
}

type AcceptanceModalDraftState = {
    isOpen: boolean
    selectedAcceptance: AcceptanceDetail | null
    modalRows: PreviewRow[]
    modalSupplier: string
    modalInvoiceNumber: string
    modalComment: string
}

type AcceptanceLabelProduct = {
    id: number
    name: string
    category: string
    barcode: string
    sellingPrice: number
    unit: ProductUnit
    quantity: number
    selected: boolean
}

type AcceptanceSavedRow = {
    product: {
        id: number
        name: string
        category: string
        barcode: string
        sellingPrice: number
        unit: ProductUnit
    }
    category: string
    sellingPrice: string
}

const ACTION_OPTIONS: { value: ImportAction; label: string }[] = [
    { value: 'update', label: 'Добавить остаток' },
    { value: 'create', label: 'Создать товар' },
    { value: 'skip', label: 'Пропустить' },
]

const inputClass =
    'h-8 w-full rounded-md border border-gray-300 px-2 text-xs outline-none focus:ring-1 focus:ring-blue-500'

const selectClass =
    'h-8 w-full rounded-md border border-gray-300 px-2 pr-5 text-xs outline-none focus:ring-1 focus:ring-blue-500 bg-white'

const labelClass =
    'mb-1 block text-xs font-medium text-gray-500'

const pageInputClass =
    'h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-1 focus:ring-blue-500'

function getStatusLabel(status: ImportStatus) {
    if (status === 'matched') return 'Совп.'
    if (status === 'review') return 'Проверить'
    if (status === 'new') return 'Новый'
    return 'Ошибка'
}

function getStatusClass(status: ImportStatus) {
    if (status === 'matched') {
        return 'bg-green-50 text-green-700 border-green-100'
    }

    if (status === 'review') {
        return 'bg-orange-50 text-orange-700 border-orange-100'
    }

    if (status === 'new') {
        return 'bg-blue-50 text-blue-700 border-blue-100'
    }

    return 'bg-red-50 text-red-700 border-red-100'
}

function formatDate(value: string) {
    if (!value) return '—'
    return new Date(value).toLocaleString('ru-RU')
}

function toNumber(value: string | number | null | undefined) {
    const parsed = Number(
        String(value ?? '0').replace(',', '.')
    )

    return Number.isFinite(parsed) ? parsed : 0
}

function calcSellingPrice(purchasePrice: string) {
    return String(
        Math.round(
            toNumber(purchasePrice) * 1.3
        )
    )
}

function money(value: number) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(
        Math.round(value || 0)
    )
}

function escapeHtml(value: string) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
}

function unitLabel(unit: ProductUnit) {
    return unit === 'weight'
        ? 'кг'
        : 'шт.'
}

function renderAcceptanceBarcodeSvg(
    barcodeFromDb: string
): string {
    const barcode = getPrimaryBarcode(
        String(barcodeFromDb || '')
    ).trim()

    if (!barcode) {
        return ''
    }

    try {
        const svg = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'svg'
        )

        JsBarcode(svg, barcode, {
            format: 'CODE128',
            width: 0.85,
            height: 22,
            displayValue: false,
            margin: 0,
        })

        return new XMLSerializer()
            .serializeToString(svg)
    } catch (error) {
        console.error(
            'Ошибка формирования штрихкода:',
            error
        )

        return ''
    }
}

function buildAcceptanceThermalLabelsHtml(
    products: AcceptanceLabelProduct[]
): string {
    const labels = products
        .map(product => {
            const price = new Intl.NumberFormat('ru-RU', {
                maximumFractionDigits: 0,
            }).format(
                Math.round(product.sellingPrice)
            )

            const barcodeSvg =
                renderAcceptanceBarcodeSvg(
                    product.barcode
                )

            const unit =
                product.unit === 'weight'
                    ? 'за кг'
                    : 'за шт'

            return `
                <section class="label-page">
                    <div class="label">
                        <div class="label-name">
                            ${escapeHtml(product.name)}
                        </div>

                        <div class="label-price-row">
                            <div class="label-price">
                                ${price} ₽
                            </div>

                            <div class="label-unit">
                                ${unit}
                            </div>
                        </div>

                        <div class="label-barcode">
                            ${
                barcodeSvg
                    ? barcodeSvg
                    : '<div class="no-barcode">ШК нет</div>'
            }
                        </div>
                    </div>
                </section>
            `
        })
        .join('')

    return `
        <!doctype html>
        <html lang="ru">
        <head>
            <meta charset="utf-8" />

            <title>Ценники приёмки</title>

            <style>
                @page {
                    size: 58mm 40mm;
                    margin: 0;
                }

                * {
                    box-sizing: border-box;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }

                html,
                body {
                    width: 58mm;
                    margin: 0;
                    padding: 0;
                    background: #ffffff;
                    color: #000000;
                    font-family: Arial, sans-serif;
                }

                .label-page {
                    width: 58mm;
                    height: 40mm;
                    margin: 0;
                    padding: 0;
                    overflow: hidden;

                    break-after: page;
                    page-break-after: always;

                    break-inside: avoid;
                    page-break-inside: avoid;
                }

                .label-page:last-child {
                    break-after: auto;
                    page-break-after: auto;
                }

                .label {
                    width: 58mm;
                    height: 40mm;

                    padding: 2mm 2.4mm 1.4mm;

                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;

                    overflow: hidden;

                    border: none;
                    outline: none;

                    background: #ffffff;
                }

                .label-name {
                    min-height: 11.5mm;
                    max-height: 12.8mm;

                    overflow: hidden;

                    display: -webkit-box;
                    -webkit-box-orient: vertical;
                    -webkit-line-clamp: 2;

                    font-size: 14px;
                    line-height: 1.08;
                    font-weight: 900;
                    letter-spacing: -0.15px;

                    text-align: center;
                }

                .label-price-row {
                    text-align: center;
                }

                .label-price {
                    font-size: 31px;
                    line-height: 0.95;
                    font-weight: 900;
                    letter-spacing: -0.8px;
                    white-space: nowrap;
                }

                .label-unit {
                    margin-top: 1mm;

                    font-size: 12px;
                    line-height: 1;
                    font-weight: 800;
                }

                .label-barcode {
                    width: 100%;
                    height: 6.8mm;

                    display: flex;
                    align-items: flex-end;
                    justify-content: center;

                    overflow: hidden;
                }

                .label-barcode svg {
                    width: 34mm;
                    height: 6.5mm;
                    display: block;
                }

                .no-barcode {
                    font-size: 7px;
                    line-height: 1;
                    color: #333333;
                    text-align: center;
                }

                @media print {
                    html,
                    body {
                        width: 58mm;
                        margin: 0;
                        padding: 0;
                    }

                    .label-page {
                        width: 58mm;
                        height: 40mm;
                    }
                }
            </style>
        </head>

        <body>
            ${labels}
        </body>
        </html>
    `
}

function buildAcceptanceA4LabelsHtml(
    products: AcceptanceLabelProduct[]
): string {
    const labels = products
        .map(product => {
            const price = new Intl.NumberFormat('ru-RU', {
                maximumFractionDigits: 0,
            }).format(
                Math.round(product.sellingPrice)
            )

            const barcodeSvg =
                renderAcceptanceBarcodeSvg(
                    product.barcode
                )

            const unit =
                product.unit === 'weight'
                    ? 'за кг'
                    : 'за шт'

            return `
                <div class="label">
                    <div class="label-name">
                        ${escapeHtml(product.name)}
                    </div>

                    <div class="label-price">
                        ${price} ₽
                    </div>

                    <div class="label-unit">
                        ${unit}
                    </div>

                    <div class="label-barcode">
                        ${
                barcodeSvg
                    ? barcodeSvg
                    : '<div class="no-barcode">ШК нет</div>'
            }
                    </div>
                </div>
            `
        })
        .join('')

    return `
        <!doctype html>
        <html lang="ru">
        <head>
            <meta charset="utf-8" />

            <title>Ценники приёмки — А4</title>

            <style>
                @page {
                    size: A4 portrait;
                    margin: 8mm;
                }

                * {
                    box-sizing: border-box;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }

                html,
                body {
                    margin: 0;
                    padding: 0;

                    background: #ffffff;
                    color: #000000;

                    font-family: Arial, sans-serif;
                }

                .labels-grid {
                    display: grid;

                    grid-template-columns:
                        repeat(3, 58mm);

                    gap: 3mm;

                    justify-content: center;
                    align-content: start;
                }

                .label {
                    width: 58mm;
                    height: 40mm;

                    padding: 2mm 2.4mm 1.4mm;

                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;

                    overflow: hidden;

                    border: 1px solid #111827;

                    background: #ffffff;

                    break-inside: avoid;
                    page-break-inside: avoid;
                }

                .label-name {
                    min-height: 11.5mm;
                    max-height: 12.8mm;

                    overflow: hidden;

                    display: -webkit-box;
                    -webkit-box-orient: vertical;
                    -webkit-line-clamp: 2;

                    font-size: 14px;
                    line-height: 1.08;
                    font-weight: 900;

                    letter-spacing: -0.15px;

                    text-align: center;
                }

                .label-price {
                    font-size: 31px;
                    line-height: 0.95;

                    font-weight: 900;

                    letter-spacing: -0.8px;

                    text-align: center;

                    white-space: nowrap;
                }

                .label-unit {
                    margin-top: 0.5mm;

                    font-size: 12px;
                    line-height: 1;

                    font-weight: 800;

                    text-align: center;
                }

                .label-barcode {
                    width: 100%;
                    height: 6.8mm;

                    display: flex;
                    align-items: flex-end;
                    justify-content: center;

                    overflow: hidden;
                }

                .label-barcode svg {
                    width: 34mm;
                    height: 6.5mm;

                    display: block;
                }

                .no-barcode {
                    font-size: 7px;
                    color: #333333;
                    text-align: center;
                }

                @media print {
                    .labels-grid {
                        grid-template-columns:
                            repeat(3, 58mm);

                        gap: 3mm;
                    }
                }
            </style>
        </head>

        <body>
            <div class="labels-grid">
                ${labels}
            </div>
        </body>
        </html>
    `
}

function buildAcceptanceDocumentsHtml(
    data: AcceptancePrintData
) {
    const date = data.createdAt
        ? new Date(
            data.createdAt
        ).toLocaleDateString('ru-RU')
        : new Date().toLocaleDateString('ru-RU')

    const rows = data.rows.filter(
        row => row.action !== 'skip'
    )

    const purchaseTotal = rows.reduce(
        (sum, row) =>
            sum +
            toNumber(row.stock) *
            toNumber(row.purchasePrice),
        0
    )

    const sellingTotal = rows.reduce(
        (sum, row) =>
            sum +
            toNumber(row.stock) *
            toNumber(row.sellingPrice),
        0
    )

    const fullRowsHtml = rows
        .map((row, index) => {
            const qty = toNumber(row.stock)
            const purchasePrice =
                toNumber(row.purchasePrice)
            const sellingPrice =
                toNumber(row.sellingPrice)

            return `
                <tr>
                    <td>${index + 1}</td>

                    <td>
                        ${escapeHtml(
                row.name ||
                row.matchedProductName ||
                '-'
            )}
                    </td>

                    <td>
                        ${escapeHtml(
                row.barcode ||
                row.matchedProductBarcode ||
                '-'
            )}
                    </td>

                    <td>
                        ${escapeHtml(
                row.category || '-'
            )}
                    </td>

                    <td>${unitLabel(row.unit)}</td>

                    <td>${qty}</td>

                    <td>${money(purchasePrice)}</td>

                    <td>
                        ${money(
                qty * purchasePrice
            )}
                    </td>

                    <td>${money(sellingPrice)}</td>

                    <td>
                        ${money(
                qty * sellingPrice
            )}
                    </td>
                </tr>
            `
        })
        .join('')

    const sellerRowsHtml = rows
        .map((row, index) => {
            const qty = toNumber(row.stock)
            const sellingPrice =
                toNumber(row.sellingPrice)

            return `
                <tr>
                    <td>${index + 1}</td>

                    <td>
                        ${escapeHtml(
                row.name ||
                row.matchedProductName ||
                '-'
            )}
                    </td>

                    <td>
                        ${escapeHtml(
                row.barcode ||
                row.matchedProductBarcode ||
                '-'
            )}
                    </td>

                    <td>
                        ${escapeHtml(
                row.category || '-'
            )}
                    </td>

                    <td>${unitLabel(row.unit)}</td>

                    <td>${qty}</td>

                    <td>${money(sellingPrice)}</td>
                </tr>
            `
        })
        .join('')

    return `
        <!doctype html>

        <html lang="ru">
        <head>
            <meta charset="utf-8" />

            <title>
                Приёмка ${escapeHtml(data.number)}
            </title>

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

                    margin: 0 0 14px;
                }

                .doc-label {
                    text-align: center;

                    color: #6b7280;

                    font-size: 12px;

                    margin: -8px 0 14px;
                }

                .meta {
                    display: grid;

                    grid-template-columns: 1fr 1fr;

                    gap: 8px 24px;

                    margin-bottom: 16px;
                }

                .line {
                    border-bottom: 1px solid #111827;

                    min-height: 22px;

                    padding-top: 4px;
                }

                table {
                    width: 100%;

                    border-collapse: collapse;

                    margin-top: 10px;
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

                .total {
                    margin-top: 10px;

                    text-align: right;

                    font-size: 15px;

                    font-weight: 700;
                }

                .comment {
                    margin-top: 12px;
                }

                .signatures {
                    display: grid;

                    grid-template-columns: 1fr 1fr;

                    gap: 40px;

                    margin-top: 40px;
                }

                .signature-line {
                    border-top: 1px solid #111827;

                    padding-top: 6px;

                    text-align: center;
                }

                .page-break {
                    page-break-before: always;
                    break-before: page;
                }

                @media print {
                    body {
                        margin: 10mm;
                    }

                    .page-break {
                        page-break-before: always;
                        break-before: page;
                    }
                }
            </style>
        </head>

        <body>
            <section>
                <h1>
                    Акт приёмки товара №
                    ${escapeHtml(data.number)}
                </h1>

                <div class="doc-label">
                    Документ для администрации
                </div>

                <div class="meta">
                    <div>
                        <strong>Дата:</strong>

                        <div class="line">
                            ${date}
                        </div>
                    </div>

                    <div>
                        <strong>
                            Номер документа:
                        </strong>

                        <div class="line">
                            ${escapeHtml(data.number)}
                        </div>
                    </div>

                    <div>
                        <strong>
                            Поставщик:
                        </strong>

                        <div class="line">
                            ${escapeHtml(
        data.supplier || '-'
    )}
                        </div>
                    </div>

                    <div>
                        <strong>
                            Номер накладной:
                        </strong>

                        <div class="line">
                            ${escapeHtml(
        data.invoiceNumber ||
        '-'
    )}
                        </div>
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
                        ${fullRowsHtml}
                    </tbody>
                </table>

                <div class="total">
                    Итого закупка:
                    ${money(purchaseTotal)}
                </div>

                <div class="total">
                    Итого продажа:
                    ${money(sellingTotal)}
                </div>

                ${
        data.comment
            ? `
                            <div class="comment">
                                <strong>
                                    Комментарий:
                                </strong>

                                ${escapeHtml(
                data.comment
            )}
                            </div>
                        `
            : ''
    }

                <div class="signatures">
                    <div class="signature-line">
                        Принял
                    </div>

                    <div class="signature-line">
                        Проверил
                    </div>
                </div>
            </section>

            <section class="page-break">
                <h1>
                    Приёмка товара №
                    ${escapeHtml(data.number)}
                </h1>

                <div class="doc-label">
                    Документ для продавцов
                </div>

                <div class="meta">
                    <div>
                        <strong>Дата:</strong>

                        <div class="line">
                            ${date}
                        </div>
                    </div>

                    <div>
                        <strong>
                            Номер документа:
                        </strong>

                        <div class="line">
                            ${escapeHtml(data.number)}
                        </div>
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
                            <th>Цена продажи</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${sellerRowsHtml}
                    </tbody>
                </table>

                <div class="total">
                    Итого продажа:
                    ${money(sellingTotal)}
                </div>

                <div class="signatures">
                    <div class="signature-line">
                        Передал
                    </div>

                    <div class="signature-line">
                        Продавец
                    </div>
                </div>
            </section>
        </body>
        </html>
    `
}

function printHtml(html: string) {
    const iframe =
        document.createElement('iframe')

    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'

    document.body.appendChild(iframe)

    const iframeWindow =
        iframe.contentWindow

    const iframeDocument =
        iframe.contentDocument ||
        iframeWindow?.document

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
            if (
                document.body.contains(
                    iframe
                )
            ) {
                document.body.removeChild(
                    iframe
                )
            }
        }, 1000)
    }, 300)
}

function printAcceptanceDocuments(
    data: AcceptancePrintData
) {
    printHtml(
        buildAcceptanceDocumentsHtml(data)
    )
}

function createEmptyRow(
    rowNumber: number
): PreviewRow {
    return {
        acceptanceItemId: null,
        productId: null,

        rowId: `manual-${Date.now()}-${Math.random()
            .toString(16)
            .slice(2)}`,

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

function renumberRows(
    rows: PreviewRow[]
) {
    return rows.map(
        (row, index) => ({
            ...row,
            rowNumber: index + 1,
        })
    )
}

export default function Page() {
    const [history, setHistory] =
        useState<AcceptanceHistoryItem[]>([])

    const [historySearch, setHistorySearch] =
        useState('')

    const [supplier, setSupplier] =
        useState('')

    const [invoiceNumber, setInvoiceNumber] =
        useState('')

    const [comment, setComment] =
        useState('')

    const [
        isHistoryModalOpen,
        setIsHistoryModalOpen,
    ] = useState(false)

    const [
        isHistoryLoading,
        setIsHistoryLoading,
    ] = useState(false)

    const [
        isAcceptanceLoading,
        setIsAcceptanceLoading,
    ] = useState(false)

    const [error, setError] =
        useState<string | null>(null)

    const [
        selectedAcceptance,
        setSelectedAcceptance,
    ] =
        useState<AcceptanceDetail | null>(
            null
        )

    const [
        isAcceptanceModalOpen,
        setIsAcceptanceModalOpen,
    ] = useState(false)

    const [modalRows, setModalRows] =
        useState<PreviewRow[]>([])

    const [modalSupplier, setModalSupplier] =
        useState('')

    const [
        modalInvoiceNumber,
        setModalInvoiceNumber,
    ] = useState('')

    const [modalComment, setModalComment] =
        useState('')

    const [modalError, setModalError] =
        useState<string | null>(null)

    const [
        modalSuccess,
        setModalSuccess,
    ] = useState<string | null>(null)

    const [
        isModalSaving,
        setIsModalSaving,
    ] = useState(false)

    const [
        isPageDraftHydrated,
        setIsPageDraftHydrated,
    ] = useState(false)

    const [
        isModalDraftHydrated,
        setIsModalDraftHydrated,
    ] = useState(false)

    const [
        isPriceLabelsModalOpen,
        setIsPriceLabelsModalOpen,
    ] = useState(false)

    const [
        acceptanceLabelProducts,
        setAcceptanceLabelProducts,
    ] =
        useState<
            AcceptanceLabelProduct[]
        >([])

    const filteredHistory =
        useMemo(() => {
            const query =
                historySearch
                    .trim()
                    .toLowerCase()

            if (!query) {
                return history
            }

            return history.filter(
                item => {
                    const searchable = [
                        item.number,
                        item.sourceFileName || '',
                        item.supplier || '',
                        item.invoiceNumber || '',
                        item.comment || '',
                        formatDate(
                            item.createdAt
                        ),
                        item.status,
                    ]
                        .join(' ')
                        .toLowerCase()

                    return searchable.includes(
                        query
                    )
                }
            )
        }, [
            history,
            historySearch,
        ])

    const modalSummary =
        useMemo(() => {
            return {
                total:
                modalRows.length,

                update:
                modalRows.filter(
                    row =>
                        row.action ===
                        'update'
                ).length,

                create:
                modalRows.filter(
                    row =>
                        row.action ===
                        'create'
                ).length,

                skip:
                modalRows.filter(
                    row =>
                        row.action ===
                        'skip'
                ).length,

                error:
                modalRows.filter(
                    row =>
                        row.status ===
                        'error'
                ).length,

                totalPurchase:
                    modalRows.reduce(
                        (sum, row) => {
                            if (
                                row.action ===
                                'skip'
                            ) {
                                return sum
                            }

                            return (
                                sum +
                                toNumber(
                                    row.purchasePrice
                                ) *
                                toNumber(
                                    row.stock
                                )
                            )
                        },
                        0
                    ),

                totalSelling:
                    modalRows.reduce(
                        (sum, row) => {
                            if (
                                row.action ===
                                'skip'
                            ) {
                                return sum
                            }

                            return (
                                sum +
                                toNumber(
                                    row.sellingPrice
                                ) *
                                toNumber(
                                    row.stock
                                )
                            )
                        },
                        0
                    ),
            }
        }, [modalRows])

    const loadHistory = async () => {
        try {
            setIsHistoryLoading(true)

            const response =
                await fetch(
                    '/api/products/import/history',
                    {
                        method: 'GET',
                        cache: 'no-store',
                    }
                )

            if (!response.ok) {
                throw new Error(
                    'Не удалось загрузить историю'
                )
            }

            const data:
                AcceptanceHistoryItem[] =
                await response.json()

            setHistory(
                Array.isArray(data)
                    ? data
                    : []
            )
        } catch (error) {
            console.error(error)

            setError(
                error instanceof Error
                    ? error.message
                    : 'Не удалось загрузить историю приёмок'
            )
        } finally {
            setIsHistoryLoading(false)
        }
    }

    useEffect(() => {
        let isMounted = true

        const restoreDrafts =
            async () => {
                const [
                    draft,
                    modalDraft,
                ] =
                    await Promise.all([
                        readPersistentState<AcceptancePageDraftState>(
                            ACCEPTANCE_PAGE_DRAFT_KEY
                        ),

                        readPersistentState<AcceptanceModalDraftState>(
                            ACCEPTANCE_MODAL_DRAFT_KEY
                        ),
                    ])

                if (!isMounted) {
                    return
                }

                if (draft) {
                    setSupplier(
                        draft.supplier || ''
                    )

                    setInvoiceNumber(
                        draft.invoiceNumber ||
                        ''
                    )

                    setComment(
                        draft.comment || ''
                    )

                    setHistorySearch(
                        draft.historySearch ||
                        ''
                    )
                }

                if (
                    modalDraft?.isOpen &&
                    modalDraft.selectedAcceptance
                ) {
                    setSelectedAcceptance(
                        modalDraft.selectedAcceptance
                    )

                    setModalSupplier(
                        modalDraft.modalSupplier ||
                        ''
                    )

                    setModalInvoiceNumber(
                        modalDraft.modalInvoiceNumber ||
                        ''
                    )

                    setModalComment(
                        modalDraft.modalComment ||
                        ''
                    )

                    setModalRows(
                        Array.isArray(
                            modalDraft.modalRows
                        )
                            ? renumberRows(
                                modalDraft.modalRows
                            )
                            : []
                    )

                    setIsAcceptanceModalOpen(
                        true
                    )
                }

                setIsPageDraftHydrated(
                    true
                )

                setIsModalDraftHydrated(
                    true
                )
            }

        void restoreDrafts()
        void loadHistory()

        const handleHistoryUpdated =
            () => {
                void loadHistory()
            }

        window.addEventListener(
            'acceptance-history-updated',
            handleHistoryUpdated
        )

        return () => {
            isMounted = false

            window.removeEventListener(
                'acceptance-history-updated',
                handleHistoryUpdated
            )
        }
    }, [])

    useEffect(() => {
        if (
            !isPageDraftHydrated
        ) {
            return
        }

        writePersistentState<AcceptancePageDraftState>(
            ACCEPTANCE_PAGE_DRAFT_KEY,
            {
                supplier,
                invoiceNumber,
                comment,
                historySearch,
            }
        )
    }, [
        comment,
        historySearch,
        invoiceNumber,
        isPageDraftHydrated,
        supplier,
    ])

    useEffect(() => {
        if (
            !isModalDraftHydrated
        ) {
            return
        }

        writePersistentState<AcceptanceModalDraftState>(
            ACCEPTANCE_MODAL_DRAFT_KEY,
            {
                isOpen:
                isAcceptanceModalOpen,

                selectedAcceptance,

                modalRows,

                modalSupplier,

                modalInvoiceNumber,

                modalComment,
            }
        )
    }, [
        isAcceptanceModalOpen,
        isModalDraftHydrated,
        modalComment,
        modalInvoiceNumber,
        modalRows,
        modalSupplier,
        selectedAcceptance,
    ])

    useEffect(() => {
        const hasOpenModal =
            isHistoryModalOpen ||
            isAcceptanceModalOpen ||
            isPriceLabelsModalOpen

        if (!hasOpenModal) {
            return
        }

        const bodyOverflow =
            document.body.style.overflow

        const htmlOverflow =
            document.documentElement.style
                .overflow

        document.body.style.overflow =
            'hidden'

        document.documentElement.style.overflow =
            'hidden'

        return () => {
            document.body.style.overflow =
                bodyOverflow

            document.documentElement.style.overflow =
                htmlOverflow
        }
    }, [
        isAcceptanceModalOpen,
        isHistoryModalOpen,
        isPriceLabelsModalOpen,
    ])

    const openHistoryModal = () => {
        setIsHistoryModalOpen(true)
        setError(null)

        void loadHistory()
    }

    const openAcceptanceModal =
        async (id: number) => {
            const historyItem =
                history.find(
                    item =>
                        item.id === id
                )

            if (historyItem) {
                setSelectedAcceptance({
                    id: historyItem.id,

                    number:
                    historyItem.number,

                    sourceFileName:
                    historyItem.sourceFileName,

                    supplier:
                        historyItem.supplier ||
                        '',

                    invoiceNumber:
                        historyItem.invoiceNumber ||
                        '',

                    comment:
                        historyItem.comment ||
                        '',

                    totalRows:
                    historyItem.totalRows,

                    created:
                    historyItem.created,

                    updated:
                    historyItem.updated,

                    skipped:
                    historyItem.skipped,

                    errors: [],

                    status:
                    historyItem.status,

                    createdAt:
                    historyItem.createdAt,

                    updatedAt:
                    historyItem.updatedAt,

                    rows: [],
                })

                setModalSupplier(
                    historyItem.supplier ||
                    ''
                )

                setModalInvoiceNumber(
                    historyItem.invoiceNumber ||
                    ''
                )

                setModalComment(
                    historyItem.comment ||
                    ''
                )

                setModalRows([])
            }

            setIsHistoryModalOpen(
                false
            )

            setIsAcceptanceModalOpen(
                true
            )

            setIsAcceptanceLoading(
                true
            )

            setError(null)
            setModalError(null)
            setModalSuccess(null)

            try {
                const response =
                    await fetch(
                        `/api/products/import/history/${id}`,
                        {
                            method: 'GET',
                            cache: 'no-store',
                        }
                    )

                let data:
                    | AcceptanceDetail
                    | {
                    message?: string
                }
                    | null = null

                try {
                    data =
                        await response.json()
                } catch {
                    data = null
                }

                if (!response.ok) {
                    throw new Error(
                        data &&
                        'message' in data
                            ? data.message ||
                            'Не удалось открыть приёмку'
                            : `Ошибка API ${response.status}: ${response.statusText}`
                    )
                }

                const detail =
                    data as AcceptanceDetail

                setSelectedAcceptance(
                    detail
                )

                setModalSupplier(
                    detail.supplier || ''
                )

                setModalInvoiceNumber(
                    detail.invoiceNumber ||
                    ''
                )

                setModalComment(
                    detail.comment || ''
                )

                setModalRows(
                    renumberRows(
                        detail.rows || []
                    )
                )
            } catch (error) {
                console.error(error)

                setModalError(
                    error instanceof Error
                        ? error.message
                        : 'Не удалось открыть приёмку'
                )
            } finally {
                setIsAcceptanceLoading(
                    false
                )
            }
        }

    const closeAcceptanceModal =
        () => {
            clearPersistentState(
                ACCEPTANCE_MODAL_DRAFT_KEY
            )

            setIsAcceptanceModalOpen(
                false
            )

            setSelectedAcceptance(
                null
            )

            setModalRows([])

            setModalSupplier('')

            setModalInvoiceNumber('')

            setModalComment('')

            setModalError(null)

            setModalSuccess(null)
        }

    const updateModalRow = (
        rowId: string,
        field: keyof PreviewRow,
        value: PreviewRow[keyof PreviewRow]
    ) => {
        setModalRows(prev =>
            prev.map(row =>
                row.rowId === rowId
                    ? {
                        ...row,
                        [field]: value,
                    }
                    : row
            )
        )
    }

    const handleModalSuggestionChange =
        (
            rowId: string,
            productId: string
        ) => {
            setModalRows(prev =>
                prev.map(row => {
                    if (
                        row.rowId !== rowId
                    ) {
                        return row
                    }

                    const selected =
                        row.suggestions.find(
                            item =>
                                String(
                                    item.id
                                ) ===
                                productId
                        )

                    return {
                        ...row,

                        action:
                            selected
                                ? 'update'
                                : row.action,

                        productId:
                            selected?.id ??
                            row.productId ??
                            null,

                        matchedProductId:
                            selected?.id ??
                            null,

                        matchedProductName:
                            selected?.name ??
                            '',

                        matchedProductBarcode:
                            selected?.barcode ??
                            '',
                    }
                })
            )
        }

    const addModalRow = () => {
        setModalRows(prev => [
            ...prev,
            createEmptyRow(
                prev.length + 1
            ),
        ])
    }

    const deleteModalRow = (
        rowId: string
    ) => {
        setModalRows(prev =>
            renumberRows(
                prev.filter(
                    row =>
                        row.rowId !== rowId
                )
            )
        )
    }

    const applyModalMarkupToAll =
        () => {
            setModalRows(prev =>
                prev.map(row => ({
                    ...row,

                    sellingPrice:
                        calcSellingPrice(
                            row.purchasePrice
                        ),
                }))
            )
        }

    const saveAcceptanceModal =
        async () => {
            if (!selectedAcceptance) {
                setModalError(
                    'Приёмка не выбрана'
                )

                return
            }

            if (
                modalRows.length === 0
            ) {
                setModalError(
                    'В приёмке должна быть хотя бы одна строка'
                )

                return
            }

            try {
                setIsModalSaving(true)

                setModalError(null)
                setModalSuccess(null)

                const response =
                    await fetch(
                        `/api/products/import/history/${selectedAcceptance.id}`,
                        {
                            method: 'PUT',

                            headers: {
                                'Content-Type':
                                    'application/json',
                            },

                            body: JSON.stringify({
                                rows: renumberRows(
                                    modalRows
                                ),

                                sourceFileName:
                                    selectedAcceptance.sourceFileName ||
                                    '',

                                supplier:
                                modalSupplier,

                                invoiceNumber:
                                modalInvoiceNumber,

                                comment:
                                modalComment,
                            }),
                        }
                    )

                const data =
                    await response.json()

                if (!response.ok) {
                    throw new Error(
                        data.message ||
                        'Ошибка сохранения приёмки'
                    )
                }

                await loadHistory()

                const freshResponse =
                    await fetch(
                        `/api/products/import/history/${selectedAcceptance.id}`,
                        {
                            method: 'GET',
                            cache: 'no-store',
                        }
                    )

                const freshData:
                    | AcceptanceDetail
                    | {
                    message?: string
                } =
                    await freshResponse.json()

                if (
                    freshResponse.ok
                ) {
                    const freshDetail =
                        freshData as AcceptanceDetail

                    setSelectedAcceptance(
                        freshDetail
                    )

                    setModalSupplier(
                        freshDetail.supplier ||
                        ''
                    )

                    setModalInvoiceNumber(
                        freshDetail.invoiceNumber ||
                        ''
                    )

                    setModalComment(
                        freshDetail.comment ||
                        ''
                    )

                    setModalRows(
                        renumberRows(
                            freshDetail.rows ||
                            []
                        )
                    )
                }

                setModalSuccess(
                    'Изменения сохранены в БД'
                )
            } catch (error) {
                console.error(error)

                setModalError(
                    error instanceof Error
                        ? error.message
                        : 'Ошибка сохранения приёмки'
                )
            } finally {
                setIsModalSaving(false)
            }
        }

    const handlePrintCurrentAcceptance =
        () => {
            if (
                !selectedAcceptance
            ) {
                return
            }

            printAcceptanceDocuments({
                number:
                selectedAcceptance.number,

                supplier:
                modalSupplier,

                invoiceNumber:
                modalInvoiceNumber,

                comment:
                modalComment,

                createdAt:
                selectedAcceptance.createdAt,

                rows:
                modalRows,
            })
        }

    const handlePrintAcceptanceFromHistory =
        async (id: number) => {
            try {
                setIsAcceptanceLoading(
                    true
                )

                setError(null)

                const response =
                    await fetch(
                        `/api/products/import/history/${id}`,
                        {
                            method: 'GET',
                            cache: 'no-store',
                        }
                    )

                const data:
                    | AcceptanceDetail
                    | {
                    message?: string
                } =
                    await response.json()

                if (!response.ok) {
                    throw new Error(
                        'message' in data
                            ? data.message ||
                            'Не удалось открыть приёмку'
                            : 'Не удалось открыть приёмку'
                    )
                }

                const detail =
                    data as AcceptanceDetail

                printAcceptanceDocuments({
                    number:
                    detail.number,

                    supplier:
                        detail.supplier ||
                        '',

                    invoiceNumber:
                        detail.invoiceNumber ||
                        '',

                    comment:
                        detail.comment ||
                        '',

                    createdAt:
                    detail.createdAt,

                    rows:
                    detail.rows,
                })
            } catch (error) {
                console.error(error)

                setError(
                    error instanceof Error
                        ? error.message
                        : 'Не удалось распечатать приёмку'
                )
            } finally {
                setIsAcceptanceLoading(
                    false
                )
            }
        }

    const handleAcceptanceSaved =
        async (
            _result: {
                acceptanceId?: number
                acceptanceNumber?: string
                number?: string
            },
            rows: AcceptanceSavedRow[]
        ) => {
            await loadHistory()

            const labelProducts:
                AcceptanceLabelProduct[] =
                rows.map(item => ({
                    id:
                    item.product.id,

                    name:
                    item.product.name,

                    category:
                        item.category ||
                        item.product
                            .category ||
                        '',

                    barcode:
                        item.product
                            .barcode ||
                        '',

                    sellingPrice:
                        Math.round(
                            toNumber(
                                item.sellingPrice ||
                                item.product
                                    .sellingPrice
                            )
                        ),

                    unit:
                    item.product.unit,

                    quantity: 1,

                    selected: true,
                }))

            setAcceptanceLabelProducts(
                labelProducts
            )

            if (
                labelProducts.length >
                0
            ) {
                setIsPriceLabelsModalOpen(
                    true
                )
            }
        }

    const updateAcceptanceLabelQuantity =
        (
            productId: number,
            quantity: number
        ) => {
            setAcceptanceLabelProducts(
                prev =>
                    prev.map(product =>
                        product.id ===
                        productId
                            ? {
                                ...product,

                                quantity:
                                    Math.max(
                                        1,
                                        Math.floor(
                                            quantity ||
                                            1
                                        )
                                    ),
                            }
                            : product
                    )
            )
        }

    const toggleAcceptanceLabelProduct =
        (
            productId: number
        ) => {
            setAcceptanceLabelProducts(
                prev =>
                    prev.map(product =>
                        product.id ===
                        productId
                            ? {
                                ...product,

                                selected:
                                    !product.selected,
                            }
                            : product
                    )
            )
        }

    const getProductsForLabels = () => {
        const selectedProducts =
            acceptanceLabelProducts.filter(
                product =>
                    product.selected
            )

        return selectedProducts.flatMap(
            product => {
                const quantity =
                    Math.min(
                        999,
                        Math.max(
                            1,
                            Math.floor(
                                Number(
                                    product.quantity
                                ) || 1
                            )
                        )
                    )

                return Array.from(
                    {
                        length:
                        quantity,
                    },
                    () => product
                )
            }
        )
    }

    const printPriceLabelsHtml = (
        html: string
    ) => {
        const iframe =
            document.createElement(
                'iframe'
            )

        iframe.style.position =
            'fixed'

        iframe.style.right =
            '0'

        iframe.style.bottom =
            '0'

        iframe.style.width =
            '0'

        iframe.style.height =
            '0'

        iframe.style.border =
            '0'

        document.body.appendChild(
            iframe
        )

        const iframeWindow =
            iframe.contentWindow

        const iframeDocument =
            iframe.contentDocument ||
            iframeWindow?.document

        if (
            !iframeWindow ||
            !iframeDocument
        ) {
            document.body.removeChild(
                iframe
            )

            throw new Error(
                'Не удалось открыть окно печати'
            )
        }

        iframeDocument.open()
        iframeDocument.write(html)
        iframeDocument.close()

        iframeWindow.focus()

        setTimeout(() => {
            iframeWindow.print()

            setTimeout(() => {
                if (
                    document.body.contains(
                        iframe
                    )
                ) {
                    document.body.removeChild(
                        iframe
                    )
                }
            }, 1000)
        }, 300)
    }

    const handlePrintAcceptanceLabels =
        () => {
            setError(null)

            const productsForPrint =
                getProductsForLabels()

            if (
                productsForPrint.length ===
                0
            ) {
                setError(
                    'Выберите хотя бы один товар для печати ценников'
                )

                return
            }

            try {
                const html =
                    buildAcceptanceThermalLabelsHtml(
                        productsForPrint
                    )

                printPriceLabelsHtml(
                    html
                )

                setIsPriceLabelsModalOpen(
                    false
                )

                setAcceptanceLabelProducts(
                    []
                )
            } catch (error) {
                console.error(
                    'Ошибка печати ценников XPrinter:',
                    error
                )

                setError(
                    error instanceof Error
                        ? error.message
                        : 'Не удалось сформировать ценники'
                )
            }
        }

    const handlePrintAcceptanceLabelsA4 =
        () => {
            setError(null)

            const productsForPrint =
                getProductsForLabels()

            if (
                productsForPrint.length ===
                0
            ) {
                setError(
                    'Выберите хотя бы один товар для печати ценников'
                )

                return
            }

            try {
                const html =
                    buildAcceptanceA4LabelsHtml(
                        productsForPrint
                    )

                printPriceLabelsHtml(
                    html
                )

                setIsPriceLabelsModalOpen(
                    false
                )

                setAcceptanceLabelProducts(
                    []
                )
            } catch (error) {
                console.error(
                    'Ошибка печати ценников А4:',
                    error
                )

                setError(
                    error instanceof Error
                        ? error.message
                        : 'Не удалось сформировать ценники А4'
                )
            }
        }

    return (
        <System>
            <section className="relative min-h-screen w-full bg-gray-50 p-4">
                <div className="mx-auto max-w-[1700px] space-y-4">
                    <div className="rounded-2xl bg-white p-5 shadow-sm">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div>
                                <div className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                                    Ручная приёмка
                                </div>

                                <h1 className="mt-2 text-2xl font-bold text-gray-900">
                                    Приёмка товара
                                </h1>

                                <p className="mt-1 max-w-3xl text-sm text-gray-500">
                                    Ручная приёмка находится сразу под шапкой.
                                    Импорт из Excel убран, история доступна отдельной кнопкой.
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={
                                        openHistoryModal
                                    }
                                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                                >
                                    История приёмок ({history.length})
                                </button>

                                <button
                                    type="button"
                                    onClick={
                                        loadHistory
                                    }
                                    disabled={
                                        isHistoryLoading
                                    }
                                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
                                >
                                    {isHistoryLoading
                                        ? 'Обновляю...'
                                        : 'Обновить историю'}
                                </button>
                            </div>
                        </div>

                        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                            <div>
                                <label
                                    className={
                                        labelClass
                                    }
                                >
                                    Поставщик
                                </label>

                                <input
                                    type="text"
                                    value={
                                        supplier
                                    }
                                    onChange={e =>
                                        setSupplier(
                                            e.target
                                                .value
                                        )
                                    }
                                    placeholder="Например: ООО Поставщик"
                                    className={
                                        pageInputClass
                                    }
                                />
                            </div>

                            <div>
                                <label
                                    className={
                                        labelClass
                                    }
                                >
                                    Номер накладной
                                </label>

                                <input
                                    type="text"
                                    value={
                                        invoiceNumber
                                    }
                                    onChange={e =>
                                        setInvoiceNumber(
                                            e.target
                                                .value
                                        )
                                    }
                                    placeholder="№ документа"
                                    className={
                                        pageInputClass
                                    }
                                />
                            </div>

                            <div>
                                <label
                                    className={
                                        labelClass
                                    }
                                >
                                    Комментарий
                                </label>

                                <input
                                    type="text"
                                    value={
                                        comment
                                    }
                                    onChange={e =>
                                        setComment(
                                            e.target
                                                .value
                                        )
                                    }
                                    placeholder="Необязательно"
                                    className={
                                        pageInputClass
                                    }
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                                {error}
                            </div>
                        )}
                    </div>

                    <ProductMovementForm
                        mode="acceptance"
                        supplier={
                            supplier
                        }
                        invoiceNumber={
                            invoiceNumber
                        }
                        comment={
                            comment
                        }
                        onAcceptanceSaved={
                            handleAcceptanceSaved
                        }
                    />

                    <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                        Черновики ручной приёмки сохраняются в браузере автоматически.
                        История приёмок не занимает место на странице и открывается отдельной кнопкой.
                    </div>
                </div>

                {isHistoryModalOpen && (
                    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 px-3 py-4">
                        <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                            <div className="border-b border-gray-100 bg-gray-50 px-5 py-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900">
                                            История приёмок
                                        </h2>

                                        <p className="mt-1 text-sm text-gray-500">
                                            Откройте приёмку для просмотра, редактирования или печати двух документов.
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={
                                                loadHistory
                                            }
                                            disabled={
                                                isHistoryLoading
                                            }
                                            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
                                        >
                                            {isHistoryLoading
                                                ? 'Обновляю...'
                                                : 'Обновить'}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                setIsHistoryModalOpen(
                                                    false
                                                )
                                            }
                                            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100"
                                        >
                                            Закрыть
                                        </button>
                                    </div>
                                </div>

                                <input
                                    type="search"
                                    value={
                                        historySearch
                                    }
                                    onChange={e =>
                                        setHistorySearch(
                                            e.target
                                                .value
                                        )
                                    }
                                    placeholder="Поиск: номер, поставщик, накладная, файл"
                                    className="mt-4 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                                />
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto p-5">
                                {(isHistoryLoading ||
                                    isAcceptanceLoading) && (
                                    <div className="mb-3 text-sm text-gray-500">
                                        Загрузка...
                                    </div>
                                )}

                                {!isHistoryLoading &&
                                    filteredHistory.length ===
                                    0 && (
                                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-8 text-center text-sm text-gray-500">
                                            Приёмок пока нет
                                        </div>
                                    )}

                                <div className="space-y-2">
                                    {filteredHistory.map(
                                        item => (
                                            <div
                                                key={
                                                    item.id
                                                }
                                                role="button"
                                                tabIndex={
                                                    0
                                                }
                                                onClick={() =>
                                                    openAcceptanceModal(
                                                        item.id
                                                    )
                                                }
                                                onKeyDown={event => {
                                                    if (
                                                        event.key ===
                                                        'Enter' ||
                                                        event.key ===
                                                        ' '
                                                    ) {
                                                        event.preventDefault()

                                                        void openAcceptanceModal(
                                                            item.id
                                                        )
                                                    }
                                                }}
                                                className={`cursor-pointer rounded-xl border p-3 transition-colors hover:border-blue-200 hover:bg-blue-50 ${
                                                    selectedAcceptance?.id ===
                                                    item.id
                                                        ? 'border-blue-200 bg-blue-50'
                                                        : 'border-gray-100 bg-gray-50'
                                                }`}
                                            >
                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                    <div>
                                                        <div className="font-semibold text-blue-700">
                                                            {
                                                                item.number
                                                            }
                                                        </div>

                                                        <div className="mt-1 text-xs text-gray-500">
                                                            {formatDate(
                                                                item.createdAt
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={event => {
                                                                event.stopPropagation()

                                                                void openAcceptanceModal(
                                                                    item.id
                                                                )
                                                            }}
                                                            className="rounded-md bg-white px-3 py-1.5 text-xs text-green-700 hover:bg-green-100"
                                                        >
                                                            Открыть
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={event => {
                                                                event.stopPropagation()

                                                                void handlePrintAcceptanceFromHistory(
                                                                    item.id
                                                                )
                                                            }}
                                                            className="rounded-md bg-white px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-100"
                                                        >
                                                            Печать
                                                        </button>

                                                        <div
                                                            className={`rounded-full px-2 py-0.5 text-xs ${
                                                                item.status ===
                                                                'completed'
                                                                    ? 'bg-green-100 text-green-700'
                                                                    : 'bg-orange-100 text-orange-700'
                                                            }`}
                                                        >
                                                            {item.status ===
                                                            'completed'
                                                                ? 'Готово'
                                                                : 'С ошибками'}
                                                        </div>
                                                    </div>
                                                </div>

                                                {(item.supplier ||
                                                    item.invoiceNumber) && (
                                                    <div className="mt-2 truncate text-xs text-gray-500">
                                                        {item.supplier ||
                                                            'Поставщик не указан'}

                                                        {item.invoiceNumber
                                                            ? ` · накл. ${item.invoiceNumber}`
                                                            : ''}
                                                    </div>
                                                )}

                                                {item.sourceFileName && (
                                                    <div className="mt-1 truncate text-xs text-gray-500">
                                                        Файл:{' '}
                                                        {
                                                            item.sourceFileName
                                                        }
                                                    </div>
                                                )}

                                                <div className="mt-3 grid grid-cols-5 gap-1 text-center text-xs">
                                                    <div className="rounded bg-white p-1">
                                                        <div className="text-gray-400">
                                                            стр.
                                                        </div>

                                                        <div className="font-bold">
                                                            {
                                                                item.totalRows
                                                            }
                                                        </div>
                                                    </div>

                                                    <div className="rounded bg-green-50 p-1 text-green-700">
                                                        <div>
                                                            созд.
                                                        </div>

                                                        <div className="font-bold">
                                                            {
                                                                item.created
                                                            }
                                                        </div>
                                                    </div>

                                                    <div className="rounded bg-blue-50 p-1 text-blue-700">
                                                        <div>
                                                            обн.
                                                        </div>

                                                        <div className="font-bold">
                                                            {
                                                                item.updated
                                                            }
                                                        </div>
                                                    </div>

                                                    <div className="rounded bg-orange-50 p-1 text-orange-700">
                                                        <div>
                                                            проп.
                                                        </div>

                                                        <div className="font-bold">
                                                            {
                                                                item.skipped
                                                            }
                                                        </div>
                                                    </div>

                                                    <div className="rounded bg-red-50 p-1 text-red-700">
                                                        <div>
                                                            ош.
                                                        </div>

                                                        <div className="font-bold">
                                                            {
                                                                item.errors
                                                            }
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {isAcceptanceModalOpen &&
                    selectedAcceptance && (
                        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 px-3 py-4">
                            <div className="flex max-h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                                <div className="border-b border-gray-100 bg-gray-50 px-5 py-4">
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                        <div>
                                            <div className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                                                Приёмка{' '}
                                                {
                                                    selectedAcceptance.number
                                                }
                                            </div>

                                            <h2 className="mt-2 text-xl font-bold text-gray-900">
                                                Просмотр и редактирование позиций
                                            </h2>

                                            <p className="mt-1 text-xs text-gray-500">
                                                Измените шапку или позиции и нажмите “Сохранить в БД”.
                                                Остатки и цены будут пересчитаны через API приёмок.
                                            </p>

                                            {isAcceptanceLoading && (
                                                <div className="mt-2 text-xs font-medium text-blue-700">
                                                    Загружаю позиции приёмки...
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={
                                                    handlePrintCurrentAcceptance
                                                }
                                                className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-sm text-purple-700 transition-colors hover:bg-purple-100"
                                            >
                                                Печать 2 документов
                                            </button>

                                            <button
                                                type="button"
                                                onClick={
                                                    saveAcceptanceModal
                                                }
                                                disabled={
                                                    isModalSaving ||
                                                    isAcceptanceLoading
                                                }
                                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                {isModalSaving && (
                                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                                                )}

                                                {isModalSaving
                                                    ? 'Сохранение...'
                                                    : 'Сохранить в БД'}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={
                                                    closeAcceptanceModal
                                                }
                                                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100"
                                            >
                                                Закрыть
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                                        <div>
                                            <label
                                                className={
                                                    labelClass
                                                }
                                            >
                                                Поставщик
                                            </label>

                                            <input
                                                type="text"
                                                value={
                                                    modalSupplier
                                                }
                                                onChange={e =>
                                                    setModalSupplier(
                                                        e.target
                                                            .value
                                                    )
                                                }
                                                className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                                            />
                                        </div>

                                        <div>
                                            <label
                                                className={
                                                    labelClass
                                                }
                                            >
                                                Номер накладной
                                            </label>

                                            <input
                                                type="text"
                                                value={
                                                    modalInvoiceNumber
                                                }
                                                onChange={e =>
                                                    setModalInvoiceNumber(
                                                        e.target
                                                            .value
                                                    )
                                                }
                                                className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                                            />
                                        </div>

                                        <div>
                                            <label
                                                className={
                                                    labelClass
                                                }
                                            >
                                                Комментарий
                                            </label>

                                            <input
                                                type="text"
                                                value={
                                                    modalComment
                                                }
                                                onChange={e =>
                                                    setModalComment(
                                                        e.target
                                                            .value
                                                    )
                                                }
                                                className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                                            />
                                        </div>
                                    </div>

                                    <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
                                        <div className="rounded-xl bg-white p-3 text-sm shadow-sm">
                                            <div className="text-xs text-gray-500">
                                                Строк
                                            </div>

                                            <div className="text-lg font-bold">
                                                {
                                                    modalSummary.total
                                                }
                                            </div>
                                        </div>

                                        <div className="rounded-xl bg-white p-3 text-sm shadow-sm">
                                            <div className="text-xs text-gray-500">
                                                Обновить
                                            </div>

                                            <div className="text-lg font-bold text-green-700">
                                                {
                                                    modalSummary.update
                                                }
                                            </div>
                                        </div>

                                        <div className="rounded-xl bg-white p-3 text-sm shadow-sm">
                                            <div className="text-xs text-gray-500">
                                                Создать
                                            </div>

                                            <div className="text-lg font-bold text-blue-700">
                                                {
                                                    modalSummary.create
                                                }
                                            </div>
                                        </div>

                                        <div className="rounded-xl bg-white p-3 text-sm shadow-sm">
                                            <div className="text-xs text-gray-500">
                                                Пропуск
                                            </div>

                                            <div className="text-lg font-bold text-gray-700">
                                                {
                                                    modalSummary.skip
                                                }
                                            </div>
                                        </div>

                                        <div className="rounded-xl bg-white p-3 text-sm shadow-sm">
                                            <div className="text-xs text-gray-500">
                                                Ошибки
                                            </div>

                                            <div className="text-lg font-bold text-red-700">
                                                {
                                                    modalSummary.error
                                                }
                                            </div>
                                        </div>

                                        <div className="rounded-xl bg-white p-3 text-sm shadow-sm">
                                            <div className="text-xs text-gray-500">
                                                Закупка
                                            </div>

                                            <div className="text-lg font-bold">
                                                {Math.round(
                                                    modalSummary.totalPurchase
                                                )}
                                            </div>
                                        </div>

                                        <div className="rounded-xl bg-white p-3 text-sm shadow-sm">
                                            <div className="text-xs text-gray-500">
                                                Продажа
                                            </div>

                                            <div className="text-lg font-bold">
                                                {Math.round(
                                                    modalSummary.totalSelling
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 rounded-xl bg-white p-3 text-sm shadow-sm">
                                            <button
                                                type="button"
                                                onClick={
                                                    addModalRow
                                                }
                                                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                                            >
                                                Добавить
                                            </button>

                                            <button
                                                type="button"
                                                onClick={
                                                    applyModalMarkupToAll
                                                }
                                                className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-100"
                                            >
                                                +30%
                                            </button>
                                        </div>
                                    </div>

                                    {modalError && (
                                        <div className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                                            {
                                                modalError
                                            }
                                        </div>
                                    )}

                                    {modalSuccess && (
                                        <div className="mt-3 rounded-xl border border-green-100 bg-green-50 p-3 text-sm text-green-700">
                                            {
                                                modalSuccess
                                            }
                                        </div>
                                    )}
                                </div>

                                <div className="min-h-0 flex-1 overflow-auto">
                                    <table className="w-full min-w-[1320px] text-xs">
                                        <thead className="sticky top-0 z-10 bg-gray-100 text-gray-600 shadow-sm">
                                        <tr>
                                            <th className="w-12 p-2 text-left">
                                                №
                                            </th>

                                            <th className="w-24 p-2 text-left">
                                                Статус
                                            </th>

                                            <th className="w-36 p-2 text-left">
                                                Действие
                                            </th>

                                            <th className="w-66 p-2 text-left">
                                                Товар из БД
                                            </th>

                                            <th className="w-72 p-2 text-left">
                                                Название
                                            </th>

                                            <th className="w-36 p-2 text-left">
                                                Категория
                                            </th>

                                            <th className="w-36 p-2 text-left">
                                                Штрихкод
                                            </th>

                                            <th className="w-24 p-2 text-left">
                                                Закупка
                                            </th>

                                            <th className="w-32 p-2 text-left">
                                                Продажа
                                            </th>

                                            <th className="w-20 p-2 text-left">
                                                Кол.
                                            </th>

                                            <th className="w-20 p-2 text-left">
                                                Ед.
                                            </th>

                                            <th className="w-20 p-2 text-left">
                                                Мин.
                                            </th>

                                            <th className="w-20 p-2 text-left" />
                                        </tr>
                                        </thead>

                                        <tbody>
                                        {modalRows.length ===
                                            0 && (
                                                <tr>
                                                    <td
                                                        colSpan={
                                                            13
                                                        }
                                                        className="p-8 text-center text-sm text-gray-500"
                                                    >
                                                        {isAcceptanceLoading
                                                            ? 'Загрузка позиций...'
                                                            : 'Позиции не найдены'}
                                                    </td>
                                                </tr>
                                            )}

                                        {modalRows.map(
                                            row => (
                                                <tr
                                                    key={
                                                        row.rowId
                                                    }
                                                    className="border-t border-gray-100 align-top hover:bg-gray-50"
                                                >
                                                    <td className="p-2 font-medium">
                                                        {
                                                            row.rowNumber
                                                        }
                                                    </td>

                                                    <td className="p-2">
                                                        <div
                                                            className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${getStatusClass(
                                                                row.status
                                                            )}`}
                                                        >
                                                            {getStatusLabel(
                                                                row.status
                                                            )}
                                                        </div>

                                                        {row.error && (
                                                            <div className="mt-1 max-w-[140px] text-[11px] text-red-600">
                                                                {
                                                                    row.error
                                                                }
                                                            </div>
                                                        )}
                                                    </td>

                                                    <td className="p-2">
                                                        <select
                                                            value={
                                                                row.action
                                                            }
                                                            onChange={e =>
                                                                updateModalRow(
                                                                    row.rowId,
                                                                    'action',
                                                                    e
                                                                        .target
                                                                        .value as ImportAction
                                                                )
                                                            }
                                                            className={
                                                                selectClass
                                                            }
                                                        >
                                                            {ACTION_OPTIONS.map(
                                                                option => (
                                                                    <option
                                                                        key={
                                                                            option.value
                                                                        }
                                                                        value={
                                                                            option.value
                                                                        }
                                                                    >
                                                                        {
                                                                            option.label
                                                                        }
                                                                    </option>
                                                                )
                                                            )}
                                                        </select>
                                                    </td>

                                                    <td className="p-2">
                                                        <select
                                                            value={
                                                                row.matchedProductId ??
                                                                ''
                                                            }
                                                            onChange={e =>
                                                                handleModalSuggestionChange(
                                                                    row.rowId,
                                                                    e
                                                                        .target
                                                                        .value
                                                                )
                                                            }
                                                            disabled={
                                                                row.action !==
                                                                'update' ||
                                                                row
                                                                    .suggestions
                                                                    .length ===
                                                                0
                                                            }
                                                            className={`${selectClass} disabled:bg-gray-100`}
                                                        >
                                                            <option value="">
                                                                Выберите товар
                                                            </option>

                                                            {row.suggestions.map(
                                                                suggestion => (
                                                                    <option
                                                                        key={
                                                                            suggestion.id
                                                                        }
                                                                        value={
                                                                            suggestion.id
                                                                        }
                                                                    >
                                                                        {
                                                                            suggestion.name
                                                                        }{' '}
                                                                        · ост.{' '}
                                                                        {
                                                                            suggestion.stock
                                                                        }
                                                                    </option>
                                                                )
                                                            )}
                                                        </select>

                                                        {row.matchedProductName && (
                                                            <div className="mt-1 max-w-[270px] truncate text-[11px] text-gray-400">
                                                                {
                                                                    row.matchedProductName
                                                                }
                                                            </div>
                                                        )}
                                                    </td>

                                                    <td className="p-2">
                                                        <input
                                                            type="text"
                                                            value={
                                                                row.name
                                                            }
                                                            onChange={e =>
                                                                updateModalRow(
                                                                    row.rowId,
                                                                    'name',
                                                                    e
                                                                        .target
                                                                        .value
                                                                )
                                                            }
                                                            className={
                                                                inputClass
                                                            }
                                                        />
                                                    </td>

                                                    <td className="p-2">
                                                        <input
                                                            type="text"
                                                            value={
                                                                row.category
                                                            }
                                                            onChange={e =>
                                                                updateModalRow(
                                                                    row.rowId,
                                                                    'category',
                                                                    e
                                                                        .target
                                                                        .value
                                                                )
                                                            }
                                                            className={
                                                                inputClass
                                                            }
                                                        />
                                                    </td>

                                                    <td className="p-2">
                                                        <input
                                                            type="text"
                                                            value={
                                                                row.barcode
                                                            }
                                                            onChange={e =>
                                                                updateModalRow(
                                                                    row.rowId,
                                                                    'barcode',
                                                                    e
                                                                        .target
                                                                        .value
                                                                )
                                                            }
                                                            className={
                                                                inputClass
                                                            }
                                                        />
                                                    </td>

                                                    <td className="p-2">
                                                        <input
                                                            type="number"
                                                            value={
                                                                row.purchasePrice
                                                            }
                                                            onChange={e =>
                                                                updateModalRow(
                                                                    row.rowId,
                                                                    'purchasePrice',
                                                                    e
                                                                        .target
                                                                        .value
                                                                )
                                                            }
                                                            className={
                                                                inputClass
                                                            }
                                                        />
                                                    </td>

                                                    <td className="p-2">
                                                        <div className="flex gap-1">
                                                            <input
                                                                type="text"
                                                                inputMode="numeric"
                                                                value={
                                                                    row.sellingPrice
                                                                }
                                                                onChange={e =>
                                                                    updateModalRow(
                                                                        row.rowId,
                                                                        'sellingPrice',
                                                                        e
                                                                            .target
                                                                            .value
                                                                    )
                                                                }
                                                                className={
                                                                    inputClass
                                                                }
                                                            />

                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    updateModalRow(
                                                                        row.rowId,
                                                                        'sellingPrice',
                                                                        calcSellingPrice(
                                                                            row.purchasePrice
                                                                        )
                                                                    )
                                                                }
                                                                className="h-8 shrink-0 rounded-md border border-blue-200 bg-blue-50 px-2 text-[11px] text-blue-700 hover:bg-blue-100"
                                                            >
                                                                +30%
                                                            </button>
                                                        </div>
                                                    </td>

                                                    <td className="p-2">
                                                        <input
                                                            type="number"
                                                            value={
                                                                row.stock
                                                            }
                                                            onChange={e =>
                                                                updateModalRow(
                                                                    row.rowId,
                                                                    'stock',
                                                                    e
                                                                        .target
                                                                        .value
                                                                )
                                                            }
                                                            className={
                                                                inputClass
                                                            }
                                                        />
                                                    </td>

                                                    <td className="p-2">
                                                        <select
                                                            value={
                                                                row.unit
                                                            }
                                                            onChange={e =>
                                                                updateModalRow(
                                                                    row.rowId,
                                                                    'unit',
                                                                    e
                                                                        .target
                                                                        .value as ProductUnit
                                                                )
                                                            }
                                                            className={
                                                                selectClass
                                                            }
                                                        >
                                                            <option value="piece">
                                                                шт.
                                                            </option>

                                                            <option value="weight">
                                                                кг
                                                            </option>
                                                        </select>
                                                    </td>

                                                    <td className="p-2">
                                                        <input
                                                            type="number"
                                                            value={
                                                                row.minStock
                                                            }
                                                            onChange={e =>
                                                                updateModalRow(
                                                                    row.rowId,
                                                                    'minStock',
                                                                    e
                                                                        .target
                                                                        .value
                                                                )
                                                            }
                                                            className={
                                                                inputClass
                                                            }
                                                        />
                                                    </td>

                                                    <td className="p-2">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                deleteModalRow(
                                                                    row.rowId
                                                                )
                                                            }
                                                            className="rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700 hover:bg-red-100"
                                                        >
                                                            Удалить
                                                        </button>
                                                    </td>
                                                </tr>
                                            )
                                        )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                {isPriceLabelsModalOpen && (
                    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 px-3 py-4">
                        <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                            <div className="border-b border-gray-100 px-6 py-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <div className="inline-flex rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
                                            Приёмка завершена
                                        </div>

                                        <h2 className="mt-2 text-xl font-bold text-gray-900">
                                            Напечатать новые ценники?
                                        </h2>

                                        <p className="mt-1 text-sm text-gray-500">
                                            Выберите товары, количество ценников и способ печати.
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsPriceLabelsModalOpen(
                                                false
                                            )

                                            setAcceptanceLabelProducts(
                                                []
                                            )
                                        }}
                                        className="text-2xl text-gray-400 hover:text-gray-600"
                                    >
                                        ×
                                    </button>
                                </div>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto p-5">
                                <div className="overflow-hidden rounded-xl border border-gray-200">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 text-gray-500">
                                        <tr>
                                            <th className="w-14 p-3" />

                                            <th className="p-3 text-left">
                                                Товар
                                            </th>

                                            <th className="p-3 text-left">
                                                Штрихкод
                                            </th>

                                            <th className="p-3 text-right">
                                                Цена
                                            </th>

                                            <th className="w-32 p-3 text-center">
                                                Ценников
                                            </th>
                                        </tr>
                                        </thead>

                                        <tbody>
                                        {acceptanceLabelProducts.map(
                                            product => (
                                                <tr
                                                    key={
                                                        product.id
                                                    }
                                                    className="border-t border-gray-100"
                                                >
                                                    <td className="p-3 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={
                                                                product.selected
                                                            }
                                                            onChange={() =>
                                                                toggleAcceptanceLabelProduct(
                                                                    product.id
                                                                )
                                                            }
                                                            className="h-4 w-4"
                                                        />
                                                    </td>

                                                    <td className="p-3">
                                                        <div className="font-semibold text-gray-800">
                                                            {
                                                                product.name
                                                            }
                                                        </div>

                                                        <div className="mt-0.5 text-xs text-gray-400">
                                                            {product.category ||
                                                                'Без категории'}

                                                            {' · '}

                                                            {product.unit ===
                                                            'weight'
                                                                ? 'за кг'
                                                                : 'за шт'}
                                                        </div>
                                                    </td>

                                                    <td className="p-3 font-mono text-xs text-gray-500">
                                                        {product.barcode ||
                                                            '—'}
                                                    </td>

                                                    <td className="p-3 text-right text-lg font-bold text-purple-700">
                                                        {
                                                            product.sellingPrice
                                                        }{' '}
                                                        ₽
                                                    </td>

                                                    <td className="p-3">
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max="999"
                                                            step="1"
                                                            value={
                                                                product.quantity
                                                            }
                                                            disabled={
                                                                !product.selected
                                                            }
                                                            onChange={event =>
                                                                updateAcceptanceLabelQuantity(
                                                                    product.id,
                                                                    Number(
                                                                        event
                                                                            .target
                                                                            .value
                                                                    )
                                                                )
                                                            }
                                                            className="h-9 w-full rounded-lg border border-gray-300 px-2 text-center disabled:bg-gray-100"
                                                        />
                                                    </td>
                                                </tr>
                                            )
                                        )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 border-t border-gray-100 bg-gray-50 p-5">
                                <div className="text-sm text-gray-500">
                                    Выбрано товаров:{' '}

                                    <span className="font-bold text-gray-800">
                                        {
                                            acceptanceLabelProducts.filter(
                                                item =>
                                                    item.selected
                                            ).length
                                        }
                                    </span>

                                    {' · '}

                                    Ценников:{' '}

                                    <span className="font-bold text-gray-800">
                                        {acceptanceLabelProducts.reduce(
                                            (
                                                sum,
                                                item
                                            ) =>
                                                item.selected
                                                    ? sum +
                                                    item.quantity
                                                    : sum,
                                            0
                                        )}
                                    </span>
                                </div>

                                <div className="flex flex-wrap justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsPriceLabelsModalOpen(
                                                false
                                            )

                                            setAcceptanceLabelProducts(
                                                []
                                            )
                                        }}
                                        className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
                                    >
                                        Не печатать
                                    </button>

                                    <button
                                        type="button"
                                        onClick={
                                            handlePrintAcceptanceLabelsA4
                                        }
                                        disabled={
                                            !acceptanceLabelProducts.some(
                                                item =>
                                                    item.selected
                                            )
                                        }
                                        className="rounded-lg border border-blue-200 bg-blue-50 px-5 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Печать на А4
                                    </button>

                                    <button
                                        type="button"
                                        onClick={
                                            handlePrintAcceptanceLabels
                                        }
                                        disabled={
                                            !acceptanceLabelProducts.some(
                                                item =>
                                                    item.selected
                                            )
                                        }
                                        className="rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Печать на XPrinter
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
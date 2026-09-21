'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
    AiOutlineClose,
    AiOutlineDollarCircle,
    AiOutlineFileText,
    AiOutlinePlus,
    AiOutlinePrinter,
    AiOutlineSearch,
    AiOutlineTeam,
    AiOutlineUndo,
} from 'react-icons/ai'

import {
    usePosCheckoutStore,
    type StoredCheckoutItem,
} from '@/app/online-kassa/pos-checkout-store'

type DebtPaymentMethod = 'cash' | 'card' | 'transfer'
type DebtStatus = 'active' | 'partially_paid' | 'closed' | 'cancelled'

type DebtCustomer = {
    id: number
    firstName: string
    lastName: string
    middleName: string
    fullName: string
    phone: string
    address: string
    creditLimit: number
    currentDebt: number
    availableCredit: number
    overdueDebt?: number
    hasOverdueDebt?: boolean
    nearestDueDate?: string | null
    openWithoutDueDateDebt?: number
    isActive: boolean
    comment: string
    createdAt?: string
    updatedAt?: string
}

type DebtSaleItem = {
    id: number
    productId: number
    name: string
    barcode?: string | null
    category?: string | null
    unit: 'piece' | 'weight'
    quantity: number
    returnedQuantity: number
    availableToReturn: number
    purchasePrice: number
    sellingPrice: number
    total: number
    marked?: boolean
    markingCode?: string | null
    markingStatus?: string | null
    markingMessage?: string | null
    markingPackageMode?: string | null
    markingPackageQuantity?: number | null
}

type DebtSale = {
    id: number
    debtNumber: string
    status: DebtStatus
    total: number
    returnedTotal: number
    paidTotal: number
    refundedTotal?: number
    remainingAmount: number
    dueDate?: string | null
    isOverdue?: boolean
    daysOverdue?: number
    daysUntilDue?: number | null
    comment: string
    cashierName?: string | null
    cashierLogin?: string | null
    createdAt: string
    locationId?: number
    locationName?: string
    locationSlug?: string
    items: DebtSaleItem[]
}

type DebtPayment = {
    id: number
    paymentNumber: string
    paymentMethod: DebtPaymentMethod
    amount: number
    comment: string
    cashierName?: string | null
    cashierLogin?: string | null
    createdAt: string
    locationId?: number
    locationName?: string
    locationSlug?: string
    allocations?: Array<{
        debtSaleId: number
        debtNumber: string
        amount: number
    }>
}

type DebtReturn = {
    id: number
    returnNumber: string
    debtSaleId: number
    debtNumber: string
    total: number
    comment: string
    cashierName?: string | null
    cashierLogin?: string | null
    createdAt: string
    locationId?: number
    locationName?: string
    locationSlug?: string
    items?: Array<{
        id: number
        debtSaleItemId: number
        productId: number
        productName: string
        unit: 'piece' | 'weight'
        quantity: number
        sellingPrice: number
        total: number
    }>
}


type DebtRefund = {
    id: number
    refundNumber: string
    debtReturnId: number
    returnNumber: string
    debtSaleId: number
    debtNumber: string
    paymentMethod: DebtPaymentMethod
    amount: number
    reason: string
    cashierName?: string | null
    cashierLogin?: string | null
    createdAt: string
    locationId?: number
    locationName?: string
    locationSlug?: string
}

type DebtEvent = {
    id: number
    eventType: string
    debtSaleId?: number | null
    debtNumber?: string | null
    paymentId?: number | null
    paymentNumber?: string | null
    returnId?: number | null
    returnNumber?: string | null
    refundId?: number | null
    refundNumber?: string | null
    amount?: number | null
    payload?: Record<string, unknown>
    createdBy?: string | null
    createdByName?: string | null
    createdAt: string
    locationName?: string | null
    locationSlug?: string | null
}

type DebtCustomerDetail = {
    customer: DebtCustomer
    sales: DebtSale[]
    payments: DebtPayment[]
    returns: DebtReturn[]
    refunds: DebtRefund[]
    events: DebtEvent[]
}

type DebtSaleCreateResponse = {
    ok: boolean
    debtSale: {
        id: number
        debtNumber: string
        status: DebtStatus
        total: number
        returnedTotal: number
        paidTotal: number
        refundedTotal?: number
        remainingAmount: number
        dueDate: string
        comment: string
        createdAt: string
        location: {
            id: number
            name: string
            slug: string
        }
        cashier: {
            name: string
            login: string
        }
        items: Array<{
            id: number
            productId: number
            name: string
            barcode?: string
            category?: string
            unit: 'piece' | 'weight'
            quantity: number
            purchasePrice: number
            sellingPrice: number
            total: number
            marked?: boolean
            markingCode?: string | null
            markingStatus?: string | null
            markingPackageMode?: string | null
            previousStock?: number
            newStock?: number
        }>
    }
    customer: {
        id: number
        firstName: string
        lastName: string
        middleName: string
        fullName: string
        phone: string
        address: string
        creditLimit: number
        previousDebt: number
        currentDebt: number
        availableCredit: number
    }
}

type ApiError = {
    message?: string
}

type ExtendedStoredCheckoutItem = StoredCheckoutItem & {
    markingPackageMode?: 'single' | 'block'
    markingPackageQuantity?: number
}

type NewCustomerForm = {
    firstName: string
    lastName: string
    middleName: string
    phone: string
    address: string
    creditLimit: string
    comment: string
}

type DebtReturnQuantityMap = Record<string, string>

const AUTH_LOCATION_NAME_KEY = 'warehouse_location_name'

const EMPTY_CUSTOMER_FORM: NewCustomerForm = {
    firstName: '',
    lastName: '',
    middleName: '',
    phone: '',
    address: '',
    creditLimit: '',
    comment: '',
}

function readStorageValue(key: string): string {
    if (typeof window === 'undefined') {
        return ''
    }

    return String(
        sessionStorage.getItem(key) ||
        localStorage.getItem(key) ||
        ''
    ).trim()
}

function getLocationName(): string {
    return readStorageValue(AUTH_LOCATION_NAME_KEY) || 'ТОЧКА'
}

function toNumber(value: unknown): number {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0
    }

    const parsed = Number(
        String(value ?? '')
            .replace(',', '.')
            .replace(/\s/g, '')
    )

    return Number.isFinite(parsed) ? parsed : 0
}

function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100
}

function getStoredProductPrice(item: StoredCheckoutItem): number {
    return toNumber(
        item.product.sellingPrice ??
        item.product.selling_price
    )
}

function normalizeBooleanFlag(value: unknown): boolean {
    if (typeof value === 'boolean') {
        return value
    }

    if (typeof value === 'number') {
        return value === 1
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()

        return [
            '1',
            'true',
            'yes',
            'y',
            'да',
            'маркированный',
            'marked',
        ].includes(normalized)
    }

    return false
}

function isStoredMarkedProduct(item: StoredCheckoutItem): boolean {
    const product = item.product

    return normalizeBooleanFlag(
        product.marked ??
        product.isMarked ??
        product.is_marked ??
        product.marking ??
        product.markedProduct
    )
}

function formatMoney(value: unknown): string {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(toNumber(value))
}

function formatQuantity(value: unknown, unit?: string): string {
    const quantity = toNumber(value)

    if (unit === 'weight') {
        return `${quantity.toFixed(3).replace(/\.?0+$/, '')} кг`
    }

    return `${quantity} шт.`
}

function formatDate(value: string | undefined | null): string {
    if (!value) {
        return '—'
    }

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
        return value
    }

    return date.toLocaleString('ru-RU')
}


function formatDateOnly(
    value: string | undefined | null
): string {
    if (!value) {
        return 'Срок не указан'
    }

    const raw =
        String(value)
            .slice(0, 10)

    const match =
        raw.match(
            /^(\d{4})-(\d{2})-(\d{2})$/
        )

    if (!match) {
        return raw
    }

    return `${match[3]}.${match[2]}.${match[1]}`
}

function dateInputValueFromDays(
    days: number
): string {
    const date =
        new Date()

    date.setDate(
        date.getDate() + days
    )

    const month =
        String(
            date.getMonth() + 1
        ).padStart(
            2,
            '0'
        )

    const day =
        String(
            date.getDate()
        ).padStart(
            2,
            '0'
        )

    return `${date.getFullYear()}-${month}-${day}`
}

const DEFAULT_DEBT_TERM_DAYS =
    14

function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
}

function getPaymentMethodLabel(method: DebtPaymentMethod): string {
    if (method === 'cash') {
        return 'Наличные'
    }

    if (method === 'card') {
        return 'Карта'
    }

    return 'Перевод'
}

function getDebtStatusLabel(status: DebtStatus): string {
    if (status === 'closed') {
        return 'Закрыт'
    }

    if (status === 'partially_paid') {
        return 'Частично погашен'
    }

    if (status === 'cancelled') {
        return 'Отменён'
    }

    return 'Активен'
}

function getDebtStatusClassName(status: DebtStatus): string {
    if (status === 'closed') {
        return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    }

    if (status === 'partially_paid') {
        return 'bg-amber-100 text-amber-800 border-amber-200'
    }

    if (status === 'cancelled') {
        return 'bg-gray-100 text-gray-600 border-gray-200'
    }

    return 'bg-red-100 text-red-700 border-red-200'
}

async function readJsonSafe<T>(response: Response): Promise<T | null> {
    try {
        return await response.json() as T
    } catch {
        return null
    }
}

function buildDebtA4Html(result: DebtSaleCreateResponse): string {
    const organizationName = 'ИП БАРАНОВА ЛЮДМИЛА ВЛАДИМИРОВНА'
    const organizationInn = '383802146665'
    const organizationAddress = 'Иркутская область, с. Николаевка, ул. Ленина д.11'

    const rows = result.debtSale.items
        .map((item, index) => {
            return `
                <tr>
                    <td class="num">${index + 1}</td>
                    <td>
                        <div class="product-name">${escapeHtml(item.name)}</div>
                        ${item.barcode ? `<div class="muted">ШК: ${escapeHtml(item.barcode)}</div>` : ''}
                    </td>
                    <td class="right">${escapeHtml(formatQuantity(item.quantity, item.unit))}</td>
                    <td class="right">${escapeHtml(formatMoney(item.sellingPrice))}</td>
                    <td class="right strong">${escapeHtml(formatMoney(item.total))}</td>
                </tr>
            `
        })
        .join('')

    return `
        <!doctype html>
        <html lang="ru">
        <head>
            <meta charset="utf-8" />
            <title>Долговой документ ${escapeHtml(result.debtSale.debtNumber)}</title>
            <style>
                @page {
                    size: A4 portrait;
                    margin: 14mm;
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
                    color: #111827;
                    background: #ffffff;
                    font-family: Arial, sans-serif;
                    font-size: 12px;
                    line-height: 1.35;
                }

                .document {
                    width: 100%;
                }

                .header {
                    display: flex;
                    justify-content: space-between;
                    gap: 24px;
                    padding-bottom: 12px;
                    border-bottom: 2px solid #111827;
                }

                .org {
                    max-width: 65%;
                }

                .org-name {
                    font-size: 15px;
                    font-weight: 800;
                }

                .title-box {
                    text-align: right;
                }

                h1 {
                    margin: 12px 0 2px;
                    font-size: 24px;
                    letter-spacing: .04em;
                    text-align: center;
                }

                .doc-number {
                    margin-bottom: 14px;
                    text-align: center;
                    font-size: 14px;
                    font-weight: 700;
                }

                .grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px 20px;
                    margin: 12px 0 16px;
                }

                .block {
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    padding: 10px 12px;
                }

                .block-title {
                    margin-bottom: 6px;
                    font-size: 10px;
                    font-weight: 800;
                    letter-spacing: .08em;
                    text-transform: uppercase;
                    color: #6b7280;
                }

                .line {
                    margin: 3px 0;
                }

                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 8px;
                }

                th,
                td {
                    border: 1px solid #9ca3af;
                    padding: 7px 8px;
                    vertical-align: top;
                }

                th {
                    background: #f3f4f6;
                    font-size: 10px;
                    text-transform: uppercase;
                    letter-spacing: .04em;
                    text-align: left;
                }

                .num {
                    width: 28px;
                    text-align: center;
                }

                .right {
                    text-align: right;
                    white-space: nowrap;
                }

                .strong {
                    font-weight: 800;
                }

                .product-name {
                    font-weight: 700;
                }

                .muted {
                    margin-top: 2px;
                    color: #6b7280;
                    font-size: 10px;
                }

                .totals {
                    width: 360px;
                    margin: 16px 0 0 auto;
                }

                .total-row {
                    display: flex;
                    justify-content: space-between;
                    gap: 20px;
                    padding: 5px 0;
                    border-bottom: 1px solid #e5e7eb;
                }

                .total-row.main {
                    margin-top: 4px;
                    padding-top: 8px;
                    border-top: 2px solid #111827;
                    border-bottom: 0;
                    font-size: 17px;
                    font-weight: 900;
                }

                .notice {
                    margin-top: 18px;
                    padding: 10px 12px;
                    border: 1px solid #d1d5db;
                    background: #f9fafb;
                    font-size: 11px;
                }

                .signatures {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 40px;
                    margin-top: 34px;
                }

                .signature {
                    padding-top: 24px;
                    border-top: 1px solid #111827;
                    text-align: center;
                    font-size: 11px;
                }

                .footer {
                    margin-top: 30px;
                    text-align: center;
                    color: #6b7280;
                    font-size: 9px;
                }
            </style>
        </head>
        <body>
            <main class="document">
                <div class="header">
                    <div class="org">
                        <div class="org-name">${escapeHtml(organizationName)}</div>
                        <div>ИНН: ${escapeHtml(organizationInn)}</div>
                        <div>${escapeHtml(organizationAddress)}</div>
                    </div>

                    <div class="title-box">
                        <div><strong>Торговая точка:</strong> ${escapeHtml(result.debtSale.location.name)}</div>
                        <div><strong>Дата:</strong> ${escapeHtml(formatDate(result.debtSale.createdAt))}</div>
                        <div><strong>Кассир:</strong> ${escapeHtml(result.debtSale.cashier.name)}</div>
                        <div><strong>Погасить до:</strong> ${escapeHtml(formatDateOnly(result.debtSale.dueDate))}</div>
                    </div>
                </div>

                <h1>ТОВАР В ДОЛГ</h1>
                <div class="doc-number">Документ № ${escapeHtml(result.debtSale.debtNumber)}</div>

                <section class="grid">
                    <div class="block">
                        <div class="block-title">Клиент</div>
                        <div class="line"><strong>${escapeHtml(result.customer.fullName)}</strong></div>
                        <div class="line">Телефон: ${escapeHtml(result.customer.phone)}</div>
                        <div class="line">Адрес: ${escapeHtml(result.customer.address)}</div>
                    </div>

                    <div class="block">
                        <div class="block-title">Кредитная информация</div>
                        <div class="line">Лимит: <strong>${escapeHtml(formatMoney(result.customer.creditLimit))}</strong></div>
                        <div class="line">Долг до выдачи: <strong>${escapeHtml(formatMoney(result.customer.previousDebt))}</strong></div>
                        <div class="line">Доступно после выдачи: <strong>${escapeHtml(formatMoney(result.customer.availableCredit))}</strong></div>
                    </div>
                </section>

                <table>
                    <thead>
                        <tr>
                            <th class="num">№</th>
                            <th>Товар</th>
                            <th class="right">Количество</th>
                            <th class="right">Цена</th>
                            <th class="right">Сумма</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>

                <section class="totals">
                    <div class="total-row">
                        <span>Предыдущий долг</span>
                        <strong>${escapeHtml(formatMoney(result.customer.previousDebt))}</strong>
                    </div>
                    <div class="total-row">
                        <span>Текущая выдача</span>
                        <strong>${escapeHtml(formatMoney(result.debtSale.total))}</strong>
                    </div>
                    <div class="total-row main">
                        <span>К ПОГАШЕНИЮ</span>
                        <span>${escapeHtml(formatMoney(result.customer.currentDebt))}</span>
                    </div>
                </section>

                <div class="notice">
                    Товар фактически передан покупателю и списан с остатка торговой точки.
                    Документ хранится во внутренней папке магазина до полного погашения задолженности.
                    Срок погашения: <strong>${escapeHtml(formatDateOnly(result.debtSale.dueDate))}</strong>.
                </div>

                <section class="signatures">
                    <div class="signature">Покупатель / подпись</div>
                    <div class="signature">Кассир / подпись</div>
                </section>

                <div class="footer">
                    Внутренний долговой документ. Не является кассовым чеком.
                </div>
            </main>

            <script>
                window.onload = function () {
                    window.focus();
                    setTimeout(function () {
                        window.print();
                    }, 250);
                };
            </script>
        </body>
        </html>
    `
}

function writeDebtPrintWindow(
    printWindow: Window,
    result: DebtSaleCreateResponse,
) {
    printWindow.document.open()
    printWindow.document.write(buildDebtA4Html(result))
    printWindow.document.close()
}

function prepareDebtPrintWindow(): Window | null {
    const printWindow = window.open('', '_blank', 'width=1000,height=760')

    if (!printWindow) {
        return null
    }

    printWindow.document.open()
    printWindow.document.write(`
        <!doctype html>
        <html lang="ru">
            <head>
                <meta charset="utf-8" />
                <title>Формирование долгового документа</title>
            </head>
            <body style="font-family: Arial, sans-serif; padding: 32px;">
                <h2>Формирую долговой документ...</h2>
                <p>Не закрывайте это окно.</p>
            </body>
        </html>
    `)
    printWindow.document.close()

    return printWindow
}

export default function PosDebtLauncher() {
    const pathname = usePathname()

    const currentItems = usePosCheckoutStore(state => state.currentItems)
    const clearCurrentItems = usePosCheckoutStore(state => state.clearCurrentItems)

    const [isDebtSaleOpen, setIsDebtSaleOpen] = useState(false)
    const [isDebtsOpen, setIsDebtsOpen] = useState(false)
    const [isCreateCustomerOpen, setIsCreateCustomerOpen] = useState(false)
    const [isPaymentOpen, setIsPaymentOpen] = useState(false)
    const [returnSale, setReturnSale] = useState<DebtSale | null>(null)

    const [saleCustomerSearch, setSaleCustomerSearch] = useState('')
    const [saleCustomers, setSaleCustomers] = useState<DebtCustomer[]>([])
    const [isSaleCustomersLoading, setIsSaleCustomersLoading] = useState(false)
    const [selectedSaleCustomer, setSelectedSaleCustomer] = useState<DebtCustomer | null>(null)

    const [debtsSearch, setDebtsSearch] = useState('')
    const [debtCustomers, setDebtCustomers] = useState<DebtCustomer[]>([])
    const [isDebtCustomersLoading, setIsDebtCustomersLoading] = useState(false)

    const [customerDetail, setCustomerDetail] = useState<DebtCustomerDetail | null>(null)
    const [isCustomerDetailLoading, setIsCustomerDetailLoading] = useState(false)

    const [newCustomerForm, setNewCustomerForm] = useState<NewCustomerForm>(EMPTY_CUSTOMER_FORM)
    const [isCreatingCustomer, setIsCreatingCustomer] = useState(false)

    const [debtSaleComment, setDebtSaleComment] = useState('')
    const [debtDueDate, setDebtDueDate] = useState(
        () =>
            dateInputValueFromDays(
                DEFAULT_DEBT_TERM_DAYS
            )
    )
    const [isCreatingDebtSale, setIsCreatingDebtSale] = useState(false)

    const [paymentAmount, setPaymentAmount] = useState('')
    const [paymentMethod, setPaymentMethod] = useState<DebtPaymentMethod>('cash')
    const [paymentComment, setPaymentComment] = useState('')
    const [isSavingPayment, setIsSavingPayment] = useState(false)

    const [returnQuantities, setReturnQuantities] = useState<DebtReturnQuantityMap>({})
    const [returnComment, setReturnComment] = useState('')
    const [returnRefundMethod, setReturnRefundMethod] = useState<DebtPaymentMethod>('cash')
    const [isSavingReturn, setIsSavingReturn] = useState(false)

    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)

    const isPosPage = pathname === '/online-kassa'

    const checkoutTotal = useMemo(() => {
        return roundMoney(
            currentItems.reduce((sum, item) => {
                return sum + getStoredProductPrice(item) * toNumber(item.quantity)
            }, 0)
        )
    }, [currentItems])

    const newDebtAfterSale = selectedSaleCustomer
        ? roundMoney(selectedSaleCustomer.currentDebt + checkoutTotal)
        : checkoutTotal

    const isCreditLimitExceeded = Boolean(
        selectedSaleCustomer &&
        newDebtAfterSale > selectedSaleCustomer.creditLimit + 0.009
    )

    const selectedReturnTotal = useMemo(() => {
        if (!returnSale) {
            return 0
        }

        return roundMoney(
            returnSale.items.reduce((sum, item) => {
                const quantity = toNumber(returnQuantities[String(item.id)])
                return sum + Math.max(0, quantity) * item.sellingPrice
            }, 0)
        )
    }, [returnQuantities, returnSale])

    const selectedReturnDebtReduction = returnSale
        ? roundMoney(Math.min(selectedReturnTotal, Math.max(0, returnSale.remainingAmount)))
        : 0

    const selectedReturnRefundAmount = returnSale
        ? roundMoney(Math.max(0, selectedReturnTotal - Math.max(0, returnSale.remainingAmount)))
        : 0

    const showError = useCallback((message: string) => {
        setNotice(null)
        setError(message)
    }, [])

    const showNotice = useCallback((message: string) => {
        setError(null)
        setNotice(message)
    }, [])

    useEffect(() => {
        if (!error) {
            return
        }

        const timer = window.setTimeout(() => setError(null), 10_000)
        return () => window.clearTimeout(timer)
    }, [error])

    useEffect(() => {
        if (!notice) {
            return
        }

        const timer = window.setTimeout(() => setNotice(null), 10_000)
        return () => window.clearTimeout(timer)
    }, [notice])

    const searchCustomers = useCallback(async (
        query: string,
        target: 'sale' | 'debts',
    ) => {
        const setLoading = target === 'sale'
            ? setIsSaleCustomersLoading
            : setIsDebtCustomersLoading

        try {
            setLoading(true)

            const params = new URLSearchParams()
            if (query.trim()) {
                params.set('search', query.trim())
            }

            const response = await fetch(
                `/api/debts/customers${params.toString() ? `?${params.toString()}` : ''}`,
                {
                    method: 'GET',
                    cache: 'no-store',
                    credentials: 'same-origin',
                }
            )

            const data = await readJsonSafe<{ items?: DebtCustomer[] } & ApiError>(response)

            if (!response.ok) {
                throw new Error(data?.message || 'Не удалось загрузить клиентов')
            }

            const customers = Array.isArray(data?.items) ? data.items : []

            if (target === 'sale') {
                setSaleCustomers(customers)
            } else {
                setDebtCustomers(customers)
            }
        } catch (err) {
            showError(err instanceof Error ? err.message : 'Не удалось загрузить клиентов')
        } finally {
            setLoading(false)
        }
    }, [showError])

    useEffect(() => {
        if (!isDebtSaleOpen) {
            return
        }

        const timer = window.setTimeout(() => {
            void searchCustomers(saleCustomerSearch, 'sale')
        }, 220)

        return () => window.clearTimeout(timer)
    }, [isDebtSaleOpen, saleCustomerSearch, searchCustomers])

    useEffect(() => {
        if (!isDebtsOpen) {
            return
        }

        const timer = window.setTimeout(() => {
            void searchCustomers(debtsSearch, 'debts')
        }, 220)

        return () => window.clearTimeout(timer)
    }, [debtsSearch, isDebtsOpen, searchCustomers])

    useEffect(() => {
        const onKeyDown = (event: globalThis.KeyboardEvent) => {
            if (event.key !== 'Escape') {
                return
            }

            if (returnSale) {
                setReturnSale(null)
                return
            }

            if (isPaymentOpen) {
                setIsPaymentOpen(false)
                return
            }

            if (isCreateCustomerOpen) {
                setIsCreateCustomerOpen(false)
                return
            }

            if (customerDetail) {
                setCustomerDetail(null)
                return
            }

            if (isDebtSaleOpen) {
                setIsDebtSaleOpen(false)
                return
            }

            if (isDebtsOpen) {
                setIsDebtsOpen(false)
            }
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [
        customerDetail,
        isCreateCustomerOpen,
        isDebtSaleOpen,
        isDebtsOpen,
        isPaymentOpen,
        returnSale,
    ])

    const openDebtSale = () => {
        if (currentItems.length === 0) {
            showError('Чек пустой. Сначала добавьте товар.')
            return
        }

        setSelectedSaleCustomer(null)
        setSaleCustomerSearch('')
        setDebtSaleComment('')
        setDebtDueDate(
            dateInputValueFromDays(
                DEFAULT_DEBT_TERM_DAYS
            )
        )
        setIsDebtSaleOpen(true)
        setError(null)
    }

    const openDebts = () => {
        setDebtsSearch('')
        setCustomerDetail(null)
        setIsDebtsOpen(true)
        setError(null)
    }

    const createCustomer = async () => {
        try {
            setIsCreatingCustomer(true)
            setError(null)

            const response = await fetch('/api/debts/customers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin',
                body: JSON.stringify({
                    firstName: newCustomerForm.firstName,
                    lastName: newCustomerForm.lastName,
                    middleName: newCustomerForm.middleName,
                    phone: newCustomerForm.phone,
                    address: newCustomerForm.address,
                    creditLimit: newCustomerForm.creditLimit,
                    comment: newCustomerForm.comment,
                }),
            })

            const data = await readJsonSafe<DebtCustomer & ApiError>(response)

            if (!response.ok || !data) {
                throw new Error(data?.message || 'Не удалось создать клиента')
            }

            const customer: DebtCustomer = {
                id: Number(data.id),
                firstName: data.firstName,
                lastName: data.lastName,
                middleName: data.middleName || '',
                fullName: data.fullName,
                phone: data.phone,
                address: data.address,
                creditLimit: toNumber(data.creditLimit),
                currentDebt: toNumber(data.currentDebt),
                availableCredit: toNumber(data.availableCredit),
                isActive: data.isActive,
                comment: data.comment || '',
            }

            setNewCustomerForm(EMPTY_CUSTOMER_FORM)
            setIsCreateCustomerOpen(false)
            showNotice(`Клиент «${customer.fullName}» создан`)

            if (isDebtSaleOpen) {
                setSelectedSaleCustomer(customer)
                setSaleCustomerSearch(customer.fullName)
                await searchCustomers(customer.fullName, 'sale')
            }

            if (isDebtsOpen) {
                await searchCustomers(customer.fullName, 'debts')
                await loadCustomerDetail(customer.id)
            }
        } catch (err) {
            showError(err instanceof Error ? err.message : 'Не удалось создать клиента')
        } finally {
            setIsCreatingCustomer(false)
        }
    }

    const loadCustomerDetail = useCallback(async (customerId: number) => {
        try {
            setIsCustomerDetailLoading(true)
            setError(null)

            const response = await fetch(`/api/debts/customers/${customerId}`, {
                method: 'GET',
                cache: 'no-store',
                credentials: 'same-origin',
            })

            const data = await readJsonSafe<DebtCustomerDetail & ApiError>(response)

            if (!response.ok || !data?.customer) {
                throw new Error(data?.message || 'Не удалось открыть карточку клиента')
            }

            setCustomerDetail(data)
        } catch (err) {
            showError(err instanceof Error ? err.message : 'Не удалось открыть карточку клиента')
        } finally {
            setIsCustomerDetailLoading(false)
        }
    }, [showError])

    const createDebtSale = async () => {
        if (!selectedSaleCustomer) {
            showError('Выберите клиента')
            return
        }

        if (currentItems.length === 0) {
            showError('Текущий чек пустой')
            return
        }

        if (!selectedSaleCustomer.isActive) {
            showError('Карточка клиента заблокирована')
            return
        }

        if (isCreditLimitExceeded) {
            showError('Сумма выдачи превышает кредитный лимит клиента')
            return
        }

        if (!debtDueDate) {
            showError('Укажите срок погашения долга')
            return
        }

        const unsafeMarkedItem = currentItems.find(item => {
            return isStoredMarkedProduct(item) && item.markingStatus !== 'M+'
        })

        if (unsafeMarkedItem) {
            showError(`Маркированный товар «${unsafeMarkedItem.product.name}» не имеет статуса [M+]`)
            return
        }

        const printWindow = prepareDebtPrintWindow()

        try {
            setIsCreatingDebtSale(true)
            setError(null)

            const response = await fetch('/api/debts/sales', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin',
                body: JSON.stringify({
                    customerId: selectedSaleCustomer.id,
                    comment: debtSaleComment,
                    dueDate: debtDueDate,
                    items: currentItems.map(rawItem => {
                        const item = rawItem as ExtendedStoredCheckoutItem

                        return {
                            productId: item.product.id,
                            quantity: item.quantity,
                            price: getStoredProductPrice(item),
                            markingCode: item.markingCode,
                            markingStatus: item.markingStatus,
                            markingMessage: item.markingMessage,
                            markingPackageMode: item.markingPackageMode,
                            markingPackageQuantity: item.markingPackageQuantity,
                        }
                    }),
                }),
            })

            const data = await readJsonSafe<DebtSaleCreateResponse & ApiError>(response)

            if (!response.ok || !data?.debtSale) {
                throw new Error(data?.message || 'Не удалось оформить товар в долг')
            }

            clearCurrentItems()
            setIsDebtSaleOpen(false)
            setSelectedSaleCustomer(null)
            setSaleCustomerSearch('')
            setDebtSaleComment('')
            setDebtDueDate(
                dateInputValueFromDays(
                    DEFAULT_DEBT_TERM_DAYS
                )
            )

            if (printWindow) {
                writeDebtPrintWindow(printWindow, data)
            } else {
                showNotice(
                    `Долг ${data.debtSale.debtNumber} оформлен, но браузер заблокировал окно A4-печати. Разрешите всплывающие окна.`
                )
            }

            if (printWindow) {
                showNotice(`Долг ${data.debtSale.debtNumber} оформлен. A4-документ отправлен на печать.`)
            }

            window.setTimeout(() => {
                window.location.reload()
            }, 450)
        } catch (err) {
            if (printWindow && !printWindow.closed) {
                printWindow.close()
            }

            showError(err instanceof Error ? err.message : 'Не удалось оформить товар в долг')
        } finally {
            setIsCreatingDebtSale(false)
        }
    }

    const openPayment = () => {
        if (!customerDetail?.customer) {
            return
        }

        if (customerDetail.customer.currentDebt <= 0) {
            showError('У клиента нет задолженности')
            return
        }

        setPaymentAmount(String(customerDetail.customer.currentDebt))
        setPaymentMethod('cash')
        setPaymentComment('')
        setIsPaymentOpen(true)
    }

    const savePayment = async () => {
        const customer = customerDetail?.customer

        if (!customer) {
            return
        }

        const amount = roundMoney(toNumber(paymentAmount))

        if (amount <= 0) {
            showError('Введите сумму погашения')
            return
        }

        if (amount > customer.currentDebt + 0.009) {
            showError(`Сумма больше текущего долга ${formatMoney(customer.currentDebt)}`)
            return
        }

        try {
            setIsSavingPayment(true)
            setError(null)

            const response = await fetch('/api/debts/payments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin',
                body: JSON.stringify({
                    customerId: customer.id,
                    amount,
                    paymentMethod,
                    comment: paymentComment,
                }),
            })

            const data = await readJsonSafe<{
                payment?: {
                    paymentNumber?: string
                }
                customer?: {
                    currentDebt?: number
                }
            } & ApiError>(response)

            if (!response.ok) {
                throw new Error(data?.message || 'Не удалось провести погашение')
            }

            setIsPaymentOpen(false)
            showNotice(
                `Погашение ${data?.payment?.paymentNumber || ''} проведено. Остаток долга: ${formatMoney(data?.customer?.currentDebt || 0)}`
            )

            await Promise.all([
                loadCustomerDetail(customer.id),
                searchCustomers(debtsSearch, 'debts'),
            ])
        } catch (err) {
            showError(err instanceof Error ? err.message : 'Не удалось провести погашение')
        } finally {
            setIsSavingPayment(false)
        }
    }

    const openReturn = (sale: DebtSale) => {
        if (sale.status === 'cancelled') {
            showError('Отменённый долговой документ нельзя возвращать')
            return
        }

        if (!sale.items.some(item => item.availableToReturn > 0.0009)) {
            showError('По этому документу больше нет товара, доступного к возврату')
            return
        }

        const initial: DebtReturnQuantityMap = {}
        sale.items.forEach(item => {
            initial[String(item.id)] = ''
        })

        setReturnQuantities(initial)
        setReturnComment('')
        setReturnRefundMethod('cash')
        setReturnSale(sale)
    }

    const saveDebtReturn = async () => {
        const customer = customerDetail?.customer

        if (!customer || !returnSale) {
            return
        }

        const items = returnSale.items
            .map(item => {
                const rawQuantity = toNumber(returnQuantities[String(item.id)])
                const quantity = item.unit === 'weight'
                    ? Math.round(rawQuantity * 1000) / 1000
                    : Math.floor(rawQuantity)

                return {
                    debtSaleItemId: item.id,
                    quantity,
                    availableToReturn: item.availableToReturn,
                    name: item.name,
                }
            })
            .filter(item => item.quantity > 0)

        if (items.length === 0) {
            showError('Укажите количество хотя бы у одного товара')
            return
        }

        const invalid = items.find(item => item.quantity > item.availableToReturn + 0.0009)

        if (invalid) {
            showError(`Нельзя вернуть столько товара «${invalid.name}». Доступно: ${invalid.availableToReturn}`)
            return
        }


        try {
            setIsSavingReturn(true)
            setError(null)

            const response = await fetch('/api/debts/returns', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin',
                body: JSON.stringify({
                    debtSaleId: returnSale.id,
                    comment: returnComment,
                    refundMethod: selectedReturnRefundAmount > 0.009 ? returnRefundMethod : undefined,
                    items: items.map(item => ({
                        debtSaleItemId: item.debtSaleItemId,
                        quantity: item.quantity,
                    })),
                }),
            })

            const data = await readJsonSafe<{
                debtReturn?: {
                    returnNumber?: string
                    debtReduction?: number
                    refundAmount?: number
                    refund?: {
                        refundNumber?: string
                        amount?: number
                        paymentMethod?: DebtPaymentMethod
                    } | null
                }
                customer?: {
                    currentDebt?: number
                }
            } & ApiError>(response)

            if (!response.ok) {
                throw new Error(data?.message || 'Не удалось провести возврат из долга')
            }

            setReturnSale(null)
            const refundAmount = toNumber(data?.debtReturn?.refundAmount)

            showNotice(
                refundAmount > 0.009
                    ? `Возврат ${data?.debtReturn?.returnNumber || ''} проведён. Долг уменьшен на ${formatMoney(data?.debtReturn?.debtReduction || 0)}, клиенту вернуть ${formatMoney(refundAmount)} (${getPaymentMethodLabel(returnRefundMethod)}). Остаток долга: ${formatMoney(data?.customer?.currentDebt || 0)}`
                    : `Возврат ${data?.debtReturn?.returnNumber || ''} проведён в зону «${getLocationName()}». Остаток долга: ${formatMoney(data?.customer?.currentDebt || 0)}`
            )

            await Promise.all([
                loadCustomerDetail(customer.id),
                searchCustomers(debtsSearch, 'debts'),
            ])
        } catch (err) {
            showError(err instanceof Error ? err.message : 'Не удалось провести возврат из долга')
        } finally {
            setIsSavingReturn(false)
        }
    }

    if (!isPosPage) {
        return null
    }

    return (
        <>
            <div className="fixed bottom-5 right-5 z-[40] flex flex-col gap-2 sm:flex-row">
                <button
                    type="button"
                    onClick={openDebtSale}
                    disabled={currentItems.length === 0}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-700 px-5 py-3 text-sm font-black text-white shadow-2xl ring-4 ring-rose-100 transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-gray-400 disabled:ring-gray-100"
                >
                    <AiOutlineFileText size={20} />
                    ДОЛГ
                    {currentItems.length > 0 && (
                        <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
                            {formatMoney(checkoutTotal)}
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={openDebts}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white px-5 py-3 text-sm font-black text-rose-800 shadow-2xl ring-4 ring-white/70 transition hover:bg-rose-50"
                >
                    <AiOutlineTeam size={20} />
                    ДОЛГИ
                </button>
            </div>

            <AnimatePresence>
                {(error || notice) && (
                    <motion.div
                        initial={{ opacity: 0, y: -12, x: 12 }}
                        animate={{ opacity: 1, y: 0, x: 0 }}
                        exit={{ opacity: 0, y: -12, x: 12 }}
                        className={`fixed right-4 top-4 z-[10050] w-[calc(100vw-32px)] max-w-lg rounded-2xl border bg-white p-4 shadow-2xl ${
                            error
                                ? 'border-red-200 ring-4 ring-red-50'
                                : 'border-emerald-200 ring-4 ring-emerald-50'
                        }`}
                    >
                        <div className="flex items-start gap-3">
                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-black ${
                                error
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-emerald-100 text-emerald-700'
                            }`}>
                                {error ? '!' : '✓'}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className={`text-xs font-black uppercase tracking-[0.15em] ${
                                    error ? 'text-red-600' : 'text-emerald-600'
                                }`}>
                                    {error ? 'Ошибка долга' : 'Долговая система'}
                                </div>
                                <div className="mt-1 text-sm font-bold leading-5 text-gray-900">
                                    {error || notice}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setError(null)
                                    setNotice(null)
                                }}
                                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            >
                                <AiOutlineClose size={20} />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isDebtSaleOpen && (
                    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/55 p-3 sm:p-5">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.97 }}
                            className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
                        >
                            <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5 sm:p-6">
                                <div>
                                    <div className="inline-flex rounded-full bg-rose-100 px-3 py-1 text-xs font-black uppercase tracking-[0.15em] text-rose-800">
                                        Товар в долг
                                    </div>
                                    <h2 className="mt-2 text-2xl font-black text-gray-900">
                                        Оформление текущей корзины в долг
                                    </h2>
                                    <p className="mt-1 text-sm text-gray-500">
                                        Товар будет списан с остатка зоны «{getLocationName()}», а после проведения откроется печать A4-документа.
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    disabled={isCreatingDebtSale}
                                    onClick={() => setIsDebtSaleOpen(false)}
                                    className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
                                >
                                    <AiOutlineClose size={24} />
                                </button>
                            </div>

                            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]">
                                <section className="min-h-0 overflow-y-auto border-b border-gray-100 p-5 lg:border-b-0 lg:border-r sm:p-6">
                                    <div className="flex flex-col gap-3 sm:flex-row">
                                        <div className="relative flex-1">
                                            <AiOutlineSearch className="absolute left-3 top-3.5 text-gray-400" size={20} />
                                            <input
                                                type="text"
                                                autoFocus
                                                value={saleCustomerSearch}
                                                onChange={event => setSaleCustomerSearch(event.target.value)}
                                                placeholder="Имя, фамилия или телефон..."
                                                className="w-full rounded-xl border border-gray-300 py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-rose-500"
                                            />
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                setNewCustomerForm(EMPTY_CUSTOMER_FORM)
                                                setIsCreateCustomerOpen(true)
                                            }}
                                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-black text-white hover:bg-gray-800"
                                        >
                                            <AiOutlinePlus />
                                            Новый клиент
                                        </button>
                                    </div>

                                    <div className="mt-4 space-y-2">
                                        {isSaleCustomersLoading ? (
                                            <div className="rounded-2xl bg-gray-50 p-8 text-center text-gray-500">
                                                Загружаю клиентов...
                                            </div>
                                        ) : saleCustomers.length === 0 ? (
                                            <div className="rounded-2xl bg-gray-50 p-8 text-center text-gray-500">
                                                Клиенты не найдены
                                            </div>
                                        ) : (
                                            saleCustomers.map(customer => {
                                                const selected = selectedSaleCustomer?.id === customer.id

                                                return (
                                                    <button
                                                        key={customer.id}
                                                        type="button"
                                                        onClick={() => setSelectedSaleCustomer(customer)}
                                                        className={`w-full rounded-2xl border p-4 text-left transition ${
                                                            selected
                                                                ? 'border-rose-400 bg-rose-50 ring-4 ring-rose-100'
                                                                : 'border-gray-200 bg-white hover:border-rose-200 hover:bg-rose-50/40'
                                                        }`}
                                                    >
                                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                            <div className="min-w-0">
                                                                <div className="font-black text-gray-900">{customer.fullName}</div>
                                                                <div className="mt-1 text-sm text-gray-500">{customer.phone}</div>
                                                                <div className="mt-1 truncate text-xs text-gray-400">{customer.address}</div>
                                                            </div>
                                                            <div className="shrink-0 text-left sm:text-right">
                                                                <div className="text-xs font-bold uppercase text-gray-400">Текущий долг</div>
                                                                <div className={`text-xl font-black ${customer.currentDebt > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                                                    {formatMoney(customer.currentDebt)}
                                                                </div>
                                                                <div className="mt-1 text-xs text-gray-500">
                                                                    Лимит {formatMoney(customer.creditLimit)}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {!customer.isActive && (
                                                            <div className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-xs font-bold text-red-700">
                                                                Карточка заблокирована
                                                            </div>
                                                        )}
                                                    </button>
                                                )
                                            })
                                        )}
                                    </div>
                                </section>

                                <aside className="min-h-0 overflow-y-auto bg-gray-50 p-5 sm:p-6">
                                    <div className="rounded-2xl border border-gray-200 bg-white p-5">
                                        <div className="text-xs font-black uppercase tracking-[0.15em] text-gray-400">
                                            Текущая корзина
                                        </div>
                                        <div className="mt-2 text-3xl font-black text-gray-900">
                                            {formatMoney(checkoutTotal)}
                                        </div>
                                        <div className="mt-1 text-sm text-gray-500">
                                            Позиций: {currentItems.length}
                                        </div>

                                        <div className="mt-4 max-h-52 space-y-2 overflow-y-auto pr-1">
                                            {currentItems.map(item => (
                                                <div key={item.id} className="flex justify-between gap-3 text-sm">
                                                    <div className="min-w-0 flex-1 truncate text-gray-700">
                                                        {item.product.name}
                                                        <span className="ml-1 text-gray-400">
                                                            × {formatQuantity(item.quantity, item.product.unit)}
                                                        </span>
                                                    </div>
                                                    <strong className="shrink-0 text-gray-900">
                                                        {formatMoney(getStoredProductPrice(item) * toNumber(item.quantity))}
                                                    </strong>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {selectedSaleCustomer ? (
                                        <div className="mt-4 rounded-2xl border border-rose-200 bg-white p-5">
                                            <div className="text-xs font-black uppercase tracking-[0.15em] text-rose-600">
                                                Выбранный клиент
                                            </div>
                                            <div className="mt-2 text-xl font-black text-gray-900">
                                                {selectedSaleCustomer.fullName}
                                            </div>
                                            <div className="mt-1 text-sm text-gray-500">
                                                {selectedSaleCustomer.phone}
                                            </div>

                                            {selectedSaleCustomer.hasOverdueDebt && (
                                                <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-bold leading-5 text-red-800">
                                                    У клиента есть просроченная задолженность: {formatMoney(selectedSaleCustomer.overdueDebt || 0)}.
                                                    Новая выдача не блокируется автоматически, но проверьте ситуацию перед оформлением.
                                                </div>
                                            )}

                                            <div className="mt-5 space-y-2 text-sm">
                                                <div className="flex justify-between gap-3">
                                                    <span className="text-gray-500">Кредитный лимит</span>
                                                    <strong>{formatMoney(selectedSaleCustomer.creditLimit)}</strong>
                                                </div>
                                                <div className="flex justify-between gap-3">
                                                    <span className="text-gray-500">Текущий долг</span>
                                                    <strong>{formatMoney(selectedSaleCustomer.currentDebt)}</strong>
                                                </div>
                                                <div className="flex justify-between gap-3">
                                                    <span className="text-gray-500">Новая выдача</span>
                                                    <strong>+ {formatMoney(checkoutTotal)}</strong>
                                                </div>
                                                <div className="border-t border-gray-200 pt-3">
                                                    <div className="flex justify-between gap-3 text-lg">
                                                        <span className="font-bold text-gray-700">Новый долг</span>
                                                        <strong className={isCreditLimitExceeded ? 'text-red-700' : 'text-rose-700'}>
                                                            {formatMoney(newDebtAfterSale)}
                                                        </strong>
                                                    </div>
                                                </div>
                                            </div>

                                            {isCreditLimitExceeded && (
                                                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
                                                    Кредитный лимит превышен на {formatMoney(newDebtAfterSale - selectedSaleCustomer.creditLimit)}.
                                                </div>
                                            )}

                                            <label className="mt-5 block text-sm font-bold text-gray-700">
                                                Погасить до
                                            </label>

                                            <input
                                                type="date"
                                                min={dateInputValueFromDays(0)}
                                                value={debtDueDate}
                                                onChange={event => setDebtDueDate(event.target.value)}
                                                className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2.5 font-bold outline-none focus:ring-2 focus:ring-rose-500"
                                            />

                                            <div className="mt-2 text-xs leading-5 text-gray-500">
                                                По умолчанию установлен срок {DEFAULT_DEBT_TERM_DAYS} дней.
                                                Дату можно изменить перед оформлением.
                                            </div>

                                            <label className="mt-5 block text-sm font-bold text-gray-700">
                                                Комментарий к выдаче
                                            </label>
                                            <textarea
                                                value={debtSaleComment}
                                                onChange={event => setDebtSaleComment(event.target.value)}
                                                placeholder="Необязательно"
                                                className="mt-2 h-20 w-full resize-none rounded-xl border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-rose-500"
                                            />
                                        </div>
                                    ) : (
                                        <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
                                            Выберите клиента слева или создайте новую карточку.
                                        </div>
                                    )}
                                </aside>
                            </div>

                            <div className="flex flex-col gap-3 border-t border-gray-100 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
                                <div className="text-sm text-gray-500">
                                    После успешного проведения текущая корзина будет очищена и страница кассы обновится.
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        disabled={isCreatingDebtSale}
                                        onClick={() => setIsDebtSaleOpen(false)}
                                        className="rounded-xl border border-gray-300 px-5 py-3 font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        Отмена
                                    </button>
                                    <button
                                        type="button"
                                        disabled={
                                            isCreatingDebtSale ||
                                            !selectedSaleCustomer ||
                                            !selectedSaleCustomer.isActive ||
                                            isCreditLimitExceeded ||
                                            !debtDueDate ||
                                            currentItems.length === 0
                                        }
                                        onClick={() => void createDebtSale()}
                                        className="inline-flex items-center gap-2 rounded-xl bg-rose-700 px-5 py-3 font-black text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <AiOutlinePrinter />
                                        {isCreatingDebtSale ? 'Оформляю...' : 'Оформить долг и печатать A4'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isDebtsOpen && (
                    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/55 p-3 sm:p-5">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.97 }}
                            className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
                        >
                            <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5 sm:p-6">
                                <div>
                                    <div className="inline-flex rounded-full bg-rose-100 px-3 py-1 text-xs font-black uppercase tracking-[0.15em] text-rose-800">
                                        Долговая система
                                    </div>
                                    <h2 className="mt-2 text-2xl font-black text-gray-900">ДОЛГИ</h2>
                                    <p className="mt-1 text-sm text-gray-500">
                                        Поиск клиентов, история выдач, погашения и возвраты из долга.
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setIsDebtsOpen(false)}
                                    className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                >
                                    <AiOutlineClose size={24} />
                                </button>
                            </div>

                            <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[380px_minmax(0,1fr)]">
                                <aside className="flex min-h-[260px] flex-col border-b border-gray-100 lg:min-h-0 lg:border-b-0 lg:border-r">
                                    <div className="p-4 sm:p-5">
                                        <div className="relative">
                                            <AiOutlineSearch className="absolute left-3 top-3.5 text-gray-400" size={20} />
                                            <input
                                                type="text"
                                                value={debtsSearch}
                                                onChange={event => setDebtsSearch(event.target.value)}
                                                placeholder="ФИО или телефон..."
                                                className="w-full rounded-xl border border-gray-300 py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-rose-500"
                                            />
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                setNewCustomerForm(EMPTY_CUSTOMER_FORM)
                                                setIsCreateCustomerOpen(true)
                                            }}
                                            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-black text-white hover:bg-gray-800"
                                        >
                                            <AiOutlinePlus />
                                            Создать клиента
                                        </button>
                                    </div>

                                    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
                                        {isDebtCustomersLoading ? (
                                            <div className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-500">
                                                Загружаю...
                                            </div>
                                        ) : debtCustomers.length === 0 ? (
                                            <div className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-500">
                                                Клиенты не найдены
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {debtCustomers.map(customer => {
                                                    const active = customerDetail?.customer.id === customer.id
                                                    return (
                                                        <button
                                                            key={customer.id}
                                                            type="button"
                                                            onClick={() => void loadCustomerDetail(customer.id)}
                                                            className={`w-full rounded-2xl border p-4 text-left transition ${
                                                                active
                                                                    ? 'border-rose-400 bg-rose-50'
                                                                    : 'border-gray-200 bg-white hover:bg-gray-50'
                                                            }`}
                                                        >
                                                            <div className="font-black text-gray-900">{customer.fullName}</div>
                                                            <div className="mt-1 text-xs text-gray-500">{customer.phone}</div>
                                                            <div className="mt-3 flex items-end justify-between gap-3">
                                                                <div className="text-xs text-gray-400">
                                                                    Лимит {formatMoney(customer.creditLimit)}
                                                                </div>
                                                                <div className={`text-lg font-black ${customer.currentDebt > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                                                    {formatMoney(customer.currentDebt)}
                                                                </div>
                                                            </div>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </aside>

                                <main className="min-h-0 flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6">
                                    {isCustomerDetailLoading ? (
                                        <div className="flex h-full min-h-[360px] items-center justify-center text-gray-500">
                                            Открываю карточку клиента...
                                        </div>
                                    ) : !customerDetail ? (
                                        <div className="flex h-full min-h-[360px] items-center justify-center">
                                            <div className="max-w-md text-center">
                                                <AiOutlineTeam className="mx-auto text-gray-300" size={64} />
                                                <div className="mt-4 text-xl font-black text-gray-700">Выберите клиента</div>
                                                <div className="mt-2 text-sm text-gray-500">
                                                    Справа появятся задолженность, история выдач, погашения и возвраты.
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-5">
                                            <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                                                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                                                    <div>
                                                        <div className="text-xs font-black uppercase tracking-[0.15em] text-gray-400">Карточка клиента</div>
                                                        <h3 className="mt-1 text-2xl font-black text-gray-900">
                                                            {customerDetail.customer.fullName}
                                                        </h3>
                                                        <div className="mt-2 text-sm text-gray-600">{customerDetail.customer.phone}</div>
                                                        <div className="mt-1 text-sm text-gray-500">{customerDetail.customer.address}</div>
                                                        {customerDetail.customer.comment && (
                                                            <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600">
                                                                {customerDetail.customer.comment}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:min-w-[520px]">
                                                        <div className="rounded-2xl bg-red-50 p-4">
                                                            <div className="text-xs font-bold uppercase text-red-500">Текущий долг</div>
                                                            <div className="mt-1 text-2xl font-black text-red-700">
                                                                {formatMoney(customerDetail.customer.currentDebt)}
                                                            </div>
                                                        </div>
                                                        <div className="rounded-2xl bg-indigo-50 p-4">
                                                            <div className="text-xs font-bold uppercase text-indigo-500">Лимит</div>
                                                            <div className="mt-1 text-2xl font-black text-indigo-700">
                                                                {formatMoney(customerDetail.customer.creditLimit)}
                                                            </div>
                                                        </div>
                                                        <div className="col-span-2 rounded-2xl bg-emerald-50 p-4 sm:col-span-1">
                                                            <div className="text-xs font-bold uppercase text-emerald-500">Доступно</div>
                                                            <div className="mt-1 text-2xl font-black text-emerald-700">
                                                                {formatMoney(customerDetail.customer.availableCredit)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="mt-5 flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        disabled={customerDetail.customer.currentDebt <= 0}
                                                        onClick={openPayment}
                                                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        <AiOutlineDollarCircle size={19} />
                                                        Погасить долг
                                                    </button>
                                                </div>
                                            </section>

                                            <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <div className="text-xs font-black uppercase tracking-[0.15em] text-rose-500">Выдачи</div>
                                                        <h3 className="mt-1 text-xl font-black text-gray-900">Долговые документы</h3>
                                                    </div>
                                                    <div className="rounded-full bg-gray-100 px-3 py-1 text-sm font-bold text-gray-600">
                                                        {customerDetail.sales.length}
                                                    </div>
                                                </div>

                                                <div className="mt-4 space-y-3">
                                                    {customerDetail.sales.length === 0 ? (
                                                        <div className="rounded-xl bg-gray-50 p-5 text-center text-sm text-gray-500">
                                                            Выдач в долг пока нет
                                                        </div>
                                                    ) : customerDetail.sales.map(sale => (
                                                        <div key={sale.id} className="rounded-2xl border border-gray-200 p-4">
                                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                                <div>
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        <strong className="text-gray-900">{sale.debtNumber}</strong>
                                                                        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${getDebtStatusClassName(sale.status)}`}>
                                                                            {getDebtStatusLabel(sale.status)}
                                                                        </span>
                                                                    </div>
                                                                    <div className="mt-1 text-xs text-gray-500">
                                                                        {formatDate(sale.createdAt)} · {sale.locationName || 'Торговая точка'} · {sale.cashierName || sale.cashierLogin || 'Кассир'}
                                                                    </div>

                                                                    <div className={`mt-2 inline-flex rounded-lg px-2.5 py-1 text-xs font-black ${
                                                                        sale.isOverdue
                                                                            ? 'bg-red-100 text-red-800'
                                                                            : sale.dueDate
                                                                                ? 'bg-blue-50 text-blue-700'
                                                                                : 'bg-gray-100 text-gray-600'
                                                                    }`}>
                                                                        {sale.isOverdue
                                                                            ? `Просрочено на ${sale.daysOverdue || 0} дн. · срок ${formatDateOnly(sale.dueDate)}`
                                                                            : sale.dueDate
                                                                                ? `Погасить до ${formatDateOnly(sale.dueDate)}`
                                                                                : 'Срок погашения не указан'}
                                                                    </div>
                                                                </div>

                                                                <div className="text-left sm:text-right">
                                                                    <div className="text-xl font-black text-gray-900">{formatMoney(sale.total)}</div>
                                                                    <div className="mt-1 text-xs text-gray-500">
                                                                        Осталось: <strong className="text-red-700">{formatMoney(sale.remainingAmount)}</strong>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="mt-4 overflow-x-auto">
                                                                <table className="w-full min-w-[680px] text-sm">
                                                                    <thead className="text-xs uppercase text-gray-400">
                                                                    <tr>
                                                                        <th className="pb-2 text-left">Товар</th>
                                                                        <th className="pb-2 text-right">Выдано</th>
                                                                        <th className="pb-2 text-right">Возвращено</th>
                                                                        <th className="pb-2 text-right">Цена</th>
                                                                        <th className="pb-2 text-right">Сумма</th>
                                                                    </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                    {sale.items.map(item => (
                                                                        <tr key={item.id} className="border-t border-gray-100">
                                                                            <td className="py-2 pr-3 font-semibold text-gray-800">{item.name}</td>
                                                                            <td className="py-2 text-right">{formatQuantity(item.quantity, item.unit)}</td>
                                                                            <td className="py-2 text-right">{formatQuantity(item.returnedQuantity, item.unit)}</td>
                                                                            <td className="py-2 text-right">{formatMoney(item.sellingPrice)}</td>
                                                                            <td className="py-2 text-right font-bold">{formatMoney(item.total)}</td>
                                                                        </tr>
                                                                    ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>

                                                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                                                                <div className="text-xs text-gray-500">
                                                                    Оплачено: {formatMoney(sale.paidTotal)} · Возвраты товара: {formatMoney(sale.returnedTotal)} · Возвращено денег: {formatMoney(sale.refundedTotal || 0)}
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    disabled={
                                                                        sale.status === 'cancelled' ||
                                                                        !sale.items.some(item => item.availableToReturn > 0)
                                                                    }
                                                                    onClick={() => openReturn(sale)}
                                                                    className="inline-flex items-center gap-2 rounded-xl border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-bold text-orange-800 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40"
                                                                >
                                                                    <AiOutlineUndo />
                                                                    Возврат из долга
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </section>

                                            <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                                                <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                                                    <div className="text-xs font-black uppercase tracking-[0.15em] text-emerald-500">Деньги</div>
                                                    <h3 className="mt-1 text-xl font-black text-gray-900">Погашения</h3>

                                                    <div className="mt-4 space-y-2">
                                                        {customerDetail.payments.length === 0 ? (
                                                            <div className="rounded-xl bg-gray-50 p-5 text-center text-sm text-gray-500">Погашений нет</div>
                                                        ) : customerDetail.payments.map(payment => (
                                                            <div key={payment.id} className="rounded-xl border border-gray-200 p-3">
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <div>
                                                                        <div className="font-bold text-gray-900">{payment.paymentNumber}</div>
                                                                        <div className="mt-1 text-xs text-gray-500">
                                                                            {formatDate(payment.createdAt)} · {getPaymentMethodLabel(payment.paymentMethod)}
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-lg font-black text-emerald-700">-{formatMoney(payment.amount)}</div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                                                    <div className="text-xs font-black uppercase tracking-[0.15em] text-orange-500">Товар</div>
                                                    <h3 className="mt-1 text-xl font-black text-gray-900">Возвраты из долга</h3>

                                                    <div className="mt-4 space-y-2">
                                                        {customerDetail.returns.length === 0 ? (
                                                            <div className="rounded-xl bg-gray-50 p-5 text-center text-sm text-gray-500">Возвратов нет</div>
                                                        ) : customerDetail.returns.map(item => (
                                                            <div key={item.id} className="rounded-xl border border-gray-200 p-3">
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <div>
                                                                        <div className="font-bold text-gray-900">{item.returnNumber}</div>
                                                                        <div className="mt-1 text-xs text-gray-500">
                                                                            {formatDate(item.createdAt)} · из {item.debtNumber}
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-lg font-black text-orange-700">-{formatMoney(item.total)}</div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </section>
                                        </div>
                                    )}
                                </main>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isCreateCustomerOpen && (
                    <div className="fixed inset-0 z-[560] flex items-center justify-center bg-black/60 p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.97 }}
                            className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-6"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="text-xs font-black uppercase tracking-[0.15em] text-rose-600">Новая карточка</div>
                                    <h3 className="mt-1 text-2xl font-black text-gray-900">Создать клиента</h3>
                                </div>
                                <button
                                    type="button"
                                    disabled={isCreatingCustomer}
                                    onClick={() => setIsCreateCustomerOpen(false)}
                                    className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
                                >
                                    <AiOutlineClose size={22} />
                                </button>
                            </div>

                            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <label className="block">
                                    <span className="mb-1.5 block text-sm font-bold text-gray-700">Фамилия *</span>
                                    <input
                                        type="text"
                                        value={newCustomerForm.lastName}
                                        onChange={event => setNewCustomerForm(prev => ({ ...prev, lastName: event.target.value }))}
                                        className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-rose-500"
                                    />
                                </label>
                                <label className="block">
                                    <span className="mb-1.5 block text-sm font-bold text-gray-700">Имя *</span>
                                    <input
                                        type="text"
                                        value={newCustomerForm.firstName}
                                        onChange={event => setNewCustomerForm(prev => ({ ...prev, firstName: event.target.value }))}
                                        className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-rose-500"
                                    />
                                </label>
                                <label className="block">
                                    <span className="mb-1.5 block text-sm font-bold text-gray-700">Отчество</span>
                                    <input
                                        type="text"
                                        value={newCustomerForm.middleName}
                                        onChange={event => setNewCustomerForm(prev => ({ ...prev, middleName: event.target.value }))}
                                        className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-rose-500"
                                    />
                                </label>
                                <label className="block">
                                    <span className="mb-1.5 block text-sm font-bold text-gray-700">Телефон *</span>
                                    <input
                                        type="tel"
                                        value={newCustomerForm.phone}
                                        onChange={event => setNewCustomerForm(prev => ({ ...prev, phone: event.target.value }))}
                                        placeholder="+7 999 000-00-00"
                                        className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-rose-500"
                                    />
                                </label>
                                <label className="block sm:col-span-2">
                                    <span className="mb-1.5 block text-sm font-bold text-gray-700">Адрес *</span>
                                    <input
                                        type="text"
                                        value={newCustomerForm.address}
                                        onChange={event => setNewCustomerForm(prev => ({ ...prev, address: event.target.value }))}
                                        className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-rose-500"
                                    />
                                </label>
                                <label className="block">
                                    <span className="mb-1.5 block text-sm font-bold text-gray-700">Кредитный лимит *</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={newCustomerForm.creditLimit}
                                        onChange={event => setNewCustomerForm(prev => ({ ...prev, creditLimit: event.target.value }))}
                                        placeholder="Например 10000"
                                        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-lg font-bold outline-none focus:ring-2 focus:ring-rose-500"
                                    />
                                </label>
                                <label className="block sm:col-span-2">
                                    <span className="mb-1.5 block text-sm font-bold text-gray-700">Комментарий</span>
                                    <textarea
                                        value={newCustomerForm.comment}
                                        onChange={event => setNewCustomerForm(prev => ({ ...prev, comment: event.target.value }))}
                                        className="h-20 w-full resize-none rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-rose-500"
                                    />
                                </label>
                            </div>

                            <div className="mt-6 flex justify-end gap-2">
                                <button
                                    type="button"
                                    disabled={isCreatingCustomer}
                                    onClick={() => setIsCreateCustomerOpen(false)}
                                    className="rounded-xl border border-gray-300 px-5 py-3 font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="button"
                                    disabled={isCreatingCustomer}
                                    onClick={() => void createCustomer()}
                                    className="rounded-xl bg-rose-700 px-5 py-3 font-black text-white hover:bg-rose-800 disabled:opacity-50"
                                >
                                    {isCreatingCustomer ? 'Создаю...' : 'Создать карточку'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isPaymentOpen && customerDetail && (
                    <div className="fixed inset-0 z-[570] flex items-center justify-center bg-black/60 p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.97 }}
                            className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl sm:p-6"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="text-xs font-black uppercase tracking-[0.15em] text-emerald-600">Погашение</div>
                                    <h3 className="mt-1 text-2xl font-black text-gray-900">{customerDetail.customer.fullName}</h3>
                                </div>
                                <button
                                    type="button"
                                    disabled={isSavingPayment}
                                    onClick={() => setIsPaymentOpen(false)}
                                    className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
                                >
                                    <AiOutlineClose size={22} />
                                </button>
                            </div>

                            <div className="mt-5 rounded-2xl bg-red-50 p-4">
                                <div className="text-sm font-bold text-red-600">Текущий долг</div>
                                <div className="mt-1 text-3xl font-black text-red-700">
                                    {formatMoney(customerDetail.customer.currentDebt)}
                                </div>
                            </div>

                            <label className="mt-5 block">
                                <span className="mb-1.5 block text-sm font-bold text-gray-700">Сумма оплаты</span>
                                <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    autoFocus
                                    value={paymentAmount}
                                    onChange={event => setPaymentAmount(event.target.value)}
                                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-2xl font-black outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                            </label>

                            <div className="mt-4 grid grid-cols-3 gap-2">
                                {(['cash', 'card', 'transfer'] as DebtPaymentMethod[]).map(method => (
                                    <button
                                        key={method}
                                        type="button"
                                        onClick={() => setPaymentMethod(method)}
                                        className={`rounded-xl border px-3 py-3 text-sm font-black ${
                                            paymentMethod === method
                                                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                        }`}
                                    >
                                        {getPaymentMethodLabel(method)}
                                    </button>
                                ))}
                            </div>

                            <label className="mt-4 block">
                                <span className="mb-1.5 block text-sm font-bold text-gray-700">Комментарий</span>
                                <textarea
                                    value={paymentComment}
                                    onChange={event => setPaymentComment(event.target.value)}
                                    placeholder="Необязательно"
                                    className="h-20 w-full resize-none rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                            </label>

                            <div className="mt-6 flex justify-end gap-2">
                                <button
                                    type="button"
                                    disabled={isSavingPayment}
                                    onClick={() => setIsPaymentOpen(false)}
                                    className="rounded-xl border border-gray-300 px-5 py-3 font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="button"
                                    disabled={isSavingPayment || toNumber(paymentAmount) <= 0}
                                    onClick={() => void savePayment()}
                                    className="rounded-xl bg-emerald-600 px-5 py-3 font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {isSavingPayment ? 'Провожу...' : 'Принять оплату'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {returnSale && customerDetail && (
                    <div className="fixed inset-0 z-[570] flex items-center justify-center bg-black/60 p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.97 }}
                            className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
                        >
                            <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5 sm:p-6">
                                <div>
                                    <div className="text-xs font-black uppercase tracking-[0.15em] text-orange-600">Возврат из долга</div>
                                    <h3 className="mt-1 text-2xl font-black text-gray-900">{returnSale.debtNumber}</h3>
                                    <p className="mt-1 text-sm text-gray-500">
                                        Товар вернётся на остаток текущей зоны «{getLocationName()}». Неоплаченная часть уменьшит долг, а уже оплаченная часть будет оформлена как возврат денег клиенту.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    disabled={isSavingReturn}
                                    onClick={() => setReturnSale(null)}
                                    className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
                                >
                                    <AiOutlineClose size={22} />
                                </button>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
                                <div className="space-y-3">
                                    {returnSale.items.map(item => (
                                        <div key={item.id} className="rounded-2xl border border-gray-200 p-4">
                                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-black text-gray-900">{item.name}</div>
                                                    <div className="mt-1 text-xs text-gray-500">
                                                        Выдано: {formatQuantity(item.quantity, item.unit)} · Уже возвращено: {formatQuantity(item.returnedQuantity, item.unit)}
                                                    </div>
                                                    <div className="mt-1 text-xs font-bold text-orange-700">
                                                        Можно вернуть: {formatQuantity(item.availableToReturn, item.unit)} · {formatMoney(item.sellingPrice)} за {item.unit === 'weight' ? 'кг' : 'шт.'}
                                                    </div>
                                                </div>

                                                <input
                                                    type="number"
                                                    min={item.unit === 'weight' ? '0.001' : '1'}
                                                    max={String(item.availableToReturn)}
                                                    step={item.unit === 'weight' ? '0.001' : '1'}
                                                    disabled={item.availableToReturn <= 0}
                                                    value={returnQuantities[String(item.id)] || ''}
                                                    onChange={event => setReturnQuantities(prev => ({
                                                        ...prev,
                                                        [String(item.id)]: event.target.value,
                                                    }))}
                                                    placeholder="0"
                                                    className="w-32 rounded-xl border border-gray-300 px-3 py-2 text-center text-lg font-black outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {selectedReturnRefundAmount > 0.009 && (
                                    <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4">
                                        <div className="text-xs font-black uppercase tracking-[0.12em] text-red-600">
                                            Денежный возврат клиенту
                                        </div>
                                        <div className="mt-1 text-2xl font-black text-red-800">
                                            {formatMoney(selectedReturnRefundAmount)}
                                        </div>
                                        <div className="mt-1 text-xs leading-5 text-red-700">
                                            Эта часть товара уже была оплачена. Выберите способ, которым фактически возвращаете деньги клиенту.
                                        </div>

                                        <div className="mt-3 grid grid-cols-3 gap-2">
                                            {(['cash', 'card', 'transfer'] as DebtPaymentMethod[]).map(method => (
                                                <button
                                                    key={method}
                                                    type="button"
                                                    disabled={isSavingReturn}
                                                    onClick={() => setReturnRefundMethod(method)}
                                                    className={`rounded-xl border px-3 py-2 text-sm font-black transition ${
                                                        returnRefundMethod === method
                                                            ? 'border-red-500 bg-red-600 text-white'
                                                            : 'border-red-200 bg-white text-red-800 hover:bg-red-100'
                                                    }`}
                                                >
                                                    {getPaymentMethodLabel(method)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <label className="mt-5 block">
                                    <span className="mb-1.5 block text-sm font-bold text-gray-700">Комментарий</span>
                                    <textarea
                                        value={returnComment}
                                        onChange={event => setReturnComment(event.target.value)}
                                        placeholder="Причина возврата"
                                        className="h-20 w-full resize-none rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                                    />
                                </label>
                            </div>

                            <div className="flex flex-col gap-3 border-t border-gray-100 bg-gray-50 p-5 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <div className="text-xs font-bold uppercase text-gray-400">Возврат товара</div>
                                    <div className="text-2xl font-black text-orange-700">{formatMoney(selectedReturnTotal)}</div>
                                    <div className="mt-1 text-xs text-gray-500">
                                        Долг уменьшится на {formatMoney(selectedReturnDebtReduction)}
                                        {selectedReturnRefundAmount > 0.009 ? ` · вернуть клиенту ${formatMoney(selectedReturnRefundAmount)}` : ''}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        disabled={isSavingReturn}
                                        onClick={() => setReturnSale(null)}
                                        className="rounded-xl border border-gray-300 bg-white px-5 py-3 font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                                    >
                                        Отмена
                                    </button>
                                    <button
                                        type="button"
                                        disabled={isSavingReturn || selectedReturnTotal <= 0}
                                        onClick={() => void saveDebtReturn()}
                                        className="rounded-xl bg-orange-600 px-5 py-3 font-black text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {isSavingReturn ? 'Возвращаю...' : 'Провести возврат'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    )
}

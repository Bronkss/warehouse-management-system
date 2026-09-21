'use client'

import * as React from 'react'
import System from '@/app/components/SystemShell'
import {
    AiOutlineClose,
    AiOutlineDelete,
    AiOutlineEdit,
    AiOutlinePrinter,
    AiOutlineReload,
    AiOutlineSearch,
} from 'react-icons/ai'

type CustomerListItem = {
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
    creditUsagePercent: number
    isActive: boolean
    comment: string
    debtSaleCount: number
    paymentCount: number
    returnCount: number
    overdueDebt: number
    hasOverdueDebt: boolean
    overdueDocumentCount: number
    dueTodayDebt: number
    dueSoonDebt: number
    noDueDateDebt: number
    nearestDueDate: string | null
    oldestOverdueDueDate: string | null
    daysUntilNearestDue: number | null
    daysOverdue: number
    lastActivityAt: string | null
}

type OverviewResponse = {
    summary: {
        customerCount: number
        customersWithDebt: number
        blockedCustomers: number
        overdueCustomers: number
        totalCreditLimit: number
        totalOutstanding: number
        overdueOutstanding: number
        dueTodayOutstanding: number
        dueSoonOutstanding: number
        noDueDateOutstanding: number
    }
    customers: CustomerListItem[]
    byLocation: Array<{
        id: number
        name: string
        slug: string
        outstanding: number
        overdue: number
        customers: number
        overdueCustomers: number
        documents: number
    }>
}

type DebtSaleItem = {
    id: number
    productId: number
    name: string
    unit: 'piece' | 'weight'
    quantity: number
    returnedQuantity: number
    availableToReturn: number
    purchasePrice: number
    sellingPrice: number
    total: number
}

type DebtSale = {
    id: number
    debtNumber: string
    status: string
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
    createdAt: string
    locationName: string
    locationSlug: string
    items: DebtSaleItem[]
}

type DebtPayment = {
    id: number
    paymentNumber: string
    paymentMethod: string
    amount: number
    comment: string
    createdAt: string
    locationName: string
}

type DebtReturn = {
    id: number
    returnNumber: string
    debtSaleId: number
    debtNumber: string
    total: number
    comment: string
    createdAt: string
    locationName: string
}

type DebtRefund = {
    id: number
    refundNumber: string
    debtReturnId: number
    returnNumber: string
    debtSaleId: number
    debtNumber: string
    paymentMethod: string
    amount: number
    reason: string
    createdAt: string
    locationName: string
}

type DebtEvent = {
    id: number
    eventType: string
    debtNumber?: string | null
    paymentNumber?: string | null
    returnNumber?: string | null
    refundNumber?: string | null
    amount?: number | null
    createdBy?: string | null
    createdByName?: string | null
    createdAt: string
    locationName?: string | null
}

type CustomerDetailResponse = {
    customer: {
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
        isActive: boolean
        comment: string
        createdAt: string
        updatedAt: string
    }
    sales: DebtSale[]
    payments: DebtPayment[]
    returns: DebtReturn[]
    refunds: DebtRefund[]
    events: DebtEvent[]
}

type ApiError = { message?: string }

function money(value: number): string {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(Math.round(value || 0))
}

function dateTime(value?: string | null): string {
    if (!value) return '—'
    return new Date(value).toLocaleString('ru-RU')
}

function dateOnly(value?: string | null): string {
    if (!value) return 'Не указан'

    const raw = String(value).slice(0, 10)
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)

    if (!match) return raw

    return `${match[3]}.${match[2]}.${match[1]}`
}

function paymentLabel(method: string): string {
    if (method === 'cash') return 'Наличные'
    if (method === 'card') return 'Карта'
    if (method === 'transfer') return 'Перевод'
    return method
}

function statusLabel(status: string): string {
    if (status === 'closed') return 'Закрыт'
    if (status === 'partially_paid') return 'Частично закрыт'
    if (status === 'cancelled') return 'Отменён'
    return 'Открыт'
}

function eventLabel(type: string): string {
    if (type === 'debt_sale_created') return 'Выдача в долг'
    if (type === 'debt_payment_created') return 'Погашение'
    if (type === 'debt_return_created') return 'Возврат товара'
    if (type === 'debt_refund_created') return 'Возврат денег клиенту'
    if (type === 'debt_sale_cancelled') return 'Сторно долгового документа'
    if (type === 'debt_due_date_updated_admin') return 'Изменён срок погашения'
    if (type.includes('customer_updated')) return 'Изменена карточка'
    if (type === 'customer_created') return 'Создана карточка'
    return type
}

async function jsonSafe<T>(response: Response): Promise<T | null> {
    try { return await response.json() as T } catch { return null }
}

function apiMessage(data: unknown, fallback: string): string {
    if (data && typeof data === 'object' && 'message' in data) {
        const message = (data as ApiError).message
        if (message) return message
    }
    return fallback
}

function esc(value: unknown): string {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
}

function Card({label, value, tone = 'default'}: {
    label: string
    value: React.ReactNode
    tone?: 'default' | 'red' | 'amber' | 'green' | 'violet' | 'blue'
}) {
    const toneClass = {
        default: 'border-gray-100 bg-white text-gray-900',
        red: 'border-red-100 bg-red-50 text-red-900',
        amber: 'border-amber-100 bg-amber-50 text-amber-900',
        green: 'border-emerald-100 bg-emerald-50 text-emerald-900',
        violet: 'border-violet-100 bg-violet-50 text-violet-900',
        blue: 'border-blue-100 bg-blue-50 text-blue-900',
    }[tone]

    return (
        <div className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
            <div className="text-xs font-black uppercase tracking-[0.12em] opacity-60">{label}</div>
            <div className="mt-2 text-2xl font-black">{value}</div>
        </div>
    )
}

export default function DebtsPage() {
    const [search, setSearch] = React.useState('')
    const [status, setStatus] = React.useState('debt')
    const [deadline, setDeadline] = React.useState('all')
    const [data, setData] = React.useState<OverviewResponse | null>(null)
    const [detail, setDetail] = React.useState<CustomerDetailResponse | null>(null)
    const [isLoading, setIsLoading] = React.useState(true)
    const [isDetailLoading, setIsDetailLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [isEditing, setIsEditing] = React.useState(false)
    const [isSaving, setIsSaving] = React.useState(false)
    const [cancelSale, setCancelSale] = React.useState<DebtSale | null>(null)
    const [cancelReason, setCancelReason] = React.useState('')
    const [isCancelling, setIsCancelling] = React.useState(false)
    const [dueDateDrafts, setDueDateDrafts] = React.useState<Record<string, string>>({})
    const [savingDueDateSaleId, setSavingDueDateSaleId] = React.useState<number | null>(null)
    const [form, setForm] = React.useState({
        firstName: '', lastName: '', middleName: '', phone: '', address: '',
        creditLimit: '', isActive: true, comment: '',
    })

    const loadOverview = React.useCallback(async () => {
        try {
            setIsLoading(true)
            setError(null)
            const params = new URLSearchParams({search, status, deadline})
            const response = await fetch(`/api/debts/admin/overview?${params}`, {
                cache: 'no-store', credentials: 'same-origin',
            })
            const payload = await jsonSafe<OverviewResponse | ApiError>(response)
            if (!response.ok) throw new Error(apiMessage(payload, 'Не удалось загрузить реестр долгов'))
            setData(payload as OverviewResponse)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Не удалось загрузить реестр долгов')
        } finally { setIsLoading(false) }
    }, [search, status, deadline])

    React.useEffect(() => {
        const id = window.setTimeout(() => void loadOverview(), 220)
        return () => window.clearTimeout(id)
    }, [loadOverview])

    const openCustomer = async (id: number) => {
        try {
            setIsDetailLoading(true)
            setError(null)
            const response = await fetch(`/api/debts/admin/customers/${id}`, {
                cache: 'no-store', credentials: 'same-origin',
            })
            const payload = await jsonSafe<CustomerDetailResponse | ApiError>(response)
            if (!response.ok) throw new Error(apiMessage(payload, 'Не удалось открыть карточку'))
            const next = payload as CustomerDetailResponse
            setDetail(next)
            setDueDateDrafts(
                Object.fromEntries(
                    next.sales.map(sale => [
                        String(sale.id),
                        sale.dueDate ? String(sale.dueDate).slice(0, 10) : '',
                    ])
                )
            )
            setForm({
                firstName: next.customer.firstName,
                lastName: next.customer.lastName,
                middleName: next.customer.middleName,
                phone: next.customer.phone,
                address: next.customer.address,
                creditLimit: String(next.customer.creditLimit),
                isActive: next.customer.isActive,
                comment: next.customer.comment,
            })
            setIsEditing(false)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Не удалось открыть карточку')
        } finally { setIsDetailLoading(false) }
    }

    const saveCustomer = async () => {
        if (!detail) return
        try {
            setIsSaving(true)
            const response = await fetch(`/api/debts/admin/customers/${detail.customer.id}`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'}, credentials: 'same-origin',
                body: JSON.stringify(form),
            })
            const payload = await jsonSafe<ApiError & {ok?: boolean}>(response)
            if (!response.ok) throw new Error(apiMessage(payload, 'Не удалось сохранить карточку'))
            await Promise.all([openCustomer(detail.customer.id), loadOverview()])
            setIsEditing(false)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Не удалось сохранить карточку')
        } finally { setIsSaving(false) }
    }

    const saveDueDate = async (sale: DebtSale) => {
        if (!detail) return

        try {
            setSavingDueDateSaleId(sale.id)
            setError(null)

            const response = await fetch(`/api/debts/admin/sales/${sale.id}/due-date`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'}, credentials: 'same-origin',
                body: JSON.stringify({
                    dueDate: dueDateDrafts[String(sale.id)] || null,
                }),
            })

            const payload = await jsonSafe<ApiError & {ok?: boolean}>(response)

            if (!response.ok) {
                throw new Error(apiMessage(payload, 'Не удалось изменить срок погашения'))
            }

            await Promise.all([
                openCustomer(detail.customer.id),
                loadOverview(),
            ])
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Не удалось изменить срок погашения')
        } finally {
            setSavingDueDateSaleId(null)
        }
    }

    const cancelDebtSale = async () => {
        if (!cancelSale || !detail) return
        try {
            setIsCancelling(true)
            const response = await fetch(`/api/debts/admin/sales/${cancelSale.id}/cancel`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'}, credentials: 'same-origin',
                body: JSON.stringify({reason: cancelReason}),
            })
            const payload = await jsonSafe<ApiError & {ok?: boolean}>(response)
            if (!response.ok) throw new Error(apiMessage(payload, 'Не удалось отменить документ'))
            setCancelSale(null)
            setCancelReason('')
            await Promise.all([openCustomer(detail.customer.id), loadOverview()])
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Не удалось отменить документ')
        } finally { setIsCancelling(false) }
    }

    const printRegistry = () => {
        if (!data) return

        const rows = data.customers
            .filter(customer => customer.currentDebt > 0.009)
            .map((customer, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td><b>${esc(customer.fullName)}</b><br>${esc(customer.phone)}</td>
                    <td>${esc(customer.address)}</td>
                    <td class="m">${money(customer.currentDebt)}</td>
                    <td class="m b">${money(customer.overdueDebt)}</td>
                    <td>${esc(dateOnly(customer.nearestDueDate))}</td>
                    <td>${customer.hasOverdueDebt ? `${customer.daysOverdue} дн.` : '—'}</td>
                </tr>
            `)
            .join('')

        const w = window.open('', '_blank', 'width=1100,height=850')

        if (!w) {
            setError('Браузер заблокировал окно печати')
            return
        }

        w.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Реестр долгов</title>
        <style>@page{size:A4 landscape;margin:10mm}body{font:11px Arial;color:#111}h1{font-size:22px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0}.c{border:1px solid #aaa;padding:8px}.c b{font-size:16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:6px}th{background:#eee}.m{text-align:right;white-space:nowrap}.b{font-weight:bold}</style></head><body>
        <h1>РЕЕСТР ЗАДОЛЖЕННОСТИ</h1><div>Сформирован: ${esc(new Date().toLocaleString('ru-RU'))}</div>
        <div class="grid"><div class="c">Общий долг<br><b>${money(data.summary.totalOutstanding)}</b></div><div class="c">Просрочено<br><b>${money(data.summary.overdueOutstanding)}</b></div><div class="c">Срок сегодня<br><b>${money(data.summary.dueTodayOutstanding)}</b></div><div class="c">Без срока<br><b>${money(data.summary.noDueDateOutstanding)}</b></div></div>
        <table><thead><tr><th>№</th><th>Клиент</th><th>Адрес</th><th>Долг</th><th>Просрочено</th><th>Ближайший срок</th><th>Просрочка</th></tr></thead><tbody>${rows || '<tr><td colspan="7">Открытых долгов нет</td></tr>'}</tbody></table>
        <script>onload=()=>setTimeout(()=>print(),150)</script></body></html>`)

        w.document.close()
    }

    return (
        <System>
            <section className="min-h-screen bg-gray-50 p-4">
                <div className="mx-auto max-w-[1800px] space-y-4">
                    <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div>
                                <div className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-amber-800">Главный склад</div>
                                <h1 className="mt-2 text-2xl font-black text-gray-900">Реестр долгов</h1>
                                <p className="mt-1 text-sm text-gray-500">Контроль всех должников, лимитов и реальных сроков погашения. Просрочка считается только по открытым документам с указанной датой.</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={printRegistry} disabled={!data} className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-black text-amber-900 disabled:opacity-50"><AiOutlinePrinter/>Реестр A4</button>
                                <button onClick={() => void loadOverview()} disabled={isLoading} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><AiOutlineReload className={isLoading ? 'animate-spin' : ''}/>Обновить</button>
                            </div>
                        </div>
                        <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_220px_220px]">
                            <div className="relative"><AiOutlineSearch className="absolute left-3 top-3.5 text-gray-400" size={20}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Имя, телефон или адрес..." className="h-12 w-full rounded-xl border border-gray-300 pl-10 pr-4 outline-none focus:ring-2 focus:ring-indigo-500"/></div>
                            <select value={status} onChange={e=>setStatus(e.target.value)} className="h-12 rounded-xl border border-gray-300 px-3"><option value="all">Все клиенты</option><option value="debt">Есть долг</option><option value="clear">Без долга</option><option value="limit">Лимит исчерпан</option><option value="blocked">Заблокированные</option></select>
                            <select value={deadline} onChange={e=>setDeadline(e.target.value)} className="h-12 rounded-xl border border-gray-300 px-3"><option value="all">Любой срок</option><option value="overdue">Просрочено</option><option value="today">Срок сегодня</option><option value="week">Срок в ближайшие 7 дней</option><option value="no-date">Срок не указан</option></select>
                        </div>
                        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
                    </div>

                    {data && <>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
                            <Card label="Общий долг" value={money(data.summary.totalOutstanding)} tone={data.summary.totalOutstanding > 0 ? 'red' : 'green'}/>
                            <Card label="Просрочено" value={money(data.summary.overdueOutstanding)} tone={data.summary.overdueOutstanding > 0 ? 'red' : 'green'}/>
                            <Card label="Срок сегодня" value={money(data.summary.dueTodayOutstanding)} tone="amber"/>
                            <Card label="До 7 дней" value={money(data.summary.dueSoonOutstanding)} tone="blue"/>
                            <Card label="Без срока" value={money(data.summary.noDueDateOutstanding)} tone="violet"/>
                            <Card label="Должников" value={data.summary.customersWithDebt} tone="amber"/>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {data.byLocation.map(l => <div key={l.slug} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><div className="text-xs font-black uppercase text-gray-400">Торговая точка</div><div className="mt-1 flex items-end justify-between gap-3"><div className="text-lg font-black">{l.name}</div><div className="text-xl font-black text-red-700">{money(l.outstanding)}</div></div><div className={`mt-2 text-sm font-black ${l.overdue > 0 ? 'text-red-700' : 'text-emerald-600'}`}>Просрочено: {money(l.overdue)}</div><div className="mt-1 text-xs text-gray-400">{l.customers} должников · {l.overdueCustomers} с просрочкой · {l.documents} документов</div></div>)}
                        </div>
                    </>}

                    <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
                        <div className="border-b border-gray-100 p-5"><h2 className="text-lg font-black">Клиенты</h2><div className="mt-1 text-xs text-gray-500">Найдено: {data?.customers.length || 0}</div></div>
                        <div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-sm"><thead className="bg-gray-50 text-gray-500"><tr><th className="p-3 text-left">Клиент</th><th className="p-3 text-left">Контакты</th><th className="p-3 text-right">Лимит</th><th className="p-3 text-right">Долг</th><th className="p-3 text-right">Просрочено</th><th className="p-3 text-center">Ближайший срок</th><th className="p-3 text-right">Доступно</th><th className="p-3 text-center">Статус</th></tr></thead>
                            <tbody>{(data?.customers || []).map(c => <tr key={c.id} onClick={()=>void openCustomer(c.id)} className={`cursor-pointer border-t border-gray-100 hover:bg-indigo-50 ${c.hasOverdueDebt ? 'bg-red-50/40' : ''}`}><td className="p-3"><div className="font-black">{c.fullName}</div><div className="mt-1 text-xs text-gray-400">Выдач {c.debtSaleCount} · оплат {c.paymentCount} · возвратов {c.returnCount}</div></td><td className="p-3"><div className="font-semibold">{c.phone}</div><div className="mt-1 max-w-[300px] truncate text-xs text-gray-400">{c.address}</div></td><td className="p-3 text-right">{money(c.creditLimit)}</td><td className="p-3 text-right text-lg font-black text-red-700">{money(c.currentDebt)}</td><td className="p-3 text-right"><div className={`font-black ${c.overdueDebt > 0 ? 'text-red-700' : 'text-gray-300'}`}>{money(c.overdueDebt)}</div>{c.hasOverdueDebt && <div className="mt-1 text-xs font-bold text-red-600">{c.overdueDocumentCount} док. · {c.daysOverdue} дн.</div>}</td><td className="p-3 text-center"><span className={`rounded-full px-2 py-1 text-xs font-black ${c.hasOverdueDebt ? 'bg-red-100 text-red-800' : c.nearestDueDate ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{dateOnly(c.nearestDueDate)}</span></td><td className="p-3 text-right font-semibold text-emerald-700">{money(c.availableCredit)}</td><td className="p-3 text-center"><span className={`rounded-full px-2 py-1 text-xs font-black ${c.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{c.isActive ? 'Активен' : 'Заблокирован'}</span></td></tr>)}</tbody></table></div>
                    </div>
                </div>
            </section>

            {(detail || isDetailLoading) && <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/60 p-3" onClick={()=>{setDetail(null);setIsEditing(false)}}><div className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={e=>e.stopPropagation()}>
                <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5"><div><div className="text-xs font-black uppercase tracking-[0.14em] text-amber-700">Карточка должника</div><h2 className="mt-1 text-2xl font-black">{detail?.customer.fullName || 'Загрузка...'}</h2>{detail && <div className="mt-1 text-sm text-gray-500">{detail.customer.phone} · {detail.customer.address}</div>}</div><div className="flex gap-2">{detail && <button onClick={()=>setIsEditing(v=>!v)} className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 font-black text-indigo-700"><AiOutlineEdit/>Изменить</button>}<button onClick={()=>{setDetail(null);setIsEditing(false)}} className="rounded-xl border border-gray-200 p-2"><AiOutlineClose size={20}/></button></div></div>
                <div className="min-h-0 flex-1 overflow-y-auto p-5">{isDetailLoading && !detail ? <div className="p-10 text-center text-gray-500">Загрузка...</div> : detail && <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><Card label="Лимит" value={money(detail.customer.creditLimit)}/><Card label="Текущий долг" value={money(detail.customer.currentDebt)} tone={detail.customer.currentDebt > 0 ? 'red' : 'green'}/><Card label="Доступно" value={money(detail.customer.availableCredit)} tone="green"/></div>
                    {isEditing && <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4"><div className="grid grid-cols-1 gap-3 md:grid-cols-3"><input value={form.lastName} onChange={e=>setForm(p=>({...p,lastName:e.target.value}))} placeholder="Фамилия" className="rounded-xl border p-3"/><input value={form.firstName} onChange={e=>setForm(p=>({...p,firstName:e.target.value}))} placeholder="Имя" className="rounded-xl border p-3"/><input value={form.middleName} onChange={e=>setForm(p=>({...p,middleName:e.target.value}))} placeholder="Отчество" className="rounded-xl border p-3"/><input value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} placeholder="Телефон" className="rounded-xl border p-3"/><input type="number" value={form.creditLimit} onChange={e=>setForm(p=>({...p,creditLimit:e.target.value}))} placeholder="Лимит" className="rounded-xl border p-3"/><input value={form.address} onChange={e=>setForm(p=>({...p,address:e.target.value}))} placeholder="Адрес" className="rounded-xl border p-3"/><textarea value={form.comment} onChange={e=>setForm(p=>({...p,comment:e.target.value}))} placeholder="Комментарий" className="min-h-24 rounded-xl border p-3 md:col-span-2"/><label className="flex items-center gap-2 rounded-xl border bg-white p-3 font-bold"><input type="checkbox" checked={form.isActive} onChange={e=>setForm(p=>({...p,isActive:e.target.checked}))}/>Разрешить новые долги</label></div><div className="mt-3 flex justify-end"><button disabled={isSaving} onClick={()=>void saveCustomer()} className="rounded-xl bg-indigo-600 px-5 py-2.5 font-black text-white disabled:opacity-50">{isSaving ? 'Сохраняю...' : 'Сохранить'}</button></div></div>}

                    <div className="rounded-2xl border border-gray-100"><div className="border-b p-4 font-black">Долговые документы</div><div className="space-y-3 p-3">{detail.sales.map(s => <div key={s.id} className={`rounded-2xl border p-4 ${s.status === 'cancelled' ? 'bg-gray-50 opacity-70' : 'bg-white'}`}><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><div className="font-black">{s.debtNumber} · {s.locationName}</div>{s.isOverdue && <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-black text-red-800">ПРОСРОЧЕНО {s.daysOverdue || 0} ДН.</span>}</div><div className="mt-1 text-xs text-gray-400">{dateTime(s.createdAt)} · {statusLabel(s.status)}</div><div className="mt-3 flex flex-wrap items-end gap-2"><div><label className="mb-1 block text-[11px] font-black uppercase text-gray-500">Погасить до</label><input type="date" disabled={s.status === 'cancelled' || s.remainingAmount <= 0.009} value={dueDateDrafts[String(s.id)] || ''} onChange={e=>setDueDateDrafts(p=>({...p,[String(s.id)]:e.target.value}))} className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-bold disabled:bg-gray-100"/></div><button disabled={savingDueDateSaleId === s.id || s.status === 'cancelled' || s.remainingAmount <= 0.009} onClick={()=>void saveDueDate(s)} className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-black text-white disabled:opacity-50">{savingDueDateSaleId === s.id ? 'Сохраняю...' : 'Сохранить срок'}</button>{!s.dueDate && s.remainingAmount > 0.009 && <span className="rounded-lg bg-violet-100 px-2.5 py-2 text-xs font-black text-violet-800">Срок не указан</span>}</div></div><div className="flex flex-wrap items-center gap-3 text-sm"><span>Сумма <b>{money(s.total)}</b></span><span className="text-emerald-700">Оплачено <b>{money(s.paidTotal)}</b></span><span className="text-violet-700">Возврат товара <b>{money(s.returnedTotal)}</b></span><span className="text-red-700">Возврат денег <b>{money(s.refundedTotal || 0)}</b></span><span className="text-red-800">Остаток <b>{money(s.remainingAmount)}</b></span></div></div>
                        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">{s.items.map(i=><div key={i.id} className="rounded-xl bg-gray-50 p-3"><div className="font-semibold">{i.name}</div><div className="mt-1 text-xs text-gray-500">{i.quantity} {i.unit==='weight'?'кг':'шт.'} × {money(i.sellingPrice)} = {money(i.total)}</div></div>)}</div>
                        {s.status !== 'cancelled' && s.paidTotal <= 0.009 && s.returnedTotal <= 0.009 && (s.refundedTotal || 0) <= 0.009 && <div className="mt-3 flex justify-end"><button onClick={()=>{setCancelSale(s);setCancelReason('')}} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-black text-red-700"><AiOutlineDelete/>Сторнировать ошибочный долг</button></div>}</div>)}</div></div>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                        <div className="rounded-2xl border border-emerald-100"><div className="border-b p-3 font-black">Погашения</div><div className="max-h-72 space-y-2 overflow-y-auto p-3">{detail.payments.map(p=><div key={p.id} className="rounded-xl bg-emerald-50 p-3"><div className="font-black">{p.paymentNumber}</div><div className="mt-1 text-xs text-gray-500">{dateTime(p.createdAt)} · {p.locationName} · {paymentLabel(p.paymentMethod)}</div><div className="mt-1 font-black text-emerald-800">{money(p.amount)}</div></div>)}</div></div>
                        <div className="rounded-2xl border border-violet-100"><div className="border-b p-3 font-black">Возвраты товара</div><div className="max-h-72 space-y-2 overflow-y-auto p-3">{detail.returns.map(r=><div key={r.id} className="rounded-xl bg-violet-50 p-3"><div className="font-black">{r.returnNumber}</div><div className="mt-1 text-xs text-gray-500">{dateTime(r.createdAt)} · {r.locationName}</div><div className="mt-1 font-black text-violet-800">{money(r.total)}</div></div>)}</div></div>
                        <div className="rounded-2xl border border-red-100"><div className="border-b p-3 font-black">Возвраты денег</div><div className="max-h-72 space-y-2 overflow-y-auto p-3">{detail.refunds.map(r=><div key={r.id} className="rounded-xl bg-red-50 p-3"><div className="font-black">{r.refundNumber}</div><div className="mt-1 text-xs text-gray-500">{dateTime(r.createdAt)} · {r.locationName} · {paymentLabel(r.paymentMethod)}</div><div className="mt-1 font-black text-red-800">-{money(r.amount)}</div></div>)}</div></div>
                    </div>
                    <div className="rounded-2xl border border-gray-100"><div className="border-b p-3 font-black">Журнал действий</div><div className="max-h-80 space-y-2 overflow-y-auto p-3">{detail.events.map(e=><div key={e.id} className="rounded-xl bg-gray-50 p-3"><div className="flex justify-between gap-3"><div><div className="font-black">{eventLabel(e.eventType)}</div><div className="mt-1 text-xs text-gray-500">{dateTime(e.createdAt)}{e.locationName ? ` · ${e.locationName}` : ''}{e.createdByName ? ` · ${e.createdByName}` : ''}</div></div>{typeof e.amount === 'number' && <div className="font-black">{money(e.amount)}</div>}</div></div>)}</div></div>
                </div>}</div>
            </div></div>}

            {cancelSale && <div className="fixed inset-0 z-[800] flex items-center justify-center bg-black/70 p-4" onClick={()=>setCancelSale(null)}><div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl" onClick={e=>e.stopPropagation()}><div className="text-xs font-black uppercase tracking-[0.14em] text-red-600">Сторно документа</div><h3 className="mt-1 text-xl font-black">{cancelSale.debtNumber}</h3><p className="mt-2 text-sm leading-6 text-gray-500">Используй сторно только если долг оформлен ошибочно и весь товар физически возвращён. Все позиции будут возвращены на остаток точки исходной выдачи. История документа сохранится.</p><textarea value={cancelReason} onChange={e=>setCancelReason(e.target.value)} placeholder="Причина сторно..." className="mt-4 h-28 w-full rounded-xl border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-red-500"/><div className="mt-4 flex justify-end gap-2"><button onClick={()=>setCancelSale(null)} disabled={isCancelling} className="rounded-xl border px-4 py-2.5 font-bold">Отмена</button><button onClick={()=>void cancelDebtSale()} disabled={isCancelling || cancelReason.trim().length < 3} className="rounded-xl bg-red-600 px-4 py-2.5 font-black text-white disabled:opacity-50">{isCancelling ? 'Сторнирую...' : 'Сторнировать'}</button></div></div></div>}
        </System>
    )
}

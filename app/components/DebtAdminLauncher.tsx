'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AiOutlineTeam } from 'react-icons/ai'

const AUTH_LOCATION_SLUG_KEY = 'warehouse_location_slug'
const AUTH_LOCATION_TYPE_KEY = 'warehouse_location_type'

function readStorageValue(key: string): string {
    if (typeof window === 'undefined') return ''
    return String(sessionStorage.getItem(key) || localStorage.getItem(key) || '').trim()
}

function isMainWarehouse(): boolean {
    const slug = readStorageValue(AUTH_LOCATION_SLUG_KEY)
    const type = readStorageValue(AUTH_LOCATION_TYPE_KEY)
    return slug === 'main-warehouse' || type === 'warehouse'
}

export default function DebtAdminLauncher() {
    const router = useRouter()
    const pathname = usePathname()
    const [canShow, setCanShow] = useState(false)

    useEffect(() => {
        const update = () => setCanShow(isMainWarehouse())
        update()
        const intervalId = window.setInterval(update, 1000)
        return () => window.clearInterval(intervalId)
    }, [])

    if (!canShow || pathname === '/auth' || pathname === '/online-kassa' || pathname === '/debts') {
        return null
    }

    return (
        <button
            type="button"
            onClick={() => router.push('/debts')}
            className="fixed bottom-5 right-5 z-[45] flex items-center gap-3 rounded-2xl border border-amber-200 bg-white/95 px-4 py-3 text-left shadow-2xl backdrop-blur transition hover:-translate-y-0.5 hover:bg-amber-50"
        >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                <AiOutlineTeam size={22}/>
            </div>

            <div>
                <div className="text-[11px] font-black uppercase tracking-[0.13em] text-amber-600">
                    Администрирование
                </div>
                <div className="mt-0.5 text-sm font-black text-gray-900">Долги</div>
            </div>
        </button>
    )
}

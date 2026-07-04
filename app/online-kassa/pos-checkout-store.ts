'use client'

import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

export type StoredProductSnapshot = {
    id: string | number
    name: string
    category?: string
    barcode?: string
    purchasePrice?: number | string
    purchase_price?: number | string
    sellingPrice?: number | string
    selling_price?: number | string
    unit?: 'piece' | 'weight' | string
    stock?: number | string
    minStock?: number | string
    min_stock?: number | string
    image?: string
    marked?: boolean | number | string | null
    isMarked?: boolean | number | string | null
    is_marked?: boolean | number | string | null
    marking?: boolean | number | string | null
    markedProduct?: boolean | number | string | null
}

export type StoredMarkingStatus = 'M+' | 'M-' | 'M'

export type StoredCheckoutItem = {
    product: StoredProductSnapshot
    id: string
    quantity: number
    markingCode?: string
    markingStatus?: StoredMarkingStatus
    markingMessage?: string
    markingCheckedAt?: string
}

export type HeldCheckout = {
    id: string
    title: string
    createdAt: string
    updatedAt: string
    items: StoredCheckoutItem[]
    total: number
}

type PosCheckoutStoreState = {
    currentItems: StoredCheckoutItem[]
    heldCheckouts: HeldCheckout[]
    setCurrentItems: (items: StoredCheckoutItem[]) => void
    clearCurrentItems: () => void
    holdCheckout: (items: StoredCheckoutItem[], total: number) => HeldCheckout | null
    removeHeldCheckout: (id: string) => void
    clearHeldCheckouts: () => void
}

const POS_CHECKOUT_STORE_KEY = 'warehouse.pos.checkout.state.v1'
const MAX_HELD_CHECKOUTS = 50

const noopStorage: StateStorage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
}

const normalizeMoney = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0
    }

    return Math.round((value + Number.EPSILON) * 100) / 100
}

const createHeldCheckoutId = (): string => {
    const now = new Date()
    const date = now.toISOString().slice(0, 10).replaceAll('-', '')
    const time = String(now.getTime()).slice(-6)

    return `held-${date}-${time}-${Math.random().toString(16).slice(2, 8)}`
}

const getCheckoutTitle = (items: StoredCheckoutItem[]): string => {
    const firstName = String(items[0]?.product?.name || '').trim()

    if (!firstName) {
        return 'Отложенный чек'
    }

    if (items.length === 1) {
        return firstName
    }

    return `${firstName} + ещё ${items.length - 1}`
}

const cloneCheckoutItems = (items: StoredCheckoutItem[]): StoredCheckoutItem[] => {
    return JSON.parse(JSON.stringify(items || [])) as StoredCheckoutItem[]
}

export const usePosCheckoutStore = create<PosCheckoutStoreState>()(
    persist(
        (set, get) => ({
            currentItems: [],
            heldCheckouts: [],

            setCurrentItems: items => {
                set({
                    currentItems: cloneCheckoutItems(items),
                })
            },

            clearCurrentItems: () => {
                set({ currentItems: [] })
            },

            holdCheckout: (items, total) => {
                const safeItems = cloneCheckoutItems(items).filter(item => {
                    return item?.product?.id !== undefined && item?.product?.id !== null && Number(item.quantity) > 0
                })

                if (safeItems.length === 0) {
                    return null
                }

                const now = new Date().toISOString()

                const heldCheckout: HeldCheckout = {
                    id: createHeldCheckoutId(),
                    title: getCheckoutTitle(safeItems),
                    createdAt: now,
                    updatedAt: now,
                    items: safeItems,
                    total: normalizeMoney(Number(total || 0)),
                }

                const existingHeldCheckouts = get().heldCheckouts || []

                set({
                    currentItems: [],
                    heldCheckouts: [heldCheckout, ...existingHeldCheckouts].slice(0, MAX_HELD_CHECKOUTS),
                })

                return heldCheckout
            },

            removeHeldCheckout: id => {
                set(state => ({
                    heldCheckouts: state.heldCheckouts.filter(item => item.id !== id),
                }))
            },

            clearHeldCheckouts: () => {
                set({ heldCheckouts: [] })
            },
        }),
        {
            name: POS_CHECKOUT_STORE_KEY,
            version: 1,
            storage: createJSONStorage(() => {
                if (typeof window === 'undefined') {
                    return noopStorage
                }

                return window.localStorage
            }),
            partialize: state => ({
                currentItems: state.currentItems,
                heldCheckouts: state.heldCheckouts,
            }),
        }
    )
)

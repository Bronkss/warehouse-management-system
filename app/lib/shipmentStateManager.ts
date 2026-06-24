'use client'

import { createStore } from 'zustand/vanilla'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { del, get, set } from 'idb-keyval'

export const SHIPMENT_PAGE_DRAFT_KEY = 'warehouse.shipment.page.draft.v1'
export const SHIPMENT_MODAL_DRAFT_KEY = 'warehouse.shipment.modal.draft.v1'

const SHIPMENT_ZUSTAND_STORE_NAME = 'warehouse.shipment.zustand.indexeddb.v1'
const STORAGE_VERSION = 1

type StoredPayload<T> = {
    version: number
    savedAt: string
    data: T
}

type ShipmentDraftStoreState = {
    drafts: Record<string, StoredPayload<unknown> | undefined>
    setDraftValue: <T>(key: string, data: T) => void
    clearDraftValue: (key: string) => void
    clearAllDrafts: () => void
}

const indexedDbStorage: StateStorage = {
    getItem: async (name: string) => {
        if (typeof window === 'undefined') return null

        const value = await get<string>(name)
        return value ?? null
    },
    setItem: async (name: string, value: string) => {
        if (typeof window === 'undefined') return

        await set(name, value)
    },
    removeItem: async (name: string) => {
        if (typeof window === 'undefined') return

        await del(name)
    },
}

export const shipmentDraftStore = createStore<ShipmentDraftStoreState>()(
    persist(
        (set) => ({
            drafts: {},
            setDraftValue: <T,>(key: string, data: T) => {
                set((state) => ({
                    drafts: {
                        ...state.drafts,
                        [key]: {
                            version: STORAGE_VERSION,
                            savedAt: new Date().toISOString(),
                            data,
                        },
                    },
                }))
            },
            clearDraftValue: (key: string) => {
                set((state) => {
                    const nextDrafts = { ...state.drafts }
                    delete nextDrafts[key]

                    return { drafts: nextDrafts }
                })
            },
            clearAllDrafts: () => {
                set({ drafts: {} })
            },
        }),
        {
            name: SHIPMENT_ZUSTAND_STORE_NAME,
            version: STORAGE_VERSION,
            storage: createJSONStorage(() => indexedDbStorage),
            skipHydration: true,
            migrate: (persistedState) => {
                if (
                    typeof persistedState === 'object' &&
                    persistedState !== null &&
                    'drafts' in persistedState
                ) {
                    return persistedState as ShipmentDraftStoreState
                }

                return {
                    drafts: {},
                    setDraftValue: () => undefined,
                    clearDraftValue: () => undefined,
                    clearAllDrafts: () => undefined,
                }
            },
            partialize: (state) => ({ drafts: state.drafts }),
        }
    )
)

let hydratePromise: Promise<void> | null = null

export function hydrateShipmentDraftStore(): Promise<void> {
    if (typeof window === 'undefined') {
        return Promise.resolve()
    }

    if (hydratePromise) {
        return hydratePromise
    }

    try {
        const rehydrateResult = shipmentDraftStore.persist.rehydrate()

        hydratePromise = Promise.resolve(rehydrateResult)
            .then(() => undefined)
            .catch((error) => {
                hydratePromise = null
                console.warn(
                    'Не удалось восстановить Zustand/IndexedDB черновики отгрузки',
                    error
                )
            })

        return hydratePromise
    } catch (error) {
        hydratePromise = null
        console.warn(
            'Не удалось запустить восстановление Zustand/IndexedDB черновиков отгрузки',
            error
        )

        return Promise.resolve()
    }
}

export async function readShipmentState<T>(key: string): Promise<T | null> {
    await hydrateShipmentDraftStore()

    try {
        const payload = shipmentDraftStore.getState().drafts[key] as StoredPayload<T> | undefined

        if (!payload || typeof payload !== 'object' || !('data' in payload)) {
            return null
        }

        return payload.data
    } catch (error) {
        console.warn(`Не удалось прочитать Zustand/IndexedDB черновик отгрузки: ${key}`, error)
        return null
    }
}

export function writeShipmentState<T>(key: string, data: T) {
    try {
        shipmentDraftStore.getState().setDraftValue(key, data)
    } catch (error) {
        console.warn(`Не удалось сохранить Zustand/IndexedDB черновик отгрузки: ${key}`, error)
    }
}

export function clearShipmentState(key: string) {
    try {
        shipmentDraftStore.getState().clearDraftValue(key)
    } catch (error) {
        console.warn(`Не удалось очистить Zustand/IndexedDB черновик отгрузки: ${key}`, error)
    }
}

export function clearAllShipmentDrafts() {
    try {
        shipmentDraftStore.getState().clearAllDrafts()
    } catch (error) {
        console.warn('Не удалось очистить Zustand/IndexedDB черновики отгрузки', error)
    }
}
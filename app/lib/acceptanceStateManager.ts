'use client'

import { createStore } from 'zustand/vanilla'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { del, get, set } from 'idb-keyval'

export const ACCEPTANCE_PAGE_DRAFT_KEY = 'warehouse.acceptance.page.draft.v2'
export const ACCEPTANCE_MODAL_DRAFT_KEY = 'warehouse.acceptance.modal.draft.v2'
export const MANUAL_ACCEPTANCE_MOVEMENT_DRAFT_KEY = 'warehouse.movement.acceptance.draft.v2'
export const SHIPMENT_MOVEMENT_DRAFT_KEY = 'warehouse.movement.shipment.draft.v2'

const ACCEPTANCE_ZUSTAND_STORE_NAME = 'warehouse.acceptance.zustand.indexeddb.v1'
const STORAGE_VERSION = 2

type StoredPayload<T> = {
    version: number
    savedAt: string
    data: T
}

type AcceptanceDraftStoreState = {
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

export const acceptanceDraftStore = createStore<AcceptanceDraftStoreState>()(
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
            name: ACCEPTANCE_ZUSTAND_STORE_NAME,
            version: STORAGE_VERSION,
            storage: createJSONStorage(() => indexedDbStorage),
            skipHydration: true,
            migrate: (persistedState) => {
                if (
                    typeof persistedState === 'object' &&
                    persistedState !== null &&
                    'drafts' in persistedState
                ) {
                    return persistedState as AcceptanceDraftStoreState
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

export function hydrateAcceptanceDraftStore() {
    if (typeof window === 'undefined') {
        return Promise.resolve()
    }

    if (!hydratePromise) {
        hydratePromise = acceptanceDraftStore.persist
            .rehydrate()
            .then(() => undefined)
            .catch((error) => {
                hydratePromise = null
                console.warn('Не удалось восстановить Zustand/IndexedDB черновики приёмки', error)
            })
    }

    return hydratePromise
}

export async function readPersistentState<T>(key: string): Promise<T | null> {
    await hydrateAcceptanceDraftStore()

    try {
        const payload = acceptanceDraftStore.getState().drafts[key] as StoredPayload<T> | undefined

        if (!payload || typeof payload !== 'object' || !('data' in payload)) {
            return null
        }

        return payload.data
    } catch (error) {
        console.warn(`Не удалось прочитать Zustand/IndexedDB черновик: ${key}`, error)
        return null
    }
}

export function writePersistentState<T>(key: string, data: T) {
    try {
        acceptanceDraftStore.getState().setDraftValue(key, data)
    } catch (error) {
        console.warn(`Не удалось сохранить Zustand/IndexedDB черновик: ${key}`, error)
    }
}

export function clearPersistentState(key: string) {
    try {
        acceptanceDraftStore.getState().clearDraftValue(key)
    } catch (error) {
        console.warn(`Не удалось очистить Zustand/IndexedDB черновик: ${key}`, error)
    }
}

export function clearAllAcceptanceDrafts() {
    try {
        acceptanceDraftStore.getState().clearAllDrafts()
    } catch (error) {
        console.warn('Не удалось очистить Zustand/IndexedDB черновики приёмки', error)
    }
}

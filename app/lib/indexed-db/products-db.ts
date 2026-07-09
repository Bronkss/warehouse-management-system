import type { Product } from '@/app/types/product'

const DB_NAME_PREFIX = 'warehouse-db-v2'
const DB_VERSION = 1

const PRODUCTS_STORE = 'products'
const META_STORE = 'meta'

const DEFAULT_LOCATION_SLUG = 'tochka'
const AUTH_LOCATION_SLUG_KEY = 'warehouse_location_slug'

type MetaRecord = {
    key: string
    value: unknown
}

function getCurrentLocationSlug(): string {
    if (typeof window === 'undefined') {
        return DEFAULT_LOCATION_SLUG
    }

    const raw =
        localStorage.getItem(AUTH_LOCATION_SLUG_KEY) ||
        sessionStorage.getItem(AUTH_LOCATION_SLUG_KEY) ||
        DEFAULT_LOCATION_SLUG

    return raw.trim().toLowerCase() || DEFAULT_LOCATION_SLUG
}

function getDbName(): string {
    return `${DB_NAME_PREFIX}:${getCurrentLocationSlug()}`
}

function openWarehouseDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined') {
            reject(new Error('IndexedDB доступен только в браузере'))
            return
        }

        if (!window.indexedDB) {
            reject(new Error('Браузер не поддерживает IndexedDB'))
            return
        }

        const request = window.indexedDB.open(getDbName(), DB_VERSION)

        request.onupgradeneeded = () => {
            const db = request.result

            if (!db.objectStoreNames.contains(PRODUCTS_STORE)) {
                const productsStore = db.createObjectStore(PRODUCTS_STORE, {
                    keyPath: 'id',
                })

                productsStore.createIndex('barcode', 'barcode', {
                    unique: false,
                })

                productsStore.createIndex('name', 'name', {
                    unique: false,
                })

                productsStore.createIndex('category', 'category', {
                    unique: false,
                })
            }

            if (!db.objectStoreNames.contains(META_STORE)) {
                db.createObjectStore(META_STORE, {
                    keyPath: 'key',
                })
            }
        }

        request.onsuccess = () => {
            resolve(request.result)
        }

        request.onerror = () => {
            reject(request.error)
        }
    })
}

export async function saveProductsToIndexedDb(products: Product[]): Promise<void> {
    if (products.length === 0) {
        return
    }

    const db = await openWarehouseDb()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([PRODUCTS_STORE, META_STORE], 'readwrite')
        const productsStore = transaction.objectStore(PRODUCTS_STORE)
        const metaStore = transaction.objectStore(META_STORE)

        for (const product of products) {
            productsStore.put(product)
        }

        const metaRecord: MetaRecord = {
            key: 'products:lastSavedAt',
            value: Date.now(),
        }

        metaStore.put(metaRecord)

        transaction.oncomplete = () => {
            db.close()
            resolve()
        }

        transaction.onerror = () => {
            db.close()
            reject(transaction.error)
        }
    })
}

export async function saveProductToIndexedDb(product: Product): Promise<void> {
    await saveProductsToIndexedDb([product])
}

export async function deleteProductFromIndexedDb(productId: number): Promise<void> {
    const db = await openWarehouseDb()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([PRODUCTS_STORE, META_STORE], 'readwrite')
        const productsStore = transaction.objectStore(PRODUCTS_STORE)
        const metaStore = transaction.objectStore(META_STORE)

        productsStore.delete(productId)

        const metaRecord: MetaRecord = {
            key: 'products:lastDeletedAt',
            value: Date.now(),
        }

        metaStore.put(metaRecord)

        transaction.oncomplete = () => {
            db.close()
            resolve()
        }

        transaction.onerror = () => {
            db.close()
            reject(transaction.error)
        }
    })
}

export async function getProductsFromIndexedDb(limit = 20): Promise<Product[]> {
    const db = await openWarehouseDb()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(PRODUCTS_STORE, 'readonly')
        const store = transaction.objectStore(PRODUCTS_STORE)

        const products: Product[] = []
        const request = store.openCursor(null, 'prev')

        request.onsuccess = () => {
            const cursor = request.result

            if (!cursor || products.length >= limit) {
                db.close()
                resolve(products)
                return
            }

            products.push(cursor.value as Product)
            cursor.continue()
        }

        request.onerror = () => {
            db.close()
            reject(request.error)
        }
    })
}

export async function getAllProductsFromIndexedDb(): Promise<Product[]> {
    const db = await openWarehouseDb()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(PRODUCTS_STORE, 'readonly')
        const store = transaction.objectStore(PRODUCTS_STORE)

        const products: Product[] = []
        const request = store.openCursor(null, 'prev')

        request.onsuccess = () => {
            const cursor = request.result

            if (!cursor) {
                db.close()
                resolve(products)
                return
            }

            products.push(cursor.value as Product)
            cursor.continue()
        }

        request.onerror = () => {
            db.close()
            reject(request.error)
        }
    })
}

export async function searchProductsInIndexedDb(
    search: string,
    limit = 50
): Promise<Product[]> {
    const query = search.trim().toLowerCase()

    if (!query) {
        return getProductsFromIndexedDb(limit)
    }

    const products = await getAllProductsFromIndexedDb()

    return products
        .filter(product => {
            return (
                product.name.toLowerCase().includes(query) ||
                product.barcode.toLowerCase().includes(query) ||
                product.category.toLowerCase().includes(query)
            )
        })
        .slice(0, limit)
}

export async function deleteProductsNotInIndexedDbIds(
    validProductIds: Set<number>
): Promise<void> {
    const db = await openWarehouseDb()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(PRODUCTS_STORE, 'readwrite')
        const store = transaction.objectStore(PRODUCTS_STORE)
        const request = store.openCursor()

        request.onsuccess = () => {
            const cursor = request.result

            if (!cursor) {
                return
            }

            const productId = Number(cursor.key)

            if (!validProductIds.has(productId)) {
                cursor.delete()
            }

            cursor.continue()
        }

        request.onerror = () => {
            db.close()
            reject(request.error)
        }

        transaction.oncomplete = () => {
            db.close()
            resolve()
        }

        transaction.onerror = () => {
            db.close()
            reject(transaction.error)
        }
    })
}

export async function clearProductsIndexedDb(): Promise<void> {
    const db = await openWarehouseDb()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([PRODUCTS_STORE, META_STORE], 'readwrite')
        const productsStore = transaction.objectStore(PRODUCTS_STORE)
        const metaStore = transaction.objectStore(META_STORE)

        productsStore.clear()
        metaStore.put({
            key: 'products:lastClearedAt',
            value: Date.now(),
        } satisfies MetaRecord)

        transaction.oncomplete = () => {
            db.close()
            resolve()
        }

        transaction.onerror = () => {
            db.close()
            reject(transaction.error)
        }
    })
}

export async function setIndexedDbMeta(key: string, value: unknown): Promise<void> {
    const db = await openWarehouseDb()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(META_STORE, 'readwrite')
        const store = transaction.objectStore(META_STORE)

        store.put({
            key,
            value,
        } satisfies MetaRecord)

        transaction.oncomplete = () => {
            db.close()
            resolve()
        }

        transaction.onerror = () => {
            db.close()
            reject(transaction.error)
        }
    })
}

export async function getIndexedDbMeta<TValue = unknown>(
    key: string
): Promise<TValue | null> {
    const db = await openWarehouseDb()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(META_STORE, 'readonly')
        const store = transaction.objectStore(META_STORE)
        const request = store.get(key)

        request.onsuccess = () => {
            db.close()
            const record = request.result as MetaRecord | undefined
            resolve(record ? (record.value as TValue) : null)
        }

        request.onerror = () => {
            db.close()
            reject(request.error)
        }
    })
}

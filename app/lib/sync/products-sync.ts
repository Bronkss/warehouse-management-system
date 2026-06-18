import type { Product } from '@/app/types/product'
import {
    deleteProductsNotInIndexedDbIds,
    saveProductsToIndexedDb,
    setIndexedDbMeta,
} from '@/app/lib/indexed-db/products-db'

interface ProductsApiResponse {
    items: Product[]
    nextCursor: number | null
    hasMore: boolean
    limit: number
    durationMs?: number
}

interface ProductsApiError {
    message?: string
}

interface FetchProductsPageParams {
    limit: number
    cursor?: number | null
    signal?: AbortSignal
}

interface SyncProductsOptions {
    pageSize?: number
    signal?: AbortSignal
    onProgress?: (data: {
        loaded: number
        page: number
        lastCursor: number | null
        finished: boolean
    }) => void
}

interface SyncProductsResult {
    loaded: number
    pages: number
}

let activeSyncPromise: Promise<SyncProductsResult> | null = null

async function fetchProductsPage({
                                     limit,
                                     cursor = null,
                                     signal,
                                 }: FetchProductsPageParams): Promise<ProductsApiResponse> {
    const params = new URLSearchParams()
    params.set('limit', String(limit))

    if (cursor) {
        params.set('cursor', String(cursor))
    }

    const response = await fetch(`/api/products?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
        signal,
    })

    const data = (await response.json()) as ProductsApiResponse | ProductsApiError

    if (!response.ok) {
        throw new Error(
            'message' in data && data.message
                ? data.message
                : 'Не удалось загрузить товары для IndexedDB'
        )
    }

    return data as ProductsApiResponse
}

export function syncAllProductsToIndexedDb(
    options: SyncProductsOptions = {}
): Promise<SyncProductsResult> {
    if (activeSyncPromise) {
        return activeSyncPromise
    }

    activeSyncPromise = runProductsSync(options).finally(() => {
        activeSyncPromise = null
    })

    return activeSyncPromise
}

async function runProductsSync({
                                   pageSize = 100,
                                   signal,
                                   onProgress,
                               }: SyncProductsOptions): Promise<SyncProductsResult> {
    let cursor: number | null = null
    let loaded = 0
    let page = 0
    const syncedProductIds = new Set<number>()

    await setIndexedDbMeta('products:fullSyncStartedAt', Date.now())

    while (true) {
        if (signal?.aborted) {
            throw new DOMException('Синхронизация IndexedDB отменена', 'AbortError')
        }

        const response = await fetchProductsPage({
            limit: pageSize,
            cursor,
            signal,
        })

        page += 1

        await saveProductsToIndexedDb(response.items)

        for (const product of response.items) {
            syncedProductIds.add(product.id)
        }

        loaded += response.items.length

        onProgress?.({
            loaded,
            page,
            lastCursor: response.nextCursor,
            finished: !response.hasMore,
        })

        if (!response.hasMore || !response.nextCursor) {
            break
        }

        cursor = response.nextCursor
    }

    await deleteProductsNotInIndexedDbIds(syncedProductIds)

    await setIndexedDbMeta('products:fullSyncCompletedAt', Date.now())
    await setIndexedDbMeta('products:fullSyncLoadedCount', loaded)

    return {
        loaded,
        pages: page,
    }
}

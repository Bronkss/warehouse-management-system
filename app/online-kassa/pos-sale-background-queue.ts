'use client'

export type PosBackgroundJobStatus =
    | 'pending'
    | 'processing'
    | 'failed'

export type PosBackgroundSaleJob<TReceipt = unknown> = {
    id: string
    receipt: TReceipt
    shouldFiscalize: boolean
    locationSlug: string

    status: PosBackgroundJobStatus
    attempts: number

    createdAt: string
    updatedAt: string
    lastAttemptAt: string | null

    error: string | null
}

const DB_NAME =
    'warehouse.pos.background.sales.v1'

const DB_VERSION =
    1

const STORE_NAME =
    'jobs'

let dbPromise:
    Promise<IDBDatabase> |
    null = null

function openDb():
    Promise<IDBDatabase> {
    if (
        typeof window ===
        'undefined'
    ) {
        return Promise.reject(
            new Error(
                'IndexedDB доступен только в браузере'
            )
        )
    }

    if (dbPromise) {
        return dbPromise
    }

    dbPromise =
        new Promise(
            (
                resolve,
                reject
            ) => {
                const request =
                    window.indexedDB.open(
                        DB_NAME,
                        DB_VERSION
                    )

                request.onupgradeneeded =
                    () => {
                        const db =
                            request.result

                        if (
                            !db.objectStoreNames.contains(
                                STORE_NAME
                            )
                        ) {
                            const store =
                                db.createObjectStore(
                                    STORE_NAME,
                                    {
                                        keyPath:
                                            'id',
                                    }
                                )

                            store.createIndex(
                                'status',
                                'status',
                                {
                                    unique:
                                        false,
                                }
                            )

                            store.createIndex(
                                'createdAt',
                                'createdAt',
                                {
                                    unique:
                                        false,
                                }
                            )
                        }
                    }

                request.onsuccess =
                    () => {
                        const db =
                            request.result

                        db.onversionchange =
                            () => {
                                db.close()
                                dbPromise =
                                    null
                            }

                        resolve(
                            db
                        )
                    }

                request.onerror =
                    () => {
                        dbPromise =
                            null

                        reject(
                            request.error ||
                            new Error(
                                'Не удалось открыть локальную очередь POS'
                            )
                        )
                    }
            }
        )

    return dbPromise
}

async function withStore<T>(
    mode:
        IDBTransactionMode,
    handler:
        (
            store:
                IDBObjectStore
        ) => IDBRequest<T>
): Promise<T> {
    const db =
        await openDb()

    return new Promise<T>(
        (
            resolve,
            reject
        ) => {
            const transaction =
                db.transaction(
                    STORE_NAME,
                    mode
                )

            const store =
                transaction.objectStore(
                    STORE_NAME
                )

            const request =
                handler(
                    store
                )

            request.onsuccess =
                () => {
                    resolve(
                        request.result
                    )
                }

            request.onerror =
                () => {
                    reject(
                        request.error ||
                        new Error(
                            'Ошибка локальной очереди POS'
                        )
                    )
                }

            transaction.onerror =
                () => {
                    reject(
                        transaction.error ||
                        new Error(
                            'Ошибка транзакции локальной очереди POS'
                        )
                    )
                }
        }
    )
}

export async function putPosBackgroundJob<TReceipt>(
    job:
        PosBackgroundSaleJob<TReceipt>
): Promise<void> {
    await withStore(
        'readwrite',
        store =>
            store.put(
                job
            )
    )
}

export async function getPosBackgroundJob<TReceipt>(
    id:
        string
): Promise<
    PosBackgroundSaleJob<TReceipt> |
    null
> {
    const value =
        await withStore<
            PosBackgroundSaleJob<TReceipt> |
            undefined
        >(
            'readonly',
            store =>
                store.get(
                    id
                )
        )

    return value ||
        null
}

export async function getAllPosBackgroundJobs<TReceipt>():
    Promise<
        PosBackgroundSaleJob<TReceipt>[]
    > {
    const values =
        await withStore<
            PosBackgroundSaleJob<TReceipt>[]
        >(
            'readonly',
            store =>
                store.getAll()
        )

    return (
        values ||
        []
    ).sort(
        (
            a,
            b
        ) =>
            a.createdAt.localeCompare(
                b.createdAt
            )
    )
}

export async function deletePosBackgroundJob(
    id:
        string
): Promise<void> {
    await withStore(
        'readwrite',
        store =>
            store.delete(
                id
            )
    )
}

export async function enqueuePosBackgroundSale<TReceipt>(
    input: {
        id: string
        receipt: TReceipt
        shouldFiscalize: boolean
        locationSlug: string
    }
): Promise<
    PosBackgroundSaleJob<TReceipt>
> {
    const existing =
        await getPosBackgroundJob<TReceipt>(
            input.id
        )

    if (existing) {
        return existing
    }

    const now =
        new Date().toISOString()

    const job:
        PosBackgroundSaleJob<TReceipt> = {
        id:
        input.id,

        receipt:
        input.receipt,

        shouldFiscalize:
        input.shouldFiscalize,

        locationSlug:
        input.locationSlug,

        status:
            'pending',

        attempts:
            0,

        createdAt:
        now,

        updatedAt:
        now,

        lastAttemptAt:
            null,

        error:
            null,
    }

    await putPosBackgroundJob(
        job
    )

    return job
}

export async function markPosBackgroundJobProcessing<TReceipt>(
    job:
        PosBackgroundSaleJob<TReceipt>
): Promise<
    PosBackgroundSaleJob<TReceipt>
> {
    const now =
        new Date().toISOString()

    const next = {
        ...job,

        status:
            'processing' as const,

        attempts:
            Number(
                job.attempts ||
                0
            ) + 1,

        updatedAt:
        now,

        lastAttemptAt:
        now,

        error:
            null,
    }

    await putPosBackgroundJob(
        next
    )

    return next
}

export async function markPosBackgroundJobFailed<TReceipt>(
    job:
        PosBackgroundSaleJob<TReceipt>,
    error:
        string
): Promise<
    PosBackgroundSaleJob<TReceipt>
> {
    const next = {
        ...job,

        status:
            'failed' as const,

        updatedAt:
            new Date().toISOString(),

        error:
            String(
                error ||
                'Неизвестная ошибка'
            ),
    }

    await putPosBackgroundJob(
        next
    )

    return next
}

export async function resetInterruptedPosJobs<TReceipt>():
    Promise<void> {
    const jobs =
        await getAllPosBackgroundJobs<TReceipt>()

    for (
        const job
        of jobs
        ) {
        if (
            job.status !==
            'processing'
        ) {
            continue
        }

        await putPosBackgroundJob(
            {
                ...job,

                status:
                    'pending',

                updatedAt:
                    new Date().toISOString(),

                error:
                    'POS был перезапущен во время фоновой отправки. Задача поставлена на повтор.',
            }
        )
    }
}


export async function retryPosBackgroundJob<TReceipt>(
    id:
        string
): Promise<
    PosBackgroundSaleJob<TReceipt> |
    null
> {
    const job =
        await getPosBackgroundJob<TReceipt>(
            id
        )

    if (!job) {
        return null
    }

    const next = {
        ...job,

        status:
            'pending' as const,

        updatedAt:
            new Date().toISOString(),

        error:
            null,
    }

    await putPosBackgroundJob(
        next
    )

    return next
}

'use client';

import AtolAgentSetup from '@/app/components/AtolAgentSetup';
import JsBarcode from 'jsbarcode';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AiOutlineDelete,
    AiOutlinePlus,
    AiOutlineMinus,
    AiOutlineScan,
    AiOutlineSearch,
    AiOutlinePrinter,
} from 'react-icons/ai';
import {
    getBarcodeDisplay,
    getPrimaryBarcode,
    hasBarcodeSearchMatch,
    hasExactBarcode,
} from '../utils/barcodes';

type ProductId = string | number;

type Product = {
    id: ProductId;
    name: string;
    category?: string;
    barcode?: string;
    purchasePrice?: number | string;
    purchase_price?: number | string;
    sellingPrice?: number | string;
    selling_price?: number | string;
    unit?: 'piece' | 'weight' | string;
    stock?: number | string;
    minStock?: number | string;
    min_stock?: number | string;
    image?: string;
};

type ProductsApiResponse = {
    items: Product[];
    nextCursor: number | null;
    hasMore: boolean;
    limit: number;
    durationMs?: number;
};

type CheckoutItem = {
    product: Product;
    id: string;
    quantity: number;
};

type PaymentMethod = 'card' | 'cash' | 'transfer';

type ReceiptItem = {
    productId: ProductId;
    name: string;
    barcode?: string;
    category?: string;
    unit?: string;
    quantity: number;
    price: number;
    total: number;
};

type FiscalParams = {
    fiscalDocumentDateTime?: string;
    fiscalDocumentNumber?: number;
    fiscalDocumentSign?: string;
    fiscalReceiptNumber?: number;
    fnNumber?: string;
    fnsUrl?: string;
    registrationNumber?: string;
    shiftNumber?: number;
    total?: number;
};

type FiscalResult = {
    uuid: string;
    fiscalParams?: FiscalParams;
    raw?: unknown;
};

type Receipt = {
    id: string;
    createdAt: string;
    paymentMethod: PaymentMethod;
    paymentLabel: string;
    items: ReceiptItem[];
    total: number;
    receivedAmount?: number;
    change?: number;

    fiscalizationRequested?: boolean;
    fiscalStatus?: 'success' | 'skipped' | 'failed';
    fiscalUuid?: string;
    fiscalParams?: FiscalParams;
    fiscalRaw?: unknown;
};

type ApiError = {
    message?: string;
};

type PrintMode = 'selected' | 'filtered' | 'all';

const PRODUCTS_PAGE_LIMIT = 100;
const SEARCH_LIMIT = 30;

const AUTH_USER_KEY = 'warehouse_auth_user';
const AUTH_LOGIN_KEY = 'warehouse_auth_login';
const REMEMBER_ME_KEY = 'warehouse_remember_me';

const DEFAULT_FISCAL_AGENT_URL = 'http://127.0.0.1:3107';
const FISCAL_AGENT_URL_KEY = 'pos_fiscal_agent_url';
const FISCAL_AGENT_TOKEN_KEY = 'pos_fiscal_agent_token';
const SHIFT_STATUS_KEY = 'pos_kkt_shift_status';

type ShiftStatus = 'unknown' | 'open' | 'closed';

const safeParseNumber = (value: unknown): number => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === 'string') {
        const parsed = parseFloat(value.replace(',', '.').replace(/\s/g, ''));
        return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
};

const getSellingPrice = (product: Product): number => {
    return safeParseNumber(product.sellingPrice ?? product.selling_price);
};

const getPurchasePrice = (product: Product): number => {
    return safeParseNumber(product.purchasePrice ?? product.purchase_price);
};

const getStock = (product: Product): number => {
    return safeParseNumber(product.stock);
};

const getMinStock = (product: Product): number => {
    return safeParseNumber(product.minStock ?? product.min_stock);
};

const normalizeProduct = (product: Product): Product => {
    return {
        ...product,
        sellingPrice: getSellingPrice(product),
        purchasePrice: getPurchasePrice(product),
        stock: getStock(product),
        minStock: getMinStock(product),
        unit: product.unit || 'piece',
        category: product.category || 'Другое',
        barcode: product.barcode || '',
        image: product.image || '',
    };
};

const normalizeProductsApiResponse = (data: unknown): ProductsApiResponse => {
    if (Array.isArray(data)) {
        return {
            items: data,
            nextCursor: null,
            hasMore: false,
            limit: data.length,
        };
    }

    if (
        typeof data === 'object' &&
        data !== null &&
        'items' in data &&
        Array.isArray((data as ProductsApiResponse).items)
    ) {
        const response = data as ProductsApiResponse;

        return {
            items: response.items,
            nextCursor: response.nextCursor ?? null,
            hasMore: Boolean(response.hasMore),
            limit: Number(response.limit || response.items.length),
            durationMs: response.durationMs,
        };
    }

    return {
        items: [],
        nextCursor: null,
        hasMore: false,
        limit: 0,
    };
};

const formatCurrency = (amount: number | undefined | null): string => {
    const safeAmount = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;

    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(safeAmount);
};

const isWeightProduct = (product: Product): boolean => {
    return product.unit === 'weight';
};

const roundQuantity = (value: number): number => {
    return Math.round(value * 1000) / 1000;
};

const formatQuantity = (quantity: number, unit?: string): string => {
    if (unit === 'weight') {
        return `${quantity.toFixed(3).replace(/\.?0+$/, '')} кг`;
    }

    return `${quantity} шт.`;
};

const getUnitPriceLabel = (product: Product): string => {
    return product.unit === 'weight' ? 'за 1 кг' : 'за 1 шт.';
};

const escapeHtml = (value: unknown): string => {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
};

const calculateTotal = (items: CheckoutItem[]): number => {
    return items.reduce((sum, item) => {
        return sum + getSellingPrice(item.product) * item.quantity;
    }, 0);
};

const createReceiptId = (): string => {
    const date = new Date();
    const datePart = date.toISOString().slice(0, 10).replaceAll('-', '');
    const timePart = String(date.getTime()).slice(-6);

    return `${datePart}-${timePart}`;
};

const readJsonSafe = async <T,>(response: Response): Promise<T | null> => {
    try {
        return await response.json() as T;
    } catch {
        return null;
    }
};

const getPaymentLabel = (method: PaymentMethod): string => {
    if (method === 'card') {
        return 'Карта';
    }

    if (method === 'transfer') {
        return 'Перевод';
    }

    return 'Наличные';
};

const getFiscalAgentUrl = (): string => {
    if (typeof window === 'undefined') {
        return DEFAULT_FISCAL_AGENT_URL;
    }

    return localStorage.getItem(FISCAL_AGENT_URL_KEY) || DEFAULT_FISCAL_AGENT_URL;
};

const getFiscalAgentToken = (): string => {
    if (typeof window === 'undefined') {
        return '';
    }

    return localStorage.getItem(FISCAL_AGENT_TOKEN_KEY) || '';
};

const callFiscalAgent = async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${getFiscalAgentUrl()}${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            'X-POS-Agent-Token': getFiscalAgentToken(),
            ...(init?.headers || {}),
        },
        cache: 'no-store',
    });

    const data = await readJsonSafe<T & ApiError>(response);

    if (!response.ok) {
        throw new Error(data?.message || 'Локальный агент ККТ недоступен');
    }

    return data as T;
};

const fiscalizeReceipt = async (receipt: Receipt): Promise<FiscalResult> => {
    const data = await callFiscalAgent<{
        ok?: boolean;
        fiscal?: FiscalResult;
        message?: string;
    }>('/fiscal/sell', {
        method: 'POST',
        body: JSON.stringify(receipt),
    });

    if (!data?.fiscal) {
        throw new Error(data?.message || 'ККТ не фискализировала чек');
    }

    return data.fiscal;
};

const fetchProductsPage = async ({
                                     search,
                                     cursor,
                                     limit = PRODUCTS_PAGE_LIMIT,
                                     signal,
                                 }: {
    search?: string;
    cursor?: number | null;
    limit?: number;
    signal?: AbortSignal;
}): Promise<ProductsApiResponse> => {
    const params = new URLSearchParams();

    params.set('limit', String(limit));

    if (search) {
        params.set('search', search);
    }

    if (cursor) {
        params.set('cursor', String(cursor));
    }

    const response = await fetch(`/api/products?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
        signal,
    });

    const data = await readJsonSafe<ProductsApiResponse | Product[] | ApiError>(response);

    if (!response.ok) {
        throw new Error(
            data && typeof data === 'object' && 'message' in data && data.message
                ? data.message
                : 'Не удалось загрузить товары'
        );
    }

    return normalizeProductsApiResponse(data);
};

const searchProducts = async (query: string, signal?: AbortSignal): Promise<Product[]> => {
    const page = await fetchProductsPage({
        search: query,
        limit: SEARCH_LIMIT,
        signal,
    });

    return page.items.map(normalizeProduct);
};

const fetchAllProducts = async (): Promise<Product[]> => {
    const allProducts: Product[] = [];

    let nextCursor: number | null = null;
    let hasMore = true;
    let safetyCounter = 0;

    while (hasMore && safetyCounter < 300) {
        const page = await fetchProductsPage({
            cursor: nextCursor,
            limit: PRODUCTS_PAGE_LIMIT,
        });

        allProducts.push(...page.items.map(normalizeProduct));

        nextCursor = page.nextCursor;
        hasMore = Boolean(page.hasMore && nextCursor);

        safetyCounter += 1;
    }

    return allProducts;
};

export default function PosPage() {
    const router = useRouter();

    const [isAuthChecked, setIsAuthChecked] = useState(false);
    const [shiftStatus, setShiftStatus] = useState<ShiftStatus>('unknown');
    const [isShiftActionLoading, setIsShiftActionLoading] = useState(false);
    const [fiscalConfirmModal, setFiscalConfirmModal] = useState(false);

    const [checkoutItems, setCheckoutItems] = useState<CheckoutItem[]>([]);
    const [allProducts, setAllProducts] = useState<Product[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [foundProducts, setFoundProducts] = useState<Product[]>([]);

    const [isLoading, setIsLoading] = useState(false);
    const [isSearchLoading, setIsSearchLoading] = useState(false);
    const [isPaying, setIsPaying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const [paymentModal, setPaymentModal] = useState<PaymentMethod | null>(null);
    const [cashReceived, setCashReceived] = useState('');
    const [lastReceipt, setLastReceipt] = useState<Receipt | null>(null);

    const [weightModalProduct, setWeightModalProduct] = useState<Product | null>(null);
    const [weightQuantity, setWeightQuantity] = useState('');

    const [isPriceLabelModalOpen, setIsPriceLabelModalOpen] = useState(false);
    const [priceLabelSearch, setPriceLabelSearch] = useState('');
    const [selectedPriceLabelIds, setSelectedPriceLabelIds] = useState<string[]>([]);
    const [isRefreshingLabels, setIsRefreshingLabels] = useState(false);

    const [isAtolSetupOpen, setIsAtolSetupOpen] = useState(false);

    const searchInputRef = useRef<HTMLInputElement>(null);

    const total = calculateTotal(checkoutItems);
    const cashReceivedNumber = safeParseNumber(cashReceived);
    const change = cashReceivedNumber - total;
    const isShiftOpen = shiftStatus === 'open';

    const priceLabelProducts = useMemo(() => {
        const query = priceLabelSearch.trim().toLowerCase();

        if (!query) {
            return allProducts;
        }

        return allProducts.filter(product => {
            return (
                product.name.toLowerCase().includes(query) ||
                hasBarcodeSearchMatch(product.barcode, query) ||
                String(getSellingPrice(product)).includes(query)
            );
        });
    }, [allProducts, priceLabelSearch]);

    const refreshProducts = async (): Promise<Product[]> => {
        const products = await fetchAllProducts();

        setAllProducts(products);

        return products;
    };

    useEffect(() => {
        const savedLocalUser = localStorage.getItem(AUTH_USER_KEY);
        const savedSessionUser = sessionStorage.getItem(AUTH_USER_KEY);

        if (savedLocalUser !== 'admin' && savedSessionUser !== 'admin') {
            router.replace('/auth');
            return;
        }

        const savedShiftStatus = localStorage.getItem(SHIFT_STATUS_KEY);

        if (savedShiftStatus === 'open' || savedShiftStatus === 'closed') {
            setShiftStatus(savedShiftStatus);
        } else {
            setShiftStatus('closed');
            localStorage.setItem(SHIFT_STATUS_KEY, 'closed');
        }

        setIsAuthChecked(true);
    }, [router]);

    useEffect(() => {
        if (paymentModal !== 'cash') {
            return;
        }

        const handleEnterPayment = (event: globalThis.KeyboardEvent) => {
            if (event.key !== 'Enter' || isPaying) {
                return;
            }

            event.preventDefault();
            completePayment('cash', false);
        };

        window.addEventListener('keydown', handleEnterPayment);

        return () => {
            window.removeEventListener('keydown', handleEnterPayment);
        };
    }, [paymentModal, isPaying, cashReceivedNumber, total, checkoutItems, shiftStatus]);

    useEffect(() => {
        const query = searchQuery.trim();

        if (query.length < 2) {
            setFoundProducts([]);
            setIsSearchLoading(false);
            return;
        }

        const controller = new AbortController();

        const timeoutId = setTimeout(async () => {
            try {
                setIsSearchLoading(true);
                setError(null);

                const products = await searchProducts(query, controller.signal);

                setFoundProducts(products);
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') {
                    return;
                }

                console.error(err);
                setFoundProducts([]);
                setError(err instanceof Error ? err.message : 'Ошибка поиска товара');
            } finally {
                if (!controller.signal.aborted) {
                    setIsSearchLoading(false);
                }
            }
        }, 220);

        return () => {
            clearTimeout(timeoutId);
            controller.abort();
        };
    }, [searchQuery]);

    useEffect(() => {
        const handleEscape = (event: globalThis.KeyboardEvent) => {
            if (event.key !== 'Escape') {
                return;
            }

            setPaymentModal(null);
            setFiscalConfirmModal(false);
            setWeightModalProduct(null);
            setIsPriceLabelModalOpen(false);
            setLastReceipt(null);
        };

        window.addEventListener('keydown', handleEscape);

        return () => {
            window.removeEventListener('keydown', handleEscape);
        };
    }, []);

    const createSaleInDb = async (receipt: Receipt): Promise<Receipt> => {
        const response = await fetch('/api/sales', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(receipt),
        });

        const data = await readJsonSafe<Receipt & ApiError>(response);

        if (!response.ok) {
            throw new Error(data?.message || 'Не удалось сохранить чек');
        }

        return data || receipt;
    };

    const handleLogout = () => {
        localStorage.removeItem(AUTH_USER_KEY);
        localStorage.removeItem(AUTH_LOGIN_KEY);
        localStorage.removeItem(REMEMBER_ME_KEY);
        sessionStorage.removeItem(AUTH_USER_KEY);
        router.replace('/auth');
    };

    const checkFiscalAgent = async () => {
        try {
            setIsShiftActionLoading(true);
            setError(null);
            setNotice(null);

            await callFiscalAgent('/health');

            setNotice('Связь с локальным агентом ККТ есть');
        } catch (err) {
            console.error(err);
            setNotice(null);
            setError(err instanceof Error ? err.message : 'Не удалось проверить ККТ');
        } finally {
            setIsShiftActionLoading(false);
        }
    };

    const openShift = async () => {
        try {
            setIsShiftActionLoading(true);
            setError(null);
            setNotice(null);

            await callFiscalAgent('/service/open-shift', {
                method: 'POST',
            });

            setShiftStatus('open');
            localStorage.setItem(SHIFT_STATUS_KEY, 'open');
            setNotice('Смена ККТ открыта');
        } catch (err) {
            console.error(err);
            setNotice(null);
            setError(err instanceof Error ? err.message : 'Не удалось открыть смену');
        } finally {
            setIsShiftActionLoading(false);
            requestAnimationFrame(() => {
                searchInputRef.current?.focus();
            });
        }
    };

    const closeShift = async () => {
        try {
            setIsShiftActionLoading(true);
            setError(null);
            setNotice(null);

            await callFiscalAgent('/service/close-shift', {
                method: 'POST',
            });

            setShiftStatus('closed');
            localStorage.setItem(SHIFT_STATUS_KEY, 'closed');
            setNotice('Смена ККТ закрыта');
        } catch (err) {
            console.error(err);
            setNotice(null);
            setError(err instanceof Error ? err.message : 'Не удалось закрыть смену');
        } finally {
            setIsShiftActionLoading(false);
            requestAnimationFrame(() => {
                searchInputRef.current?.focus();
            });
        }
    };

    const updateLocalStockAfterSale = (items: ReceiptItem[]) => {
        setAllProducts(prevProducts =>
            prevProducts.map(product => {
                const receiptItem = items.find(item =>
                    String(item.productId) === String(product.id)
                );

                if (!receiptItem) {
                    return product;
                }

                return {
                    ...product,
                    stock: Math.max(0, getStock(product) - receiptItem.quantity),
                };
            })
        );
    };

    const addQuantityToCheckout = (product: Product, quantity: number) => {
        const safeProduct = normalizeProduct(product);
        const stock = getStock(safeProduct);
        const safeQuantity = isWeightProduct(safeProduct)
            ? roundQuantity(quantity)
            : Math.floor(quantity);

        if (safeQuantity <= 0) {
            setError('Введите корректное количество товара');
            return;
        }

        if (stock <= 0) {
            setError(`Товар «${safeProduct.name}» отсутствует на остатке`);
            return;
        }

        setCheckoutItems(prevItems => {
            const existingItem = prevItems.find(item =>
                String(item.product.id) === String(safeProduct.id)
            );

            const currentQuantity = existingItem?.quantity || 0;
            const nextQuantity = roundQuantity(currentQuantity + safeQuantity);

            if (nextQuantity > stock) {
                setError(
                    `Недостаточно остатка: «${safeProduct.name}». В наличии ${formatQuantity(stock, safeProduct.unit)}`
                );
                return prevItems;
            }

            setError(null);

            if (existingItem) {
                return prevItems.map(item =>
                    String(item.product.id) === String(safeProduct.id)
                        ? { ...item, quantity: nextQuantity }
                        : item
                );
            }

            return [
                ...prevItems,
                {
                    product: safeProduct,
                    id: `${safeProduct.id}-${Date.now()}`,
                    quantity: safeQuantity,
                },
            ];
        });

        setSearchQuery('');
        setFoundProducts([]);

        requestAnimationFrame(() => {
            searchInputRef.current?.focus();
        });
    };

    const addToCheckout = (product: Product) => {
        const safeProduct = normalizeProduct(product);

        if (isWeightProduct(safeProduct)) {
            setWeightModalProduct(safeProduct);
            setWeightQuantity('');
            setError(null);
            return;
        }

        addQuantityToCheckout(safeProduct, 1);
    };

    const changeQuantity = (itemId: string, delta: number) => {
        setCheckoutItems(prevItems => {
            return prevItems.map(item => {
                if (item.id !== itemId) {
                    return item;
                }

                const nextQuantity = item.quantity + delta;
                const stock = getStock(item.product);

                if (nextQuantity <= 0) {
                    return item;
                }

                if (nextQuantity > stock) {
                    setError(
                        `Недостаточно остатка: «${item.product.name}». В наличии ${formatQuantity(stock, item.product.unit)}`
                    );
                    return item;
                }

                setError(null);

                return {
                    ...item,
                    quantity: nextQuantity,
                };
            });
        });
    };

    const setItemQuantity = (itemId: string, rawValue: string) => {
        const parsed = safeParseNumber(rawValue);

        setCheckoutItems(prevItems => {
            return prevItems.map(item => {
                if (item.id !== itemId) {
                    return item;
                }

                const stock = getStock(item.product);
                const isWeight = item.product.unit === 'weight';

                const nextQuantity = isWeight
                    ? roundQuantity(parsed)
                    : Math.floor(parsed);

                if (nextQuantity <= 0) {
                    setError('Количество должно быть больше нуля');
                    return item;
                }

                if (nextQuantity > stock) {
                    setError(
                        `Недостаточно остатка: «${item.product.name}». В наличии ${formatQuantity(stock, item.product.unit)}`
                    );
                    return item;
                }

                setError(null);

                return {
                    ...item,
                    quantity: nextQuantity,
                };
            });
        });
    };

    const removeFromCheckout = (itemId: string) => {
        setCheckoutItems(prev => prev.filter(item => item.id !== itemId));
    };

    const handleKeyDown = async (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter') {
            return;
        }

        e.preventDefault();

        const query = searchQuery.trim();

        if (!query) {
            return;
        }

        try {
            setIsSearchLoading(true);
            setError(null);

            let products = foundProducts;

            const exactFromCurrentResults = products.find(product =>
                hasExactBarcode(product.barcode, query)
            );

            if (exactFromCurrentResults) {
                addToCheckout(exactFromCurrentResults);
                return;
            }

            products = await searchProducts(query);

            setFoundProducts(products);

            const exactBarcodeProduct = products.find(product =>
                hasExactBarcode(product.barcode, query)
            );

            if (exactBarcodeProduct) {
                addToCheckout(exactBarcodeProduct);
                return;
            }

            if (products.length === 1) {
                addToCheckout(products[0]);
                return;
            }

            if (products.length > 1) {
                setError('Найдено несколько товаров. Выберите нужный из списка');
                return;
            }

            setError('Товар не найден в базе');
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Ошибка поиска товара');
        } finally {
            setIsSearchLoading(false);
        }
    };

    const openPayment = (method: PaymentMethod) => {
        if (!isShiftOpen) {
            setError('Смена ККТ закрыта. Откройте смену перед продажей.');
            return;
        }

        if (checkoutItems.length === 0) {
            setError('Чек пустой. Добавьте товар перед оплатой');
            return;
        }

        const stockError = checkoutItems.find(item => {
            return item.quantity > getStock(item.product);
        });

        if (stockError) {
            setError(
                `Недостаточно остатка: «${stockError.product.name}». В наличии ${formatQuantity(getStock(stockError.product), stockError.product.unit)}`
            );
            return;
        }

        setError(null);
        setCashReceived('');
        setPaymentModal(method);
    };

    const completePayment = async (method: PaymentMethod, shouldFiscalize = false) => {
        if (isPaying) {
            return;
        }

        if (!isShiftOpen) {
            setError('Смена ККТ закрыта. Откройте смену перед продажей.');
            return;
        }

        if (method === 'cash' && cashReceivedNumber < total) {
            setError('Полученная сумма меньше суммы чека');
            return;
        }

        try {
            setIsPaying(true);
            setError(null);

            const freshProducts = await refreshProducts();

            const validatedItems = checkoutItems.map(item => {
                const freshProduct = freshProducts.find(product =>
                    String(product.id) === String(item.product.id)
                );

                if (!freshProduct) {
                    throw new Error(`Товар «${item.product.name}» не найден в базе`);
                }

                const freshStock = getStock(freshProduct);

                if (freshStock < item.quantity) {
                    throw new Error(
                        `Недостаточно остатка: «${freshProduct.name}». В наличии ${formatQuantity(freshStock, freshProduct.unit)}, в чеке ${formatQuantity(item.quantity, freshProduct.unit)}`
                    );
                }

                return {
                    ...item,
                    product: freshProduct,
                };
            });

            const receiptItems: ReceiptItem[] = validatedItems.map(item => {
                const price = getSellingPrice(item.product);

                return {
                    productId: item.product.id,
                    name: item.product.name,
                    barcode: item.product.barcode,
                    category: item.product.category,
                    unit: item.product.unit,
                    quantity: item.quantity,
                    price,
                    total: price * item.quantity,
                };
            });

            const receiptTotal = receiptItems.reduce((sum, item) => sum + item.total, 0);

            const shouldRunFiscalization = method === 'card' && shouldFiscalize;

            const receipt: Receipt = {
                id: createReceiptId(),
                createdAt: new Date().toISOString(),
                paymentMethod: method,
                paymentLabel: getPaymentLabel(method),
                items: receiptItems,
                total: receiptTotal,
                receivedAmount: method === 'cash' ? cashReceivedNumber : receiptTotal,
                change: method === 'cash' ? cashReceivedNumber - receiptTotal : 0,
                fiscalizationRequested: shouldRunFiscalization,
                fiscalStatus: shouldRunFiscalization ? undefined : 'skipped',
            };

            let receiptForSave: Receipt = receipt;

            if (shouldRunFiscalization) {
                const fiscal = await fiscalizeReceipt(receipt);

                receiptForSave = {
                    ...receipt,
                    fiscalStatus: 'success',
                    fiscalUuid: fiscal.uuid,
                    fiscalParams: fiscal.fiscalParams,
                    fiscalRaw: fiscal.raw,
                };
            }

            const savedReceipt = await createSaleInDb(receiptForSave);

            updateLocalStockAfterSale(receiptItems);

            setCheckoutItems([]);
            setPaymentModal(null);
            setCashReceived('');
            setLastReceipt(savedReceipt);

            requestAnimationFrame(() => {
                searchInputRef.current?.focus();
            });
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Ошибка оплаты');
        } finally {
            setIsPaying(false);
        }
    };

    const clearReceipt = () => {
        setLastReceipt(null);
        setError(null);

        requestAnimationFrame(() => {
            searchInputRef.current?.focus();
        });
    };

    const openPriceLabelModal = async () => {
        try {
            setIsRefreshingLabels(true);
            setError(null);

            await refreshProducts();

            setIsPriceLabelModalOpen(true);
            setPriceLabelSearch('');
        } catch (err) {
            console.error(err);
            setError('Не удалось обновить товары для печати ценников');
        } finally {
            setIsRefreshingLabels(false);
        }
    };

    const togglePriceLabelProduct = (productId: ProductId) => {
        const id = String(productId);

        setSelectedPriceLabelIds(prev => {
            if (prev.includes(id)) {
                return prev.filter(item => item !== id);
            }

            return [...prev, id];
        });
    };

    const selectAllFilteredPriceLabels = () => {
        setSelectedPriceLabelIds(priceLabelProducts.map(product => String(product.id)));
    };

    const clearSelectedPriceLabels = () => {
        setSelectedPriceLabelIds([]);
    };

    const renderBarcodeSvgFromDbValue = (barcodeFromDb: string): string => {
        const barcode = String(barcodeFromDb || '').trim();

        if (!barcode) {
            return '';
        }

        try {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

            JsBarcode(svg, barcode, {
                format: 'CODE128',
                width: 1.2,
                height: 34,
                displayValue: true,
                fontSize: 9,
                margin: 0,
            });

            return new XMLSerializer().serializeToString(svg);
        } catch (err) {
            console.error(err);
            return '';
        }
    };

    const buildPriceLabelsHtml = (products: Product[]): string => {
        const chunkProducts = (items: Product[], size: number): Product[][] => {
            const chunks: Product[][] = [];

            for (let i = 0; i < items.length; i += size) {
                chunks.push(items.slice(i, i + size));
            }

            return chunks;
        };

        const sheets = chunkProducts(products, 28).map(sheetProducts => {
            const labels = sheetProducts.map(product => {
                const name = escapeHtml(product.name);
                const price = Math.ceil(getSellingPrice(product));
                const unitLabel = escapeHtml(getUnitPriceLabel(product));

                const barcodeFromDb = String(product.barcode || '').trim();
                const barcodeSvg = renderBarcodeSvgFromDbValue(barcodeFromDb);

                return `
                <section class="label">
                    <div class="label-name">${name}</div>

                    <div class="label-price">
                        ${price} ₽
                        <span>${unitLabel}</span>
                    </div>

                    <div class="label-barcode">
                        ${barcodeSvg ? barcodeSvg : '<div class="no-barcode">Штрихкод не задан в БД</div>'}
                    </div>
                </section>
            `;
            }).join('');

            return `
            <main class="sheet">
                ${labels}
            </main>
        `;
        }).join('');

        return `
        <!doctype html>
        <html lang="ru">
            <head>
                <meta charset="utf-8" />
                <title>Печать ценников</title>

                <style>
                    @page {
                        size: A4 portrait;
                        margin: 5mm;
                    }

                    * {
                        box-sizing: border-box;
                    }

                    html,
                    body {
                        margin: 0;
                        padding: 0;
                        background: #ffffff;
                        font-family: Arial, sans-serif;
                    }

                    .sheet {
                        width: 200mm;
                        height: 280mm;
                        display: grid;
                        grid-template-columns: repeat(4, 50mm);
                        grid-template-rows: repeat(7, 40mm);
                        page-break-after: always;
                        break-after: page;
                    }

                    .sheet:last-child {
                        page-break-after: auto;
                        break-after: auto;
                    }

                    .label {
                        width: 50mm;
                        height: 40mm;
                        padding: 2.5mm;
                        display: flex;
                        flex-direction: column;
                        justify-content: space-between;
                        overflow: hidden;
                        border: 0.45mm solid #111827;
                        background: #ffffff;
                        break-inside: avoid;
                        page-break-inside: avoid;
                    }

                    .label-name {
                        height: 9mm;
                        overflow: hidden;
                        font-size: 10px;
                        line-height: 1.15;
                        font-weight: 700;
                        text-align: center;
                        color: #111827;
                    }

                    .label-price {
                        text-align: center;
                        font-size: 24px;
                        line-height: 1;
                        font-weight: 900;
                        color: #000000;
                    }

                    .label-price span {
                        display: block;
                        margin-top: 1.5mm;
                        font-size: 10px;
                        line-height: 1;
                        font-weight: 600;
                    }

                    .label-barcode {
                        width: 100%;
                        height: 11mm;
                        display: flex;
                        align-items: flex-end;
                        justify-content: center;
                    }

                    .label-barcode svg {
                        width: 42mm;
                        height: 11mm;
                    }

                    .no-barcode {
                        width: 100%;
                        padding: 1.5mm;
                        border: 0.35mm dashed #111827;
                        font-size: 9px;
                        color: #374151;
                        text-align: center;
                    }

                    @media print {
                        html,
                        body {
                            width: 210mm;
                            min-height: 297mm;
                        }

                        .sheet {
                            page-break-after: always;
                            break-after: page;
                        }

                        .sheet:last-child {
                            page-break-after: auto;
                            break-after: auto;
                        }
                    }
                </style>
            </head>

            <body>
                ${sheets}

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
    `;
    };

    const printPriceLabels = async (mode: PrintMode) => {
        try {
            setIsRefreshingLabels(true);
            setError(null);

            const freshProducts = await refreshProducts();

            const query = priceLabelSearch.trim().toLowerCase();

            const freshFilteredProducts = query
                ? freshProducts.filter(product => {
                    return (
                        product.name.toLowerCase().includes(query) ||
                        hasBarcodeSearchMatch(product.barcode, query) ||
                        String(getSellingPrice(product)).includes(query)
                    );
                })
                : freshProducts;

            const products =
                mode === 'selected'
                    ? freshProducts.filter(product =>
                        selectedPriceLabelIds.includes(String(product.id))
                    )
                    : mode === 'filtered'
                        ? freshFilteredProducts
                        : freshProducts;

            if (products.length === 0) {
                setError('Нет товаров для печати ценников');
                return;
            }

            const printWindow = window.open('', '_blank', 'width=900,height=700');

            if (!printWindow) {
                setError('Браузер заблокировал окно печати. Разрешите всплывающие окна.');
                return;
            }

            printWindow.document.open();
            printWindow.document.write(buildPriceLabelsHtml(products));
            printWindow.document.close();
        } catch (err) {
            console.error(err);
            setError('Не удалось сформировать ценники');
        } finally {
            setIsRefreshingLabels(false);
        }
    };

    if (!isAuthChecked) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6 flex items-center justify-center text-gray-500">
                Проверка авторизации...
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
            <div className="max-w-5xl mx-auto">
                <h1 className="text-3xl font-bold text-indigo-800 mb-6 text-center">
                    ТОЧКА онлайн - касса
                </h1>

                <div className="mb-6 rounded-2xl bg-white p-4 shadow-lg">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="text-sm text-gray-500">Смена ККТ:</span>

                            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${
                                isShiftOpen
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-red-100 text-red-700'
                            }`}>
                                {isShiftOpen ? 'Открыта' : 'Закрыта'}
                            </span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={openShift}
                                disabled={isShiftActionLoading || isShiftOpen}
                                className="rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                                Открыть смену
                            </button>

                            <button
                                type="button"
                                onClick={closeShift}
                                disabled={isShiftActionLoading || !isShiftOpen}
                                className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
                            >
                                Закрыть смену
                            </button>

                            <button
                                type="button"
                                onClick={checkFiscalAgent}
                                disabled={isShiftActionLoading}
                                className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
                            >
                                Проверить ККТ
                            </button>

                            <button
                                type="button"
                                onClick={() => setIsAtolSetupOpen(true)}
                                className="rounded-xl border border-gray-300 px-5 py-3 hover:bg-gray-50"
                            >
                                Настройка ККТ
                            </button>

                            <button
                                type="button"
                                onClick={handleLogout}
                                className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50"
                            >
                                Выйти
                            </button>
                        </div>
                    </div>

                    <div className="mt-3 text-xs text-gray-500">
                        Продажа доступна только при открытой смене. Фискализация выполняется только для оплаты картой и только после подтверждения кассира.
                    </div>
                </div>

                {error && (
                    <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                        {error}
                    </div>
                )}

                {notice && (
                    <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
                        {notice}
                    </div>
                )}

                <div className="bg-white rounded-2xl shadow-xl overflow-hidden mb-8">
                    <div className="p-6 border-b border-gray-200">
                        <div className="grid grid-cols-1 gap-3 mb-4">
                            <div className="relative">
                                <div className="absolute left-3 top-3 text-gray-400">
                                    <AiOutlineScan size={25} />
                                </div>

                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    placeholder="Скан штрихкода или поиск товара..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    autoFocus
                                    className="w-full pl-10 pr-10 py-3 rounded-full border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                />

                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSearchQuery('');
                                            setFoundProducts([]);
                                            setError(null);
                                        }}
                                        className="absolute right-4 top-1.5 text-2xl text-gray-400 hover:text-gray-600"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            <AiOutlineSearch />
                            <span>
                                Enter добавляет товар. Для весового товара откроется окно ввода веса.
                            </span>
                        </div>

                        {isSearchLoading && (
                            <div className="mt-3 text-sm text-indigo-600">
                                Идёт поиск товара...
                            </div>
                        )}

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <button
                                type="button"
                                onClick={openPriceLabelModal}
                                disabled={isRefreshingLabels}
                                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-white hover:bg-slate-800 disabled:opacity-50"
                            >
                                <AiOutlinePrinter size={20} />
                                {isRefreshingLabels ? 'Обновляю цены...' : 'Печать ценников 40×50'}
                            </button>

                            <div className="text-xs text-gray-500">
                                Цены и штрихкоды для печати берутся из актуальной базы товаров.
                            </div>
                        </div>
                    </div>

                    <AnimatePresence>
                        {searchQuery && !isSearchLoading && foundProducts.length === 0 && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="py-3 bg-gray-50 text-center text-gray-500"
                            >
                                Товар не найден
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {foundProducts.length > 0 && searchQuery && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden border-t border-gray-200"
                            >
                                <div className="p-4 space-y-2">
                                    {foundProducts.map((product) => {
                                        const stock = getStock(product);
                                        const isEmpty = stock <= 0;

                                        return (
                                            <motion.div
                                                key={String(product.id)}
                                                whileHover={{ scale: isEmpty ? 1 : 1.01 }}
                                                className={`flex justify-between items-center p-3 rounded-lg shadow-sm transition-shadow ${
                                                    isEmpty
                                                        ? 'bg-red-50 cursor-not-allowed opacity-70'
                                                        : 'bg-white hover:shadow-md cursor-pointer'
                                                }`}
                                                onClick={() => {
                                                    if (!isEmpty) {
                                                        addToCheckout(product);
                                                    }
                                                }}
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium truncate">
                                                        {product.name}
                                                    </div>

                                                    <div className="text-sm text-gray-500 truncate">
                                                        {product.category || 'Без категории'}
                                                        {product.barcode ? ` · ШК: ${getBarcodeDisplay(product.barcode)}` : ''}
                                                    </div>

                                                    <div className={`text-sm ${isEmpty ? 'text-red-600' : 'text-green-600'}`}>
                                                        Остаток: {formatQuantity(stock, product.unit)}
                                                    </div>
                                                </div>

                                                <div className="font-bold min-w-[150px] text-right">
                                                    {formatCurrency(getSellingPrice(product))}
                                                    <div className="text-xs font-normal text-gray-500">
                                                        {getUnitPriceLabel(product)}
                                                    </div>
                                                </div>

                                                <button
                                                    type="button"
                                                    disabled={isEmpty}
                                                    onClick={(e) => {
                                                        e.stopPropagation();

                                                        if (!isEmpty) {
                                                            addToCheckout(product);
                                                        }
                                                    }}
                                                    className="ml-4 text-indigo-600 hover:text-indigo-800 text-lg disabled:text-gray-300"
                                                >
                                                    +
                                                </button>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {checkoutItems.length > 0 && (
                        <div className="p-4 border-t border-gray-100">
                            <div className="space-y-2">
                                {checkoutItems.map((item) => {
                                    const stock = getStock(item.product);

                                    return (
                                        <motion.div
                                            key={item.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold truncate">
                                                    {item.product.name}
                                                </div>

                                                <div className="text-sm text-gray-500">
                                                    {formatCurrency(getSellingPrice(item.product))} × {formatQuantity(item.quantity, item.product.unit)}
                                                </div>

                                                {item.product.barcode && (
                                                    <div className="text-sm text-gray-500 truncate">
                                                        ШК: {getBarcodeDisplay(item.product.barcode)}
                                                    </div>
                                                )}

                                                <div className="text-sm text-gray-500">
                                                    Остаток в БД: {formatQuantity(stock, item.product.unit)}
                                                </div>
                                            </div>

                                            <div className="flex items-center space-x-4">
                                                <div className="flex items-center space-x-1">
                                                    {item.product.unit === 'weight' ? (
                                                        <input
                                                            type="number"
                                                            min="0.001"
                                                            step="0.001"
                                                            value={item.quantity}
                                                            onChange={(e) => setItemQuantity(item.id, e.target.value)}
                                                            className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-center outline-none focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                    ) : (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => changeQuantity(item.id, -1)}
                                                                className="p-1 text-gray-500 hover:text-indigo-600 rounded disabled:opacity-30"
                                                                disabled={item.quantity <= 1}
                                                            >
                                                                <AiOutlineMinus />
                                                            </button>

                                                            <span className="font-medium w-8 text-center">
                                                                {item.quantity}
                                                            </span>

                                                            <button
                                                                type="button"
                                                                onClick={() => changeQuantity(item.id, 1)}
                                                                className="p-1 text-gray-500 hover:text-indigo-600 rounded disabled:opacity-30"
                                                                disabled={item.quantity >= stock}
                                                            >
                                                                <AiOutlinePlus />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>

                                                <div className="font-bold text-lg min-w-[120px] text-right">
                                                    {formatCurrency(getSellingPrice(item.product) * item.quantity)}
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => removeFromCheckout(item.id)}
                                                    className="text-red-500 hover:text-red-700 ml-2"
                                                >
                                                    <AiOutlineDelete size={20} />
                                                </button>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>

                            <div className="mt-6 pt-6 border-t border-gray-200">
                                <div className="flex justify-between items-center">
                                    <div className="text-lg text-gray-600">
                                        Итого к оплате:
                                    </div>

                                    <div className="text-3xl font-bold text-indigo-700">
                                        {formatCurrency(total)}
                                    </div>
                                </div>

                                <div className="flex flex-wrap justify-end gap-3 mt-5">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCheckoutItems([]);
                                            setError(null);
                                        }}
                                        className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                    >
                                        Отмена
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => openPayment('cash')}
                                        className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                                    >
                                        Наличные
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => openPayment('transfer')}
                                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                    >
                                        Перевод
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => openPayment('card')}
                                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                                    >
                                        Карта
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {checkoutItems.length === 0 && !searchQuery && (
                        <div className="p-8 text-center text-gray-400">
                            <p className="mb-2">
                                В чеке пусто
                            </p>

                            <p className="text-sm">
                                Сканируйте штрихкод или найдите товар по названию
                            </p>
                        </div>
                    )}
                </div>

                {isLoading && (
                    <div className="text-center text-gray-500">
                        Загрузка товаров...
                    </div>
                )}
            </div>

            <AnimatePresence>
                {weightModalProduct && (
                    <div
                        key="weight-modal"
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
                    >
                        {/* весь текущий код модалки весового товара оставь без изменений */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
                        >
                            {/* содержимое weightModalProduct */}
                        </motion.div>
                    </div>
                )}

                {isPriceLabelModalOpen && (
                    <div
                        key="price-label-modal"
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
                    >
                        {/* весь текущий код модалки ценников оставь без изменений */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl overflow-hidden"
                        >
                            {/* содержимое isPriceLabelModalOpen */}
                        </motion.div>
                    </div>
                )}

                {paymentModal === 'card' && (
                    <div
                        key="payment-card-modal"
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
                        >
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">
                                Оплата картой
                            </h2>

                            <p className="text-gray-600 mb-2">
                                Введите на терминале сумму:
                            </p>

                            <div className="text-4xl font-bold text-indigo-700 mb-6">
                                {formatCurrency(total)}
                            </div>

                            <div className="rounded-xl bg-indigo-50 p-4 text-sm text-indigo-700 mb-6">
                                После успешной оплаты на терминале нажмите «Оплата прошла».
                            </div>

                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    disabled={isPaying}
                                    onClick={() => setPaymentModal(null)}
                                    className="px-5 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Отмена
                                </button>

                                <button
                                    type="button"
                                    disabled={isPaying}
                                    onClick={() => setFiscalConfirmModal(true)}
                                    className="px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    {isPaying ? 'Провожу оплату...' : 'Оплата прошла'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {paymentModal === 'cash' && (
                    <div
                        key="payment-cash-modal"
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
                    >
                        {/* весь текущий код модалки наличных оставь без изменений */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
                        >
                            {/* содержимое paymentModal === 'cash' */}
                        </motion.div>
                    </div>
                )}

                {paymentModal === 'transfer' && (
                    <div
                        key="payment-transfer-modal"
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
                        >
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">
                                Оплата переводом
                            </h2>

                            <div className="mb-4">
                                <div className="text-gray-600 mb-1">
                                    Сумма к переводу:
                                </div>

                                <div className="text-3xl font-bold text-blue-700">
                                    {formatCurrency(total)}
                                </div>
                            </div>

                            <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-700 mb-6">
                                Перед подтверждением обязательно убедитесь, что перевод поступил или показан клиентом как выполненный.
                            </div>

                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    disabled={isPaying}
                                    onClick={() => setPaymentModal(null)}
                                    className="px-5 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Отмена
                                </button>

                                <button
                                    type="button"
                                    disabled={isPaying}
                                    onClick={() => completePayment('transfer', false)}
                                    className="px-5 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {isPaying ? 'Провожу оплату...' : 'Перевод выполнен'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {fiscalConfirmModal && paymentModal === 'card' && (
                    <div
                        key="fiscal-confirm-modal"
                        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
                        >
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">
                                Фискализировать чек?
                            </h2>

                            <div className="mb-4">
                                <div className="text-gray-600 mb-1">
                                    Сумма оплаты картой:
                                </div>

                                <div className="text-3xl font-bold text-indigo-700">
                                    {formatCurrency(total)}
                                </div>
                            </div>

                            <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 mb-6">
                                Фискализация будет отправлена на локальную ККТ АТОЛ. Если чек пробивать не нужно, продажа сохранится без отправки в ККТ.
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    disabled={isPaying}
                                    onClick={() => {
                                        setFiscalConfirmModal(false);
                                        completePayment('card', false);
                                    }}
                                    className="px-5 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Нет, сохранить без ККТ
                                </button>

                                <button
                                    type="button"
                                    disabled={isPaying || !isShiftOpen}
                                    onClick={() => {
                                        setFiscalConfirmModal(false);
                                        completePayment('card', true);
                                    }}
                                    className="px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    {isPaying ? 'Фискализирую...' : 'Да, пробить на ККТ'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {lastReceipt && (
                    <div
                        key={`last-receipt-modal-${lastReceipt.id}`}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
                        onClick={clearReceipt}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
                        >
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">
                                Чек сформирован
                            </h2>

                            <div className="text-sm text-gray-500 mb-5">
                                № {lastReceipt.id} · {new Date(lastReceipt.createdAt).toLocaleString('ru-RU')}
                            </div>

                            {lastReceipt.fiscalStatus === 'success' && (
                                <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                                    Чек успешно пробит на ККТ
                                    {lastReceipt.fiscalUuid && (
                                        <div className="mt-1 text-xs text-emerald-600">
                                            UUID: {lastReceipt.fiscalUuid}
                                        </div>
                                    )}
                                </div>
                            )}

                            {lastReceipt.fiscalStatus === 'skipped' && (
                                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                                    Продажа сохранена без фискализации на ККТ
                                </div>
                            )}

                            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                                {lastReceipt.items.map((item, index) => (
                                    <div key={`${item.productId}-${index}`} className="border-b pb-2">
                                        <div className="font-medium text-gray-800">
                                            {item.name}
                                        </div>

                                        <div className="flex justify-between text-sm text-gray-500">
                            <span>
                                {formatCurrency(item.price)} × {formatQuantity(item.quantity, item.unit)}
                            </span>

                                            <span className="font-semibold text-gray-700">
                                {formatCurrency(item.total)}
                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-5 border-t pt-4 space-y-2">
                                <div className="flex justify-between">
                                    <span>Оплата:</span>
                                    <span className="font-semibold">{lastReceipt.paymentLabel}</span>
                                </div>

                                <div className="flex justify-between text-xl font-bold">
                                    <span>Итого:</span>
                                    <span>{formatCurrency(lastReceipt.total)}</span>
                                </div>

                                {lastReceipt.paymentMethod === 'cash' && (
                                    <>
                                        <div className="flex justify-between">
                                            <span>Получено:</span>
                                            <span>{formatCurrency(lastReceipt.receivedAmount || 0)}</span>
                                        </div>

                                        <div className="flex justify-between">
                                            <span>Сдача:</span>
                                            <span>{formatCurrency(lastReceipt.change || 0)}</span>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="mt-6 flex justify-end">
                                <button
                                    type="button"
                                    onClick={clearReceipt}
                                    className="px-6 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                                >
                                    Новая продажа
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {isAtolSetupOpen && (
                <AtolAgentSetup onClose={() => setIsAtolSetupOpen(false)} />
            )}
        </div>
    );
}
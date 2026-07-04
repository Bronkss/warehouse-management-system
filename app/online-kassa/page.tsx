'use client';

import AtolAgentSetup from '@/app/components/AtolAgentSetup';
import {
    usePosCheckoutStore,
    type HeldCheckout,
    type StoredCheckoutItem,
} from './pos-checkout-store';
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
    marked?: boolean | number | string | null;
    isMarked?: boolean | number | string | null;
    is_marked?: boolean | number | string | null;
    marking?: boolean | number | string | null;
    markedProduct?: boolean | number | string | null;
};

type ProductsApiResponse = {
    items: Product[];
    nextCursor: number | null;
    hasMore: boolean;
    limit: number;
    durationMs?: number;
};

type MarkingStatus = 'M+' | 'M-' | 'M';

type CheckoutItem = {
    product: Product;
    id: string;
    quantity: number;
    markingCode?: string;
    markingStatus?: MarkingStatus;
    markingMessage?: string;
    markingCheckedAt?: string;
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
    marked?: boolean;
    markingCode?: string;
    markingStatus?: MarkingStatus;
    markingMessage?: string;
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

type MarkingPrecheckResult = {
    ok?: boolean;
    canSell?: boolean;
    markingStatus?: MarkingStatus;
    normalizedMarkingCode?: string;
    message?: string;
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
type PrintLayout = 'a4' | 'thermal';

type PriceLabelQuantityMap = Record<string, number>;

const PRODUCTS_PAGE_LIMIT = 100;
const SEARCH_LIMIT = 30;

const AUTH_USER_KEY = 'warehouse_auth_user';
const AUTH_LOGIN_KEY = 'warehouse_auth_login';
const REMEMBER_ME_KEY = 'warehouse_remember_me';

const DEFAULT_FISCAL_AGENT_URL = 'http://127.0.0.1:3108';
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

const normalizeBooleanFlag = (value: unknown): boolean => {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'number') {
        return value === 1;
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();

        return ['1', 'true', 'yes', 'y', 'да', 'маркированный', 'marked'].includes(normalized);
    }

    return false;
};

const isMarkedProduct = (product: Product): boolean => {
    return normalizeBooleanFlag(
        product.marked ??
        product.isMarked ??
        product.is_marked ??
        product.marking ??
        product.markedProduct
    );
};

const normalizeMarkingCode = (value: unknown): string => {
    return String(value ?? '')
        .replaceAll('\\u001d', '\u001d')
        .replaceAll('\\x1d', '\u001d')
        .replaceAll('<GS>', '\u001d')
        .replaceAll('[GS]', '\u001d')
        .trim();
};

const formatMarkingCodePreview = (value: unknown): string => {
    const code = normalizeMarkingCode(value);

    if (code.length <= 22) {
        return code;
    }

    return `${code.slice(0, 14)}…${code.slice(-6)}`;
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
        marked: isMarkedProduct(product),
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

const canSellIntoNegativeStock = (product: Product): boolean => {
    return isWeightProduct(product) && !isMarkedProduct(product);
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

const getProductCategory = (product: Product): string => {
    const category = String(product.category || '').trim();

    return category || 'Без категории';
};

const normalizeSearchText = (value: unknown): string => {
    return String(value ?? '').trim().toLowerCase();
};

const doesProductMatchPriceLabelSearch = (product: Product, rawQuery: string): boolean => {
    const query = normalizeSearchText(rawQuery);

    if (!query) {
        return true;
    }

    const tokens = query.split(/\s+/).filter(Boolean);
    const searchableText = normalizeSearchText([
        product.name,
        getProductCategory(product),
        getSellingPrice(product),
        product.unit === 'weight' ? 'кг весовой' : 'шт штука',
    ].join(' '));

    return tokens.every(token => {
        return (
            searchableText.includes(token) ||
            hasBarcodeSearchMatch(product.barcode, token)
        );
    });
};

const doesProductMatchPriceLabelCategory = (product: Product, categoryFilter: string): boolean => {
    return categoryFilter === 'all' || getProductCategory(product) === categoryFilter;
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

const normalizeStoredCheckoutItem = (item: StoredCheckoutItem): CheckoutItem | null => {
    if (!item || !item.product) {
        return null;
    }

    const product = normalizeProduct(item.product as Product);

    if (product.id === undefined || product.id === null || !String(product.name || '').trim()) {
        return null;
    }

    const quantity = isMarkedProduct(product)
        ? 1
        : product.unit === 'weight'
            ? roundQuantity(safeParseNumber(item.quantity))
            : Math.floor(safeParseNumber(item.quantity));

    if (!Number.isFinite(quantity) || quantity <= 0) {
        return null;
    }

    return {
        product,
        id: String(item.id || `${product.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`),
        quantity,
        markingCode: item.markingCode ? normalizeMarkingCode(item.markingCode) : undefined,
        markingStatus: item.markingStatus,
        markingMessage: item.markingMessage,
        markingCheckedAt: item.markingCheckedAt,
    };
};

const normalizeStoredCheckoutItems = (items: StoredCheckoutItem[]): CheckoutItem[] => {
    return items
        .map(normalizeStoredCheckoutItem)
        .filter((item): item is CheckoutItem => Boolean(item));
};

const getHeldCheckoutTitle = (held: HeldCheckout): string => {
    if (held.title) {
        return held.title;
    }

    const firstItemName = held.items[0]?.product?.name;

    if (firstItemName) {
        return String(firstItemName);
    }

    return 'Отложенный чек';
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
    let response: Response;

    try {
        response = await fetch(`${getFiscalAgentUrl()}${path}`, {
            ...init,
            headers: {
                'Content-Type': 'application/json',
                'X-POS-Agent-Token': getFiscalAgentToken(),
                ...(init?.headers || {}),
            },
            cache: 'no-store',
        });
    } catch {
        throw new Error('Локальный агент ККТ недоступен. Проверьте, что он запущен на ПК кассы.');
    }

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

const precheckMarkingCode = async (markingCode: string): Promise<MarkingPrecheckResult> => {
    const data = await callFiscalAgent<MarkingPrecheckResult>('/marking/precheck', {
        method: 'POST',
        body: JSON.stringify({ markingCode }),
    });

    return data;
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

    const [markingModalProduct, setMarkingModalProduct] = useState<Product | null>(null);
    const [markingCodeInput, setMarkingCodeInput] = useState('');
    const [markingCheckResult, setMarkingCheckResult] = useState<MarkingPrecheckResult | null>(null);
    const [isCheckingMarking, setIsCheckingMarking] = useState(false);

    const [isPriceLabelModalOpen, setIsPriceLabelModalOpen] = useState(false);
    const [priceLabelSearch, setPriceLabelSearch] = useState('');
    const [priceLabelCategoryFilter, setPriceLabelCategoryFilter] = useState('all');
    const [selectedPriceLabelIds, setSelectedPriceLabelIds] = useState<string[]>([]);
    const [priceLabelQuantities, setPriceLabelQuantities] = useState<PriceLabelQuantityMap>({});
    const [isRefreshingLabels, setIsRefreshingLabels] = useState(false);

    const [isAtolSetupOpen, setIsAtolSetupOpen] = useState(false);
    const [isHeldReceiptsModalOpen, setIsHeldReceiptsModalOpen] = useState(false);
    const [isCheckoutStoreReady, setIsCheckoutStoreReady] = useState(false);

    const heldCheckouts = usePosCheckoutStore(state => state.heldCheckouts);
    const setStoredCheckoutItems = usePosCheckoutStore(state => state.setCurrentItems);
    const clearStoredCheckoutItems = usePosCheckoutStore(state => state.clearCurrentItems);
    const holdCheckoutInStore = usePosCheckoutStore(state => state.holdCheckout);
    const removeHeldCheckout = usePosCheckoutStore(state => state.removeHeldCheckout);

    const searchInputRef = useRef<HTMLInputElement>(null);

    const total = calculateTotal(checkoutItems);
    const cashReceivedNumber = safeParseNumber(cashReceived);
    const change = cashReceivedNumber - total;
    const isShiftOpen = shiftStatus === 'open';
    const hasMarkedCheckoutItems = checkoutItems.some(item => isMarkedProduct(item.product));
    const hasUnsafeMarkedCheckoutItems = checkoutItems.some(item =>
        isMarkedProduct(item.product) && item.markingStatus !== 'M+'
    );

    const priceLabelCategories = useMemo(() => {
        const categories = allProducts.map(getProductCategory);

        return Array.from(new Set<string>(categories)).sort((a, b) =>
            a.localeCompare(b, 'ru')
        );
    }, [allProducts]);

    const priceLabelProducts = useMemo(() => {
        return allProducts.filter(product => {
            return (
                doesProductMatchPriceLabelCategory(product, priceLabelCategoryFilter) &&
                doesProductMatchPriceLabelSearch(product, priceLabelSearch)
            );
        });
    }, [allProducts, priceLabelSearch, priceLabelCategoryFilter]);

    const getPriceLabelQuantity = (productId: ProductId): number => {
        const quantity = priceLabelQuantities[String(productId)];

        if (!Number.isFinite(quantity) || quantity <= 0) {
            return 1;
        }

        return Math.min(999, Math.floor(quantity));
    };

    const selectedPriceLabelPrintCount = selectedPriceLabelIds.reduce((sum, productId) => {
        return sum + getPriceLabelQuantity(productId);
    }, 0);

    const filteredPriceLabelPrintCount = priceLabelProducts.reduce((sum, product) => {
        return sum + getPriceLabelQuantity(product.id);
    }, 0);

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
        const storedItems = usePosCheckoutStore.getState().currentItems;
        const restoredItems = normalizeStoredCheckoutItems(storedItems);

        if (restoredItems.length > 0) {
            setCheckoutItems(restoredItems);
        }

        setIsCheckoutStoreReady(true);
    }, []);

    useEffect(() => {
        if (!isCheckoutStoreReady) {
            return;
        }

        if (checkoutItems.length === 0) {
            clearStoredCheckoutItems();
            return;
        }

        setStoredCheckoutItems(checkoutItems as unknown as StoredCheckoutItem[]);
    }, [checkoutItems, clearStoredCheckoutItems, isCheckoutStoreReady, setStoredCheckoutItems]);

    useEffect(() => {
        if (!isAuthChecked) {
            return;
        }

        let cancelled = false;

        const loadFirstProductsPage = async () => {
            try {
                setIsLoading(true);

                const page = await fetchProductsPage({
                    limit: PRODUCTS_PAGE_LIMIT,
                });

                if (!cancelled) {
                    setAllProducts(page.items.map(normalizeProduct));
                }
            } catch (err) {
                console.error(err);

                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Не удалось загрузить товары');
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        void loadFirstProductsPage();

        return () => {
            cancelled = true;
        };
    }, [isAuthChecked]);

    useEffect(() => {
        if (paymentModal !== 'cash') {
            return;
        }

        const handleEnterPayment = (event: globalThis.KeyboardEvent) => {
            if (event.key !== 'Enter' || isPaying) {
                return;
            }

            event.preventDefault();

            if (cashReceivedNumber < total) {
                setError('Полученная сумма меньше суммы чека');
                return;
            }

            setFiscalConfirmModal(true);
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
            setMarkingModalProduct(null);
            setMarkingCodeInput('');
            setMarkingCheckResult(null);
            setIsPriceLabelModalOpen(false);
            setIsHeldReceiptsModalOpen(false);
            setLastReceipt(null);
            setIsAtolSetupOpen(false);
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

    const repeatLastFiscalReceipt = async () => {
        try {
            setIsShiftActionLoading(true);
            setError(null);
            setNotice(null);

            await callFiscalAgent('/service/repeat-last-receipt', {
                method: 'POST',
            });

            setNotice('Копия последнего фискального чека отправлена на ККТ');
        } catch (err) {
            console.error(err);
            setNotice(null);
            setError(err instanceof Error ? err.message : 'Не удалось напечатать копию последнего чека');
        } finally {
            setIsShiftActionLoading(false);

            requestAnimationFrame(() => {
                searchInputRef.current?.focus();
            });
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

                const nextStock = roundQuantity(getStock(product) - receiptItem.quantity);

                return {
                    ...product,
                    stock: isWeightProduct(product) ? nextStock : Math.max(0, nextStock),
                };
            })
        );
    };

    const openMarkingScanModal = (product: Product) => {
        const safeProduct = normalizeProduct(product);

        setMarkingModalProduct(safeProduct);
        setMarkingCodeInput('');
        setMarkingCheckResult(null);
        setError(null);
        setNotice(null);
    };

    const getMarkingStatusClassName = (status?: MarkingStatus): string => {
        if (status === 'M+') {
            return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        }

        if (status === 'M-') {
            return 'bg-red-100 text-red-700 border-red-200';
        }

        return 'bg-amber-100 text-amber-700 border-amber-200';
    };

    const addMarkedProductToCheckout = async (product: Product, rawMarkingCode: string) => {
        if (isCheckingMarking) {
            return;
        }

        const safeProduct = normalizeProduct(product);
        const markingCode = normalizeMarkingCode(rawMarkingCode);
        const stock = getStock(safeProduct);

        if (!markingCode) {
            setMarkingCheckResult(null);
            setError('Отсканируйте DataMatrix маркированного товара');
            return;
        }

        if (markingCode.length < 20) {
            setMarkingCheckResult({
                ok: false,
                canSell: false,
                markingStatus: 'M',
                message: 'DataMatrix выглядит слишком коротким. Проверьте сканирование.',
            });
            setError('DataMatrix выглядит слишком коротким. Проверьте сканирование.');
            return;
        }

        if (stock <= 0) {
            setMarkingCheckResult(null);
            setError(`Товар «${safeProduct.name}» отсутствует на остатке`);
            return;
        }

        const hasSameCode = checkoutItems.some(item =>
            normalizeMarkingCode(item.markingCode) === markingCode
        );

        if (hasSameCode) {
            setMarkingCheckResult({
                ok: false,
                canSell: false,
                markingStatus: 'M-',
                message: 'Этот DataMatrix уже добавлен в текущий чек',
            });
            setError('Этот DataMatrix уже добавлен в текущий чек');
            return;
        }

        const currentProductQuantity = checkoutItems
            .filter(item => String(item.product.id) === String(safeProduct.id))
            .reduce((sum, item) => sum + item.quantity, 0);

        if (currentProductQuantity + 1 > stock) {
            setMarkingCheckResult(null);
            setError(
                `Недостаточно остатка: «${safeProduct.name}». В наличии ${formatQuantity(stock, safeProduct.unit)}`
            );
            return;
        }

        try {
            setIsCheckingMarking(true);
            setError(null);
            setNotice(null);
            setMarkingCheckResult(null);

            const checkResult = await precheckMarkingCode(markingCode);
            const status = checkResult.markingStatus || 'M';

            setMarkingCheckResult({
                ...checkResult,
                markingStatus: status,
            });

            if (!checkResult.canSell || status !== 'M+') {
                setError(checkResult.message || `Код маркировки не прошёл проверку: [${status}]`);
                return;
            }

            const safeMarkingCode = normalizeMarkingCode(checkResult.normalizedMarkingCode || markingCode);

            setCheckoutItems(prevItems => [
                ...prevItems,
                {
                    product: safeProduct,
                    id: `${safeProduct.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                    quantity: 1,
                    markingCode: safeMarkingCode,
                    markingStatus: 'M+',
                    markingMessage: checkResult.message || 'КМ проверен успешно',
                    markingCheckedAt: new Date().toISOString(),
                },
            ]);

            setMarkingModalProduct(null);
            setMarkingCodeInput('');
            setMarkingCheckResult(null);
            setSearchQuery('');
            setFoundProducts([]);
            setError(null);
            setNotice(`Маркировка проверена [M+]. Товар «${safeProduct.name}» добавлен в чек.`);

            requestAnimationFrame(() => {
                searchInputRef.current?.focus();
            });
        } catch (err) {
            console.error(err);

            const message = err instanceof Error
                ? err.message
                : 'Не удалось проверить код маркировки';

            setMarkingCheckResult({
                ok: false,
                canSell: false,
                markingStatus: 'M',
                message,
            });
            setError(message);
        } finally {
            setIsCheckingMarking(false);
        }
    };

    const addQuantityToCheckout = (product: Product, quantity: number) => {
        const safeProduct = normalizeProduct(product);

        if (isMarkedProduct(safeProduct)) {
            openMarkingScanModal(safeProduct);
            return;
        }

        const stock = getStock(safeProduct);
        const allowNegativeStock = canSellIntoNegativeStock(safeProduct);
        const safeQuantity = isWeightProduct(safeProduct)
            ? roundQuantity(quantity)
            : Math.floor(quantity);

        if (safeQuantity <= 0) {
            setError('Введите корректное количество товара');
            return;
        }

        if (!allowNegativeStock && stock <= 0) {
            setError(`Товар «${safeProduct.name}» отсутствует на остатке`);
            return;
        }

        setCheckoutItems(prevItems => {
            const existingItem = prevItems.find(item =>
                String(item.product.id) === String(safeProduct.id)
            );

            const currentQuantity = existingItem?.quantity || 0;
            const nextQuantity = roundQuantity(currentQuantity + safeQuantity);

            if (!allowNegativeStock && nextQuantity > stock) {
                setError(
                    `Недостаточно остатка: «${safeProduct.name}». В наличии ${formatQuantity(stock, safeProduct.unit)}`
                );
                return prevItems;
            }

            setError(null);

            if (allowNegativeStock && nextQuantity > stock) {
                setNotice(
                    `Весовой товар «${safeProduct.name}» добавлен с уходом остатка в минус. Это разрешено для погрешности веса.`
                );
            } else {
                setNotice(null);
            }

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

        if (isMarkedProduct(safeProduct)) {
            openMarkingScanModal(safeProduct);
            return;
        }

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

                if (isMarkedProduct(item.product)) {
                    setError('Для маркированного товара количество не меняется: один DataMatrix = одна позиция в чеке');
                    return item;
                }

                const nextQuantity = item.quantity + delta;
                const stock = getStock(item.product);
                const allowNegativeStock = canSellIntoNegativeStock(item.product);

                if (nextQuantity <= 0) {
                    return item;
                }

                if (!allowNegativeStock && nextQuantity > stock) {
                    setError(
                        `Недостаточно остатка: «${item.product.name}». В наличии ${formatQuantity(stock, item.product.unit)}`
                    );
                    return item;
                }

                setError(null);

                if (allowNegativeStock && nextQuantity > stock) {
                    setNotice(
                        `Весовой товар «${item.product.name}» уходит в минусовой остаток. Это разрешено для погрешности веса.`
                    );
                }

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

                if (isMarkedProduct(item.product)) {
                    setError('Для маркированного товара количество не меняется: один DataMatrix = одна позиция в чеке');
                    return item;
                }

                const stock = getStock(item.product);
                const isWeight = item.product.unit === 'weight';
                const allowNegativeStock = canSellIntoNegativeStock(item.product);

                const nextQuantity = isWeight
                    ? roundQuantity(parsed)
                    : Math.floor(parsed);

                if (nextQuantity <= 0) {
                    setError('Количество должно быть больше нуля');
                    return item;
                }

                if (!allowNegativeStock && nextQuantity > stock) {
                    setError(
                        `Недостаточно остатка: «${item.product.name}». В наличии ${formatQuantity(stock, item.product.unit)}`
                    );
                    return item;
                }

                setError(null);

                if (allowNegativeStock && nextQuantity > stock) {
                    setNotice(
                        `Весовой товар «${item.product.name}» уходит в минусовой остаток. Это разрешено для погрешности веса.`
                    );
                }

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

    const holdCurrentCheckout = () => {
        if (checkoutItems.length === 0) {
            setError('Нечего откладывать: чек пустой');
            return;
        }

        const heldCheckout = holdCheckoutInStore(
            checkoutItems as unknown as StoredCheckoutItem[],
            total
        );

        if (!heldCheckout) {
            setError('Не удалось отложить чек');
            return;
        }

        setCheckoutItems([]);
        setPaymentModal(null);
        setFiscalConfirmModal(false);
        setCashReceived('');
        setError(null);
        setNotice(`Чек отложен: ${getHeldCheckoutTitle(heldCheckout)}`);

        requestAnimationFrame(() => {
            searchInputRef.current?.focus();
        });
    };

    const restoreHeldCheckout = (held: HeldCheckout) => {
        if (checkoutItems.length > 0) {
            const shouldReplace = confirm('В текущем чеке уже есть товары. Заменить его отложенным чеком?');

            if (!shouldReplace) {
                return;
            }
        }

        const restoredItems = normalizeStoredCheckoutItems(held.items);

        if (restoredItems.length === 0) {
            removeHeldCheckout(held.id);
            setError('Отложенный чек пустой или повреждён, он удалён из списка');
            return;
        }

        removeHeldCheckout(held.id);
        setCheckoutItems(restoredItems);
        setPaymentModal(null);
        setFiscalConfirmModal(false);
        setCashReceived('');
        setIsHeldReceiptsModalOpen(false);
        setError(null);
        setNotice(`Отложенный чек восстановлен: ${getHeldCheckoutTitle(held)}`);

        requestAnimationFrame(() => {
            searchInputRef.current?.focus();
        });
    };

    const deleteHeldCheckout = (held: HeldCheckout) => {
        const shouldDelete = confirm(`Удалить отложенный чек «${getHeldCheckoutTitle(held)}»?`);

        if (!shouldDelete) {
            return;
        }

        removeHeldCheckout(held.id);
        setNotice('Отложенный чек удалён');
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
            return !canSellIntoNegativeStock(item.product) && item.quantity > getStock(item.product);
        });

        if (stockError) {
            setError(
                `Недостаточно остатка: «${stockError.product.name}». В наличии ${formatQuantity(getStock(stockError.product), stockError.product.unit)}`
            );
            return;
        }

        const unsafeMarkedItem = checkoutItems.find(item =>
            isMarkedProduct(item.product) && item.markingStatus !== 'M+'
        );

        if (unsafeMarkedItem) {
            setError(
                `Маркированный товар «${unsafeMarkedItem.product.name}» не прошёл проверку [M+]. Продажа заблокирована.`
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
            setNotice(null);

            const freshProducts = await refreshProducts();

            const validatedItems = checkoutItems.map(item => {
                const freshProduct = freshProducts.find(product =>
                    String(product.id) === String(item.product.id)
                );

                if (!freshProduct) {
                    throw new Error(`Товар «${item.product.name}» не найден в базе`);
                }

                const freshStock = getStock(freshProduct);
                const allowNegativeStock = canSellIntoNegativeStock(freshProduct);

                if (!allowNegativeStock && freshStock < item.quantity) {
                    throw new Error(
                        `Недостаточно остатка: «${freshProduct.name}». В наличии ${formatQuantity(freshStock, freshProduct.unit)}, в чеке ${formatQuantity(item.quantity, freshProduct.unit)}`
                    );
                }

                return {
                    ...item,
                    product: freshProduct,
                };
            });

            const missingMarkedItem = validatedItems.find(item =>
                isMarkedProduct(item.product) && !normalizeMarkingCode(item.markingCode)
            );

            if (missingMarkedItem) {
                throw new Error(`Для маркированного товара «${missingMarkedItem.product.name}» не отсканирован DataMatrix`);
            }

            const unsafeMarkedItem = validatedItems.find(item =>
                isMarkedProduct(item.product) && item.markingStatus !== 'M+'
            );

            if (unsafeMarkedItem) {
                throw new Error(`Маркированный товар «${unsafeMarkedItem.product.name}» не прошёл проверку [M+]. Продажа заблокирована.`);
            }

            const receiptItems: ReceiptItem[] = validatedItems.map(item => {
                const price = getSellingPrice(item.product);
                const marked = isMarkedProduct(item.product);
                const markingCode = normalizeMarkingCode(item.markingCode);

                return {
                    productId: item.product.id,
                    name: item.product.name,
                    barcode: item.product.barcode,
                    category: item.product.category,
                    unit: item.product.unit,
                    quantity: item.quantity,
                    price,
                    total: price * item.quantity,
                    marked,
                    ...(marked && markingCode ? {
                        markingCode,
                        markingStatus: item.markingStatus,
                        markingMessage: item.markingMessage,
                    } : {}),
                };
            });

            const receiptTotal = receiptItems.reduce((sum, item) => sum + item.total, 0);
            const hasMarkedReceiptItems = receiptItems.some(item => item.marked && item.markingCode);
            const shouldRunFiscalization = hasMarkedReceiptItems || ((method === 'card' || method === 'cash') && shouldFiscalize);

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
            setFiscalConfirmModal(false);
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
            setNotice(null);

            await refreshProducts();

            setIsPriceLabelModalOpen(true);
            setPriceLabelSearch('');
            setPriceLabelCategoryFilter('all');
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

    const updatePriceLabelQuantity = (productId: ProductId, rawValue: string) => {
        const id = String(productId);
        const parsedQuantity = Math.floor(safeParseNumber(rawValue));
        const safeQuantity = Math.min(999, Math.max(1, parsedQuantity || 1));

        setPriceLabelQuantities(prev => ({
            ...prev,
            [id]: safeQuantity,
        }));

        setSelectedPriceLabelIds(prev => {
            if (prev.includes(id)) {
                return prev;
            }

            return [...prev, id];
        });
    };

    const expandProductsForPriceLabels = (products: Product[]): Product[] => {
        return products.flatMap(product => {
            const quantity = getPriceLabelQuantity(product.id);

            return Array.from({ length: quantity }, () => product);
        });
    };

    const renderBarcodeSvgFromDbValue = (barcodeFromDb: string): string => {
        const barcode = getPrimaryBarcode(String(barcodeFromDb || '')).trim();

        if (!barcode) {
            return '';
        }

        try {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

            JsBarcode(svg, barcode, {
                format: 'CODE128',
                width: 0.85,
                height: 22,
                displayValue: false,
                margin: 0,
            });

            return new XMLSerializer().serializeToString(svg);
        } catch (err) {
            console.error(err);
            return '';
        }
    };

    const buildA4PriceLabelsHtml = (products: Product[]): string => {
        const LABELS_PER_SHEET = 21;

        const chunkProducts = (items: Product[], size: number): Product[][] => {
            const chunks: Product[][] = [];

            for (let i = 0; i < items.length; i += size) {
                chunks.push(items.slice(i, i + size));
            }

            return chunks;
        };

        const formatPriceForLabel = (value: number): string => {
            const rounded = Math.ceil(value);

            return new Intl.NumberFormat('ru-RU', {
                maximumFractionDigits: 0,
            }).format(rounded);
        };

        const sheets = chunkProducts(products, LABELS_PER_SHEET).map(sheetProducts => {
            const labels = sheetProducts.map(product => {
                const name = escapeHtml(product.name);
                const price = formatPriceForLabel(getSellingPrice(product));
                const unitLabel = escapeHtml(product.unit === 'weight' ? 'за кг' : 'за шт');
                const barcodeSvg = renderBarcodeSvgFromDbValue(product.barcode || '');

                return `
                    <section class="label">
                        <div class="label-name">${name}</div>

                        <div class="label-price-row">
                            <div class="label-price">${price} ₽</div>
                            <div class="label-unit">${unitLabel}</div>
                        </div>

                        <div class="label-barcode">
                            ${barcodeSvg ? barcodeSvg : '<div class="no-barcode">ШК нет</div>'}
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
                    <title>Печать ценников 58×40 мм</title>

                    <style>
                        @page {
                            size: A4 portrait;
                            margin: 5mm;
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
                            background: #ffffff;
                            color: #000000;
                            font-family: Arial, sans-serif;
                        }

                        .sheet {
                            width: 174mm;
                            min-height: 280mm;
                            margin: 0 auto;
                            display: grid;
                            grid-template-columns: repeat(3, 58mm);
                            grid-auto-rows: 40mm;
                            align-content: start;
                            page-break-after: always;
                            break-after: page;
                        }

                        .sheet:last-child {
                            page-break-after: auto;
                            break-after: auto;
                        }

                        .label {
                            width: 58mm;
                            height: 40mm;
                            padding: 2mm 2.4mm 1.4mm;
                            display: flex;
                            flex-direction: column;
                            justify-content: space-between;
                            overflow: hidden;
                            border: 0.35mm solid #111111;
                            background: #ffffff;
                            break-inside: avoid;
                            page-break-inside: avoid;
                        }

                        .label-name {
                            min-height: 11.5mm;
                            max-height: 12.8mm;
                            overflow: hidden;
                            display: -webkit-box;
                            -webkit-box-orient: vertical;
                            -webkit-line-clamp: 2;
                            font-size: 14px;
                            line-height: 1.08;
                            font-weight: 900;
                            letter-spacing: -0.15px;
                            text-align: center;
                            color: #000000;
                        }

                        .label-price-row {
                            text-align: center;
                            color: #000000;
                        }

                        .label-price {
                            font-size: 31px;
                            line-height: 0.95;
                            font-weight: 900;
                            letter-spacing: -0.8px;
                            white-space: nowrap;
                        }

                        .label-unit {
                            margin-top: 1mm;
                            font-size: 12px;
                            line-height: 1;
                            font-weight: 800;
                        }

                        .label-barcode {
                            width: 100%;
                            height: 6.8mm;
                            display: flex;
                            align-items: flex-end;
                            justify-content: center;
                            overflow: hidden;
                        }

                        .label-barcode svg {
                            width: 34mm;
                            height: 6.5mm;
                            display: block;
                        }

                        .no-barcode {
                            width: 18mm;
                            padding: 0.8mm 0;
                            border: 0.25mm dashed #111111;
                            font-size: 7px;
                            line-height: 1;
                            color: #333333;
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

    const buildThermalPriceLabelsHtml = (products: Product[]): string => {
        const formatPriceForLabel = (value: number): string => {
            const rounded = Math.ceil(value);

            return new Intl.NumberFormat('ru-RU', {
                maximumFractionDigits: 0,
            }).format(rounded);
        };

        const labels = products.map(product => {
            const name = escapeHtml(product.name);
            const price = formatPriceForLabel(getSellingPrice(product));
            const unitLabel = escapeHtml(product.unit === 'weight' ? 'за кг' : 'за шт');
            const barcodeSvg = renderBarcodeSvgFromDbValue(product.barcode || '');

            return `
                <section class="label-page">
                    <div class="label">
                        <div class="label-name">${name}</div>

                        <div class="label-price-row">
                            <div class="label-price">${price} ₽</div>
                            <div class="label-unit">${unitLabel}</div>
                        </div>

                        <div class="label-barcode">
                            ${barcodeSvg ? barcodeSvg : '<div class="no-barcode">ШК нет</div>'}
                        </div>
                    </div>
                </section>
            `;
        }).join('');

        return `
            <!doctype html>
            <html lang="ru">
                <head>
                    <meta charset="utf-8" />
                    <title>Печать термоэтикеток XPrinter 58×40 мм</title>

                    <style>
                        @page {
                            size: 58mm 40mm;
                            margin: 0;
                        }

                        * {
                            box-sizing: border-box;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }

                        html,
                        body {
                            width: 58mm;
                            margin: 0;
                            padding: 0;
                            background: #ffffff;
                            color: #000000;
                            font-family: Arial, sans-serif;
                        }

                        .label-page {
                            width: 58mm;
                            height: 40mm;
                            margin: 0;
                            padding: 0;
                            display: block;
                            overflow: hidden;
                            break-after: page;
                            page-break-after: always;
                            break-inside: avoid;
                            page-break-inside: avoid;
                        }

                        .label-page:last-child {
                            break-after: auto;
                            page-break-after: auto;
                        }

                        .label {
                            width: 58mm;
                            height: 40mm;
                            padding: 2mm 2.4mm 1.4mm;
                            display: flex;
                            flex-direction: column;
                            justify-content: space-between;
                            overflow: hidden;
                            border: none;
                            outline: none;
                            background: #ffffff;
                        }

                        .label-name {
                            min-height: 11.5mm;
                            max-height: 12.8mm;
                            overflow: hidden;
                            display: -webkit-box;
                            -webkit-box-orient: vertical;
                            -webkit-line-clamp: 2;
                            font-size: 14px;
                            line-height: 1.08;
                            font-weight: 900;
                            letter-spacing: -0.15px;
                            text-align: center;
                            color: #000000;
                        }

                        .label-price-row {
                            text-align: center;
                            color: #000000;
                        }

                        .label-price {
                            font-size: 31px;
                            line-height: 0.95;
                            font-weight: 900;
                            letter-spacing: -0.8px;
                            white-space: nowrap;
                        }

                        .label-unit {
                            margin-top: 1mm;
                            font-size: 12px;
                            line-height: 1;
                            font-weight: 800;
                        }

                        .label-barcode {
                            width: 100%;
                            height: 6.8mm;
                            display: flex;
                            align-items: flex-end;
                            justify-content: center;
                            overflow: hidden;
                        }

                        .label-barcode svg {
                            width: 34mm;
                            height: 6.5mm;
                            display: block;
                        }

                        .no-barcode {
                            width: 18mm;
                            padding: 0.8mm 0;
                            border: none;
                            font-size: 7px;
                            line-height: 1;
                            color: #333333;
                            text-align: center;
                        }

                        @media print {
                            html,
                            body {
                                width: 58mm;
                                margin: 0;
                                padding: 0;
                            }

                            .label-page {
                                width: 58mm;
                                height: 40mm;
                            }
                        }
                    </style>
                </head>

                <body>
                    ${labels}

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

    const printPriceLabels = async (mode: PrintMode, layout: PrintLayout = 'a4') => {
        const printWindow = window.open('', '_blank', layout === 'thermal' ? 'width=420,height=650' : 'width=900,height=700');

        if (!printWindow) {
            setError('Браузер заблокировал окно печати. Разрешите всплывающие окна.');
            return;
        }

        try {
            setIsRefreshingLabels(true);
            setError(null);
            setNotice(null);

            const isThermalPrint = layout === 'thermal';

            printWindow.document.open();
            printWindow.document.write(`
                <!doctype html>
                <html lang="ru">
                    <head>
                        <meta charset="utf-8" />
                        <title>${isThermalPrint ? 'Подготовка термоэтикеток' : 'Подготовка ценников'}</title>
                    </head>
                    <body style="font-family: Arial, sans-serif; padding: 24px;">
                        <h2>${isThermalPrint ? 'Подготовка термоэтикеток...' : 'Подготовка ценников...'}</h2>
                        <p>Пожалуйста, подождите.</p>
                    </body>
                </html>
            `);
            printWindow.document.close();

            const freshProducts = await refreshProducts();
            const freshFilteredProducts = freshProducts.filter(product => {
                return (
                    doesProductMatchPriceLabelCategory(product, priceLabelCategoryFilter) &&
                    doesProductMatchPriceLabelSearch(product, priceLabelSearch)
                );
            });

            const baseProducts =
                mode === 'selected'
                    ? freshProducts.filter(product =>
                        selectedPriceLabelIds.includes(String(product.id))
                    )
                    : mode === 'filtered'
                        ? freshFilteredProducts
                        : freshProducts;

            const products = expandProductsForPriceLabels(baseProducts);

            if (products.length === 0) {
                printWindow.close();
                setError('Нет товаров для печати ценников');
                return;
            }

            printWindow.document.open();
            printWindow.document.write(
                isThermalPrint
                    ? buildThermalPriceLabelsHtml(products)
                    : buildA4PriceLabelsHtml(products)
            );
            printWindow.document.close();

            setNotice(`${isThermalPrint ? 'Термоэтикетки XPrinter' : 'Ценники A4'} отправлены на печать: ${products.length}. Товаров: ${baseProducts.length}`);
        } catch (err) {
            console.error(err);
            printWindow.close();
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
                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <button
                        type="button"
                        onClick={() => router.push('/system')}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-indigo-200 bg-white px-5 py-3 text-sm font-bold text-indigo-700 shadow-sm transition-colors hover:bg-indigo-50"
                    >
                        <span aria-hidden="true">←</span>
                        Вернуться в склад
                    </button>

                    <h1 className="text-3xl font-bold text-indigo-800 text-center sm:flex-1">
                        ТОЧКА онлайн - касса
                    </h1>

                    <div className="hidden min-w-[168px] sm:block" />
                </div>

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
                                onClick={repeatLastFiscalReceipt}
                                disabled={isShiftActionLoading}
                                className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
                            >
                                Копия последнего чека ККТ
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
                        Продажа доступна только при открытой смене. Обычный чек по карте фискализируется после подтверждения кассира; маркированные товары всегда отправляются на ККТ.
                    </div>

                    <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="text-sm font-bold text-indigo-900">
                                Настройки ККТ и файлы для установки
                            </div>

                            <div className="mt-1 text-xs leading-5 text-indigo-700">
                                Открывай только при настройке рабочего места кассира: агент 127.0.0.1:3108, драйвер АТОЛ 10.10.8 и файлы загрузки.
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setIsAtolSetupOpen(true)}
                            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
                        >
                            Открыть настройки ККТ
                        </button>
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
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={openPriceLabelModal}
                                    disabled={isRefreshingLabels}
                                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-white hover:bg-slate-800 disabled:opacity-50"
                                >
                                    <AiOutlinePrinter size={20} />
                                    {isRefreshingLabels ? 'Обновляю цены...' : 'Печать ценников / термоэтикеток 58×40'}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setIsHeldReceiptsModalOpen(true)}
                                    className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-5 py-2.5 font-semibold text-amber-800 hover:bg-amber-100"
                                >
                                    Отложенные чеки ({heldCheckouts.length})
                                </button>
                            </div>

                            <div className="text-xs text-gray-500">
                                Цены и штрихкоды для печати берутся из актуальной базы товаров. Текущий чек сохраняется после обновления страницы.
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
                                        const canSellNegative = canSellIntoNegativeStock(product);
                                        const isBlockedByStock = isEmpty && !canSellNegative;
                                        const marked = isMarkedProduct(product);

                                        return (
                                            <motion.div
                                                key={String(product.id)}
                                                whileHover={{ scale: isBlockedByStock ? 1 : 1.01 }}
                                                className={`flex justify-between items-center p-3 rounded-lg shadow-sm transition-shadow ${
                                                    isBlockedByStock
                                                        ? 'bg-red-50 cursor-not-allowed opacity-70'
                                                        : canSellNegative && isEmpty
                                                            ? 'bg-amber-50 hover:shadow-md cursor-pointer'
                                                            : 'bg-white hover:shadow-md cursor-pointer'
                                                }`}
                                                onClick={() => {
                                                    if (!isBlockedByStock) {
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

                                                    {marked && (
                                                        <div className="mt-1 inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">
                                                            Маркированный товар · нужен DataMatrix
                                                        </div>
                                                    )}

                                                    <div className={`text-sm ${
                                                        isEmpty && !canSellNegative
                                                            ? 'text-red-600'
                                                            : canSellNegative && isEmpty
                                                                ? 'text-amber-700'
                                                                : 'text-green-600'
                                                    }`}>
                                                        Остаток: {formatQuantity(stock, product.unit)}
                                                        {canSellNegative && isEmpty ? ' · можно продать в минус' : ''}
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
                                                    disabled={isBlockedByStock}
                                                    onClick={(e) => {
                                                        e.stopPropagation();

                                                        if (!isBlockedByStock) {
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
                                    const marked = isMarkedProduct(item.product);

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

                                                {marked && (
                                                    <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${getMarkingStatusClassName(item.markingStatus)}`}>
                                                        [{item.markingStatus || 'M'}] {item.markingStatus === 'M+' ? 'Маркировка проверена' : 'Маркировка не подтверждена'}
                                                        {item.markingCode ? ` · КМ: ${formatMarkingCodePreview(item.markingCode)}` : ' · DataMatrix не задан'}
                                                    </div>
                                                )}

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
                                                    {marked ? (
                                                        <span className="rounded-lg bg-purple-50 px-3 py-1 text-sm font-bold text-purple-700">
                                                            1 шт.
                                                        </span>
                                                    ) : item.product.unit === 'weight' ? (
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

                                {hasUnsafeMarkedCheckoutItems && (
                                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                                        В чеке есть маркированный товар без подтверждения [M+]. Оплата заблокирована.
                                    </div>
                                )}

                                <div className="flex flex-wrap justify-end gap-3 mt-5">
                                    <button
                                        type="button"
                                        onClick={holdCurrentCheckout}
                                        className="px-6 py-2 border border-amber-300 bg-amber-50 text-amber-800 rounded-lg hover:bg-amber-100 transition-colors"
                                    >
                                        Отложить чек
                                    </button>

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
                                        disabled={hasUnsafeMarkedCheckoutItems}
                                        className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Наличные
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => openPayment('transfer')}
                                        disabled={hasUnsafeMarkedCheckoutItems}
                                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Перевод
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => openPayment('card')}
                                        disabled={hasUnsafeMarkedCheckoutItems}
                                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
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
                {markingModalProduct && (
                    <div
                        key="marking-modal"
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
                        onClick={() => {
                            setMarkingModalProduct(null);
                            setMarkingCodeInput('');
                            setMarkingCheckResult(null);
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
                        >
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">
                                Сканирование DataMatrix
                            </h2>

                            <div className="mb-4 text-gray-600">
                                {markingModalProduct.name}
                            </div>

                            <div className="mb-5 rounded-xl border border-purple-100 bg-purple-50 p-4 text-sm text-purple-800">
                                Этот товар отмечен как маркированный. Для продажи отсканируйте DataMatrix с упаковки.
                                Один DataMatrix добавляется в чек отдельной позицией с количеством 1 шт.
                            </div>

                            <label className="mb-2 block text-sm font-medium text-gray-700">
                                DataMatrix / КМ
                            </label>

                            <textarea
                                autoFocus
                                disabled={isCheckingMarking}
                                value={markingCodeInput}
                                onChange={(e) => {
                                    setMarkingCodeInput(e.target.value);
                                    setMarkingCheckResult(null);
                                    setError(null);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        void addMarkedProductToCheckout(markingModalProduct, markingCodeInput);
                                    }
                                }}
                                placeholder="Отсканируйте код маркировки..."
                                className="mb-4 h-28 w-full resize-none rounded-xl border border-gray-300 px-4 py-3 font-mono text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100 disabled:opacity-70"
                            />

                            {isCheckingMarking && (
                                <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
                                    Проверяю код маркировки в ККТ / Честном ЗНАКе...
                                </div>
                            )}

                            {markingCheckResult && (
                                <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${getMarkingStatusClassName(markingCheckResult.markingStatus)}`}>
                                    <div className="text-lg">
                                        [{markingCheckResult.markingStatus || 'M'}]
                                    </div>

                                    <div>
                                        {markingCheckResult.message || 'Результат проверки маркировки получен'}
                                    </div>

                                    {markingCheckResult.markingStatus !== 'M+' && (
                                        <div className="mt-2 text-xs font-medium">
                                            Продажа этого товара заблокирована. Нужен только результат [M+].
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="mb-6 rounded-xl bg-gray-50 p-4">
                                <div className="text-sm text-gray-500">
                                    Цена:
                                </div>

                                <div className="text-3xl font-bold text-gray-800">
                                    {formatCurrency(getSellingPrice(markingModalProduct))}
                                </div>

                                <div className="mt-2 text-sm text-gray-500">
                                    Остаток: {formatQuantity(getStock(markingModalProduct), markingModalProduct.unit)}
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMarkingModalProduct(null);
                                        setMarkingCodeInput('');
                                        setMarkingCheckResult(null);
                                    }}
                                    className="px-5 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
                                >
                                    Отмена
                                </button>

                                <button
                                    type="button"
                                    disabled={isCheckingMarking}
                                    onClick={() => void addMarkedProductToCheckout(markingModalProduct, markingCodeInput)}
                                    className="px-5 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isCheckingMarking ? 'Проверяю...' : 'Проверить [M+] и добавить'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {weightModalProduct && (
                    <div
                        key="weight-modal"
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
                        onClick={() => {
                            setWeightModalProduct(null);
                            setWeightQuantity('');
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
                        >
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">
                                Весовой товар
                            </h2>

                            <div className="mb-5 text-gray-600">
                                {weightModalProduct.name}
                            </div>

                            <div className="mb-5 rounded-xl bg-indigo-50 p-4">
                                <div className="text-sm text-indigo-700">
                                    Цена за 1 кг:
                                </div>

                                <div className="text-3xl font-bold text-indigo-700">
                                    {formatCurrency(getSellingPrice(weightModalProduct))}
                                </div>

                                <div className="mt-2 text-sm text-indigo-700">
                                    Остаток: {formatQuantity(getStock(weightModalProduct), 'weight')}
                                </div>

                                <div className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800">
                                    Для весового товара разрешён минусовой остаток из-за погрешности веса.
                                </div>
                            </div>

                            <label className="mb-2 block text-sm font-medium text-gray-700">
                                Вес, кг
                            </label>

                            <input
                                type="number"
                                min="0.001"
                                step="0.001"
                                inputMode="decimal"
                                autoFocus
                                value={weightQuantity}
                                onChange={(e) => {
                                    setWeightQuantity(e.target.value);
                                    setError(null);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key !== 'Enter') {
                                        return;
                                    }

                                    const quantity = safeParseNumber(weightQuantity);

                                    if (quantity <= 0) {
                                        setError('Введите корректный вес');
                                        return;
                                    }

                                    addQuantityToCheckout(weightModalProduct, quantity);
                                    setWeightModalProduct(null);
                                    setWeightQuantity('');
                                }}
                                placeholder="Например 0.350"
                                className="mb-5 w-full rounded-xl border border-gray-300 px-4 py-3 text-2xl font-bold outline-none focus:border-transparent focus:ring-2 focus:ring-indigo-500"
                            />

                            <div className="mb-6 rounded-xl bg-gray-50 p-4">
                                <div className="text-sm text-gray-500">
                                    Сумма:
                                </div>

                                <div className="text-3xl font-bold text-gray-800">
                                    {formatCurrency(getSellingPrice(weightModalProduct) * safeParseNumber(weightQuantity))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setWeightModalProduct(null);
                                        setWeightQuantity('');
                                    }}
                                    className="px-5 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
                                >
                                    Отмена
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        const quantity = safeParseNumber(weightQuantity);

                                        if (quantity <= 0) {
                                            setError('Введите корректный вес');
                                            return;
                                        }

                                        addQuantityToCheckout(weightModalProduct, quantity);
                                        setWeightModalProduct(null);
                                        setWeightQuantity('');
                                    }}
                                    className="px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                                >
                                    Добавить в чек
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {isPriceLabelModalOpen && (
                    <div
                        key="price-label-modal"
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
                        onClick={() => setIsPriceLabelModalOpen(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            onClick={(e) => e.stopPropagation()}
                            className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden"
                        >
                            <div className="p-6 border-b border-gray-100">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h2 className="text-2xl font-bold text-gray-800">
                                            Печать ценников и термоэтикеток 58×40 мм
                                        </h2>

                                        <p className="text-sm text-gray-500 mt-1">
                                            Выберите товары, укажите количество ценников и печатайте на лист A4 или на XPrinter в одну колонку без принудительного A4.
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setIsPriceLabelModalOpen(false)}
                                        className="text-2xl text-gray-400 hover:text-gray-600"
                                    >
                                        ×
                                    </button>
                                </div>

                                <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(280px,1fr)_260px_auto_auto_auto]">
                                    <input
                                        type="text"
                                        value={priceLabelSearch}
                                        onChange={(e) => setPriceLabelSearch(e.target.value)}
                                        placeholder="Поиск по названию, категории, штрихкоду или цене..."
                                        className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                                    />

                                    <select
                                        value={priceLabelCategoryFilter}
                                        onChange={(e) => setPriceLabelCategoryFilter(e.target.value)}
                                        className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="all">Все категории</option>
                                        {priceLabelCategories.map(category => (
                                            <option key={category} value={category}>
                                                {category}
                                            </option>
                                        ))}
                                    </select>

                                    <button
                                        type="button"
                                        onClick={async () => {
                                            try {
                                                setIsRefreshingLabels(true);
                                                setError(null);
                                                setNotice(null);

                                                await refreshProducts();

                                                setNotice('Цены для ценников обновлены');
                                            } catch (err) {
                                                console.error(err);
                                                setError('Не удалось обновить цены');
                                            } finally {
                                                setIsRefreshingLabels(false);
                                            }
                                        }}
                                        disabled={isRefreshingLabels}
                                        className="rounded-xl border border-gray-300 px-4 py-3 hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        {isRefreshingLabels ? 'Обновляю...' : 'Обновить цены'}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={selectAllFilteredPriceLabels}
                                        className="rounded-xl border border-gray-300 px-4 py-3 hover:bg-gray-50"
                                    >
                                        Выбрать найденные
                                    </button>

                                    <button
                                        type="button"
                                        onClick={clearSelectedPriceLabels}
                                        className="rounded-xl border border-gray-300 px-4 py-3 hover:bg-gray-50"
                                    >
                                        Снять выбор
                                    </button>
                                </div>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-gray-50 text-gray-600 z-10">
                                    <tr>
                                        <th className="p-3 text-left w-12"></th>
                                        <th className="p-3 text-left">Товар</th>
                                        <th className="p-3 text-left">Штрихкод из БД</th>
                                        <th className="p-3 text-left">Ед.</th>
                                        <th className="p-3 text-right">Цена</th>
                                        <th className="p-3 text-center w-36">Кол-во ценников</th>
                                    </tr>
                                    </thead>

                                    <tbody>
                                    {priceLabelProducts.map(product => {
                                        const selected = selectedPriceLabelIds.includes(String(product.id));

                                        return (
                                            <tr
                                                key={String(product.id)}
                                                className="border-t border-gray-100 hover:bg-gray-50"
                                            >
                                                <td className="p-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={selected}
                                                        onChange={() => togglePriceLabelProduct(product.id)}
                                                        className="h-4 w-4"
                                                    />
                                                </td>

                                                <td className="p-3">
                                                    <div className="font-medium text-gray-800">
                                                        {product.name}
                                                    </div>

                                                    <div className="text-xs text-gray-500">
                                                        {product.category || 'Без категории'}
                                                    </div>
                                                </td>

                                                <td className="p-3 font-mono text-xs text-gray-500">
                                                    {product.barcode ? getBarcodeDisplay(product.barcode) : 'Штрихкод не задан'}
                                                </td>

                                                <td className="p-3">
                                                    {product.unit === 'weight' ? 'кг' : 'шт.'}
                                                </td>

                                                <td className="p-3 text-right font-bold text-indigo-700">
                                                    {Math.ceil(getSellingPrice(product))} ₽ {getUnitPriceLabel(product)}
                                                </td>

                                                <td className="p-3 text-center">
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="999"
                                                        step="1"
                                                        value={getPriceLabelQuantity(product.id)}
                                                        onChange={(e) => updatePriceLabelQuantity(product.id, e.target.value)}
                                                        className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-center font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    </tbody>
                                </table>

                                {priceLabelProducts.length === 0 && (
                                    <div className="p-8 text-center text-gray-400">
                                        Товары не найдены
                                    </div>
                                )}
                            </div>

                            <div className="flex-none border-t border-gray-100 bg-slate-50 p-5">
                                <div className="mb-4 flex flex-wrap gap-2 text-sm text-gray-600">
                                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5">
                                        Выбрано товаров: <span className="font-bold text-gray-900">{selectedPriceLabelIds.length}</span>
                                    </span>

                                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5">
                                        Ценников выбранных: <span className="font-bold text-gray-900">{selectedPriceLabelPrintCount}</span>
                                    </span>

                                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5">
                                        Найдено товаров: <span className="font-bold text-gray-900">{priceLabelProducts.length}</span>
                                    </span>

                                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5">
                                        Ценников найденных: <span className="font-bold text-gray-900">{filteredPriceLabelPrintCount}</span>
                                    </span>

                                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5">
                                        Всего в базе: <span className="font-bold text-gray-900">{allProducts.length}</span>
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                    <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
                                        <div className="flex items-start gap-3">
                                            <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600">
                                                <AiOutlinePrinter size={22} />
                                            </div>

                                            <div>
                                                <div className="font-bold text-gray-900">
                                                    Лист A4
                                                </div>

                                                <div className="text-xs text-gray-500">
                                                    Обычная печать на лист: 58×40 мм, сетка в несколько колонок.
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                                            <button
                                                type="button"
                                                onClick={() => printPriceLabels('selected', 'a4')}
                                                disabled={isRefreshingLabels || selectedPriceLabelIds.length === 0}
                                                className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                Выбранные
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => printPriceLabels('filtered', 'a4')}
                                                disabled={isRefreshingLabels || priceLabelProducts.length === 0}
                                                className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                Найденные
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => printPriceLabels('all', 'a4')}
                                                disabled={isRefreshingLabels || allProducts.length === 0}
                                                className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                Вся база
                                            </button>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                                        <div className="flex items-start gap-3">
                                            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
                                                <AiOutlinePrinter size={22} />
                                            </div>

                                            <div>
                                                <div className="font-bold text-gray-900">
                                                    XPrinter 58×40
                                                </div>

                                                <div className="text-xs text-gray-500">
                                                    Термоэтикетки: одна этикетка 58×40 мм на одну страницу, без A4.
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                                            <button
                                                type="button"
                                                onClick={() => printPriceLabels('selected', 'thermal')}
                                                disabled={isRefreshingLabels || selectedPriceLabelIds.length === 0}
                                                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                Выбранные
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => printPriceLabels('filtered', 'thermal')}
                                                disabled={isRefreshingLabels || priceLabelProducts.length === 0}
                                                className="rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                Найденные
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => printPriceLabels('all', 'thermal')}
                                                disabled={isRefreshingLabels || allProducts.length === 0}
                                                className="rounded-xl bg-slate-700 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                Вся база
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {isHeldReceiptsModalOpen && (
                    <div
                        key="held-receipts-modal"
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
                        onClick={() => setIsHeldReceiptsModalOpen(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            onClick={(e) => e.stopPropagation()}
                            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                        >
                            <div className="border-b border-gray-100 p-6">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h2 className="text-2xl font-bold text-gray-800">
                                            Отложенные чеки
                                        </h2>

                                        <p className="mt-1 text-sm text-gray-500">
                                            Чеки хранятся только в локальном состоянии кассы и не попадают в БД до оплаты.
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setIsHeldReceiptsModalOpen(false)}
                                        className="text-2xl text-gray-400 hover:text-gray-600"
                                    >
                                        ×
                                    </button>
                                </div>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto p-6">
                                {heldCheckouts.length === 0 ? (
                                    <div className="rounded-xl bg-gray-50 px-4 py-8 text-center text-gray-500">
                                        Отложенных чеков пока нет
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {heldCheckouts.map(held => {
                                            const title = getHeldCheckoutTitle(held);
                                            const heldTotal = held.total || held.items.reduce((sum, item) => {
                                                return sum + safeParseNumber(item.product?.sellingPrice ?? item.product?.selling_price) * safeParseNumber(item.quantity);
                                            }, 0);

                                            return (
                                                <div
                                                    key={held.id}
                                                    className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                                                >
                                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                        <div className="min-w-0">
                                                            <div className="font-bold text-gray-900">
                                                                {title}
                                                            </div>

                                                            <div className="mt-1 text-xs text-gray-500">
                                                                Создан: {new Date(held.createdAt).toLocaleString('ru-RU')} · Позиций: {held.items.length}
                                                            </div>

                                                            <div className="mt-2 space-y-1 text-sm text-gray-600">
                                                                {held.items.slice(0, 3).map((item, index) => (
                                                                    <div key={`${held.id}-${index}`} className="truncate">
                                                                        {item.product?.name || 'Товар'} × {formatQuantity(safeParseNumber(item.quantity), item.product?.unit)}
                                                                        {item.markingStatus ? ` · [${item.markingStatus}]` : ''}
                                                                    </div>
                                                                ))}

                                                                {held.items.length > 3 && (
                                                                    <div className="text-xs text-gray-400">
                                                                        + ещё {held.items.length - 3}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="shrink-0 text-left sm:text-right">
                                                            <div className="text-2xl font-bold text-indigo-700">
                                                                {formatCurrency(heldTotal)}
                                                            </div>

                                                            <div className="mt-3 flex flex-wrap justify-start gap-2 sm:justify-end">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => restoreHeldCheckout(held)}
                                                                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                                                                >
                                                                    Открыть
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    onClick={() => deleteHeldCheckout(held)}
                                                                    className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                                                                >
                                                                    Удалить
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
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
                                {hasMarkedCheckoutItems && (
                                    <div className="mt-2 font-semibold">
                                        В чеке есть маркированный товар — он обязательно будет пробит на ККТ.
                                    </div>
                                )}
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
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
                        >
                            <h2 className="mb-4 text-2xl font-bold text-gray-800">
                                Оплата наличными
                            </h2>

                            <div className="mb-5 rounded-xl bg-emerald-50 p-4">
                                <div className="mb-1 text-sm text-emerald-700">
                                    Сумма к оплате:
                                </div>

                                <div className="text-4xl font-bold text-emerald-700">
                                    {formatCurrency(total)}
                                </div>

                                {hasMarkedCheckoutItems && (
                                    <div className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-sm font-semibold text-emerald-800">
                                        В чеке есть маркированный товар — чек будет пробит на ККТ.
                                    </div>
                                )}
                            </div>

                            <div className="mb-4">
                                <label className="mb-2 block text-sm font-medium text-gray-700">
                                    Получено от клиента
                                </label>

                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    inputMode="decimal"
                                    autoFocus
                                    value={cashReceived}
                                    onChange={(e) => {
                                        setCashReceived(e.target.value);
                                        setError(null);
                                    }}
                                    placeholder="Введите сумму"
                                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-2xl font-bold outline-none focus:border-transparent focus:ring-2 focus:ring-emerald-500"
                                />
                            </div>

                            <div className="mb-4 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    disabled={isPaying}
                                    onClick={() => {
                                        setCashReceived(String(total));
                                        setError(null);
                                    }}
                                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Без сдачи
                                </button>

                                <button
                                    type="button"
                                    disabled={isPaying}
                                    onClick={() => {
                                        setCashReceived(String(Math.ceil(total / 100) * 100));
                                        setError(null);
                                    }}
                                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Округлить до 100 ₽
                                </button>

                                <button
                                    type="button"
                                    disabled={isPaying}
                                    onClick={() => {
                                        setCashReceived('');
                                        setError(null);
                                    }}
                                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Очистить
                                </button>
                            </div>

                            <div className={`mb-6 rounded-xl p-4 ${
                                cashReceived && change >= 0
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'bg-gray-50 text-gray-500'
                            }`}>
                                <div className="text-sm">
                                    Сдача:
                                </div>

                                <div className="text-3xl font-bold">
                                    {cashReceived ? formatCurrency(Math.max(0, change)) : formatCurrency(0)}
                                </div>

                                {cashReceived && change < 0 && (
                                    <div className="mt-2 text-sm text-red-600">
                                        Полученная сумма меньше суммы чека
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    disabled={isPaying}
                                    onClick={() => {
                                        setPaymentModal(null);
                                        setCashReceived('');
                                        setError(null);
                                    }}
                                    className="rounded-lg border border-gray-300 px-5 py-2 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Отмена
                                </button>

                                <button
                                    type="button"
                                    disabled={isPaying || cashReceivedNumber < total}
                                    onClick={() => setFiscalConfirmModal(true)}
                                    className="rounded-lg bg-emerald-600 px-5 py-2 text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {isPaying ? 'Провожу оплату...' : 'Оплата получена'}
                                </button>
                            </div>
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
                                {hasMarkedCheckoutItems && (
                                    <div className="mt-2 font-semibold">
                                        В чеке есть маркированный товар — чек будет пробит на ККТ.
                                    </div>
                                )}
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

                {fiscalConfirmModal && (paymentModal === 'card' || paymentModal === 'cash') && (
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
                                    Сумма оплаты {paymentModal === 'cash' ? 'наличными' : 'картой'}:
                                </div>

                                <div className={paymentModal === 'cash' ? 'text-3xl font-bold text-emerald-700' : 'text-3xl font-bold text-indigo-700'}>
                                    {formatCurrency(total)}
                                </div>

                                {paymentModal === 'cash' && (
                                    <div className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                                        <div className="flex justify-between">
                                            <span>Получено:</span>
                                            <span className="font-bold">{formatCurrency(cashReceivedNumber)}</span>
                                        </div>

                                        <div className="mt-1 flex justify-between">
                                            <span>Сдача:</span>
                                            <span className="font-bold">{formatCurrency(Math.max(0, change))}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 mb-6">
                                Фискализация будет отправлена на локальную ККТ АТОЛ.
                                {hasMarkedCheckoutItems
                                    ? ' В чеке есть маркированный товар, поэтому сохранить продажу без ККТ нельзя.'
                                    : ' Если чек пробивать не нужно, продажа сохранится без отправки в ККТ.'}
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    disabled={isPaying || hasMarkedCheckoutItems}
                                    onClick={() => {
                                        if (!paymentModal) {
                                            return;
                                        }

                                        setFiscalConfirmModal(false);
                                        completePayment(paymentModal, false);
                                    }}
                                    className="px-5 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    {hasMarkedCheckoutItems ? 'Без ККТ нельзя для маркировки' : 'Нет, сохранить без ККТ'}
                                </button>

                                <button
                                    type="button"
                                    disabled={isPaying || !isShiftOpen}
                                    onClick={() => {
                                        if (!paymentModal) {
                                            return;
                                        }

                                        setFiscalConfirmModal(false);
                                        completePayment(paymentModal, true);
                                    }}
                                    className={paymentModal === 'cash'
                                        ? 'px-5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50'
                                        : 'px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50'}
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

                                        {item.marked && (
                                            <div className="mt-1 text-xs font-semibold text-emerald-700">
                                                [{item.markingStatus || 'M+'}] Маркировка проверена
                                                {item.markingCode ? ` · КМ: ${formatMarkingCodePreview(item.markingCode)}` : ''}
                                            </div>
                                        )}

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

                            <div className="mt-6 flex flex-wrap justify-end gap-3">
                                {lastReceipt.fiscalStatus === 'success' && (
                                    <button
                                        type="button"
                                        onClick={repeatLastFiscalReceipt}
                                        disabled={isShiftActionLoading}
                                        className="px-6 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        Копия чека ККТ
                                    </button>
                                )}

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
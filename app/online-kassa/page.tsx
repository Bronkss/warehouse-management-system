"use client";

import AtolAgentSetup from "@/app/components/AtolAgentSetup";
import PosCashDrawer from "@/app/components/PosCashDrawer";
import MixedPaymentModal from "@/app/components/MixedPaymentModal";
import {
    usePosCheckoutStore,
    type HeldCheckout,
    type StoredCheckoutItem,
} from "./pos-checkout-store";
import {
    deletePosBackgroundJob,
    enqueuePosBackgroundSale,
    getAllPosBackgroundJobs,
    markPosBackgroundJobFailed,
    markPosBackgroundJobProcessing,
    resetInterruptedPosJobs,
    retryPosBackgroundJob,
    type PosBackgroundSaleJob,
} from "./pos-sale-background-queue";
import JsBarcode from "jsbarcode";
import {useRouter} from "next/navigation";
import {
    canUseWarehouseSection,
    getFirstAllowedRouteForLocation,
} from "@/app/lib/warehouseAccess";
import {
    useState,
    useEffect,
    useMemo,
    useRef,
    useCallback,
    type KeyboardEvent,
} from "react";
import {motion, AnimatePresence} from "framer-motion";
import {
    AiOutlineDelete,
    AiOutlinePlus,
    AiOutlineMinus,
    AiOutlineScan,
    AiOutlineSearch,
    AiOutlinePrinter,
} from "react-icons/ai";
import {
    getBarcodeDisplay,
    getPrimaryBarcode,
    hasBarcodeSearchMatch,
    hasExactBarcode,
} from "../utils/barcodes";

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
    unit?: "piece" | "weight" | string;
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

type DeliveryAlertOrder = {
    id: string;
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    address: string;
    total: number;
    createdAt: string;
};

type MarkingStatus = "M+" | "M-" | "M";
type MarkingPackageMode = "single" | "block";

const CIGARETTE_BLOCK_QUANTITY = 10;

type CheckoutItem = {
    product: Product;
    id: string;
    quantity: number;
    markingCode?: string;
    markingStatus?: MarkingStatus;
    markingMessage?: string;
    markingCheckedAt?: string;
    markingPackageMode?: MarkingPackageMode;
    markingPackageQuantity?: number;
};

type ReturnCheckoutItem = {
    product: Product
    quantity: number
}

type PaymentMethod = "card" | "cash" | "transfer" | "mixed";

type ReceiptItem = {
    productId: ProductId;
    name: string;
    barcode?: string;
    category?: string;
    unit?: string;
    quantity: number;
    price: number;
    total: number;
    stockQuantity?: number;
    fiscalQuantity?: number;
    fiscalPrice?: number;
    fiscalTotal?: number;
    fiscalPackageName?: string;
    measureCode?: number;
    measureName?: string;
    marked?: boolean;
    markingCode?: string;
    markingStatus?: MarkingStatus;
    markingMessage?: string;
    markingPackageMode?: MarkingPackageMode;
    markingPackageQuantity?: number;
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

type FiscalQueueStatus =
    | "pending"
    | "processing"
    | "done"
    | "failed";

type FiscalQueueJob = {
    id: string;
    receiptId: string;
    status: FiscalQueueStatus;
    createdAt: string;
    updatedAt: string;
    startedAt?: string | null;
    completedAt?: string | null;
    attempts: number;
    error?: string | null;
    hasMarkedItems: boolean;
    itemCount: number;
    total: number;
    paymentMethod?: string | null;
    result?: {
        ok?: boolean;
        mode?: string | null;
        fiscal?: {
            uuid?: string | null;
            fiscalParams?: FiscalParams | null;
        } | null;
    } | null;
};

type FiscalQueueSnapshot = {
    counts: {
        pending: number;
        processing: number;
        done: number;
        failed: number;
    };
    workerRunning: boolean;
    jobs: FiscalQueueJob[];
};

type FiscalEnqueueResponse = {
    ok?: boolean;
    accepted?: boolean;
    duplicated?: boolean;
    job?: FiscalQueueJob;
    queue?: FiscalQueueSnapshot["counts"];
    message?: string;
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
    receiptNumber?: string;
    createdAt: string;
    paymentMethod: PaymentMethod;
    paymentLabel: string;
    items: ReceiptItem[];
    total: number;
    receivedAmount?: number;
    change?: number;
    cashAmount?: number;
    cardAmount?: number;
    transferAmount?: number;
    customerName?: string;
    fiscalizationRequested?: boolean;
    fiscalStatus?: "queued" | "processing" | "success" | "skipped" | "failed";
    fiscalUuid?: string;
    fiscalParams?: FiscalParams;
    fiscalRaw?: unknown;
    cashierName?: string;
    cashierLogin?: string;
    locationName?: string;
    locationSlug?: string;
};

type ApiError = {
    message?: string;
};

type PrintMode = "selected" | "filtered" | "all";
type PrintLayout = "a4" | "thermal";

type PriceLabelQuantityMap = Record<string, number>;

type PendingPriceLabelPrint = {
    mode: PrintMode;
    layout: PrintLayout;
};

type CommodityReceiptPrintStep = "ask" | "paper-warning";

type PosNotificationKind =
    | "notice"
    | "error"
    | "system";

type PosNotificationEntry = {
    id: string;
    kind: PosNotificationKind;
    message: string;
    createdAt: string;
};

type UsedMarkingCodeEntry = {
    code: string;
    fingerprint: string;
    productName: string;
    receiptId: string;
    usedAt: string;
};

const PRODUCTS_PAGE_LIMIT = 100;
const SEARCH_LIMIT = 30;
const TOAST_AUTO_CLOSE_MS = 10_000;

const AUTH_USER_KEY = "warehouse_auth_user";
const AUTH_LOGIN_KEY = "warehouse_auth_login";
const REMEMBER_ME_KEY = "warehouse_remember_me";
const AUTH_LOCATION_SLUG_KEY = "warehouse_location_slug";
const AUTH_LOCATION_NAME_KEY = "warehouse_location_name";
const AUTH_LOCATION_TYPE_KEY = "warehouse_location_type";
const AUTH_USER_NAME_KEY = "warehouse_user_name";
const AUTH_USER_ROLE_KEY = "warehouse_user_role";
const WAREHOUSE_LOCATION_HEADER = "x-warehouse-location";
const WAREHOUSE_USER_LOGIN_HEADER = "x-warehouse-user-login";
const WAREHOUSE_USER_ROLE_HEADER = "x-warehouse-user-role";
const DEFAULT_LOCATION_SLUG = "tochka";
const DEFAULT_LOCATION_NAME = "ТОЧКА";

const DEFAULT_FISCAL_AGENT_URL = "http://127.0.0.1:3108";
const FISCAL_AGENT_URL_KEY = "pos_fiscal_agent_url";
const FISCAL_AGENT_TOKEN_KEY = "pos_fiscal_agent_token";
const SHIFT_STATUS_KEY = "pos_kkt_shift_status";
const LAST_COMMODITY_RECEIPT_KEY = "pos_last_commodity_receipt";
const HELD_CHECKOUT_NAMES_KEY = "pos_held_checkout_names_v1";
const POS_NOTIFICATION_LOG_KEY = "pos_shift_notification_log_v1";
const POS_NOTIFICATION_READ_AT_KEY = "pos_shift_notification_read_at_v1";
const POS_CLOCK_CORRECTION_MS_KEY = "pos_clock_correction_ms_v1";
const USED_MARKING_CODES_KEY = "pos_used_marking_codes_v1";
const CLOSING_REMINDER_ACK_PREFIX = "pos_closing_reminder_ack_v1:";
const MAX_POS_NOTIFICATION_LOG = 250;
const MAX_USED_MARKING_CODES = 10_000;
const UTC7_OFFSET_MS = 7 * 60 * 60 * 1000;

type ShiftStatus = "unknown" | "open" | "closed";

const getCurrentLocationSlug = (): string => {
    if (typeof window === "undefined") {
        return DEFAULT_LOCATION_SLUG;
    }

    return (
        String(
            sessionStorage.getItem(AUTH_LOCATION_SLUG_KEY) ||
            localStorage.getItem(AUTH_LOCATION_SLUG_KEY) ||
            DEFAULT_LOCATION_SLUG,
        ).trim() || DEFAULT_LOCATION_SLUG
    );
};

const getCurrentLocationName = (): string => {
    if (typeof window === "undefined") {
        return DEFAULT_LOCATION_NAME;
    }

    return (
        String(
            sessionStorage.getItem(AUTH_LOCATION_NAME_KEY) ||
            localStorage.getItem(AUTH_LOCATION_NAME_KEY) ||
            DEFAULT_LOCATION_NAME,
        ).trim() || DEFAULT_LOCATION_NAME
    );
};

const getCurrentLocationType = (): string => {
    if (typeof window === "undefined") {
        return "store";
    }

    return (
        String(
            sessionStorage.getItem(AUTH_LOCATION_TYPE_KEY) ||
            localStorage.getItem(AUTH_LOCATION_TYPE_KEY) ||
            "store",
        ).trim() || "store"
    );
};

const getCurrentUserLogin = (): string => {
    if (typeof window === "undefined") {
        return "";
    }

    return String(
        sessionStorage.getItem(AUTH_USER_KEY) ||
        localStorage.getItem(AUTH_USER_KEY) ||
        localStorage.getItem(AUTH_LOGIN_KEY) ||
        "",
    ).trim();
};

const getCurrentUserName = (): string => {
    if (typeof window === "undefined") {
        return "Кассир";
    }

    return String(
        sessionStorage.getItem(AUTH_USER_NAME_KEY) ||
        localStorage.getItem(AUTH_USER_NAME_KEY) ||
        getCurrentUserLogin() ||
        "Кассир",
    ).trim();
};

const getCurrentUserRole = (): string => {
    if (typeof window === "undefined") {
        return "cashier";
    }

    return String(
        sessionStorage.getItem(AUTH_USER_ROLE_KEY) ||
        localStorage.getItem(AUTH_USER_ROLE_KEY) ||
        "cashier",
    ).trim();
};

const getLocationHeaders = (): HeadersInit => {
    return {
        [WAREHOUSE_LOCATION_HEADER]: getCurrentLocationSlug(),
        [WAREHOUSE_USER_LOGIN_HEADER]: getCurrentUserLogin(),
        [WAREHOUSE_USER_ROLE_HEADER]: getCurrentUserRole(),
    };
};

const safeParseNumber = (value: unknown): number => {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === "string") {
        const parsed = parseFloat(value.replace(",", ".").replace(/\s/g, ""));
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
    if (typeof value === "boolean") {
        return value;
    }

    if (typeof value === "number") {
        return value === 1;
    }

    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();

        return ["1", "true", "yes", "y", "да", "маркированный", "marked"].includes(
            normalized,
        );
    }

    return false;
};

const isMarkedProduct = (product: Product): boolean => {
    return normalizeBooleanFlag(
        product.marked ??
        product.isMarked ??
        product.is_marked ??
        product.marking ??
        product.markedProduct,
    );
};

const normalizeMarkingCode = (value: unknown): string => {
    return String(value ?? "")
        .replaceAll("\\u001d", "\u001d")
        .replaceAll("\\x1d", "\u001d")
        .replaceAll("<GS>", "\u001d")
        .replaceAll("[GS]", "\u001d")
        .trim();
};

const formatMarkingCodePreview = (value: unknown): string => {
    const code = normalizeMarkingCode(value);

    if (code.length <= 22) {
        return code;
    }

    return `${code.slice(0, 14)}…${code.slice(-6)}`;
};

const getMarkingCodeFingerprint = (value: unknown): string => {
    return normalizeMarkingCode(value)
        .replaceAll("\u001d", "")
        .trim();
};

const readPosNotificationLog = (): PosNotificationEntry[] => {
    if (typeof window === "undefined") {
        return [];
    }

    try {
        const raw = localStorage.getItem(POS_NOTIFICATION_LOG_KEY);

        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw);

        return Array.isArray(parsed)
            ? parsed.filter(
                (item): item is PosNotificationEntry =>
                    Boolean(
                        item &&
                        typeof item.id === "string" &&
                        typeof item.message === "string" &&
                        typeof item.createdAt === "string",
                    ),
            )
            : [];
    } catch {
        return [];
    }
};

const savePosNotificationLog = (
    entries: PosNotificationEntry[],
) => {
    if (typeof window === "undefined") {
        return;
    }

    try {
        localStorage.setItem(
            POS_NOTIFICATION_LOG_KEY,
            JSON.stringify(
                entries.slice(-MAX_POS_NOTIFICATION_LOG),
            ),
        );
    } catch (error) {
        console.warn(
            "POS notification log save error:",
            error,
        );
    }
};

const readUsedMarkingCodes = (): UsedMarkingCodeEntry[] => {
    if (typeof window === "undefined") {
        return [];
    }

    try {
        const raw = localStorage.getItem(USED_MARKING_CODES_KEY);

        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw);

        return Array.isArray(parsed)
            ? parsed.filter(
                (item): item is UsedMarkingCodeEntry =>
                    Boolean(
                        item &&
                        typeof item.code === "string" &&
                        typeof item.fingerprint === "string" &&
                        typeof item.receiptId === "string" &&
                        typeof item.usedAt === "string",
                    ),
            )
            : [];
    } catch {
        return [];
    }
};

const hasUsedMarkingCodeLocally = (
    markingCode: unknown,
): boolean => {
    const fingerprint =
        getMarkingCodeFingerprint(markingCode);

    if (!fingerprint) {
        return false;
    }

    return readUsedMarkingCodes().some(
        entry =>
            entry.fingerprint ===
            fingerprint,
    );
};

const rememberReceiptMarkingCodesLocally = (
    receipt: Receipt,
) => {
    if (typeof window === "undefined") {
        return;
    }

    const markingItems =
        receipt.items.filter(
            item =>
                item.marked &&
                Boolean(
                    normalizeMarkingCode(
                        item.markingCode,
                    ),
                ),
        );

    if (markingItems.length === 0) {
        return;
    }

    try {
        const existing =
            readUsedMarkingCodes();

        const byFingerprint =
            new Map<
                string,
                UsedMarkingCodeEntry
            >();

        for (const entry of existing) {
            byFingerprint.set(
                entry.fingerprint,
                entry,
            );
        }

        const usedAt =
            new Date().toISOString();

        for (const item of markingItems) {
            const code =
                normalizeMarkingCode(
                    item.markingCode,
                );

            const fingerprint =
                getMarkingCodeFingerprint(
                    code,
                );

            if (!fingerprint) {
                continue;
            }

            byFingerprint.set(
                fingerprint,
                {
                    code,
                    fingerprint,
                    productName:
                    item.name,
                    receiptId:
                        String(
                            receipt.id ||
                            receipt.receiptNumber ||
                            "",
                        ),
                    usedAt,
                },
            );
        }

        const next =
            Array.from(
                byFingerprint.values(),
            )
                .sort(
                    (a, b) =>
                        a.usedAt.localeCompare(
                            b.usedAt,
                        ),
                )
                .slice(
                    -MAX_USED_MARKING_CODES,
                );

        localStorage.setItem(
            USED_MARKING_CODES_KEY,
            JSON.stringify(next),
        );
    } catch (error) {
        console.error(
            "Used marking codes save error:",
            error,
        );
    }
};

const readPosClockCorrectionMs = (): number => {
    if (typeof window === "undefined") {
        return 0;
    }

    const raw =
        localStorage.getItem(
            POS_CLOCK_CORRECTION_MS_KEY,
        );

    const parsed =
        Number(
            raw ||
            0,
        );

    return Number.isFinite(parsed)
        ? parsed
        : 0;
};

const savePosClockCorrectionMs = (
    value: number,
) => {
    if (typeof window === "undefined") {
        return;
    }

    const safeValue =
        Number.isFinite(value)
            ? Math.round(value)
            : 0;

    localStorage.setItem(
        POS_CLOCK_CORRECTION_MS_KEY,
        String(safeValue),
    );
};

const getPosClockShiftedDate = (
    date = new Date(),
    correctionMs = 0,
): Date => {
    return new Date(
        date.getTime() +
        UTC7_OFFSET_MS +
        correctionMs,
    );
};

const formatPosClockTime = (
    date = new Date(),
    correctionMs = 0,
): string => {
    const shifted =
        getPosClockShiftedDate(
            date,
            correctionMs,
        );

    return shifted.toLocaleTimeString(
        "ru-RU",
        {
            timeZone: "UTC",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
        },
    );
};

const formatPosClockDate = (
    date = new Date(),
    correctionMs = 0,
): string => {
    const shifted =
        getPosClockShiftedDate(
            date,
            correctionMs,
        );

    return shifted.toLocaleDateString(
        "ru-RU",
        {
            timeZone: "UTC",
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        },
    );
};

const formatPosDateTime = (
    value: string | Date,
    correctionMs = 0,
): string => {
    const date =
        value instanceof Date
            ? value
            : new Date(value);

    const shifted =
        getPosClockShiftedDate(
            date,
            correctionMs,
        );

    return shifted.toLocaleString(
        "ru-RU",
        {
            timeZone: "UTC",
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
        },
    );
};

const getPosClockDateKey = (
    date = new Date(),
    correctionMs = 0,
): string => {
    const shifted =
        getPosClockShiftedDate(
            date,
            correctionMs,
        );

    const year =
        shifted.getUTCFullYear();

    const month =
        String(
            shifted.getUTCMonth() + 1,
        ).padStart(
            2,
            "0",
        );

    const day =
        String(
            shifted.getUTCDate(),
        ).padStart(
            2,
            "0",
        );

    return `${year}-${month}-${day}`;
};

const getPosClockHour = (
    date = new Date(),
    correctionMs = 0,
): number => {
    return getPosClockShiftedDate(
        date,
        correctionMs,
    ).getUTCHours();
};

const toPosDatetimeLocalValue = (
    date = new Date(),
    correctionMs = 0,
): string => {
    const shifted =
        getPosClockShiftedDate(
            date,
            correctionMs,
        );

    const year =
        shifted.getUTCFullYear();

    const month =
        String(
            shifted.getUTCMonth() + 1,
        ).padStart(
            2,
            "0",
        );

    const day =
        String(
            shifted.getUTCDate(),
        ).padStart(
            2,
            "0",
        );

    const hours =
        String(
            shifted.getUTCHours(),
        ).padStart(
            2,
            "0",
        );

    const minutes =
        String(
            shifted.getUTCMinutes(),
        ).padStart(
            2,
            "0",
        );

    return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const getClockCorrectionFromDatetimeLocal = (
    rawValue: string,
): number | null => {
    const match =
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(
            rawValue,
        );

    if (!match) {
        return null;
    }

    const [
        ,
        yearRaw,
        monthRaw,
        dayRaw,
        hourRaw,
        minuteRaw,
    ] = match;

    const desiredUtcLike =
        Date.UTC(
            Number(yearRaw),
            Number(monthRaw) - 1,
            Number(dayRaw),
            Number(hourRaw),
            Number(minuteRaw),
            0,
            0,
        );

    if (!Number.isFinite(desiredUtcLike)) {
        return null;
    }

    const automaticUtc7 =
        Date.now() +
        UTC7_OFFSET_MS;

    return desiredUtcLike -
        automaticUtc7;
};

const isBrowserF11Fullscreen = (): boolean => {
    if (typeof window === "undefined") {
        return false;
    }

    const screenWidth =
        window.screen?.width ||
        0;

    const screenHeight =
        window.screen?.height ||
        0;

    if (
        screenWidth <= 0 ||
        screenHeight <= 0
    ) {
        return false;
    }

    const widthDifference =
        Math.abs(
            window.innerWidth -
            screenWidth,
        );

    const heightDifference =
        Math.abs(
            window.innerHeight -
            screenHeight,
        );

    // В F11 браузер практически полностью занимает физический экран.
    // Небольшой допуск нужен из-за масштабирования Windows / DPR.
    return (
        widthDifference <= 8 &&
        heightDifference <= 8
    );
};

const normalizeProduct = (product: Product): Product => {
    return {
        ...product,
        sellingPrice: getSellingPrice(product),
        purchasePrice: getPurchasePrice(product),
        stock: getStock(product),
        minStock: getMinStock(product),
        unit: product.unit || "piece",
        category: product.category || "Другое",
        barcode: product.barcode || "",
        image: product.image || "",
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
        typeof data === "object" &&
        data !== null &&
        "items" in data &&
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

const getMeasureCode = (unit: unknown): number => {
    return String(unit || "")
        .trim()
        .toLowerCase() === "weight"
        ? 11
        : 0;
};

const getMeasureName = (unit: unknown): string => {
    return getMeasureCode(unit) === 11 ? "кг" : "шт.";
};

const formatCurrency = (amount: number | undefined | null): string => {
    const safeAmount =
        typeof amount === "number" && Number.isFinite(amount) ? amount : 0;

    return new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: "RUB",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(safeAmount);
};

const isWeightProduct = (product: Product): boolean => {
    return product.unit === "weight";
};

const roundMoney = (value: number): number => {
    return Math.round(
        (Number(value || 0) + Number.EPSILON) * 100,
    ) / 100;
};

const getRoundedSaleLineTotal = (
    product: Product,
    quantity: number,
): number => {
    const rawTotal =
        getSellingPrice(product) *
        Number(quantity || 0);

    if (isWeightProduct(product)) {
        // Весовые товары всегда округляем вверх до полного рубля.
        // Небольшой EPSILON защищает от случаев вроде 428.00000000001.
        return Math.ceil(
            rawTotal -
            Number.EPSILON,
        );
    }

    return roundMoney(
        rawTotal,
    );
};

const getFiscalUnitPriceForRoundedWeight = (
    product: Product,
    quantity: number,
    roundedLineTotal: number,
): number => {
    const originalPrice =
        getSellingPrice(product);

    if (
        !isWeightProduct(product) ||
        !Number.isFinite(quantity) ||
        quantity <= 0
    ) {
        return originalPrice;
    }

    const target =
        roundMoney(
            roundedLineTotal,
        );

    // АТОЛ проверяет взаимосвязь price × quantity = amount.
    // После округления строки вверх исходная цена за кг уже может
    // не давать ровно ту же сумму. Подбираем ближайшую цену с точностью
    // до копейки, которая после умножения даст нужный итог строки.
    const idealPrice =
        target /
        quantity;

    const baseCents =
        Math.max(
            1,
            Math.round(
                idealPrice * 100,
            ),
        );

    for (
        let offset = 0;
        offset <= 500;
        offset += 1
    ) {
        const candidates =
            offset === 0
                ? [baseCents]
                : [
                    baseCents - offset,
                    baseCents + offset,
                ];

        for (
            const cents
            of candidates
            ) {
            if (cents <= 0) {
                continue;
            }

            const candidate =
                cents / 100;

            if (
                roundMoney(
                    candidate *
                    quantity,
                ) ===
                target
            ) {
                return candidate;
            }
        }
    }

    // Практически сюда не должны попасть.
    // Оставляем ближайшее значение, чтобы сумма АТОЛ была максимально близкой.
    return roundMoney(
        idealPrice,
    );
};

const canSellIntoNegativeStock = (product: Product): boolean => {
    return isWeightProduct(product) && !isMarkedProduct(product);
};

const roundQuantity = (value: number): number => {
    return Math.round(value * 1000) / 1000;
};

const formatQuantity = (quantity: number, unit?: string): string => {
    if (unit === "weight") {
        return `${quantity.toFixed(3).replace(/\.?0+$/, "")} кг`;
    }

    return `${quantity} шт.`;
};

const getUnitPriceLabel = (product: Product): string => {
    return product.unit === "weight" ? "за 1 кг" : "за 1 шт.";
};

const getProductCategory = (product: Product): string => {
    const category = String(product.category || "").trim();

    return category || "Без категории";
};

const splitProductBarcodeList = (value: unknown): string[] => {
    return String(value || "")
        .split(/[\n,;|]+/)
        .map((item) => item.trim())
        .filter(Boolean);
};

const normalizePlainBarcode = (value: unknown): string => {
    return String(value || "").replace(/\D/g, "");
};

const getCigarettePackBarcode = (product: Product): string => {
    return splitProductBarcodeList(product.barcode)[0] || "";
};

const getCigaretteBlockBarcode = (product: Product): string => {
    return splitProductBarcodeList(product.barcode)[1] || "";
};

const isCigaretteProduct = (product: Product): boolean => {
    return getProductCategory(product).toLowerCase().includes("табач");
};

const isCigaretteBlockBarcodeScan = (product: Product, rawQuery: string): boolean => {
    if (!isCigaretteProduct(product)) {
        return false;
    }

    const blockBarcode = normalizePlainBarcode(getCigaretteBlockBarcode(product));
    const query = normalizePlainBarcode(rawQuery);

    return Boolean(blockBarcode && query && blockBarcode === query);
};

const getMarkingPackageModeFromBarcodeScan = (product: Product, rawQuery = ""): MarkingPackageMode => {
    return isCigaretteBlockBarcodeScan(product, rawQuery) ? "block" : "single";
};

const getMarkingPackageQuantity = (packageMode: MarkingPackageMode): number => {
    return packageMode === "block" ? CIGARETTE_BLOCK_QUANTITY : 1;
};

const getMarkingPackageTotalPrice = (product: Product, packageMode: MarkingPackageMode): number => {
    return getSellingPrice(product) * getMarkingPackageQuantity(packageMode);
};

const normalizeSearchText = (value: unknown): string => {
    return String(value ?? "")
        .trim()
        .toLowerCase();
};

const doesProductMatchPriceLabelSearch = (
    product: Product,
    rawQuery: string,
): boolean => {
    const query = normalizeSearchText(rawQuery);

    if (!query) {
        return true;
    }

    const tokens = query.split(/\s+/).filter(Boolean);
    const searchableText = normalizeSearchText(
        [
            product.name,
            getProductCategory(product),
            getSellingPrice(product),
            product.unit === "weight" ? "кг весовой" : "шт штука",
        ].join(" "),
    );

    return tokens.every((token) => {
        return (
            searchableText.includes(token) ||
            hasBarcodeSearchMatch(product.barcode, token)
        );
    });
};

const doesProductMatchPriceLabelCategory = (
    product: Product,
    categoryFilter: string,
): boolean => {
    return (
        categoryFilter === "all" || getProductCategory(product) === categoryFilter
    );
};

const escapeHtml = (value: unknown): string => {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
};

const calculateTotal = (items: CheckoutItem[]): number => {
    return items.reduce(
        (sum, item) => {
            return (
                sum +
                getRoundedSaleLineTotal(
                    item.product,
                    item.quantity,
                )
            );
        },
        0,
    );
};

const createReceiptId = (): string => {
    const randomPart =
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Math.random().toString(36).slice(2)}-${Math.random()
                .toString(36)
                .slice(2)}`;

    return `pos-${Date.now()}-${randomPart}`;
};

const normalizeStoredCheckoutItem = (
    item: StoredCheckoutItem,
): CheckoutItem | null => {
    if (!item || !item.product) {
        return null;
    }

    const product = normalizeProduct(item.product as Product);

    if (
        product.id === undefined ||
        product.id === null ||
        !String(product.name || "").trim()
    ) {
        return null;
    }

    const quantity = isMarkedProduct(product)
        ? 1
        : product.unit === "weight"
            ? roundQuantity(safeParseNumber(item.quantity))
            : Math.floor(safeParseNumber(item.quantity));

    if (!Number.isFinite(quantity) || quantity <= 0) {
        return null;
    }

    const storedMarking = item as StoredCheckoutItem & {
        markingPackageMode?: MarkingPackageMode;
        markingPackageQuantity?: number;
    };

    return {
        product,
        id: String(
            item.id ||
            `${product.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ),
        quantity,
        markingCode: item.markingCode
            ? normalizeMarkingCode(item.markingCode)
            : undefined,
        markingStatus: item.markingStatus,
        markingMessage: item.markingMessage,
        markingCheckedAt: item.markingCheckedAt,
        markingPackageMode: storedMarking.markingPackageMode,
        markingPackageQuantity:
            safeParseNumber(storedMarking.markingPackageQuantity) || undefined,
    };
};

const normalizeStoredCheckoutItems = (
    items: StoredCheckoutItem[],
): CheckoutItem[] => {
    return items
        .map(normalizeStoredCheckoutItem)
        .filter((item): item is CheckoutItem => Boolean(item));
};

const readHeldCheckoutNames = (): Record<string, string> => {
    if (typeof window === "undefined") {
        return {};
    }

    try {
        const raw = localStorage.getItem(HELD_CHECKOUT_NAMES_KEY);

        if (!raw) {
            return {};
        }

        const parsed = JSON.parse(raw);

        return parsed && typeof parsed === "object"
            ? parsed as Record<string, string>
            : {};
    } catch {
        return {};
    }
};

const saveHeldCheckoutName = (
    heldId: string,
    customerName: string,
) => {
    if (typeof window === "undefined") {
        return;
    }

    const names = readHeldCheckoutNames();
    names[String(heldId)] = customerName.trim();

    localStorage.setItem(
        HELD_CHECKOUT_NAMES_KEY,
        JSON.stringify(names),
    );
};

const removeHeldCheckoutName = (heldId: string) => {
    if (typeof window === "undefined") {
        return;
    }

    const names = readHeldCheckoutNames();
    delete names[String(heldId)];

    localStorage.setItem(
        HELD_CHECKOUT_NAMES_KEY,
        JSON.stringify(names),
    );
};

const getHeldCheckoutTitle = (held: HeldCheckout): string => {
    const savedName = readHeldCheckoutNames()[String(held.id)];

    if (savedName) {
        return savedName;
    }

    if (held.title) {
        return held.title;
    }

    const firstItemName = held.items[0]?.product?.name;

    if (firstItemName) {
        return String(firstItemName);
    }

    return "Отложенный чек";
};

const readJsonSafe = async <T, >(response: Response): Promise<T | null> => {
    try {
        return (await response.json()) as T;
    } catch {
        return null;
    }
};

const getPaymentLabel = (method: PaymentMethod): string => {
    if (method === "card") {
        return "Карта";
    }

    if (method === "transfer") {
        return "Перевод";
    }

    if (method === "mixed") {
        return "Смешанная";
    }

    return "Наличные";
};

const getFiscalAgentUrl = (): string => {
    if (typeof window === "undefined") {
        return DEFAULT_FISCAL_AGENT_URL;
    }

    return localStorage.getItem(FISCAL_AGENT_URL_KEY) || DEFAULT_FISCAL_AGENT_URL;
};

const getFiscalAgentToken = (): string => {
    if (typeof window === "undefined") {
        return "";
    }

    return localStorage.getItem(FISCAL_AGENT_TOKEN_KEY) || "";
};

const callFiscalAgent = async <T, >(
    path: string,
    init?: RequestInit,
): Promise<T> => {
    let response: Response;

    try {
        response = await fetch(`${getFiscalAgentUrl()}${path}`, {
            ...init,
            headers: {
                "Content-Type": "application/json",
                "X-POS-Agent-Token": getFiscalAgentToken(),
                ...(init?.headers || {}),
            },
            cache: "no-store",
        });
    } catch {
        throw new Error(
            "Локальный агент ККТ недоступен. Проверьте, что он запущен на ПК кассы.",
        );
    }

    const data = await readJsonSafe<T & ApiError>(response);

    if (!response.ok) {
        throw new Error(data?.message || "Локальный агент ККТ недоступен");
    }

    return data as T;
};

const buildFiscalReceipt = (receipt: Receipt): Receipt => {
    if (receipt.paymentMethod !== "mixed") {
        return receipt;
    }

    // Внутренний учёт хранит реальную разбивку.
    // По текущей договорённости АТОЛ временно получает смешанную оплату как полную оплату картой.
    return {
        ...receipt,
        paymentMethod: "card",
        paymentLabel: "Карта",
        cashAmount: 0,
        cardAmount: receipt.total,
        transferAmount: 0,
        receivedAmount: receipt.total,
        change: 0,
    };
};

const enqueueFiscalReceipt = async (
    receiptId: string,
    receipt: Receipt,
): Promise<FiscalEnqueueResponse> => {
    const fiscalReceipt = buildFiscalReceipt(receipt);

    const data = await callFiscalAgent<FiscalEnqueueResponse>(
        "/fiscal/enqueue",
        {
            method: "POST",
            body: JSON.stringify({
                receiptId,
                receipt: fiscalReceipt,
            }),
        },
    );

    if (!data?.accepted || !data.job) {
        throw new Error(
            data?.message ||
            "Локальный агент не принял чек в очередь",
        );
    }

    return data;
};

const getFiscalQueue = async (): Promise<FiscalQueueSnapshot> => {
    return callFiscalAgent<FiscalQueueSnapshot>(
        "/fiscal/queue",
        {
            method: "GET",
        },
    );
};

const precheckMarkingCode = async (
    markingCode: string,
    packageMode: MarkingPackageMode = "single",
): Promise<MarkingPrecheckResult> => {
    const data = await callFiscalAgent<MarkingPrecheckResult>(
        "/marking/precheck",
        {
            method: "POST",
            body: JSON.stringify({
                markingCode,
                markingPackageMode: packageMode,
                markingPackageQuantity: getMarkingPackageQuantity(packageMode),
            }),
        },
    );

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

    params.set("limit", String(limit));

    if (search) {
        params.set("search", search);
    }

    if (cursor) {
        params.set("cursor", String(cursor));
    }

    const response = await fetch(`/api/products?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
        headers: getLocationHeaders(),
        signal,
    });

    const data = await readJsonSafe<ProductsApiResponse | Product[] | ApiError>(
        response,
    );

    if (!response.ok) {
        throw new Error(
            data && typeof data === "object" && "message" in data && data.message
                ? data.message
                : "Не удалось загрузить товары",
        );
    }

    return normalizeProductsApiResponse(data);
};

const searchProducts = async (
    query: string,
    signal?: AbortSignal,
): Promise<Product[]> => {
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

function formatDeliveryAlertMoney(value: number) {
    return new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: "RUB",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(Math.round(value || 0));
}

function playDeliveryAlertTone() {
    try {
        const AudioContextCtor =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
                .webkitAudioContext;

        if (!AudioContextCtor) {
            return;
        }

        const audioContext = new AudioContextCtor();
        const masterGain = audioContext.createGain();
        const now = audioContext.currentTime;

        masterGain.gain.setValueAtTime(0.0001, now);
        masterGain.gain.linearRampToValueAtTime(0.48, now + 0.015);
        masterGain.gain.linearRampToValueAtTime(0.0001, now + 1.05);
        masterGain.connect(audioContext.destination);

        const playBeep = (startAt: number, frequency: number) => {
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();

            oscillator.type = "square";
            oscillator.frequency.setValueAtTime(frequency, startAt);

            gain.gain.setValueAtTime(0.0001, startAt);
            gain.gain.linearRampToValueAtTime(0.95, startAt + 0.015);
            gain.gain.linearRampToValueAtTime(0.0001, startAt + 0.22);

            oscillator.connect(gain);
            gain.connect(masterGain);
            oscillator.start(startAt);
            oscillator.stop(startAt + 0.24);
        };

        playBeep(now, 880);
        playBeep(now + 0.32, 1175);
        playBeep(now + 0.64, 880);

        window.setTimeout(() => {
            void audioContext.close().catch(() => undefined);
        }, 1400);
    } catch (error) {
        console.warn("Delivery alert sound was blocked by browser:", error);
    }
}

export default function PosPage() {
    const router = useRouter();

    const [isAuthChecked, setIsAuthChecked] = useState(false);
    const [warehouseLocationName, setWarehouseLocationName] = useState(
        DEFAULT_LOCATION_NAME,
    );
    const [warehouseLocationSlug, setWarehouseLocationSlug] = useState(
        DEFAULT_LOCATION_SLUG,
    );
    const [warehouseUserName, setWarehouseUserName] = useState("Кассир");
    const [warehouseUserLogin, setWarehouseUserLogin] = useState("");
    const [deliveryAlerts, setDeliveryAlerts] = useState<DeliveryAlertOrder[]>(
        [],
    );
    const [isDeliveryAlertOpen, setIsDeliveryAlertOpen] = useState(false);
    const [isAcceptingDeliveryId, setIsAcceptingDeliveryId] = useState<
        string | null
    >(null);
    const [shiftStatus, setShiftStatus] = useState<ShiftStatus>("unknown");
    const [isShiftActionLoading, setIsShiftActionLoading] = useState(false);
    const [fiscalConfirmModal, setFiscalConfirmModal] = useState(false);
    const [fiscalQueue, setFiscalQueue] = useState<FiscalQueueSnapshot | null>(
        null,
    );
    const [isFiscalQueueOpen, setIsFiscalQueueOpen] = useState(false);

    const [posBackgroundJobs, setPosBackgroundJobs] = useState<
        PosBackgroundSaleJob<Receipt>[]
    >([]);
    const [isPosBackgroundQueueOpen, setIsPosBackgroundQueueOpen] =
        useState(false);
    const posBackgroundWorkerRunningRef = useRef(false);

    const [checkoutItems, setCheckoutItems] = useState<CheckoutItem[]>([]);
    const [allProducts, setAllProducts] = useState<Product[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [foundProducts, setFoundProducts] = useState<Product[]>([]);

    const [isLoading, setIsLoading] = useState(false);
    const [isSearchLoading, setIsSearchLoading] = useState(false);
    const [isPaying, setIsPaying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [notificationLog, setNotificationLog] =
        useState<PosNotificationEntry[]>([]);
    const [unreadNotificationCount, setUnreadNotificationCount] =
        useState(0);
    const [isNotificationLogOpen, setIsNotificationLogOpen] =
        useState(false);
    const [utc7Now, setUtc7Now] = useState(
        new Date(),
    );
    const [clockCorrectionMs, setClockCorrectionMs] =
        useState(0);
    const [isClockSettingsOpen, setIsClockSettingsOpen] =
        useState(false);
    const [clockEditValue, setClockEditValue] =
        useState("");
    const [isFullscreen, setIsFullscreen] =
        useState(false);
    const [isNativeF11Fullscreen, setIsNativeF11Fullscreen] =
        useState(false);
    const [isClosingReminderOpen, setIsClosingReminderOpen] =
        useState(false);
    const skipNextNotificationLogRef =
        useRef<string | null>(null);

    const [paymentModal, setPaymentModal] = useState<PaymentMethod | null>(null);
    const [cashReceived, setCashReceived] = useState("");
    const [mixedCashAmount, setMixedCashAmount] = useState(0);
    const [mixedCardAmount, setMixedCardAmount] = useState(0);
    const [transferCustomerName, setTransferCustomerName] = useState("");
    const [lastReceipt, setLastReceipt] = useState<Receipt | null>(null);

    const [weightModalProduct, setWeightModalProduct] = useState<Product | null>(
        null,
    );
    const [weightQuantity, setWeightQuantity] = useState("");

    const [markingModalProduct, setMarkingModalProduct] =
        useState<Product | null>(null);
    const [markingCodeInput, setMarkingCodeInput] = useState("");
    const [markingCheckResult, setMarkingCheckResult] =
        useState<MarkingPrecheckResult | null>(null);
    const [markingPackageMode, setMarkingPackageMode] =
        useState<MarkingPackageMode>("single");
    const [isCheckingMarking, setIsCheckingMarking] = useState(false);
    const [backgroundMarkingCheck, setBackgroundMarkingCheck] = useState<{
        productName: string;
        codePreview: string;
        packageMode: MarkingPackageMode;
    } | null>(null);

    const [isPriceLabelModalOpen, setIsPriceLabelModalOpen] = useState(false);
    const [priceLabelSearch, setPriceLabelSearch] = useState("");
    const [priceLabelCategoryFilter, setPriceLabelCategoryFilter] =
        useState("all");
    const [selectedPriceLabelIds, setSelectedPriceLabelIds] = useState<string[]>(
        [],
    );
    const [priceLabelQuantities, setPriceLabelQuantities] =
        useState<PriceLabelQuantityMap>({});
    const [isRefreshingLabels, setIsRefreshingLabels] = useState(false);
    const [pendingPriceLabelPrint, setPendingPriceLabelPrint] =
        useState<PendingPriceLabelPrint | null>(null);
    const [pendingCommodityReceipt, setPendingCommodityReceipt] =
        useState<Receipt | null>(null);
    const [lastCommodityReceipt, setLastCommodityReceipt] =
        useState<Receipt | null>(null);
    const [commodityReceiptPrintStep, setCommodityReceiptPrintStep] =
        useState<CommodityReceiptPrintStep>("ask");

    const [isAtolSetupOpen, setIsAtolSetupOpen] = useState(false);
    const [isHeldReceiptsModalOpen, setIsHeldReceiptsModalOpen] = useState(false);
    const [isHoldCheckoutNameModalOpen, setIsHoldCheckoutNameModalOpen] =
        useState(false);
    const [holdCheckoutName, setHoldCheckoutName] = useState("");
    const [isCheckoutStoreReady, setIsCheckoutStoreReady] = useState(false);

    const [
        isReturnModalOpen,
        setIsReturnModalOpen,
    ] = useState(false)

    const [
        returnSearchQuery,
        setReturnSearchQuery,
    ] = useState('')

    const [
        returnFoundProducts,
        setReturnFoundProducts,
    ] = useState<Product[]>([])

    const [
        returnItems,
        setReturnItems,
    ] = useState<ReturnCheckoutItem[]>([])

    const [
        returnComment,
        setReturnComment,
    ] = useState('')

    const [
        isReturnSaving,
        setIsReturnSaving,
    ] = useState(false)


    const heldCheckouts = usePosCheckoutStore((state) => state.heldCheckouts);
    const setStoredCheckoutItems = usePosCheckoutStore(
        (state) => state.setCurrentItems,
    );
    const clearStoredCheckoutItems = usePosCheckoutStore(
        (state) => state.clearCurrentItems,
    );
    const holdCheckoutInStore = usePosCheckoutStore(
        (state) => state.holdCheckout,
    );
    const removeHeldCheckout = usePosCheckoutStore(
        (state) => state.removeHeldCheckout,
    );

    const searchInputRef = useRef<HTMLInputElement>(null);
    const newSaleButtonRef = useRef<HTMLButtonElement>(null);
    const skipCommodityReceiptPrintButtonRef = useRef<HTMLButtonElement>(null);

    const total = calculateTotal(checkoutItems);
    const cashReceivedNumber = safeParseNumber(cashReceived);
    const change = cashReceivedNumber - total;
    const mixedPaymentTotal = Math.round((mixedCashAmount + mixedCardAmount + Number.EPSILON) * 100) / 100;
    const isMixedPaymentValid =
        mixedCashAmount > 0 &&
        mixedCardAmount > 0 &&
        Math.abs(mixedPaymentTotal - total) <= 0.01;
    const isShiftOpen = shiftStatus === "open";
    const hasMarkedCheckoutItems = checkoutItems.some((item) =>
        isMarkedProduct(item.product),
    );
    const hasUnsafeMarkedCheckoutItems = checkoutItems.some(
        (item) => isMarkedProduct(item.product) && item.markingStatus !== "M+",
    );

    const appendNotificationLog =
        useCallback(
            (
                kind: PosNotificationKind,
                message: string,
            ) => {
                const safeMessage =
                    String(
                        message ||
                        "",
                    ).trim();

                if (!safeMessage) {
                    return;
                }

                setNotificationLog(
                    previous => {
                        const entry: PosNotificationEntry = {
                            id:
                                `${Date.now()}-${Math.random()
                                    .toString(16)
                                    .slice(2)}`,
                            kind,
                            message:
                            safeMessage,
                            createdAt:
                                new Date().toISOString(),
                        };

                        const next = [
                            ...previous,
                            entry,
                        ].slice(
                            -MAX_POS_NOTIFICATION_LOG,
                        );

                        savePosNotificationLog(
                            next,
                        );

                        return next;
                    },
                );

                setUnreadNotificationCount(
                    previous =>
                        Math.min(
                            999,
                            previous + 1,
                        ),
                );
            },
            [],
        );

    const clearNotificationLog =
        useCallback(
            () => {
                setNotificationLog(
                    [],
                );

                if (
                    typeof window !==
                    "undefined"
                ) {
                    localStorage.removeItem(
                        POS_NOTIFICATION_LOG_KEY,
                    );

                    localStorage.removeItem(
                        POS_NOTIFICATION_READ_AT_KEY,
                    );
                }

                setUnreadNotificationCount(
                    0,
                );

                setIsNotificationLogOpen(
                    false,
                );
            },
            [],
        );

    const markNotificationLogRead =
        useCallback(
            () => {
                const readAt =
                    new Date().toISOString();

                setUnreadNotificationCount(
                    0,
                );

                if (
                    typeof window !==
                    "undefined"
                ) {
                    localStorage.setItem(
                        POS_NOTIFICATION_READ_AT_KEY,
                        readAt,
                    );
                }
            },
            [],
        );

    const toggleNotificationLog =
        useCallback(
            () => {
                setIsNotificationLogOpen(
                    current => {
                        const next =
                            !current;

                        if (next) {
                            markNotificationLogRead();
                        }

                        return next;
                    },
                );
            },
            [
                markNotificationLogRead,
            ],
        );

    const openClockSettings =
        useCallback(
            () => {
                setClockEditValue(
                    toPosDatetimeLocalValue(
                        new Date(),
                        clockCorrectionMs,
                    ),
                );

                setIsClockSettingsOpen(
                    true,
                );
            },
            [
                clockCorrectionMs,
            ],
        );

    const saveClockSettings =
        useCallback(
            () => {
                const correction =
                    getClockCorrectionFromDatetimeLocal(
                        clockEditValue,
                    );

                if (
                    correction ===
                    null
                ) {
                    setError(
                        "Введите корректные дату и время",
                    );

                    return;
                }

                setClockCorrectionMs(
                    correction,
                );

                savePosClockCorrectionMs(
                    correction,
                );

                setIsClockSettingsOpen(
                    false,
                );

                setNotice(
                    "Время POS обновлено",
                );
            },
            [
                clockEditValue,
            ],
        );

    const resetClockSettings =
        useCallback(
            () => {
                setClockCorrectionMs(
                    0,
                );

                savePosClockCorrectionMs(
                    0,
                );

                setClockEditValue(
                    toPosDatetimeLocalValue(
                        new Date(),
                        0,
                    ),
                );

                setIsClockSettingsOpen(
                    false,
                );

                setNotice(
                    "Время POS возвращено к автоматическому UTC+7",
                );
            },
            [],
        );

    const refreshFullscreenState =
        useCallback(
            () => {
                const nativeF11 =
                    isBrowserF11Fullscreen();

                setIsNativeF11Fullscreen(
                    nativeF11,
                );

                setIsFullscreen(
                    Boolean(
                        document.fullscreenElement,
                    ) ||
                    nativeF11,
                );
            },
            [],
        );

    const toggleFullscreen =
        useCallback(
            async () => {
                try {
                    if (
                        document.fullscreenElement
                    ) {
                        await document.exitFullscreen();

                        window.setTimeout(
                            refreshFullscreenState,
                            60,
                        );

                        return;
                    }

                    if (
                        isBrowserF11Fullscreen()
                    ) {
                        // Браузеры не разрешают JavaScript программно
                        // выключить системный F11-режим.
                        setNotice(
                            "Полноэкранный режим включён через F11. Для выхода нажмите F11.",
                        );

                        refreshFullscreenState();

                        return;
                    }

                    await document.documentElement.requestFullscreen();

                    window.setTimeout(
                        refreshFullscreenState,
                        60,
                    );
                } catch (fullscreenError) {
                    setError(
                        fullscreenError instanceof Error
                            ? `Не удалось изменить полноэкранный режим: ${fullscreenError.message}`
                            : "Не удалось изменить полноэкранный режим",
                    );
                }
            },
            [
                refreshFullscreenState,
            ],
        );

    const acknowledgeClosingReminder =
        useCallback(
            () => {
                if (
                    typeof window !==
                    "undefined"
                ) {
                    localStorage.setItem(
                        `${CLOSING_REMINDER_ACK_PREFIX}${getPosClockDateKey(new Date(), clockCorrectionMs)}`,
                        "1",
                    );
                }

                setIsClosingReminderOpen(
                    false,
                );

                appendNotificationLog(
                    "system",
                    "Ночной чек-лист закрытия магазина подтверждён",
                );
            },
            [
                appendNotificationLog,
                clockCorrectionMs,
            ],
        );

    useEffect(() => {
        const entries =
            readPosNotificationLog();

        setNotificationLog(
            entries,
        );

        const lastReadAt =
            localStorage.getItem(
                POS_NOTIFICATION_READ_AT_KEY,
            );

        const unreadCount =
            lastReadAt
                ? entries.filter(
                    entry =>
                        entry.createdAt >
                        lastReadAt,
                ).length
                : entries.length;

        setUnreadNotificationCount(
            unreadCount,
        );
    }, []);

    useEffect(() => {
        const savedCorrection =
            readPosClockCorrectionMs();

        setClockCorrectionMs(
            savedCorrection,
        );

        setClockEditValue(
            toPosDatetimeLocalValue(
                new Date(),
                savedCorrection,
            ),
        );
    }, []);

    useEffect(() => {
        const intervalId =
            window.setInterval(
                () => {
                    setUtc7Now(
                        new Date(),
                    );
                },
                1000,
            );

        return () => {
            window.clearInterval(
                intervalId,
            );
        };
    }, []);

    useEffect(() => {
        const handleFullscreenChange =
            () => {
                refreshFullscreenState();
            };

        const handleWindowResize =
            () => {
                // F11 не вызывает fullscreenchange, но меняет размеры viewport.
                // Поэтому отслеживаем resize и сравниваем viewport с screen.
                window.setTimeout(
                    refreshFullscreenState,
                    40,
                );
            };

        refreshFullscreenState();

        document.addEventListener(
            "fullscreenchange",
            handleFullscreenChange,
        );

        window.addEventListener(
            "resize",
            handleWindowResize,
        );

        return () => {
            document.removeEventListener(
                "fullscreenchange",
                handleFullscreenChange,
            );

            window.removeEventListener(
                "resize",
                handleWindowResize,
            );
        };
    }, [
        refreshFullscreenState,
    ]);

    useEffect(() => {
        if (!error) {
            return;
        }

        if (
            skipNextNotificationLogRef.current ===
            error
        ) {
            skipNextNotificationLogRef.current =
                null;

            return;
        }

        appendNotificationLog(
            "error",
            error,
        );
    }, [
        error,
        appendNotificationLog,
    ]);

    useEffect(() => {
        if (!notice) {
            return;
        }

        if (
            skipNextNotificationLogRef.current ===
            notice
        ) {
            skipNextNotificationLogRef.current =
                null;

            return;
        }

        appendNotificationLog(
            "notice",
            notice,
        );
    }, [
        notice,
        appendNotificationLog,
    ]);

    useEffect(() => {
        if (
            !isAuthChecked ||
            !isShiftOpen
        ) {
            return;
        }

        const checkClosingReminder =
            () => {
                const now =
                    new Date();

                if (
                    getPosClockHour(now, clockCorrectionMs) !==
                    1
                ) {
                    return;
                }

                const acknowledgementKey =
                    `${CLOSING_REMINDER_ACK_PREFIX}${getPosClockDateKey(now, clockCorrectionMs)}`;

                const acknowledged =
                    localStorage.getItem(
                        acknowledgementKey,
                    ) ===
                    "1";

                if (
                    !acknowledged
                ) {
                    setIsClosingReminderOpen(
                        true,
                    );
                }
            };

        checkClosingReminder();

        const intervalId =
            window.setInterval(
                checkClosingReminder,
                30_000,
            );

        return () => {
            window.clearInterval(
                intervalId,
            );
        };
    }, [
        clockCorrectionMs,
        isAuthChecked,
        isShiftOpen,
    ]);

    useEffect(() => {
        if (!error) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setError(null);
        }, TOAST_AUTO_CLOSE_MS);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [error]);

    useEffect(() => {
        if (!notice) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setNotice(null);
        }, TOAST_AUTO_CLOSE_MS);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [notice]);

    const priceLabelCategories = useMemo(() => {
        const categories = allProducts.map(getProductCategory);

        return Array.from(new Set<string>(categories)).sort((a, b) =>
            a.localeCompare(b, "ru"),
        );
    }, [allProducts]);

    const priceLabelProducts = useMemo(() => {
        return allProducts.filter((product) => {
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

    const selectedPriceLabelPrintCount = selectedPriceLabelIds.reduce(
        (sum, productId) => {
            return sum + getPriceLabelQuantity(productId);
        },
        0,
    );

    const filteredPriceLabelPrintCount = priceLabelProducts.reduce(
        (sum, product) => {
            return sum + getPriceLabelQuantity(product.id);
        },
        0,
    );

    const refreshProducts = async (): Promise<Product[]> => {
        const products = await fetchAllProducts();

        setAllProducts(products);

        return products;
    };

    useEffect(() => {
        const savedLocalUser = localStorage.getItem(AUTH_USER_KEY);
        const savedSessionUser = sessionStorage.getItem(AUTH_USER_KEY);
        const authUser = savedLocalUser || savedSessionUser;

        if (!authUser) {
            router.replace("/auth");
            return;
        }

        const currentLocationSlug = getCurrentLocationSlug();
        const currentLocationName = getCurrentLocationName();
        const currentLocationType = getCurrentLocationType();

        if (
            !canUseWarehouseSection(
                currentLocationSlug,
                currentLocationType,
                "online-kassa",
            )
        ) {
            router.replace(
                getFirstAllowedRouteForLocation(
                    currentLocationSlug,
                    currentLocationType,
                ),
            );
            return;
        }

        setWarehouseLocationName(currentLocationName);
        setWarehouseLocationSlug(currentLocationSlug);
        setWarehouseUserName(getCurrentUserName());
        setWarehouseUserLogin(getCurrentUserLogin());

        const savedShiftStatus = localStorage.getItem(SHIFT_STATUS_KEY);

        if (savedShiftStatus === "open" || savedShiftStatus === "closed") {
            setShiftStatus(savedShiftStatus);
        } else {
            setShiftStatus("closed");
            localStorage.setItem(SHIFT_STATUS_KEY, "closed");
        }

        setIsAuthChecked(true);
    }, [router]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        try {
            const rawReceipt = localStorage.getItem(LAST_COMMODITY_RECEIPT_KEY);

            if (!rawReceipt) {
                return;
            }

            const parsedReceipt = JSON.parse(rawReceipt) as Receipt;

            if (parsedReceipt && parsedReceipt.id && Array.isArray(parsedReceipt.items)) {
                setLastCommodityReceipt(parsedReceipt);
            }
        } catch (err) {
            console.warn("Last commodity receipt restore error:", err);
            localStorage.removeItem(LAST_COMMODITY_RECEIPT_KEY);
        }
    }, []);

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
    }, [
        checkoutItems,
        clearStoredCheckoutItems,
        isCheckoutStoreReady,
        setStoredCheckoutItems,
    ]);

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
                    setError(
                        err instanceof Error ? err.message : "Не удалось загрузить товары",
                    );
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
        if (paymentModal !== "cash") {
            return;
        }

        const handleEnterPayment = (event: globalThis.KeyboardEvent) => {
            if (event.key !== "Enter" || isPaying) {
                return;
            }

            event.preventDefault();

            if (cashReceivedNumber < total) {
                setError("Полученная сумма меньше суммы чека");
                return;
            }

            setFiscalConfirmModal(true);
        };

        window.addEventListener("keydown", handleEnterPayment);

        return () => {
            window.removeEventListener("keydown", handleEnterPayment);
        };
    }, [
        paymentModal,
        isPaying,
        cashReceivedNumber,
        total,
        checkoutItems,
        shiftStatus,
    ]);

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
                if (err instanceof Error && err.name === "AbortError") {
                    return;
                }

                console.error(err);
                setFoundProducts([]);
                setError(err instanceof Error ? err.message : "Ошибка поиска товара");
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
            if (event.key !== "Escape") {
                return;
            }

            setPaymentModal(null);
            setFiscalConfirmModal(false);
            setWeightModalProduct(null);
            setMarkingModalProduct(null);
            setMarkingCodeInput("");
            setMarkingCheckResult(null);
            setMarkingPackageMode("single");
            setIsPriceLabelModalOpen(false);
            setPendingPriceLabelPrint(null);
            setPendingCommodityReceipt(null);
            setCommodityReceiptPrintStep("ask");
            setIsHeldReceiptsModalOpen(false);
            setIsHoldCheckoutNameModalOpen(false);
            setIsNotificationLogOpen(false);
            setIsClockSettingsOpen(false);
            setHoldCheckoutName("");
            setTransferCustomerName("");
            setLastReceipt(null);
            setIsAtolSetupOpen(false);
            setIsReturnModalOpen(false);
        };

        window.addEventListener("keydown", handleEscape);

        return () => {
            window.removeEventListener("keydown", handleEscape);
        };
    }, []);

    useEffect(() => {
        if (!pendingCommodityReceipt || commodityReceiptPrintStep !== "ask") {
            return;
        }

        const skipCommodityReceiptPrint = () => {
            setPendingCommodityReceipt(null);
            setCommodityReceiptPrintStep("ask");
        };

        const focusFrame = requestAnimationFrame(() => {
            skipCommodityReceiptPrintButtonRef.current?.focus();
        });

        const handleCommodityReceiptAskEnter = (event: globalThis.KeyboardEvent) => {
            if (event.key !== "Enter") {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            skipCommodityReceiptPrint();
        };

        window.addEventListener("keydown", handleCommodityReceiptAskEnter, true);

        return () => {
            cancelAnimationFrame(focusFrame);
            window.removeEventListener("keydown", handleCommodityReceiptAskEnter, true);
        };
    }, [commodityReceiptPrintStep, pendingCommodityReceipt]);

    useEffect(() => {
        if (!lastReceipt || pendingCommodityReceipt) {
            return;
        }

        const focusFrame = requestAnimationFrame(() => {
            newSaleButtonRef.current?.focus();
        });

        const handleLastReceiptEnter = (event: globalThis.KeyboardEvent) => {
            if (event.key !== "Enter" || isShiftActionLoading) {
                return;
            }

            if (pendingCommodityReceipt || pendingPriceLabelPrint) {
                return;
            }

            if (event.target === newSaleButtonRef.current) {
                return;
            }

            event.preventDefault();
            setLastReceipt(null);
            setError(null);

            requestAnimationFrame(() => {
                searchInputRef.current?.focus();
            });
        };

        window.addEventListener("keydown", handleLastReceiptEnter);

        return () => {
            cancelAnimationFrame(focusFrame);
            window.removeEventListener("keydown", handleLastReceiptEnter);
        };
    }, [
        isShiftActionLoading,
        lastReceipt,
        pendingCommodityReceipt,
        pendingPriceLabelPrint,
    ]);

    useEffect(() => {
        const handleIdleEnterFocus = (event: globalThis.KeyboardEvent) => {
            if (event.key !== "Enter") {
                return;
            }

            if (
                lastReceipt ||
                paymentModal ||
                fiscalConfirmModal ||
                weightModalProduct ||
                markingModalProduct ||
                isPriceLabelModalOpen ||
                pendingPriceLabelPrint ||
                pendingCommodityReceipt ||
                isHeldReceiptsModalOpen ||
                isHoldCheckoutNameModalOpen ||
                isClockSettingsOpen ||
                isAtolSetupOpen ||
                isReturnModalOpen
            ) {
                return;
            }

            const target = event.target as HTMLElement | null;
            const tagName = target?.tagName?.toLowerCase();

            if (
                tagName === "input" ||
                tagName === "textarea" ||
                tagName === "select" ||
                tagName === "button" ||
                target?.isContentEditable
            ) {
                return;
            }

            event.preventDefault();
            searchInputRef.current?.focus();
        };

        window.addEventListener("keydown", handleIdleEnterFocus);

        return () => {
            window.removeEventListener("keydown", handleIdleEnterFocus);
        };
    }, [
        fiscalConfirmModal,
        isAtolSetupOpen,
        isHeldReceiptsModalOpen,
        isHoldCheckoutNameModalOpen,
        isClockSettingsOpen,
        isPriceLabelModalOpen,
        lastReceipt,
        pendingCommodityReceipt,
        pendingPriceLabelPrint,
        markingModalProduct,
        paymentModal,
        weightModalProduct,
    ]);

    const refreshFiscalQueue = useCallback(
        async (
            options?: {
                silent?: boolean;
            },
        ) => {
            try {
                const queue =
                    await getFiscalQueue();

                setFiscalQueue(
                    queue,
                );

                return queue;
            } catch (queueError) {
                if (!options?.silent) {
                    setError(
                        queueError instanceof Error
                            ? queueError.message
                            : "Не удалось получить очередь ККТ",
                    );
                }

                return null;
            }
        },
        [],
    );

    useEffect(() => {
        if (!isAuthChecked) {
            return;
        }

        void refreshFiscalQueue({
            silent: true,
        });

        const intervalId =
            window.setInterval(
                () => {
                    void refreshFiscalQueue({
                        silent: true,
                    });
                },
                1500,
            );

        return () => {
            window.clearInterval(
                intervalId,
            );
        };
    }, [
        isAuthChecked,
        refreshFiscalQueue,
    ]);

    const createSaleInDb = useCallback(
        async (
            receipt: Receipt,
            locationSlug?: string,
        ): Promise<Receipt> => {
            const response = await fetch("/api/sales", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...getLocationHeaders(),
                    ...(locationSlug
                        ? {
                            [WAREHOUSE_LOCATION_HEADER]:
                            locationSlug,
                        }
                        : {}),
                },
                credentials: "same-origin",
                body: JSON.stringify(receipt),
            });

            const data =
                await readJsonSafe<Receipt & ApiError>(
                    response,
                );

            if (!response.ok) {
                throw new Error(
                    data?.message ||
                    "Не удалось сохранить чек",
                );
            }

            return data || receipt;
        },
        [],
    );

    const refreshPosBackgroundJobs =
        useCallback(
            async () => {
                const jobs =
                    await getAllPosBackgroundJobs<Receipt>();

                setPosBackgroundJobs(
                    jobs,
                );

                return jobs;
            },
            [],
        );

    const processPosBackgroundQueue =
        useCallback(
            async () => {
                if (
                    posBackgroundWorkerRunningRef.current
                ) {
                    return;
                }

                posBackgroundWorkerRunningRef.current =
                    true;

                try {
                    while (true) {
                        const jobs =
                            await getAllPosBackgroundJobs<Receipt>();

                        const nextJob =
                            jobs.find(
                                job =>
                                    job.status ===
                                    "pending",
                            );

                        if (!nextJob) {
                            setPosBackgroundJobs(
                                jobs,
                            );

                            break;
                        }

                        const processingJob =
                            await markPosBackgroundJobProcessing(
                                nextJob,
                            );

                        setPosBackgroundJobs(
                            await getAllPosBackgroundJobs<Receipt>(),
                        );

                        try {
                            const savedReceipt =
                                await createSaleInDb(
                                    processingJob.receipt,
                                    processingJob.locationSlug,
                                );

                            rememberReceiptMarkingCodesLocally(
                                processingJob.receipt,
                            );

                            const finalReceipt: Receipt = {
                                ...processingJob.receipt,
                                ...savedReceipt,
                                cashierName:
                                processingJob.receipt.cashierName,
                                cashierLogin:
                                processingJob.receipt.cashierLogin,
                                locationName:
                                processingJob.receipt.locationName,
                                locationSlug:
                                processingJob.receipt.locationSlug,
                                fiscalStatus:
                                    processingJob.shouldFiscalize
                                        ? "queued"
                                        : "skipped",
                            };

                            if (
                                processingJob.shouldFiscalize
                            ) {
                                const databaseReceiptId =
                                    savedReceipt.id ??
                                    savedReceipt.receiptNumber ??
                                    processingJob.receipt.id;

                                const fiscalReceiptId =
                                    `sale:${processingJob.locationSlug}:${String(
                                        databaseReceiptId,
                                    )}`;

                                await enqueueFiscalReceipt(
                                    fiscalReceiptId,
                                    finalReceipt,
                                );

                                void refreshFiscalQueue({
                                    silent: true,
                                });
                            }

                            await deletePosBackgroundJob(
                                processingJob.id,
                            );
                        } catch (backgroundError) {
                            console.error(
                                "POS background sale error:",
                                backgroundError,
                            );

                            await markPosBackgroundJobFailed(
                                processingJob,
                                backgroundError instanceof Error
                                    ? backgroundError.message
                                    : "Неизвестная ошибка фоновой продажи",
                            );

                            // Ошибка одного чека не блокирует следующий.
                            continue;
                        }
                    }
                } finally {
                    posBackgroundWorkerRunningRef.current =
                        false;

                    try {
                        setPosBackgroundJobs(
                            await getAllPosBackgroundJobs<Receipt>(),
                        );
                    } catch {
                        // UI queue refresh must not break POS.
                    }
                }
            },
            [
                createSaleInDb,
                refreshFiscalQueue,
            ],
        );

    const retryPosSaleJob =
        useCallback(
            async (
                jobId: string,
            ) => {
                await retryPosBackgroundJob<Receipt>(
                    jobId,
                );

                await refreshPosBackgroundJobs();

                void processPosBackgroundQueue();
            },
            [
                processPosBackgroundQueue,
                refreshPosBackgroundJobs,
            ],
        );

    useEffect(() => {
        if (!isAuthChecked) {
            return;
        }

        let cancelled =
            false;

        const start =
            async () => {
                try {
                    await resetInterruptedPosJobs<Receipt>();

                    if (cancelled) {
                        return;
                    }

                    await refreshPosBackgroundJobs();

                    if (cancelled) {
                        return;
                    }

                    void processPosBackgroundQueue();
                } catch (queueError) {
                    console.error(
                        "POS local background queue init error:",
                        queueError,
                    );

                    if (!cancelled) {
                        setError(
                            queueError instanceof Error
                                ? `Не удалось открыть локальную очередь продаж: ${queueError.message}`
                                : "Не удалось открыть локальную очередь продаж",
                        );
                    }
                }
            };

        void start();

        const intervalId =
            window.setInterval(
                () => {
                    if (cancelled) {
                        return;
                    }

                    void refreshPosBackgroundJobs();
                    void processPosBackgroundQueue();
                },
                2000,
            );

        return () => {
            cancelled = true;

            window.clearInterval(
                intervalId,
            );
        };
    }, [
        isAuthChecked,
        processPosBackgroundQueue,
        refreshPosBackgroundJobs,
    ]);

    const isTochkaLocation = warehouseLocationSlug === "tochka";

    const loadDeliveryAlerts = useCallback(async () => {
        if (!isTochkaLocation) {
            setDeliveryAlerts([]);
            setIsDeliveryAlertOpen(false);
            return;
        }

        try {
            const response = await fetch("/api/deliveries/notifications", {
                method: "GET",
                cache: "no-store",
            });

            const data = (await response.json().catch(() => null)) as
                { orders?: DeliveryAlertOrder[] } | { message?: string } | null;

            if (!response.ok) {
                throw new Error(
                    data && "message" in data
                        ? data.message || "Не удалось проверить доставки"
                        : "Не удалось проверить доставки",
                );
            }

            const orders =
                data && "orders" in data && Array.isArray(data.orders)
                    ? data.orders
                    : [];
            setDeliveryAlerts(orders);
            setIsDeliveryAlertOpen(orders.length > 0);
        } catch (error) {
            console.error("Delivery notification check error:", error);
        }
    }, [isTochkaLocation]);

    useEffect(() => {
        if (!isAuthChecked || !isTochkaLocation) {
            setDeliveryAlerts([]);
            setIsDeliveryAlertOpen(false);
            return;
        }

        const firstTimer = window.setTimeout(() => {
            void loadDeliveryAlerts();
        }, 1200);

        const intervalId = window.setInterval(() => {
            void loadDeliveryAlerts();
        }, 60_000);

        return () => {
            window.clearTimeout(firstTimer);
            window.clearInterval(intervalId);
        };
    }, [isAuthChecked, isTochkaLocation, loadDeliveryAlerts]);

    useEffect(() => {
        const handleDeliveriesUpdated = () => {
            void loadDeliveryAlerts();
        };

        window.addEventListener("deliveries-updated", handleDeliveriesUpdated);

        return () => {
            window.removeEventListener("deliveries-updated", handleDeliveriesUpdated);
        };
    }, [loadDeliveryAlerts]);

    useEffect(() => {
        if (!isDeliveryAlertOpen || deliveryAlerts.length === 0) {
            return;
        }

        playDeliveryAlertTone();

        const intervalId = window.setInterval(() => {
            playDeliveryAlertTone();
        }, 2200);

        return () => window.clearInterval(intervalId);
    }, [deliveryAlerts.length, isDeliveryAlertOpen]);

    const acceptDeliveryFromAlert = async (orderId: string) => {
        try {
            setIsAcceptingDeliveryId(orderId);

            const response = await fetch(`/api/deliveries/${orderId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    status: "accepted",
                    changedByName: warehouseUserName,
                }),
            });

            const data = (await response.json().catch(() => null)) as {
                message?: string;
            } | null;

            if (!response.ok) {
                throw new Error(data?.message || "Не удалось принять доставку");
            }

            await loadDeliveryAlerts();
            window.dispatchEvent(new CustomEvent("deliveries-updated"));
        } catch (error) {
            console.error("Accept delivery error:", error);
            alert(
                error instanceof Error ? error.message : "Не удалось принять доставку",
            );
        } finally {
            setIsAcceptingDeliveryId(null);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem(AUTH_USER_KEY);
        localStorage.removeItem(AUTH_LOGIN_KEY);
        localStorage.removeItem(REMEMBER_ME_KEY);
        localStorage.removeItem(AUTH_LOCATION_SLUG_KEY);
        localStorage.removeItem(AUTH_LOCATION_NAME_KEY);
        localStorage.removeItem(AUTH_LOCATION_TYPE_KEY);
        localStorage.removeItem(AUTH_USER_NAME_KEY);
        localStorage.removeItem(AUTH_USER_ROLE_KEY);
        sessionStorage.removeItem(AUTH_USER_KEY);
        sessionStorage.removeItem(AUTH_LOCATION_SLUG_KEY);
        sessionStorage.removeItem(AUTH_LOCATION_NAME_KEY);
        sessionStorage.removeItem(AUTH_LOCATION_TYPE_KEY);
        sessionStorage.removeItem(AUTH_USER_NAME_KEY);
        sessionStorage.removeItem(AUTH_USER_ROLE_KEY);
        document.cookie = `${AUTH_LOCATION_SLUG_KEY}=; path=/; max-age=0; SameSite=Lax`;
        router.replace("/auth");
    };

    const checkFiscalAgent = async () => {
        try {
            setIsShiftActionLoading(true);
            setError(null);
            setNotice(null);

            await callFiscalAgent("/health");

            setNotice("Связь с локальным агентом ККТ есть");
            void refreshFiscalQueue({
                silent: true,
            });
        } catch (err) {
            console.error(err);
            setNotice(null);
            setError(err instanceof Error ? err.message : "Не удалось проверить ККТ");
        } finally {
            setIsShiftActionLoading(false);
        }
    };

    const repeatLastFiscalReceipt = async () => {
        try {
            setIsShiftActionLoading(true);
            setError(null);
            setNotice(null);

            await callFiscalAgent("/service/repeat-last-receipt", {
                method: "POST",
            });

            setNotice("Копия последнего фискального чека отправлена на ККТ");
        } catch (err) {
            console.error(err);
            setNotice(null);
            setError(
                err instanceof Error
                    ? err.message
                    : "Не удалось напечатать копию последнего чека",
            );
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

            await callFiscalAgent("/service/open-shift", {
                method: "POST",
            });

            setShiftStatus("open");
            localStorage.setItem(SHIFT_STATUS_KEY, "open");
            setNotice("Смена ККТ открыта");
        } catch (err) {
            console.error(err);
            setNotice(null);
            setError(err instanceof Error ? err.message : "Не удалось открыть смену");
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

            await callFiscalAgent("/service/close-shift", {
                method: "POST",
            });

            setShiftStatus("closed");
            localStorage.setItem(SHIFT_STATUS_KEY, "closed");

            clearNotificationLog();

            skipNextNotificationLogRef.current =
                "Смена ККТ закрыта";

            setNotice("Смена ККТ закрыта");
        } catch (err) {
            console.error(err);
            setNotice(null);
            setError(err instanceof Error ? err.message : "Не удалось закрыть смену");
        } finally {
            setIsShiftActionLoading(false);

            requestAnimationFrame(() => {
                searchInputRef.current?.focus();
            });
        }
    };

    const updateLocalStockAfterSale = (items: ReceiptItem[]) => {
        setAllProducts((prevProducts) =>
            prevProducts.map((product) => {
                const receiptItem = items.find(
                    (item) => String(item.productId) === String(product.id),
                );

                if (!receiptItem) {
                    return product;
                }

                const nextStock = roundQuantity(
                    getStock(product) - receiptItem.quantity,
                );

                return {
                    ...product,
                    stock: isWeightProduct(product) ? nextStock : Math.max(0, nextStock),
                };
            }),
        );
    };

    const openMarkingScanModal = (product: Product, packageMode: MarkingPackageMode = "single") => {
        if (isCheckingMarking) {
            setError("Дождитесь завершения проверки предыдущей маркировки");
            return;
        }

        const safeProduct = normalizeProduct(product);

        setMarkingModalProduct(safeProduct);
        setMarkingCodeInput("");
        setMarkingCheckResult(null);
        setMarkingPackageMode(packageMode);
        setError(null);
        setNotice(null);
    };

    const getMarkingStatusClassName = (status?: MarkingStatus): string => {
        if (status === "M+") {
            return "bg-emerald-100 text-emerald-700 border-emerald-200";
        }

        if (status === "M-") {
            return "bg-red-100 text-red-700 border-red-200";
        }

        return "bg-amber-100 text-amber-700 border-amber-200";
    };

    const addMarkedProductToCheckout = async (
        product: Product,
        rawMarkingCode: string,
        packageMode: MarkingPackageMode = "single",
    ) => {
        if (isCheckingMarking) {
            setError("Дождитесь завершения проверки предыдущей маркировки");
            return;
        }

        const safeProduct = normalizeProduct(product);
        const markingCode = normalizeMarkingCode(rawMarkingCode);
        const stock = getStock(safeProduct);
        const saleQuantity = getMarkingPackageQuantity(packageMode);

        if (!markingCode) {
            setMarkingCheckResult(null);
            setError("Отсканируйте DataMatrix маркированного товара");
            return;
        }

        if (markingCode.length < 20) {
            setMarkingCheckResult({
                ok: false,
                canSell: false,
                markingStatus: "M",
                message:
                    "DataMatrix выглядит слишком коротким. Проверьте сканирование.",
            });
            setError("DataMatrix выглядит слишком коротким. Проверьте сканирование.");
            return;
        }

        if (stock <= 0) {
            setMarkingCheckResult(null);
            setError(`Товар «${safeProduct.name}» отсутствует на остатке`);
            return;
        }

        const markingFingerprint =
            getMarkingCodeFingerprint(
                markingCode,
            );

        const hasSameCode =
            checkoutItems.some(
                item =>
                    getMarkingCodeFingerprint(
                        item.markingCode,
                    ) ===
                    markingFingerprint,
            );

        if (hasSameCode) {
            setMarkingCheckResult({
                ok: false,
                canSell: false,
                markingStatus: "M-",
                message: "Этот DataMatrix уже добавлен в текущий чек",
            });
            setError("Этот DataMatrix уже добавлен в текущий чек");
            return;
        }

        const existsInHeldCheckout =
            heldCheckouts.some(
                held =>
                    held.items.some(
                        item =>
                            getMarkingCodeFingerprint(
                                item.markingCode,
                            ) ===
                            markingFingerprint,
                    ),
            );

        if (existsInHeldCheckout) {
            setMarkingCheckResult({
                ok: false,
                canSell: false,
                markingStatus: "M-",
                message:
                    "Этот DataMatrix уже находится в отложенном чеке",
            });
            setError(
                "Этот DataMatrix уже находится в отложенном чеке",
            );
            return;
        }

        const existsInPosBackgroundQueue =
            posBackgroundJobs.some(
                job =>
                    job.receipt.items.some(
                        item =>
                            getMarkingCodeFingerprint(
                                item.markingCode,
                            ) ===
                            markingFingerprint,
                    ),
            );

        if (existsInPosBackgroundQueue) {
            setMarkingCheckResult({
                ok: false,
                canSell: false,
                markingStatus: "M-",
                message:
                    "Этот DataMatrix уже находится в фоновой очереди продажи",
            });
            setError(
                "Этот DataMatrix уже находится в фоновой очереди продажи",
            );
            return;
        }

        if (
            hasUsedMarkingCodeLocally(
                markingCode,
            )
        ) {
            setMarkingCheckResult({
                ok: false,
                canSell: false,
                markingStatus: "M-",
                message:
                    "Этот DataMatrix уже был продан на этой кассе. Повторная продажа заблокирована.",
            });
            setError(
                "Этот DataMatrix уже был продан на этой кассе. Повторная продажа заблокирована.",
            );
            return;
        }

        const currentProductQuantity = checkoutItems
            .filter((item) => String(item.product.id) === String(safeProduct.id))
            .reduce((sum, item) => sum + item.quantity, 0);

        if (currentProductQuantity + saleQuantity > stock) {
            setMarkingCheckResult(null);
            setError(
                `Недостаточно остатка: «${safeProduct.name}». В наличии ${formatQuantity(stock, safeProduct.unit)}, нужно ${formatQuantity(saleQuantity, safeProduct.unit)}`,
            );
            return;
        }

        try {
            setIsCheckingMarking(true);
            setBackgroundMarkingCheck({
                productName: safeProduct.name,
                codePreview: formatMarkingCodePreview(markingCode),
                packageMode,
            });
            setError(null);
            setNotice(null);
            setMarkingCheckResult(null);
            setMarkingModalProduct(null);
            setMarkingCodeInput("");
            setSearchQuery("");
            setFoundProducts([]);

            requestAnimationFrame(() => {
                searchInputRef.current?.focus();
            });

            const checkResult = await precheckMarkingCode(markingCode, packageMode);
            const status = checkResult.markingStatus || "M";

            setMarkingCheckResult({
                ...checkResult,
                markingStatus: status,
            });

            if (!checkResult.canSell || status !== "M+") {
                setError(
                    checkResult.message ||
                    `Код маркировки не прошёл проверку: [${status}]`,
                );
                return;
            }

            const safeMarkingCode = normalizeMarkingCode(
                checkResult.normalizedMarkingCode || markingCode,
            );

            setCheckoutItems((prevItems) => [
                ...prevItems,
                {
                    product: safeProduct,
                    id: `${safeProduct.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                    quantity: saleQuantity,
                    markingCode: safeMarkingCode,
                    markingStatus: "M+",
                    markingMessage:
                        packageMode === "block"
                            ? checkResult.message || `КМ блока сигарет проверен успешно [M+]. В чек добавлено ${CIGARETTE_BLOCK_QUANTITY} шт.`
                            : checkResult.message || "КМ проверен успешно",
                    markingCheckedAt: new Date().toISOString(),
                    markingPackageMode: packageMode,
                    markingPackageQuantity: saleQuantity,
                },
            ]);

            setMarkingModalProduct(null);
            setMarkingCodeInput("");
            setMarkingCheckResult(null);
            setMarkingPackageMode("single");
            setSearchQuery("");
            setFoundProducts([]);
            setError(null);
            setNotice(
                packageMode === "block"
                    ? `КМ блока проверен [M+]. Блок «${safeProduct.name}» добавлен в чек как ${CIGARETTE_BLOCK_QUANTITY} шт.`
                    : `Маркировка проверена [M+]. Товар «${safeProduct.name}» добавлен в чек.`,
            );

            requestAnimationFrame(() => {
                searchInputRef.current?.focus();
            });
        } catch (err) {
            console.error(err);

            const message =
                err instanceof Error
                    ? err.message
                    : "Не удалось проверить код маркировки";

            setMarkingCheckResult({
                ok: false,
                canSell: false,
                markingStatus: "M",
                message,
            });
            setError(message);
        } finally {
            setIsCheckingMarking(false);
            setBackgroundMarkingCheck(null);
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
            setError("Введите корректное количество товара");
            return;
        }

        if (!allowNegativeStock && stock <= 0) {
            setError(`Товар «${safeProduct.name}» отсутствует на остатке`);
            return;
        }

        setCheckoutItems((prevItems) => {
            const existingItem = prevItems.find(
                (item) => String(item.product.id) === String(safeProduct.id),
            );

            const currentQuantity = existingItem?.quantity || 0;
            const nextQuantity = roundQuantity(currentQuantity + safeQuantity);

            if (!allowNegativeStock && nextQuantity > stock) {
                setError(
                    `Недостаточно остатка: «${safeProduct.name}». В наличии ${formatQuantity(stock, safeProduct.unit)}`,
                );
                return prevItems;
            }

            setError(null);

            if (allowNegativeStock && nextQuantity > stock) {
                setNotice(
                    `Весовой товар «${safeProduct.name}» добавлен с уходом остатка в минус. Это разрешено для погрешности веса.`,
                );
            } else {
                setNotice(null);
            }

            if (existingItem) {
                return prevItems.map((item) =>
                    String(item.product.id) === String(safeProduct.id)
                        ? {...item, quantity: nextQuantity}
                        : item,
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

        setSearchQuery("");
        setFoundProducts([]);

        requestAnimationFrame(() => {
            searchInputRef.current?.focus();
        });
    };

    const addToCheckout = (product: Product, sourceQuery = "") => {
        const safeProduct = normalizeProduct(product);

        if (isMarkedProduct(safeProduct)) {
            openMarkingScanModal(
                safeProduct,
                getMarkingPackageModeFromBarcodeScan(safeProduct, sourceQuery),
            );
            return;
        }

        if (isWeightProduct(safeProduct)) {
            setWeightModalProduct(safeProduct);
            setWeightQuantity("");
            setError(null);
            return;
        }

        addQuantityToCheckout(safeProduct, 1);
    };

    const changeQuantity = (itemId: string, delta: number) => {
        setCheckoutItems((prevItems) => {
            return prevItems.map((item) => {
                if (item.id !== itemId) {
                    return item;
                }

                if (isMarkedProduct(item.product)) {
                    setError(
                        "Для маркированного товара количество не меняется: один DataMatrix = одна позиция в чеке",
                    );
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
                        `Недостаточно остатка: «${item.product.name}». В наличии ${formatQuantity(stock, item.product.unit)}`,
                    );
                    return item;
                }

                setError(null);

                if (allowNegativeStock && nextQuantity > stock) {
                    setNotice(
                        `Весовой товар «${item.product.name}» уходит в минусовой остаток. Это разрешено для погрешности веса.`,
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

        setCheckoutItems((prevItems) => {
            return prevItems.map((item) => {
                if (item.id !== itemId) {
                    return item;
                }

                if (isMarkedProduct(item.product)) {
                    setError(
                        "Для маркированного товара количество не меняется: один DataMatrix = одна позиция в чеке",
                    );
                    return item;
                }

                const stock = getStock(item.product);
                const isWeight = item.product.unit === "weight";
                const allowNegativeStock = canSellIntoNegativeStock(item.product);

                const nextQuantity = isWeight
                    ? roundQuantity(parsed)
                    : Math.floor(parsed);

                if (nextQuantity <= 0) {
                    setError("Количество должно быть больше нуля");
                    return item;
                }

                if (!allowNegativeStock && nextQuantity > stock) {
                    setError(
                        `Недостаточно остатка: «${item.product.name}». В наличии ${formatQuantity(stock, item.product.unit)}`,
                    );
                    return item;
                }

                setError(null);

                if (allowNegativeStock && nextQuantity > stock) {
                    setNotice(
                        `Весовой товар «${item.product.name}» уходит в минусовой остаток. Это разрешено для погрешности веса.`,
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
        setCheckoutItems((prev) => prev.filter((item) => item.id !== itemId));
    };

    const holdCurrentCheckout = () => {
        if (checkoutItems.length === 0) {
            setError("Нечего откладывать: чек пустой");
            return;
        }

        setHoldCheckoutName("");
        setError(null);
        setIsHoldCheckoutNameModalOpen(true);
    };

    const confirmHoldCurrentCheckout = () => {
        const customerName = holdCheckoutName.trim();

        if (!customerName) {
            setError("Введите имя для отложенного чека");
            return;
        }

        const heldCheckout = holdCheckoutInStore(
            checkoutItems as unknown as StoredCheckoutItem[],
            total,
        );

        if (!heldCheckout) {
            setError("Не удалось отложить чек");
            return;
        }

        saveHeldCheckoutName(
            String(heldCheckout.id),
            customerName,
        );

        setCheckoutItems([]);
        setPaymentModal(null);
        setFiscalConfirmModal(false);
        setCashReceived("");
        setMixedCashAmount(0);
        setMixedCardAmount(0);
        setTransferCustomerName("");
        setHoldCheckoutName("");
        setIsHoldCheckoutNameModalOpen(false);
        setError(null);
        setNotice(`Чек отложен: ${customerName}`);

        requestAnimationFrame(() => {
            searchInputRef.current?.focus();
        });
    };

    const restoreHeldCheckout = (held: HeldCheckout) => {
        if (checkoutItems.length > 0) {
            const shouldReplace = confirm(
                "В текущем чеке уже есть товары. Заменить его отложенным чеком?",
            );

            if (!shouldReplace) {
                return;
            }
        }

        const restoredItems = normalizeStoredCheckoutItems(held.items);

        if (restoredItems.length === 0) {
            removeHeldCheckout(held.id);
            removeHeldCheckoutName(String(held.id));
            setError("Отложенный чек пустой или повреждён, он удалён из списка");
            return;
        }

        const heldTitle = getHeldCheckoutTitle(held);

        removeHeldCheckout(held.id);
        removeHeldCheckoutName(String(held.id));
        setCheckoutItems(restoredItems);
        setPaymentModal(null);
        setFiscalConfirmModal(false);
        setCashReceived("");
        setIsHeldReceiptsModalOpen(false);
        setError(null);
        setNotice(`Отложенный чек восстановлен: ${heldTitle}`);

        requestAnimationFrame(() => {
            searchInputRef.current?.focus();
        });
    };

    const deleteHeldCheckout = (held: HeldCheckout) => {
        const shouldDelete = confirm(
            `Удалить отложенный чек «${getHeldCheckoutTitle(held)}»?`,
        );

        if (!shouldDelete) {
            return;
        }

        removeHeldCheckout(held.id);
        removeHeldCheckoutName(String(held.id));
        setNotice("Отложенный чек удалён");
    };

    const handleKeyDown = async (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== "Enter") {
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

            const exactFromCurrentResults = products.find((product) =>
                hasExactBarcode(product.barcode, query),
            );

            if (exactFromCurrentResults) {
                addToCheckout(exactFromCurrentResults, query);
                return;
            }

            products = await searchProducts(query);

            setFoundProducts(products);

            const exactBarcodeProduct = products.find((product) =>
                hasExactBarcode(product.barcode, query),
            );

            if (exactBarcodeProduct) {
                addToCheckout(exactBarcodeProduct, query);
                return;
            }

            if (products.length === 1) {
                addToCheckout(products[0], query);
                return;
            }

            if (products.length > 1) {
                setError("Найдено несколько товаров. Выберите нужный из списка");
                return;
            }

            setError("Товар не найден в базе");
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : "Ошибка поиска товара");
        } finally {
            setIsSearchLoading(false);
        }
    };

    const openPayment = (method: PaymentMethod) => {
        if (!isShiftOpen) {
            setError("Смена ККТ закрыта. Откройте смену перед продажей.");
            return;
        }

        if (checkoutItems.length === 0) {
            setError("Чек пустой. Добавьте товар перед оплатой");
            return;
        }

        const stockError = checkoutItems.find((item) => {
            return (
                !canSellIntoNegativeStock(item.product) &&
                item.quantity > getStock(item.product)
            );
        });

        if (stockError) {
            setError(
                `Недостаточно остатка: «${stockError.product.name}». В наличии ${formatQuantity(getStock(stockError.product), stockError.product.unit)}`,
            );
            return;
        }

        const unsafeMarkedItem = checkoutItems.find(
            (item) => isMarkedProduct(item.product) && item.markingStatus !== "M+",
        );

        if (unsafeMarkedItem) {
            setError(
                `Маркированный товар «${unsafeMarkedItem.product.name}» не прошёл проверку [M+]. Продажа заблокирована.`,
            );
            return;
        }

        setError(null);
        setCashReceived("");
        setMixedCashAmount(0);
        setMixedCardAmount(0);

        if (method === "transfer") {
            setTransferCustomerName("");
        }

        setPaymentModal(method);
    };

    const searchReturnProduct = async () => {
        const query =
            returnSearchQuery.trim()

        if (!query) {
            return
        }

        try {
            setError(null)

            const products =
                await searchProducts(query)

            const exactProduct =
                products.find(product =>
                    hasExactBarcode(
                        product.barcode,
                        query
                    )
                )

            if (exactProduct) {
                addProductToReturn(
                    exactProduct
                )

                return
            }

            if (products.length === 1) {
                addProductToReturn(
                    products[0]
                )

                return
            }

            setReturnFoundProducts(
                products
            )

            if (products.length === 0) {
                setError(
                    'Товар для возврата не найден'
                )
            }
        } catch (error) {
            console.error(error)

            setError(
                error instanceof Error
                    ? error.message
                    : 'Ошибка поиска товара'
            )
        }
    }

    const addProductToReturn = (
        product: Product
    ) => {
        const safeProduct =
            normalizeProduct(product)

        setReturnItems(prev => {
            const existing =
                prev.find(
                    item =>
                        String(
                            item.product.id
                        ) ===
                        String(
                            safeProduct.id
                        )
                )

            if (existing) {
                return prev.map(item => {
                    if (
                        String(
                            item.product.id
                        ) !==
                        String(
                            safeProduct.id
                        )
                    ) {
                        return item
                    }

                    return {
                        ...item,

                        quantity:
                            safeProduct.unit ===
                            'weight'
                                ? roundQuantity(
                                    item.quantity +
                                    0.001
                                )
                                : item.quantity +
                                1,
                    }
                })
            }

            return [
                ...prev,
                {
                    product:
                    safeProduct,

                    quantity:
                        safeProduct.unit ===
                        'weight'
                            ? 1
                            : 1,
                },
            ]
        })

        setReturnSearchQuery('')
        setReturnFoundProducts([])
    }

    const updateReturnQuantity = (
        productId: ProductId,
        rawValue: string
    ) => {
        const value =
            safeParseNumber(rawValue)

        setReturnItems(prev =>
            prev.map(item => {
                if (
                    String(
                        item.product.id
                    ) !==
                    String(productId)
                ) {
                    return item
                }

                const quantity =
                    item.product.unit ===
                    'weight'
                        ? roundQuantity(value)
                        : Math.floor(value)

                return {
                    ...item,
                    quantity:
                        Math.max(
                            item.product.unit ===
                            'weight'
                                ? 0.001
                                : 1,
                            quantity
                        ),
                }
            })
        )
    }

    const removeReturnItem = (
        productId: ProductId
    ) => {
        setReturnItems(prev =>
            prev.filter(
                item =>
                    String(
                        item.product.id
                    ) !==
                    String(productId)
            )
        )
    }

    const submitProductReturn =
        async () => {
            if (
                returnItems.length === 0
            ) {
                setError(
                    'Добавьте товар для возврата'
                )

                return
            }

            const invalidItem =
                returnItems.find(
                    item =>
                        !Number.isFinite(
                            item.quantity
                        ) ||
                        item.quantity <= 0
                )

            if (invalidItem) {
                setError(
                    `Некорректное количество: ${invalidItem.product.name}`
                )

                return
            }

            try {
                setIsReturnSaving(true)

                setError(null)
                setNotice(null)

                const response =
                    await fetch(
                        '/api/returns',
                        {
                            method: 'POST',

                            headers: {
                                'Content-Type':
                                    'application/json',

                                ...getLocationHeaders(),
                            },

                            body:
                                JSON.stringify({
                                    items:
                                        returnItems.map(
                                            item => ({
                                                productId:
                                                item
                                                    .product
                                                    .id,

                                                quantity:
                                                item
                                                    .quantity,
                                            })
                                        ),

                                    comment:
                                    returnComment,
                                }),
                        }
                    )

                const data =
                    await readJsonSafe<{
                        ok?: boolean
                        message?: string

                        location?: {
                            name?: string
                        }
                    } & ApiError>(
                        response
                    )

                if (!response.ok) {
                    throw new Error(
                        data?.message ||
                        'Не удалось провести возврат'
                    )
                }

                /*
                 * Получаем свежие остатки
                 * текущей зоны.
                 */
                await refreshProducts()

                setReturnItems([])
                setReturnSearchQuery('')
                setReturnFoundProducts([])
                setReturnComment('')

                setIsReturnModalOpen(false)

                setNotice(
                    `Возврат проведён. Товар возвращён на остаток зоны «${
                        data?.location
                            ?.name ||
                        warehouseLocationName
                    }»`
                )

                requestAnimationFrame(
                    () => {
                        searchInputRef.current
                            ?.focus()
                    }
                )
            } catch (error) {
                console.error(
                    'Return error:',
                    error
                )

                setError(
                    error instanceof Error
                        ? error.message
                        : 'Ошибка возврата товара'
                )
            } finally {
                setIsReturnSaving(false)
            }
        }

    const buildCommodityReceiptHtml = (receipt: Receipt): string => {
        const organizationName = "ИП БАРАНОВА ЛЮДМИЛА ВЛАДИМИРОВНА";
        const organizationInn = "383802146665";
        const organizationAddress = "Иркутская область, с. Николаевка, ул. Ленина д.11";
        const createdAt = new Date(receipt.createdAt).toLocaleString("ru-RU");
        const rows = receipt.items
            .map((item) => {
                const qty = `${formatQuantity(item.quantity, item.unit || "piece")}`;
                const price = formatCurrency(item.price);
                const sum = formatCurrency(item.total);

                return `
                <div class="item">
                    <div class="name">${escapeHtml(String(item.name || "Товар"))}</div>
                    <div class="line"><span>${qty} × ${price}</span><strong>${sum}</strong></div>
                </div>
            `;
            })
            .join("");

        return `
            <!doctype html>
            <html lang="ru">
            <head>
                <meta charset="utf-8" />
                <title>Товарный чек ${receipt.id}</title>
                <style>
                    * { box-sizing: border-box; }
                    body { margin: 0; font-family: Arial, sans-serif; color: #111; }
                    .receipt { width: 58mm; padding: 4mm 3mm; font-size: 11px; }
                    h1 { margin: 0 0 6px; text-align: center; font-size: 15px; letter-spacing: .04em; }
                    .center { text-align: center; }
                    .muted { color: #555; }
                    .sep { border-top: 1px dashed #111; margin: 6px 0; }
                    .meta div { margin: 2px 0; }
                    .item { margin: 6px 0; }
                    .name { font-weight: 700; }
                    .line { display: flex; justify-content: space-between; gap: 8px; margin-top: 2px; }
                    .total { display: flex; justify-content: space-between; font-size: 15px; font-weight: 800; }
                    @media print {
                        @page { size: 58mm auto; margin: 0; }
                        body { margin: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="receipt">
                    <h1>ТОВАРНЫЙ ЧЕК</h1>
                    <div class="center muted">${escapeHtml(organizationName)}</div>
                    <div class="center muted">ИНН: ${escapeHtml(organizationInn)}</div>
                    <div class="center muted">${escapeHtml(organizationAddress)}</div>
                    <div class="sep"></div>
                    <div class="meta">
                        <div>Точка: ${receipt.locationName || warehouseLocationName}</div>
                        <div>Кассир: ${receipt.cashierName || warehouseUserName}</div>
                        <div>Дата: ${createdAt}</div>
                        <div>Чек №: ${receipt.id}</div>
                        <div>Оплата: ${receipt.paymentLabel}</div>
                        ${receipt.paymentMethod === "transfer" && receipt.customerName
            ? `<div>Клиент: ${escapeHtml(receipt.customerName)}</div>`
            : ""}
                    </div>
                    <div class="sep"></div>
                    ${rows}
                    <div class="sep"></div>
                    <div class="total"><span>ИТОГО</span><span>${formatCurrency(receipt.total)}</span></div>
                    ${receipt.paymentMethod === "cash" ? `<div class="line"><span>Получено</span><span>${formatCurrency(receipt.receivedAmount || 0)}</span></div><div class="line"><span>Сдача</span><span>${formatCurrency(receipt.change || 0)}</span></div>` : ""}
                    ${receipt.paymentMethod === "mixed" ? `<div class="line"><span>Наличными</span><span>${formatCurrency(receipt.cashAmount || 0)}</span></div><div class="line"><span>Картой</span><span>${formatCurrency(receipt.cardAmount || 0)}</span></div>` : ""}
                    <div class="sep"></div>
                    <div class="center">Спасибо за покупку!</div>
                </div>
                <script>
                    window.onload = function () {
                        window.focus();
                        window.print();
                    };
                </script>
            </body>
            </html>
        `;
    };

    const printCommodityReceipt = (receipt: Receipt) => {
        const printWindow = window.open("", "_blank", "width=420,height=720");

        if (!printWindow) {
            setError("Браузер заблокировал окно печати товарного чека");
            return;
        }

        printWindow.document.open();
        printWindow.document.write(buildCommodityReceiptHtml(receipt));
        printWindow.document.close();
    };

    const saveLastCommodityReceipt = (receipt: Receipt) => {
        setLastCommodityReceipt(receipt);

        if (typeof window === "undefined") {
            return;
        }

        try {
            localStorage.setItem(LAST_COMMODITY_RECEIPT_KEY, JSON.stringify(receipt));
        } catch (err) {
            console.warn("Last commodity receipt save error:", err);
        }
    };

    const openCommodityReceiptPaperWarning = (receipt: Receipt) => {
        setPendingCommodityReceipt(receipt);
        setCommodityReceiptPrintStep("paper-warning");
        setError(null);
        setNotice(null);
    };

    const repeatLastCommodityReceipt = () => {
        if (!lastCommodityReceipt) {
            setError("Последний товарный чек не найден");
            setNotice(null);
            return;
        }

        openCommodityReceiptPaperWarning(lastCommodityReceipt);
    };

    const completePayment = async (
        method: PaymentMethod,
        shouldFiscalize = false,
    ) => {
        if (isPaying) {
            return;
        }

        if (!isShiftOpen) {
            setError("Смена ККТ закрыта. Откройте смену перед продажей.");
            return;
        }

        if (method === "cash" && cashReceivedNumber < total) {
            setError("Полученная сумма меньше суммы чека");
            return;
        }

        if (method === "mixed" && !isMixedPaymentValid) {
            setError("Сумма наличных и карты должна точно совпадать с суммой чека");
            return;
        }

        if (
            method === "transfer" &&
            !transferCustomerName.trim()
        ) {
            setError("Введите имя клиента для перевода");
            return;
        }

        try {
            setIsPaying(true);
            setError(null);
            setNotice(null);

            // Не ждём сеть/Neon в момент оплаты.
            // Используем зафиксированный снимок корзины.
            // Сервер /api/sales всё равно повторно и авторитетно
            // проверит остатки внутри транзакции.
            const validatedItems =
                checkoutItems.map(
                    item => {
                        const currentStock =
                            getStock(
                                item.product,
                            );

                        const allowNegativeStock =
                            canSellIntoNegativeStock(
                                item.product,
                            );

                        if (
                            !allowNegativeStock &&
                            currentStock <
                            item.quantity
                        ) {
                            throw new Error(
                                `Недостаточно остатка: «${item.product.name}». В наличии ${formatQuantity(
                                    currentStock,
                                    item.product.unit,
                                )}, в чеке ${formatQuantity(
                                    item.quantity,
                                    item.product.unit,
                                )}`,
                            );
                        }

                        return item;
                    },
                );

            const missingMarkedItem = validatedItems.find(
                (item) =>
                    isMarkedProduct(item.product) &&
                    !normalizeMarkingCode(item.markingCode),
            );

            if (missingMarkedItem) {
                throw new Error(
                    `Для маркированного товара «${missingMarkedItem.product.name}» не отсканирован DataMatrix`,
                );
            }

            const unsafeMarkedItem = validatedItems.find(
                (item) => isMarkedProduct(item.product) && item.markingStatus !== "M+",
            );

            if (unsafeMarkedItem) {
                throw new Error(
                    `Маркированный товар «${unsafeMarkedItem.product.name}» не прошёл проверку [M+]. Продажа заблокирована.`,
                );
            }

            const receiptItems: ReceiptItem[] = validatedItems.map((item) => {
                const price = getSellingPrice(item.product);
                const marked = isMarkedProduct(item.product);
                const markingCode = normalizeMarkingCode(item.markingCode);
                const isBlockPackage = marked && item.markingPackageMode === "block";
                const lineTotal =
                    getRoundedSaleLineTotal(
                        item.product,
                        item.quantity,
                    );

                const fiscalQuantity =
                    isBlockPackage
                        ? 1
                        : item.quantity;

                const fiscalPrice =
                    isBlockPackage
                        ? lineTotal
                        : isWeightProduct(
                            item.product,
                        )
                            ? getFiscalUnitPriceForRoundedWeight(
                                item.product,
                                item.quantity,
                                lineTotal,
                            )
                            : price;

                const fiscalTotal =
                    isBlockPackage ||
                    isWeightProduct(
                        item.product,
                    )
                        ? lineTotal
                        : roundMoney(
                            fiscalPrice *
                            fiscalQuantity,
                        );

                return {
                    productId: item.product.id,
                    name: item.product.name,
                    barcode: item.product.barcode,
                    category: item.product.category,
                    unit: item.product.unit,
                    quantity: item.quantity,
                    stockQuantity: item.quantity,
                    measureCode: getMeasureCode(item.product.unit),
                    measureName: getMeasureName(item.product.unit),
                    price,
                    total: lineTotal,
                    marked,
                    ...(marked && markingCode
                        ? {
                            markingCode,
                            markingStatus: item.markingStatus,
                            markingMessage: item.markingMessage,
                            markingPackageMode: item.markingPackageMode,
                            markingPackageQuantity: item.markingPackageQuantity,
                            ...(
                                isBlockPackage ||
                                isWeightProduct(
                                    item.product,
                                )
                                    ? {
                                        fiscalQuantity,
                                        fiscalPrice,
                                        fiscalTotal,
                                        ...(isBlockPackage
                                            ? {
                                                fiscalPackageName:
                                                    "Блок сигарет",
                                            }
                                            : {}),
                                    }
                                    : {}
                            ),
                        }
                        : {}),
                };
            });

            const receiptTotal = receiptItems.reduce(
                (sum, item) => sum + item.total,
                0,
            );
            const hasMarkedReceiptItems = receiptItems.some(
                (item) => item.marked && item.markingCode,
            );
            const shouldRunFiscalization =
                hasMarkedReceiptItems ||
                ((method === "card" || method === "cash" || method === "mixed") && shouldFiscalize);

            const cashAmount =
                method === "cash"
                    ? receiptTotal
                    : method === "mixed"
                        ? mixedCashAmount
                        : 0;

            const cardAmount =
                method === "card"
                    ? receiptTotal
                    : method === "mixed"
                        ? mixedCardAmount
                        : 0;

            const transferAmount =
                method === "transfer"
                    ? receiptTotal
                    : 0;

            if (
                method === "mixed" &&
                Math.abs(
                    Math.round((cashAmount + cardAmount + Number.EPSILON) * 100) / 100 -
                    Math.round((receiptTotal + Number.EPSILON) * 100) / 100
                ) > 0.01
            ) {
                throw new Error("Сумма чека изменилась. Введите смешанную оплату заново");
            }

            const receipt: Receipt = {
                id: createReceiptId(),
                createdAt: new Date().toISOString(),
                paymentMethod: method,
                paymentLabel: getPaymentLabel(method),
                items: receiptItems,
                total: receiptTotal,
                receivedAmount: method === "cash" ? cashReceivedNumber : receiptTotal,
                change: method === "cash" ? cashReceivedNumber - receiptTotal : 0,
                cashAmount,
                cardAmount,
                transferAmount,
                customerName:
                    method === "transfer"
                        ? transferCustomerName.trim()
                        : undefined,
                fiscalizationRequested: shouldRunFiscalization,
                fiscalStatus: shouldRunFiscalization ? undefined : "skipped",
                cashierName: warehouseUserName,
                cashierLogin: warehouseUserLogin,
                locationName: warehouseLocationName,
                locationSlug: warehouseLocationSlug,
            };

            const receiptForSave: Receipt = {
                ...receipt,
                fiscalStatus:
                    shouldRunFiscalization
                        ? "queued"
                        : "skipped",
            };

            // КРИТИЧЕСКОЕ ИЗМЕНЕНИЕ:
            // в момент оплаты ждём только быструю локальную запись IndexedDB.
            // Ни Neon, ни Vercel, ни АТОЛ очередь кассира больше не держат.
            await enqueuePosBackgroundSale<Receipt>({
                id:
                receiptForSave.id,

                receipt:
                receiptForSave,

                shouldFiscalize:
                shouldRunFiscalization,

                locationSlug:
                warehouseLocationSlug,
            });

            updateLocalStockAfterSale(
                receiptItems,
            );

            setCheckoutItems([]);
            setPaymentModal(null);
            setFiscalConfirmModal(false);
            setCashReceived("");
            setMixedCashAmount(0);
            setMixedCardAmount(0);
            setTransferCustomerName("");

            if (!shouldRunFiscalization) {
                saveLastCommodityReceipt(
                    receiptForSave,
                );

                setPendingCommodityReceipt(
                    receiptForSave,
                );

                setCommodityReceiptPrintStep(
                    "ask",
                );

                setLastReceipt(
                    receiptForSave,
                );
            } else {
                setLastReceipt(
                    null,
                );
            }

            setNotice(
                shouldRunFiscalization
                    ? "Продажа принята. Сохранение и фискализация идут в фоне."
                    : "Продажа принята. Сохранение в базе идёт в фоне.",
            );

            await refreshPosBackgroundJobs();

            // Worker запускается без await.
            void processPosBackgroundQueue();

            requestAnimationFrame(() => {
                searchInputRef.current?.focus();
            });
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : "Ошибка оплаты");
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
            setPriceLabelSearch("");
            setPriceLabelCategoryFilter("all");
        } catch (err) {
            console.error(err);
            setError("Не удалось обновить товары для печати ценников");
        } finally {
            setIsRefreshingLabels(false);
        }
    };

    const togglePriceLabelProduct = (productId: ProductId) => {
        const id = String(productId);

        setSelectedPriceLabelIds((prev) => {
            if (prev.includes(id)) {
                return prev.filter((item) => item !== id);
            }

            return [...prev, id];
        });
    };

    const selectAllFilteredPriceLabels = () => {
        setSelectedPriceLabelIds(
            priceLabelProducts.map((product) => String(product.id)),
        );
    };

    const clearSelectedPriceLabels = () => {
        setSelectedPriceLabelIds([]);
    };

    const updatePriceLabelQuantity = (productId: ProductId, rawValue: string) => {
        const id = String(productId);
        const parsedQuantity = Math.floor(safeParseNumber(rawValue));
        const safeQuantity = Math.min(999, Math.max(1, parsedQuantity || 1));

        setPriceLabelQuantities((prev) => ({
            ...prev,
            [id]: safeQuantity,
        }));

        setSelectedPriceLabelIds((prev) => {
            if (prev.includes(id)) {
                return prev;
            }

            return [...prev, id];
        });
    };

    const expandProductsForPriceLabels = (products: Product[]): Product[] => {
        return products.flatMap((product) => {
            const quantity = getPriceLabelQuantity(product.id);

            return Array.from({length: quantity}, () => product);
        });
    };

    const renderBarcodeSvgFromDbValue = (barcodeFromDb: string): string => {
        const barcode = getPrimaryBarcode(String(barcodeFromDb || "")).trim();

        if (!barcode) {
            return "";
        }

        try {
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

            JsBarcode(svg, barcode, {
                format: "CODE128",
                width: 0.85,
                height: 22,
                displayValue: false,
                margin: 0,
            });

            return new XMLSerializer().serializeToString(svg);
        } catch (err) {
            console.error(err);
            return "";
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
            const rounded = Math.round(value);

            return new Intl.NumberFormat("ru-RU", {
                maximumFractionDigits: 0,
            }).format(rounded);
        };

        const sheets = chunkProducts(products, LABELS_PER_SHEET)
            .map((sheetProducts) => {
                const labels = sheetProducts
                    .map((product) => {
                        const name = escapeHtml(product.name);
                        const price = formatPriceForLabel(getSellingPrice(product));
                        const unitLabel = escapeHtml(
                            product.unit === "weight" ? "за кг" : "за шт",
                        );
                        const barcodeSvg = renderBarcodeSvgFromDbValue(
                            product.barcode || "",
                        );

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
                    })
                    .join("");

                return `
                <main class="sheet">
                    ${labels}
                </main>
            `;
            })
            .join("");

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
            const rounded = Math.round(value);

            return new Intl.NumberFormat("ru-RU", {
                maximumFractionDigits: 0,
            }).format(rounded);
        };

        const labels = products
            .map((product) => {
                const name = escapeHtml(product.name);
                const price = formatPriceForLabel(getSellingPrice(product));
                const unitLabel = escapeHtml(
                    product.unit === "weight" ? "за кг" : "за шт",
                );
                const barcodeSvg = renderBarcodeSvgFromDbValue(product.barcode || "");

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
            })
            .join("");

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

    const printPriceLabels = async (
        mode: PrintMode,
        layout: PrintLayout = "a4",
    ) => {
        const printWindow = window.open(
            "",
            "_blank",
            layout === "thermal" ? "width=420,height=650" : "width=900,height=700",
        );

        if (!printWindow) {
            setError("Браузер заблокировал окно печати. Разрешите всплывающие окна.");
            return;
        }

        try {
            setIsRefreshingLabels(true);
            setError(null);
            setNotice(null);

            const isThermalPrint = layout === "thermal";

            printWindow.document.open();
            printWindow.document.write(`
                <!doctype html>
                <html lang="ru">
                    <head>
                        <meta charset="utf-8" />
                        <title>${isThermalPrint ? "Подготовка термоэтикеток" : "Подготовка ценников"}</title>
                    </head>
                    <body style="font-family: Arial, sans-serif; padding: 24px;">
                        <h2>${isThermalPrint ? "Подготовка термоэтикеток..." : "Подготовка ценников..."}</h2>
                        <p>Пожалуйста, подождите.</p>
                    </body>
                </html>
            `);
            printWindow.document.close();

            const freshProducts = await refreshProducts();
            const freshFilteredProducts = freshProducts.filter((product) => {
                return (
                    doesProductMatchPriceLabelCategory(
                        product,
                        priceLabelCategoryFilter,
                    ) && doesProductMatchPriceLabelSearch(product, priceLabelSearch)
                );
            });

            const baseProducts =
                mode === "selected"
                    ? freshProducts.filter((product) =>
                        selectedPriceLabelIds.includes(String(product.id)),
                    )
                    : mode === "filtered"
                        ? freshFilteredProducts
                        : freshProducts;

            const products = expandProductsForPriceLabels(baseProducts);

            if (products.length === 0) {
                printWindow.close();
                setError("Нет товаров для печати ценников");
                return;
            }

            printWindow.document.open();
            printWindow.document.write(
                isThermalPrint
                    ? buildThermalPriceLabelsHtml(products)
                    : buildA4PriceLabelsHtml(products),
            );
            printWindow.document.close();

            setNotice(
                `${isThermalPrint ? "Термоэтикетки XPrinter" : "Ценники A4"} отправлены на печать: ${products.length}. Товаров: ${baseProducts.length}`,
            );
        } catch (err) {
            console.error(err);
            printWindow.close();
            setError("Не удалось сформировать ценники");
        } finally {
            setIsRefreshingLabels(false);
        }
    };

    const requestPriceLabelPrint = (
        mode: PrintMode,
        layout: PrintLayout = "a4",
    ) => {
        if (layout === "thermal") {
            setPendingPriceLabelPrint({mode, layout});
            return;
        }

        void printPriceLabels(mode, layout);
    };

    const confirmPendingPriceLabelPrint = () => {
        const pendingPrint = pendingPriceLabelPrint;

        setPendingPriceLabelPrint(null);

        if (!pendingPrint) {
            return;
        }

        void printPriceLabels(pendingPrint.mode, pendingPrint.layout);
    };

    const closeCommodityReceiptPrintModal = () => {
        setPendingCommodityReceipt(null);
        setCommodityReceiptPrintStep("ask");
    };

    const confirmCommodityReceiptPrint = () => {
        const receipt = pendingCommodityReceipt;

        closeCommodityReceiptPrintModal();

        if (!receipt) {
            return;
        }

        printCommodityReceipt(receipt);
    };

    if (!isAuthChecked) {
        return (
            <div
                className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6 flex items-center justify-center text-gray-500">
                Проверка авторизации...
            </div>
        );
    }

    return (
        <div
            className="min-h-dvh bg-gradient-to-br from-blue-50 to-indigo-50 p-4 xl:h-dvh xl:min-h-0 xl:overflow-hidden">
            {isDeliveryAlertOpen && deliveryAlerts.length > 0 && (
                <div
                    className="fixed inset-0 z-[400] flex items-start justify-center bg-black/25 px-4 py-4 pointer-events-none">
                    <div
                        className="mt-4 w-full max-w-xl rounded-3xl border border-blue-200 bg-white p-5 shadow-2xl pointer-events-auto">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div
                                    className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-700">
                                    Новая доставка
                                </div>

                                <h2 className="mt-2 text-xl font-black text-gray-900">
                                    Поступила доставка: {deliveryAlerts[0]?.orderNumber}
                                </h2>

                                <p className="mt-1 text-sm text-gray-500">
                                    Уведомление будет звучать, пока доставка не будет принята.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setIsDeliveryAlertOpen(false)}
                                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-sm font-bold text-gray-500 hover:bg-gray-50"
                            >
                                Скрыть
                            </button>
                        </div>

                        <div className="mt-4 space-y-3">
                            {deliveryAlerts.map((order) => (
                                <div
                                    key={order.id}
                                    className="rounded-2xl border border-blue-100 bg-blue-50 p-4"
                                >
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <div className="font-bold text-blue-800">
                                                {order.orderNumber} ·{" "}
                                                {formatDeliveryAlertMoney(order.total)}
                                            </div>

                                            <div className="mt-1 text-sm font-semibold text-gray-900">
                                                {order.customerName}
                                            </div>

                                            <div className="mt-1 text-sm text-gray-600">
                                                {order.customerPhone}
                                            </div>

                                            <div className="mt-1 text-sm text-gray-600">
                                                {order.address}
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => acceptDeliveryFromAlert(order.id)}
                                            disabled={isAcceptingDeliveryId === order.id}
                                            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isAcceptingDeliveryId === order.id
                                                ? "Принимаю..."
                                                : "Принята доставка"}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            {(error || notice) && (
                <div
                    className="pointer-events-none fixed right-3 top-3 z-[9999] flex w-[calc(100vw-24px)] max-w-sm flex-col gap-2"
                >
                    {error && (
                        <motion.div
                            initial={{opacity: 0, x: 18, y: -4}}
                            animate={{opacity: 1, x: 0, y: 0}}
                            exit={{opacity: 0, x: 18}}
                            className="pointer-events-auto overflow-hidden rounded-2xl border border-red-200 bg-white shadow-xl"
                            role="alert"
                        >
                            <div className="flex min-h-12 items-center gap-2.5 px-3 py-2">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-red-100 text-sm font-black text-red-700">
                                    !
                                </div>

                                <div className="min-w-0 flex-1">
                                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-red-600">
                                        Ошибка
                                    </div>

                                    <div className="max-h-10 overflow-hidden text-xs font-bold leading-4 text-gray-900">
                                        {error}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setError(null)}
                                    className="shrink-0 rounded-lg px-1.5 py-1 text-lg leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                    aria-label="Закрыть ошибку"
                                >
                                    ×
                                </button>
                            </div>

                            <div className="h-1 overflow-hidden bg-red-100">
                                <div
                                    key={error}
                                    className="h-full origin-left bg-red-500"
                                    style={{animation: `toast-progress ${TOAST_AUTO_CLOSE_MS}ms linear forwards`}}
                                />
                            </div>
                        </motion.div>
                    )}

                    {notice && (
                        <motion.div
                            initial={{opacity: 0, x: 18, y: -4}}
                            animate={{opacity: 1, x: 0, y: 0}}
                            exit={{opacity: 0, x: 18}}
                            className="pointer-events-auto overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-xl"
                            role="status"
                        >
                            <div className="flex min-h-12 items-center gap-2.5 px-3 py-2">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-sm font-black text-emerald-700">
                                    ✓
                                </div>

                                <div className="min-w-0 flex-1">
                                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-600">
                                        Уведомление
                                    </div>

                                    <div className="max-h-10 overflow-hidden text-xs font-bold leading-4 text-gray-900">
                                        {notice}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setNotice(null)}
                                    className="shrink-0 rounded-lg px-1.5 py-1 text-lg leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                    aria-label="Закрыть уведомление"
                                >
                                    ×
                                </button>
                            </div>

                            <div className="h-1 overflow-hidden bg-emerald-100">
                                <div
                                    key={notice}
                                    className="h-full origin-left bg-emerald-500"
                                    style={{animation: `toast-progress ${TOAST_AUTO_CLOSE_MS}ms linear forwards`}}
                                />
                            </div>
                        </motion.div>
                    )}
                </div>
            )}

            <div className="mx-auto max-w-[1560px] xl:h-full xl:min-h-0">
                <div
                    className="grid grid-cols-1 gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-stretch">
                    <aside className="space-y-4 xl:h-full xl:min-h-0 xl:overflow-y-auto xl:pr-2">
                        <div className="rounded-3xl border border-indigo-100 bg-white p-5 shadow-xl">
                            <button
                                type="button"
                                onClick={() => router.push("/system")}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-indigo-200 bg-white px-5 py-3 text-sm font-black text-indigo-700 shadow-sm transition-colors hover:bg-indigo-50"
                            >
                                <span aria-hidden="true">←</span>
                                Вернуться в склад
                            </button>

                            <div
                                className="mt-3 rounded-2xl bg-indigo-50 px-4 py-3 text-xs font-black leading-5 text-indigo-700">
                                <div>Текущая зона: {warehouseLocationName}</div>
                                <div className="mt-0.5 text-indigo-500">{warehouseLocationSlug} ·
                                    Кассир: {warehouseUserName}</div>
                            </div>
                        </div>
                        <div className="rounded-3xl border border-indigo-100 bg-white p-5 shadow-xl">
                            <div className="text-sm font-bold text-gray-500">Итого к оплате</div>
                            <div className="mt-1 text-4xl font-black tracking-tight text-indigo-700">
                                {formatCurrency(total)}
                            </div>

                            <div className="mt-2 text-sm font-semibold text-gray-500">
                                Позиций в чеке: {checkoutItems.length}
                            </div>

                            {hasUnsafeMarkedCheckoutItems && (
                                <div
                                    className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                                    В чеке есть маркированный товар без подтверждения [M+]. Оплата заблокирована.
                                </div>
                            )}

                            <div className="mt-5 grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => openPayment("cash")}
                                        disabled={checkoutItems.length === 0 || hasUnsafeMarkedCheckoutItems}
                                        className="rounded-2xl bg-emerald-600 px-3 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">Наличные
                                </button>
                                <button type="button" onClick={() => openPayment("card")}
                                        disabled={checkoutItems.length === 0 || hasUnsafeMarkedCheckoutItems}
                                        className="rounded-2xl bg-indigo-600 px-3 py-3 text-sm font-black text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">Карта
                                </button>
                                <button type="button" onClick={() => openPayment("mixed")}
                                        disabled={checkoutItems.length === 0 || hasUnsafeMarkedCheckoutItems}
                                        className="rounded-2xl bg-violet-600 px-3 py-3 text-sm font-black text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">Смешанная
                                </button>
                                <button type="button" onClick={() => openPayment("transfer")}
                                        disabled={checkoutItems.length === 0 || hasUnsafeMarkedCheckoutItems}
                                        className="rounded-2xl bg-blue-600 px-3 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Перевод
                                </button>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={holdCurrentCheckout}
                                    disabled={checkoutItems.length === 0}
                                    className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Отложить
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setCheckoutItems([]);
                                        setError(null);
                                    }}
                                    disabled={checkoutItems.length === 0}
                                    className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Очистить
                                </button>
                            </div>
                        </div>

                        <div className="rounded-3xl border border-indigo-100 bg-white p-5 shadow-xl">
                            <div className="mb-4 flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-xs font-black uppercase tracking-[0.16em] text-indigo-500">
                                        Управление ККТ
                                    </div>

                                    <h2 className="mt-1 text-2xl font-black text-gray-900">
                                        Смена и касса
                                    </h2>
                                </div>

                                <span
                                    className={`shrink-0 rounded-full px-3 py-1 text-sm font-black ${
                                        isShiftOpen
                                            ? "bg-emerald-100 text-emerald-700"
                                            : "bg-red-100 text-red-700"
                                    }`}
                                >
                                    {isShiftOpen ? "Открыта" : "Закрыта"}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={openShift}
                                    disabled={isShiftActionLoading || isShiftOpen}
                                    className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Открыть смену
                                </button>

                                <button
                                    type="button"
                                    onClick={closeShift}
                                    disabled={isShiftActionLoading || !isShiftOpen}
                                    className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Закрыть смену
                                </button>

                                <PosCashDrawer/>

                                <button
                                    type="button"
                                    onClick={checkFiscalAgent}
                                    disabled={isShiftActionLoading}
                                    className="rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-black text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Проверить ККТ
                                </button>

                                <button
                                    type="button"
                                    onClick={repeatLastFiscalReceipt}
                                    disabled={isShiftActionLoading}
                                    className="rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-black text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Последний чек
                                </button>

                                <button
                                    type="button"
                                    onClick={repeatLastCommodityReceipt}
                                    disabled={isShiftActionLoading || !lastCommodityReceipt}
                                    className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-black text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Товарный чек
                                </button>

                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-black text-gray-800 hover:bg-gray-50"
                                >
                                    Выйти
                                </button>
                            </div>

                            <div className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-xs font-black uppercase tracking-[0.14em] text-cyan-700">
                                            Продажи POS в фоне
                                        </div>

                                        <div className="mt-1 text-sm font-black text-cyan-950">
                                            {posBackgroundJobs.length === 0
                                                ? "Все продажи переданы"
                                                : `Ожидают обработки: ${posBackgroundJobs.length}`}
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            setIsPosBackgroundQueueOpen(
                                                value => !value,
                                            )
                                        }
                                        className="rounded-xl border border-cyan-300 bg-white px-3 py-2 text-xs font-black text-cyan-800 hover:bg-cyan-100"
                                    >
                                        Подробнее
                                    </button>
                                </div>

                                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                    <div className="rounded-xl bg-white px-2 py-2">
                                        <div className="text-lg font-black text-amber-600">
                                            {
                                                posBackgroundJobs.filter(
                                                    job =>
                                                        job.status ===
                                                        "pending",
                                                ).length
                                            }
                                        </div>

                                        <div className="text-[10px] font-bold uppercase text-gray-400">
                                            Ожидают
                                        </div>
                                    </div>

                                    <div className="rounded-xl bg-white px-2 py-2">
                                        <div className="text-lg font-black text-indigo-600">
                                            {
                                                posBackgroundJobs.filter(
                                                    job =>
                                                        job.status ===
                                                        "processing",
                                                ).length
                                            }
                                        </div>

                                        <div className="text-[10px] font-bold uppercase text-gray-400">
                                            Отправка
                                        </div>
                                    </div>

                                    <div className="rounded-xl bg-white px-2 py-2">
                                        <div className="text-lg font-black text-red-600">
                                            {
                                                posBackgroundJobs.filter(
                                                    job =>
                                                        job.status ===
                                                        "failed",
                                                ).length
                                            }
                                        </div>

                                        <div className="text-[10px] font-bold uppercase text-gray-400">
                                            Ошибки
                                        </div>
                                    </div>
                                </div>

                                {isPosBackgroundQueueOpen && (
                                    <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                                        {posBackgroundJobs
                                            .slice()
                                            .reverse()
                                            .map(job => (
                                                <div
                                                    key={job.id}
                                                    className="rounded-xl border border-cyan-200 bg-white p-3"
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="truncate text-xs font-black text-gray-900">
                                                                {job.id}
                                                            </div>

                                                            <div className="mt-1 text-[11px] text-gray-500">
                                                                {job.receipt.items.length} поз. ·{" "}
                                                                {formatCurrency(job.receipt.total)}
                                                                {" · "}
                                                                {job.receipt.paymentLabel}
                                                                {job.receipt.customerName
                                                                    ? ` · ${job.receipt.customerName}`
                                                                    : ""}
                                                            </div>

                                                            {job.error && (
                                                                <div
                                                                    className="mt-1 text-[11px] font-semibold leading-4 text-red-600">
                                                                    {job.error}
                                                                </div>
                                                            )}

                                                            <details
                                                                className="mt-3 rounded-xl border border-gray-200 bg-gray-50">
                                                                <summary
                                                                    className="cursor-pointer select-none px-3 py-2 text-xs font-black text-gray-700 hover:bg-gray-100">
                                                                    Товары в чеке ({job.receipt.items.length})
                                                                </summary>

                                                                <div className="border-t border-gray-200">
                                                                    {job.receipt.items.map((item, itemIndex) => (
                                                                        <div
                                                                            key={`${job.id}-${item.productId}-${itemIndex}`}
                                                                            className="flex items-start justify-between gap-3 border-b border-gray-100 px-3 py-2 last:border-b-0"
                                                                        >
                                                                            <div className="min-w-0">
                                                                                <div
                                                                                    className="text-xs font-black text-gray-900">
                                                                                    {item.name}
                                                                                </div>

                                                                                <div
                                                                                    className="mt-1 text-[11px] text-gray-500">
                                                                                    {formatQuantity(
                                                                                        item.quantity,
                                                                                        item.unit,
                                                                                    )}
                                                                                    {" × "}
                                                                                    {formatCurrency(item.price)}
                                                                                    {item.unit === "weight"
                                                                                        ? " / кг"
                                                                                        : " / шт."}
                                                                                </div>

                                                                                {item.barcode && (
                                                                                    <div
                                                                                        className="mt-0.5 text-[10px] text-gray-400">
                                                                                        ШК: {item.barcode}
                                                                                    </div>
                                                                                )}

                                                                                {(
                                                                                    item.fiscalPrice !== undefined ||
                                                                                    item.fiscalTotal !== undefined
                                                                                ) && (
                                                                                    <div
                                                                                        className="mt-1 text-[10px] text-indigo-500">
                                                                                        ККТ: цена{" "}
                                                                                        {formatCurrency(
                                                                                            item.fiscalPrice ??
                                                                                            item.price,
                                                                                        )}
                                                                                        {" · "}
                                                                                        сумма{" "}
                                                                                        {formatCurrency(
                                                                                            item.fiscalTotal ??
                                                                                            item.total,
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                            </div>

                                                                            <div className="shrink-0 text-right">
                                                                                <div
                                                                                    className="text-sm font-black text-gray-900">
                                                                                    {formatCurrency(item.total)}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    ))}

                                                                    <div
                                                                        className="flex items-center justify-between bg-white px-3 py-3">
                                                                        <span className="text-xs font-black text-gray-500">
                                                                            Итого
                                                                        </span>

                                                                        <span
                                                                            className="text-base font-black text-gray-950">
                                                                            {formatCurrency(job.receipt.total)}
                                                                        </span>
                                                                    </div>

                                                                    <div
                                                                        className="border-t border-gray-100 bg-white px-3 py-2 text-[10px] text-gray-500">
                                                                        {new Date(job.createdAt).toLocaleString("ru-RU")}
                                                                        {" · "}
                                                                        {job.receipt.paymentLabel}
                                                                    </div>
                                                                </div>
                                                            </details>
                                                        </div>

                                                        <div className="flex shrink-0 flex-col items-end gap-2">
                                                            <span
                                                                className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${
                                                                    job.status === "failed"
                                                                        ? "bg-red-100 text-red-700"
                                                                        : job.status === "processing"
                                                                            ? "bg-indigo-100 text-indigo-700"
                                                                            : "bg-amber-100 text-amber-700"
                                                                }`}
                                                            >
                                                                {job.status === "failed"
                                                                    ? "Ошибка"
                                                                    : job.status === "processing"
                                                                        ? "Отправка"
                                                                        : "Ожидает"}
                                                            </span>

                                                            {job.status === "failed" && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        void retryPosSaleJob(
                                                                            job.id,
                                                                        )
                                                                    }
                                                                    className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-black text-red-700 hover:bg-red-100"
                                                                >
                                                                    Повторить
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}

                                        {posBackgroundJobs.length === 0 && (
                                            <div className="rounded-xl bg-white p-3 text-center text-xs text-gray-500">
                                                Локальная очередь пуста.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                                            Фискальная очередь
                                        </div>

                                        <div className="mt-1 text-sm font-black text-slate-900">
                                            {(fiscalQueue?.counts.pending || 0) +
                                            (fiscalQueue?.counts.processing || 0) >
                                            0
                                                ? `В работе: ${
                                                    (fiscalQueue?.counts.pending || 0) +
                                                    (fiscalQueue?.counts.processing || 0)
                                                }`
                                                : "Очередь свободна"}
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            setIsFiscalQueueOpen(
                                                value => !value,
                                            )
                                        }
                                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-100"
                                    >
                                        Подробнее
                                    </button>
                                </div>

                                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                                    <div className="rounded-xl bg-white px-2 py-2">
                                        <div className="text-lg font-black text-amber-600">
                                            {fiscalQueue?.counts.pending || 0}
                                        </div>
                                        <div className="text-[10px] font-bold uppercase text-gray-400">
                                            Очередь
                                        </div>
                                    </div>

                                    <div className="rounded-xl bg-white px-2 py-2">
                                        <div className="text-lg font-black text-indigo-600">
                                            {fiscalQueue?.counts.processing || 0}
                                        </div>
                                        <div className="text-[10px] font-bold uppercase text-gray-400">
                                            Печать
                                        </div>
                                    </div>

                                    <div className="rounded-xl bg-white px-2 py-2">
                                        <div className="text-lg font-black text-emerald-600">
                                            {fiscalQueue?.counts.done || 0}
                                        </div>
                                        <div className="text-[10px] font-bold uppercase text-gray-400">
                                            Готово
                                        </div>
                                    </div>

                                    <div className="rounded-xl bg-white px-2 py-2">
                                        <div className="text-lg font-black text-red-600">
                                            {fiscalQueue?.counts.failed || 0}
                                        </div>
                                        <div className="text-[10px] font-bold uppercase text-gray-400">
                                            Ошибки
                                        </div>
                                    </div>
                                </div>

                                {isFiscalQueueOpen && (
                                    <div className="mt-3 max-h-60 space-y-2 overflow-y-auto">
                                        {(fiscalQueue?.jobs || [])
                                            .slice()
                                            .reverse()
                                            .slice(0, 15)
                                            .map(job => (
                                                <div
                                                    key={job.id}
                                                    className="rounded-xl border border-slate-200 bg-white p-3"
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="truncate text-xs font-black text-slate-900">
                                                                {job.receiptId}
                                                            </div>

                                                            <div className="mt-1 text-[11px] text-gray-500">
                                                                {job.itemCount} поз. ·{" "}
                                                                {formatCurrency(job.total)}
                                                            </div>

                                                            {job.error && (
                                                                <div
                                                                    className="mt-1 text-[11px] font-semibold leading-4 text-red-600">
                                                                    {job.error}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <span
                                                            className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase ${
                                                                job.status === "done"
                                                                    ? "bg-emerald-100 text-emerald-700"
                                                                    : job.status === "failed"
                                                                        ? "bg-red-100 text-red-700"
                                                                        : job.status === "processing"
                                                                            ? "bg-indigo-100 text-indigo-700"
                                                                            : "bg-amber-100 text-amber-700"
                                                            }`}
                                                        >
                                                            {job.status === "done"
                                                                ? "Готов"
                                                                : job.status === "failed"
                                                                    ? "Ошибка"
                                                                    : job.status === "processing"
                                                                        ? "Печать"
                                                                        : "В очереди"}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}

                                        {(fiscalQueue?.jobs.length || 0) === 0 && (
                                            <div className="rounded-xl bg-white p-3 text-center text-xs text-gray-500">
                                                Фоновых чеков пока нет.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-3">
                                <div className="text-sm font-black text-indigo-900">
                                    Настройки ККТ
                                </div>

                                <div className="mt-1 text-xs leading-5 text-indigo-700">
                                    Агент 127.0.0.1:3108, драйвер АТОЛ и файлы установки.
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setIsAtolSetupOpen(true)}
                                    className="mt-3 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white hover:bg-indigo-700"
                                >
                                    Открыть настройки ККТ
                                </button>
                            </div>

                            <div className="mt-3 text-xs leading-5 text-gray-500">
                                Продажа доступна только при открытой смене. Маркированные товары всегда уходят на ККТ.
                            </div>
                        </div>

                        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl">
                            <div className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">
                                Дополнительно
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setReturnItems([])
                                        setReturnSearchQuery('')
                                        setReturnFoundProducts([])
                                        setReturnComment('')
                                        setError(null)

                                        setIsReturnModalOpen(true)
                                    }}
                                    className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-800 hover:bg-orange-100"
                                >
                                    Возврат товара
                                </button>

                                <button
                                    type="button"
                                    onClick={openPriceLabelModal}
                                    disabled={isRefreshingLabels}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                                >
                                    <AiOutlinePrinter size={20}/>
                                    {isRefreshingLabels
                                        ? "Обновляю цены..."
                                        : "Печать ценников"}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setIsHeldReceiptsModalOpen(true)}
                                    className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 hover:bg-amber-100"
                                >
                                    Отложенные чеки ({heldCheckouts.length})
                                </button>
                            </div>

                            <div className="mt-3 text-xs leading-5 text-gray-500">
                                Цены и штрихкоды берутся из актуальной базы. Текущий чек сохраняется после обновления
                                страницы.
                            </div>
                        </div>
                    </aside>

                    <section
                        className="min-w-0 space-y-4 xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:space-y-0 xl:gap-4">
                        <div className="relative rounded-3xl border border-indigo-100 bg-white p-5 shadow-xl xl:shrink-0">
                            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                    <div className="text-xs font-black uppercase tracking-[0.16em] text-indigo-500">
                                        Сканер товара
                                    </div>

                                    <h2 className="mt-1 text-2xl font-black text-gray-900">
                                        Скан штрихкода или поиск
                                    </h2>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                    <button
                                        type="button"
                                        onClick={openClockSettings}
                                        className="group inline-flex h-[50px] items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50"
                                        title="Нажмите, чтобы настроить время POS"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="text-lg text-gray-500 transition-colors group-hover:text-indigo-600"
                                        >
                                            ◷
                                        </span>

                                        <span className="whitespace-nowrap text-sm font-black tabular-nums text-gray-700">
                                            {formatPosClockDate(
                                                utc7Now,
                                                clockCorrectionMs,
                                            )}
                                            <span className="mx-2 text-gray-300">·</span>
                                            {formatPosClockTime(
                                                utc7Now,
                                                clockCorrectionMs,
                                            )}
                                        </span>

                                        <span className="ml-0.5 text-xs font-black text-gray-300 transition-colors group-hover:text-indigo-500">
                                            ✎
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => void toggleFullscreen()}
                                        className={`inline-flex h-[50px] items-center justify-center gap-2 rounded-xl border px-4 text-sm font-black transition-colors ${
                                            isFullscreen
                                                ? "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                                                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                                        }`}
                                        title={
                                            isNativeF11Fullscreen
                                                ? "Полный экран включён через F11. Для выхода нажмите F11."
                                                : isFullscreen
                                                    ? "Свернуть экран"
                                                    : "Во весь экран"
                                        }
                                        aria-label={
                                            isFullscreen
                                                ? "Свернуть экран"
                                                : "Во весь экран"
                                        }
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="text-lg leading-none"
                                        >
                                            {isFullscreen ? "↙" : "⛶"}
                                        </span>

                                        <span>
                                            {isFullscreen
                                                ? "Свернуть экран"
                                                : "Во весь экран"}
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={toggleNotificationLog}
                                        className={`relative flex h-[50px] w-[50px] items-center justify-center rounded-xl border text-xl transition-colors ${
                                            unreadNotificationCount > 0
                                                ? "border-red-300 bg-red-50 text-red-700 shadow-sm hover:bg-red-100"
                                                : isNotificationLogOpen
                                                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                                                    : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                                        }`}
                                        title={
                                            unreadNotificationCount > 0
                                                ? `Непрочитанных уведомлений: ${unreadNotificationCount}`
                                                : "Журнал уведомлений"
                                        }
                                        aria-label={
                                            unreadNotificationCount > 0
                                                ? `Непрочитанных уведомлений: ${unreadNotificationCount}`
                                                : "Журнал уведомлений"
                                        }
                                    >
                                        <span aria-hidden="true">🔔</span>

                                        {unreadNotificationCount > 0 && (
                                            <span className="absolute -right-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-black leading-4 text-white ring-2 ring-white">
                                                {unreadNotificationCount > 99
                                                    ? "99+"
                                                    : unreadNotificationCount}
                                            </span>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {isNotificationLogOpen && (
                                <div className="absolute right-5 top-[74px] z-[120] w-[min(430px,calc(100vw-40px))] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
                                    <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
                                        <div>
                                            <div className="text-sm font-black text-gray-900">
                                                Журнал уведомлений
                                            </div>

                                            <div className="text-[11px] text-gray-500">
                                                Прочитано · журнал очистится после закрытия смены
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setIsNotificationLogOpen(false)}
                                            className="rounded-lg px-2 py-1 text-lg leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                        >
                                            ×
                                        </button>
                                    </div>

                                    <div className="max-h-80 overflow-y-auto p-2">
                                        {notificationLog.length === 0 ? (
                                            <div className="rounded-xl bg-gray-50 px-4 py-8 text-center text-sm font-semibold text-gray-400">
                                                За эту смену уведомлений пока нет
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {notificationLog
                                                    .slice()
                                                    .reverse()
                                                    .map(entry => (
                                                        <div
                                                            key={entry.id}
                                                            className={`rounded-xl border px-3 py-2 ${
                                                                entry.kind === "error"
                                                                    ? "border-red-100 bg-red-50"
                                                                    : entry.kind === "system"
                                                                        ? "border-slate-200 bg-slate-50"
                                                                        : "border-emerald-100 bg-emerald-50"
                                                            }`}
                                                        >
                                                            <div className="flex items-start gap-2">
                                                                <div
                                                                    className={`mt-0.5 text-xs font-black ${
                                                                        entry.kind === "error"
                                                                            ? "text-red-600"
                                                                            : entry.kind === "system"
                                                                                ? "text-slate-600"
                                                                                : "text-emerald-600"
                                                                    }`}
                                                                >
                                                                    {entry.kind === "error"
                                                                        ? "!"
                                                                        : entry.kind === "system"
                                                                            ? "●"
                                                                            : "✓"}
                                                                </div>

                                                                <div className="min-w-0 flex-1">
                                                                    <div className="text-xs font-semibold leading-4 text-gray-800">
                                                                        {entry.message}
                                                                    </div>

                                                                    <div className="mt-1 text-[10px] font-semibold text-gray-400">
                                                                        {formatPosDateTime(entry.createdAt, clockCorrectionMs)} · UTC+7
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {isCheckingMarking && backgroundMarkingCheck && (
                                <div
                                    className="mb-3 flex h-9 items-center gap-2 overflow-hidden rounded-xl border border-purple-200 bg-purple-50 px-3 text-xs font-bold text-purple-800"
                                    role="status"
                                    aria-live="polite"
                                >
                                    <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-purple-200 border-t-purple-600" />

                                    <div className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                        Проверка маркировки в фоне ·{" "}
                                        <span className="font-black">
                                            {backgroundMarkingCheck.productName}
                                        </span>
                                        {" · "}
                                        КМ {backgroundMarkingCheck.codePreview}
                                        {" · "}
                                        можно сканировать следующий обычный товар
                                    </div>
                                </div>
                            )}

                            <div className="relative">
                                <div className="absolute left-3 top-3 text-gray-400">
                                    <AiOutlineScan size={25}/>
                                </div>

                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    placeholder="Скан штрихкода или поиск товара..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    autoFocus
                                    className="w-full rounded-2xl border border-gray-300 py-3 pl-10 pr-10 text-lg font-semibold outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-indigo-500"
                                />

                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSearchQuery("");
                                            setFoundProducts([]);
                                            setError(null);
                                        }}
                                        className="absolute right-4 top-1.5 text-2xl text-gray-400 hover:text-gray-600"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>

                            <div className="mt-3 flex items-start gap-2 text-xs font-semibold leading-5 text-gray-500">
                                <AiOutlineSearch className="mt-0.5 shrink-0"/>
                                <span>Enter добавляет товар. Весовой товар откроет окно ввода веса.</span>
                            </div>

                            {isSearchLoading && (
                                <div
                                    className="mt-3 rounded-xl bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700">
                                    Идёт поиск товара...
                                </div>
                            )}

                            <AnimatePresence>
                                {searchQuery && !isSearchLoading && foundProducts.length === 0 && (
                                    <motion.div
                                        initial={{opacity: 0}}
                                        animate={{opacity: 1}}
                                        exit={{opacity: 0}}
                                        className="mt-3 rounded-xl bg-gray-50 px-3 py-3 text-center text-sm font-semibold text-gray-500"
                                    >
                                        Товар не найден
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <AnimatePresence>
                                {foundProducts.length > 0 && searchQuery && (
                                    <motion.div
                                        initial={{opacity: 0, height: 0}}
                                        animate={{opacity: 1, height: "auto"}}
                                        exit={{opacity: 0, height: 0}}
                                        className="mt-4 max-h-[34vh] overflow-y-auto rounded-2xl border border-gray-100 bg-gray-50 p-2"
                                    >
                                        <div className="space-y-2">
                                            {foundProducts.map((product) => {
                                                const stock = getStock(product);
                                                const isEmpty = stock <= 0;
                                                const canSellNegative = canSellIntoNegativeStock(product);
                                                const isBlockedByStock = isEmpty && !canSellNegative;
                                                const marked = isMarkedProduct(product);

                                                return (
                                                    <motion.div
                                                        key={String(product.id)}
                                                        whileHover={{scale: isBlockedByStock ? 1 : 1.01}}
                                                        className={`rounded-2xl border p-3 shadow-sm transition-shadow ${
                                                            isBlockedByStock
                                                                ? "border-red-100 bg-red-50 opacity-70 cursor-not-allowed"
                                                                : canSellNegative && isEmpty
                                                                    ? "border-amber-100 bg-amber-50 hover:shadow-md cursor-pointer"
                                                                    : "border-white bg-white hover:shadow-md cursor-pointer"
                                                        }`}
                                                        onClick={() => {
                                                            if (!isBlockedByStock) {
                                                                addToCheckout(product, searchQuery);
                                                            }
                                                        }}
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0 flex-1">
                                                                <div className="truncate font-bold text-gray-900">
                                                                    {product.name}
                                                                </div>

                                                                <div className="mt-1 truncate text-xs text-gray-500">
                                                                    {product.category || "Без категории"}
                                                                    {product.barcode
                                                                        ? ` · ШК: ${getBarcodeDisplay(product.barcode)}`
                                                                        : ""}
                                                                </div>
                                                            </div>

                                                            <button
                                                                type="button"
                                                                disabled={isBlockedByStock}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();

                                                                    if (!isBlockedByStock) {
                                                                        addToCheckout(product, searchQuery);
                                                                    }
                                                                }}
                                                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-lg font-black text-white hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400"
                                                            >
                                                                +
                                                            </button>
                                                        </div>

                                                        <div className="mt-3 flex items-end justify-between gap-3">
                                                            <div>
                                                                {marked && (
                                                                    <div
                                                                        className="mb-1 inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">
                                                                        Маркированный
                                                                    </div>
                                                                )}

                                                                <div
                                                                    className={`text-xs font-semibold ${
                                                                        isEmpty && !canSellNegative
                                                                            ? "text-red-600"
                                                                            : canSellNegative && isEmpty
                                                                                ? "text-amber-700"
                                                                                : "text-green-600"
                                                                    }`}
                                                                >
                                                                    Остаток: {formatQuantity(stock, product.unit)}
                                                                    {canSellNegative && isEmpty
                                                                        ? " · можно в минус"
                                                                        : ""}
                                                                </div>
                                                            </div>

                                                            <div className="text-right">
                                                                <div className="text-lg font-black text-indigo-700">
                                                                    {formatCurrency(getSellingPrice(product))}
                                                                </div>

                                                                <div className="text-xs text-gray-500">
                                                                    {getUnitPriceLabel(product)}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                );
                                            })}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>


                        <div
                            className="rounded-3xl border border-indigo-100 bg-white shadow-xl xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:overflow-hidden">
                            <div
                                className="sticky top-0 z-20 rounded-t-3xl border-b border-indigo-100 bg-white/95 px-5 py-4 backdrop-blur">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                        <div className="text-xs font-black uppercase tracking-[0.16em] text-indigo-500">
                                            Отпиканые товары
                                        </div>

                                        <h2 className="mt-1 text-2xl font-black text-gray-900">
                                            Чек сейчас
                                        </h2>

                                        <div className="mt-1 text-sm font-semibold text-gray-500">
                                            Последний добавленный товар показывается сверху.
                                        </div>
                                    </div>

                                    <div className="rounded-2xl bg-indigo-50 px-5 py-3 text-right">
                                        <div className="text-xs font-bold uppercase tracking-wide text-indigo-500">
                                            Итого
                                        </div>
                                        <div className="text-3xl font-black text-indigo-700">
                                            {formatCurrency(total)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {checkoutItems.length === 0 ? (
                                <div
                                    className="flex min-h-[420px] flex-col items-center justify-center px-6 py-12 text-center text-gray-400">
                                    <div className="text-5xl">🧾</div>
                                    <p className="mt-4 text-xl font-bold text-gray-500">В чеке пусто</p>
                                    <p className="mt-2 text-sm">Сканируйте штрихкод или найдите товар слева.</p>
                                </div>
                            ) : (
                                <div className="max-h-[calc(100vh-360px)] overflow-y-auto p-4">
                                    <div className="space-y-3">
                                        {checkoutItems.slice().reverse().map((item) => {
                                            const stock = getStock(item.product);
                                            const marked = isMarkedProduct(item.product);
                                            const isLatestItem = item.id === checkoutItems[checkoutItems.length - 1]?.id;

                                            return (
                                                <motion.div
                                                    key={item.id}
                                                    initial={{opacity: 0, y: -10}}
                                                    animate={{opacity: 1, y: 0}}
                                                    className={`rounded-3xl border p-4 shadow-sm transition-shadow hover:shadow-md ${
                                                        isLatestItem
                                                            ? "border-indigo-300 bg-indigo-50/70 ring-4 ring-indigo-100"
                                                            : "border-gray-100 bg-white"
                                                    }`}
                                                >
                                                    <div
                                                        className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                {isLatestItem && (
                                                                    <span
                                                                        className="rounded-full bg-indigo-600 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-white">
                                                                    последний
                                                                </span>
                                                                )}

                                                                {marked && (
                                                                    <span
                                                                        className={`rounded-full border px-2.5 py-1 text-xs font-bold ${getMarkingStatusClassName(item.markingStatus)}`}>
                                                                    [{item.markingStatus || "M"}] Маркировка
                                                                </span>
                                                                )}
                                                            </div>

                                                            <div
                                                                className="mt-2 truncate text-xl font-black text-gray-900">
                                                                {item.product.name}
                                                            </div>

                                                            <div className="mt-1 text-sm font-semibold text-gray-500">
                                                                {formatCurrency(getSellingPrice(item.product))} × {formatQuantity(item.quantity, item.product.unit)}
                                                            </div>

                                                            {marked && item.markingCode && (
                                                                <div
                                                                    className="mt-2 truncate text-xs font-semibold text-emerald-700">
                                                                    КМ: {formatMarkingCodePreview(item.markingCode)}
                                                                </div>
                                                            )}

                                                            {marked && item.markingMessage && (
                                                                <div className="mt-1 text-xs text-gray-500">
                                                                    {item.markingMessage}
                                                                </div>
                                                            )}

                                                            <div
                                                                className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                                                                {item.product.barcode && (
                                                                    <span>ШК: {getBarcodeDisplay(item.product.barcode)}</span>
                                                                )}
                                                                <span>Остаток: {formatQuantity(stock, item.product.unit)}</span>
                                                            </div>
                                                        </div>

                                                        <div
                                                            className="flex shrink-0 items-center justify-between gap-4 lg:min-w-[360px] lg:justify-end">
                                                            <div
                                                                className="flex items-center gap-1 rounded-2xl bg-gray-50 px-2 py-1">
                                                                {marked ? (
                                                                    <span
                                                                        className="rounded-xl bg-purple-50 px-3 py-2 text-sm font-black text-purple-700">
                                                                    {formatQuantity(item.quantity, item.product.unit)}
                                                                </span>
                                                                ) : item.product.unit === "weight" ? (
                                                                    <input
                                                                        type="number"
                                                                        min="0.001"
                                                                        step="0.001"
                                                                        value={item.quantity}
                                                                        onChange={(e) =>
                                                                            setItemQuantity(item.id, e.target.value)
                                                                        }
                                                                        className="w-24 rounded-xl border border-gray-300 px-2 py-2 text-center font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                                                    />
                                                                ) : (
                                                                    <>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => changeQuantity(item.id, -1)}
                                                                            className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 hover:bg-white hover:text-indigo-600 disabled:opacity-30"
                                                                            disabled={item.quantity <= 1}
                                                                        >
                                                                            <AiOutlineMinus/>
                                                                        </button>

                                                                        <span
                                                                            className="w-9 text-center text-lg font-black">
                                                                        {item.quantity}
                                                                    </span>

                                                                        <button
                                                                            type="button"
                                                                            onClick={() => changeQuantity(item.id, 1)}
                                                                            className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 hover:bg-white hover:text-indigo-600 disabled:opacity-30"
                                                                            disabled={item.quantity >= stock}
                                                                        >
                                                                            <AiOutlinePlus/>
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>

                                                            <div
                                                                className="min-w-[145px] text-right text-2xl font-black text-gray-900">
                                                                {formatCurrency(
                                                                    getRoundedSaleLineTotal(
                                                                        item.product,
                                                                        item.quantity,
                                                                    ),
                                                                )}
                                                            </div>

                                                            <button
                                                                type="button"
                                                                onClick={() => removeFromCheckout(item.id)}
                                                                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700"
                                                            >
                                                                <AiOutlineDelete size={20}/>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                {isLoading && (
                    <div className="text-center text-gray-500">Загрузка товаров...</div>
                )}
            </div>

            <AnimatePresence>
                {isClockSettingsOpen && (
                    <div
                        key="pos-clock-settings-modal"
                        className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/45 px-4"
                        onClick={() =>
                            setIsClockSettingsOpen(
                                false,
                            )
                        }
                    >
                        <motion.div
                            initial={{opacity: 0, scale: 0.96}}
                            animate={{opacity: 1, scale: 1}}
                            exit={{opacity: 0, scale: 0.96}}
                            onClick={(event) =>
                                event.stopPropagation()
                            }
                            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
                        >
                            <div className="inline-flex rounded-full bg-indigo-100 px-4 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-indigo-700">
                                Часы POS
                            </div>

                            <h2 className="mt-4 text-2xl font-black text-gray-900">
                                Настройка даты и времени
                            </h2>

                            <p className="mt-2 text-sm leading-6 text-gray-500">
                                Изменяется только время внутри POS. Системные часы Windows не меняются.
                            </p>

                            <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                                <div className="text-xs font-black uppercase tracking-wide text-indigo-500">
                                    Сейчас в POS
                                </div>

                                <div className="mt-1 text-4xl font-black tabular-nums tracking-tight text-indigo-900">
                                    {formatPosClockTime(
                                        utc7Now,
                                        clockCorrectionMs,
                                    )}
                                </div>

                                <div className="mt-1 text-sm font-bold capitalize text-indigo-700">
                                    {formatPosClockDate(
                                        utc7Now,
                                        clockCorrectionMs,
                                    )} · UTC+7
                                </div>
                            </div>

                            <label className="mt-5 mb-2 block text-sm font-black text-gray-700">
                                Установить дату и время POS
                            </label>

                            <input
                                type="datetime-local"
                                value={clockEditValue}
                                onChange={(event) => {
                                    setClockEditValue(
                                        event.target.value,
                                    );
                                    setError(null);
                                }}
                                className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-lg font-black outline-none focus:border-transparent focus:ring-2 focus:ring-indigo-500"
                            />

                            <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-800">
                                Ночное напоминание в 01:00 ориентируется на это же время POS.
                            </div>

                            <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setIsClockSettingsOpen(
                                            false,
                                        )
                                    }
                                    className="rounded-xl border border-gray-300 px-4 py-3 font-bold text-gray-700 hover:bg-gray-50"
                                >
                                    Отмена
                                </button>

                                <button
                                    type="button"
                                    onClick={resetClockSettings}
                                    className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 font-black text-amber-800 hover:bg-amber-100"
                                >
                                    Сбросить
                                </button>

                                <button
                                    type="button"
                                    onClick={saveClockSettings}
                                    className="rounded-xl bg-indigo-600 px-4 py-3 font-black text-white hover:bg-indigo-700"
                                >
                                    Сохранить
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {isClosingReminderOpen && (
                    <div
                        key="closing-reminder-modal"
                        className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/60 px-4"
                    >
                        <motion.div
                            initial={{opacity: 0, scale: 0.95, y: 12}}
                            animate={{opacity: 1, scale: 1, y: 0}}
                            exit={{opacity: 0, scale: 0.95, y: 12}}
                            className="w-full max-w-lg rounded-3xl border border-indigo-200 bg-white p-6 shadow-2xl"
                        >
                            <div className="inline-flex rounded-full bg-indigo-100 px-4 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-indigo-700">
                                01:00 · UTC+7
                            </div>

                            <h2 className="mt-4 text-2xl font-black text-gray-900">
                                Уходя домой, не забудь
                            </h2>

                            <p className="mt-2 text-sm leading-6 text-gray-500">
                                Проверь всё перед закрытием магазина.
                            </p>

                            <div className="mt-5 space-y-3">
                                {[
                                    "Закрыть смену",
                                    "Поставить все устройства на зарядку: терминал и сканер",
                                    "Выключить свет в холодильниках",
                                    "Помыть полы",
                                ].map(item => (
                                    <div
                                        key={item}
                                        className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3"
                                    >
                                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 border-indigo-300 bg-white text-xs font-black text-indigo-600">
                                            ✓
                                        </div>

                                        <div className="text-sm font-black leading-6 text-gray-800">
                                            {item}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-6 rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700">
                                Текущее время: {formatPosClockTime(utc7Now, clockCorrectionMs)} · UTC+7
                            </div>

                            <button
                                type="button"
                                autoFocus
                                onClick={acknowledgeClosingReminder}
                                className="mt-5 w-full rounded-2xl bg-indigo-600 px-5 py-3.5 text-base font-black text-white hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200"
                            >
                                Принял(а)
                            </button>
                        </motion.div>
                    </div>
                )}

                {pendingPriceLabelPrint && (
                    <div
                        key="xprinter-label-paper-warning-modal"
                        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4"
                        onClick={() => setPendingPriceLabelPrint(null)}
                    >
                        <motion.div
                            initial={{opacity: 0, scale: 0.96}}
                            animate={{opacity: 1, scale: 1}}
                            exit={{opacity: 0, scale: 0.96}}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-lg rounded-3xl border-4 border-amber-400 bg-white p-6 shadow-2xl"
                        >
                            <div
                                className="mb-4 inline-flex rounded-full bg-amber-100 px-4 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-amber-800">
                                XPrinter · проверка ленты
                            </div>

                            <h2 className="text-2xl font-black text-gray-900">
                                Перед печатью ценников
                            </h2>

                            <div
                                className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-center text-xl font-black leading-8 text-amber-900">
                                ПРОВЕРЬ ЧТО В xPRINTER СТОИТ ЛЕНТА ДЛЯ ЦЕННИКОВ С КЛЕЙКОЙ ОСНОВОЙ!!
                            </div>

                            <p className="mt-4 text-sm leading-6 text-gray-600">
                                Если в принтере стоит чековая лента, ценники напечатаются не на той бумаге.
                            </p>

                            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={() => setPendingPriceLabelPrint(null)}
                                    className="rounded-xl border border-gray-300 px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50"
                                >
                                    Отмена
                                </button>

                                <button
                                    type="button"
                                    onClick={confirmPendingPriceLabelPrint}
                                    className="rounded-xl bg-amber-600 px-5 py-3 font-bold text-white hover:bg-amber-700"
                                >
                                    Проверил, печатать
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {pendingCommodityReceipt && (
                    <div
                        key={`commodity-receipt-print-modal-${pendingCommodityReceipt.id}-${commodityReceiptPrintStep}`}
                        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4"
                        onClick={closeCommodityReceiptPrintModal}
                    >
                        <motion.div
                            initial={{opacity: 0, scale: 0.96}}
                            animate={{opacity: 1, scale: 1}}
                            exit={{opacity: 0, scale: 0.96}}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
                        >
                            {commodityReceiptPrintStep === "ask" ? (
                                <>
                                    <div
                                        className="mb-4 inline-flex rounded-full bg-blue-100 px-4 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-blue-800">
                                        Нефискальный чек
                                    </div>

                                    <h2 className="text-2xl font-black text-gray-900">
                                        Нужен товарный чек?
                                    </h2>

                                    <div className="mt-4 rounded-2xl bg-gray-50 p-4">
                                        <div className="text-sm text-gray-500">Сумма продажи:</div>
                                        <div className="mt-1 text-3xl font-black text-gray-900">
                                            {formatCurrency(pendingCommodityReceipt.total)}
                                        </div>
                                        <div className="mt-2 text-sm text-gray-500">
                                            Продажа уже сохранена без фискализации. Печать товарного чека можно
                                            пропустить.
                                        </div>
                                    </div>

                                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                                        <button
                                            ref={skipCommodityReceiptPrintButtonRef}
                                            type="button"
                                            autoFocus
                                            onClick={closeCommodityReceiptPrintModal}
                                            className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
                                        >
                                            Нет, чек не нужен
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setCommodityReceiptPrintStep("paper-warning")}
                                            className="rounded-xl border border-gray-300 bg-white px-5 py-3 font-bold text-gray-800 hover:bg-gray-50"
                                        >
                                            Да, напечатать чек
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div
                                        className="mb-4 inline-flex rounded-full bg-amber-100 px-4 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-amber-800">
                                        XPrinter · проверка ленты
                                    </div>

                                    <h2 className="text-2xl font-black text-gray-900">
                                        Перед печатью товарного чека
                                    </h2>

                                    <div
                                        className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-center text-xl font-black leading-8 text-amber-900">
                                        ПРОВЕРЬ ЧТО В xPRINTER СТОИТ ЛЕНТА ДЛЯ ЧЕКОВ!!
                                    </div>

                                    <p className="mt-4 text-sm leading-6 text-gray-600">
                                        Если в принтере стоит клейкая лента для ценников, товарный чек напечатается на
                                        этикетках.
                                    </p>

                                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                                        <button
                                            type="button"
                                            onClick={closeCommodityReceiptPrintModal}
                                            className="rounded-xl border border-gray-300 px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50"
                                        >
                                            Отмена печати
                                        </button>

                                        <button
                                            type="button"
                                            onClick={confirmCommodityReceiptPrint}
                                            className="rounded-xl bg-amber-600 px-5 py-3 font-bold text-white hover:bg-amber-700"
                                        >
                                            Проверил, печатать
                                        </button>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </div>
                )}

                {markingModalProduct && (
                    <div
                        key="marking-modal"
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
                        onClick={() => {
                            setMarkingModalProduct(null);
                            setMarkingCodeInput("");
                            setMarkingCheckResult(null);
                            setMarkingPackageMode("single");
                        }}
                    >
                        <motion.div
                            initial={{opacity: 0, scale: 0.96}}
                            animate={{opacity: 1, scale: 1}}
                            exit={{opacity: 0, scale: 0.96}}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
                        >
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">
                                Сканирование DataMatrix
                            </h2>

                            <div className="mb-4 text-gray-600">
                                {markingModalProduct.name}
                            </div>

                            <div
                                className={`mb-5 rounded-xl border p-4 text-sm ${
                                    markingPackageMode === "block"
                                        ? "border-amber-200 bg-amber-50 text-amber-800"
                                        : "border-purple-100 bg-purple-50 text-purple-800"
                                }`}
                            >
                                <div className="font-bold">
                                    {markingPackageMode === "block"
                                        ? `Режим: блок сигарет · ${CIGARETTE_BLOCK_QUANTITY} шт.`
                                        : "Режим: пачка сигарет · 1 шт."}
                                </div>

                                <div className="mt-1 leading-5">
                                    Режим определяется автоматически по отсканированному штрихкоду товара.
                                    Сейчас нужно отсканировать DataMatrix
                                    с {markingPackageMode === "block" ? "блока" : "пачки"}.
                                    Проверка Честного ЗНАКа будет выполнена строго в фоне, как для обычной пачки.
                                </div>
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
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        void addMarkedProductToCheckout(
                                            markingModalProduct,
                                            markingCodeInput,
                                            markingPackageMode,
                                        );
                                    }
                                }}
                                placeholder="Отсканируйте код маркировки..."
                                className="mb-4 h-28 w-full resize-none rounded-xl border border-gray-300 px-4 py-3 font-mono text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100 disabled:opacity-70"
                            />

                            {isCheckingMarking && (
                                <div
                                    className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
                                    Проверяю код маркировки в ККТ / Честном ЗНАКе...
                                </div>
                            )}

                            {markingCheckResult && (
                                <div
                                    className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${getMarkingStatusClassName(markingCheckResult.markingStatus)}`}
                                >
                                    <div className="text-lg">
                                        [{markingCheckResult.markingStatus || "M"}]
                                    </div>

                                    <div>
                                        {markingCheckResult.message ||
                                            "Результат проверки маркировки получен"}
                                    </div>

                                    {markingCheckResult.markingStatus !== "M+" && (
                                        <div className="mt-2 text-xs font-medium">
                                            Продажа этого товара заблокирована. Нужен только результат
                                            [M+].
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="mb-6 rounded-xl bg-gray-50 p-4">
                                <div className="text-sm text-gray-500">
                                    {markingPackageMode === "block" ? "Цена блока:" : "Цена:"}
                                </div>

                                <div className="text-3xl font-bold text-gray-800">
                                    {formatCurrency(getMarkingPackageTotalPrice(markingModalProduct, markingPackageMode))}
                                </div>

                                {markingPackageMode === "block" && (
                                    <div
                                        className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                                        {formatCurrency(getSellingPrice(markingModalProduct))} × {CIGARETTE_BLOCK_QUANTITY} шт.
                                        = {formatCurrency(getMarkingPackageTotalPrice(markingModalProduct, "block"))}
                                    </div>
                                )}

                                <div className="mt-2 text-sm text-gray-500">
                                    Остаток:{" "}
                                    {formatQuantity(
                                        getStock(markingModalProduct),
                                        markingModalProduct.unit,
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMarkingModalProduct(null);
                                        setMarkingCodeInput("");
                                        setMarkingCheckResult(null);
                                        setMarkingPackageMode("single");
                                    }}
                                    className="px-5 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
                                >
                                    Отмена
                                </button>

                                <button
                                    type="button"
                                    disabled={isCheckingMarking}
                                    onClick={() =>
                                        void addMarkedProductToCheckout(
                                            markingModalProduct,
                                            markingCodeInput,
                                            markingPackageMode,
                                        )
                                    }
                                    className="px-5 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isCheckingMarking
                                        ? "Проверяю..."
                                        : markingPackageMode === "block"
                                            ? `Добавить блок ${CIGARETTE_BLOCK_QUANTITY} шт.`
                                            : "Проверить [M+] и добавить"}
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
                            setWeightQuantity("");
                        }}
                    >
                        <motion.div
                            initial={{opacity: 0, scale: 0.96}}
                            animate={{opacity: 1, scale: 1}}
                            exit={{opacity: 0, scale: 0.96}}
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
                                <div className="text-sm text-indigo-700">Цена за 1 кг:</div>

                                <div className="text-3xl font-bold text-indigo-700">
                                    {formatCurrency(getSellingPrice(weightModalProduct))}
                                </div>

                                <div className="mt-2 text-sm text-indigo-700">
                                    Остаток:{" "}
                                    {formatQuantity(getStock(weightModalProduct), "weight")}
                                </div>

                                <div
                                    className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800">
                                    Для весового товара разрешён минусовой остаток из-за
                                    погрешности веса.
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
                                    if (e.key !== "Enter") {
                                        return;
                                    }

                                    const quantity = safeParseNumber(weightQuantity);

                                    if (quantity <= 0) {
                                        setError("Введите корректный вес");
                                        return;
                                    }

                                    addQuantityToCheckout(weightModalProduct, quantity);
                                    setWeightModalProduct(null);
                                    setWeightQuantity("");
                                }}
                                placeholder="Например 0.350"
                                className="mb-5 w-full rounded-xl border border-gray-300 px-4 py-3 text-2xl font-bold outline-none focus:border-transparent focus:ring-2 focus:ring-indigo-500"
                            />

                            <div className="mb-6 rounded-xl bg-gray-50 p-4">
                                <div className="text-sm text-gray-500">Сумма:</div>

                                <div className="text-3xl font-bold text-gray-800">
                                    {formatCurrency(
                                        getSellingPrice(weightModalProduct) *
                                        safeParseNumber(weightQuantity),
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setWeightModalProduct(null);
                                        setWeightQuantity("");
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
                                            setError("Введите корректный вес");
                                            return;
                                        }

                                        addQuantityToCheckout(weightModalProduct, quantity);
                                        setWeightModalProduct(null);
                                        setWeightQuantity("");
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
                            initial={{opacity: 0, scale: 0.96}}
                            animate={{opacity: 1, scale: 1}}
                            exit={{opacity: 0, scale: 0.96}}
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
                                            Выберите товары, укажите количество ценников и печатайте
                                            на лист A4 или на XPrinter в одну колонку без
                                            принудительного A4.
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

                                <div
                                    className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(280px,1fr)_260px_auto_auto_auto]">
                                    <input
                                        type="text"
                                        value={priceLabelSearch}
                                        onChange={(e) => setPriceLabelSearch(e.target.value)}
                                        placeholder="Поиск по названию, категории, штрихкоду или цене..."
                                        className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                                    />

                                    <select
                                        value={priceLabelCategoryFilter}
                                        onChange={(e) =>
                                            setPriceLabelCategoryFilter(e.target.value)
                                        }
                                        className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="all">Все категории</option>
                                        {priceLabelCategories.map((category) => (
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

                                                setNotice("Цены для ценников обновлены");
                                            } catch (err) {
                                                console.error(err);
                                                setError("Не удалось обновить цены");
                                            } finally {
                                                setIsRefreshingLabels(false);
                                            }
                                        }}
                                        disabled={isRefreshingLabels}
                                        className="rounded-xl border border-gray-300 px-4 py-3 hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        {isRefreshingLabels ? "Обновляю..." : "Обновить цены"}
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
                                    {priceLabelProducts.map((product) => {
                                        const selected = selectedPriceLabelIds.includes(
                                            String(product.id),
                                        );

                                        return (
                                            <tr
                                                key={String(product.id)}
                                                className="border-t border-gray-100 hover:bg-gray-50"
                                            >
                                                <td className="p-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={selected}
                                                        onChange={() =>
                                                            togglePriceLabelProduct(product.id)
                                                        }
                                                        className="h-4 w-4"
                                                    />
                                                </td>

                                                <td className="p-3">
                                                    <div className="font-medium text-gray-800">
                                                        {product.name}
                                                    </div>

                                                    <div className="text-xs text-gray-500">
                                                        {product.category || "Без категории"}
                                                    </div>
                                                </td>

                                                <td className="p-3 font-mono text-xs text-gray-500">
                                                    {product.barcode
                                                        ? getBarcodeDisplay(product.barcode)
                                                        : "Штрихкод не задан"}
                                                </td>

                                                <td className="p-3">
                                                    {product.unit === "weight" ? "кг" : "шт."}
                                                </td>

                                                <td className="p-3 text-right font-bold text-indigo-700">
                                                    {Math.ceil(getSellingPrice(product))} ₽{" "}
                                                    {getUnitPriceLabel(product)}
                                                </td>

                                                <td className="p-3 text-center">
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="999"
                                                        step="1"
                                                        value={getPriceLabelQuantity(product.id)}
                                                        onChange={(e) =>
                                                            updatePriceLabelQuantity(
                                                                product.id,
                                                                e.target.value,
                                                            )
                                                        }
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
                    Выбрано товаров:{" "}
                      <span className="font-bold text-gray-900">
                      {selectedPriceLabelIds.length}
                    </span>
                  </span>

                                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5">
                    Ценников выбранных:{" "}
                                        <span className="font-bold text-gray-900">
                      {selectedPriceLabelPrintCount}
                    </span>
                  </span>

                                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5">
                    Найдено товаров:{" "}
                                        <span className="font-bold text-gray-900">
                      {priceLabelProducts.length}
                    </span>
                  </span>

                                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5">
                    Ценников найденных:{" "}
                                        <span className="font-bold text-gray-900">
                      {filteredPriceLabelPrintCount}
                    </span>
                  </span>

                                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5">
                    Всего в базе:{" "}
                                        <span className="font-bold text-gray-900">
                      {allProducts.length}
                    </span>
                  </span>
                                </div>

                                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                    <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
                                        <div className="flex items-start gap-3">
                                            <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600">
                                                <AiOutlinePrinter size={22}/>
                                            </div>

                                            <div>
                                                <div className="font-bold text-gray-900">Лист A4</div>

                                                <div className="text-xs text-gray-500">
                                                    Обычная печать на лист: 58×40 мм, сетка в несколько
                                                    колонок.
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                                            <button
                                                type="button"
                                                onClick={() => requestPriceLabelPrint("selected", "a4")}
                                                disabled={
                                                    isRefreshingLabels ||
                                                    selectedPriceLabelIds.length === 0
                                                }
                                                className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                Выбранные
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => requestPriceLabelPrint("filtered", "a4")}
                                                disabled={
                                                    isRefreshingLabels || priceLabelProducts.length === 0
                                                }
                                                className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                Найденные
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => requestPriceLabelPrint("all", "a4")}
                                                disabled={
                                                    isRefreshingLabels || allProducts.length === 0
                                                }
                                                className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                Вся база
                                            </button>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                                        <div className="flex items-start gap-3">
                                            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
                                                <AiOutlinePrinter size={22}/>
                                            </div>

                                            <div>
                                                <div className="font-bold text-gray-900">
                                                    XPrinter 58×40
                                                </div>

                                                <div className="text-xs text-gray-500">
                                                    Термоэтикетки: одна этикетка 58×40 мм на одну
                                                    страницу, без A4.
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                                            <button
                                                type="button"
                                                onClick={() => requestPriceLabelPrint("selected", "thermal")}
                                                disabled={
                                                    isRefreshingLabels ||
                                                    selectedPriceLabelIds.length === 0
                                                }
                                                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                Выбранные
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => requestPriceLabelPrint("filtered", "thermal")}
                                                disabled={
                                                    isRefreshingLabels || priceLabelProducts.length === 0
                                                }
                                                className="rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                Найденные
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => requestPriceLabelPrint("all", "thermal")}
                                                disabled={
                                                    isRefreshingLabels || allProducts.length === 0
                                                }
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

                {isHoldCheckoutNameModalOpen && (
                    <div
                        key="hold-checkout-name-modal"
                        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
                        onClick={() => {
                            setIsHoldCheckoutNameModalOpen(false);
                            setHoldCheckoutName("");
                        }}
                    >
                        <motion.div
                            initial={{opacity: 0, scale: 0.96}}
                            animate={{opacity: 1, scale: 1}}
                            exit={{opacity: 0, scale: 0.96}}
                            onClick={(event) => event.stopPropagation()}
                            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
                        >
                            <div className="mb-4 inline-flex rounded-full bg-amber-100 px-4 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-amber-800">
                                Отложенный чек
                            </div>

                            <h2 className="text-2xl font-black text-gray-900">
                                Чей это чек?
                            </h2>

                            <p className="mt-2 text-sm leading-6 text-gray-500">
                                Введите имя клиента. Оно будет показано в списке отложенных чеков.
                            </p>

                            <div className="mt-5 rounded-2xl bg-gray-50 p-4">
                                <div className="text-sm text-gray-500">
                                    Сумма чека
                                </div>

                                <div className="mt-1 text-3xl font-black text-gray-900">
                                    {formatCurrency(total)}
                                </div>

                                <div className="mt-1 text-sm text-gray-500">
                                    Позиций: {checkoutItems.length}
                                </div>
                            </div>

                            <label className="mt-5 mb-2 block text-sm font-bold text-gray-700">
                                Имя клиента
                            </label>

                            <input
                                type="text"
                                autoFocus
                                maxLength={100}
                                value={holdCheckoutName}
                                onChange={(event) => {
                                    setHoldCheckoutName(event.target.value);
                                    setError(null);
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        event.preventDefault();
                                        confirmHoldCurrentCheckout();
                                    }
                                }}
                                placeholder="Например: Сергей"
                                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-lg font-bold outline-none focus:border-transparent focus:ring-2 focus:ring-amber-500"
                            />

                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsHoldCheckoutNameModalOpen(false);
                                        setHoldCheckoutName("");
                                    }}
                                    className="rounded-xl border border-gray-300 px-5 py-3 font-bold text-gray-700 hover:bg-gray-50"
                                >
                                    Отмена
                                </button>

                                <button
                                    type="button"
                                    disabled={!holdCheckoutName.trim()}
                                    onClick={confirmHoldCurrentCheckout}
                                    className="rounded-xl bg-amber-600 px-5 py-3 font-black text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Отложить чек
                                </button>
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
                            initial={{opacity: 0, scale: 0.96}}
                            animate={{opacity: 1, scale: 1}}
                            exit={{opacity: 0, scale: 0.96}}
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
                                            Чеки хранятся только в локальном состоянии кассы и не
                                            попадают в БД до оплаты.
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
                                        {heldCheckouts.map((held) => {
                                            const title = getHeldCheckoutTitle(held);
                                            const heldTotal =
                                                held.total ||
                                                held.items.reduce((sum, item) => {
                                                    return (
                                                        sum +
                                                        safeParseNumber(
                                                            item.product?.sellingPrice ??
                                                            item.product?.selling_price,
                                                        ) *
                                                        safeParseNumber(item.quantity)
                                                    );
                                                }, 0);

                                            return (
                                                <div
                                                    key={held.id}
                                                    className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                                                >
                                                    <div
                                                        className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                        <div className="min-w-0">
                                                            <div className="font-bold text-gray-900">
                                                                {title}
                                                            </div>

                                                            <div className="mt-1 text-xs text-gray-500">
                                                                Создан:{" "}
                                                                {new Date(held.createdAt).toLocaleString(
                                                                    "ru-RU",
                                                                )}{" "}
                                                                · Позиций: {held.items.length}
                                                            </div>

                                                            <div className="mt-2 space-y-1 text-sm text-gray-600">
                                                                {held.items.slice(0, 3).map((item, index) => (
                                                                    <div
                                                                        key={`${held.id}-${index}`}
                                                                        className="truncate"
                                                                    >
                                                                        {item.product?.name || "Товар"} ×{" "}
                                                                        {formatQuantity(
                                                                            safeParseNumber(item.quantity),
                                                                            item.product?.unit,
                                                                        )}
                                                                        {item.markingStatus
                                                                            ? ` · [${item.markingStatus}]`
                                                                            : ""}
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

                                                            <div
                                                                className="mt-3 flex flex-wrap justify-start gap-2 sm:justify-end">
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

                {paymentModal === "card" && (
                    <div
                        key="payment-card-modal"
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
                    >
                        <motion.div
                            initial={{opacity: 0, scale: 0.96}}
                            animate={{opacity: 1, scale: 1}}
                            exit={{opacity: 0, scale: 0.96}}
                            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
                        >
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">
                                Оплата картой
                            </h2>

                            <p className="text-gray-600 mb-2">Введите на терминале сумму:</p>

                            <div className="text-4xl font-bold text-indigo-700 mb-6">
                                {formatCurrency(total)}
                            </div>

                            <div className="rounded-xl bg-indigo-50 p-4 text-sm text-indigo-700 mb-6">
                                После успешной оплаты на терминале нажмите «Оплата прошла».
                                {hasMarkedCheckoutItems && (
                                    <div className="mt-2 font-semibold">
                                        В чеке есть маркированный товар — он обязательно будет
                                        пробит на ККТ.
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
                                    {isPaying ? "Провожу оплату..." : "Оплата прошла"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {paymentModal === "cash" && (
                    <div
                        key="payment-cash-modal"
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
                    >
                        <motion.div
                            initial={{opacity: 0, scale: 0.96}}
                            animate={{opacity: 1, scale: 1}}
                            exit={{opacity: 0, scale: 0.96}}
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
                                    <div
                                        className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-sm font-semibold text-emerald-800">
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
                                        setCashReceived("");
                                        setError(null);
                                    }}
                                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Очистить
                                </button>
                            </div>

                            <div
                                className={`mb-6 rounded-xl p-4 ${
                                    cashReceived && change >= 0
                                        ? "bg-blue-50 text-blue-700"
                                        : "bg-gray-50 text-gray-500"
                                }`}
                            >
                                <div className="text-sm">Сдача:</div>

                                <div className="text-3xl font-bold">
                                    {cashReceived
                                        ? formatCurrency(Math.max(0, change))
                                        : formatCurrency(0)}
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
                                        setCashReceived("");
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
                                    {isPaying ? "Провожу оплату..." : "Оплата получена"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {paymentModal === "mixed" && (
                    <MixedPaymentModal
                        total={total}
                        isPaying={isPaying}
                        hasMarkedItems={hasMarkedCheckoutItems}
                        onCancel={() => {
                            setPaymentModal(null);
                            setMixedCashAmount(0);
                            setMixedCardAmount(0);
                            setError(null);
                        }}
                        onConfirm={(cashAmount, cardAmount) => {
                            setMixedCashAmount(cashAmount);
                            setMixedCardAmount(cardAmount);
                            setError(null);
                            setFiscalConfirmModal(true);
                        }}
                    />
                )}

                {paymentModal === "transfer" && (
                    <div
                        key="payment-transfer-modal"
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
                    >
                        <motion.div
                            initial={{opacity: 0, scale: 0.96}}
                            animate={{opacity: 1, scale: 1}}
                            exit={{opacity: 0, scale: 0.96}}
                            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
                        >
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">
                                Оплата переводом
                            </h2>

                            <div className="mb-4">
                                <div className="text-gray-600 mb-1">Сумма к переводу:</div>

                                <div className="text-3xl font-bold text-blue-700">
                                    {formatCurrency(total)}
                                </div>
                            </div>

                            <div className="mb-5">
                                <label className="mb-2 block text-sm font-bold text-gray-700">
                                    Имя / кто переводит
                                </label>

                                <input
                                    type="text"
                                    autoFocus
                                    maxLength={160}
                                    value={transferCustomerName}
                                    onChange={(event) => {
                                        setTransferCustomerName(event.target.value);
                                        setError(null);
                                    }}
                                    onKeyDown={(event) => {
                                        if (
                                            event.key === "Enter" &&
                                            transferCustomerName.trim() &&
                                            !isPaying
                                        ) {
                                            event.preventDefault();
                                            void completePayment("transfer", false);
                                        }
                                    }}
                                    placeholder="Например: Александр"
                                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-lg font-bold outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500"
                                />

                                <div className="mt-2 text-xs text-gray-500">
                                    Имя сохранится вместе с чеком и будет видно в истории продаж.
                                </div>
                            </div>

                            <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-700 mb-6">
                                Перед подтверждением обязательно убедитесь, что перевод поступил
                                или показан клиентом как выполненный.
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
                                    onClick={() => {
                                        setPaymentModal(null);
                                        setTransferCustomerName("");
                                    }}
                                    className="px-5 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Отмена
                                </button>

                                <button
                                    type="button"
                                    disabled={isPaying || !transferCustomerName.trim()}
                                    onClick={() => completePayment("transfer", false)}
                                    className="px-5 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {isPaying ? "Провожу оплату..." : "Перевод выполнен"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {fiscalConfirmModal &&
                    (paymentModal === "card" || paymentModal === "cash" || paymentModal === "mixed") && (
                        <div
                            key="fiscal-confirm-modal"
                            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
                        >
                            <motion.div
                                initial={{opacity: 0, scale: 0.96}}
                                animate={{opacity: 1, scale: 1}}
                                exit={{opacity: 0, scale: 0.96}}
                                className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
                            >
                                <h2 className="text-2xl font-bold text-gray-800 mb-4">
                                    Фискализировать чек?
                                </h2>

                                <div className="mb-4">
                                    <div className="text-gray-600 mb-1">
                                        Сумма оплаты{" "}
                                        {paymentModal === "cash" ? "наличными" : paymentModal === "mixed" ? "смешанно" : "картой"}:
                                    </div>

                                    <div
                                        className={
                                            paymentModal === "cash"
                                                ? "text-3xl font-bold text-emerald-700"
                                                : "text-3xl font-bold text-indigo-700"
                                        }
                                    >
                                        {formatCurrency(total)}
                                    </div>

                                    {paymentModal === "cash" && (
                                        <div
                                            className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                                            <div className="flex justify-between">
                                                <span>Получено:</span>
                                                <span className="font-bold">
                          {formatCurrency(cashReceivedNumber)}
                        </span>
                                            </div>

                                            <div className="mt-1 flex justify-between">
                                                <span>Сдача:</span>
                                                <span className="font-bold">
                          {formatCurrency(Math.max(0, change))}
                        </span>
                                            </div>
                                        </div>
                                    )}

                                    {paymentModal === "mixed" && (
                                        <div className="mt-3 rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-800">
                                            <div className="flex justify-between"><span>Наличными:</span><span
                                                className="font-bold">{formatCurrency(mixedCashAmount)}</span></div>
                                            <div className="mt-1 flex justify-between"><span>Картой:</span><span
                                                className="font-bold">{formatCurrency(mixedCardAmount)}</span></div>
                                            <div
                                                className="mt-3 border-t border-violet-200 pt-2 text-xs font-semibold">В
                                                учёте сохраняется реальная разбивка. В АТОЛ временно отправляется вся
                                                сумма как карта.
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 mb-6">
                                    Фискализация будет отправлена на локальную ККТ АТОЛ.
                                    {hasMarkedCheckoutItems
                                        ? " В чеке есть маркированный товар, поэтому сохранить продажу без ККТ нельзя."
                                        : " Если чек пробивать не нужно, продажа сохранится без отправки в ККТ."}
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
                                        {hasMarkedCheckoutItems
                                            ? "Без ККТ нельзя для маркировки"
                                            : "Нет, сохранить без ККТ"}
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
                                        className={
                                            paymentModal === "cash"
                                                ? "px-5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                                                : paymentModal === "mixed"
                                                    ? "px-5 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                                                    : "px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                                        }
                                    >
                                        {isPaying ? "Фискализирую..." : "Да, пробить на ККТ"}
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
                            initial={{opacity: 0, scale: 0.96}}
                            animate={{opacity: 1, scale: 1}}
                            exit={{opacity: 0, scale: 0.96}}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
                        >
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">
                                Чек сформирован
                            </h2>

                            <div className="text-sm text-gray-500 mb-5">
                                № {lastReceipt.id} ·{" "}
                                {new Date(lastReceipt.createdAt).toLocaleString("ru-RU")}
                            </div>

                            {lastReceipt.fiscalStatus === "success" && (
                                <div
                                    className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                                    Чек успешно пробит на ККТ
                                    {lastReceipt.fiscalUuid && (
                                        <div className="mt-1 text-xs text-emerald-600">
                                            UUID: {lastReceipt.fiscalUuid}
                                        </div>
                                    )}
                                </div>
                            )}

                            {lastReceipt.fiscalStatus === "skipped" && (
                                <div
                                    className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                                    Продажа сохранена без фискализации на ККТ
                                </div>
                            )}

                            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                                {lastReceipt.items.map((item, index) => (
                                    <div
                                        key={`${item.productId}-${index}`}
                                        className="border-b pb-2"
                                    >
                                        <div className="font-medium text-gray-800">{item.name}</div>

                                        {item.marked && (
                                            <div className="mt-1 text-xs font-semibold text-emerald-700">
                                                [{item.markingStatus || "M+"}] Маркировка проверена
                                                {item.markingCode
                                                    ? ` · КМ: ${formatMarkingCodePreview(item.markingCode)}`
                                                    : ""}
                                            </div>
                                        )}

                                        {item.marked && item.markingMessage && (
                                            <div className="mt-1 text-xs text-gray-500">
                                                {item.markingMessage}
                                            </div>
                                        )}

                                        <div className="flex justify-between text-sm text-gray-500">
                      <span>
                        {formatCurrency(item.price)} ×{" "}
                          {formatQuantity(item.quantity, item.unit)}
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
                                    <span className="font-semibold">
                    {lastReceipt.paymentLabel}
                  </span>
                                </div>

                                {lastReceipt.paymentMethod === "transfer" &&
                                    lastReceipt.customerName && (
                                        <div className="flex justify-between">
                                            <span>Клиент:</span>
                                            <span className="font-semibold">
                                                {lastReceipt.customerName}
                                            </span>
                                        </div>
                                    )}

                                <div className="flex justify-between text-xl font-bold">
                                    <span>Итого:</span>
                                    <span>{formatCurrency(lastReceipt.total)}</span>
                                </div>

                                {lastReceipt.paymentMethod === "cash" && (
                                    <>
                                        <div className="flex justify-between">
                                            <span>Получено:</span>
                                            <span>
                        {formatCurrency(lastReceipt.receivedAmount || 0)}
                      </span>
                                        </div>

                                        <div className="flex justify-between">
                                            <span>Сдача:</span>
                                            <span>{formatCurrency(lastReceipt.change || 0)}</span>
                                        </div>
                                    </>
                                )}

                                {lastReceipt.paymentMethod === "mixed" && (
                                    <>
                                        <div className="flex justify-between text-emerald-700">
                                            <span>Наличными:</span><span
                                            className="font-semibold">{formatCurrency(lastReceipt.cashAmount || 0)}</span>
                                        </div>
                                        <div className="flex justify-between text-indigo-700"><span>Картой:</span><span
                                            className="font-semibold">{formatCurrency(lastReceipt.cardAmount || 0)}</span>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="mt-6 flex flex-wrap justify-end gap-3">
                                {lastReceipt.fiscalStatus === "success" && (
                                    <button
                                        type="button"
                                        onClick={repeatLastFiscalReceipt}
                                        disabled={isShiftActionLoading}
                                        className="px-6 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        Копия чека ККТ
                                    </button>
                                )}

                                {lastReceipt.fiscalStatus === "skipped" && (
                                    <button
                                        type="button"
                                        onClick={() => openCommodityReceiptPaperWarning(lastReceipt)}
                                        disabled={isShiftActionLoading}
                                        className="px-6 py-2 rounded-lg border border-amber-300 bg-amber-50 font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                                    >
                                        Печать товарного чека
                                    </button>
                                )}

                                <button
                                    ref={newSaleButtonRef}
                                    type="button"
                                    autoFocus
                                    onClick={clearReceipt}
                                    className="px-6 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200"
                                >
                                    Новая продажа
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {isReturnModalOpen && (
                    <div
                        key="return-product-modal"
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 px-4"
                        onClick={() => {
                            if (!isReturnSaving) {
                                setIsReturnModalOpen(false)
                            }
                        }}
                    >
                        <motion.div
                            initial={{
                                opacity: 0,
                                scale: 0.96,
                            }}
                            animate={{
                                opacity: 1,
                                scale: 1,
                            }}
                            exit={{
                                opacity: 0,
                                scale: 0.96,
                            }}
                            onClick={event =>
                                event.stopPropagation()
                            }
                            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
                        >
                            <div className="border-b border-gray-100 p-6">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <div
                                            className="inline-flex rounded-full bg-orange-100 px-3 py-1 text-xs font-black uppercase tracking-[0.15em] text-orange-800">
                                            Возврат
                                        </div>

                                        <h2 className="mt-2 text-2xl font-black text-gray-900">
                                            Возврат товара
                                        </h2>

                                        <p className="mt-1 text-sm text-gray-500">
                                            Возвращаемый товар поступит на остаток текущей зоны.
                                        </p>

                                        <div
                                            className="mt-3 inline-flex rounded-xl bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-700">
                                            Зона: {warehouseLocationName}
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        disabled={
                                            isReturnSaving
                                        }
                                        onClick={() =>
                                            setIsReturnModalOpen(
                                                false
                                            )
                                        }
                                        className="text-2xl text-gray-400 hover:text-gray-700 disabled:opacity-40"
                                    >
                                        ×
                                    </button>
                                </div>

                                <div className="mt-5">
                                    <input
                                        type="text"
                                        autoFocus
                                        value={
                                            returnSearchQuery
                                        }
                                        onChange={event => {
                                            setReturnSearchQuery(
                                                event.target
                                                    .value
                                            )

                                            setReturnFoundProducts(
                                                []
                                            )
                                        }}
                                        onKeyDown={event => {
                                            if (
                                                event.key ===
                                                'Enter'
                                            ) {
                                                event.preventDefault()

                                                void searchReturnProduct()
                                            }
                                        }}
                                        placeholder="Сканируйте штрихкод или введите название товара..."
                                        className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-lg font-semibold outline-none focus:ring-2 focus:ring-orange-500"
                                    />
                                </div>

                                {returnFoundProducts.length >
                                    0 && (
                                        <div
                                            className="mt-3 max-h-48 overflow-y-auto rounded-2xl border border-gray-200 bg-gray-50 p-2">
                                            {returnFoundProducts.map(
                                                product => (
                                                    <button
                                                        key={String(
                                                            product.id
                                                        )}
                                                        type="button"
                                                        onClick={() =>
                                                            addProductToReturn(
                                                                product
                                                            )
                                                        }
                                                        className="mb-1 flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-left hover:bg-orange-50"
                                                    >
                                                        <div>
                                                            <div className="font-bold text-gray-900">
                                                                {
                                                                    product.name
                                                                }
                                                            </div>

                                                            <div className="text-xs text-gray-500">
                                                                {product.barcode
                                                                    ? getBarcodeDisplay(
                                                                        product.barcode
                                                                    )
                                                                    : 'Без штрихкода'}
                                                            </div>
                                                        </div>

                                                        <span className="font-bold text-orange-700">
                                        +
                                    </span>
                                                    </button>
                                                )
                                            )}
                                        </div>
                                    )}
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto p-6">
                                {returnItems.length ===
                                0 ? (
                                    <div className="rounded-2xl bg-gray-50 p-10 text-center text-gray-500">
                                        Сканируйте товар, который покупатель возвращает.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {returnItems.map(
                                            item => (
                                                <div
                                                    key={String(
                                                        item.product
                                                            .id
                                                    )}
                                                    className="rounded-2xl border border-orange-100 bg-orange-50/40 p-4"
                                                >
                                                    <div
                                                        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="font-black text-gray-900">
                                                                {
                                                                    item
                                                                        .product
                                                                        .name
                                                                }
                                                            </div>

                                                            <div className="mt-1 text-xs text-gray-500">
                                                                {item
                                                                    .product
                                                                    .unit ===
                                                                'weight'
                                                                    ? 'Весовой товар'
                                                                    : 'Штучный товар'}
                                                            </div>

                                                            <div className="mt-1 text-xs font-semibold text-indigo-600">
                                                                Текущий остаток:{' '}
                                                                {formatQuantity(
                                                                    getStock(
                                                                        item.product
                                                                    ),
                                                                    item
                                                                        .product
                                                                        .unit
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-3">
                                                            <input
                                                                type="number"
                                                                min={
                                                                    item
                                                                        .product
                                                                        .unit ===
                                                                    'weight'
                                                                        ? '0.001'
                                                                        : '1'
                                                                }
                                                                step={
                                                                    item
                                                                        .product
                                                                        .unit ===
                                                                    'weight'
                                                                        ? '0.001'
                                                                        : '1'
                                                                }
                                                                value={
                                                                    item.quantity
                                                                }
                                                                onChange={event =>
                                                                    updateReturnQuantity(
                                                                        item
                                                                            .product
                                                                            .id,
                                                                        event
                                                                            .target
                                                                            .value
                                                                    )
                                                                }
                                                                className="w-28 rounded-xl border border-gray-300 px-3 py-2 text-center text-lg font-black"
                                                            />

                                                            <span className="w-8 text-sm font-bold text-gray-500">
                                                {item
                                                    .product
                                                    .unit ===
                                                'weight'
                                                    ? 'кг'
                                                    : 'шт.'}
                                            </span>

                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    removeReturnItem(
                                                                        item
                                                                            .product
                                                                            .id
                                                                    )
                                                                }
                                                                className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600 hover:bg-red-100"
                                                            >
                                                                <AiOutlineDelete/>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        )}
                                    </div>
                                )}

                                <div className="mt-5">
                                    <label className="mb-2 block text-sm font-bold text-gray-700">
                                        Комментарий
                                    </label>

                                    <textarea
                                        value={returnComment}
                                        onChange={event =>
                                            setReturnComment(
                                                event.target
                                                    .value
                                            )
                                        }
                                        placeholder="Например: возврат от покупателя, товар не подошёл"
                                        className="h-24 w-full resize-none rounded-2xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
                                    />
                                </div>
                            </div>

                            <div
                                className="flex flex-col gap-3 border-t border-gray-100 bg-gray-50 p-5 sm:flex-row sm:items-center sm:justify-between">
                                <div className="text-sm text-gray-500">
                                    Позиций:{' '}

                                    <strong className="text-gray-900">
                                        {returnItems.length}
                                    </strong>

                                    {' · '}

                                    Возврат в:{' '}

                                    <strong className="text-indigo-700">
                                        {warehouseLocationName}
                                    </strong>
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        disabled={
                                            isReturnSaving
                                        }
                                        onClick={() =>
                                            setIsReturnModalOpen(
                                                false
                                            )
                                        }
                                        className="rounded-xl border border-gray-300 bg-white px-5 py-3 font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                                    >
                                        Отмена
                                    </button>

                                    <button
                                        type="button"
                                        disabled={
                                            isReturnSaving ||
                                            returnItems.length ===
                                            0
                                        }
                                        onClick={() =>
                                            void submitProductReturn()
                                        }
                                        className="rounded-xl bg-orange-600 px-5 py-3 font-black text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {isReturnSaving
                                            ? 'Возвращаю...'
                                            : 'Оформить возврат'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {isAtolSetupOpen && (
                <AtolAgentSetup onClose={() => setIsAtolSetupOpen(false)}/>
            )}

            <style>{`
                @keyframes toast-progress {
                    from { transform: scaleX(1); }
                    to { transform: scaleX(0); }
                }
            `}</style>
        </div>
    );
}
git
"use client";

import {useCallback, useEffect, useMemo, useRef, useState} from "react";

const CUSTOMER_DISPLAY_CHANNEL_NAME = "warehouse-customer-display-v1";
const PRODUCT_PLACEHOLDER_IMAGE = "/icons/product-placeholder.png?v=20260924-3";

const normalizeDisplayImage = (image?: string | null): string => {
    const value = String(image || "").trim();

    if (!value) {
        return PRODUCT_PLACEHOLDER_IMAGE;
    }

    try {
        const parsed = new URL(value, "http://warehouse.local");
        const pathname = parsed.pathname.toLowerCase();

        if (
            pathname === "/icons/products.png" ||
            pathname === "/icons/products.jpg" ||
            pathname === "/icons/product-placeholder.png"
        ) {
            return PRODUCT_PLACEHOLDER_IMAGE;
        }
    } catch {
        const normalized = value.split("?")[0]?.toLowerCase() || "";

        if (
            normalized === "/icons/products.png" ||
            normalized === "/icons/products.jpg" ||
            normalized === "/icons/product-placeholder.png"
        ) {
            return PRODUCT_PLACEHOLDER_IMAGE;
        }
    }

    return value;
};

const isBrowserF11Fullscreen = (): boolean => {
    if (typeof window === "undefined") {
        return false;
    }

    const screenWidth = window.screen?.width || 0;
    const screenHeight = window.screen?.height || 0;

    if (screenWidth <= 0 || screenHeight <= 0) {
        return false;
    }

    return (
        Math.abs(window.innerWidth - screenWidth) <= 8 &&
        Math.abs(window.innerHeight - screenHeight) <= 8
    );
};

type CustomerDisplayItem = {
    id: string;
    productId: string | number;
    name: string;
    quantity: number;
    unit: string;
    price: number;
    total: number;
    image?: string;
};

type CustomerDisplayStateMessage = {
    type: "state";
    locationName: string;
    total: number;
    items: CustomerDisplayItem[];
    updatedAt: string;
};

type CustomerDisplayCompleteMessage = {
    type: "sale-complete";
    total: number;
    updatedAt: string;
};

type DisplayMessage =
    | CustomerDisplayStateMessage
    | CustomerDisplayCompleteMessage;

const EMPTY_STATE: CustomerDisplayStateMessage = {
    type: "state",
    locationName: "",
    total: 0,
    items: [],
    updatedAt: new Date(0).toISOString(),
};

const money = (value: number) =>
    new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: "RUB",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);

const quantity = (value: number, unit: string) => {
    if (unit === "weight") {
        return `${new Intl.NumberFormat("ru-RU", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 3,
        }).format(value)} кг`;
    }

    return `${new Intl.NumberFormat("ru-RU", {
        maximumFractionDigits: 0,
    }).format(value)} шт.`;
};

export default function CustomerDisplayPage() {
    const [state, setState] = useState<CustomerDisplayStateMessage>(EMPTY_STATE);
    const [isConnected, setIsConnected] = useState(false);
    const [completedTotal, setCompletedTotal] = useState<number | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isNativeF11Fullscreen, setIsNativeF11Fullscreen] = useState(false);
    const latestStateRef = useRef<CustomerDisplayStateMessage>(EMPTY_STATE);
    const completeTimerRef = useRef<number | null>(null);

    const refreshFullscreenState = useCallback(() => {
        if (typeof document === "undefined") {
            return;
        }

        const nativeF11 = isBrowserF11Fullscreen();

        setIsNativeF11Fullscreen(nativeF11);
        setIsFullscreen(Boolean(document.fullscreenElement) || nativeF11);
    }, []);

    const toggleFullscreen = useCallback(async () => {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
                window.setTimeout(refreshFullscreenState, 60);
                return;
            }

            if (isBrowserF11Fullscreen()) {
                // Системный F11 браузер не позволяет выключить из JavaScript.
                // Состояние кнопки остаётся синхронизировано через resize.
                refreshFullscreenState();
                return;
            }

            await document.documentElement.requestFullscreen();
            window.setTimeout(refreshFullscreenState, 60);
        } catch (error) {
            console.error("Customer display fullscreen error:", error);
            refreshFullscreenState();
        }
    }, [refreshFullscreenState]);

    useEffect(() => {
        const handleFullscreenChange = () => refreshFullscreenState();
        const handleResize = () => {
            window.setTimeout(refreshFullscreenState, 40);
        };
        const handleKeyDown = (event: globalThis.KeyboardEvent) => {
            if (event.key !== "F11") {
                return;
            }

            // Привязываем F11 к тому же действию, что и кнопка.
            // Если браузер не отдаёт F11 странице, native-F11 всё равно
            // будет обнаружен через resize.
            event.preventDefault();
            void toggleFullscreen();
        };

        refreshFullscreenState();
        document.addEventListener("fullscreenchange", handleFullscreenChange);
        window.addEventListener("resize", handleResize);
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
            window.removeEventListener("resize", handleResize);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [refreshFullscreenState, toggleFullscreen]);

    useEffect(() => {
        if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
            return;
        }

        const channel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL_NAME);
        setIsConnected(true);

        channel.onmessage = (event: MessageEvent<DisplayMessage>) => {
            const message = event.data;

            if (!message || typeof message !== "object") {
                return;
            }

            if (message.type === "state") {
                latestStateRef.current = message;
                setState(message);
                return;
            }

            if (message.type === "sale-complete") {
                setCompletedTotal(message.total);

                if (completeTimerRef.current !== null) {
                    window.clearTimeout(completeTimerRef.current);
                }

                completeTimerRef.current = window.setTimeout(() => {
                    setCompletedTotal(null);
                    setState(latestStateRef.current);
                    completeTimerRef.current = null;
                }, 4000);
            }
        };

        channel.postMessage({type: "request-state"});

        const retryId = window.setTimeout(() => {
            channel.postMessage({type: "request-state"});
        }, 500);

        return () => {
            window.clearTimeout(retryId);

            if (completeTimerRef.current !== null) {
                window.clearTimeout(completeTimerRef.current);
            }

            channel.close();
        };
    }, []);

    const lastItem = state.items[state.items.length - 1] || null;

    const itemCount = useMemo(
        () => state.items.reduce((sum, item) => sum + item.quantity, 0),
        [state.items],
    );

    const fullscreenButton = (
        <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-black shadow-lg backdrop-blur-xl transition ${
                isFullscreen
                    ? "border-cyan-300/30 bg-cyan-300/15 text-cyan-100 hover:bg-cyan-300/20"
                    : "border-white/10 bg-white/[0.07] text-white/75 hover:bg-white/[0.12]"
            }`}
            title={
                isNativeF11Fullscreen
                    ? "Полный экран включён через F11. Для выхода нажмите F11."
                    : isFullscreen
                        ? "Свернуть экран (F11)"
                        : "Во весь экран (F11)"
            }
            aria-label={isFullscreen ? "Свернуть экран" : "Во весь экран"}
        >
            <span aria-hidden="true" className="text-lg leading-none">
                {isFullscreen ? "↙" : "⛶"}
            </span>
            <span>{isFullscreen ? "Свернуть" : "Во весь экран"}</span>
            <span className="rounded-lg bg-black/20 px-2 py-1 text-[11px] font-black text-white/45">
                F11
            </span>
        </button>
    );

    if (completedTotal !== null) {
        return (
            <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07111f] p-8 text-white">
                <div className="absolute right-6 top-6 z-20">{fullscreenButton}</div>
                <div className="relative w-full max-w-5xl overflow-hidden rounded-[48px] border border-white/10 bg-white/[0.06] px-8 py-20 text-center shadow-2xl backdrop-blur-2xl sm:px-16">
                    <div className="absolute -left-28 -top-28 h-80 w-80 rounded-full bg-emerald-400/20 blur-3xl" />
                    <div className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-cyan-400/20 blur-3xl" />

                    <div className="relative">
                        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-400 text-5xl font-black text-[#07111f] shadow-[0_0_60px_rgba(52,211,153,0.35)]">
                            ✓
                        </div>
                        <h1 className="mt-8 text-5xl font-black tracking-tight sm:text-7xl">
                            Спасибо за покупку!
                        </h1>
                        <div className="mt-7 text-xl font-bold text-white/55">
                            Сумма покупки
                        </div>
                        <div className="mt-2 text-6xl font-black text-emerald-300 sm:text-8xl">
                            {money(completedTotal)}
                        </div>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen overflow-hidden bg-[#07111f] text-white">
            <div className="flex min-h-screen flex-col p-5 sm:p-7 lg:p-9">
                <header className="flex items-center justify-between gap-5">
                    <div>
                        <div className="text-sm font-black uppercase tracking-[0.24em] text-cyan-300">
                            {state.locationName || "Магазин"}
                        </div>
                        <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
                            Ваша покупка
                        </h1>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3">
                        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/65 backdrop-blur-xl">
                            <span
                                className={`h-2.5 w-2.5 rounded-full ${
                                    isConnected ? "bg-emerald-400" : "bg-amber-400"
                                }`}
                            />
                            {isConnected ? "Экран подключён" : "Ожидание кассы"}
                        </div>
                        {fullscreenButton}
                    </div>
                </header>

                <div className="mt-7 grid flex-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
                    <section className="relative overflow-hidden rounded-[38px] border border-white/10 bg-gradient-to-br from-white/[0.10] to-white/[0.035] p-6 shadow-2xl backdrop-blur-2xl sm:p-8">
                        <div className="absolute -right-24 -top-20 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
                        <div className="absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />

                        {lastItem ? (
                            <div className="relative flex h-full flex-col">
                                <div className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">
                                    Последний товар
                                </div>

                                <div className="mt-6 grid flex-1 items-center gap-7 xl:grid-cols-[minmax(180px,0.7fr)_minmax(0,1.3fr)]">
                                    <div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-[34px] bg-white p-7 shadow-inner">
                                        <img
                                            src={normalizeDisplayImage(lastItem.image)}
                                            alt={lastItem.name}
                                            onError={(event) => {
                                                const element = event.currentTarget;

                                                if (!element.src.includes("/icons/product-placeholder.png")) {
                                                    element.src = PRODUCT_PLACEHOLDER_IMAGE;
                                                }
                                            }}
                                            className="max-h-[300px] max-w-full object-contain"
                                        />
                                    </div>

                                    <div className="min-w-0">
                                        <h2 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl">
                                            {lastItem.name}
                                        </h2>

                                        <div className="mt-7 flex flex-wrap items-end gap-x-5 gap-y-2">
                                            <div className="text-2xl font-bold text-white/55">
                                                {quantity(lastItem.quantity, lastItem.unit)} × {money(lastItem.price)}
                                            </div>
                                            <div className="text-5xl font-black text-cyan-300 sm:text-6xl">
                                                {money(lastItem.total)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="relative flex h-full min-h-[420px] flex-col items-center justify-center text-center">
                                <div className="flex h-28 w-28 items-center justify-center rounded-[36px] bg-cyan-300 text-6xl text-[#07111f] shadow-[0_0_80px_rgba(103,232,249,0.20)]">
                                    🛍️
                                </div>
                                <h2 className="mt-8 text-5xl font-black tracking-tight sm:text-6xl">
                                    Добро пожаловать!
                                </h2>
                                <p className="mt-4 max-w-xl text-xl font-semibold leading-relaxed text-white/50">
                                    Отсканированные товары появятся здесь.
                                </p>
                            </div>
                        )}
                    </section>

                    <section className="flex min-h-0 flex-col overflow-hidden rounded-[38px] border border-white/10 bg-white/[0.07] shadow-2xl backdrop-blur-2xl">
                        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
                            <div className="text-lg font-black">Состав покупки</div>
                            <div className="rounded-full bg-white/10 px-3 py-1 text-sm font-black text-white/65">
                                {state.items.length} поз.
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                            {state.items.length > 0 ? (
                                <div className="space-y-2">
                                    {state.items.map((item, index) => (
                                        <div
                                            key={item.id}
                                            className={`grid grid-cols-[minmax(0,1fr)_auto] gap-4 rounded-2xl px-4 py-3 transition ${
                                                index === state.items.length - 1
                                                    ? "bg-cyan-300/12 ring-1 ring-cyan-300/20"
                                                    : "bg-white/[0.045]"
                                            }`}
                                        >
                                            <div className="min-w-0">
                                                <div className="truncate text-base font-black">
                                                    {item.name}
                                                </div>
                                                <div className="mt-1 text-sm font-semibold text-white/45">
                                                    {quantity(item.quantity, item.unit)} × {money(item.price)}
                                                </div>
                                            </div>
                                            <div className="self-center text-lg font-black text-white">
                                                {money(item.total)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex h-full min-h-[220px] items-center justify-center text-center text-base font-semibold text-white/35">
                                    Корзина пока пуста
                                </div>
                            )}
                        </div>

                        <div className="border-t border-white/10 bg-black/15 p-6">
                            <div className="flex items-end justify-between gap-5">
                                <div>
                                    <div className="text-sm font-bold text-white/45">
                                        Товаров: {new Intl.NumberFormat("ru-RU", {
                                        maximumFractionDigits: 3,
                                    }).format(itemCount)}
                                    </div>
                                    <div className="mt-1 text-lg font-black text-white/70">
                                        Итого
                                    </div>
                                </div>
                                <div className="text-right text-5xl font-black tracking-tight text-cyan-300 sm:text-6xl">
                                    {money(state.total)}
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}

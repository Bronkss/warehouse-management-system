'use client';

import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { AiOutlineDelete, AiOutlinePlus, AiOutlineMinus, AiOutlineSearch, AiOutlineScan } from 'react-icons/ai';

type Product = {
    id: string;
    name: string;
    category?: string;
    barcode?: string;
    purchase_price?: number;
    sellingPrice: number;
    unit?: string;
    stock?: number;
    min_stock?: number;
    image?: string;
};

type CheckoutItem = {
    product: Product;
    id: string;
    quantity: number;
};

// Безопасное преобразование цены в число
const safeParsePrice = (price: any): number => {
    if (typeof price === 'number') return price;
    if (typeof price === 'string') {
        const parsed = parseFloat(price.replace(',', '.').replace(/\s/g, ''));
        return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
};

// Получение цены продажи из продукта
const getSellingPrice = (product: Product): number => {
    return safeParsePrice(product.sellingPrice);
};

// Безопасное форматирование валюты
const formatCurrency = (amount: number | undefined | null): string => {
    const safeAmount = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(safeAmount);
};

const calculateTotal = (items: CheckoutItem[]): number => {
    return items.reduce((sum, item) => {
        const price = getSellingPrice(item.product);
        return sum + price * item.quantity;
    }, 0);
};

export default function PosPage() {
    const [checkoutItems, setCheckoutItems] = useState<CheckoutItem[]>([]);
    const [allProducts, setAllProducts] = useState<Product[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [foundProducts, setFoundProducts] = useState<Product[]>([]);
    const [newProduct, setNewProduct] = useState<Product | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [autoFocus, setAutoFocus] = useState(true);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const total = calculateTotal(checkoutItems);

    // Загрузка всех товаров из БД с преобразованием цен
    useEffect(() => {
        const fetchAllProducts = async () => {
            try {
                setIsLoading(true);
                const response = await fetch('/api/products');
                if (!response.ok) throw new Error('Не удалось загрузить товары');
                const data = await response.json();

                console.log('Полученные данные:', data); // Для отладки

                // Преобразуем цены в числа при загрузке
                const safeProducts: Product[] = data.map((product: any) => ({
                    ...product,
                    selling_price: safeParsePrice(product.sellingPrice),
                    purchase_price: safeParsePrice(product.purchase_price)
                }));

                console.log('Обработанные продукты:', safeProducts); // Для отладки

                setAllProducts(safeProducts);
            } catch (err) {
                setError('Ошибка загрузки товаров');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchAllProducts();
    }, []);

    // Поиск товаров по вводу пользователя
    useEffect(() => {
        if (!searchQuery || !allProducts.length) {
            setFoundProducts([]);
            return;
        }

        const delayDebounce = setTimeout(() => {
            const results = allProducts.filter(product =>
                product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (product.barcode?.toLowerCase().includes(searchQuery.toLowerCase()) || '')
            );
            setFoundProducts(results);
        }, 300);

        return () => clearTimeout(delayDebounce);
    }, [searchQuery, allProducts]);

    // Автоматическое добавление при вводе 13-значного штрихкода
    useEffect(() => {
        const isBarcode = /^\d{13}$/.test(searchQuery);

        if (isBarcode && foundProducts.length === 1) {
            addToCheckout(foundProducts[0]);
        }
    }, [searchQuery, foundProducts]);

// Обработчик нажатия клавиш (остается для ручного добавления)
    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if ((e.key === 'Enter' || e.key === ' ') && foundProducts.length === 1) {
            e.preventDefault();
            addToCheckout(foundProducts[0]);
        }
    };

    // Добавление товара в чек
    const addToCheckout = (product: Product) => {
        // Убеждаемся, что цена корректна
        const safeProduct = {
            ...product,
            selling_price: safeParsePrice(product.sellingPrice)
        };

        setCheckoutItems(prevItems => {
            const existingItem = prevItems.find(item => item.product.id === safeProduct.id);
            if (existingItem) {
                return prevItems.map(item =>
                    item.product.id === safeProduct.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            } else {
                return [
                    ...prevItems,
                    {
                        product: safeProduct,
                        id: Date.now().toString(),
                        quantity: 1,
                    },
                ];
            }
        });
        setSearchQuery('');
        setFoundProducts([]);
        if (searchInputRef.current) searchInputRef.current.focus();
    };

    // Автоматическое добавление товара по штрихкоду при сканировании
    useEffect(() => {
        if (!searchQuery.includes(' ')) return;

        const barcodeMatch = allProducts.find(p => p.barcode === searchQuery.trim());
        if (barcodeMatch) {
            setTimeout(() => addToCheckout(barcodeMatch), 0);
        } else {
            setNewProduct({
                id: '',
                name: searchQuery.trim(),
                sellingPrice: 0,
                barcode: searchQuery.trim(),
            });
        }
        setSearchQuery('');
    }, [searchQuery, allProducts]);

    // Создание нового товара (если штрихкод не найден)
    const createNewProduct = async () => {
        if (!newProduct) return;

        try {
            const productToCreate = {
                ...newProduct,
                sellingPrice: safeParsePrice(newProduct.sellingPrice)
            };

            const response = await fetch('/api/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(productToCreate),
            });

            if (!response.ok) throw new Error('Не удалось создать товар');
            const createdProduct: Product = await response.json();
            addToCheckout({
                ...createdProduct,
                sellingPrice: safeParsePrice(createdProduct.sellingPrice)
            });
        } catch (err) {
            setError('Ошибка создания товара');
            console.error(err);
        }
    };

    // Пример данных для истории
    const sales = [
        {
            id: '1',
            items: [
                { product: { id: 'p1', name: 'Кофе', sellingPrice: 120, barcode: '123456789012' }, id: 'i1', quantity: 2 },
                { product: { id: 'p2', name: 'Торт', sellingPrice: 300, barcode: '987654321098' }, id: 'i2', quantity: 1 },
            ],
            total: 540,
            createdAt: new Date('2024-06-01T10:00:00'),
        },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold text-indigo-800 mb-8 text-center">Онлайн-касса</h1>

                {/* Панель поиска */}
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden mb-8">
                    <div className="p-6 border-b border-gray-200">
                        <div className="relative mb-4">
                            <div className="absolute left-3 top-2.5 text-gray-400">
                                <AiOutlineScan size={20} />
                            </div>
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder="Скан штрихкода или назовите товар..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                autoFocus={autoFocus}
                                onFocus={() => setAutoFocus(false)}
                                className="w-full pl-10 pr-4 py-3 rounded-full border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => {
                                        setSearchQuery('');
                                        setFoundProducts([]);
                                    }}
                                    className="absolute right-3 top-2 text-gray-400 hover:text-gray-600"
                                >
                                    ×
                                </button>
                            )}
                        </div>

                        {/* Подсказка для сканирования */}
                        {searchQuery.endsWith(' ') && (
                            <div className="text-sm text-gray-500 mt-1">
                                Скан штрихкода завершён. Нажмите Enter.
                            </div>
                        )}
                    </div>

                    {/* Подсказки под полем поиска */}
                    <AnimatePresence>
                        {searchQuery && foundProducts.length === 0 && !newProduct && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="py-2 bg-gray-50 text-center text-gray-500"
                            >
                                Товар не найден. Начните вводить штрихкод.
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Результаты поиска */}
                    <AnimatePresence>
                        {foundProducts.length > 0 && searchQuery && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="border-t border-gray-200">
                                    <div className="h-px bg-gray-200"></div>
                                    <div className="p-4">
                                        {foundProducts.map((product) => (
                                            <motion.div
                                                key={product.id}
                                                whileHover={{ scale: 1.02 }}
                                                className="flex justify-between items-center p-3 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                                                onClick={() => addToCheckout(product)}
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium truncate">{product.name}</div>
                                                    {product.barcode && (
                                                        <div className="text-sm text-gray-500 truncate">
                                                            ШК: {product.barcode}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="font-bold">
                                                    {formatCurrency(getSellingPrice(product))}
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        addToCheckout(product);
                                                    }}
                                                    className="ml-4 text-indigo-600 hover:text-indigo-800 text-lg"
                                                >
                                                    +
                                                </button>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Текущий чек */}
                    {checkoutItems.length > 0 && (
                        <div className="p-4 border-t border-gray-100">
                            <div className="space-y-2">
                                {checkoutItems.map((item) => (
                                    <motion.div
                                        key={item.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold truncate">{item.product.name}</div>
                                            <div className="text-sm text-gray-500">
                                                {formatCurrency(getSellingPrice(item.product))} × {item.quantity}
                                            </div>
                                            {item.product.barcode && (
                                                <div className="text-sm text-gray-500 truncate">
                                                    ШК: {item.product.barcode}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center space-x-4">
                                            <div className="flex items-center space-x-1">
                                                <button
                                                    onClick={() => {
                                                        if (item.quantity <= 1) return;
                                                        setCheckoutItems(prev =>
                                                            prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity - 1 } : i)
                                                        );
                                                    }}
                                                    className="p-1 text-gray-500 hover:text-indigo-600 rounded disabled:opacity-30"
                                                    disabled={item.quantity <= 1}
                                                >
                                                    <AiOutlineMinus />
                                                </button>
                                                <span className="font-medium w-8 text-center">{item.quantity}</span>
                                                <button
                                                    onClick={() => setCheckoutItems(prev =>
                                                        prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i)
                                                    )}
                                                    className="p-1 text-gray-500 hover:text-indigo-600 rounded"
                                                >
                                                    <AiOutlinePlus />
                                                </button>
                                            </div>
                                            <div className="font-bold text-lg min-w-[100px] text-right">
                                                {formatCurrency(getSellingPrice(item.product) * item.quantity)}
                                            </div>
                                            <button
                                                onClick={() => setCheckoutItems(prev => prev.filter(i => i.id !== item.id))}
                                                className="text-red-500 hover:text-red-700 ml-2"
                                            >
                                                <AiOutlineDelete size={20} />
                                            </button>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            {/* Итог */}
                            <div className="mt-6 pt-6 border-t border-gray-200">
                                <div className="flex justify-between items-center">
                                    <div className="text-lg text-gray-600">Итого к оплате:</div>
                                    <div className="text-3xl font-bold text-indigo-700">
                                        {formatCurrency(total)}
                                    </div>
                                </div>
                                <div className="flex justify-end space-x-4 mt-4">
                                    <button
                                        onClick={() => setCheckoutItems([])}
                                        className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                    >
                                        Отмена
                                    </button>
                                    <button className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                                        Оплатить
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Пустой чек */}
                    {checkoutItems.length === 0 && !searchQuery && (
                        <div className="p-8 text-center text-gray-400">
                            <p className="mb-2">В чеке пусто</p>
                            <p className="text-sm">Скан штрихкод или назовите товар</p>
                        </div>
                    )}
                </div>

                {/* История продаж */}
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                    <div className="p-6 border-b border-gray-200">
                        <h2 className="text-xl font-bold text-gray-800">История продаж</h2>
                    </div>
                    <div className="p-4">
                        {sales.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                Нет записей
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {sales.map((sale) => (
                                    <motion.div
                                        key={sale.id}
                                        layout
                                        className="bg-white rounded-lg shadow hover:shadow-md transition-shadow overflow-hidden"
                                    >
                                        <div className="p-4">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className="font-semibold text-indigo-700">#Счёт {sale.id}</div>
                                                    <div className="text-sm text-gray-500">
                                                        {format(parseISO(sale.createdAt.toISOString()), 'PPpp', { locale: ru })}
                                                    </div>
                                                </div>
                                                <div className="font-bold text-indigo-700">
                                                    {formatCurrency(sale.total)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="border-t border-gray-100 p-4">
                                            <div className="space-y-2">
                                                {sale.items.map((item) => (
                                                    <div key={item.id} className="flex justify-between text-sm">
                                                        <span className="truncate max-w-xs">{item.product.name}</span>
                                                        <span>{formatCurrency(getSellingPrice(item.product) * item.quantity)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
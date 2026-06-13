// 'use client';
//
// import { useState, useEffect, useMemo, useRef, KeyboardEvent } from 'react';
// import { motion, AnimatePresence } from 'framer-motion';
// import {
//     AiOutlineDelete,
//     AiOutlinePlus,
//     AiOutlineMinus,
//     AiOutlineScan,
//     AiOutlineSearch,
// } from 'react-icons/ai';
//
// type ProductId = string | number;
//
// type Product = {
//     id: ProductId;
//     name: string;
//     category?: string;
//     barcode?: string;
//     purchasePrice?: number | string;
//     purchase_price?: number | string;
//     sellingPrice?: number | string;
//     selling_price?: number | string;
//     unit?: 'piece' | 'weight' | string;
//     stock?: number | string;
//     minStock?: number | string;
//     min_stock?: number | string;
//     image?: string;
// };
//
// type CheckoutItem = {
//     product: Product;
//     id: string;
//     quantity: number;
// };
//
// type PaymentMethod = 'card' | 'cash';
//
// type ReceiptItem = {
//     productId: ProductId;
//     name: string;
//     barcode?: string;
//     category?: string;
//     unit?: string;
//     quantity: number;
//     price: number;
//     total: number;
// };
//
// type Receipt = {
//     id: string;
//     createdAt: string;
//     paymentMethod: PaymentMethod;
//     paymentLabel: string;
//     items: ReceiptItem[];
//     total: number;
//     receivedAmount?: number;
//     change?: number;
// };
//
// const SALES_STORAGE_KEY = 'online_sales_receipts';
//
// const safeParseNumber = (value: unknown): number => {
//     if (typeof value === 'number') {
//         return Number.isFinite(value) ? value : 0;
//     }
//
//     if (typeof value === 'string') {
//         const parsed = parseFloat(value.replace(',', '.').replace(/\s/g, ''));
//         return Number.isFinite(parsed) ? parsed : 0;
//     }
//
//     return 0;
// };
//
// const getSellingPrice = (product: Product): number => {
//     return safeParseNumber(product.sellingPrice ?? product.selling_price);
// };
//
// const getPurchasePrice = (product: Product): number => {
//     return safeParseNumber(product.purchasePrice ?? product.purchase_price);
// };
//
// const getStock = (product: Product): number => {
//     return safeParseNumber(product.stock);
// };
//
// const getMinStock = (product: Product): number => {
//     return safeParseNumber(product.minStock ?? product.min_stock);
// };
//
// const normalizeProduct = (product: Product): Product => {
//     return {
//         ...product,
//         sellingPrice: getSellingPrice(product),
//         purchasePrice: getPurchasePrice(product),
//         stock: getStock(product),
//         minStock: getMinStock(product),
//         unit: product.unit || 'piece',
//         category: product.category || 'Другое',
//         barcode: product.barcode || '',
//         image: product.image || '',
//     };
// };
//
// const formatCurrency = (amount: number | undefined | null): string => {
//     const safeAmount = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
//
//     return new Intl.NumberFormat('ru-RU', {
//         style: 'currency',
//         currency: 'RUB',
//         minimumFractionDigits: 2,
//         maximumFractionDigits: 2,
//     }).format(safeAmount);
// };
//
// const calculateTotal = (items: CheckoutItem[]): number => {
//     return items.reduce((sum, item) => {
//         return sum + getSellingPrice(item.product) * item.quantity;
//     }, 0);
// };
//
// const createReceiptId = (): string => {
//     const date = new Date();
//     const datePart = date.toISOString().slice(0, 10).replaceAll('-', '');
//     const timePart = String(date.getTime()).slice(-6);
//
//     return `${datePart}-${timePart}`;
// };
//
// const saveReceiptToSystem = (receipt: Receipt) => {
//     const raw = localStorage.getItem(SALES_STORAGE_KEY);
//     const previousReceipts: Receipt[] = raw ? JSON.parse(raw) : [];
//
//     localStorage.setItem(
//         SALES_STORAGE_KEY,
//         JSON.stringify([receipt, ...previousReceipts])
//     );
//
//     window.dispatchEvent(
//         new CustomEvent('online-sale-created', {
//             detail: receipt,
//         })
//     );
// };
//
// export default function PosPage() {
//     const [checkoutItems, setCheckoutItems] = useState<CheckoutItem[]>([]);
//     const [allProducts, setAllProducts] = useState<Product[]>([]);
//     const [searchQuery, setSearchQuery] = useState('');
//     const [categoryFilter, setCategoryFilter] = useState('');
//     const [stockFilter, setStockFilter] = useState<'all' | 'available' | 'low' | 'empty'>('all');
//     const [foundProducts, setFoundProducts] = useState<Product[]>([]);
//     const [isLoading, setIsLoading] = useState(false);
//     const [isPaying, setIsPaying] = useState(false);
//     const [error, setError] = useState<string | null>(null);
//     const [paymentModal, setPaymentModal] = useState<PaymentMethod | null>(null);
//     const [cashReceived, setCashReceived] = useState('');
//     const [lastReceipt, setLastReceipt] = useState<Receipt | null>(null);
//
//     const searchInputRef = useRef<HTMLInputElement>(null);
//
//     const total = calculateTotal(checkoutItems);
//     const cashReceivedNumber = safeParseNumber(cashReceived);
//     const change = cashReceivedNumber - total;
//
//     const categories = useMemo(() => {
//         const unique = Array.from(
//             new Set(
//                 allProducts
//                     .map(product => product.category)
//                     .filter(Boolean) as string[]
//             )
//         );
//
//         return unique.sort((a, b) => a.localeCompare(b));
//     }, [allProducts]);
//
//     const refreshProducts = async (): Promise<Product[]> => {
//         const response = await fetch('/api/products');
//
//         if (!response.ok) {
//             throw new Error('Не удалось загрузить товары');
//         }
//
//         const data: Product[] = await response.json();
//         const normalized = data.map(normalizeProduct);
//
//         setAllProducts(normalized);
//
//         return normalized;
//     };
//
//     useEffect(() => {
//         const fetchAllProducts = async () => {
//             try {
//                 setIsLoading(true);
//                 setError(null);
//                 await refreshProducts();
//             } catch (err) {
//                 console.error(err);
//                 setError('Ошибка загрузки товаров');
//             } finally {
//                 setIsLoading(false);
//             }
//         };
//
//         fetchAllProducts();
//     }, []);
//
//     useEffect(() => {
//         const query = searchQuery.trim().toLowerCase();
//
//         if (!query || !allProducts.length) {
//             setFoundProducts([]);
//             return;
//         }
//
//         const delayDebounce = setTimeout(() => {
//             const results = allProducts.filter(product => {
//                 const matchesSearch =
//                     product.name.toLowerCase().includes(query) ||
//                     String(product.barcode || '').toLowerCase().includes(query);
//
//                 const matchesCategory = categoryFilter
//                     ? product.category === categoryFilter
//                     : true;
//
//                 const stock = getStock(product);
//                 const minStock = getMinStock(product);
//
//                 const matchesStock =
//                     stockFilter === 'all'
//                         ? true
//                         : stockFilter === 'available'
//                             ? stock > 0
//                             : stockFilter === 'low'
//                                 ? stock > 0 && stock <= minStock
//                                 : stock === 0;
//
//                 return matchesSearch && matchesCategory && matchesStock;
//             });
//
//             setFoundProducts(results);
//         }, 250);
//
//         return () => clearTimeout(delayDebounce);
//     }, [searchQuery, allProducts, categoryFilter, stockFilter]);
//
//     const createSaleInDb = async (receipt: Receipt): Promise<Receipt> => {
//         const response = await fetch('/api/sales', {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json',
//             },
//             body: JSON.stringify(receipt),
//         })
//
//         const data = await response.json()
//
//         if (!response.ok) {
//             throw new Error(data.message || 'Не удалось сохранить чек')
//         }
//
//         return data
//     }
//
//     const addToCheckout = (product: Product) => {
//         const safeProduct = normalizeProduct(product);
//         const stock = getStock(safeProduct);
//
//         if (stock <= 0) {
//             setError(`Товар «${safeProduct.name}» отсутствует на остатке`);
//             return;
//         }
//
//         setCheckoutItems(prevItems => {
//             const existingItem = prevItems.find(item =>
//                 String(item.product.id) === String(safeProduct.id)
//             );
//
//             const currentQuantity = existingItem?.quantity || 0;
//
//             if (currentQuantity + 1 > stock) {
//                 setError(
//                     `Недостаточно остатка: «${safeProduct.name}». В наличии ${stock} шт.`
//                 );
//                 return prevItems;
//             }
//
//             setError(null);
//
//             if (existingItem) {
//                 return prevItems.map(item =>
//                     String(item.product.id) === String(safeProduct.id)
//                         ? { ...item, quantity: item.quantity + 1 }
//                         : item
//                 );
//             }
//
//             return [
//                 ...prevItems,
//                 {
//                     product: safeProduct,
//                     id: `${safeProduct.id}-${Date.now()}`,
//                     quantity: 1,
//                 },
//             ];
//         });
//
//         setSearchQuery('');
//         setFoundProducts([]);
//
//         requestAnimationFrame(() => {
//             searchInputRef.current?.focus();
//         });
//     };
//
//     const changeQuantity = (itemId: string, delta: number) => {
//         setCheckoutItems(prevItems => {
//             return prevItems
//                 .map(item => {
//                     if (item.id !== itemId) {
//                         return item;
//                     }
//
//                     const nextQuantity = item.quantity + delta;
//                     const stock = getStock(item.product);
//
//                     if (nextQuantity <= 0) {
//                         return item;
//                     }
//
//                     if (nextQuantity > stock) {
//                         setError(
//                             `Недостаточно остатка: «${item.product.name}». В наличии ${stock} шт.`
//                         );
//                         return item;
//                     }
//
//                     setError(null);
//
//                     return {
//                         ...item,
//                         quantity: nextQuantity,
//                     };
//                 });
//         });
//     };
//
//     const removeFromCheckout = (itemId: string) => {
//         setCheckoutItems(prev => prev.filter(item => item.id !== itemId));
//     };
//
//     const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
//         if (e.key !== 'Enter') {
//             return;
//         }
//
//         e.preventDefault();
//
//         const query = searchQuery.trim();
//
//         if (!query) {
//             return;
//         }
//
//         const exactBarcodeProduct = allProducts.find(product =>
//             String(product.barcode || '') === query
//         );
//
//         if (exactBarcodeProduct) {
//             addToCheckout(exactBarcodeProduct);
//             return;
//         }
//
//         if (foundProducts.length === 1) {
//             addToCheckout(foundProducts[0]);
//             return;
//         }
//
//         if (foundProducts.length > 1) {
//             setError('Найдено несколько товаров. Выберите нужный из списка');
//             return;
//         }
//
//         setError('Товар не найден в базе');
//     };
//
//     const openPayment = (method: PaymentMethod) => {
//         if (checkoutItems.length === 0) {
//             setError('Чек пустой. Добавьте товар перед оплатой');
//             return;
//         }
//
//         const stockError = checkoutItems.find(item => {
//             return item.quantity > getStock(item.product);
//         });
//
//         if (stockError) {
//             setError(
//                 `Недостаточно остатка: «${stockError.product.name}». В наличии ${getStock(stockError.product)} шт.`
//             );
//             return;
//         }
//
//         setError(null);
//         setCashReceived('');
//         setPaymentModal(method);
//     };
//
//     const updateProductStockInDb = async (product: Product, nextStock: number) => {
//         const response = await fetch(`/api/products/${product.id}`, {
//             method: 'PUT',
//             headers: {
//                 'Content-Type': 'application/json',
//             },
//             body: JSON.stringify({
//                 name: product.name,
//                 category: product.category || 'Другое',
//                 barcode: product.barcode || '',
//                 purchasePrice: getPurchasePrice(product),
//                 sellingPrice: getSellingPrice(product),
//                 unit: product.unit || 'piece',
//                 stock: nextStock,
//                 minStock: getMinStock(product),
//                 image: product.image || '',
//             }),
//         });
//
//         const data = await response.json();
//
//         if (!response.ok) {
//             throw new Error(data.message || `Не удалось обновить остаток товара «${product.name}»`);
//         }
//
//         return normalizeProduct(data);
//     };
//
//     const completePayment = async (method: PaymentMethod) => {
//         if (isPaying) {
//             return;
//         }
//
//         if (method === 'cash' && cashReceivedNumber < total) {
//             setError('Полученная сумма меньше суммы чека');
//             return;
//         }
//
//         try {
//             setIsPaying(true);
//             setError(null);
//
//             const freshProducts = await refreshProducts();
//
//             const validatedItems = checkoutItems.map(item => {
//                 const freshProduct = freshProducts.find(product =>
//                     String(product.id) === String(item.product.id)
//                 );
//
//                 if (!freshProduct) {
//                     throw new Error(`Товар «${item.product.name}» не найден в базе`);
//                 }
//
//                 const freshStock = getStock(freshProduct);
//
//                 if (freshStock < item.quantity) {
//                     throw new Error(
//                         `Недостаточно остатка: «${freshProduct.name}». В наличии ${freshStock} шт., в чеке ${item.quantity} шт.`
//                     );
//                 }
//
//                 return {
//                     ...item,
//                     product: freshProduct,
//                 };
//             });
//
//             const updatedProducts: Product[] = [];
//
//             for (const item of validatedItems) {
//                 const nextStock = getStock(item.product) - item.quantity;
//                 const updatedProduct = await updateProductStockInDb(item.product, nextStock);
//                 updatedProducts.push(updatedProduct);
//             }
//
//             const receiptItems: ReceiptItem[] = validatedItems.map(item => {
//                 const price = getSellingPrice(item.product);
//
//                 return {
//                     productId: item.product.id,
//                     name: item.product.name,
//                     barcode: item.product.barcode,
//                     category: item.product.category,
//                     unit: item.product.unit,
//                     quantity: item.quantity,
//                     price,
//                     total: price * item.quantity,
//                 };
//             });
//
//             const receiptTotal = receiptItems.reduce((sum, item) => sum + item.total, 0);
//
//             const receipt: Receipt = {
//                 id: createReceiptId(),
//                 createdAt: new Date().toISOString(),
//                 paymentMethod: method,
//                 paymentLabel: method === 'card' ? 'Карта' : 'Наличные',
//                 items: receiptItems,
//                 total: receiptTotal,
//                 receivedAmount: method === 'cash' ? cashReceivedNumber : receiptTotal,
//                 change: method === 'cash' ? cashReceivedNumber - receiptTotal : 0,
//             };
//
//             const savedReceipt = await createSaleInDb(receipt)
//
//             await refreshProducts()
//
//             setCheckoutItems([])
//             setPaymentModal(null)
//             setCashReceived('')
//             setLastReceipt(savedReceipt)
//
//             requestAnimationFrame(() => {
//                 searchInputRef.current?.focus();
//             });
//         } catch (err) {
//             console.error(err);
//             setError(err instanceof Error ? err.message : 'Ошибка оплаты');
//         } finally {
//             setIsPaying(false);
//         }
//     };
//
//     const clearReceipt = () => {
//         setLastReceipt(null);
//         setError(null);
//
//         requestAnimationFrame(() => {
//             searchInputRef.current?.focus();
//         });
//     };
//
//     return (
//         <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
//             <div className="max-w-5xl mx-auto">
//                 <h1 className="text-3xl font-bold text-indigo-800 mb-8 text-center">
//                     ТОЧКА онлайн - касса
//                 </h1>
//
//                 {error && (
//                     <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
//                         {error}
//                     </div>
//                 )}
//
//                 <div className="bg-white rounded-2xl shadow-xl overflow-hidden mb-8">
//                     <div className="p-6 border-b border-gray-200">
//                         <div className="grid grid-cols-1 gap-3 mb-4">
//                             <div className="relative">
//                                 <div className="absolute left-3 top-3 text-gray-400">
//                                     <AiOutlineScan size={25} />
//                                 </div>
//
//                                 <input
//                                     ref={searchInputRef}
//                                     type="text"
//                                     placeholder="Скан штрихкода или поиск товара..."
//                                     value={searchQuery}
//                                     onChange={(e) => setSearchQuery(e.target.value)}
//                                     onKeyDown={handleKeyDown}
//                                     autoFocus
//                                     className="w-full pl-10 pr-10 py-3 rounded-full border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
//                                 />
//
//                                 {searchQuery && (
//                                     <button
//                                         type="button"
//                                         onClick={() => {
//                                             setSearchQuery('');
//                                             setFoundProducts([]);
//                                             setError(null);
//                                         }}
//                                         className="absolute right-4 top-1.5 text-2xl text-gray-400 hover:text-gray-600"
//                                     >
//                                         ×
//                                     </button>
//                                 )}
//                             </div>
//                         </div>
//
//                         <div className="flex items-center gap-2 text-sm text-gray-500">
//                             <AiOutlineSearch />
//                             <span>
//                                 Enter добавляет товар. При сканировании штрихкода товар добавится, если найден точный ШК.
//                             </span>
//                         </div>
//                     </div>
//
//                     <AnimatePresence>
//                         {searchQuery && foundProducts.length === 0 && (
//                             <motion.div
//                                 initial={{ opacity: 0 }}
//                                 animate={{ opacity: 1 }}
//                                 exit={{ opacity: 0 }}
//                                 className="py-3 bg-gray-50 text-center text-gray-500"
//                             >
//                                 Товар не найден
//                             </motion.div>
//                         )}
//                     </AnimatePresence>
//
//                     <AnimatePresence>
//                         {foundProducts.length > 0 && searchQuery && (
//                             <motion.div
//                                 initial={{ opacity: 0, height: 0 }}
//                                 animate={{ opacity: 1, height: 'auto' }}
//                                 exit={{ opacity: 0, height: 0 }}
//                                 className="overflow-hidden border-t border-gray-200"
//                             >
//                                 <div className="p-4 space-y-2">
//                                     {foundProducts.map((product) => {
//                                         const stock = getStock(product);
//                                         const isEmpty = stock <= 0;
//
//                                         return (
//                                             <motion.div
//                                                 key={String(product.id)}
//                                                 whileHover={{ scale: isEmpty ? 1 : 1.01 }}
//                                                 className={`flex justify-between items-center p-3 rounded-lg shadow-sm transition-shadow ${
//                                                     isEmpty
//                                                         ? 'bg-red-50 cursor-not-allowed opacity-70'
//                                                         : 'bg-white hover:shadow-md cursor-pointer'
//                                                 }`}
//                                                 onClick={() => {
//                                                     if (!isEmpty) {
//                                                         addToCheckout(product);
//                                                     }
//                                                 }}
//                                             >
//                                                 <div className="flex-1 min-w-0">
//                                                     <div className="font-medium truncate">
//                                                         {product.name}
//                                                     </div>
//
//                                                     <div className="text-sm text-gray-500 truncate">
//                                                         {product.category || 'Без категории'}
//                                                         {product.barcode ? ` · ШК: ${product.barcode}` : ''}
//                                                     </div>
//
//                                                     <div className={`text-sm ${isEmpty ? 'text-red-600' : 'text-green-600'}`}>
//                                                         Остаток: {stock} {product.unit === 'weight' ? 'кг' : 'шт.'}
//                                                     </div>
//                                                 </div>
//
//                                                 <div className="font-bold min-w-[120px] text-right">
//                                                     {formatCurrency(getSellingPrice(product))}
//                                                 </div>
//
//                                                 <button
//                                                     type="button"
//                                                     disabled={isEmpty}
//                                                     onClick={(e) => {
//                                                         e.stopPropagation();
//
//                                                         if (!isEmpty) {
//                                                             addToCheckout(product);
//                                                         }
//                                                     }}
//                                                     className="ml-4 text-indigo-600 hover:text-indigo-800 text-lg disabled:text-gray-300"
//                                                 >
//                                                     +
//                                                 </button>
//                                             </motion.div>
//                                         );
//                                     })}
//                                 </div>
//                             </motion.div>
//                         )}
//                     </AnimatePresence>
//
//                     {checkoutItems.length > 0 && (
//                         <div className="p-4 border-t border-gray-100">
//                             <div className="space-y-2">
//                                 {checkoutItems.map((item) => {
//                                     const stock = getStock(item.product);
//
//                                     return (
//                                         <motion.div
//                                             key={item.id}
//                                             initial={{ opacity: 0, y: 10 }}
//                                             animate={{ opacity: 1, y: 0 }}
//                                             className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow"
//                                         >
//                                             <div className="flex-1 min-w-0">
//                                                 <div className="font-semibold truncate">
//                                                     {item.product.name}
//                                                 </div>
//
//                                                 <div className="text-sm text-gray-500">
//                                                     {formatCurrency(getSellingPrice(item.product))} × {item.quantity}
//                                                 </div>
//
//                                                 {item.product.barcode && (
//                                                     <div className="text-sm text-gray-500 truncate">
//                                                         ШК: {item.product.barcode}
//                                                     </div>
//                                                 )}
//
//                                                 <div className="text-sm text-gray-500">
//                                                     Остаток в БД: {stock} {item.product.unit === 'weight' ? 'кг' : 'шт.'}
//                                                 </div>
//                                             </div>
//
//                                             <div className="flex items-center space-x-4">
//                                                 <div className="flex items-center space-x-1">
//                                                     <button
//                                                         type="button"
//                                                         onClick={() => changeQuantity(item.id, -1)}
//                                                         className="p-1 text-gray-500 hover:text-indigo-600 rounded disabled:opacity-30"
//                                                         disabled={item.quantity <= 1}
//                                                     >
//                                                         <AiOutlineMinus />
//                                                     </button>
//
//                                                     <span className="font-medium w-8 text-center">
//                                                         {item.quantity}
//                                                     </span>
//
//                                                     <button
//                                                         type="button"
//                                                         onClick={() => changeQuantity(item.id, 1)}
//                                                         className="p-1 text-gray-500 hover:text-indigo-600 rounded disabled:opacity-30"
//                                                         disabled={item.quantity >= stock}
//                                                     >
//                                                         <AiOutlinePlus />
//                                                     </button>
//                                                 </div>
//
//                                                 <div className="font-bold text-lg min-w-[120px] text-right">
//                                                     {formatCurrency(getSellingPrice(item.product) * item.quantity)}
//                                                 </div>
//
//                                                 <button
//                                                     type="button"
//                                                     onClick={() => removeFromCheckout(item.id)}
//                                                     className="text-red-500 hover:text-red-700 ml-2"
//                                                 >
//                                                     <AiOutlineDelete size={20} />
//                                                 </button>
//                                             </div>
//                                         </motion.div>
//                                     );
//                                 })}
//                             </div>
//
//                             <div className="mt-6 pt-6 border-t border-gray-200">
//                                 <div className="flex justify-between items-center">
//                                     <div className="text-lg text-gray-600">
//                                         Итого к оплате:
//                                     </div>
//
//                                     <div className="text-3xl font-bold text-indigo-700">
//                                         {formatCurrency(total)}
//                                     </div>
//                                 </div>
//
//                                 <div className="flex flex-wrap justify-end gap-3 mt-5">
//                                     <button
//                                         type="button"
//                                         onClick={() => {
//                                             setCheckoutItems([]);
//                                             setError(null);
//                                         }}
//                                         className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
//                                     >
//                                         Отмена
//                                     </button>
//
//                                     <button
//                                         type="button"
//                                         onClick={() => openPayment('cash')}
//                                         className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
//                                     >
//                                         Наличные
//                                     </button>
//
//                                     <button
//                                         type="button"
//                                         onClick={() => openPayment('card')}
//                                         className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
//                                     >
//                                         Карта
//                                     </button>
//                                 </div>
//                             </div>
//                         </div>
//                     )}
//
//                     {checkoutItems.length === 0 && !searchQuery && (
//                         <div className="p-8 text-center text-gray-400">
//                             <p className="mb-2">
//                                 В чеке пусто
//                             </p>
//
//                             <p className="text-sm">
//                                 Сканируйте штрихкод или найдите товар по названию
//                             </p>
//                         </div>
//                     )}
//                 </div>
//
//                 {isLoading && (
//                     <div className="text-center text-gray-500">
//                         Загрузка товаров...
//                     </div>
//                 )}
//             </div>
//
//             <AnimatePresence>
//                 {paymentModal === 'card' && (
//                     <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
//                         <motion.div
//                             initial={{ opacity: 0, scale: 0.96 }}
//                             animate={{ opacity: 1, scale: 1 }}
//                             exit={{ opacity: 0, scale: 0.96 }}
//                             className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
//                         >
//                             <h2 className="text-2xl font-bold text-gray-800 mb-4">
//                                 Оплата картой
//                             </h2>
//
//                             <p className="text-gray-600 mb-2">
//                                 Введите на терминале сумму:
//                             </p>
//
//                             <div className="text-4xl font-bold text-indigo-700 mb-6">
//                                 {formatCurrency(total)}
//                             </div>
//
//                             <div className="rounded-xl bg-indigo-50 p-4 text-sm text-indigo-700 mb-6">
//                                 После успешной оплаты на терминале нажмите «Оплата прошла».
//                             </div>
//
//                             <div className="flex justify-end gap-3">
//                                 <button
//                                     type="button"
//                                     disabled={isPaying}
//                                     onClick={() => setPaymentModal(null)}
//                                     className="px-5 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
//                                 >
//                                     Отмена
//                                 </button>
//
//                                 <button
//                                     type="button"
//                                     disabled={isPaying}
//                                     onClick={() => completePayment('card')}
//                                     className="px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
//                                 >
//                                     {isPaying ? 'Провожу оплату...' : 'Оплата прошла'}
//                                 </button>
//                             </div>
//                         </motion.div>
//                     </div>
//                 )}
//
//                 {paymentModal === 'cash' && (
//                     <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
//                         <motion.div
//                             initial={{ opacity: 0, scale: 0.96 }}
//                             animate={{ opacity: 1, scale: 1 }}
//                             exit={{ opacity: 0, scale: 0.96 }}
//                             className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
//                         >
//                             <h2 className="text-2xl font-bold text-gray-800 mb-4">
//                                 Оплата наличными
//                             </h2>
//
//                             <div className="mb-4">
//                                 <div className="text-gray-600 mb-1">
//                                     Сумма чека:
//                                 </div>
//
//                                 <div className="text-3xl font-bold text-indigo-700">
//                                     {formatCurrency(total)}
//                                 </div>
//                             </div>
//
//                             <label className="block text-sm font-medium text-gray-700 mb-2">
//                                 Получено от клиента
//                             </label>
//
//                             <input
//                                 type="number"
//                                 value={cashReceived}
//                                 onChange={(e) => {
//                                     setCashReceived(e.target.value);
//                                     setError(null);
//                                 }}
//                                 placeholder="Введите сумму"
//                                 min="0"
//                                 step="0.01"
//                                 autoFocus
//                                 className="w-full rounded-xl border border-gray-300 px-4 py-3 text-xl outline-none focus:ring-2 focus:ring-emerald-500 mb-4"
//                             />
//
//                             <div className={`rounded-xl p-4 mb-6 ${
//                                 change >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
//                             }`}>
//                                 <div className="text-sm">
//                                     Сдача:
//                                 </div>
//
//                                 <div className="text-3xl font-bold">
//                                     {formatCurrency(Math.max(0, change))}
//                                 </div>
//
//                                 {cashReceived && change < 0 && (
//                                     <div className="text-sm mt-1">
//                                         Полученная сумма меньше суммы чека
//                                     </div>
//                                 )}
//                             </div>
//
//                             <div className="flex justify-end gap-3">
//                                 <button
//                                     type="button"
//                                     disabled={isPaying}
//                                     onClick={() => setPaymentModal(null)}
//                                     className="px-5 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
//                                 >
//                                     Отмена
//                                 </button>
//
//                                 <button
//                                     type="button"
//                                     disabled={isPaying || cashReceivedNumber < total}
//                                     onClick={() => completePayment('cash')}
//                                     className="px-5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
//                                 >
//                                     {isPaying ? 'Провожу оплату...' : 'Подтвердить оплату'}
//                                 </button>
//                             </div>
//                         </motion.div>
//                     </div>
//                 )}
//
//                 {lastReceipt && (
//                     <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
//                         <motion.div
//                             initial={{ opacity: 0, scale: 0.96 }}
//                             animate={{ opacity: 1, scale: 1 }}
//                             exit={{ opacity: 0, scale: 0.96 }}
//                             className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
//                         >
//                             <h2 className="text-2xl font-bold text-gray-800 mb-2">
//                                 Чек сформирован
//                             </h2>
//
//                             <div className="text-sm text-gray-500 mb-5">
//                                 № {lastReceipt.id} · {new Date(lastReceipt.createdAt).toLocaleString('ru-RU')}
//                             </div>
//
//                             <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
//                                 {lastReceipt.items.map((item) => (
//                                     <div key={`${item.productId}-${item.name}`} className="border-b pb-2">
//                                         <div className="font-medium text-gray-800">
//                                             {item.name}
//                                         </div>
//
//                                         <div className="flex justify-between text-sm text-gray-500">
//                                             <span>
//                                                 {formatCurrency(item.price)} × {item.quantity}
//                                             </span>
//
//                                             <span className="font-semibold text-gray-700">
//                                                 {formatCurrency(item.total)}
//                                             </span>
//                                         </div>
//                                     </div>
//                                 ))}
//                             </div>
//
//                             <div className="mt-5 border-t pt-4 space-y-2">
//                                 <div className="flex justify-between">
//                                     <span>Оплата:</span>
//                                     <span className="font-semibold">{lastReceipt.paymentLabel}</span>
//                                 </div>
//
//                                 <div className="flex justify-between text-xl font-bold">
//                                     <span>Итого:</span>
//                                     <span>{formatCurrency(lastReceipt.total)}</span>
//                                 </div>
//
//                                 {lastReceipt.paymentMethod === 'cash' && (
//                                     <>
//                                         <div className="flex justify-between">
//                                             <span>Получено:</span>
//                                             <span>{formatCurrency(lastReceipt.receivedAmount || 0)}</span>
//                                         </div>
//
//                                         <div className="flex justify-between">
//                                             <span>Сдача:</span>
//                                             <span>{formatCurrency(lastReceipt.change || 0)}</span>
//                                         </div>
//                                     </>
//                                 )}
//                             </div>
//
//                             <div className="mt-6 flex justify-end">
//                                 <button
//                                     type="button"
//                                     onClick={clearReceipt}
//                                     className="px-6 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
//                                 >
//                                     Новая продажа
//                                 </button>
//                             </div>
//                         </motion.div>
//                     </div>
//                 )}
//             </AnimatePresence>
//         </div>
//     );
// }


'use client';

import { useState, useEffect, useMemo, useRef, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AiOutlineDelete,
    AiOutlinePlus,
    AiOutlineMinus,
    AiOutlineScan,
    AiOutlineSearch,
} from 'react-icons/ai';

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

type CheckoutItem = {
    product: Product;
    id: string;
    quantity: number;
};

type PaymentMethod = 'card' | 'cash';

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

type Receipt = {
    id: string;
    createdAt: string;
    paymentMethod: PaymentMethod;
    paymentLabel: string;
    items: ReceiptItem[];
    total: number;
    receivedAmount?: number;
    change?: number;
};

type StockFilter = 'all' | 'available' | 'low' | 'empty';

type ApiError = {
    message?: string;
};

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

const formatCurrency = (amount: number | undefined | null): string => {
    const safeAmount = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;

    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(safeAmount);
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

export default function PosPage() {
    const [checkoutItems, setCheckoutItems] = useState<CheckoutItem[]>([]);
    const [allProducts, setAllProducts] = useState<Product[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [stockFilter, setStockFilter] = useState<StockFilter>('all');
    const [foundProducts, setFoundProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isPaying, setIsPaying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [paymentModal, setPaymentModal] = useState<PaymentMethod | null>(null);
    const [cashReceived, setCashReceived] = useState('');
    const [lastReceipt, setLastReceipt] = useState<Receipt | null>(null);

    const searchInputRef = useRef<HTMLInputElement>(null);

    const total = calculateTotal(checkoutItems);
    const cashReceivedNumber = safeParseNumber(cashReceived);
    const change = cashReceivedNumber - total;

    const categories = useMemo(() => {
        const unique = Array.from(
            new Set(
                allProducts
                    .map(product => product.category)
                    .filter(Boolean) as string[]
            )
        );

        return unique.sort((a, b) => a.localeCompare(b));
    }, [allProducts]);

    const refreshProducts = async (): Promise<Product[]> => {
        const response = await fetch('/api/products');

        if (!response.ok) {
            throw new Error('Не удалось загрузить товары');
        }

        const data: Product[] = await response.json();
        const normalized = data.map(normalizeProduct);

        setAllProducts(normalized);

        return normalized;
    };

    useEffect(() => {
        const fetchAllProducts = async () => {
            try {
                setIsLoading(true);
                setError(null);
                await refreshProducts();
            } catch (err) {
                console.error(err);
                setError('Ошибка загрузки товаров');
            } finally {
                setIsLoading(false);
            }
        };

        fetchAllProducts();
    }, []);

    useEffect(() => {
        const query = searchQuery.trim().toLowerCase();

        if (!query || !allProducts.length) {
            setFoundProducts([]);
            return;
        }

        const delayDebounce = setTimeout(() => {
            const results = allProducts.filter(product => {
                const matchesSearch =
                    product.name.toLowerCase().includes(query) ||
                    String(product.barcode || '').toLowerCase().includes(query);

                const matchesCategory = categoryFilter
                    ? product.category === categoryFilter
                    : true;

                const stock = getStock(product);
                const minStock = getMinStock(product);

                const matchesStock =
                    stockFilter === 'all'
                        ? true
                        : stockFilter === 'available'
                            ? stock > 0
                            : stockFilter === 'low'
                                ? stock > 0 && stock <= minStock
                                : stock === 0;

                return matchesSearch && matchesCategory && matchesStock;
            });

            setFoundProducts(results);
        }, 250);

        return () => clearTimeout(delayDebounce);
    }, [searchQuery, allProducts, categoryFilter, stockFilter]);

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

    const addToCheckout = (product: Product) => {
        const safeProduct = normalizeProduct(product);
        const stock = getStock(safeProduct);

        if (stock <= 0) {
            setError(`Товар «${safeProduct.name}» отсутствует на остатке`);
            return;
        }

        setCheckoutItems(prevItems => {
            const existingItem = prevItems.find(item =>
                String(item.product.id) === String(safeProduct.id)
            );

            const currentQuantity = existingItem?.quantity || 0;

            if (currentQuantity + 1 > stock) {
                setError(
                    `Недостаточно остатка: «${safeProduct.name}». В наличии ${stock} шт.`
                );
                return prevItems;
            }

            setError(null);

            if (existingItem) {
                return prevItems.map(item =>
                    String(item.product.id) === String(safeProduct.id)
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }

            return [
                ...prevItems,
                {
                    product: safeProduct,
                    id: `${safeProduct.id}-${Date.now()}`,
                    quantity: 1,
                },
            ];
        });

        setSearchQuery('');
        setFoundProducts([]);

        requestAnimationFrame(() => {
            searchInputRef.current?.focus();
        });
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
                        `Недостаточно остатка: «${item.product.name}». В наличии ${stock} шт.`
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

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter') {
            return;
        }

        e.preventDefault();

        const query = searchQuery.trim();

        if (!query) {
            return;
        }

        const exactBarcodeProduct = allProducts.find(product =>
            String(product.barcode || '') === query
        );

        if (exactBarcodeProduct) {
            addToCheckout(exactBarcodeProduct);
            return;
        }

        if (foundProducts.length === 1) {
            addToCheckout(foundProducts[0]);
            return;
        }

        if (foundProducts.length > 1) {
            setError('Найдено несколько товаров. Выберите нужный из списка');
            return;
        }

        setError('Товар не найден в базе');
    };

    const openPayment = (method: PaymentMethod) => {
        if (checkoutItems.length === 0) {
            setError('Чек пустой. Добавьте товар перед оплатой');
            return;
        }

        const stockError = checkoutItems.find(item => {
            return item.quantity > getStock(item.product);
        });

        if (stockError) {
            setError(
                `Недостаточно остатка: «${stockError.product.name}». В наличии ${getStock(stockError.product)} шт.`
            );
            return;
        }

        setError(null);
        setCashReceived('');
        setPaymentModal(method);
    };

    const completePayment = async (method: PaymentMethod) => {
        if (isPaying) {
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
                        `Недостаточно остатка: «${freshProduct.name}». В наличии ${freshStock} шт., в чеке ${item.quantity} шт.`
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

            const receipt: Receipt = {
                id: createReceiptId(),
                createdAt: new Date().toISOString(),
                paymentMethod: method,
                paymentLabel: method === 'card' ? 'Карта' : 'Наличные',
                items: receiptItems,
                total: receiptTotal,
                receivedAmount: method === 'cash' ? cashReceivedNumber : receiptTotal,
                change: method === 'cash' ? cashReceivedNumber - receiptTotal : 0,
            };

            const savedReceipt = await createSaleInDb(receipt);

            await refreshProducts();

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

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
            <div className="max-w-5xl mx-auto">
                <h1 className="text-3xl font-bold text-indigo-800 mb-8 text-center">
                    ТОЧКА онлайн - касса
                </h1>

                {error && (
                    <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                        {error}
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
                                Enter добавляет товар. При сканировании штрихкода товар добавится, если найден точный ШК.
                            </span>
                        </div>
                    </div>

                    <AnimatePresence>
                        {searchQuery && foundProducts.length === 0 && (
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
                                                        {product.barcode ? ` · ШК: ${product.barcode}` : ''}
                                                    </div>

                                                    <div className={`text-sm ${isEmpty ? 'text-red-600' : 'text-green-600'}`}>
                                                        Остаток: {stock} {product.unit === 'weight' ? 'кг' : 'шт.'}
                                                    </div>
                                                </div>

                                                <div className="font-bold min-w-[120px] text-right">
                                                    {formatCurrency(getSellingPrice(product))}
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
                                                    {formatCurrency(getSellingPrice(item.product))} × {item.quantity}
                                                </div>

                                                {item.product.barcode && (
                                                    <div className="text-sm text-gray-500 truncate">
                                                        ШК: {item.product.barcode}
                                                    </div>
                                                )}

                                                <div className="text-sm text-gray-500">
                                                    Остаток в БД: {stock} {item.product.unit === 'weight' ? 'кг' : 'шт.'}
                                                </div>
                                            </div>

                                            <div className="flex items-center space-x-4">
                                                <div className="flex items-center space-x-1">
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
                {paymentModal === 'card' && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
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
                                    onClick={() => completePayment('card')}
                                    className="px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    {isPaying ? 'Провожу оплату...' : 'Оплата прошла'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {paymentModal === 'cash' && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
                        >
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">
                                Оплата наличными
                            </h2>

                            <div className="mb-4">
                                <div className="text-gray-600 mb-1">
                                    Сумма чека:
                                </div>

                                <div className="text-3xl font-bold text-indigo-700">
                                    {formatCurrency(total)}
                                </div>
                            </div>

                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Получено от клиента
                            </label>

                            <input
                                type="number"
                                value={cashReceived}
                                onChange={(e) => {
                                    setCashReceived(e.target.value);
                                    setError(null);
                                }}
                                placeholder="Введите сумму"
                                min="0"
                                step="0.01"
                                autoFocus
                                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-xl outline-none focus:ring-2 focus:ring-emerald-500 mb-4"
                            />

                            <div className={`rounded-xl p-4 mb-6 ${
                                change >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                            }`}>
                                <div className="text-sm">
                                    Сдача:
                                </div>

                                <div className="text-3xl font-bold">
                                    {formatCurrency(Math.max(0, change))}
                                </div>

                                {cashReceived && change < 0 && (
                                    <div className="text-sm mt-1">
                                        Полученная сумма меньше суммы чека
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
                                    disabled={isPaying || cashReceivedNumber < total}
                                    onClick={() => completePayment('cash')}
                                    className="px-5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {isPaying ? 'Провожу оплату...' : 'Подтвердить оплату'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {lastReceipt && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
                        >
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">
                                Чек сформирован
                            </h2>

                            <div className="text-sm text-gray-500 mb-5">
                                № {lastReceipt.id} · {new Date(lastReceipt.createdAt).toLocaleString('ru-RU')}
                            </div>

                            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                                {lastReceipt.items.map((item, index) => (
                                    <div key={`${item.productId}-${index}`} className="border-b pb-2">
                                        <div className="font-medium text-gray-800">
                                            {item.name}
                                        </div>

                                        <div className="flex justify-between text-sm text-gray-500">
                                            <span>
                                                {formatCurrency(item.price)} × {item.quantity}
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
        </div>
    );
}
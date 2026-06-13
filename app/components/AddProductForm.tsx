// // // // components/AddProductForm.tsx
// // // 'use client'
// // //
// // // import { useState } from 'react'
// // // import CustomSelect from '../components/CustomSelect'
// // //
// // // interface ProductFormData {
// // //     name: string
// // //     category: string
// // //     barcode: string
// // //     purchasePrice: string
// // //     sellingPrice: string
// // //     unit: 'piece' | 'weight'
// // //     stock: string
// // //     minStock: string
// // // }
// // //
// // // interface AddProductFormProps {
// // //     onSave: (data: ProductFormData) => void
// // //     onCancel: () => void
// // //     initialData?: ProductFormData
// // // }
// // //
// // // const CATEGORIES = [
// // //     { value: '', label: 'Выберите категорию', disabled: true },
// // //     { value: 'Бакалея', label: 'Бакалея' },
// // //     { value: 'Алкоголь', label: 'Алкоголь' },
// // //     { value: 'Сигареты', label: 'Сигареты' },
// // //     { value: 'Молочные продукты', label: 'Молочные продукты' },
// // //     { value: 'Хлебобулочные изделия', label: 'Хлебобулочные изделия' },
// // //     { value: 'Мясо и птица', label: 'Мясо и птица' },
// // //     { value: 'Рыба и морепродукты', label: 'Рыба и морепродукты' },
// // //     { value: 'Овощи и фрукты', label: 'Овощи и фрукты' },
// // //     { value: 'Напитки', label: 'Напитки' },
// // //     { value: 'Кондитерские изделия', label: 'Кондитерские изделия' },
// // //     { value: 'Замороженные продукты', label: 'Замороженные продукты' },
// // //     { value: 'Консервы', label: 'Консервы' },
// // //     { value: 'Соусы и приправы', label: 'Соусы и приправы' },
// // //     { value: 'Чай и кофе', label: 'Чай и кофе' },
// // //     { value: 'Снэки', label: 'Снэки' },
// // //     { value: 'Бытовая химия', label: 'Бытовая химия' },
// // //     { value: 'Косметика и гигиена', label: 'Косметика и гигиена' },
// // //     { value: 'Товары для дома', label: 'Товары для дома' },
// // //     { value: 'Другое', label: 'Другое' }
// // // ]
// // //
// // // export default function AddProductForm({ onSave, onCancel }: AddProductFormProps) {
// // //     const [name, setName] = useState('')
// // //     const [category, setCategory] = useState('')
// // //     const [barcode, setBarcode] = useState('')
// // //     const [purchasePrice, setPurchasePrice] = useState('')
// // //     const [unit, setUnit] = useState<'piece' | 'weight'>('piece')
// // //     const [stock, setStock] = useState('0')
// // //     const [minStock, setMinStock] = useState('10')
// // //     const [errors, setErrors] = useState<Record<string, string>>({})
// // //
// // //     const calculateMarkup = (price: string, cat: string): string => {
// // //         const cost = parseFloat(price)
// // //         if (isNaN(cost) || cost <= 0) return ''
// // //
// // //         if (cat.toLowerCase().includes('пиво')) {
// // //             return (cost * 1.35).toFixed(2)
// // //         }
// // //
// // //         return (cost * 1.30).toFixed(2)
// // //     }
// // //
// // //     const sellingPrice = purchasePrice ? calculateMarkup(purchasePrice, category) : ''
// // //
// // //     const getMarkupLabel = (): string => {
// // //         if (category.toLowerCase().includes('пиво')) return '35%'
// // //         return '30%'
// // //     }
// // //
// // //     const formatBarcode = (value: string): string => {
// // //         const numbers = value.replace(/\D/g, '')
// // //         return numbers.slice(0, 14)
// // //     }
// // //
// // //     const validateEAN13 = (barcode: string): boolean => {
// // //         if (barcode.length !== 13) return false
// // //
// // //         const digits = barcode.split('').map(Number)
// // //         const checkDigit = digits.pop() || 0
// // //
// // //         const sum = digits.reduce((acc, digit, index) => {
// // //             return acc + (index % 2 === 0 ? digit : digit * 3)
// // //         }, 0)
// // //
// // //         const calculatedCheckDigit = (10 - (sum % 10)) % 10
// // //         return calculatedCheckDigit === checkDigit
// // //     }
// // //
// // //     const handleSubmit = (e: React.FormEvent) => {
// // //         e.preventDefault()
// // //
// // //         const newErrors: Record<string, string> = {}
// // //
// // //         if (!name.trim()) newErrors.name = 'Введите название товара'
// // //         if (!category) newErrors.category = 'Выберите категорию товара'
// // //
// // //         if (barcode && barcode.length > 0 && barcode.length < 8) {
// // //             newErrors.barcode = 'Штрихкод должен содержать от 8 до 14 цифр'
// // //         }
// // //
// // //         if (!purchasePrice || parseFloat(purchasePrice) <= 0) {
// // //             newErrors.purchasePrice = 'Введите корректную цену закупки'
// // //         }
// // //
// // //         if (Object.keys(newErrors).length > 0) {
// // //             setErrors(newErrors)
// // //             return
// // //         }
// // //
// // //         onSave({
// // //             name,
// // //             category,
// // //             barcode,
// // //             purchasePrice,
// // //             sellingPrice: sellingPrice || '0',
// // //             unit,
// // //             stock,
// // //             minStock
// // //         })
// // //     }
// // //
// // //     return (
// // //         <form onSubmit={handleSubmit} className="space-y-6">
// // //             {/* Название товара */}
// // //             <div>
// // //                 <label className="block text-sm font-medium text-gray-700 mb-2">
// // //                     Название товара *
// // //                 </label>
// // //                 <input
// // //                     type="text"
// // //                     value={name}
// // //                     onChange={(e) => {
// // //                         setName(e.target.value)
// // //                         if (errors.name) setErrors(prev => ({ ...prev, name: '' }))
// // //                     }}
// // //                     placeholder="Введите название товара"
// // //                     className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
// // //                         errors.name ? 'border-red-500' : 'border-gray-300'
// // //                     }`}
// // //                 />
// // //                 {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
// // //             </div>
// // //
// // //             {/* Категория товара */}
// // //             <div>
// // //                 <label className="block text-sm font-medium text-gray-700 mb-2">
// // //                     Категория товара *
// // //                 </label>
// // //                 <CustomSelect
// // //                     value={category}
// // //                     onChange={(value) => {
// // //                         setCategory(value)
// // //                         if (errors.category) setErrors(prev => ({ ...prev, category: '' }))
// // //                     }}
// // //                     options={CATEGORIES}
// // //                     placeholder="Выберите категорию"
// // //                     error={errors.category}
// // //                 />
// // //                 {errors.category && <p className="mt-1 text-sm text-red-500">{errors.category}</p>}
// // //
// // //                 {category === 'Алкоголь' && (
// // //                     <p className="mt-1 text-xs text-amber-600">
// // //                         🍺 Для категории "Алкоголь" доступна специальная наценка на пиво
// // //                     </p>
// // //                 )}
// // //                 {category === 'Сигареты' && (
// // //                     <p className="mt-1 text-xs text-gray-500">
// // //                         🚬 Для табачных изделий действуют особые правила продажи
// // //                     </p>
// // //                 )}
// // //                 {category === 'Молочные продукты' && (
// // //                     <p className="mt-1 text-xs text-blue-600">
// // //                         🥛 Скоропортящийся товар. Следите за сроками годности
// // //                     </p>
// // //                 )}
// // //             </div>
// // //
// // //             {/* Штрихкод товара */}
// // //             <div>
// // //                 <label className="block text-sm font-medium text-gray-700 mb-2">
// // //                     Штрихкод товара
// // //                     <span className="text-xs text-gray-500 ml-1">(EAN-13, UPC или другой формат)</span>
// // //                 </label>
// // //                 <div className="relative">
// // //                     <input
// // //                         type="text"
// // //                         value={barcode}
// // //                         onChange={(e) => {
// // //                             const formatted = formatBarcode(e.target.value)
// // //                             setBarcode(formatted)
// // //                             if (errors.barcode) setErrors(prev => ({ ...prev, barcode: '' }))
// // //                         }}
// // //                         placeholder="Например: 4601234567890"
// // //                         maxLength={14}
// // //                         className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${
// // //                             errors.barcode ? 'border-red-500' : 'border-gray-300'
// // //                         }`}
// // //                     />
// // //                     <svg
// // //                         className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
// // //                         fill="none"
// // //                         stroke="currentColor"
// // //                         viewBox="0 0 24 24"
// // //                     >
// // //                         <path
// // //                             strokeLinecap="round"
// // //                             strokeLinejoin="round"
// // //                             strokeWidth={1.5}
// // //                             d="M3 5h2M3 9h4M3 13h2M3 17h4M7 5h2M7 9h2M7 13h2M7 17h2M11 5h2M11 9h2M11 13h2M11 17h2M15 5h2M15 9h4M15 13h2M15 17h4M19 5h2M19 13h2"
// // //                         />
// // //                     </svg>
// // //                 </div>
// // //                 {errors.barcode && <p className="mt-1 text-sm text-red-500">{errors.barcode}</p>}
// // //                 {barcode && barcode.length === 13 && (
// // //                     <p className={`mt-1 text-xs ${validateEAN13(barcode) ? 'text-green-600' : 'text-orange-600'}`}>
// // //                         {validateEAN13(barcode)
// // //                             ? '✓ Штрихкод EAN-13 валиден'
// // //                             : '⚠ Контрольная цифра не совпадает'}
// // //                     </p>
// // //                 )}
// // //                 <p className="mt-1 text-xs text-gray-500">
// // //                     Введите цифры штрихкода (до 14 символов). Для автоматической генерации оставьте поле пустым.
// // //                 </p>
// // //             </div>
// // //
// // //             {/* Цены */}
// // //             <div className="grid grid-cols-2 gap-4">
// // //                 <div>
// // //                     <label className="block text-sm font-medium text-gray-700 mb-2">
// // //                         Цена в закупке (₽) *
// // //                     </label>
// // //                     <input
// // //                         type="number"
// // //                         value={purchasePrice}
// // //                         onChange={(e) => {
// // //                             setPurchasePrice(e.target.value)
// // //                             if (errors.purchasePrice) setErrors(prev => ({ ...prev, purchasePrice: '' }))
// // //                         }}
// // //                         placeholder="0.00"
// // //                         step="0.01"
// // //                         min="0"
// // //                         className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
// // //                             errors.purchasePrice ? 'border-red-500' : 'border-gray-300'
// // //                         }`}
// // //                     />
// // //                     {errors.purchasePrice && <p className="mt-1 text-sm text-red-500">{errors.purchasePrice}</p>}
// // //                 </div>
// // //
// // //                 <div>
// // //                     <label className="block text-sm font-medium text-gray-700 mb-2">
// // //                         Цена в продаже (₽)
// // //                         {purchasePrice && (
// // //                             <span className="text-xs text-gray-500 ml-1">
// // //                 (наценка {getMarkupLabel()})
// // //               </span>
// // //                         )}
// // //                     </label>
// // //                     <input
// // //                         type="number"
// // //                         value={sellingPrice}
// // //                         readOnly
// // //                         placeholder="Автоматический расчет"
// // //                         className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
// // //                     />
// // //                     {purchasePrice && sellingPrice && (
// // //                         <div className="mt-2 text-xs text-gray-500 bg-blue-50 p-2 rounded">
// // //                             <span className="font-semibold">Расчет:</span>{' '}
// // //                             {purchasePrice} ₽ × {getMarkupLabel() === '35%' ? '1.35' : '1.30'} = {sellingPrice} ₽
// // //                             {category.toLowerCase().includes('пиво') && (
// // //                                 <span className="block mt-1 text-amber-600">🍺 Для пива наценка 35%</span>
// // //                             )}
// // //                         </div>
// // //                     )}
// // //                 </div>
// // //             </div>
// // //
// // //             {/* Остатки */}
// // //             <div className="grid grid-cols-2 gap-4">
// // //                 <div>
// // //                     <label className="block text-sm font-medium text-gray-700 mb-2">
// // //                         Текущий остаток ({unit === 'weight' ? 'кг' : 'шт.'})
// // //                     </label>
// // //                     <input
// // //                         type="number"
// // //                         value={stock}
// // //                         onChange={(e) => setStock(e.target.value)}
// // //                         placeholder="0"
// // //                         step={unit === 'weight' ? '0.1' : '1'}
// // //                         min="0"
// // //                         className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
// // //                     />
// // //                 </div>
// // //
// // //                 <div>
// // //                     <label className="block text-sm font-medium text-gray-700 mb-2">
// // //                         Мин. остаток * ({unit === 'weight' ? 'кг' : 'шт.'})
// // //                     </label>
// // //                     <input
// // //                         type="number"
// // //                         value={minStock}
// // //                         onChange={(e) => setMinStock(e.target.value)}
// // //                         placeholder="10"
// // //                         step={unit === 'weight' ? '0.1' : '1'}
// // //                         min="1"
// // //                         className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
// // //                     />
// // //                     <p className="mt-1 text-xs text-gray-500">
// // //                         При достижении появится уведомление
// // //                     </p>
// // //                 </div>
// // //             </div>
// // //
// // //             {/* Единица измерения */}
// // //             <div>
// // //                 <label className="block text-sm font-medium text-gray-700 mb-2">
// // //                     Единица измерения *
// // //                 </label>
// // //                 <div className="flex gap-4">
// // //                     <label className="flex items-center gap-2 cursor-pointer">
// // //                         <input
// // //                             type="radio"
// // //                             name="unit"
// // //                             value="piece"
// // //                             checked={unit === 'piece'}
// // //                             onChange={() => setUnit('piece')}
// // //                             className="w-4 h-4 text-blue-600"
// // //                         />
// // //                         <span className="text-gray-700">Штучно</span>
// // //                     </label>
// // //
// // //                     <label className="flex items-center gap-2 cursor-pointer">
// // //                         <input
// // //                             type="radio"
// // //                             name="unit"
// // //                             value="weight"
// // //                             checked={unit === 'weight'}
// // //                             onChange={() => setUnit('weight')}
// // //                             className="w-4 h-4 text-blue-600"
// // //                         />
// // //                         <span className="text-gray-700">Весовой</span>
// // //                     </label>
// // //                 </div>
// // //             </div>
// // //
// // //             {/* Предпросмотр */}
// // //             {name && category && (
// // //                 <div className="bg-gray-50 p-4 rounded-lg">
// // //                     <h4 className="font-medium text-gray-700 mb-2">Предпросмотр:</h4>
// // //                     <div className="space-y-1 text-sm">
// // //                         <p><span className="text-gray-500">Название:</span> {name}</p>
// // //                         <p><span className="text-gray-500">Категория:</span> {category}</p>
// // //                         {barcode && <p><span className="text-gray-500">Штрихкод:</span> {barcode}</p>}
// // //                         <p><span className="text-gray-500">Закупка:</span> {purchasePrice} ₽</p>
// // //                         <p><span className="text-gray-500">Продажа:</span> {sellingPrice || '—'} ₽</p>
// // //                         <p><span className="text-gray-500">Тип:</span> {unit === 'piece' ? 'Штучный' : 'Весовой'}</p>
// // //                         <p><span className="text-gray-500">Остаток:</span> {stock} {unit === 'weight' ? 'кг' : 'шт.'}</p>
// // //                         <p><span className="text-gray-500">Мин. остаток:</span> {minStock} {unit === 'weight' ? 'кг' : 'шт.'}</p>
// // //                     </div>
// // //                 </div>
// // //             )}
// // //
// // //             {/* Кнопки */}
// // //             <div className="flex justify-end gap-3 pt-4 border-t">
// // //                 <button
// // //                     type="button"
// // //                     onClick={onCancel}
// // //                     className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
// // //                 >
// // //                     Отмена
// // //                 </button>
// // //                 <button
// // //                     type="submit"
// // //                     className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors z-100"
// // //                 >
// // //                     Добавить товар
// // //                 </button>
// // //             </div>
// // //         </form>
// // //     )
// // // }
// //
// //
// // // components/AddProductForm.tsx
// // 'use client'
// //
// // import { useState, useEffect } from 'react'
// // import CustomSelect from '../components/CustomSelect'
// //
// // interface ProductFormData {
// //     name: string
// //     category: string
// //     barcode: string
// //     purchasePrice: string
// //     sellingPrice: string
// //     unit: 'piece' | 'weight'
// //     stock: string
// //     minStock: string
// // }
// //
// // interface AddProductFormProps {
// //     onSave: (data: ProductFormData) => void
// //     onCancel: () => void
// //     initialData?: ProductFormData
// // }
// //
// // const CATEGORIES = [
// //     { value: '', label: 'Выберите категорию', disabled: true },
// //     { value: 'Бакалея', label: 'Бакалея' },
// //     { value: 'Алкоголь', label: 'Алкоголь' },
// //     { value: 'Сигареты', label: 'Сигареты' },
// //     { value: 'Молочные продукты', label: 'Молочные продукты' },
// //     { value: 'Хлебобулочные изделия', label: 'Хлебобулочные изделия' },
// //     { value: 'Мясо и птица', label: 'Мясо и птица' },
// //     { value: 'Рыба и морепродукты', label: 'Рыба и морепродукты' },
// //     { value: 'Овощи и фрукты', label: 'Овощи и фрукты' },
// //     { value: 'Напитки', label: 'Напитки' },
// //     { value: 'Кондитерские изделия', label: 'Кондитерские изделия' },
// //     { value: 'Замороженные продукты', label: 'Замороженные продукты' },
// //     { value: 'Консервы', label: 'Консервы' },
// //     { value: 'Соусы и приправы', label: 'Соусы и приправы' },
// //     { value: 'Чай и кофе', label: 'Чай и кофе' },
// //     { value: 'Снэки', label: 'Снэки' },
// //     { value: 'Бытовая химия', label: 'Бытовая химия' },
// //     { value: 'Косметика и гигиена', label: 'Косметика и гигиена' },
// //     { value: 'Товары для дома', label: 'Товары для дома' },
// //     { value: 'Другое', label: 'Другое' }
// // ]
// //
// // const defaultFormData: ProductFormData = {
// //     name: '',
// //     category: '',
// //     barcode: '',
// //     purchasePrice: '',
// //     sellingPrice: '',
// //     unit: 'piece',
// //     stock: '0',
// //     minStock: '10'
// // }
// //
// // export default function AddProductForm({ onSave, onCancel, initialData }: AddProductFormProps) {
// //     const [name, setName] = useState(initialData?.name || '')
// //     const [category, setCategory] = useState(initialData?.category || '')
// //     const [barcode, setBarcode] = useState(initialData?.barcode || '')
// //     const [purchasePrice, setPurchasePrice] = useState(initialData?.purchasePrice || '')
// //     const [unit, setUnit] = useState<'piece' | 'weight'>(initialData?.unit || 'piece')
// //     const [stock, setStock] = useState(initialData?.stock || '0')
// //     const [minStock, setMinStock] = useState(initialData?.minStock || '10')
// //     const [errors, setErrors] = useState<Record<string, string>>({})
// //
// //     // Синхронизируем состояние при изменении initialData
// //     useEffect(() => {
// //         if (initialData) {
// //             setName(initialData.name)
// //             setCategory(initialData.category)
// //             setBarcode(initialData.barcode)
// //             setPurchasePrice(initialData.purchasePrice)
// //             setUnit(initialData.unit)
// //             setStock(initialData.stock)
// //             setMinStock(initialData.minStock)
// //         }
// //     }, [initialData])
// //
// //     const calculateMarkup = (price: string, cat: string): string => {
// //         const cost = parseFloat(price)
// //         if (isNaN(cost) || cost <= 0) return ''
// //
// //         if (cat.toLowerCase().includes('пиво')) {
// //             return (cost * 1.35).toFixed(2)
// //         }
// //
// //         return (cost * 1.30).toFixed(2)
// //     }
// //
// //     const sellingPrice = purchasePrice ? calculateMarkup(purchasePrice, category) : ''
// //
// //     const getMarkupLabel = (): string => {
// //         if (category.toLowerCase().includes('пиво')) return '35%'
// //         return '30%'
// //     }
// //
// //     const formatBarcode = (value: string): string => {
// //         const numbers = value.replace(/\D/g, '')
// //         return numbers.slice(0, 14)
// //     }
// //
// //     const validateEAN13 = (barcode: string): boolean => {
// //         if (barcode.length !== 13) return false
// //
// //         const digits = barcode.split('').map(Number)
// //         const checkDigit = digits.pop() || 0
// //
// //         const sum = digits.reduce((acc, digit, index) => {
// //             return acc + (index % 2 === 0 ? digit : digit * 3)
// //         }, 0)
// //
// //         const calculatedCheckDigit = (10 - (sum % 10)) % 10
// //         return calculatedCheckDigit === checkDigit
// //     }
// //
// //     const handleSubmit = (e: React.FormEvent) => {
// //         e.preventDefault()
// //
// //         const newErrors: Record<string, string> = {}
// //
// //         if (!name.trim()) newErrors.name = 'Введите название товара'
// //         if (!category) newErrors.category = 'Выберите категорию товара'
// //
// //         if (barcode && barcode.length > 0 && barcode.length < 8) {
// //             newErrors.barcode = 'Штрихкод должен содержать от 8 до 14 цифр'
// //         }
// //
// //         if (!purchasePrice || parseFloat(purchasePrice) <= 0) {
// //             newErrors.purchasePrice = 'Введите корректную цену закупки'
// //         }
// //
// //         if (Object.keys(newErrors).length > 0) {
// //             setErrors(newErrors)
// //             return
// //         }
// //
// //         onSave({
// //             name,
// //             category,
// //             barcode,
// //             purchasePrice,
// //             sellingPrice: sellingPrice || '0',
// //             unit,
// //             stock,
// //             minStock
// //         })
// //     }
// //
// //     return (
// //         <form onSubmit={handleSubmit} className="space-y-6">
// //             {/* Название товара */}
// //             <div>
// //                 <label className="block text-sm font-medium text-gray-700 mb-2">
// //                     Название товара *
// //                 </label>
// //                 <input
// //                     type="text"
// //                     value={name}
// //                     onChange={(e) => {
// //                         setName(e.target.value)
// //                         if (errors.name) setErrors(prev => ({ ...prev, name: '' }))
// //                     }}
// //                     placeholder="Введите название товара"
// //                     className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
// //                         errors.name ? 'border-red-500' : 'border-gray-300'
// //                     }`}
// //                 />
// //                 {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
// //             </div>
// //
// //             {/* Категория товара */}
// //             <div>
// //                 <label className="block text-sm font-medium text-gray-700 mb-2">
// //                     Категория товара *
// //                 </label>
// //                 <CustomSelect
// //                     value={category}
// //                     onChange={(value) => {
// //                         setCategory(value)
// //                         if (errors.category) setErrors(prev => ({ ...prev, category: '' }))
// //                     }}
// //                     options={CATEGORIES}
// //                     placeholder="Выберите категорию"
// //                     error={errors.category}
// //                 />
// //                 {errors.category && <p className="mt-1 text-sm text-red-500">{errors.category}</p>}
// //
// //                 {category === 'Алкоголь' && (
// //                     <p className="mt-1 text-xs text-amber-600">
// //                         🍺 Для категории "Алкоголь" доступна специальная наценка на пиво
// //                     </p>
// //                 )}
// //                 {category === 'Сигареты' && (
// //                     <p className="mt-1 text-xs text-gray-500">
// //                         🚬 Для табачных изделий действуют особые правила продажи
// //                     </p>
// //                 )}
// //                 {category === 'Молочные продукты' && (
// //                     <p className="mt-1 text-xs text-blue-600">
// //                         🥛 Скоропортящийся товар. Следите за сроками годности
// //                     </p>
// //                 )}
// //             </div>
// //
// //             {/* Штрихкод товара */}
// //             <div>
// //                 <label className="block text-sm font-medium text-gray-700 mb-2">
// //                     Штрихкод товара
// //                     <span className="text-xs text-gray-500 ml-1">(EAN-13, UPC или другой формат)</span>
// //                 </label>
// //                 <div className="relative">
// //                     <input
// //                         type="text"
// //                         value={barcode}
// //                         onChange={(e) => {
// //                             const formatted = formatBarcode(e.target.value)
// //                             setBarcode(formatted)
// //                             if (errors.barcode) setErrors(prev => ({ ...prev, barcode: '' }))
// //                         }}
// //                         placeholder="Например: 4601234567890"
// //                         maxLength={14}
// //                         className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${
// //                             errors.barcode ? 'border-red-500' : 'border-gray-300'
// //                         }`}
// //                     />
// //                     <svg
// //                         className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
// //                         fill="none"
// //                         stroke="currentColor"
// //                         viewBox="0 0 24 24"
// //                     >
// //                         <path
// //                             strokeLinecap="round"
// //                             strokeLinejoin="round"
// //                             strokeWidth={1.5}
// //                             d="M3 5h2M3 9h4M3 13h2M3 17h4M7 5h2M7 9h2M7 13h2M7 17h2M11 5h2M11 9h2M11 13h2M11 17h2M15 5h2M15 9h4M15 13h2M15 17h4M19 5h2M19 13h2"
// //                         />
// //                     </svg>
// //                 </div>
// //                 {errors.barcode && <p className="mt-1 text-sm text-red-500">{errors.barcode}</p>}
// //                 {barcode && barcode.length === 13 && (
// //                     <p className={`mt-1 text-xs ${validateEAN13(barcode) ? 'text-green-600' : 'text-orange-600'}`}>
// //                         {validateEAN13(barcode)
// //                             ? '✓ Штрихкод EAN-13 валиден'
// //                             : '⚠ Контрольная цифра не совпадает'}
// //                     </p>
// //                 )}
// //                 <p className="mt-1 text-xs text-gray-500">
// //                     Введите цифры штрихкода (до 14 символов). Для автоматической генерации оставьте поле пустым.
// //                 </p>
// //             </div>
// //
// //             {/* Цены */}
// //             <div className="grid grid-cols-2 gap-4">
// //                 <div>
// //                     <label className="block text-sm font-medium text-gray-700 mb-2">
// //                         Цена в закупке (₽) *
// //                     </label>
// //                     <input
// //                         type="number"
// //                         value={purchasePrice}
// //                         onChange={(e) => {
// //                             setPurchasePrice(e.target.value)
// //                             if (errors.purchasePrice) setErrors(prev => ({ ...prev, purchasePrice: '' }))
// //                         }}
// //                         placeholder="0.00"
// //                         step="0.01"
// //                         min="0"
// //                         className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
// //                             errors.purchasePrice ? 'border-red-500' : 'border-gray-300'
// //                         }`}
// //                     />
// //                     {errors.purchasePrice && <p className="mt-1 text-sm text-red-500">{errors.purchasePrice}</p>}
// //                 </div>
// //
// //                 <div>
// //                     <label className="block text-sm font-medium text-gray-700 mb-2">
// //                         Цена в продаже (₽)
// //                         {purchasePrice && (
// //                             <span className="text-xs text-gray-500 ml-1">
// //                 (наценка {getMarkupLabel()})
// //               </span>
// //                         )}
// //                     </label>
// //                     <input
// //                         type="number"
// //                         value={sellingPrice}
// //                         readOnly
// //                         placeholder="Автоматический расчет"
// //                         className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
// //                     />
// //                     {purchasePrice && sellingPrice && (
// //                         <div className="mt-2 text-xs text-gray-500 bg-blue-50 p-2 rounded">
// //                             <span className="font-semibold">Расчет:</span>{' '}
// //                             {purchasePrice} ₽ × {getMarkupLabel() === '35%' ? '1.35' : '1.30'} = {sellingPrice} ₽
// //                             {category.toLowerCase().includes('пиво') && (
// //                                 <span className="block mt-1 text-amber-600">🍺 Для пива наценка 35%</span>
// //                             )}
// //                         </div>
// //                     )}
// //                 </div>
// //             </div>
// //
// //             {/* Остатки */}
// //             <div className="grid grid-cols-2 gap-4">
// //                 <div>
// //                     <label className="block text-sm font-medium text-gray-700 mb-2">
// //                         Текущий остаток ({unit === 'weight' ? 'кг' : 'шт.'})
// //                     </label>
// //                     <input
// //                         type="number"
// //                         value={stock}
// //                         onChange={(e) => setStock(e.target.value)}
// //                         placeholder="0"
// //                         step={unit === 'weight' ? '0.1' : '1'}
// //                         min="0"
// //                         className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
// //                     />
// //                 </div>
// //
// //                 <div>
// //                     <label className="block text-sm font-medium text-gray-700 mb-2">
// //                         Мин. остаток * ({unit === 'weight' ? 'кг' : 'шт.'})
// //                     </label>
// //                     <input
// //                         type="number"
// //                         value={minStock}
// //                         onChange={(e) => setMinStock(e.target.value)}
// //                         placeholder="10"
// //                         step={unit === 'weight' ? '0.1' : '1'}
// //                         min="1"
// //                         className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
// //                     />
// //                     <p className="mt-1 text-xs text-gray-500">
// //                         При достижении появится уведомление
// //                     </p>
// //                 </div>
// //             </div>
// //
// //             {/* Единица измерения */}
// //             <div>
// //                 <label className="block text-sm font-medium text-gray-700 mb-2">
// //                     Единица измерения *
// //                 </label>
// //                 <div className="flex gap-4">
// //                     <label className="flex items-center gap-2 cursor-pointer">
// //                         <input
// //                             type="radio"
// //                             name="unit"
// //                             value="piece"
// //                             checked={unit === 'piece'}
// //                             onChange={() => setUnit('piece')}
// //                             className="w-4 h-4 text-blue-600"
// //                         />
// //                         <span className="text-gray-700">Штучно</span>
// //                     </label>
// //
// //                     <label className="flex items-center gap-2 cursor-pointer">
// //                         <input
// //                             type="radio"
// //                             name="unit"
// //                             value="weight"
// //                             checked={unit === 'weight'}
// //                             onChange={() => setUnit('weight')}
// //                             className="w-4 h-4 text-blue-600"
// //                         />
// //                         <span className="text-gray-700">Весовой</span>
// //                     </label>
// //                 </div>
// //             </div>
// //
// //             {/* Предпросмотр */}
// //             {name && category && (
// //                 <div className="bg-gray-50 p-4 rounded-lg">
// //                     <h4 className="font-medium text-gray-700 mb-2">Предпросмотр:</h4>
// //                     <div className="space-y-1 text-sm">
// //                         <p><span className="text-gray-500">Название:</span> {name}</p>
// //                         <p><span className="text-gray-500">Категория:</span> {category}</p>
// //                         {barcode && <p><span className="text-gray-500">Штрихкод:</span> {barcode}</p>}
// //                         <p><span className="text-gray-500">Закупка:</span> {purchasePrice} ₽</p>
// //                         <p><span className="text-gray-500">Продажа:</span> {sellingPrice || '—'} ₽</p>
// //                         <p><span className="text-gray-500">Тип:</span> {unit === 'piece' ? 'Штучный' : 'Весовой'}</p>
// //                         <p><span className="text-gray-500">Остаток:</span> {stock} {unit === 'weight' ? 'кг' : 'шт.'}</p>
// //                         <p><span className="text-gray-500">Мин. остаток:</span> {minStock} {unit === 'weight' ? 'кг' : 'шт.'}</p>
// //                     </div>
// //                 </div>
// //             )}
// //
// //             {/* Кнопки */}
// //             <div className="flex justify-end gap-3 pt-4 border-t">
// //                 <button
// //                     type="button"
// //                     onClick={onCancel}
// //                     className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
// //                 >
// //                     Отмена
// //                 </button>
// //                 <button
// //                     type="submit"
// //                     className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
// //                 >
// //                     {initialData ? 'Сохранить изменения' : 'Добавить товар'}
// //                 </button>
// //             </div>
// //         </form>
// //     )
// // }
//
// // components/AddProductForm.tsx
// 'use client'
//
// import { useState, useEffect, useRef } from 'react'
// import CustomSelect from '../components/CustomSelect'
//
// interface ProductFormData {
//     name: string
//     category: string
//     barcode: string
//     purchasePrice: string
//     sellingPrice: string
//     unit: 'piece' | 'weight'
//     stock: string
//     minStock: string
//     image: string
// }
//
// interface AddProductFormProps {
//     onSave: (data: ProductFormData) => void
//     onCancel: () => void
//     initialData?: ProductFormData
// }
//
// const CATEGORIES = [
//     { value: '', label: 'Выберите категорию', disabled: true },
//     { value: 'Бакалея', label: 'Бакалея' },
//     { value: 'Алкоголь', label: 'Алкоголь' },
//     { value: 'Сигареты', label: 'Сигареты' },
//     { value: 'Молочные продукты', label: 'Молочные продукты' },
//     { value: 'Хлебобулочные изделия', label: 'Хлебобулочные изделия' },
//     { value: 'Мясо и птица', label: 'Мясо и птица' },
//     { value: 'Рыба и морепродукты', label: 'Рыба и морепродукты' },
//     { value: 'Овощи и фрукты', label: 'Овощи и фрукты' },
//     { value: 'Напитки', label: 'Напитки' },
//     { value: 'Кондитерские изделия', label: 'Кондитерские изделия' },
//     { value: 'Замороженные продукты', label: 'Замороженные продукты' },
//     { value: 'Консервы', label: 'Консервы' },
//     { value: 'Соусы и приправы', label: 'Соусы и приправы' },
//     { value: 'Чай и кофе', label: 'Чай и кофе' },
//     { value: 'Снэки', label: 'Снэки' },
//     { value: 'Бытовая химия', label: 'Бытовая химия' },
//     { value: 'Косметика и гигиена', label: 'Косметика и гигиена' },
//     { value: 'Товары для дома', label: 'Товары для дома' },
//     { value: 'Другое', label: 'Другое' }
// ]
//
// export default function AddProductForm({ onSave, onCancel, initialData }: AddProductFormProps) {
//     const [name, setName] = useState(initialData?.name || '')
//     const [category, setCategory] = useState(initialData?.category || '')
//     const [barcode, setBarcode] = useState(initialData?.barcode || '')
//     const [purchasePrice, setPurchasePrice] = useState(initialData?.purchasePrice || '')
//     const [unit, setUnit] = useState<'piece' | 'weight'>(initialData?.unit || 'piece')
//     const [stock, setStock] = useState(initialData?.stock || '0')
//     const [minStock, setMinStock] = useState(initialData?.minStock || '10')
//     const [image, setImage] = useState(initialData?.image || '')
//     const [imagePreview, setImagePreview] = useState(initialData?.image || '')
//     const [errors, setErrors] = useState<Record<string, string>>({})
//     const fileInputRef = useRef<HTMLInputElement>(null)
//
//     // Удали старый useEffect и замени на этот:
//     // Замени useEffect на этот:
//     useEffect(() => {
//         if (initialData) {
//             setName(initialData.name || '')
//             setCategory(initialData.category || '')
//             setBarcode(initialData.barcode || '')
//             setPurchasePrice(initialData.purchasePrice || '')
//             setUnit(initialData.unit || 'piece')
//             setStock(initialData.stock || '0')
//             setMinStock(initialData.minStock || '10')
//             setImage(initialData.image || '')
//             setImagePreview(initialData.image || '')
//         } else {
//             // Сброс при добавлении нового товара
//             setName('')
//             setCategory('')
//             setBarcode('')
//             setPurchasePrice('')
//             setUnit('piece')
//             setStock('0')
//             setMinStock('10')
//             setImage('')
//             setImagePreview('')
//         }
//     }, [initialData])
//
//     const calculateMarkup = (price: string, cat: string): string => {
//         const cost = parseFloat(price)
//         if (isNaN(cost) || cost <= 0) return ''
//
//         if (cat.toLowerCase().includes('пиво')) {
//             return (cost * 1.35).toFixed(2)
//         }
//
//         return (cost * 1.30).toFixed(2)
//     }
//
//     const sellingPrice = purchasePrice ? calculateMarkup(purchasePrice, category) : ''
//
//     const getMarkupLabel = (): string => {
//         if (category.toLowerCase().includes('пиво')) return '35%'
//         return '30%'
//     }
//
//     const formatBarcode = (value: string): string => {
//         const numbers = value.replace(/\D/g, '')
//         return numbers.slice(0, 14)
//     }
//
//     const validateEAN13 = (barcode: string): boolean => {
//         if (barcode.length !== 13) return false
//
//         const digits = barcode.split('').map(Number)
//         const checkDigit = digits.pop() || 0
//
//         const sum = digits.reduce((acc, digit, index) => {
//             return acc + (index % 2 === 0 ? digit : digit * 3)
//         }, 0)
//
//         const calculatedCheckDigit = (10 - (sum % 10)) % 10
//         return calculatedCheckDigit === checkDigit
//     }
//
//     const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//         const file = e.target.files?.[0]
//         if (file) {
//             // Проверка размера (макс 5MB)
//             if (file.size > 50 * 1024 * 1024) {
//                 setErrors(prev => ({ ...prev, image: 'Размер файла не должен превышать 50MB' }))
//                 return
//             }
//
//             // Проверка типа
//             if (!file.type.startsWith('image/')) {
//                 setErrors(prev => ({ ...prev, image: 'Выберите изображение' }))
//                 return
//             }
//
//             const reader = new FileReader()
//             reader.onloadend = () => {
//                 const base64 = reader.result as string
//                 setImage(base64)
//                 setImagePreview(base64)
//                 if (errors.image) setErrors(prev => ({ ...prev, image: '' }))
//             }
//             reader.readAsDataURL(file)
//         }
//     }
//
//     const handleRemoveImage = () => {
//         setImage('')
//         setImagePreview('')
//         if (fileInputRef.current) {
//             fileInputRef.current.value = ''
//         }
//     }
//
//     const handleSubmit = (e: React.FormEvent) => {
//         e.preventDefault()
//
//         const newErrors: Record<string, string> = {}
//
//         if (!name.trim()) newErrors.name = 'Введите название товара'
//         if (!category) newErrors.category = 'Выберите категорию товара'
//
//         if (barcode && barcode.length > 0 && barcode.length < 8) {
//             newErrors.barcode = 'Штрихкод должен содержать от 8 до 14 цифр'
//         }
//
//         if (!purchasePrice || parseFloat(purchasePrice) <= 0) {
//             newErrors.purchasePrice = 'Введите корректную цену закупки'
//         }
//
//         if (Object.keys(newErrors).length > 0) {
//             setErrors(newErrors)
//             return
//         }
//
//         onSave({
//             name,
//             category,
//             barcode,
//             purchasePrice,
//             sellingPrice: sellingPrice || '0',
//             unit,
//             stock,
//             minStock,
//             image: image || undefined
//         })
//     }
//
//     return (
//         <form onSubmit={handleSubmit} className="space-y-6">
//             {/* Изображение товара */}
//             <div>
//                 <label className="block text-sm font-medium text-gray-700 mb-2">
//                     Изображение товара
//                 </label>
//
//                 {imagePreview ? (
//                     <div className="relative w-full h-48 rounded-lg overflow-hidden bg-gray-100 mb-3">
//                         <img
//                             src={imagePreview}
//                             alt="Предпросмотр"
//                             className="w-full h-full object-cover"
//                         />
//                         <button
//                             type="button"
//                             onClick={handleRemoveImage}
//                             className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
//                         >
//                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
//                             </svg>
//                         </button>
//                     </div>
//                 ) : (
//                     <div
//                         onClick={() => fileInputRef.current?.click()}
//                         className="w-full h-48 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
//                     >
//                         <svg className="w-12 h-12 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
//                         </svg>
//                         <p className="text-sm text-gray-500">Нажмите для загрузки</p>
//                         <p className="text-xs text-gray-400 mt-1">PNG, JPG до 5MB</p>
//                     </div>
//                 )}
//
//                 <input
//                     ref={fileInputRef}
//                     type="file"
//                     accept="image/*"
//                     onChange={handleImageChange}
//                     className="hidden"
//                 />
//
//                 {imagePreview && (
//                     <button
//                         type="button"
//                         onClick={() => fileInputRef.current?.click()}
//                         className="text-sm text-blue-600 hover:text-blue-700 font-medium"
//                     >
//                         Изменить изображение
//                     </button>
//                 )}
//
//                 {errors.image && <p className="mt-1 text-sm text-red-500">{errors.image}</p>}
//             </div>
//
//             {/* Название товара */}
//             <div>
//                 <label className="block text-sm font-medium text-gray-700 mb-2">
//                     Название товара *
//                 </label>
//                 <input
//                     type="text"
//                     value={name}
//                     onChange={(e) => {
//                         setName(e.target.value)
//                         if (errors.name) setErrors(prev => ({ ...prev, name: '' }))
//                     }}
//                     placeholder="Введите название товара"
//                     className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
//                         errors.name ? 'border-red-500' : 'border-gray-300'
//                     }`}
//                 />
//                 {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
//             </div>
//
//             {/* Категория товара */}
//             <div>
//                 <label className="block text-sm font-medium text-gray-700 mb-2">
//                     Категория товара *
//                 </label>
//                 <CustomSelect
//                     value={category}
//                     onChange={(value) => {
//                         setCategory(value)
//                         if (errors.category) setErrors(prev => ({ ...prev, category: '' }))
//                     }}
//                     options={CATEGORIES}
//                     placeholder="Выберите категорию"
//                     error={errors.category}
//                 />
//                 {errors.category && <p className="mt-1 text-sm text-red-500">{errors.category}</p>}
//
//                 {category === 'Алкоголь' && (
//                     <p className="mt-1 text-xs text-amber-600">
//                         🍺 Для категории "Алкоголь" доступна специальная наценка на пиво
//                     </p>
//                 )}
//                 {category === 'Сигареты' && (
//                     <p className="mt-1 text-xs text-gray-500">
//                         🚬 Для табачных изделий действуют особые правила продажи
//                     </p>
//                 )}
//                 {category === 'Молочные продукты' && (
//                     <p className="mt-1 text-xs text-blue-600">
//                         🥛 Скоропортящийся товар. Следите за сроками годности
//                     </p>
//                 )}
//             </div>
//
//             {/* Штрихкод товара */}
//             <div>
//                 <label className="block text-sm font-medium text-gray-700 mb-2">
//                     Штрихкод товара
//                     <span className="text-xs text-gray-500 ml-1">(EAN-13, UPC или другой формат)</span>
//                 </label>
//                 <div className="relative">
//                     <input
//                         type="text"
//                         value={barcode}
//                         onChange={(e) => {
//                             const formatted = formatBarcode(e.target.value)
//                             setBarcode(formatted)
//                             if (errors.barcode) setErrors(prev => ({ ...prev, barcode: '' }))
//                         }}
//                         placeholder="Например: 4601234567890"
//                         maxLength={14}
//                         className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${
//                             errors.barcode ? 'border-red-500' : 'border-gray-300'
//                         }`}
//                     />
//                     <svg
//                         className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
//                         fill="none"
//                         stroke="currentColor"
//                         viewBox="0 0 24 24"
//                     >
//                         <path
//                             strokeLinecap="round"
//                             strokeLinejoin="round"
//                             strokeWidth={1.5}
//                             d="M3 5h2M3 9h4M3 13h2M3 17h4M7 5h2M7 9h2M7 13h2M7 17h2M11 5h2M11 9h2M11 13h2M11 17h2M15 5h2M15 9h4M15 13h2M15 17h4M19 5h2M19 13h2"
//                         />
//                     </svg>
//                 </div>
//                 {errors.barcode && <p className="mt-1 text-sm text-red-500">{errors.barcode}</p>}
//                 {barcode && barcode.length === 13 && (
//                     <p className={`mt-1 text-xs ${validateEAN13(barcode) ? 'text-green-600' : 'text-orange-600'}`}>
//                         {validateEAN13(barcode)
//                             ? '✓ Штрихкод EAN-13 валиден'
//                             : '⚠ Контрольная цифра не совпадает'}
//                     </p>
//                 )}
//                 <p className="mt-1 text-xs text-gray-500">
//                     Введите цифры штрихкода (до 14 символов). Для автоматической генерации оставьте поле пустым.
//                 </p>
//             </div>
//
//             {/* Цены */}
//             <div className="grid grid-cols-2 gap-4">
//                 <div>
//                     <label className="block text-sm font-medium text-gray-700 mb-2">
//                         Цена в закупке (₽) *
//                     </label>
//                     <input
//                         type="number"
//                         value={purchasePrice}
//                         onChange={(e) => {
//                             setPurchasePrice(e.target.value)
//                             if (errors.purchasePrice) setErrors(prev => ({ ...prev, purchasePrice: '' }))
//                         }}
//                         placeholder="0.00"
//                         step="0.01"
//                         min="0"
//                         className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
//                             errors.purchasePrice ? 'border-red-500' : 'border-gray-300'
//                         }`}
//                     />
//                     {errors.purchasePrice && <p className="mt-1 text-sm text-red-500">{errors.purchasePrice}</p>}
//                 </div>
//
//                 <div>
//                     <label className="block text-sm font-medium text-gray-700 mb-2">
//                         Цена в продаже (₽)
//                         {purchasePrice && (
//                             <span className="text-xs text-gray-500 ml-1">
//                 (наценка {getMarkupLabel()})
//               </span>
//                         )}
//                     </label>
//                     <input
//                         type="number"
//                         value={sellingPrice}
//                         readOnly
//                         placeholder="Автоматический расчет"
//                         className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
//                     />
//                     {purchasePrice && sellingPrice && (
//                         <div className="mt-2 text-xs text-gray-500 bg-blue-50 p-2 rounded">
//                             <span className="font-semibold">Расчет:</span>{' '}
//                             {purchasePrice} ₽ × {getMarkupLabel() === '35%' ? '1.35' : '1.30'} = {sellingPrice} ₽
//                             {category.toLowerCase().includes('пиво') && (
//                                 <span className="block mt-1 text-amber-600">🍺 Для пива наценка 35%</span>
//                             )}
//                         </div>
//                     )}
//                 </div>
//             </div>
//
//             {/* Остатки */}
//             <div className="grid grid-cols-2 gap-4">
//                 <div>
//                     <label className="block text-sm font-medium text-gray-700 mb-2">
//                         Текущий остаток ({unit === 'weight' ? 'кг' : 'шт.'})
//                     </label>
//                     <input
//                         type="number"
//                         value={stock}
//                         onChange={(e) => setStock(e.target.value)}
//                         placeholder="0"
//                         step={unit === 'weight' ? '0.1' : '1'}
//                         min="0"
//                         className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
//                     />
//                 </div>
//
//                 <div>
//                     <label className="block text-sm font-medium text-gray-700 mb-2">
//                         Мин. остаток * ({unit === 'weight' ? 'кг' : 'шт.'})
//                     </label>
//                     <input
//                         type="number"
//                         value={minStock}
//                         onChange={(e) => setMinStock(e.target.value)}
//                         placeholder="10"
//                         step={unit === 'weight' ? '0.1' : '1'}
//                         min="1"
//                         className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
//                     />
//                     <p className="mt-1 text-xs text-gray-500">
//                         При достижении появится уведомление
//                     </p>
//                 </div>
//             </div>
//
//             {/* Единица измерения */}
//             <div>
//                 <label className="block text-sm font-medium text-gray-700 mb-2">
//                     Единица измерения *
//                 </label>
//                 <div className="flex gap-4">
//                     <label className="flex items-center gap-2 cursor-pointer">
//                         <input
//                             type="radio"
//                             name="unit"
//                             value="piece"
//                             checked={unit === 'piece'}
//                             onChange={() => setUnit('piece')}
//                             className="w-4 h-4 text-blue-600"
//                         />
//                         <span className="text-gray-700">Штучно</span>
//                     </label>
//
//                     <label className="flex items-center gap-2 cursor-pointer">
//                         <input
//                             type="radio"
//                             name="unit"
//                             value="weight"
//                             checked={unit === 'weight'}
//                             onChange={() => setUnit('weight')}
//                             className="w-4 h-4 text-blue-600"
//                         />
//                         <span className="text-gray-700">Весовой</span>
//                     </label>
//                 </div>
//             </div>
//
//             {/* Предпросмотр */}
//             {name && category && (
//                 <div className="bg-gray-50 p-4 rounded-lg">
//                     <h4 className="font-medium text-gray-700 mb-2">Предпросмотр:</h4>
//                     <div className="space-y-1 text-sm">
//                         {imagePreview && (
//                             <div className="mb-2 w-20 h-20 rounded overflow-hidden">
//                                 <img src={imagePreview} alt={name} className="w-full h-full object-cover" />
//                             </div>
//                         )}
//                         <p><span className="text-gray-500">Название:</span> {name}</p>
//                         <p><span className="text-gray-500">Категория:</span> {category}</p>
//                         {barcode && <p><span className="text-gray-500">Штрихкод:</span> {barcode}</p>}
//                         <p><span className="text-gray-500">Закупка:</span> {purchasePrice} ₽</p>
//                         <p><span className="text-gray-500">Продажа:</span> {sellingPrice || '—'} ₽</p>
//                         <p><span className="text-gray-500">Тип:</span> {unit === 'piece' ? 'Штучный' : 'Весовой'}</p>
//                         <p><span className="text-gray-500">Остаток:</span> {stock} {unit === 'weight' ? 'кг' : 'шт.'}</p>
//                         <p><span className="text-gray-500">Мин. остаток:</span> {minStock} {unit === 'weight' ? 'кг' : 'шт.'}</p>
//                     </div>
//                 </div>
//             )}
//
//             {/* Кнопки */}
//             <div className="flex justify-end gap-3 pt-4 border-t">
//                 <button
//                     type="button"
//                     onClick={onCancel}
//                     className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
//                 >
//                     Отмена
//                 </button>
//                 <button
//                     type="submit"
//                     className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
//                 >
//                     {initialData ? 'Сохранить изменения' : 'Добавить товар'}
//                 </button>
//             </div>
//         </form>
//     )
// }


// Все что выше оно работает просто сохрянял разные версии на случай поломки

// components/AddProductForm.tsx
'use client'

import { useState, useRef, useCallback } from 'react'
import CustomSelect from '../components/CustomSelect'
import { ProductFormData } from '@/types/product'

interface AddProductFormProps {
    onSave: (data: ProductFormData) => void
    onCancel: () => void
    initialData?: ProductFormData
}

const CATEGORIES = [
    { value: '', label: 'Выберите категорию', disabled: true },
    { value: 'Бакалея', label: 'Бакалея' },
    { value: 'Алкоголь', label: 'Алкоголь' },
    { value: 'Сигареты', label: 'Сигареты' },
    { value: 'Молочные продукты', label: 'Молочные продукты' },
    { value: 'Хлебобулочные изделия', label: 'Хлебобулочные изделия' },
    { value: 'Мясо и птица', label: 'Мясо и птица' },
    { value: 'Рыба и морепродукты', label: 'Рыба и морепродукты' },
    { value: 'Овощи и фрукты', label: 'Овощи и фрукты' },
    { value: 'Напитки', label: 'Напитки' },
    { value: 'Кондитерские изделия', label: 'Кондитерские изделия' },
    { value: 'Замороженные продукты', label: 'Замороженные продукты' },
    { value: 'Консервы', label: 'Консервы' },
    { value: 'Соусы и приправы', label: 'Соусы и приправы' },
    { value: 'Чай и кофе', label: 'Чай и кофе' },
    { value: 'Снэки', label: 'Снэки' },
    { value: 'Бытовая химия', label: 'Бытовая химия' },
    { value: 'Косметика и гигиена', label: 'Косметика и гигиена' },
    { value: 'Товары для дома', label: 'Товары для дома' },
    { value: 'Другое', label: 'Другое' }
]

const getInitialState = (data?: ProductFormData) => ({
    name: data?.name || '',
    category: data?.category || '',
    barcode: data?.barcode || '',
    purchasePrice: data?.purchasePrice || '',
    unit: data?.unit || 'piece' as 'piece' | 'weight',
    stock: data?.stock || '0',
    minStock: data?.minStock || '10',
    image: data?.image || '',
})

export default function AddProductForm({ onSave, onCancel, initialData }: AddProductFormProps) {
    const [formState, setFormState] = useState(() => getInitialState(initialData))
    const [errors, setErrors] = useState<Record<string, string>>({})
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [formKey, setFormKey] = useState(0)

    // Проверяем, изменились ли initialData, и если да — сбрасываем форму
    const currentInitialJson = JSON.stringify(initialData)
    const prevInitialJson = useRef(currentInitialJson)

    if (prevInitialJson.current !== currentInitialJson) {
        prevInitialJson.current = currentInitialJson
        setFormState(getInitialState(initialData))
        setFormKey(prev => prev + 1)
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    const updateField = useCallback((field: string, value: any) => {
        setFormState(prev => ({ ...prev, [field]: value }))
        if (errors[field]) {
            setErrors(prev => {
                const next = { ...prev }
                delete next[field]
                return next
            })
        }
    }, [errors])

    const calculateMarkup = (price: string, cat: string): string => {
        const cost = parseFloat(price)
        if (isNaN(cost) || cost <= 0) return ''
        if (cat.toLowerCase().includes('пиво')) return (cost * 1.35).toFixed(2)
        return (cost * 1.30).toFixed(2)
    }

    const sellingPrice = formState.purchasePrice ? calculateMarkup(formState.purchasePrice, formState.category) : ''

    const getMarkupLabel = (): string => {
        if (formState.category.toLowerCase().includes('пиво')) return '35%'
        return '30%'
    }

    const formatBarcode = (value: string): string => {
        const numbers = value.replace(/\D/g, '')
        return numbers.slice(0, 14)
    }

    const validateEAN13 = (barcode: string): boolean => {
        if (barcode.length !== 13) return false
        const digits = barcode.split('').map(Number)
        const checkDigit = digits.pop() || 0
        const sum = digits.reduce((acc, digit, index) => {
            return acc + (index % 2 === 0 ? digit : digit * 3)
        }, 0)
        const calculatedCheckDigit = (10 - (sum % 10)) % 10
        return calculatedCheckDigit === checkDigit
    }

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                setErrors(prev => ({ ...prev, image: 'Размер файла не должен превышать 5MB' }))
                return
            }
            if (!file.type.startsWith('image/')) {
                setErrors(prev => ({ ...prev, image: 'Выберите изображение' }))
                return
            }
            const reader = new FileReader()
            reader.onloadend = () => {
                const base64 = reader.result as string
                updateField('image', base64)
            }
            reader.readAsDataURL(file)
        }
    }

    const handleRemoveImage = () => {
        updateField('image', '')
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        const newErrors: Record<string, string> = {}

        if (!formState.name.trim()) newErrors.name = 'Введите название товара'
        if (!formState.category) newErrors.category = 'Выберите категорию товара'
        if (formState.barcode && formState.barcode.length > 0 && formState.barcode.length < 8) {
            newErrors.barcode = 'Штрихкод должен содержать от 8 до 14 цифр'
        }
        if (!formState.purchasePrice || parseFloat(formState.purchasePrice) <= 0) {
            newErrors.purchasePrice = 'Введите корректную цену закупки'
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors)
            return
        }

        onSave({
            name: formState.name,
            category: formState.category,
            barcode: formState.barcode,
            purchasePrice: formState.purchasePrice,
            sellingPrice: sellingPrice || '0',
            unit: formState.unit,
            stock: formState.stock,
            minStock: formState.minStock,
            image: formState.image
        })
    }

    return (
        <form key={formKey} onSubmit={handleSubmit} className="space-y-6">
            {/* Изображение товара */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Изображение товара
                </label>

                {formState.image ? (
                    <div className="relative w-full h-48 rounded-lg overflow-hidden bg-gray-100 mb-3">
                        <img
                            src={formState.image}
                            alt="Предпросмотр"
                            className="w-full h-full object-cover"
                        />
                        <button
                            type="button"
                            onClick={handleRemoveImage}
                            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                ) : (
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full h-48 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
                    >
                        <svg className="w-12 h-12 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="text-sm text-gray-500">Нажмите для загрузки</p>
                        <p className="text-xs text-gray-400 mt-1">PNG, JPG до 5MB</p>
                    </div>
                )}

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                />

                {formState.image && (
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                        Изменить изображение
                    </button>
                )}

                {errors.image && <p className="mt-1 text-sm text-red-500">{errors.image}</p>}
            </div>

            {/* Название товара */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Название товара *
                </label>
                <input
                    type="text"
                    value={formState.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="Введите название товара"
                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.name ? 'border-red-500' : 'border-gray-300'
                    }`}
                />
                {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
            </div>

            {/* Категория товара */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Категория товара *
                </label>
                <CustomSelect
                    value={formState.category}
                    onChange={(value) => updateField('category', value)}
                    options={CATEGORIES}
                    placeholder="Выберите категорию"
                    error={errors.category}
                />
                {errors.category && <p className="mt-1 text-sm text-red-500">{errors.category}</p>}
            </div>

            {/* Штрихкод товара */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Штрихкод товара
                    <span className="text-xs text-gray-500 ml-1">(EAN-13, UPC или другой формат)</span>
                </label>
                <div className="relative">
                    <input
                        type="text"
                        value={formState.barcode}
                        onChange={(e) => {
                            const formatted = formatBarcode(e.target.value)
                            updateField('barcode', formatted)
                        }}
                        placeholder="Например: 4601234567890"
                        maxLength={14}
                        className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${
                            errors.barcode ? 'border-red-500' : 'border-gray-300'
                        }`}
                    />
                    <svg
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M3 5h2M3 9h4M3 13h2M3 17h4M7 5h2M7 9h2M7 13h2M7 17h2M11 5h2M11 9h2M11 13h2M11 17h2M15 5h2M15 9h4M15 13h2M15 17h4M19 5h2M19 13h2"
                        />
                    </svg>
                </div>
                {errors.barcode && <p className="mt-1 text-sm text-red-500">{errors.barcode}</p>}
            </div>

            {/* Цены */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Цена в закупке (₽) *
                    </label>
                    <input
                        type="number"
                        value={formState.purchasePrice}
                        onChange={(e) => updateField('purchasePrice', e.target.value)}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            errors.purchasePrice ? 'border-red-500' : 'border-gray-300'
                        }`}
                    />
                    {errors.purchasePrice && <p className="mt-1 text-sm text-red-500">{errors.purchasePrice}</p>}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Цена в продаже (₽)
                        {formState.purchasePrice && (
                            <span className="text-xs text-gray-500 ml-1">(наценка {getMarkupLabel()})</span>
                        )}
                    </label>
                    <input
                        type="number"
                        value={sellingPrice}
                        readOnly
                        placeholder="Автоматический расчет"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                    />
                </div>
            </div>

            {/* Остатки */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Текущий остаток ({formState.unit === 'weight' ? 'кг' : 'шт.'})
                    </label>
                    <input
                        type="number"
                        value={formState.stock}
                        onChange={(e) => updateField('stock', e.target.value)}
                        placeholder="0"
                        step={formState.unit === 'weight' ? '0.1' : '1'}
                        min="0"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Мин. остаток * ({formState.unit === 'weight' ? 'кг' : 'шт.'})
                    </label>
                    <input
                        type="number"
                        value={formState.minStock}
                        onChange={(e) => updateField('minStock', e.target.value)}
                        placeholder="10"
                        step={formState.unit === 'weight' ? '0.1' : '1'}
                        min="1"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">При достижении появится уведомление</p>
                </div>
            </div>

            {/* Единица измерения */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Единица измерения *
                </label>
                <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="unit"
                            value="piece"
                            checked={formState.unit === 'piece'}
                            onChange={() => updateField('unit', 'piece')}
                            className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-gray-700">Штучно</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="unit"
                            value="weight"
                            checked={formState.unit === 'weight'}
                            onChange={() => updateField('unit', 'weight')}
                            className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-gray-700">Весовой</span>
                    </label>
                </div>
            </div>

            {/* Предпросмотр */}
            {formState.name && formState.category && (
                <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium text-gray-700 mb-2">Предпросмотр:</h4>
                    <div className="space-y-1 text-sm">
                        {formState.image && (
                            <div className="mb-2 w-20 h-20 rounded overflow-hidden">
                                <img src={formState.image} alt={formState.name} className="w-full h-full object-cover" />
                            </div>
                        )}
                        <p><span className="text-gray-500">Название:</span> {formState.name}</p>
                        <p><span className="text-gray-500">Категория:</span> {formState.category}</p>
                        {formState.barcode && <p><span className="text-gray-500">Штрихкод:</span> {formState.barcode}</p>}
                        <p><span className="text-gray-500">Закупка:</span> {formState.purchasePrice} ₽</p>
                        <p><span className="text-gray-500">Продажа:</span> {sellingPrice || '—'} ₽</p>
                        <p><span className="text-gray-500">Тип:</span> {formState.unit === 'piece' ? 'Штучный' : 'Весовой'}</p>
                        <p><span className="text-gray-500">Остаток:</span> {formState.stock} {formState.unit === 'weight' ? 'кг' : 'шт.'}</p>
                        <p><span className="text-gray-500">Мин. остаток:</span> {formState.minStock} {formState.unit === 'weight' ? 'кг' : 'шт.'}</p>
                    </div>
                </div>
            )}

            {/* Кнопки */}
            <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                    Отмена
                </button>
                <button
                    type="submit"
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                    {initialData ? 'Сохранить изменения' : 'Добавить товар'}
                </button>
            </div>
        </form>
    )
}
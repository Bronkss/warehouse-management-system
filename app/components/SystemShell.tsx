'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

const TRAINING_STORAGE_KEY = 'warehouse.system.training.seen.v1.2026_07_01'
const CURRENT_UPDATE_STORAGE_KEY = 'warehouse.system.current_update.seen.v5.2026_07_01_kassa_news_cards_fixed'

const AUTH_USER_KEY = 'warehouse_auth_user'
const AUTH_LOGIN_KEY = 'warehouse_auth_login'
const REMEMBER_ME_KEY = 'warehouse_remember_me'
const AUTH_LOCATION_SLUG_KEY = 'warehouse_location_slug'
const AUTH_LOCATION_NAME_KEY = 'warehouse_location_name'
const AUTH_LOCATION_TYPE_KEY = 'warehouse_location_type'
const AUTH_USER_NAME_KEY = 'warehouse_user_name'
const AUTH_USER_ROLE_KEY = 'warehouse_user_role'
const LOCATION_COOKIE_NAME = 'warehouse_location_slug'
const USER_LOGIN_COOKIE_NAME = 'warehouse_user_login'
const USER_NAME_COOKIE_NAME = 'warehouse_user_name'
const USER_ROLE_COOKIE_NAME = 'warehouse_user_role'
const DEFAULT_LOCATION_NAME = 'ТОЧКА'

const BASE_MENU_ITEMS = [
    { title: 'Товары', icon: '/icons/tovar.png', linkName: 'products' },
    { title: 'Продажи', icon: '/icons/order.png', linkName: 'sales' },
    { title: 'Приемки', icon: '/icons/priemka.png', linkName: 'priemka' },
    { title: 'Отгрузки', icon: '/icons/otgruzki.png', linkName: 'otgruzki' },
    { title: 'Доставки', icon: '/icons/delivery.png', linkName: 'deliveries' },
    { title: 'Списания', icon: '/icons/spisaniya.png', linkName: 'writeoff' },
    { title: 'Инвентаризация', icon: '/icons/inventarizachiya.png', linkName: 'inventory' },
    { title: 'Статистика', icon: '/icons/statistic.png', linkName: 'statistics' },
    { title: 'Закупка', icon: '/icons/zakypki.png', linkName: 'purchase' },
]

const MAIN_WAREHOUSE_HIDDEN_LINKS = new Set(['sales', 'deliveries'])
const MAIN_WAREHOUSE_ONLY_LINKS = new Set(['statistics', 'purchase'])
const TOCHKA_ONLY_LINKS = new Set(['deliveries'])

function getMenuItemsForLocation(locationSlug: string, locationType: string) {
    return BASE_MENU_ITEMS.filter(item => {
        if (locationType === 'warehouse' || locationSlug === 'main-warehouse') {
            return !MAIN_WAREHOUSE_HIDDEN_LINKS.has(item.linkName)
        }

        if (MAIN_WAREHOUSE_ONLY_LINKS.has(item.linkName)) {
            return false
        }

        if (TOCHKA_ONLY_LINKS.has(item.linkName)) {
            return locationSlug === 'tochka'
        }

        return true
    })
}

type DeliveryAlertOrder = {
    id: string
    orderNumber: string
    customerName: string
    customerPhone: string
    address: string
    total: number
    createdAt: string
}

const trainingSections = [
    {
        title: 'Товары',
        icon: '📦',
        text: 'Здесь хранится вся база товаров: название, категория, штрихкод, закупка, продажа, остаток, минимальный остаток, изображение и признак маркировки.',
        steps: [
            'Добавляйте обычные товары через кнопку “Добавить товар”.',
            'Сигареты добавляйте через отдельную кнопку, чтобы товар сразу был маркированным.',
            'Поиск работает по названию и штрихкоду, а база дополнительно синхронизируется в IndexedDB.',
        ],
    },
    {
        title: 'Продажи',
        icon: '🧾',
        text: 'Раздел онлайн-кассы: сканирование товара, оплата наличными, картой или переводом, ККТ, маркировка, отложенные чеки и печать ценников.',
        steps: [
            'Перед продажей откройте смену ККТ.',
            'Маркированный товар добавляется только после проверки DataMatrix и статуса [M+].',
            'Для наличных и карты можно выбрать, фискализировать чек или сохранить продажу без ККТ, если товар не маркированный.',
        ],
    },
    {
        title: 'Приемки',
        icon: '📥',
        text: 'Ручная приёмка товара на склад. Форма находится сразу после шапки, а история вынесена в отдельную кнопку.',
        steps: [
            'Сканируйте штрихкод или ищите товар по названию.',
            'После выбора товара откроется компактная модалка количества.',
            'Товар добавляется наверх таблицы, а черновик сохраняется в браузере.',
        ],
    },
    {
        title: 'Отгрузки',
        icon: '📤',
        text: 'Оформление отгрузки товара со склада в сторону получателя с печатью ТТН и историей документов.',
        steps: [
            'Добавляйте товары так же, как в ручной приёмке.',
            'Для штучных товаров количество только целое, для весовых — до 3 знаков после запятой.',
            'История отгрузок открывается через кнопку и позволяет редактировать старые документы.',
        ],
    },
    {
        title: 'Доставки',
        icon: '🚚',
        text: 'Раздел для просмотра истории доставок и текущих доставок со статусами.',
        steps: [
            'Используйте историю, чтобы быстро проверить старые доставки.',
            'Новые доставки отображаются отдельно по статусу.',
        ],
    },
    {
        title: 'Списания',
        icon: '🗑️',
        text: 'Новый раздел для списания испорченного, просроченного, повреждённого или потерявшего товарный вид товара.',
        steps: [
            'Выберите причину списания: срок годности, товарный вид, бой, недостача, кража, брак и другие.',
            'Списание сохраняется отдельным документом и уменьшает остаток товара.',
            'История списаний открывается в модалке и доступна для редактирования.',
        ],
    },
]

const previousUpdateItems = [
    'Починил поле поиска: при поиске товаров и очистке поиска больше не слетает отображение категорий товаров.',
    'Добавлены изменения в страницу “Приёмка”: теперь в ручной приёмке прогресс добавления сохраняется при переходе на другие страницы приложения и даже после полного закрытия браузера.',
    'Добавлены изменения в страницу “Отгрузки”: теперь прогресс также сохраняется автоматически.',
    'Добавлена новая страница “Доставки”: теперь можно смотреть всю историю доставок и текущие доставки со статусом “Новый”.',
    'Скрыл неработающий функционал страниц: “Списания”, “Инвентаризация”, “Поставщики” и “Статистика”. Они появятся в будущих обновлениях.',
]

const currentUpdateItems = [
    'Добавлен новый функционал — МАРКИРОВКА, теперь можно проводить по кассе маркированные товары, в том числе и табачные изделия.',
    'Изменены настройки кассы — ОЗНАКОМИТЬСЯ!',
    'Добавлена возможность делать ОТЛОЖЕННЫЙ ЧЕК или сразу несколько, преимущественно использовать для доставки.',
    'Можно продать товар через кассу с небольшим минусом, так как бывает погрешность.',
    'Мы теперь можем списывать товары из системы, например по причине потери товарного вида или срока годности, новый раздел СПИСАНИЯ!',
    'Более интуитивно понятные формы для приёмки, отгрузки и списания, также товары добавляются при сканировании наверх таблицы, а не вниз как раньше.',
    'Урааа, у нас появилось обучение и новостная лента! Можете перейти на главную страницу и посмотреть!',
]

const updateReleases = [
    {
        title: 'Большое обновление системы',
        date: 'Июль 2026',
        badge: 'Новое',
        items: currentUpdateItems,
    },
    {
        title: 'Предыдущее обновление',
        date: 'Июнь 2026',
        badge: 'История',
        items: previousUpdateItems,
    },
] as const

type Props = {
    children?: ReactNode
}

function HomeIcon() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <path
                d="M3.5 10.8L12 4l8.5 6.8"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M5.5 9.8V20h4.7v-5.7h3.6V20h4.7V9.8"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    )
}

function CashRegisterIcon() {
    return (
        <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <path
                d="M7 4h10v5H7V4Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
            />
            <path
                d="M5 9h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
            />
            <path d="M7 15h3M14 15h3M7 19v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    )
}

function NewsIcon() {
    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <path
                d="M5 5h14v14H5V5Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
            />
            <path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    )
}

function MenuIcon() {
    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <path d="M4 7H20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M4 12H20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M4 17H20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
    )
}

function CloseButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-2xl leading-none text-gray-400 transition hover:bg-gray-50 hover:text-gray-700"
            aria-label="Закрыть"
        >
            ×
        </button>
    )
}


function readCurrentLocationName() {
    if (typeof window === 'undefined') {
        return DEFAULT_LOCATION_NAME
    }

    return (
        localStorage.getItem(AUTH_LOCATION_NAME_KEY) ||
        sessionStorage.getItem(AUTH_LOCATION_NAME_KEY) ||
        DEFAULT_LOCATION_NAME
    )
}

function readCurrentLocationSlug() {
    if (typeof window === 'undefined') {
        return 'tochka'
    }

    return (
        localStorage.getItem(AUTH_LOCATION_SLUG_KEY) ||
        sessionStorage.getItem(AUTH_LOCATION_SLUG_KEY) ||
        'tochka'
    )
}

function readCurrentLocationType() {
    if (typeof window === 'undefined') {
        return 'store'
    }

    return (
        localStorage.getItem(AUTH_LOCATION_TYPE_KEY) ||
        sessionStorage.getItem(AUTH_LOCATION_TYPE_KEY) ||
        'store'
    )
}


function readCurrentUserName() {
    if (typeof window === 'undefined') {
        return 'Пользователь'
    }

    return (
        localStorage.getItem(AUTH_USER_NAME_KEY) ||
        sessionStorage.getItem(AUTH_USER_NAME_KEY) ||
        localStorage.getItem(AUTH_USER_KEY) ||
        sessionStorage.getItem(AUTH_USER_KEY) ||
        'Пользователь'
    )
}

function readCurrentUserLogin() {
    if (typeof window === 'undefined') {
        return ''
    }

    return (
        localStorage.getItem(AUTH_USER_KEY) ||
        sessionStorage.getItem(AUTH_USER_KEY) ||
        localStorage.getItem(AUTH_LOGIN_KEY) ||
        ''
    )
}

function clearCookie(name: string) {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`
}

function formatDeliveryAlertMoney(value: number) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(Math.round(value || 0))
}

function playDeliveryAlertTone() {
    try {
        const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

        if (!AudioContextCtor) {
            return
        }

        const audioContext = new AudioContextCtor()
        const masterGain = audioContext.createGain()
        const now = audioContext.currentTime

        // Более громкий и резкий сигнал: три коротких импульса.
        // Итоговая громкость всё равно зависит от громкости Windows/браузера.
        masterGain.gain.setValueAtTime(0.0001, now)
        masterGain.gain.linearRampToValueAtTime(0.48, now + 0.015)
        masterGain.gain.linearRampToValueAtTime(0.0001, now + 1.05)
        masterGain.connect(audioContext.destination)

        const playBeep = (startAt: number, frequency: number) => {
            const oscillator = audioContext.createOscillator()
            const gain = audioContext.createGain()

            oscillator.type = 'square'
            oscillator.frequency.setValueAtTime(frequency, startAt)

            gain.gain.setValueAtTime(0.0001, startAt)
            gain.gain.linearRampToValueAtTime(0.95, startAt + 0.015)
            gain.gain.linearRampToValueAtTime(0.0001, startAt + 0.22)

            oscillator.connect(gain)
            gain.connect(masterGain)
            oscillator.start(startAt)
            oscillator.stop(startAt + 0.24)
        }

        playBeep(now, 880)
        playBeep(now + 0.32, 1175)
        playBeep(now + 0.64, 880)

        window.setTimeout(() => {
            void audioContext.close().catch(() => undefined)
        }, 1400)
    } catch (error) {
        console.warn('Delivery alert sound was blocked by browser:', error)
    }
}

export default function SystemShell({ children }: Props) {
    const pathname = usePathname()
    const router = useRouter()
    const swipeStartXRef = React.useRef<number | null>(null)
    const touchStartXRef = React.useRef<number | null>(null)

    const [isMenuOpen, setIsMenuOpen] = React.useState(false)
    const [isTrainingOpen, setIsTrainingOpen] = React.useState(false)
    const [isUpdateModalOpen, setIsUpdateModalOpen] = React.useState(false)
    const [activeTrainingIndex, setActiveTrainingIndex] = React.useState(0)
    const [activeUpdateIndex, setActiveUpdateIndex] = React.useState(0)
    const [currentLocationSlug, setCurrentLocationSlug] = React.useState('tochka')
    const [currentLocationName, setCurrentLocationName] = React.useState(DEFAULT_LOCATION_NAME)
    const [currentLocationType, setCurrentLocationType] = React.useState('store')
    const [currentUserName, setCurrentUserName] = React.useState('Пользователь')
    const [currentUserLogin, setCurrentUserLogin] = React.useState('')
    const [isAuthStateHydrated, setIsAuthStateHydrated] = React.useState(false)
    const [deliveryAlerts, setDeliveryAlerts] = React.useState<DeliveryAlertOrder[]>([])
    const [isDeliveryAlertOpen, setIsDeliveryAlertOpen] = React.useState(false)
    const [isAcceptingDeliveryId, setIsAcceptingDeliveryId] = React.useState<string | null>(null)

    const hasPageContent = React.Children.count(children) > 0
    const activeTraining = trainingSections[activeTrainingIndex] || trainingSections[0]
    const isTochkaLocation = currentLocationSlug === 'tochka'
    const isMainWarehouse = currentLocationType === 'warehouse' || currentLocationSlug === 'main-warehouse'
    const menuItems = React.useMemo(
        () => getMenuItemsForLocation(currentLocationSlug, currentLocationType),
        [currentLocationSlug, currentLocationType]
    )

    React.useEffect(() => {
        setIsMenuOpen(false)
    }, [pathname])

    React.useEffect(() => {
        setCurrentLocationSlug(readCurrentLocationSlug())
        setCurrentLocationName(readCurrentLocationName())
        setCurrentLocationType(readCurrentLocationType())
        setCurrentUserName(readCurrentUserName())
        setCurrentUserLogin(readCurrentUserLogin())
        setIsAuthStateHydrated(true)
    }, [pathname])

    React.useEffect(() => {
        if (!pathname || !isAuthStateHydrated) {
            return
        }

        if (!isTochkaLocation && pathname === '/deliveries') {
            router.replace('/system')
            return
        }

        if (isMainWarehouse && (pathname === '/online-kassa' || pathname === '/sales')) {
            router.replace('/system')
            return
        }

        if (!isMainWarehouse && (pathname === '/statistics' || pathname === '/purchase')) {
            router.replace('/system')
        }
    }, [isAuthStateHydrated, isMainWarehouse, isTochkaLocation, pathname, router])

    const loadDeliveryAlerts = React.useCallback(async () => {
        if (!isTochkaLocation) {
            setDeliveryAlerts([])
            setIsDeliveryAlertOpen(false)
            return
        }

        try {
            const response = await fetch('/api/deliveries/notifications', {
                method: 'GET',
                cache: 'no-store',
            })

            const data = await response.json().catch(() => null) as { orders?: DeliveryAlertOrder[] } | { message?: string } | null

            if (!response.ok) {
                throw new Error(data && 'message' in data ? data.message || 'Не удалось проверить доставки' : 'Не удалось проверить доставки')
            }

            const orders = data && 'orders' in data && Array.isArray(data.orders) ? data.orders : []
            setDeliveryAlerts(orders)
            setIsDeliveryAlertOpen(orders.length > 0)
        } catch (error) {
            console.error('Delivery notification check error:', error)
        }
    }, [isTochkaLocation])

    React.useEffect(() => {
        if (!isTochkaLocation) {
            setDeliveryAlerts([])
            setIsDeliveryAlertOpen(false)
            return
        }

        const firstTimer = window.setTimeout(() => {
            void loadDeliveryAlerts()
        }, 1200)

        const intervalId = window.setInterval(() => {
            void loadDeliveryAlerts()
        }, 60_000)

        return () => {
            window.clearTimeout(firstTimer)
            window.clearInterval(intervalId)
        }
    }, [isTochkaLocation, loadDeliveryAlerts])

    React.useEffect(() => {
        const handleDeliveriesUpdated = () => {
            void loadDeliveryAlerts()
        }

        window.addEventListener('deliveries-updated', handleDeliveriesUpdated)

        return () => {
            window.removeEventListener('deliveries-updated', handleDeliveriesUpdated)
        }
    }, [loadDeliveryAlerts])

    React.useEffect(() => {
        if (!isDeliveryAlertOpen || deliveryAlerts.length === 0) {
            return
        }

        playDeliveryAlertTone()

        const intervalId = window.setInterval(() => {
            playDeliveryAlertTone()
        }, 2200)

        return () => window.clearInterval(intervalId)
    }, [deliveryAlerts.length, isDeliveryAlertOpen])

    const acceptDeliveryFromAlert = async (orderId: string) => {
        try {
            setIsAcceptingDeliveryId(orderId)

            const response = await fetch(`/api/deliveries/${orderId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status: 'accepted' }),
            })

            const data = await response.json().catch(() => null) as { message?: string } | null

            if (!response.ok) {
                throw new Error(data?.message || 'Не удалось принять доставку')
            }

            await loadDeliveryAlerts()
            window.dispatchEvent(new CustomEvent('deliveries-updated'))
        } catch (error) {
            console.error('Accept delivery error:', error)
            alert(error instanceof Error ? error.message : 'Не удалось принять доставку')
        } finally {
            setIsAcceptingDeliveryId(null)
        }
    }

    React.useEffect(() => {
        const trainingSeen = localStorage.getItem(TRAINING_STORAGE_KEY) === 'read'
        const updateSeen = localStorage.getItem(CURRENT_UPDATE_STORAGE_KEY) === 'read'

        const timer = window.setTimeout(() => {
            if (!trainingSeen) {
                setIsTrainingOpen(true)
                return
            }

            if (!updateSeen) {
                setIsUpdateModalOpen(true)
            }
        }, 450)

        return () => window.clearTimeout(timer)
    }, [])

    React.useEffect(() => {
        if (!isTrainingOpen && !isUpdateModalOpen) {
            return
        }

        const bodyOverflow = document.body.style.overflow
        const htmlOverflow = document.documentElement.style.overflow

        document.body.style.overflow = 'hidden'
        document.documentElement.style.overflow = 'hidden'

        return () => {
            document.body.style.overflow = bodyOverflow
            document.documentElement.style.overflow = htmlOverflow
        }
    }, [isTrainingOpen, isUpdateModalOpen])

    const closeTraining = () => {
        localStorage.setItem(TRAINING_STORAGE_KEY, 'read')
        setIsTrainingOpen(false)

        const updateSeen = localStorage.getItem(CURRENT_UPDATE_STORAGE_KEY) === 'read'

        if (!updateSeen) {
            window.setTimeout(() => {
                setIsUpdateModalOpen(true)
            }, 250)
        }
    }

    const closeUpdateModal = () => {
        localStorage.setItem(CURRENT_UPDATE_STORAGE_KEY, 'read')
        setIsUpdateModalOpen(false)
    }

    const handleLogout = () => {
        localStorage.removeItem(AUTH_USER_KEY)
        localStorage.removeItem(AUTH_LOGIN_KEY)
        localStorage.removeItem(REMEMBER_ME_KEY)
        localStorage.removeItem(AUTH_LOCATION_SLUG_KEY)
        localStorage.removeItem(AUTH_LOCATION_NAME_KEY)
        localStorage.removeItem(AUTH_LOCATION_TYPE_KEY)
        localStorage.removeItem(AUTH_USER_NAME_KEY)
        localStorage.removeItem(AUTH_USER_ROLE_KEY)

        sessionStorage.removeItem(AUTH_USER_KEY)
        sessionStorage.removeItem(AUTH_LOCATION_SLUG_KEY)
        sessionStorage.removeItem(AUTH_LOCATION_NAME_KEY)
        sessionStorage.removeItem(AUTH_LOCATION_TYPE_KEY)
        sessionStorage.removeItem(AUTH_USER_NAME_KEY)
        sessionStorage.removeItem(AUTH_USER_ROLE_KEY)

        clearCookie(LOCATION_COOKIE_NAME)
        clearCookie(USER_LOGIN_COOKIE_NAME)
        clearCookie(USER_NAME_COOKIE_NAME)
        clearCookie(USER_ROLE_COOKIE_NAME)
        router.replace('/auth')
    }

    const goToUpdate = (index: number) => {
        setActiveUpdateIndex(Math.max(0, Math.min(updateReleases.length - 1, index)))
    }

    const handleNewsPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        swipeStartXRef.current = event.clientX
    }

    const handleNewsPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        const startX = swipeStartXRef.current
        swipeStartXRef.current = null

        if (startX === null) {
            return
        }

        const diff = event.clientX - startX

        if (Math.abs(diff) < 45) {
            return
        }

        if (diff < 0) {
            goToUpdate(activeUpdateIndex + 1)
            return
        }

        goToUpdate(activeUpdateIndex - 1)
    }

    const handleNewsTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
        touchStartXRef.current = event.touches[0]?.clientX ?? null
    }

    const handleNewsTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
        const startX = touchStartXRef.current
        touchStartXRef.current = null

        if (startX === null) {
            return
        }

        const endX = event.changedTouches[0]?.clientX ?? startX
        const diff = endX - startX

        if (Math.abs(diff) < 45) {
            return
        }

        if (diff < 0) {
            goToUpdate(activeUpdateIndex + 1)
            return
        }

        goToUpdate(activeUpdateIndex - 1)
    }

    const NewsCard = ({
                          release,
                          releaseIndex,
                          compact = false,
                      }: {
        release: typeof updateReleases[number]
        releaseIndex: number
        compact?: boolean
    }) => (
        <article
            className={`h-fit rounded-[26px] border p-5 ${
                releaseIndex === 0
                    ? 'border-[#e5765d]/20 bg-[#fff7f4]'
                    : 'border-gray-100 bg-gray-50'
            }`}
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-[#e5765d]">
                        {release.date}
                    </div>
                    <h3 className="mt-1 text-xl font-bold text-gray-900 sm:text-2xl">
                        {release.title}
                    </h3>
                </div>

                <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                    releaseIndex === 0
                        ? 'bg-[#e5765d] text-white'
                        : 'bg-white text-gray-600'
                }`}>
                    {release.badge}
                </span>
            </div>

            <div className="mt-5 space-y-3">
                {(compact ? release.items.slice(0, releaseIndex === 0 ? 5 : 4) : release.items).map((item, index) => (
                    <div
                        key={item}
                        className="flex gap-3 rounded-2xl border border-white/80 bg-white p-4 shadow-sm"
                    >
                        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                            releaseIndex === 0
                                ? 'bg-[#e5765d] text-white'
                                : 'bg-gray-200 text-gray-700'
                        }`}>
                            {index + 1}
                        </div>

                        <p className="text-sm leading-6 text-gray-700">
                            {item}
                        </p>
                    </div>
                ))}
            </div>

            {compact && release.items.length > (releaseIndex === 0 ? 5 : 4) && (
                <button
                    type="button"
                    onClick={() => {
                        setActiveUpdateIndex(releaseIndex)
                        setIsUpdateModalOpen(true)
                    }}
                    className="mt-4 rounded-xl border border-[#e5765d]/20 bg-white px-4 py-2 text-sm font-bold text-[#e5765d] hover:bg-[#fff1ec]"
                >
                    Смотреть полностью
                </button>
            )}
        </article>
    )

    return (
        <div className="system-root min-h-screen w-full bg-[#ececec] m-0 p-0">
            <div className="system-wrapper min-h-screen overflow-x-hidden bg-[#ececec] pt-[150px]">
                <header className="system-header fixed left-0 right-0 top-0 z-[50] bg-[#e5765d] px-4 py-4 shadow-[0_8px_22px_rgba(0,0,0,0.12)] md:px-6">
                    <div className="mx-auto flex max-w-[1900px] flex-col gap-3">
                        <div className="system-header-top flex items-center justify-between gap-4">
                            <div className="system-header-left flex min-w-0 shrink-0 items-center gap-3">
                                <Link
                                    href="/system"
                                    className="system-home-button flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#e5765d] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#fff7f4]"
                                    aria-label="На главную"
                                    title="На главную"
                                >
                                    <HomeIcon />
                                </Link>

                                <div className="system-brand hidden min-w-0 sm:block">
                                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">
                                        Складской учёт
                                    </div>
                                    <div className="truncate text-lg font-bold leading-5 text-white">
                                        {currentLocationName}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setIsMenuOpen((prev) => !prev)}
                                    className="system-mobile-menu-button h-11 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-bold text-[#e5765d] shadow-sm transition hover:bg-[#fff7f4]"
                                >
                                    <MenuIcon />
                                    <span>Меню</span>
                                </button>
                            </div>

                            <div className="system-header-actions ml-auto flex shrink-0 items-center justify-end gap-2">
                                <div
                                    className="system-location-pill hidden h-11 min-w-[320px] max-w-[420px] items-center rounded-2xl bg-white/18 px-4 text-left text-white ring-1 ring-white/20 lg:flex"
                                    title={`${currentLocationName} · ${currentUserName}${currentUserLogin ? ` (${currentUserLogin})` : ''}`}
                                >
                                    <div className="min-w-0">
                                        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">
                                            Зона / пользователь
                                        </div>
                                        <div className="max-w-[390px] truncate text-sm font-extrabold leading-4">
                                            {currentLocationName} · {currentUserName}
                                        </div>
                                    </div>
                                </div>

                                {!isMainWarehouse && (
                                    <Link
                                        href="/online-kassa"
                                        className={`system-kassa-button flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-bold shadow-sm transition ${
                                            pathname === '/online-kassa'
                                                ? 'bg-[#2f2f2f] text-white shadow-[0_8px_18px_rgba(0,0,0,0.16)]'
                                                : 'bg-[#2f2f2f]/88 text-white hover:-translate-y-0.5 hover:bg-[#2f2f2f]'
                                        }`}
                                    >
                                        <CashRegisterIcon />
                                        <span>Касса</span>
                                    </Link>
                                )}

                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="system-logout-button flex h-11 items-center justify-center rounded-2xl border border-white/24 bg-white/14 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-white/22"
                                >
                                    Выйти
                                </button>
                            </div>
                        </div>

                        <nav className="system-desktop-menu min-w-0">
                            <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(145px,1fr))] gap-2">
                                {menuItems.map((item) => {
                                    const href = `/${item.linkName}`
                                    const isActive = pathname === href

                                    return (
                                        <Link
                                            href={href}
                                            key={item.title}
                                            className={`group system-menu-link relative flex h-12 min-w-0 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-extrabold shadow-sm transition ${
                                                isActive
                                                    ? 'border-white bg-white text-[#2f2f2f] shadow-[0_8px_20px_rgba(0,0,0,0.16)] ring-2 ring-[#2f2f2f]/12'
                                                    : 'border-white/70 bg-white/92 text-[#3a3a3a] hover:-translate-y-0.5 hover:border-white hover:bg-white hover:shadow-[0_8px_18px_rgba(0,0,0,0.12)]'
                                            }`}
                                        >
                                            <span className={`relative flex h-[25px] w-[25px] shrink-0 items-center justify-center rounded-xl p-1 ${
                                                isActive
                                                    ? 'bg-[#fff4ef] ring-1 ring-[#e5765d]/25'
                                                    : 'bg-[#fff7f4] ring-1 ring-black/5'
                                            }`}>
                                                <Image
                                                    src={item.icon}
                                                    alt={item.title}
                                                    fill
                                                    className="object-contain p-1"
                                                />
                                            </span>

                                            <span className="min-w-0 truncate">
                                                {item.title}
                                            </span>

                                            {isActive && (
                                                <span className="pointer-events-none absolute inset-x-5 bottom-1.5 h-1 rounded-full bg-[#e5765d]/70" />
                                            )}
                                        </Link>
                                    )
                                })}
                            </div>
                        </nav>
                    </div>

                    {isMenuOpen && (
                        <div className="system-mobile-dropdown mx-auto mt-4 max-w-[1800px] border-t border-white/20 pt-4">
                            <nav className="grid grid-cols-1 gap-2">
                                <Link
                                    href="/system"
                                    className={`flex h-[48px] items-center gap-3 rounded-2xl px-4 text-sm font-bold shadow-sm transition ${
                                        pathname === '/system'
                                            ? 'bg-white text-[#e5765d] ring-2 ring-white/45'
                                            : 'bg-white/16 text-white hover:bg-white/22'
                                    }`}
                                >
                                    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center">
                                        <HomeIcon />
                                    </span>

                                    <span className="truncate">Главная</span>
                                </Link>

                                {!isMainWarehouse && (
                                    <Link
                                        href="/online-kassa"
                                        className={`flex h-[48px] items-center gap-3 rounded-2xl px-4 text-sm font-bold shadow-sm transition ${
                                            pathname === '/online-kassa'
                                                ? 'bg-white text-[#e5765d] ring-2 ring-white/45'
                                                : 'bg-white/16 text-white hover:bg-white/22'
                                        }`}
                                    >
                                        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center">
                                            <CashRegisterIcon />
                                        </span>

                                        <span className="truncate">Касса</span>
                                    </Link>
                                )}

                                <div className="rounded-2xl bg-white/12 px-4 py-3 text-sm text-white shadow-sm">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">
                                        Текущая зона
                                    </div>
                                    <div className="mt-1 font-extrabold">
                                        {currentLocationName}
                                    </div>
                                    <div className="mt-0.5 text-xs text-white/70">
                                        {currentLocationType === 'warehouse' ? 'Склад' : 'Торговая точка'} · {currentUserName}
                                    </div>
                                </div>

                                {menuItems.map((item) => {
                                    const href = `/${item.linkName}`
                                    const isActive = pathname === href

                                    return (
                                        <Link
                                            href={href}
                                            key={item.title}
                                            className={`flex h-[48px] items-center gap-3 rounded-2xl px-4 text-sm font-bold shadow-sm transition ${
                                                isActive
                                                    ? 'bg-white text-[#2f2f2f] ring-2 ring-white/45'
                                                    : 'bg-white/16 text-white hover:bg-white/22'
                                            }`}
                                        >
                                            <span className={`relative flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-xl p-1 ${
                                                isActive
                                                    ? 'bg-[#fff4ef] ring-1 ring-[#e5765d]/25'
                                                    : 'bg-white/85'
                                            }`}>
                                                <Image
                                                    src={item.icon}
                                                    alt={item.title}
                                                    fill
                                                    className="object-contain p-1"
                                                />
                                            </span>

                                            <span className="truncate">
                                                {item.title}
                                            </span>
                                        </Link>
                                    )
                                })}

                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="rounded-2xl bg-white/16 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-white/22"
                                >
                                    Выйти из зоны
                                </button>
                            </nav>
                        </div>
                    )}
                </header>

                <main className="system-main min-h-[calc(100vh-76px)] bg-[#ececec]">
                    {hasPageContent ? children : (
                        <div className="welcome-section px-6 pb-10 pt-6 md:px-8">
                            <div className="mx-auto max-w-[1700px]">
                                <div className="welcome-card relative overflow-hidden rounded-[34px] border border-white/80 bg-white shadow-[0_22px_70px_rgba(0,0,0,0.08)]">
                                    <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[#e5765d]/20 blur-3xl" />
                                    <div className="absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-orange-200/50 blur-3xl" />
                                    <div className="absolute right-0 top-0 h-full w-[38%] bg-gradient-to-br from-[#e5765d]/16 via-[#e5765d]/6 to-transparent" />

                                    <div className="welcome-card-content relative flex items-center justify-between gap-8 p-8">
                                        <div className="welcome-info flex items-start gap-5">
                                            <div className="welcome-icon flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] bg-[#e5765d] text-3xl shadow-[0_16px_35px_rgba(229,118,93,0.35)]">
                                                🏠
                                            </div>

                                            <div>
                                                <div className="mb-3 inline-flex items-center rounded-full border border-[#e5765d]/15 bg-[#fff7f4] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#e5765d] shadow-sm">
                                                    Главная система
                                                </div>

                                                <h1 className="welcome-title text-[30px] font-semibold leading-tight text-[#2f2f2f]">
                                                    {currentLocationName} — складской учёт
                                                </h1>

                                                <p className="welcome-text mt-3 max-w-4xl text-[16px] leading-7 text-[#646464]">
                                                    Здесь собраны разделы системы, обучение и новости обновлений. Все операции выполняются в текущей зоне: {currentLocationName}.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
                                            <button
                                                type="button"
                                                onClick={() => setIsTrainingOpen(true)}
                                                className="welcome-button flex h-12 items-center justify-center rounded-2xl bg-[#2f2f2f] px-6 text-sm font-bold text-white shadow-[0_12px_28px_rgba(0,0,0,0.14)] transition hover:bg-[#1f1f1f]"
                                            >
                                                Открыть обучение
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setIsUpdateModalOpen(true)}
                                                className="welcome-button flex h-12 items-center justify-center rounded-2xl border border-[#e5765d]/20 bg-white px-6 text-sm font-bold text-[#e5765d] shadow-sm transition hover:bg-[#fff7f4]"
                                            >
                                                Что нового
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                                    <section className="h-fit rounded-[28px] border border-white/80 bg-white p-6 shadow-sm">
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                            <div>
                                                <div className="text-xs font-bold uppercase tracking-[0.14em] text-[#e5765d]">
                                                    Обучение
                                                </div>
                                                <h2 className="mt-1 text-2xl font-bold text-gray-900">
                                                    Быстрый старт по разделам
                                                </h2>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => setIsTrainingOpen(true)}
                                                className="rounded-xl bg-[#e5765d] px-4 py-2 text-sm font-bold text-white hover:bg-[#d7644d]"
                                            >
                                                Открыть полностью
                                            </button>
                                        </div>

                                        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                                            {trainingSections.map((section) => (
                                                <div key={section.title} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-xl shadow-sm">
                                                            {section.icon}
                                                        </div>
                                                        <div className="font-bold text-gray-900">
                                                            {section.title}
                                                        </div>
                                                    </div>

                                                    <p className="mt-3 text-sm leading-6 text-gray-600">
                                                        {section.text}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </section>

                                    <section className="h-fit rounded-[28px] border border-white/80 bg-white p-6 shadow-sm">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="text-xs font-bold uppercase tracking-[0.14em] text-[#e5765d]">
                                                    Новости
                                                </div>
                                                <h2 className="mt-1 text-2xl font-bold text-gray-900">
                                                    Лента обновлений
                                                </h2>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => setIsUpdateModalOpen(true)}
                                                className="rounded-xl border border-[#e5765d]/20 bg-[#fff7f4] px-4 py-2 text-sm font-bold text-[#e5765d] hover:bg-[#ffece5]"
                                            >
                                                Все новости
                                            </button>
                                        </div>

                                        <div className="news-cards-scroll mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
                                            {updateReleases.map((release, releaseIndex) => (
                                                <div key={release.title} className="min-w-[86%] snap-start sm:min-w-[72%] lg:min-w-[62%] xl:min-w-full">
                                                    <NewsCard release={release} releaseIndex={releaseIndex} compact />
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>

            {isDeliveryAlertOpen && deliveryAlerts.length > 0 && (
                <div className="fixed inset-x-0 top-[92px] z-[240] mx-auto w-full max-w-[680px] px-3 sm:top-[96px]">
                    <div className="overflow-hidden rounded-3xl border border-orange-200 bg-white shadow-2xl ring-1 ring-orange-100">
                        <div className="bg-orange-50 px-5 py-4">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-orange-600">
                                        Новая доставка
                                    </div>
                                    <h2 className="mt-1 text-xl font-extrabold text-gray-900">
                                        Нужно принять доставку в работу
                                    </h2>
                                    <p className="mt-1 text-sm text-gray-600">
                                        Уведомление будет звучать, пока доставка находится в статусе “Новый”.
                                    </p>
                                </div>

                                <Link
                                    href="/deliveries"
                                    className="rounded-2xl bg-orange-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-orange-700"
                                >
                                    Открыть
                                </Link>
                            </div>
                        </div>

                        <div className="max-h-[360px] overflow-y-auto p-4">
                            <div className="space-y-3">
                                {deliveryAlerts.map(order => (
                                    <div key={order.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="min-w-0">
                                                <div className="font-extrabold text-gray-900">
                                                    {order.orderNumber} · {formatDeliveryAlertMoney(order.total)}
                                                </div>
                                                <div className="mt-1 text-sm font-semibold text-gray-700">
                                                    {order.customerName} · {order.customerPhone}
                                                </div>
                                                <div className="mt-1 line-clamp-2 text-sm text-gray-500">
                                                    {order.address}
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => void acceptDeliveryFromAlert(order.id)}
                                                disabled={isAcceptingDeliveryId === order.id}
                                                className="shrink-0 rounded-2xl bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {isAcceptingDeliveryId === order.id ? 'Принимаю...' : 'Принята доставка'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isTrainingOpen && (
                <div className="fixed inset-0 z-[240] flex items-center justify-center overflow-hidden overscroll-none bg-gray-950/55 px-3 py-4 backdrop-blur-[2px]">
                    <div className="flex max-h-[calc(100dvh-32px)] w-full max-w-[980px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
                        <div className="border-b border-gray-100 px-5 py-5 sm:px-6">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-[#e5765d]">
                                        Обучение по системе
                                    </div>
                                    <h2 className="mt-1 text-2xl font-bold text-gray-900">
                                        Как пользоваться разделами
                                    </h2>
                                    <p className="mt-2 text-sm leading-6 text-gray-500">
                                        Это окно открывается один раз при первом заходе. Потом его можно открыть с главной страницы.
                                    </p>
                                </div>

                                <CloseButton onClick={closeTraining} />
                            </div>
                        </div>

                        <div className="grid min-h-0 flex-1 md:grid-cols-[250px_1fr]">
                            <div className="border-b border-gray-100 bg-gray-50 p-4 md:border-b-0 md:border-r">
                                <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
                                    {trainingSections.map((section, index) => (
                                        <button
                                            key={section.title}
                                            type="button"
                                            onClick={() => setActiveTrainingIndex(index)}
                                            className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-bold transition ${
                                                activeTrainingIndex === index
                                                    ? 'bg-[#e5765d] text-white shadow-sm'
                                                    : 'bg-white text-gray-700 hover:bg-[#fff7f4]'
                                            }`}
                                        >
                                            <span className="text-lg">{section.icon}</span>
                                            <span className="truncate">{section.title}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
                                <div className="flex items-center gap-4">
                                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff7f4] text-3xl">
                                        {activeTraining.icon}
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold text-gray-900">
                                            {activeTraining.title}
                                        </h3>
                                        <p className="mt-1 text-sm leading-6 text-gray-500">
                                            {activeTraining.text}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-6 space-y-3">
                                    {activeTraining.steps.map((step, index) => (
                                        <div key={step} className="flex gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e5765d] text-sm font-bold text-white">
                                                {index + 1}
                                            </div>
                                            <p className="text-sm leading-6 text-gray-700">
                                                {step}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-gray-100 bg-white px-5 py-4 sm:px-6">
                            <button
                                type="button"
                                onClick={closeTraining}
                                className="flex w-full items-center justify-center rounded-2xl bg-[#e5765d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#d7644d]"
                            >
                                Понятно, начать работу
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isUpdateModalOpen && (
                <div className="fixed inset-0 z-[230] flex items-center justify-center overflow-hidden overscroll-none bg-gray-950/55 px-3 py-4 backdrop-blur-[2px]">
                    <div className="flex max-h-[calc(100dvh-32px)] w-full max-w-[880px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
                        <div className="border-b border-gray-100 bg-white px-5 py-5 sm:px-6">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-[#e5765d]">
                                        Новости системы
                                    </div>
                                    <h2 className="mt-1 text-2xl font-bold text-gray-900">
                                        История обновлений
                                    </h2>
                                    <p className="mt-2 text-sm leading-6 text-gray-500">
                                        Переключайте карточки большими кнопками или свайпом вправо/влево.
                                    </p>
                                </div>

                                <CloseButton onClick={closeUpdateModal} />
                            </div>
                        </div>

                        <div
                            className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6"
                            onPointerDown={handleNewsPointerDown}
                            onPointerUp={handleNewsPointerUp}
                            onPointerCancel={() => {
                                swipeStartXRef.current = null
                            }}
                            onTouchStart={handleNewsTouchStart}
                            onTouchEnd={handleNewsTouchEnd}
                        >
                            <section key={updateReleases[activeUpdateIndex].title} className="news-modal-card-active animate-news-card-in">
                                <NewsCard
                                    release={updateReleases[activeUpdateIndex]}
                                    releaseIndex={activeUpdateIndex}
                                />
                            </section>
                        </div>

                        <div className="border-t border-gray-100 bg-white px-5 py-4 sm:px-6">
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <button
                                    type="button"
                                    onClick={() => goToUpdate(activeUpdateIndex - 1)}
                                    disabled={activeUpdateIndex === 0}
                                    className="flex h-12 min-w-[132px] items-center justify-center gap-2 rounded-2xl border border-[#e5765d]/20 bg-[#fff7f4] px-4 text-sm font-extrabold text-[#e5765d] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#ffece5] disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-300 disabled:shadow-none disabled:hover:translate-y-0"
                                    aria-label="Предыдущее обновление"
                                >
                                    <span className="text-xl leading-none">←</span>
                                    <span>Назад</span>
                                </button>

                                <div className="flex items-center gap-2">
                                    {updateReleases.map((release, index) => (
                                        <button
                                            key={release.title}
                                            type="button"
                                            onClick={() => goToUpdate(index)}
                                            className={`h-2.5 rounded-full transition-all ${
                                                activeUpdateIndex === index
                                                    ? 'w-8 bg-[#e5765d]'
                                                    : 'w-2.5 bg-gray-300 hover:bg-gray-400'
                                            }`}
                                            aria-label={release.title}
                                        />
                                    ))}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => goToUpdate(activeUpdateIndex + 1)}
                                    disabled={activeUpdateIndex === updateReleases.length - 1}
                                    className="flex h-12 min-w-[132px] items-center justify-center gap-2 rounded-2xl bg-[#e5765d] px-4 text-sm font-extrabold text-white shadow-[0_12px_26px_rgba(229,118,93,0.28)] transition hover:-translate-y-0.5 hover:bg-[#d7644d] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:hover:translate-y-0"
                                    aria-label="Следующее обновление"
                                >
                                    <span>Вперёд</span>
                                    <span className="text-xl leading-none">→</span>
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={closeUpdateModal}
                                className="flex w-full items-center justify-center rounded-xl bg-[#e5765d] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#d7644d] active:bg-[#c95742]"
                            >
                                Ознакомился(лась)
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                .system-header {
                    transform: translateZ(0);
                }

                .system-mobile-menu-button {
                    display: none;
                }

                .system-mobile-dropdown {
                    display: none;
                }

                .news-cards-scroll {
                    scrollbar-width: none;
                }

                .news-cards-scroll::-webkit-scrollbar {
                    display: none;
                }


                .animate-news-card-in {
                    animation: newsCardIn 0.18s ease-out;
                }

                @keyframes newsCardIn {
                    from {
                        opacity: 0;
                        transform: translateX(10px) scale(0.995);
                    }

                    to {
                        opacity: 1;
                        transform: translateX(0) scale(1);
                    }
                }

                @media (max-width: 767px) {
                    .system-header {
                        padding: 14px 16px;
                    }

                    .system-wrapper {
                        padding-top: 72px;
                    }

                    .system-header-top {
                        display: flex;
                        justify-content: space-between;
                    }

                    .system-brand {
                        display: none;
                    }

                    .system-desktop-menu {
                        display: none;
                    }

                    .system-mobile-menu-button {
                        display: flex;
                    }

                    .system-header-actions {
                        gap: 8px;
                    }

                    .system-kassa-button span {
                        display: none;
                    }

                    .system-logout-button {
                        display: none;
                    }

                    .system-kassa-button {
                        width: 44px;
                        padding-left: 0;
                        padding-right: 0;
                        justify-content: center;
                    }

                    .system-mobile-dropdown {
                        display: block;
                    }

                    .system-main {
                        min-height: calc(100vh - 76px);
                    }

                    .welcome-section {
                        padding: 20px 16px 32px;
                    }

                    .welcome-card {
                        border-radius: 24px;
                    }

                    .welcome-card-content {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 22px;
                        padding: 20px;
                    }

                    .welcome-info {
                        gap: 16px;
                    }

                    .welcome-icon {
                        width: 56px;
                        height: 56px;
                        border-radius: 18px;
                        font-size: 24px;
                    }

                    .welcome-title {
                        font-size: 22px;
                    }

                    .welcome-text {
                        font-size: 14px;
                        line-height: 24px;
                    }

                    .welcome-button {
                        width: 100%;
                    }
                }

                @media (min-width: 768px) and (max-width: 1180px) {
                    .system-wrapper {
                        padding-top: 206px;
                    }

                    .system-header-top {
                        align-items: flex-start;
                        gap: 12px;
                    }

                    .system-header-actions {
                        flex-wrap: wrap;
                    }

                    .system-location-pill {
                        min-width: 260px;
                        max-width: 330px;
                    }

                    .system-desktop-menu > div {
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                    }
                }

                @media (min-width: 1181px) and (max-width: 1550px) {
                    .system-wrapper {
                        padding-top: 152px;
                    }

                    .system-desktop-menu > div {
                        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    }
                }
            `}</style>
        </div>
    )
}

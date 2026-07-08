'use client'

import * as React from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

const AUTH_USER_KEY = 'warehouse_auth_user'
const AUTH_LOGIN_KEY = 'warehouse_auth_login'
const REMEMBER_ME_KEY = 'warehouse_remember_me'
const AUTH_LOCATION_SLUG_KEY = 'warehouse_location_slug'
const AUTH_LOCATION_NAME_KEY = 'warehouse_location_name'
const AUTH_LOCATION_TYPE_KEY = 'warehouse_location_type'
const LOCATION_COOKIE_NAME = 'warehouse_location_slug'

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

type WarehouseLocation = {
    slug: string
    name: string
    type: 'warehouse' | 'store'
    login: string
    password: string
}

const WAREHOUSE_LOCATIONS: WarehouseLocation[] = [
    {
        slug: 'main-warehouse',
        name: 'Главный склад',
        type: 'warehouse',
        login: 'sklad',
        password: 'sklad112233',
    },
    {
        slug: 'tochka',
        name: 'ТОЧКА',
        type: 'store',
        login: 'tochka',
        password: 'tochka112233',
    },
    {
        slug: 'rodnik',
        name: 'Родник',
        type: 'store',
        login: 'rodnik',
        password: 'rodnik112233',
    },
]

function findLocation(slug: string): WarehouseLocation {
    return WAREHOUSE_LOCATIONS.find(location => location.slug === slug) || WAREHOUSE_LOCATIONS[1]
}

function setCookie(name: string, value: string, remember: boolean) {
    const maxAge = remember ? `; max-age=${COOKIE_MAX_AGE_SECONDS}` : ''
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax${maxAge}`
}

function clearCookie(name: string) {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`
}

export default function Auth() {
    const router = useRouter()

    const [login, setLogin] = React.useState('')
    const [password, setPassword] = React.useState('')
    const [selectedLocationSlug, setSelectedLocationSlug] = React.useState('tochka')
    const [rememberMe, setRememberMe] = React.useState(false)
    const [error, setError] = React.useState('')

    React.useEffect(() => {
        const savedRememberMe = localStorage.getItem(REMEMBER_ME_KEY) === 'true'
        const savedLogin = localStorage.getItem(AUTH_LOGIN_KEY)
        const savedLocalUser = localStorage.getItem(AUTH_USER_KEY)
        const savedSessionUser = sessionStorage.getItem(AUTH_USER_KEY)
        const savedLocalLocation = localStorage.getItem(AUTH_LOCATION_SLUG_KEY)
        const savedSessionLocation = sessionStorage.getItem(AUTH_LOCATION_SLUG_KEY)

        if (savedRememberMe) {
            setRememberMe(true)

            if (savedLogin) {
                setLogin(savedLogin)
            }
        }

        if (savedLocalLocation || savedSessionLocation) {
            setSelectedLocationSlug(savedLocalLocation || savedSessionLocation || 'tochka')
        }

        if ((savedLocalUser || savedSessionUser) && (savedLocalLocation || savedSessionLocation)) {
            router.replace('/system')
        }
    }, [router])

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()

        const normalizedLogin = login.trim()
        const selectedLocation = findLocation(selectedLocationSlug)

        const isLocationCredentialValid =
            normalizedLogin === selectedLocation.login &&
            password === selectedLocation.password

        /**
         * Временная страховка, чтобы старый доступ не потерялся во время миграции.
         * Позже лучше убрать и оставить только серверную авторизацию с хешами паролей.
         */
        const isLegacyAdminValid = normalizedLogin === 'admin' && password === '112233'

        if (isLocationCredentialValid || isLegacyAdminValid) {
            const authUser = isLegacyAdminValid ? 'admin' : selectedLocation.login

            setError('')
            clearCookie(LOCATION_COOKIE_NAME)
            setCookie(LOCATION_COOKIE_NAME, selectedLocation.slug, rememberMe)

            if (rememberMe) {
                localStorage.setItem(AUTH_USER_KEY, authUser)
                localStorage.setItem(AUTH_LOGIN_KEY, normalizedLogin)
                localStorage.setItem(REMEMBER_ME_KEY, 'true')
                localStorage.setItem(AUTH_LOCATION_SLUG_KEY, selectedLocation.slug)
                localStorage.setItem(AUTH_LOCATION_NAME_KEY, selectedLocation.name)
                localStorage.setItem(AUTH_LOCATION_TYPE_KEY, selectedLocation.type)

                sessionStorage.removeItem(AUTH_USER_KEY)
                sessionStorage.removeItem(AUTH_LOCATION_SLUG_KEY)
                sessionStorage.removeItem(AUTH_LOCATION_NAME_KEY)
                sessionStorage.removeItem(AUTH_LOCATION_TYPE_KEY)
            } else {
                sessionStorage.setItem(AUTH_USER_KEY, authUser)
                sessionStorage.setItem(AUTH_LOCATION_SLUG_KEY, selectedLocation.slug)
                sessionStorage.setItem(AUTH_LOCATION_NAME_KEY, selectedLocation.name)
                sessionStorage.setItem(AUTH_LOCATION_TYPE_KEY, selectedLocation.type)

                localStorage.removeItem(AUTH_USER_KEY)
                localStorage.removeItem(AUTH_LOGIN_KEY)
                localStorage.removeItem(REMEMBER_ME_KEY)
                localStorage.removeItem(AUTH_LOCATION_SLUG_KEY)
                localStorage.removeItem(AUTH_LOCATION_NAME_KEY)
                localStorage.removeItem(AUTH_LOCATION_TYPE_KEY)
            }

            router.push('/system')
            return
        }

        setError('Неверный логин, пароль или выбранная торговая зона')
    }

    return (
        <div className="auth-page min-h-screen bg-[#cfcfcf] flex items-center justify-center px-4">
            <div className="auth-card w-full max-w-[560px] relative rounded-[32px] border-[3px] border-[#e67c63] bg-white shadow-[0_8px_20px_rgba(0,0,0,0.12)] px-10 py-8">
                <div className="auth-logo absolute left-1/2 -translate-x-1/2 -top-[50px] w-[460px] max-w-[95%] h-[250px] pointer-events-none select-none">
                    <Image
                        src="/logo.gif"
                        alt="Точка"
                        fill
                        className="object-contain"
                        priority
                        unoptimized
                    />
                </div>

                <form onSubmit={handleSubmit} className="auth-form flex flex-col pt-[80px]">
                    <label className="auth-label text-[18px] text-[#222] mb-3">
                        Торговая зона
                    </label>

                    <select
                        value={selectedLocationSlug}
                        onChange={(e) => {
                            setSelectedLocationSlug(e.target.value)
                            if (error) setError('')
                        }}
                        className="auth-input h-[70px] rounded-[26px] border-[3px] border-[#e67c63] bg-white px-8 text-[20px] text-[#222] outline-none mb-7"
                    >
                        {WAREHOUSE_LOCATIONS.map(location => (
                            <option key={location.slug} value={location.slug}>
                                {location.name}
                            </option>
                        ))}
                    </select>

                    <label className="auth-label text-[18px] text-[#222] mb-3">
                        Логин
                    </label>

                    <input
                        type="text"
                        value={login}
                        onChange={(e) => {
                            setLogin(e.target.value)
                            if (error) setError('')
                        }}
                        placeholder="Введите логин"
                        autoComplete="username"
                        className="auth-input h-[70px] rounded-[26px] border-[3px] border-[#e67c63] px-8 text-[20px] text-[#222] placeholder:text-[#c9c9c9] outline-none mb-7"
                    />

                    <label className="auth-label text-[18px] text-[#222] mb-3">
                        Пароль
                    </label>

                    <input
                        type="password"
                        value={password}
                        onChange={(e) => {
                            setPassword(e.target.value)
                            if (error) setError('')
                        }}
                        placeholder="Введите пароль"
                        autoComplete="current-password"
                        className="auth-input h-[70px] rounded-[26px] border-[3px] border-[#e67c63] px-8 text-[20px] text-[#222] placeholder:text-[#c9c9c9] outline-none"
                    />

                    <div className="mt-4 rounded-2xl bg-[#fff7f4] px-4 py-3 text-sm leading-6 text-[#8a3f2e]">
                        Тестовые доступы: sklad/sklad112233, tochka/tochka112233, rodnik/rodnik112233. Старый admin/112233 временно оставлен для подстраховки.
                    </div>

                    <label className="auth-remember flex items-center gap-4 mt-5 mb-4 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            className="auth-checkbox h-6 w-6 appearance-none rounded-full bg-[#d9d9d9] checked:bg-[#e67c63]"
                        />

                        <span className="auth-remember-text text-[18px] text-[#4a4a4a]">
                            Запомнить меня
                        </span>
                    </label>

                    {error && (
                        <p className="auth-error mb-5 text-[16px] text-red-500">
                            {error}
                        </p>
                    )}

                    <div className="auth-actions flex items-end justify-between gap-4">
                        <button
                            type="submit"
                            className="auth-submit min-w-[190px] h-[56px] rounded-full bg-[#e67c63] text-white text-[28px] font-semibold hover:opacity-90 transition"
                        >
                            Войти
                        </button>

                        <div className="auth-location-hint text-left text-[15px] leading-[1.45] text-[#6b6b6b]">
                            Все остатки, продажи, приёмки и списания будут относиться к выбранной зоне.
                        </div>
                    </div>
                </form>
            </div>

            <style>{`
                @media (max-width: 768px) {
                    .auth-page {
                        align-items: flex-start;
                        padding: 90px 16px 24px;
                    }

                    .auth-card {
                        max-width: 440px;
                        border-radius: 28px;
                        padding: 32px 28px 28px;
                    }

                    .auth-logo {
                        top: -45px;
                        width: 360px;
                        height: 210px;
                    }

                    .auth-form {
                        padding-top: 70px;
                    }

                    .auth-label {
                        font-size: 17px;
                        margin-bottom: 10px;
                    }

                    .auth-input {
                        height: 62px;
                        border-radius: 22px;
                        padding-left: 22px;
                        padding-right: 22px;
                        font-size: 18px;
                    }

                    .auth-remember {
                        gap: 12px;
                        margin-top: 18px;
                    }

                    .auth-checkbox {
                        width: 22px;
                        height: 22px;
                    }

                    .auth-remember-text {
                        font-size: 17px;
                    }

                    .auth-actions {
                        align-items: stretch;
                        flex-direction: column;
                        gap: 18px;
                    }

                    .auth-submit {
                        width: 100%;
                        height: 56px;
                        font-size: 24px;
                    }

                    .auth-location-hint {
                        text-align: center;
                    }
                }

                @media (max-width: 480px) {
                    .auth-page {
                        padding: 78px 12px 20px;
                    }

                    .auth-card {
                        max-width: 100%;
                        border-width: 2px;
                        border-radius: 24px;
                        padding: 28px 20px 24px;
                    }

                    .auth-logo {
                        top: -40px;
                        width: 300px;
                        height: 185px;
                    }

                    .auth-form {
                        padding-top: 58px;
                    }

                    .auth-label {
                        font-size: 16px;
                        margin-bottom: 8px;
                    }

                    .auth-input {
                        height: 56px;
                        border-width: 2px;
                        border-radius: 18px;
                        padding-left: 18px;
                        padding-right: 18px;
                        font-size: 16px;
                    }

                    .auth-remember {
                        gap: 10px;
                        margin-top: 16px;
                        margin-bottom: 16px;
                    }

                    .auth-checkbox {
                        width: 20px;
                        height: 20px;
                        min-width: 20px;
                    }

                    .auth-remember-text {
                        font-size: 16px;
                    }

                    .auth-error {
                        font-size: 14px;
                        margin-bottom: 16px;
                    }

                    .auth-submit {
                        min-width: 0;
                        height: 52px;
                        font-size: 22px;
                    }
                }

                @media (max-width: 360px) {
                    .auth-page {
                        padding-top: 70px;
                    }

                    .auth-card {
                        padding-left: 16px;
                        padding-right: 16px;
                    }

                    .auth-logo {
                        width: 200px;
                        height: 165px;
                    }

                    .auth-form {
                        padding-top: 48px;
                    }

                    .auth-input {
                        height: 52px;
                        font-size: 15px;
                    }

                    .auth-submit {
                        height: 50px;
                        font-size: 20px;
                    }

                    .auth-remember-text {
                        font-size: 15px;
                    }
                }
            `}</style>
        </div>
    )
}

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
const AUTH_USER_NAME_KEY = 'warehouse_user_name'
const AUTH_USER_ROLE_KEY = 'warehouse_user_role'
const LOCATION_COOKIE_NAME = 'warehouse_location_slug'
const USER_LOGIN_COOKIE_NAME = 'warehouse_user_login'
const USER_NAME_COOKIE_NAME = 'warehouse_user_name'
const USER_ROLE_COOKIE_NAME = 'warehouse_user_role'

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

type WarehouseLocation = {
    slug: string
    name: string
    type: 'warehouse' | 'store'
}

type WarehouseUser = {
    login: string
    password: string
    name: string
    role: 'admin' | 'warehouse' | 'cashier'
    locationSlugs: string[]
    aliases?: string[]
}

const WAREHOUSE_LOCATIONS: WarehouseLocation[] = [
    { slug: 'main-warehouse', name: 'Главный склад', type: 'warehouse' },
    { slug: 'tochka', name: 'ТОЧКА', type: 'store' },
    { slug: 'rodnik', name: 'Родник', type: 'store' },
]

const WAREHOUSE_USERS: WarehouseUser[] = [
    {
        login: 'sklad',
        password: 'Sklad-90N2',
        name: 'Главный склад',
        role: 'warehouse',
        locationSlugs: ['main-warehouse'],
        aliases: ['sklad_admin'],
    },
    {
        login: 'lada',
        password: 'Lada-47K9',
        name: 'Лада Якимова',
        role: 'cashier',
        locationSlugs: ['tochka'],
        aliases: ['tochka_lada'],
    },
    {
        login: 'elena',
        password: 'Elena-82M4',
        name: 'Елена Цыганкова',
        role: 'cashier',
        locationSlugs: ['tochka'],
        aliases: ['tochka_elena'],
    },
    {
        login: 'anastasia',
        password: 'Anastasia-61R8',
        name: 'Анастасия Котова',
        role: 'cashier',
        locationSlugs: ['tochka', 'rodnik'],
        aliases: ['tochka_anastasia', 'rodnik_anastasia'],
    },
    {
        login: 'tatyana',
        password: 'Tatyana-35V7',
        name: 'Татьяна',
        role: 'cashier',
        locationSlugs: ['rodnik'],
        aliases: ['rodnik_tatyana'],
    },
    {
        login: 'admin',
        password: 'Admin-54P8',
        name: 'Администратор',
        role: 'admin',
        locationSlugs: ['main-warehouse', 'tochka', 'rodnik'],
    },
]

function findLocation(slug: string): WarehouseLocation {
    return WAREHOUSE_LOCATIONS.find(location => location.slug === slug) || WAREHOUSE_LOCATIONS[1]
}

function findUser(login: string): WarehouseUser | null {
    const normalizedLogin = login.trim().toLowerCase()

    return WAREHOUSE_USERS.find(user => {
        if (user.login === normalizedLogin) {
            return true
        }

        return user.aliases?.includes(normalizedLogin) || false
    }) || null
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

        const normalizedLogin = login.trim().toLowerCase()
        const selectedLocation = findLocation(selectedLocationSlug)
        const selectedUser = findUser(normalizedLogin)

        if (
            selectedUser &&
            password === selectedUser.password &&
            selectedUser.locationSlugs.includes(selectedLocation.slug)
        ) {
            setError('')
            clearCookie(LOCATION_COOKIE_NAME)
            clearCookie(USER_LOGIN_COOKIE_NAME)
            clearCookie(USER_NAME_COOKIE_NAME)
            clearCookie(USER_ROLE_COOKIE_NAME)

            setCookie(LOCATION_COOKIE_NAME, selectedLocation.slug, rememberMe)
            setCookie(USER_LOGIN_COOKIE_NAME, selectedUser.login, rememberMe)
            setCookie(USER_NAME_COOKIE_NAME, selectedUser.name, rememberMe)
            setCookie(USER_ROLE_COOKIE_NAME, selectedUser.role, rememberMe)

            if (rememberMe) {
                localStorage.setItem(AUTH_USER_KEY, selectedUser.login)
                localStorage.setItem(AUTH_LOGIN_KEY, selectedUser.login)
                localStorage.setItem(AUTH_USER_NAME_KEY, selectedUser.name)
                localStorage.setItem(AUTH_USER_ROLE_KEY, selectedUser.role)
                localStorage.setItem(REMEMBER_ME_KEY, 'true')
                localStorage.setItem(AUTH_LOCATION_SLUG_KEY, selectedLocation.slug)
                localStorage.setItem(AUTH_LOCATION_NAME_KEY, selectedLocation.name)
                localStorage.setItem(AUTH_LOCATION_TYPE_KEY, selectedLocation.type)

                sessionStorage.removeItem(AUTH_USER_KEY)
                sessionStorage.removeItem(AUTH_USER_NAME_KEY)
                sessionStorage.removeItem(AUTH_USER_ROLE_KEY)
                sessionStorage.removeItem(AUTH_LOCATION_SLUG_KEY)
                sessionStorage.removeItem(AUTH_LOCATION_NAME_KEY)
                sessionStorage.removeItem(AUTH_LOCATION_TYPE_KEY)
            } else {
                sessionStorage.setItem(AUTH_USER_KEY, selectedUser.login)
                sessionStorage.setItem(AUTH_USER_NAME_KEY, selectedUser.name)
                sessionStorage.setItem(AUTH_USER_ROLE_KEY, selectedUser.role)
                sessionStorage.setItem(AUTH_LOCATION_SLUG_KEY, selectedLocation.slug)
                sessionStorage.setItem(AUTH_LOCATION_NAME_KEY, selectedLocation.name)
                sessionStorage.setItem(AUTH_LOCATION_TYPE_KEY, selectedLocation.type)

                localStorage.removeItem(AUTH_USER_KEY)
                localStorage.removeItem(AUTH_LOGIN_KEY)
                localStorage.removeItem(AUTH_USER_NAME_KEY)
                localStorage.removeItem(AUTH_USER_ROLE_KEY)
                localStorage.removeItem(REMEMBER_ME_KEY)
                localStorage.removeItem(AUTH_LOCATION_SLUG_KEY)
                localStorage.removeItem(AUTH_LOCATION_NAME_KEY)
                localStorage.removeItem(AUTH_LOCATION_TYPE_KEY)
            }

            router.push('/system')
            return
        }

        if (selectedUser && password === selectedUser.password && !selectedUser.locationSlugs.includes(selectedLocation.slug)) {
            setError(`Пользователь «${selectedUser.name}» не имеет доступа к зоне «${selectedLocation.name}»`)
            return
        }

        setError('Неверный логин, пароль или выбранная торговая зона')
    }

    const selectedLocation = findLocation(selectedLocationSlug)

    return (
        <div className="auth-page min-h-screen bg-[#cfcfcf] flex items-center justify-center px-4 py-6">
            <div className="auth-card w-full max-w-[500px] relative rounded-[30px] border-[3px] border-[#e67c63] bg-white shadow-[0_8px_20px_rgba(0,0,0,0.12)] px-9 pb-8 pt-9">
                <div className="auth-logo absolute left-1/2 -translate-x-1/2 -top-[24px] w-[315px] max-w-[88%] h-[130px] pointer-events-none select-none">
                    <Image
                        src="/logo.gif"
                        alt="Точка"
                        fill
                        className="object-contain"
                        priority
                        unoptimized
                    />
                </div>

                <form onSubmit={handleSubmit} className="auth-form flex flex-col pt-[78px]">
                    <label className="auth-label text-[16px] font-semibold text-[#222] mb-2.5">
                        Торговая зона
                    </label>

                    <select
                        value={selectedLocationSlug}
                        onChange={(e) => {
                            setSelectedLocationSlug(e.target.value)
                            if (error) setError('')
                        }}
                        className="auth-input h-[60px] rounded-[22px] border-[2px] border-[#e67c63] bg-white px-6 text-[19px] text-[#222] outline-none mb-4"
                    >
                        {WAREHOUSE_LOCATIONS.map(location => (
                            <option key={location.slug} value={location.slug}>
                                {location.name}
                            </option>
                        ))}
                    </select>

                    <label className="auth-label text-[16px] font-semibold text-[#222] mb-2.5">
                        Логин
                    </label>

                    <input
                        type="text"
                        value={login}
                        onChange={(e) => {
                            setLogin(e.target.value)
                            if (error) setError('')
                        }}
                        placeholder="Например: lada"
                        autoComplete="username"
                        className="auth-input h-[60px] rounded-[22px] border-[2px] border-[#e67c63] px-6 text-[19px] text-[#222] placeholder:text-[#b9b9b9] outline-none mb-4"
                    />

                    <label className="auth-label text-[16px] font-semibold text-[#222] mb-2.5">
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
                        className="auth-input h-[60px] rounded-[22px] border-[2px] border-[#e67c63] px-6 text-[19px] text-[#222] placeholder:text-[#b9b9b9] outline-none"
                    />

                    <label className="auth-remember flex items-center gap-3.5 mt-5 mb-4 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            className="auth-checkbox h-6 w-6 min-w-6 appearance-none rounded-full bg-[#d9d9d9] checked:bg-[#e67c63]"
                        />

                        <span className="auth-remember-text text-[17px] text-[#4a4a4a]">
                            Запомнить меня
                        </span>
                    </label>

                    {error && (
                        <p className="auth-error mb-3 rounded-xl bg-red-50 px-3 py-2 text-[14px] leading-5 text-red-600">
                            {error}
                        </p>
                    )}

                    <div className="auth-actions flex items-center justify-between gap-4">
                        <button
                            type="submit"
                            className="auth-submit h-[56px] min-w-[175px] rounded-full bg-[#e67c63] px-10 text-[24px] font-semibold text-white transition hover:opacity-90"
                        >
                            Войти
                        </button>

                        <div className="auth-location-hint text-right text-[14px] leading-[1.4] text-[#6b6b6b]">
                            Зона входа:<br />
                            <span className="font-semibold text-[#333]">{selectedLocation.name}</span>
                        </div>
                    </div>
                </form>
            </div>

            <style>{`
                .auth-input:focus {
                    box-shadow: 0 0 0 3px rgba(230, 124, 99, 0.18);
                }

                @media (min-width: 769px) and (min-height: 721px) {
                    .auth-page {
                        padding-top: 64px;
                        padding-bottom: 44px;
                    }

                    .auth-logo {
                        top: -24px;
                        width: 315px;
                        height: 130px;
                    }

                    .auth-form {
                        padding-top: 78px;
                    }
                }

                @media (max-height: 720px) and (min-width: 481px) {
                    .auth-page {
                        padding-top: 24px;
                        padding-bottom: 20px;
                    }

                    .auth-card {
                        max-width: 470px;
                        border-radius: 26px;
                        padding: 22px 30px 26px;
                    }

                    .auth-logo {
                        top: -40px;
                        width: 285px;
                        height: 200px;
                    }

                    .auth-form {
                        padding-top: 68px;
                    }

                    .auth-input {
                        height: 52px;
                        border-radius: 18px;
                        font-size: 17px;
                    }

                    .auth-label {
                        font-size: 15px;
                        margin-bottom: 7px;
                    }

                    .auth-submit {
                        height: 50px;
                        font-size: 21px;
                    }
                }

                @media (max-width: 768px) {
                    .auth-page {
                        align-items: flex-start;
                        padding: 80px 16px 24px;
                    }

                    .auth-card {
                        max-width: 460px;
                        border-radius: 26px;
                        padding: 28px 28px 28px;
                    }

                    .auth-logo {
                        top: -30px;
                        width: 300px;
                        height: 180px;
                    }

                    .auth-form {
                        padding-top: 72px;
                    }

                    .auth-input {
                        height: 54px;
                        border-radius: 18px;
                        padding-left: 20px;
                        padding-right: 20px;
                        font-size: 17px;
                    }

                    .auth-actions {
                        align-items: stretch;
                        flex-direction: column;
                        gap: 14px;
                    }

                    .auth-submit {
                        width: 100%;
                        height: 52px;
                        font-size: 22px;
                    }

                    .auth-location-hint {
                        text-align: center;
                    }
                }

                @media (max-width: 480px) {
                    .auth-page {
                        padding: 70px 12px 18px;
                    }

                    .auth-card {
                        max-width: 100%;
                        border-width: 2px;
                        border-radius: 24px;
                        padding: 24px 20px 24px;
                    }

                    .auth-logo {
                        top: -25px;
                        width: 250px;
                        height: 150px;
                    }

                    .auth-form {
                        padding-top: 60px;
                    }

                    .auth-label {
                        font-size: 15px;
                        margin-bottom: 7px;
                    }

                    .auth-input {
                        height: 50px;
                        border-width: 2px;
                        border-radius: 16px;
                        padding-left: 18px;
                        padding-right: 18px;
                        font-size: 16px;
                        margin-bottom: 13px;
                    }

                    .auth-remember {
                        gap: 10px;
                        margin-top: 13px;
                        margin-bottom: 13px;
                    }

                    .auth-checkbox {
                        width: 20px;
                        height: 20px;
                        min-width: 20px;
                    }

                    .auth-remember-text {
                        font-size: 15px;
                    }

                    .auth-error {
                        font-size: 14px;
                    }

                    .auth-submit {
                        min-width: 0;
                        height: 50px;
                        font-size: 21px;
                    }
                }

                @media (max-width: 360px) {
                    .auth-page {
                        padding-top: 62px;
                    }

                    .auth-card {
                        padding-left: 16px;
                        padding-right: 16px;
                    }

                    .auth-logo {
                        width: 210px;
                        height: 108px;
                    }

                    .auth-form {
                        padding-top: 52px;
                    }

                    .auth-input {
                        height: 47px;
                        font-size: 15px;
                    }

                    .auth-submit {
                        height: 48px;
                        font-size: 20px;
                    }
                }
            `}</style>
        </div>
    )
}

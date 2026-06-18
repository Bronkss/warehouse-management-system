'use client'

import * as React from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

const AUTH_USER_KEY = 'warehouse_auth_user'
const AUTH_LOGIN_KEY = 'warehouse_auth_login'
const REMEMBER_ME_KEY = 'warehouse_remember_me'

export default function Auth() {
    const router = useRouter()

    const [login, setLogin] = React.useState('')
    const [password, setPassword] = React.useState('')
    const [rememberMe, setRememberMe] = React.useState(false)
    const [error, setError] = React.useState('')

    React.useEffect(() => {
        const savedRememberMe = localStorage.getItem(REMEMBER_ME_KEY) === 'true'
        const savedLogin = localStorage.getItem(AUTH_LOGIN_KEY)
        const savedLocalUser = localStorage.getItem(AUTH_USER_KEY)
        const savedSessionUser = sessionStorage.getItem(AUTH_USER_KEY)

        if (savedRememberMe) {
            setRememberMe(true)

            if (savedLogin) {
                setLogin(savedLogin)
            }
        }

        if (savedLocalUser === 'admin' || savedSessionUser === 'admin') {
            router.replace('/system')
        }
    }, [router])

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()

        const normalizedLogin = login.trim()

        if (normalizedLogin === 'admin' && password === '112233') {
            setError('')

            if (rememberMe) {
                localStorage.setItem(AUTH_USER_KEY, 'admin')
                localStorage.setItem(AUTH_LOGIN_KEY, normalizedLogin)
                localStorage.setItem(REMEMBER_ME_KEY, 'true')
                sessionStorage.removeItem(AUTH_USER_KEY)
            } else {
                sessionStorage.setItem(AUTH_USER_KEY, 'admin')
                localStorage.removeItem(AUTH_USER_KEY)
                localStorage.removeItem(AUTH_LOGIN_KEY)
                localStorage.removeItem(REMEMBER_ME_KEY)
            }

            router.push('/system')
            return
        }

        setError('Неверный логин или пароль')
    }

    return (
        <div className="auth-page min-h-screen bg-[#cfcfcf] flex items-center justify-center px-4">
            <div className="auth-card w-full max-w-[520px] relative rounded-[32px] border-[3px] border-[#e67c63] bg-white shadow-[0_8px_20px_rgba(0,0,0,0.12)] px-10 py-8">
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
                        className="auth-input h-[78px] rounded-[26px] border-[3px] border-[#e67c63] px-8 text-[20px] text-[#222] placeholder:text-[#c9c9c9] outline-none mb-7"
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
                        className="auth-input h-[78px] rounded-[26px] border-[3px] border-[#e67c63] px-8 text-[20px] text-[#222] placeholder:text-[#c9c9c9] outline-none"
                    />

                    <button
                        type="button"
                        className="auth-forgot self-end mt-2 text-[16px] text-[#8d8d8d] hover:text-[#666] transition"
                    >
                        Забыли пароль?
                    </button>

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

                        <button
                            type="button"
                            className="auth-register text-left text-[18px] leading-[1.4] text-[#3b3b3b] hover:text-[#e67c63] transition"
                        >
                            Впервые в Точке?
                            <br />
                            Зарегистрироваться
                        </button>
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
                        height: 66px;
                        border-radius: 22px;
                        padding-left: 22px;
                        padding-right: 22px;
                        font-size: 18px;
                    }

                    .auth-forgot {
                        font-size: 15px;
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

                    .auth-register {
                        width: 100%;
                        text-align: center;
                        font-size: 17px;
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
                        height: 58px;
                        border-width: 2px;
                        border-radius: 18px;
                        padding-left: 18px;
                        padding-right: 18px;
                        font-size: 16px;
                    }

                    .auth-input:first-of-type {
                        margin-bottom: 22px;
                    }

                    .auth-forgot {
                        margin-top: 8px;
                        font-size: 14px;
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

                    .auth-register {
                        font-size: 16px;
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
                        height: 54px;
                        font-size: 15px;
                    }

                    .auth-submit {
                        height: 50px;
                        font-size: 20px;
                    }

                    .auth-register,
                    .auth-remember-text {
                        font-size: 15px;
                    }
                }
            `}</style>
        </div>
    )
}
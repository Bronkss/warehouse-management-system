'use client'

import * as React from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

export default function Auth() {
    const router = useRouter()

    const [login, setLogin] = React.useState('')
    const [password, setPassword] = React.useState('')
    const [rememberMe, setRememberMe] = React.useState(false)
    const [error, setError] = React.useState('')

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()

        if (login.trim() === 'admin' && password === '112233') {
            setError('')

            if (rememberMe) {
                localStorage.setItem('auth_user', 'admin')
            } else {
                sessionStorage.setItem('auth_user', 'admin')
            }

            router.push('/system')
            return
        }

        setError('Неверный логин или пароль')
    }

    return (
        <div className="min-h-screen bg-[#cfcfcf] flex items-center justify-center px-4">
            <div
                className="w-full max-w-[520px] relative rounded-[32px] border-[3px] border-[#e67c63] bg-white shadow-[0_8px_20px_rgba(0,0,0,0.12)] px-10 py-8">

                <div
                    className="absolute left-1/2 -translate-x-1/2 -top-[50px] w-[460px] max-w-[95%] h-[250px] pointer-events-none select-none">
                    <Image
                        src="/logo.gif"
                        alt="Точка"
                        fill
                        className="object-contain"
                        priority
                        unoptimized
                    />
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col pt-[80px]">
                    <label className="text-[18px] text-[#222] mb-3">
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
                        className="h-[78px] rounded-[26px] border-[3px] border-[#e67c63] px-8 text-[20px] text-[#222] placeholder:text-[#c9c9c9] outline-none mb-7"
                    />

                    <label className="text-[18px] text-[#222] mb-3">
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
                        className="h-[78px] rounded-[26px] border-[3px] border-[#e67c63] px-8 text-[20px] text-[#222] placeholder:text-[#c9c9c9] outline-none"
                    />

                    <button
                        type="button"
                        className="self-end mt-2 text-[16px] text-[#8d8d8d] hover:text-[#666] transition"
                    >
                        Забыли пароль?
                    </button>

                    <label className="flex items-center gap-4 mt-5 mb-4 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            className="h-6 w-6 appearance-none rounded-full bg-[#d9d9d9] checked:bg-[#e67c63]"
                        />

                        <span className="text-[18px] text-[#4a4a4a]">
                            Запомнить меня
                        </span>
                    </label>

                    {error && (
                        <p className="mb-5 text-[16px] text-red-500">
                            {error}
                        </p>
                    )}

                    <div className="flex items-end justify-between gap-4">
                        <button
                            type="submit"
                            className="min-w-[190px] h-[56px] rounded-full bg-[#e67c63] text-white text-[28px] font-semibold hover:opacity-90 transition"
                        >
                            Войти
                        </button>

                        <button
                            type="button"
                            className="text-left text-[18px] leading-[1.4] text-[#3b3b3b] hover:text-[#e67c63] transition"
                        >
                            Впервые в Точке?
                            <br/>
                            Зарегистрироваться
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
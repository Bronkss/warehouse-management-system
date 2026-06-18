'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {ReactNode} from 'react'
import {usePathname} from 'next/navigation'

const menuItems = [
    {title: 'Товары', icon: '/icons/tovar.png', linkName: 'products'},
    {title: 'Продажи', icon: '/icons/order.png', linkName: 'sales'},
    {title: 'Приемки', icon: '/icons/priemka.png', linkName: 'priemka'},
    {title: 'Отгрузки', icon: '/icons/otgruzki.png', linkName: 'otgruzki'},
    {title: 'Списания', icon: '/icons/spisaniya.png', linkName: 'not-found'},
    {title: 'Поставщики', icon: '/icons/postavshiki.png', linkName: 'not-found'},
    {title: 'Инвентаризация', icon: '/icons/inventarizachiya.png', linkName: 'not-found'},
    {title: 'Статистика', icon: '/icons/statistic.png', linkName: 'not-found'},
]

type Props = {
    children: ReactNode
}

export default function System({children}: Props) {
    const pathname = usePathname()
    const [isMenuOpen, setIsMenuOpen] = React.useState(false)

    React.useEffect(() => {
        setIsMenuOpen(false)
    }, [pathname])

    return (
        <div className="system-root w-full min-h-screen bg-[#ececec] m-0 p-0">
            <div className="system-wrapper min-h-[calc(100vh-16px)] overflow-hidden bg-[#ececec]">
                <header className="system-header bg-[#e5765d]">
                    <div className="system-header-content flex items-center justify-between bg-[#e5765d] px-8 py-7">
                        <button
                            type="button"
                            onClick={() => setIsMenuOpen((prev) => !prev)}
                            className="system-mobile-menu-button h-[44px] items-center gap-2 rounded-full bg-[#f1f1f1] px-5 text-[15px] font-normal text-[#3a3a3a] shadow-sm transition hover:bg-white"
                        >
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e5765d]/10">
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-[#e5765d]"
        >
            <path
                d="M4 7H20"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
            />
            <path
                d="M4 12H20"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
            />
            <path
                d="M4 17H20"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
            />
        </svg>
    </span>

                            <span>Меню</span>
                        </button>

                        <nav className="system-desktop-menu flex flex-wrap items-center gap-5">
                            {menuItems.map((item) => {
                                const href = `/${item.linkName}`
                                const isActive = pathname === href

                                return (
                                    <Link
                                        href={href}
                                        key={item.title}
                                        className={`flex h-[44px] items-center gap-2 rounded-full px-5 text-[15px] font-normal shadow-sm transition ${
                                            isActive
                                                ? 'bg-white text-[#e5765d]'
                                                : 'bg-[#f1f1f1] text-[#3a3a3a] hover:bg-white'
                                        }`}
                                    >
                                        <span className="relative flex h-[20px] w-[20px] items-center justify-center">
                                            <Image
                                                src={item.icon}
                                                alt={item.title}
                                                fill
                                                className="object-contain"
                                            />
                                        </span>

                                        <span>{item.title}</span>
                                    </Link>
                                )
                            })}
                        </nav>

                        <div className="system-mobile-title text-sm font-semibold text-white">
                            Панель
                        </div>

                        <button
                            type="button"
                            className="system-profile-button ml-6 flex h-[48px] w-[48px] items-center justify-center rounded-full"
                            aria-label="Профиль"
                        >
                            <span className="relative flex h-[48px] w-[48px] items-center justify-center">
                                <Image
                                    src="/icons/lk.png"
                                    alt="Профиль"
                                    fill
                                    className="object-contain"
                                />
                            </span>
                        </button>
                    </div>

                    {isMenuOpen && (
                        <div className="system-mobile-dropdown border-t border-white/20 px-4 pb-4">
                            <nav className="grid grid-cols-1 gap-2 pt-3">
                                {menuItems.map((item) => {
                                    const href = `/${item.linkName}`
                                    const isActive = pathname === href

                                    return (
                                        <Link
                                            href={href}
                                            key={item.title}
                                            className={`flex h-[48px] items-center gap-3 rounded-2xl px-4 text-sm font-medium shadow-sm transition ${
                                                isActive
                                                    ? 'bg-white text-[#e5765d]'
                                                    : 'bg-[#f1f1f1] text-[#3a3a3a] hover:bg-white'
                                            }`}
                                        >
                                            <span
                                                className="relative flex h-[22px] w-[22px] shrink-0 items-center justify-center">
                                                <Image
                                                    src={item.icon}
                                                    alt={item.title}
                                                    fill
                                                    className="object-contain"
                                                />
                                            </span>

                                            <span className="truncate">
                                                {item.title}
                                            </span>
                                        </Link>
                                    )
                                })}
                            </nav>
                        </div>
                    )}
                </header>

                <main className="system-main min-h-[calc(100vh-112px)] bg-[#ececec]">
                    {children}

                    {!children && (
                        <div className="welcome-section px-8 pb-10 pt-6">
                            <div
                                className="welcome-card relative overflow-hidden rounded-[34px] border border-white/80 bg-white shadow-[0_22px_70px_rgba(0,0,0,0.08)]">
                                <div
                                    className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[#e5765d]/20 blur-3xl"/>
                                <div
                                    className="absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-orange-200/50 blur-3xl"/>
                                <div
                                    className="absolute right-0 top-0 h-full w-[38%] bg-gradient-to-br from-[#e5765d]/16 via-[#e5765d]/6 to-transparent"/>

                                <div
                                    className="welcome-card-content relative flex items-center justify-between gap-8 p-8">
                                    <div className="welcome-info flex items-start gap-5">
                                        <div
                                            className="welcome-icon flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] bg-[#e5765d] text-3xl shadow-[0_16px_35px_rgba(229,118,93,0.35)]">
                                            ✨
                                        </div>

                                        <div>
                                            <div
                                                className="mb-3 inline-flex items-center rounded-full border border-[#e5765d]/15 bg-[#fff7f4] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#e5765d] shadow-sm">
                                                Скоро будет готово
                                            </div>

                                            <h2 className="welcome-title text-[30px] font-semibold leading-tight text-[#2f2f2f]">
                                                Обучение по разделам
                                            </h2>

                                            <p className="welcome-text mt-3 max-w-4xl text-[16px] leading-7 text-[#646464]">
                                                Тут будет обучение по разделам, пока можешь перейти в каждый и
                                                посмотреть что там есть, Интрига :D
                                            </p>
                                        </div>
                                    </div>

                                    <Link
                                        href="/products"
                                        className="welcome-button flex h-12 shrink-0 items-center justify-center rounded-2xl bg-[#2f2f2f] px-6 text-sm font-medium text-white shadow-[0_12px_28px_rgba(0,0,0,0.14)] transition hover:bg-[#1f1f1f]"
                                    >
                                        Посмотреть разделы
                                    </Link>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>

            <style jsx>{`
                .system-mobile-menu-button {
                    display: none;
                }

                .system-mobile-title {
                    display: none;
                }

                .system-mobile-dropdown {
                    display: none;
                }

                @media (max-width: 767px) {
                    .system-header-content {
                        padding: 16px;
                    }

                    .system-desktop-menu {
                        display: none;
                    }

                    .system-mobile-menu-button {
                        display: flex;
                    }

                    .system-mobile-title {
                        display: block;
                    }

                    .system-profile-button {
                        margin-left: 0;
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
            `}</style>
        </div>
    )
}
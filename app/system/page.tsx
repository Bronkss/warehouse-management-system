'use client'
import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ReactNode } from 'react';

const menuItems = [
    {title: 'Товары', icon: '/icons/tovar.png', linkName: 'products'},
    {title: 'Продажи', icon: '/icons/order.png', linkName: 'sales'},
    {title: 'Приемки', icon: '/icons/priemka.png', linkName: 'priemka'},
    {title: 'Отгрузки', icon: '/icons/otgruzki.png', linkName: 'otgruzki'},
    {title: 'Списания', icon: '/icons/spisaniya.png', linkName: 'not-found'},
    {title: 'Поставщики', icon: '/icons/postavshiki.png', linkName: 'not-found'},
    {title: 'Инвентаризация', icon: '/icons/inventarizachiya.png', linkName: 'not-found'},
    {title: 'Статистика', icon: '/icons/statistic.png', linkName: 'not-found'},
];

type Props = {
    children: ReactNode;
}

export default function System({ children }: Props) {
    return (
        <div className="w-full min-h-screen bg-[#ececec] m-0 p-0">
            <div className="min-h-[calc(100vh-16px)] overflow-hidden bg-[#ececec]">
                <header className="flex items-center justify-between bg-[#e5765d] px-8 py-7">
                    <nav className="flex flex-wrap items-center gap-5">
                        {menuItems.map((item) => (
                            <Link href={`/${item.linkName}`} // Нужно в строку передать linkName из объекта
                                key={item.title}
                                type="button"
                                className="flex h-[44px] items-center gap-2 rounded-full bg-[#f1f1f1] px-5 text-[15px] font-normal text-[#3a3a3a] shadow-sm transition hover:bg-white"
                            >
                                <span className="relative flex h-[20px] w-[20px] items-center justify-center">
                                    {item.icon ? (
                                        <Image
                                            src={item.icon}
                                            alt={item.title}
                                            fill
                                            className="object-contain"
                                        />
                                    ) : (
                                        <span className="block h-[20px] w-[20px] rounded-sm bg-transparent"/>
                                    )}
                                </span>

                                <span>{item.title}</span>
                            </Link>
                        ))}
                    </nav>

                    <button
                        type="button"
                        className="ml-6 flex h-[48px] w-[48px] items-center justify-center rounded-full"
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
                </header>

                <main className="min-h-[calc(100vh-112px)] bg-[#ececec]">
                    {children}
                </main>
            </div>
        </div>
    );
}
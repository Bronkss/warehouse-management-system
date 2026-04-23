import * as React from 'react';
import Image from 'next/image';

const menuItems = [
    {title: 'Товары', icon: '/icons/tovar.png'},
    {title: 'Продажи', icon: '/icons/order.png'},
    {title: 'Приемки', icon: '/icons/priemka.png'},
    {title: 'Списания', icon: '/icons/spisaniya.png'},
    {title: 'Поставщики', icon: '/icons/postavshiki.png'},
    {title: 'Инвентаризация', icon: '/icons/inventarizachiya.png'},
    {title: 'Статистика', icon: '/icons/statistic.png'},
];

export default function System() {
    return (
        <div className="w-screen min-h-screen bg-[#ececec] m-0 p-0">
            <div className="min-h-[calc(100vh-16px)] overflow-hidden bg-[#ececec]">
                <header className="flex items-center justify-between bg-[#e5765d] px-8 py-7">
                    <nav className="flex flex-wrap items-center gap-5">
                        {menuItems.map((item) => (
                            <button
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
                            </button>
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

                <main className="min-h-[calc(100vh-112px)] bg-[#ececec]"/>
            </div>
        </div>
    );
}
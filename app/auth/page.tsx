import * as React from 'react';
import Image from 'next/image';

export default function Auth() {
    return (
        <div className="min-h-screen bg-[#cfcfcf] flex items-center justify-center px-4">
            <div className="w-full max-w-[520px] rounded-[32px] border-[3px] border-[#e67c63] bg-white shadow-[0_8px_20px_rgba(0,0,0,0.12)] px-10 py-8">

                <div className="flex justify-center mb-20">
                    <Image
                        src="/logo.gif"
                        alt="Точка"
                        width={350}
                        height={60}
                        className="block absolute z-0 top-[0%] select-none"
                    />
                </div>

                <form className="flex flex-col">
                    <label className="text-[18px] text-[#222] mb-3">Email</label>
                    <input
                        type="email"
                        placeholder="Введите email"
                        className="h-[78px] rounded-[26px] border-[3px] border-[#e67c63] px-8 text-[20px] text-[#222] placeholder:text-[#c9c9c9] outline-none mb-7 z-40"
                    />

                    <label className="text-[18px] text-[#222] mb-3">Пароль</label>
                    <input
                        type="password"
                        placeholder="Введите пароль"
                        className="h-[78px] rounded-[26px] border-[3px] border-[#e67c63] px-8 text-[20px] text-[#222] placeholder:text-[#c9c9c9] outline-none"
                    />

                    <button
                        type="button"
                        className="self-end mt-2 text-[16px] text-[#8d8d8d] hover:text-[#666] transition"
                    >
                        Забыли пароль?
                    </button>

                    <label className="flex items-center gap-4 mt-5 mb-8 cursor-pointer">
                        <input
                            type="checkbox"
                            className="h-6 w-6 appearance-none rounded-full bg-[#d9d9d9] checked:bg-[#e67c63]"
                        />
                        <span className="text-[18px] text-[#4a4a4a]">Запомнить меня</span>
                    </label>

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
                            <br />
                            Зарегистрироваться
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
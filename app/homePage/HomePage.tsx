import classes from './homePage.module.css'
import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
    return (
        <div className="min-h-screen bg-white">
            <div className="flex min-h-screen flex-col">
                <div className="flex h-24 items-center justify-between px-8">
                    <Image
                        src="/logo.png"
                        alt="логотип компании"
                        width={180}
                        height={50}
                        className="h-auto w-auto"
                    />
                    <div className="flex items-center gap-4">
                        <Link href="/auth" className="text-lg font-semibold text-[#2F351B] hover:text-[#556B1F] transition">
                            Войти в склад
                        </Link>
                        <Link href='/online-kassa' className="rounded-full bg-[#7C9B30] px-8 py-3 text-base font-semibold text-white hover:bg-[#6C8828] transition">
                            Онлайн-касса
                        </Link>
                    </div>
                </div>

                <div className="flex-1 px-2 pb-2">
                    <div
                        className="grid h-full w-full grid-cols-1 overflow-hidden rounded-[2.8rem] bg-[#6F8E2B] lg:grid-cols-2">
                        <div className="flex items-center px-8 py-12 lg:px-20">
                            <div className="max-w-[620px] text-left">
                                <h1 className="text-5xl font-bold leading-[0.95] text-white md:text-6xl lg:text-[76px]">
                                    Система
                                    <br/>
                                    складского
                                    <br/>
                                    учёта
                                </h1>

                                <p className="mt-6 max-w-[560px] text-xl leading-8 text-[#EEF5DA] md:text-2xl">
                                    Все, что нужно, в одной системе: продажи,
                                    закупки, учет, финансы, клиенты и поставщики.
                                    Чтобы приобрести данную систему нажмите на кнопку ниже.
                                </p>

                                <button
                                    className="mt-10 rounded-full bg-[#CFEA87] px-10 py-5 text-xl font-semibold text-[#263313] hover:bg-[#BEDA72] transition">
                                    <a href="https://t.me/boroda_slim">
                                        Связаться с разработчиком
                                    </a>
                                </button>
                            </div>
                        </div>

                        <div
                            className="relative flex items-center justify-center px-4 pb-8 lg:justify-end lg:px-0 lg:pb-0">

                            <Image
                                src="/prewie-system.png"
                                alt="система складского учета"
                                width={980}
                                height={760}
                                className="relative h-auto w-full max-w-[1000px] object-contain mr-10 rounded-xl"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
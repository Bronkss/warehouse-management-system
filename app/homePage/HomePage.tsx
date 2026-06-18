import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
    return (
        <div className="min-h-screen bg-white">
            <div className="flex min-h-screen flex-col">
                <header className="home-header flex h-24 items-center justify-between px-8">
                    <Image
                        src="/logo.png"
                        alt="логотип компании"
                        width={180}
                        height={50}
                        className="home-logo h-auto w-auto"
                    />

                    <nav className="home-nav flex items-center gap-4">
                        <Link
                            href="/auth"
                            className="home-login text-lg font-semibold text-[#2F351B] transition hover:text-[#556B1F]"
                        >
                            Войти в склад
                        </Link>

                        <Link
                            href="/online-kassa"
                            className="home-cash rounded-full bg-[#7C9B30] px-8 py-3 text-base font-semibold text-white transition hover:bg-[#6C8828]"
                        >
                            Онлайн-касса
                        </Link>
                    </nav>
                </header>

                <main className="flex-1 px-2 pb-2">
                    <section className="home-hero grid h-full w-full grid-cols-2 overflow-hidden rounded-[2.8rem] bg-[#6F8E2B]">
                        <div className="home-content flex items-center px-20 py-12">
                            <div className="home-text max-w-[620px] text-left px-10">
                                <h1 className="home-title tetx -[86px] font-bold leading-[0.95] text-white">
                                    Система
                                    <br />
                                    складского
                                    <br />
                                    учёта
                                </h1>

                                <p className="home-description mt-6 max-w-[560px] text-2xl leading-8 text-[#EEF5DA]">
                                    Все, что нужно, в одной системе: продажи,
                                    закупки, учет, финансы, клиенты и поставщики.
                                    Чтобы приобрести данную систему нажмите на кнопку ниже.
                                </p>

                                <a
                                    href="https://t.me/boroda_slim"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="home-button mt-10 inline-flex rounded-full bg-[#CFEA87] px-10 py-5 text-xl font-semibold text-[#263313] transition hover:bg-[#BEDA72]"
                                >
                                    Связаться с разработчиком
                                </a>
                            </div>
                        </div>

                        <div className="home-image-block relative flex items-center justify-end px-0 pb-0">
                            <Image
                                src="/prewie-system.png"
                                alt="система складского учета"
                                width={980}
                                height={760}
                                className="home-image relative mr-10 h-auto w-full max-w-[1000px] rounded-xl object-contain"
                            />
                        </div>
                    </section>
                </main>
            </div>

            <style>{`
                .home-hero {
                    min-height: calc(100vh - 104px);
                }
                
                .home-title {
                    font-size: 76px;
                }

                @media (max-width: 1200px) {
                    .home-content {
                        padding-left: 48px;
                        padding-right: 48px;
                    }

                    .home-title {
                        font-size: 64px;
                    }

                    .home-image {
                        margin-right: 16px;
                    }
                }

                @media (max-width: 1024px) {
                    .home-hero {
                        grid-template-columns: 1fr;
                        min-height: auto;
                    }

                    .home-content {
                        justify-content: center;
                        padding: 56px 48px 32px;
                    }

                    .home-text {
                        max-width: 720px;
                        text-align: center;
                    }

                    .home-title {
                        font-size: 60px;
                    }

                    .home-description {
                        margin-left: auto;
                        margin-right: auto;
                        max-width: 680px;
                        font-size: 22px;
                    }

                    .home-image-block {
                        justify-content: center;
                        padding: 8px 32px 40px;
                    }

                    .home-image {
                        max-width: 760px;
                        margin-right: 0;
                    }
                }

                @media (max-width: 768px) {
                    .home-header {
                        height: auto;
                        flex-direction: column;
                        gap: 20px;
                        padding: 20px 16px;
                    }

                    .home-logo {
                        width: 150px;
                    }

                    .home-nav {
                        width: 100%;
                        justify-content: center;
                        gap: 12px;
                    }

                    .home-login {
                        font-size: 16px;
                    }

                    .home-cash {
                        padding: 10px 24px;
                        font-size: 15px;
                    }

                    .home-hero {
                        border-radius: 28px;
                    }

                    .home-content {
                        padding: 44px 24px 24px;
                    }

                    .home-title {
                        font-size: 48px;
                        line-height: 1;
                    }

                    .home-description {
                        margin-top: 20px;
                        font-size: 18px;
                        line-height: 1.45;
                    }

                    .home-button {
                        width: 100%;
                        max-width: 360px;
                        justify-content: center;
                        margin-top: 32px;
                        padding: 16px 24px;
                        font-size: 17px;
                        text-align: center;
                    }

                    .home-image-block {
                        padding: 0 18px 32px;
                    }

                    .home-image {
                        max-width: 100%;
                        border-radius: 10px;
                    }
                }

                @media (max-width: 480px) {
                    .home-header {
                        gap: 16px;
                        padding: 16px 12px;
                    }

                    .home-logo {
                        width: 135px;
                    }

                    .home-nav {
                        flex-direction: column;
                        gap: 10px;
                    }

                    .home-login,
                    .home-cash {
                        width: 100%;
                        max-width: 280px;
                        text-align: center;
                    }

                    .home-cash {
                        padding: 12px 20px;
                    }

                    .home-hero {
                        border-radius: 22px;
                    }

                    .home-content {
                        padding: 36px 18px 20px;
                    }

                    .home-title {
                        font-size: 40px;
                    }

                    .home-description {
                        font-size: 16px;
                        line-height: 1.45;
                    }

                    .home-button {
                        max-width: 100%;
                        margin-top: 26px;
                        padding: 15px 20px;
                        font-size: 16px;
                    }

                    .home-image-block {
                        padding: 0 12px 26px;
                    }
                }

                @media (max-width: 360px) {
                    .home-title {
                        font-size: 34px;
                    }

                    .home-description {
                        font-size: 15px;
                    }

                    .home-button {
                        font-size: 15px;
                    }
                }
            `}</style>
        </div>
    );
}
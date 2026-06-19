import type {Metadata} from "next";
import {Geist, Geist_Mono} from "next/font/google";
import "./styles/globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "ТОЧКА система складского учёта",
    description: "Все, что нужно, в одной системе: продажи,\n" +
        "закупки, учет, финансы, клиенты и поставщики.\n" +
        "Чтобы приобрести данную систему нажмите на кнопку ниже.",
    icons: {
        icon: '/favicon.svg',
        shortcut: '/favicon.svg',
        apple: '/favicon.svg',
    },
};

export default function RootLayout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html
            lang="en"
            className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        >
        <body className="min-h-full flex flex-col m-0 p-0">{children}</body>
        </html>
    );
}

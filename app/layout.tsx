import type { Metadata } from 'next'
import {
    Geist,
    Geist_Mono,
} from 'next/font/google'

import './styles/globals.css'

import PosDebtLauncher from '@/app/components/PosDebtLauncher'
import DebtAdminLauncher from '@/app/components/DebtAdminLauncher'

const geistSans =
    Geist({
        variable:
            '--font-geist-sans',
        subsets: [
            'latin',
        ],
    })

const geistMono =
    Geist_Mono({
        variable:
            '--font-geist-mono',
        subsets: [
            'latin',
        ],
    })

export const metadata:
    Metadata = {
    title:
        'ТОЧКА система складского учёта',

    description:
        'Все, что нужно, в одной системе: продажи, закупки, учет, финансы, клиенты и поставщики.',

    icons: {
        icon:
            '/favicon.svg',
        shortcut:
            '/favicon.svg',
        apple:
            '/favicon.svg',
    },
}

export default function RootLayout({
                                       children,
                                   }: Readonly<{
    children:
        React.ReactNode
}>) {
    return (
        <html
            lang="ru"
            className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        >
        <body className="m-0 flex min-h-full flex-col p-0">
        {children}
        <PosDebtLauncher/>
        <DebtAdminLauncher/>
        </body>
        </html>
    )
}

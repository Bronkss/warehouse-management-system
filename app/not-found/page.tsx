import Link from 'next/link'

export default function NotFound() {
    return (
        <main className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
            <div className="max-w-lg text-center bg-white rounded-2xl shadow-lg p-8">
                <div className="text-7xl font-bold text-blue-600">
                    404
                </div>

                <h1 className="mt-4 text-2xl font-bold text-gray-900">
                    Функционал ещё не разработан
                </h1>

                <p className="mt-3 text-gray-500 leading-relaxed">
                    Эта страница или раздел пока находятся в разработке.
                    Функционал будет доступен после следующего обновления системы.
                </p>

                <div className="mt-8 flex justify-center gap-3">
                    <Link
                        href="/"
                        className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
                    >
                        На главную
                    </Link>

                    <Link
                        href="/products"
                        className="px-6 py-3 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                    >
                        К товарам
                    </Link>
                </div>
            </div>
        </main>
    )
}
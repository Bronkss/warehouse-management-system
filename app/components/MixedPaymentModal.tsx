'use client'

import {
    useEffect,
    useMemo,
    useState,
} from 'react'

import {
    motion,
} from 'framer-motion'

type Props = {
    total: number
    isPaying: boolean
    hasMarkedItems: boolean

    onCancel: () => void

    onConfirm: (
        cashAmount: number,
        cardAmount: number
    ) => void
}

function roundMoney(
    value: number
): number {
    return Math.round(
        (
            value +
            Number.EPSILON
        ) * 100
    ) / 100
}

function parseAmount(
    value: string
): number {
    const parsed =
        Number(
            value
                .replace(',', '.')
                .replace(/\s/g, '')
        )

    return Number.isFinite(
        parsed
    )
        ? roundMoney(
            parsed
        )
        : 0
}

function money(
    value: number
): string {
    return new Intl.NumberFormat(
        'ru-RU',
        {
            style: 'currency',
            currency: 'RUB',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }
    ).format(
        value || 0
    )
}

function amountInputValue(
    value: number
): string {
    return String(
        roundMoney(
            value
        )
    )
}

export default function MixedPaymentModal({
                                              total,
                                              isPaying,
                                              hasMarkedItems,
                                              onCancel,
                                              onConfirm,
                                          }: Props) {
    const [cashValue, setCashValue] =
        useState('')

    const [cardValue, setCardValue] =
        useState(
            amountInputValue(
                total
            )
        )

    useEffect(
        () => {
            setCashValue('')

            setCardValue(
                amountInputValue(
                    total
                )
            )
        },
        [
            total,
        ]
    )

    const cashAmount =
        useMemo(
            () =>
                parseAmount(
                    cashValue
                ),
            [
                cashValue,
            ]
        )

    const cardAmount =
        useMemo(
            () =>
                parseAmount(
                    cardValue
                ),
            [
                cardValue,
            ]
        )

    const paymentTotal =
        roundMoney(
            cashAmount +
            cardAmount
        )

    const difference =
        roundMoney(
            total -
            paymentTotal
        )

    const isValid =
        cashAmount > 0 &&
        cardAmount > 0 &&
        Math.abs(
            difference
        ) <= 0.009

    const updateCash = (
        value: string
    ) => {
        setCashValue(
            value
        )

        const cash =
            Math.max(
                0,
                Math.min(
                    total,
                    parseAmount(
                        value
                    )
                )
            )

        setCardValue(
            amountInputValue(
                Math.max(
                    0,
                    roundMoney(
                        total -
                        cash
                    )
                )
            )
        )
    }

    const updateCard = (
        value: string
    ) => {
        setCardValue(
            value
        )

        const card =
            Math.max(
                0,
                Math.min(
                    total,
                    parseAmount(
                        value
                    )
                )
            )

        setCashValue(
            amountInputValue(
                Math.max(
                    0,
                    roundMoney(
                        total -
                        card
                    )
                )
            )
        )
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <motion.div
                initial={{
                    opacity: 0,
                    scale: 0.96,
                }}
                animate={{
                    opacity: 1,
                    scale: 1,
                }}
                exit={{
                    opacity: 0,
                    scale: 0.96,
                }}
                className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
            >
                <h2 className="text-2xl font-bold text-gray-800">
                    Смешанная оплата
                </h2>

                <div className="mt-4 rounded-xl bg-indigo-50 p-4">
                    <div className="text-sm font-medium text-indigo-700">
                        Итого к оплате
                    </div>

                    <div className="mt-1 text-4xl font-black text-indigo-800">
                        {money(
                            total
                        )}
                    </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                        <label className="mb-2 block text-sm font-bold text-gray-700">
                            Наличными
                        </label>

                        <input
                            autoFocus
                            type="number"
                            min="0"
                            max={
                                total
                            }
                            step="0.01"
                            inputMode="decimal"
                            value={
                                cashValue
                            }
                            onChange={event =>
                                updateCash(
                                    event.target.value
                                )
                            }
                            className="w-full rounded-xl border border-emerald-300 px-4 py-3 text-2xl font-black text-emerald-800 outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-bold text-gray-700">
                            Картой
                        </label>

                        <input
                            type="number"
                            min="0"
                            max={
                                total
                            }
                            step="0.01"
                            inputMode="decimal"
                            value={
                                cardValue
                            }
                            onChange={event =>
                                updateCard(
                                    event.target.value
                                )
                            }
                            className="w-full rounded-xl border border-indigo-300 px-4 py-3 text-2xl font-black text-indigo-800 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                </div>

                <div className={`mt-4 rounded-xl p-4 ${
                    isValid
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-red-50 text-red-700'
                }`}>
                    <div className="flex justify-between gap-4 text-sm">
                        <span>
                            Наличными
                        </span>

                        <strong>
                            {money(
                                cashAmount
                            )}
                        </strong>
                    </div>

                    <div className="mt-1 flex justify-between gap-4 text-sm">
                        <span>
                            Картой
                        </span>

                        <strong>
                            {money(
                                cardAmount
                            )}
                        </strong>
                    </div>

                    <div className="mt-3 border-t border-current/10 pt-3">
                        <div className="flex justify-between gap-4 font-black">
                            <span>
                                Сумма частей
                            </span>

                            <span>
                                {money(
                                    paymentTotal
                                )}
                            </span>
                        </div>

                        {!isValid && (
                            <div className="mt-2 text-sm font-semibold">
                                {cashAmount <= 0 ||
                                cardAmount <= 0
                                    ? 'Для смешанной оплаты обе части должны быть больше 0 ₽.'
                                    : `Расхождение: ${money(Math.abs(difference))}`}
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                    <div className="text-sm font-bold text-indigo-700">
                        На банковском терминале провести
                    </div>

                    <div className="mt-1 text-3xl font-black text-indigo-900">
                        {money(
                            cardAmount
                        )}
                    </div>

                    <div className="mt-1 text-xs text-indigo-600">
                        Наличную часть положите в кассу отдельно.
                    </div>
                </div>

                <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                    Внутренний учёт сохранит точную разбивку наличных и карты.
                    {' '}
                    Для текущего локального агента АТОЛ смешанный чек временно отправляется как оплата картой на полную сумму.
                    {hasMarkedItems
                        ? ' В чеке есть маркированный товар, поэтому фискализация обязательна.'
                        : ''}
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <button
                        type="button"
                        disabled={
                            isPaying
                        }
                        onClick={
                            onCancel
                        }
                        className="rounded-lg border border-gray-300 px-5 py-2 hover:bg-gray-50 disabled:opacity-50"
                    >
                        Отмена
                    </button>

                    <button
                        type="button"
                        disabled={
                            isPaying ||
                            !isValid
                        }
                        onClick={() =>
                            onConfirm(
                                cashAmount,
                                cardAmount
                            )
                        }
                        className="rounded-lg bg-violet-600 px-5 py-2 font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                    >
                        Продолжить
                    </button>
                </div>
            </motion.div>
        </div>
    )
}

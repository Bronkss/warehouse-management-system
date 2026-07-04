'use client';

import * as React from 'react';

const DEFAULT_AGENT_URL = 'http://127.0.0.1:3108';
const DEFAULT_AGENT_TOKEN = 'my_secret';

const FISCAL_AGENT_URL_KEY = 'pos_fiscal_agent_url';
const FISCAL_AGENT_TOKEN_KEY = 'pos_fiscal_agent_token';

type AtolAgentSetupProps = {
    onClose: () => void;
};

type HealthResponse = {
    ok?: boolean;
    service?: string;
    mode?: string;
    port?: number;
    taxationType?: string;
    vatType?: string;
    markingStatusAttempts?: number;
    markingStatusIntervalMs?: number;
    message?: string;
};

const downloadTextFile = (fileName: string, content: string) => {
    const blob = new Blob([content], {
        type: 'text/plain;charset=utf-8',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
};

const normalizeUrl = (value: string): string => {
    const trimmed = value.trim().replace(/\/+$/, '');

    return trimmed || DEFAULT_AGENT_URL;
};

export default function AtolAgentSetup({ onClose }: AtolAgentSetupProps) {
    const [agentUrl, setAgentUrl] = React.useState(DEFAULT_AGENT_URL);
    const [agentToken, setAgentToken] = React.useState(DEFAULT_AGENT_TOKEN);
    const [status, setStatus] = React.useState<string | null>(null);
    const [isChecking, setIsChecking] = React.useState(false);

    React.useEffect(() => {
        const savedUrl = localStorage.getItem(FISCAL_AGENT_URL_KEY);
        const savedToken = localStorage.getItem(FISCAL_AGENT_TOKEN_KEY);

        setAgentUrl(savedUrl || DEFAULT_AGENT_URL);
        setAgentToken(savedToken || DEFAULT_AGENT_TOKEN);
    }, []);

    const saveBrowserSettings = () => {
        const safeUrl = normalizeUrl(agentUrl);
        const safeToken = agentToken.trim() || DEFAULT_AGENT_TOKEN;

        localStorage.setItem(FISCAL_AGENT_URL_KEY, safeUrl);
        localStorage.setItem(FISCAL_AGENT_TOKEN_KEY, safeToken);

        setAgentUrl(safeUrl);
        setAgentToken(safeToken);
        setStatus(`Настройки сохранены в браузере.\nАдрес агента: ${safeUrl}\nТокен: ${safeToken}`);
    };

    const applyDefaultSettings = () => {
        setAgentUrl(DEFAULT_AGENT_URL);
        setAgentToken(DEFAULT_AGENT_TOKEN);

        localStorage.setItem(FISCAL_AGENT_URL_KEY, DEFAULT_AGENT_URL);
        localStorage.setItem(FISCAL_AGENT_TOKEN_KEY, DEFAULT_AGENT_TOKEN);

        setStatus('Рабочая схема применена: 127.0.0.1:3108 / my_secret');
    };

    const downloadEnv = () => {
        const posOrigin = window.location.origin;
        const safeUrl = normalizeUrl(agentUrl);
        const parsedPort = (() => {
            try {
                return new URL(safeUrl).port || '3108';
            } catch {
                return '3108';
            }
        })();

        const envContent = `PORT=${parsedPort}
POS_ORIGIN=${posOrigin}
AGENT_TOKEN=${agentToken.trim() || DEFAULT_AGENT_TOKEN}

# Новая рабочая схема: АТОЛ Драйвер 10.10 через COM AddIn.Fptr10 и PowerShell bridge.
# Настройки подключения к ККТ берутся из сохранённых настроек драйвера АТОЛ.
ATOL_DRIVER_USE_SAVED_SETTINGS=true

# Эти параметры нужны только если отключить ATOL_DRIVER_USE_SAVED_SETTINGS.
# Оставь как есть, пока касса работает через настройки драйвера.
ATOL_DRIVER_PORT=USB
ATOL_DRIVER_COM_FILE=COM3
ATOL_DRIVER_IP_ADDRESS=127.0.0.1
ATOL_DRIVER_IP_PORT=5555

ATOL_TAXATION_TYPE=patent
ATOL_VAT_TYPE=none
ATOL_OPERATOR_NAME=Администратор
ATOL_OPERATOR_VATIN=

ATOL_POWERSHELL_TIMEOUT_MS=120000
MARKING_STATUS_ATTEMPTS=10
MARKING_STATUS_INTERVAL_MS=1200
`;

        downloadTextFile('.env', envContent);
    };

    const checkAgent = async () => {
        try {
            setIsChecking(true);
            setStatus(null);

            const response = await fetch(`${normalizeUrl(agentUrl)}/health`, {
                method: 'GET',
                headers: {
                    'X-POS-Agent-Token': agentToken.trim() || DEFAULT_AGENT_TOKEN,
                },
                cache: 'no-store',
            });

            const data = await response.json().catch(async () => {
                return {
                    ok: false,
                    message: await response.text().catch(() => 'Некорректный ответ агента'),
                } as HealthResponse;
            }) as HealthResponse;

            if (!response.ok || !data?.ok) {
                setStatus(`Ошибка подключения к агенту:\n${data?.message || JSON.stringify(data, null, 2)}`);
                return;
            }

            const modeText = data.mode ? `\nРежим: ${data.mode}` : '';
            const serviceText = data.service ? `\nСервис: ${data.service}` : '';
            const taxText = data.taxationType ? `\nСНО: ${data.taxationType}` : '';
            const vatText = data.vatType ? `\nНДС: ${data.vatType}` : '';
            const markingText = data.markingStatusAttempts
                ? `\nПроверка маркировки: ${data.markingStatusAttempts} × ${data.markingStatusIntervalMs || 1200} мс`
                : '';

            setStatus(`Связь с локальным агентом есть.${serviceText}${modeText}${taxText}${vatText}${markingText}`);
        } catch {
            setStatus(
                'Не удалось подключиться к локальному агенту. Проверьте:\n' +
                '1. На ПК кассы установлен АТОЛ Драйвер ККТ 10.10.8.\n' +
                '2. В папке агента есть server.js, package.json, .env и bridge/atol-json.ps1.\n' +
                '3. Запущен start-agent.bat.\n' +
                '4. В консоли агента написано: http://127.0.0.1:3108.'
            );
        } finally {
            setIsChecking(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 px-4 py-4"
            onClick={onClose}
        >
            <div
                className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="border-b border-gray-100 px-5 py-5 sm:px-6">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">
                                АТОЛ Драйвер 10.10 / COM bridge
                            </div>

                            <h2 className="mt-1 text-2xl font-bold text-gray-900">
                                Настройка локальной ККТ
                            </h2>

                            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
                                Эта настройка нужна только для рабочего места кассира. Касса подключается к локальному агенту
                                на <b>127.0.0.1:3108</b>, агент общается с АТОЛ Драйвером через COM и PowerShell bridge.
                                Маркировка проверяется до добавления в чек и повторно перед фискализацией.
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="text-2xl text-gray-400 hover:text-gray-600"
                        >
                            ×
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                    <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-gray-200 p-4">
                                <h3 className="text-lg font-bold text-gray-900">
                                    1. Скачать и подготовить файлы агента
                                </h3>

                                <p className="mt-2 text-sm leading-6 text-gray-600">
                                    На ПК кассы создай отдельную папку, например
                                    <b> D:\warehouse-management-system\app\atol-local-agent-driver</b>.
                                    В неё положи файлы ниже. Файл PowerShell должен лежать именно в подпапке
                                    <b> bridge</b>.
                                </p>

                                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                    <a
                                        href="/downloads/atol-agent/server.js"
                                        download
                                        className="rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-slate-800"
                                    >
                                        Скачать server.js
                                    </a>

                                    <a
                                        href="/downloads/atol-agent/package.json"
                                        download
                                        className="rounded-xl border border-gray-300 px-4 py-3 text-center text-sm font-semibold hover:bg-gray-50"
                                    >
                                        Скачать package.json
                                    </a>

                                    <a
                                        href="/downloads/atol-agent/bridge/atol-json.ps1"
                                        download
                                        className="rounded-xl border border-gray-300 px-4 py-3 text-center text-sm font-semibold hover:bg-gray-50"
                                    >
                                        Скачать bridge/atol-json.ps1
                                    </a>

                                    <a
                                        href="/downloads/atol-agent/start-agent.bat"
                                        download
                                        className="rounded-xl border border-gray-300 px-4 py-3 text-center text-sm font-semibold hover:bg-gray-50"
                                    >
                                        Скачать start-agent.bat
                                    </a>

                                    <button
                                        type="button"
                                        onClick={downloadEnv}
                                        className="rounded-xl border border-indigo-300 px-4 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 sm:col-span-2"
                                    >
                                        Скачать .env под этот браузер
                                    </button>

                                    <a
                                        href="/downloads/atol-agent/README-KKT.txt"
                                        download
                                        className="rounded-xl border border-blue-300 px-4 py-3 text-center text-sm font-semibold text-blue-700 hover:bg-blue-50 sm:col-span-2"
                                    >
                                        Скачать подробную инструкцию TXT
                                    </a>
                                </div>

                                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                                    В папке агента должна получиться структура:
                                    <pre className="mt-2 overflow-x-auto rounded-lg bg-white/70 p-3 text-xs text-amber-900">{`server.js
package.json
.env
start-agent.bat
bridge\atol-json.ps1`}</pre>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-gray-200 p-4">
                                <h3 className="text-lg font-bold text-gray-900">
                                    2. Драйвер ККТ АТОЛ 10.10.8
                                </h3>

                                <p className="mt-2 text-sm leading-6 text-gray-600">
                                    Скачай и установи драйвер под разрядность Windows на кассовом ПК. После установки открой
                                    утилиту драйвера АТОЛ, проверь связь с ККТ и сохрани настройки подключения. Агент использует
                                    сохранённые настройки драйвера.
                                </p>

                                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                    <a
                                        href="/downloads/KKT10-10.10.8.0-windows64-setup.exe"
                                        download
                                        className="rounded-xl bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-700"
                                    >
                                        Скачать драйвер 64-bit
                                    </a>

                                    <a
                                        href="/downloads/KKT10-10.10.8.0-windows32-setup.exe"
                                        download
                                        className="rounded-xl bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-700"
                                    >
                                        Скачать драйвер 32-bit
                                    </a>
                                </div>

                                <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-600">
                                    Эти два файла нужно положить в <b>public/downloads</b> проекта:
                                    <br />
                                    <span className="font-mono text-xs">KKT10-10.10.8.0-windows64-setup.exe</span>
                                    <br />
                                    <span className="font-mono text-xs">KKT10-10.10.8.0-windows32-setup.exe</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="rounded-2xl border border-gray-200 p-4">
                                <h3 className="text-lg font-bold text-gray-900">
                                    3. Настроить этот браузер
                                </h3>

                                <p className="mt-2 text-sm leading-6 text-gray-600">
                                    Эти значения сохраняются только в этом браузере кассы. Для текущей рабочей схемы используй
                                    стандартные значения ниже.
                                </p>

                                <label className="mt-4 mb-2 block text-sm font-medium text-gray-700">
                                    Адрес локального агента
                                </label>

                                <input
                                    type="text"
                                    value={agentUrl}
                                    onChange={(event) => setAgentUrl(event.target.value)}
                                    className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                                />

                                <label className="mt-4 mb-2 block text-sm font-medium text-gray-700">
                                    Токен агента
                                </label>

                                <input
                                    type="text"
                                    value={agentToken}
                                    onChange={(event) => setAgentToken(event.target.value)}
                                    className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                                />

                                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                    <button
                                        type="button"
                                        onClick={applyDefaultSettings}
                                        className="rounded-xl border border-indigo-300 px-4 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                                    >
                                        Вставить рабочую схему
                                    </button>

                                    <button
                                        type="button"
                                        onClick={saveBrowserSettings}
                                        className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
                                    >
                                        Сохранить в браузере
                                    </button>

                                    <button
                                        type="button"
                                        onClick={checkAgent}
                                        disabled={isChecking}
                                        className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 sm:col-span-2"
                                    >
                                        {isChecking ? 'Проверяю связь...' : 'Проверить связь с ККТ'}
                                    </button>
                                </div>

                                {status && (
                                    <div className="mt-4 whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-700">
                                        {status}
                                    </div>
                                )}
                            </div>

                            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
                                <h3 className="text-base font-bold text-blue-900">
                                    Что включать перед продажей
                                </h3>

                                <ol className="mt-2 list-decimal space-y-2 pl-5">
                                    <li>Подключи ККТ к ПК и включи питание ККТ.</li>
                                    <li>Убедись, что АТОЛ Драйвер 10.10.8 видит кассу и тест связи проходит.</li>
                                    <li>Запусти <b>start-agent.bat</b>. В консоли должно быть <b>http://127.0.0.1:3108</b>.</li>
                                    <li>В этой форме нажми <b>Сохранить в браузере</b>, затем <b>Проверить связь</b>.</li>
                                    <li>После успешной проверки можно открывать смену и пробивать чеки.</li>
                                </ol>
                            </div>

                            <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm leading-6 text-red-800">
                                <h3 className="text-base font-bold text-red-900">
                                    Важно по маркировке
                                </h3>

                                <p className="mt-2">
                                    Маркированный товар можно продать только после результата <b>[M+]</b>. Если ККТ или Честный знак
                                    возвращают <b>[M]</b> или <b>[M-]</b>, чек должен быть заблокирован. Это уже встроено в текущий агент.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="border-t border-gray-100 px-5 py-4 sm:px-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs leading-5 text-gray-500">
                            Рабочий адрес: <b>{DEFAULT_AGENT_URL}</b>. Рабочий токен: <b>{DEFAULT_AGENT_TOKEN}</b>.
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
                        >
                            Закрыть настройки
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

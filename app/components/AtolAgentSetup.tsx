'use client';

import * as React from 'react';

const DEFAULT_AGENT_URL = 'http://127.0.0.1:3107';

type AtolAgentSetupProps = {
    onClose: () => void;
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

const createAgentToken = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }

    return `agent_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export default function AtolAgentSetup({ onClose }: AtolAgentSetupProps) {
    const [agentUrl, setAgentUrl] = React.useState(DEFAULT_AGENT_URL);
    const [status, setStatus] = React.useState<string | null>(null);
    const [isChecking, setIsChecking] = React.useState(false);
    const [agentToken, setAgentToken] = React.useState('');

    React.useEffect(() => {
        const savedUrl = localStorage.getItem('pos_fiscal_agent_url');
        const savedToken = localStorage.getItem('pos_fiscal_agent_token');

        if (savedUrl) {
            setAgentUrl(savedUrl);
        }

        if (savedToken) {
            setAgentToken(savedToken);
        } else {
            setAgentToken(createAgentToken());
        }
    }, []);

    const saveBrowserSettings = () => {
        localStorage.setItem('pos_fiscal_agent_url', agentUrl.trim());
        localStorage.setItem('pos_fiscal_agent_token', agentToken.trim());

        setStatus('Настройки сохранены в этом браузере');
    };

    const downloadEnv = () => {
        const posOrigin = window.location.origin;

        const envContent = `PORT=3107
POS_ORIGIN=${posOrigin}
AGENT_TOKEN=${agentToken.trim()}

ATOL_BASE_URL=http://127.0.0.1:16732/api/v2
ATOL_DEVICE_ID=kassa1

ATOL_USE_AUTH=false
ATOL_LOGIN=
ATOL_PASSWORD=
ATOL_USER_AGENT=Mozilla/5.0 ATOL-POS-Agent/1.0

ATOL_TAXATION_TYPE=patent
ATOL_VAT_TYPE=none

ATOL_OPERATOR_NAME=Администратор
ATOL_OPERATOR_VATIN=

ATOL_POLL_ATTEMPTS=45
ATOL_POLL_INTERVAL_MS=1000
`;

        downloadTextFile('.env', envContent);
    };

    const checkAgent = async () => {
        try {
            setIsChecking(true);
            setStatus(null);

            const response = await fetch(`${agentUrl.trim()}/health`, {
                headers: {
                    'X-POS-Agent-Token': agentToken.trim(),
                },
            });

            const text = await response.text();

            if (!response.ok) {
                setStatus(`Ошибка подключения: ${text}`);
                return;
            }

            setStatus(`Связь с агентом есть: ${text}`);
        } catch {
            setStatus(
                'Не удалось подключиться к локальному агенту. Проверьте, что start-agent.bat запущен.'
            );
        } finally {
            setIsChecking(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 px-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800">
                            Настройка локальной ККТ АТОЛ
                        </h2>

                        <p className="mt-1 text-sm text-gray-500">
                            Скачайте агент, запустите его на ПК кассы и сохраните подключение в этом браузере.
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

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 p-4">
                        <h3 className="mb-3 text-lg font-bold text-gray-800">
                            1. Скачать агент
                        </h3>

                        <div className="space-y-3">
                            <a
                                href="/downloads/atol-agent/server.js"
                                download
                                className="block rounded-lg bg-slate-900 px-4 py-3 text-center text-white hover:bg-slate-800"
                            >
                                Скачать server.js
                            </a>

                            <a
                                href="/downloads/atol-agent/package.json"
                                download
                                className="block rounded-lg border border-gray-300 px-4 py-3 text-center hover:bg-gray-50"
                            >
                                Скачать package.json
                            </a>

                            <button
                                type="button"
                                onClick={downloadEnv}
                                className="w-full rounded-lg border border-gray-300 px-4 py-3 hover:bg-gray-50"
                            >
                                Скачать .env
                            </button>

                            <a
                                href="/downloads/atol-agent/start-agent.bat"
                                download
                                className="block rounded-lg border border-gray-300 px-4 py-3 text-center hover:bg-gray-50"
                            >
                                Скачать start-agent.bat
                            </a>
                        </div>

                        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                            Все файлы нужно положить в одну папку на ПК кассы, затем запустить
                            <b> start-agent.bat</b>.
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4">
                        <h3 className="mb-3 text-lg font-bold text-gray-800">
                            2. Настроить этот браузер
                        </h3>

                        <label className="mb-2 block text-sm font-medium text-gray-700">
                            Адрес локального агента
                        </label>

                        <input
                            type="text"
                            value={agentUrl}
                            onChange={(event) => setAgentUrl(event.target.value)}
                            className="mb-4 w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                        />

                        <label className="mb-2 block text-sm font-medium text-gray-700">
                            Токен агента
                        </label>

                        <input
                            type="text"
                            value={agentToken}
                            onChange={(event) => setAgentToken(event.target.value)}
                            className="mb-4 w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                        />

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <button
                                type="button"
                                onClick={saveBrowserSettings}
                                className="flex-1 rounded-lg bg-indigo-600 px-4 py-3 text-white hover:bg-indigo-700"
                            >
                                Сохранить в браузере
                            </button>

                            <button
                                type="button"
                                onClick={checkAgent}
                                disabled={isChecking}
                                className="flex-1 rounded-lg border border-gray-300 px-4 py-3 hover:bg-gray-50 disabled:opacity-50"
                            >
                                {isChecking ? 'Проверяю...' : 'Проверить связь'}
                            </button>
                        </div>

                        {status && (
                            <div className="mt-4 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                                {status}
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-5 rounded-xl bg-blue-50 p-4 text-sm text-blue-800">
                    После успешной проверки связи касса сможет открывать смену, закрывать смену и пробивать чеки через локальную ККТ.
                </div>
            </div>
        </div>
    );
}
import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';

const app = express();

const PORT = Number(process.env.PORT || 3107);
const POS_ORIGIN = process.env.POS_ORIGIN || '';
const AGENT_TOKEN = process.env.AGENT_TOKEN || '';

const ATOL_BASE_URL = process.env.ATOL_BASE_URL || 'http://127.0.0.1:16732/api/v2';
const ATOL_DEVICE_ID = process.env.ATOL_DEVICE_ID || 'kassa1';

const ATOL_USE_AUTH = String(process.env.ATOL_USE_AUTH || 'false') === 'true';
const ATOL_LOGIN = process.env.ATOL_LOGIN || '';
const ATOL_PASSWORD = process.env.ATOL_PASSWORD || '';
const ATOL_USER_AGENT = process.env.ATOL_USER_AGENT || '';

const ATOL_TAXATION_TYPE = process.env.ATOL_TAXATION_TYPE || 'patent';
const ATOL_VAT_TYPE = process.env.ATOL_VAT_TYPE || 'none';
const ATOL_OPERATOR_NAME = process.env.ATOL_OPERATOR_NAME || 'Администратор';
const ATOL_OPERATOR_VATIN = process.env.ATOL_OPERATOR_VATIN || '';

const ATOL_POLL_ATTEMPTS = Number(process.env.ATOL_POLL_ATTEMPTS || 45);
const ATOL_POLL_INTERVAL_MS = Number(process.env.ATOL_POLL_INTERVAL_MS || 1000);

app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (!origin || !POS_ORIGIN || origin === POS_ORIGIN) {
        if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
        }

        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        res.setHeader(
            'Access-Control-Allow-Headers',
            'Content-Type,X-POS-Agent-Token,Access-Control-Request-Private-Network'
        );
        res.setHeader('Access-Control-Allow-Private-Network', 'true');

        if (req.method === 'OPTIONS') {
            res.status(204).end();
            return;
        }

        next();
        return;
    }

    res.status(403).json({
        ok: false,
        message: `Origin is not allowed: ${origin}`,
        allowedOrigin: POS_ORIGIN,
    });
});

const money = value => {
    const number = Number(value || 0);
    return Math.round((number + Number.EPSILON) * 100) / 100;
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const requireToken = (req, res, next) => {
    if (!AGENT_TOKEN) {
        next();
        return;
    }

    const token = req.header('X-POS-Agent-Token');

    if (token !== AGENT_TOKEN) {
        res.status(401).json({
            ok: false,
            message: 'Неверный токен локального кассового агента',
        });
        return;
    }

    next();
};

const getAtolUrl = path => {
    const base = ATOL_BASE_URL.endsWith('/') ? ATOL_BASE_URL : `${ATOL_BASE_URL}/`;
    return new URL(path.replace(/^\//, ''), base).toString();
};

const getAtolAuthHeader = () => {
    if (!ATOL_USE_AUTH) {
        return null;
    }

    if (!ATOL_LOGIN || !ATOL_PASSWORD) {
        return null;
    }

    return `Basic ${Buffer.from(`${ATOL_LOGIN}:${ATOL_PASSWORD}`).toString('base64')}`;
};

const readResponseBody = async response => {
    const text = await response.text();

    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
};

const atolFetch = async (path, init = {}) => {
    const headers = new Headers(init.headers || {});

    headers.set('Content-Type', 'application/json');

    if (ATOL_USER_AGENT) {
        headers.set('User-Agent', ATOL_USER_AGENT);
    }

    const authHeader = getAtolAuthHeader();

    if (authHeader) {
        headers.set('Authorization', authHeader);
    }

    const url = getAtolUrl(path);

    const response = await fetch(url, {
        ...init,
        headers,
    });

    const data = await readResponseBody(response);

    if (!response.ok) {
        const message =
                  data?.message ||
                  data?.error?.description ||
                  data?.description ||
                  `Ошибка АТОЛ HTTP ${response.status}`;

        throw new Error(message);
    }

    return data;
};

const getErrorFromResult = result => {
    if (!result || typeof result !== 'object') {
        return null;
    }

    const error = result.error;

    if (!error) {
        return null;
    }

    const code = Number(error.code || 0);

    if (code === 0) {
        return null;
    }

    return error.description || `Ошибка АТОЛ, код ${error.code}`;
};

const parseAtolQueueResponse = data => {
    const results = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
            ? data
            : [data];

    const inProgress = results.some(result => {
        return result?.status === 'inProgress' || result?.status === 'wait';
    });

    if (inProgress) {
        return {
            inProgress: true,
            result: null,
        };
    }

    for (const result of results) {
        const error = getErrorFromResult(result);

        if (error) {
            throw new Error(error);
        }
    }

    const topError = getErrorFromResult(data);

    if (topError) {
        throw new Error(topError);
    }

    const lastResultWithPayload = [...results]
        .reverse()
        .find(result => result?.result);

    return {
        inProgress: false,
        result: lastResultWithPayload?.result || data?.result || data,
    };
};

const runAtolCommands = async commands => {
    const uuid = crypto.randomUUID();

    const payload = {
        uuid,
        deviceID: ATOL_DEVICE_ID,
        request: commands,
    };

    await atolFetch('/requests', {
        method: 'POST',
        body: JSON.stringify(payload),
    });

    for (let attempt = 0; attempt < ATOL_POLL_ATTEMPTS; attempt += 1) {
        const data = await atolFetch(`/requests/${uuid}`, {
            method: 'GET',
        });

        const parsed = parseAtolQueueResponse(data);

        if (!parsed.inProgress) {
            return {
                uuid,
                result: parsed.result,
            };
        }

        await sleep(ATOL_POLL_INTERVAL_MS);
    }

    throw new Error('ККТ не вернула результат выполнения задания вовремя');
};

const getPaymentType = paymentMethod => {
    if (paymentMethod === 'cash') {
        return 'cash';
    }

    return 'electronically';
};

const findFiscalParams = value => {
    if (!value || typeof value !== 'object') {
        return undefined;
    }

    if (value.fiscalParams) {
        return value.fiscalParams;
    }

    for (const item of Object.values(value)) {
        if (item && typeof item === 'object') {
            const nested = findFiscalParams(item);

            if (nested) {
                return nested;
            }
        }
    }

    return undefined;
};

const buildSellCommand = receipt => {
    const items = receipt.items.map(item => {
        const price = money(item.price);
        const quantity = Number(item.quantity);
        const amount = money(item.total || price * quantity);

        return {
            type: 'position',
            name: String(item.name || 'Товар').slice(0, 128),
            price,
            quantity,
            amount,
            department: 1,
            paymentMethod: 'fullPayment',
            paymentObject: 'commodity',
            tax: {
                type: ATOL_VAT_TYPE,
            },
        };
    });

    const total = money(
        items.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    );

    return {
        type: 'sell',
        electronically: false,
        taxationType: ATOL_TAXATION_TYPE,
        items,
        operator: {
            name: ATOL_OPERATOR_NAME,
            ...(ATOL_OPERATOR_VATIN ? { vatin: ATOL_OPERATOR_VATIN } : {}),
        },
        payments: [
            {
                type: getPaymentType(receipt.paymentMethod),
                sum: total,
            },
        ],
        total,
    };
};

const isAlreadyOpenShiftError = error => {
    const message = error instanceof Error ? error.message.toLowerCase() : '';

    return (
        message.includes('смен') &&
        (
            message.includes('откры') ||
            message.includes('операция невозможна')
        )
    );
};

const isAlreadyClosedShiftError = error => {
    const message = error instanceof Error ? error.message.toLowerCase() : '';

    return (
        message.includes('смен') &&
        (
            message.includes('закры') ||
            message.includes('не откры')
        )
    );
};

app.get('/health', requireToken, async (req, res) => {
    res.json({
        ok: true,
        service: 'atol-local-agent',
        mode: 'atol-driver-10.8-no-auth',
        atolBaseUrl: ATOL_BASE_URL,
        deviceId: ATOL_DEVICE_ID,
        useAuth: ATOL_USE_AUTH,
        taxationType: ATOL_TAXATION_TYPE,
        vatType: ATOL_VAT_TYPE,
    });
});

app.get('/atol/ping', requireToken, async (req, res) => {
    try {
        const data = await atolFetch('/requests', {
            method: 'GET',
        });

        res.json({
            ok: true,
            data,
        });
    } catch (error) {
        res.status(502).json({
            ok: false,
            message: error instanceof Error ? error.message : 'АТОЛ Web Server недоступен',
        });
    }
});

app.post('/service/x-report', requireToken, async (req, res) => {
    try {
        const result = await runAtolCommands([
            {
                type: 'reportX',
            },
        ]);

        res.json({
            ok: true,
            result,
        });
    } catch (error) {
        console.error(error);

        res.status(502).json({
            ok: false,
            message: error instanceof Error ? error.message : 'Не удалось напечатать X-отчёт',
        });
    }
});

app.post('/service/open-shift', requireToken, async (req, res) => {
    try {
        const result = await runAtolCommands([
            {
                type: 'openShift',
                operator: {
                    name: ATOL_OPERATOR_NAME,
                    ...(ATOL_OPERATOR_VATIN ? { vatin: ATOL_OPERATOR_VATIN } : {}),
                },
            },
        ]);

        res.json({
            ok: true,
            alreadyOpen: false,
            message: 'Смена открыта',
            result,
        });
    } catch (error) {
        console.error(error);

        if (isAlreadyOpenShiftError(error)) {
            res.json({
                ok: true,
                alreadyOpen: true,
                message: 'Смена уже открыта',
            });
            return;
        }

        res.status(502).json({
            ok: false,
            message: error instanceof Error ? error.message : 'Не удалось открыть смену',
        });
    }
});

app.post('/service/close-shift', requireToken, async (req, res) => {
    try {
        const result = await runAtolCommands([
            {
                type: 'closeShift',
                operator: {
                    name: ATOL_OPERATOR_NAME,
                    ...(ATOL_OPERATOR_VATIN ? { vatin: ATOL_OPERATOR_VATIN } : {}),
                },
            },
        ]);

        res.json({
            ok: true,
            alreadyClosed: false,
            message: 'Смена закрыта',
            result,
        });
    } catch (error) {
        console.error(error);

        if (isAlreadyClosedShiftError(error)) {
            res.json({
                ok: true,
                alreadyClosed: true,
                message: 'Смена уже закрыта',
            });
            return;
        }

        res.status(502).json({
            ok: false,
            message: error instanceof Error ? error.message : 'Не удалось закрыть смену',
        });
    }
});

app.post('/service/repeat-last-receipt', requireToken, async (req, res) => {
    try {
        const result = await runAtolCommands([
            {
                type: 'printLastReceiptCopy',
            },
        ]);

        res.json({
            ok: true,
            message: 'Копия последнего чека отправлена на печать',
            result,
        });
    } catch (error) {
        console.error(error);

        res.status(502).json({
            ok: false,
            message: error instanceof Error
                ? error.message
                : 'Не удалось напечатать копию последнего чека',
        });
    }
});

app.post('/fiscal/sell', requireToken, async (req, res) => {
    try {
        const receipt = req.body;

        if (!receipt?.items?.length) {
            res.status(400).json({
                ok: false,
                message: 'Пустой чек',
            });
            return;
        }

        const sellCommand = buildSellCommand(receipt);

        console.log('Fiscal sell command:');
        console.log(JSON.stringify(sellCommand, null, 2));

        const fiscalResult = await runAtolCommands([sellCommand]);

        res.json({
            ok: true,
            fiscal: {
                uuid: fiscalResult.uuid,
                fiscalParams: findFiscalParams(fiscalResult.result),
                raw: fiscalResult.result,
            },
        });
    } catch (error) {
        console.error(error);

        res.status(502).json({
            ok: false,
            message: error instanceof Error
                ? error.message
                : 'Не удалось фискализировать чек',
        });
    }
});

app.listen(PORT, '127.0.0.1', () => {
    console.log(`ATOL local agent started: http://127.0.0.1:${PORT}`);
    console.log(`ATOL target: ${ATOL_BASE_URL}`);
    console.log(`ATOL deviceID: ${ATOL_DEVICE_ID}`);
    console.log(`ATOL auth: ${ATOL_USE_AUTH ? 'enabled' : 'disabled'}`);
    console.log(`Taxation type: ${ATOL_TAXATION_TYPE}`);
    console.log(`VAT type: ${ATOL_VAT_TYPE}`);
});
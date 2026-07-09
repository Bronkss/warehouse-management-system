import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3108);
const POS_ORIGIN = process.env.POS_ORIGIN || '';
const AGENT_TOKEN = process.env.AGENT_TOKEN || '';

const ATOL_TAXATION_TYPE = process.env.ATOL_TAXATION_TYPE || 'patent';
const ATOL_VAT_TYPE = process.env.ATOL_VAT_TYPE || 'none';
const ATOL_OPERATOR_NAME = process.env.ATOL_OPERATOR_NAME || 'Администратор';
const ATOL_OPERATOR_VATIN = process.env.ATOL_OPERATOR_VATIN || '';

const ATOL_POWERSHELL_TIMEOUT_MS = Number(process.env.ATOL_POWERSHELL_TIMEOUT_MS || 120000);

const GS_CHAR = '\u001d';
const MARKING_STATUS_ATTEMPTS = Number(process.env.MARKING_STATUS_ATTEMPTS || 10);
const MARKING_STATUS_INTERVAL_MS = Number(process.env.MARKING_STATUS_INTERVAL_MS || 1200);

// Для пачек и блоков сигарет используем одинаковую строгую проверку [M+].
// Блок определяется на фронте по отдельному штрихкоду товара, но КМ блока
// всё равно должен пройти beginMarkingCodeValidation -> getMarkingCodeValidationStatus -> assert [M+] -> acceptMarkingCode.
const ATOL_MARKING_DEFAULT_IMC_TYPE = Number(process.env.ATOL_MARKING_DEFAULT_IMC_TYPE || 256);
const ATOL_MARKING_DEFAULT_ITEM_ESTIMATED_STATUS = Number(process.env.ATOL_MARKING_DEFAULT_ITEM_ESTIMATED_STATUS || 1);
const ATOL_MARKING_BLOCK_IMC_TYPE = Number(process.env.ATOL_MARKING_BLOCK_IMC_TYPE || ATOL_MARKING_DEFAULT_IMC_TYPE);
const ATOL_MARKING_BLOCK_ITEM_ESTIMATED_STATUS = Number(process.env.ATOL_MARKING_BLOCK_ITEM_ESTIMATED_STATUS || ATOL_MARKING_DEFAULT_ITEM_ESTIMATED_STATUS);
const ATOL_MARKING_BLOCK_VALIDATION_MODE = 'strict';

app.use(express.json({ limit: '4mb' }));

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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const money = value => {
    const number = Number(value || 0);
    return Math.round((number + Number.EPSILON) * 100) / 100;
};

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

let atolCommandQueue = Promise.resolve();

const runExclusiveAtolTask = async task => {
    const previousTask = atolCommandQueue.catch(() => {});

    let releaseCurrentTask;

    atolCommandQueue = new Promise(resolve => {
        releaseCurrentTask = resolve;
    });

    await previousTask;

    try {
        await sleep(250);
        return await task();
    } finally {
        await sleep(250);
        releaseCurrentTask();
    }
};

const readJsonFromStdout = stdout => {
    const text = String(stdout || '').trim();

    if (!text) {
        return null;
    }

    const lines = text.split(/\r?\n/).filter(Boolean);
    const lastLine = lines[lines.length - 1];

    return JSON.parse(lastLine);
};

const runPowerShellBridge = async commands => {
    const bridgePath = path.join(__dirname, 'bridge', 'atol-json.ps1');
    const inputFile = path.join(
        os.tmpdir(),
        `atol-driver-${process.pid}-${Date.now()}-${crypto.randomUUID()}.json`
    );

    await writeFile(inputFile, JSON.stringify({ commands }), 'utf8');

    return new Promise((resolve, reject) => {
        const child = spawn(
            'powershell.exe',
            [
                '-NoProfile',
                '-ExecutionPolicy',
                'Bypass',
                '-File',
                bridgePath,
                '-InputFile',
                inputFile,
            ],
            {
                env: process.env,
                windowsHide: true,
            }
        );

        let stdout = '';
        let stderr = '';
        let finished = false;

        const cleanupInputFile = async () => {
            try {
                await unlink(inputFile);
            } catch {}
        };

        const timeout = setTimeout(async () => {
            if (finished) {
                return;
            }

            finished = true;
            child.kill('SIGTERM');
            await cleanupInputFile();
            reject(new Error('АТОЛ-драйвер не ответил вовремя'));
        }, ATOL_POWERSHELL_TIMEOUT_MS);

        child.stdout.on('data', chunk => {
            stdout += chunk.toString('utf8');
        });

        child.stderr.on('data', chunk => {
            stderr += chunk.toString('utf8');
        });

        child.on('error', async error => {
            if (finished) {
                return;
            }

            finished = true;
            clearTimeout(timeout);
            await cleanupInputFile();
            reject(error);
        });

        child.on('close', async code => {
            if (finished) {
                return;
            }

            finished = true;
            clearTimeout(timeout);
            await cleanupInputFile();

            try {
                const parsed = readJsonFromStdout(stdout);

                if (!parsed) {
                    reject(new Error(stderr || `PowerShell завершился без JSON-ответа, code=${code}`));
                    return;
                }

                if (!parsed.ok) {
                    reject(new Error(parsed.message || 'Ошибка bridge АТОЛ'));
                    return;
                }

                resolve(parsed);
            } catch (error) {
                reject(
                    new Error(
                        `Не удалось разобрать ответ bridge АТОЛ: ${
                            error instanceof Error ? error.message : String(error)
                        }. STDERR: ${stderr}`
                    )
                );
            }
        });
    });
};

const getAtolResultErrorMessage = item => {
    if (!item) {
        return null;
    }

    if (item.errorDescription) {
        return item.errorDescription;
    }

    if (item.message) {
        return item.message;
    }

    if (item.result?.error?.description) {
        return item.result.error.description;
    }

    if (item.result?.error?.message) {
        return item.result.error.message;
    }

    if (item.result?.description) {
        return item.result.description;
    }

    return null;
};

const isInvalidMarkingProcessStateError = value => {
    const message = String(value || '').toLowerCase();

    return (
        message.includes('неверное состояние процесса проверки км') ||
        message.includes('invalid marking') ||
        message.includes('invalid state')
    );
};

const isMarkingRejectedError = value => {
    const message = String(value || '').toLowerCase();

    return (
        message.includes('[m-]') ||
        message.includes('[m]') ||
        message.includes('не прошёл проверку') ||
        message.includes('не прошел проверку') ||
        message.includes('не подтвержд') ||
        message.includes('marking code is not positive')
    );
};

const runAtolCommands = async commands => {
    return runExclusiveAtolTask(async () => {
        const result = await runPowerShellBridge(commands);

        const failed = result.results?.find(item => {
            if (item.commandType === '__sleep') {
                return false;
            }

            return !item.ok;
        });

        if (failed) {
            throw new Error(
                getAtolResultErrorMessage(failed) ||
                `Ошибка выполнения команды АТОЛ: ${failed.commandType || 'unknown'}`
            );
        }

        return {
            uuid: crypto.randomUUID(),
            result,
        };
    });
};

const runAtolCommandsRaw = async commands => {
    return runExclusiveAtolTask(async () => {
        const result = await runPowerShellBridge(commands);

        return {
            uuid: crypto.randomUUID(),
            result,
        };
    });
};

const getAtolResultPayload = item => {
    if (!item) {
        return null;
    }

    if (item.result) {
        return item.result;
    }

    if (item.rawText) {
        try {
            return JSON.parse(item.rawText);
        } catch {
            return item.rawText;
        }
    }

    return item;
};

const restoreMissingGsBeforeAi21VariablePart = value => {
    const code = String(value || '');

    if (!code) {
        return code;
    }

    // Если сканер корректно передал FNC1 / GS, ничего не трогаем.
    if (code.includes(GS_CHAR)) {
        return code;
    }

    // Ожидаемый старт GS1 DataMatrix: (01) GTIN14 (21) serial.
    if (!code.startsWith('01')) {
        return code;
    }

    const ai21Index = 16;

    if (code.slice(ai21Index, ai21Index + 2) !== '21') {
        return code;
    }

    const serialStartIndex = ai21Index + 2;
    const serialMinLength = 4;
    const serialMaxLength = 20;
    const minCandidateIndex = serialStartIndex + serialMinLength;
    const maxCandidateIndex = Math.min(code.length - 2, serialStartIndex + serialMaxLength);

    const candidateAis = ['8005', '91', '92', '93'];
    const candidates = [];

    for (let index = minCandidateIndex; index <= maxCandidateIndex; index += 1) {
        for (const ai of candidateAis) {
            if (!code.startsWith(ai, index)) {
                continue;
            }

            const tailLength = code.length - index;

            // Блок сигарет может иметь длинный криптохвост. Старое ограничение 12 символов ломало длинные КМ.
            if (tailLength < ai.length + 1) {
                continue;
            }

            candidates.push({ index, ai, tailLength });
        }
    }

    if (candidates.length === 0) {
        return code;
    }

    candidates.sort((a, b) => a.index - b.index || b.ai.length - a.ai.length);

    const candidate = candidates[0];
    const restored = `${code.slice(0, candidate.index)}${GS_CHAR}${code.slice(candidate.index)}`;

    console.log('Marking code GS/FNC1 restored after AI 21 variable part:');
    console.log(JSON.stringify({
        beforeLength: code.length,
        afterLength: restored.length,
        insertedBeforeAi: candidate.ai,
        serialLength: candidate.index - serialStartIndex,
        tailLength: candidate.tailLength,
    }, null, 2));

    return restored;
};

const normalizeMarkingCodeInput = value => {
    const normalized = String(value || '')
        .replace(/^\]d2/i, '')
        .replaceAll('\\u001d', GS_CHAR)
        .replaceAll('\\x1d', GS_CHAR)
        .replaceAll('<GS>', GS_CHAR)
        .replaceAll('[GS]', GS_CHAR)
        .trim();

    return restoreMissingGsBeforeAi21VariablePart(normalized);
};

const isTobaccoBlockItem = item => {
    const mode = String(item?.markingPackageMode || item?.packageMode || '').trim().toLowerCase();
    const packageQuantity = Number(item?.markingPackageQuantity || item?.packageQuantity || item?.quantity || 1);

    return (
        mode === 'block' ||
        mode === 'cigarette_block' ||
        mode === 'tobacco_block' ||
        item?.isCigaretteBlock === true ||
        item?.tobaccoBlock === true ||
        (mode === 'group' && packageQuantity > 1)
    );
};

const getMarkingOptionsForItem = item => {
    const isBlock = isTobaccoBlockItem(item);

    return {
        isBlock,
        imcType: isBlock ? ATOL_MARKING_BLOCK_IMC_TYPE : ATOL_MARKING_DEFAULT_IMC_TYPE,
        itemEstimatedStatus: isBlock
            ? ATOL_MARKING_BLOCK_ITEM_ESTIMATED_STATUS
            : ATOL_MARKING_DEFAULT_ITEM_ESTIMATED_STATUS,
        validationMode: 'strict',
    };
};

const buildNativeDriverMarkingParams = (markingCode, options = {}) => {
    const normalizedMarkingCode = normalizeMarkingCodeInput(markingCode);

    return {
        imcType: Number(options.imcType || ATOL_MARKING_DEFAULT_IMC_TYPE),
        imc: normalizedMarkingCode,
        itemEstimatedStatus: Number(options.itemEstimatedStatus || ATOL_MARKING_DEFAULT_ITEM_ESTIMATED_STATUS),
        imcModeProcessing: 0,
    };
};

const getDriverJsonPaymentType = paymentMethod => {
    if (paymentMethod === 'cash') {
        return '0';
    }

    return '1';
};

const getReceiptOperatorName = receipt => {
    const fromReceipt = String(receipt?.cashierName || receipt?.operatorName || '').trim();
    return fromReceipt || ATOL_OPERATOR_NAME;
};

const getFfdMeasureCode = item => {
    const unit = String(item?.unit || item?.measureName || '').trim().toLowerCase();
    const explicitSource = item?.measureCode ?? item?.measurementUnitCode ?? item?.ffdMeasureCode;

    if (explicitSource !== undefined && explicitSource !== null && explicitSource !== '') {
        const explicitCode = Number(explicitSource);

        if (explicitCode === 11 || explicitCode === 0) {
            return explicitCode;
        }
    }

    return unit === 'weight' || unit === 'kg' || unit === 'кг' ? 11 : 0;
};

const getAtolMeasurementUnit = item => {
    return getFfdMeasureCode(item) === 11 ? 'kilogram' : 'piece';
};

const getFfdMeasureName = item => {
    return getFfdMeasureCode(item) === 11 ? 'кг' : 'шт.';
};

const hasMarkingCode = item => {
    return Boolean(
        item?.markingCode ||
        item?.imc ||
        item?.imcParams?.imc
    );
};

const getItemMarkingCode = item => {
    return normalizeMarkingCodeInput(
        item?.markingCode ||
        item?.imc ||
        item?.imcParams?.imc ||
        ''
    );
};

const buildDriverJsonSellItem = item => {
    const price = money(item.price);
    const quantity = Number(item.quantity || 1);
    const amount = money(item.total || item.amount || price * quantity);
    const marked = hasMarkingCode(item);
    const markingCode = getItemMarkingCode(item);

    const sellItem = {
        name: String(item.name || 'Товар').slice(0, 128),
        paymentMethod: 'fullPayment',
        paymentObject: marked ? 'commodityWithMarking' : 'commodity',
        price,
        quantity,
        amount,
        measurementUnit: getAtolMeasurementUnit(item),
        measurementUnitCode: getFfdMeasureCode(item),
        measureOfQuantity: getFfdMeasureCode(item),
        measureName: getFfdMeasureName(item),
        tag2108: getFfdMeasureCode(item),
        infoDiscountAmount: 0,
        tax: {
            sum: 0,
            type: ATOL_VAT_TYPE,
        },
        type: 'position',
    };

    if (getFfdMeasureCode(item) === 0) {
        sellItem.piece = true;
    }

    if (marked && markingCode) {
        sellItem.imcParams = buildNativeDriverMarkingParams(
            markingCode,
            getMarkingOptionsForItem(item)
        );

        if (isTobaccoBlockItem(item)) {
            sellItem.userData = String(item.markingMessage || 'Блок сигарет').slice(0, 64);
        }
    }

    return sellItem;
};

const buildDriverJsonSellCommand = receipt => {
    const items = receipt.items.map(buildDriverJsonSellItem);

    const total = money(
        items.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    );

    return {
        electronically: false,
        taxationType: ATOL_TAXATION_TYPE,
        items,
        operator: {
            name: getReceiptOperatorName(receipt),
            ...(ATOL_OPERATOR_VATIN ? { vatin: ATOL_OPERATOR_VATIN } : {}),
        },
        payments: [
            {
                sum: total,
                type: getDriverJsonPaymentType(receipt.paymentMethod),
            },
        ],
        taxes: [],
        type: 'sell',
        useVAT18: false,
    };
};

const buildNativeMarkingStatusPollCommands = (markingCode, options = {}) => {
    const params = buildNativeDriverMarkingParams(markingCode, options);

    const commands = [
        {
            type: 'beginMarkingCodeValidation',
            params,
        },
    ];

    for (let index = 0; index < MARKING_STATUS_ATTEMPTS; index += 1) {
        commands.push(
            {
                type: '__sleep',
                ms: MARKING_STATUS_INTERVAL_MS,
            },
            {
                type: 'getMarkingCodeValidationStatus',
            }
        );
    }

    return commands;
};

const buildNativeMarkingCheckCommands = (markingCode, options = {}) => {
    const validationMode = String(options.validationMode || 'strict').trim().toLowerCase();

    if (validationMode === 'sell_only') {
        return [];
    }

    const commands = buildNativeMarkingStatusPollCommands(markingCode, options);

    if (validationMode !== 'accept_without_assert') {
        commands.push({
            type: '__assertMarkingPositive',
        });
    }

    commands.push(
        {
            type: 'acceptMarkingCode',
        },
        {
            type: '__sleep',
            ms: 300,
        }
    );

    return commands;
};

const buildNativeMarkedReceiptBatchCommands = receipt => {
    const commands = [];

    for (const item of receipt.items) {
        if (!hasMarkingCode(item)) {
            continue;
        }

        const markingCode = getItemMarkingCode(item);

        if (!markingCode) {
            throw new Error(`Для маркированного товара "${item.name || 'Товар'}" не передан DataMatrix`);
        }

        const markingOptions = getMarkingOptionsForItem(item);
        commands.push(...buildNativeMarkingCheckCommands(markingCode, markingOptions));
    }

    commands.push(buildDriverJsonSellCommand(receipt));

    return commands;
};

const parseBatchResult = batch => {
    const results = batch?.result?.results || [];

    const failed = results.find(item => {
        if (item.commandType === '__sleep') {
            return false;
        }

        return !item.ok;
    }) || null;

    const markingBegins = results
        .filter(item => item.commandType === 'beginMarkingCodeValidation')
        .map(getAtolResultPayload);

    const markingStatuses = results
        .filter(item => item.commandType === 'getMarkingCodeValidationStatus')
        .map(getAtolResultPayload);

    const markingAssertions = results
        .filter(item => item.commandType === '__assertMarkingPositive')
        .map(getAtolResultPayload);

    const markingAccepts = results
        .filter(item => item.commandType === 'acceptMarkingCode')
        .map(getAtolResultPayload);

    const sellItem = results
        .filter(item => item.commandType === 'sell')
        .at(-1) || null;

    return {
        results,
        failed,
        markingBegins,
        markingStatuses,
        markingAssertions,
        markingAccepts,
        sell: getAtolResultPayload(sellItem),
        sellItem,
    };
};

const getLatestMarkingStatus = statuses => {
    if (!Array.isArray(statuses) || statuses.length === 0) {
        return null;
    }

    for (let index = statuses.length - 1; index >= 0; index -= 1) {
        const status = statuses[index];

        if (status && typeof status === 'object') {
            return status;
        }
    }

    return null;
};

const determineMarkingStatus = statuses => {
    const status = getLatestMarkingStatus(statuses);

    if (!status) {
        return {
            markingStatus: 'M',
            canSell: false,
            message: 'Проверка КМ не завершена: ККТ не вернула статус проверки',
            status,
        };
    }

    const itemInfo = status?.onlineValidation?.itemInfoCheckResult;
    const operatorResponse = status?.onlineValidation?.markOperatorResponse;
    const operatorResult = status?.onlineValidation?.markOperatorResponseResult;
    const ready = status?.ready === true;
    const sent = status?.sentImcRequest === true;

    const positive = Boolean(
        ready &&
        sent &&
        itemInfo?.imcCheckFlag === true &&
        itemInfo?.imcCheckResult === true &&
        itemInfo?.imcEstimatedStatusCorrect === true &&
        itemInfo?.imcStatusInfo === true &&
        operatorResponse?.responseStatus === true &&
        operatorResponse?.itemStatusCheck === true
    );

    if (positive) {
        return {
            markingStatus: 'M+',
            canSell: true,
            message: 'Код маркировки проверен успешно [M+]',
            status,
        };
    }

    const hasNegativeResult = Boolean(
        operatorResult === 'unrecognized' ||
        itemInfo?.imcCheckResult === false ||
        itemInfo?.imcEstimatedStatusCorrect === false ||
        operatorResponse?.responseStatus === false ||
        operatorResponse?.itemStatusCheck === false
    );

    if (ready && sent && hasNegativeResult) {
        return {
            markingStatus: 'M-',
            canSell: false,
            message: 'Код маркировки не прошёл проверку [M-]. Продажа заблокирована.',
            status,
        };
    }

    return {
        markingStatus: 'M',
        canSell: false,
        message: 'Проверка КМ не дала положительный результат [M+]. Продажа заблокирована.',
        status,
    };
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

function isHarmlessMarkingCleanupError(error) {
    const message = error instanceof Error
        ? error.message.toLowerCase()
        : String(error || '').toLowerCase();

    return (
        message.includes('км отсутствует в таблице') ||
        message.includes('данный км отсутствует в таблице') ||
        message.includes('отсутствует в таблице') ||
        message.includes('процедура проверки км не запущена') ||
        message.includes('проверка км не запущена') ||
        message.includes('нет активной проверки') ||
        message.includes('validation is not started')
    );
}

const safeRunAtolCommands = async commands => {
    try {
        const result = await runAtolCommands(commands);

        return {
            ok: true,
            result,
            error: null,
            ignored: false,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error || '');

        return {
            ok: false,
            result: null,
            error: message,
            ignored: isHarmlessMarkingCleanupError(error),
        };
    }
};

const resetMarkingValidationState = async () => {
    const cancel = await safeRunAtolCommands([
        {
            type: 'cancelMarkingCodeValidation',
        },
    ]);

    await sleep(1200);

    const decline = await safeRunAtolCommands([
        {
            type: 'declineMarkingCode',
        },
    ]);

    await sleep(1200);

    const clear = await safeRunAtolCommands([
        {
            type: 'clearMarkingCodeValidationResult',
        },
    ]);

    await sleep(1200);

    return {
        cancel,
        decline,
        clear,
    };
};

const runNativeMarkedReceiptWithRetry = async ({
                                                   receipt,
                                                   logLabel = 'Driver native marked fiscal batch command:',
                                               }) => {
    let commands = buildNativeMarkedReceiptBatchCommands(receipt);

    console.log(logLabel);
    console.log(JSON.stringify(commands, null, 2));

    let batch = await runAtolCommandsRaw(commands);
    let parsed = parseBatchResult(batch);
    let retried = false;
    let reset = null;

    if (parsed.failed) {
        const failedMessage =
                  getAtolResultErrorMessage(parsed.failed) ||
                  parsed.failed.errorDescription ||
                  parsed.failed.message ||
                  '';

        if (isInvalidMarkingProcessStateError(failedMessage) && !isMarkingRejectedError(failedMessage)) {
            console.warn('Invalid marking process state. Reset marking state and retry once.');

            reset = await resetMarkingValidationState();
            await sleep(1500);

            commands = buildNativeMarkedReceiptBatchCommands(receipt);

            console.log('Driver native marked fiscal batch retry command:');
            console.log(JSON.stringify(commands, null, 2));

            batch = await runAtolCommandsRaw(commands);
            parsed = parseBatchResult(batch);
            retried = true;
        }
    }

    return {
        commands,
        batch,
        parsed,
        retried,
        reset,
    };
};

app.get('/health', requireToken, async (req, res) => {
    res.json({
        ok: true,
        service: 'atol-local-agent-driver',
        mode: 'driver-com-powershell-bridge',
        port: PORT,
        taxationType: ATOL_TAXATION_TYPE,
        vatType: ATOL_VAT_TYPE,
        useSavedSettings: process.env.ATOL_DRIVER_USE_SAVED_SETTINGS || 'true',
        markingStatusAttempts: MARKING_STATUS_ATTEMPTS,
        markingStatusIntervalMs: MARKING_STATUS_INTERVAL_MS,
        strictMarkingSell: true,
        blockMarkingValidationMode: ATOL_MARKING_BLOCK_VALIDATION_MODE,
        blockImcType: ATOL_MARKING_BLOCK_IMC_TYPE,
        blockItemEstimatedStatus: ATOL_MARKING_BLOCK_ITEM_ESTIMATED_STATUS,
    });
});

app.post('/driver/raw-json', requireToken, async (req, res) => {
    try {
        const commands = Array.isArray(req.body?.commands)
            ? req.body.commands
            : [req.body?.command || req.body];

        const result = await runAtolCommands(commands);

        res.json({
            ok: true,
            result,
        });
    } catch (error) {
        console.error(error);

        res.status(502).json({
            ok: false,
            message: error instanceof Error
                ? error.message
                : 'Ошибка выполнения JSON-команды через драйвер',
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
            message: 'X-отчёт отправлен на ККТ',
            result,
        });
    } catch (error) {
        console.error(error);

        res.status(502).json({
            ok: false,
            message: error instanceof Error
                ? error.message
                : 'Не удалось напечатать X-отчёт',
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
            message: 'Смена открыта',
            result,
        });
    } catch (error) {
        console.error(error);

        res.status(502).json({
            ok: false,
            message: error instanceof Error
                ? error.message
                : 'Не удалось открыть смену',
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
            message: 'Смена закрыта',
            result,
        });
    } catch (error) {
        console.error(error);

        res.status(502).json({
            ok: false,
            message: error instanceof Error
                ? error.message
                : 'Не удалось закрыть смену',
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

        const hasMarkedItems = receipt.items.some(hasMarkingCode);

        if (!hasMarkedItems) {
            const sellCommand = buildDriverJsonSellCommand(receipt);

            console.log('Driver fiscal sell command:');
            console.log(JSON.stringify(sellCommand, null, 2));

            const fiscalResult = await runAtolCommands([sellCommand]);

            res.json({
                ok: true,
                mode: 'ordinary-sell',
                fiscal: {
                    uuid: fiscalResult.uuid,
                    fiscalParams: findFiscalParams(fiscalResult.result),
                    raw: fiscalResult.result,
                },
            });
            return;
        }

        const {
                  batch,
                  parsed,
                  retried,
                  reset,
              } = await runNativeMarkedReceiptWithRetry({
            receipt,
            logLabel: 'Driver native marked fiscal batch command:',
        });

        if (parsed.failed) {
            const message =
                      getAtolResultErrorMessage(parsed.failed) ||
                      parsed.failed.errorDescription ||
                      'Ошибка фискализации маркированного чека';

            const statusInfo = determineMarkingStatus(parsed.markingStatuses);
            const httpStatus = isMarkingRejectedError(message) || statusInfo.markingStatus !== 'M+'
                ? 409
                : 502;

            res.status(httpStatus).json({
                ok: false,
                mode: 'native-marked-sell',
                message,
                markingStatus: statusInfo.markingStatus,
                canSell: false,
                failed: parsed.failed,
                markingBegins: parsed.markingBegins,
                markingStatuses: parsed.markingStatuses,
                markingAssertions: parsed.markingAssertions,
                markingAccepts: parsed.markingAccepts,
                sell: parsed.sell,
                retried,
                reset,
                batch,
            });
            return;
        }

        res.json({
            ok: true,
            mode: 'native-marked-sell',
            fiscal: {
                uuid: batch.uuid,
                fiscalParams: findFiscalParams(batch.result),
                raw: batch.result,
            },
            marking: {
                begins: parsed.markingBegins,
                statuses: parsed.markingStatuses,
                assertions: parsed.markingAssertions,
                accepts: parsed.markingAccepts,
            },
            sell: parsed.sell,
            retried,
            reset,
            batch,
        });
    } catch (error) {
        console.error(error);

        res.status(502).json({
            ok: false,
            message: error instanceof Error
                ? error.message
                : 'Не удалось фискализировать чек через драйвер',
        });
    }
});

app.post('/marking/precheck', requireToken, async (req, res) => {
    let batch = null;
    let reset = null;

    try {
        const { markingCode } = req.body || {};
        const normalizedMarkingCode = normalizeMarkingCodeInput(markingCode);
        const markingOptions = getMarkingOptionsForItem({
            markingPackageMode: req.body?.markingPackageMode,
            markingPackageQuantity: req.body?.markingPackageQuantity,
        });

        if (!normalizedMarkingCode) {
            res.status(400).json({
                ok: false,
                canSell: false,
                markingStatus: 'M',
                message: 'Передайте DataMatrix / код маркировки',
            });
            return;
        }

        const commands = buildNativeMarkingStatusPollCommands(normalizedMarkingCode, markingOptions);

        console.log('Driver marking precheck command:');
        console.log(JSON.stringify(commands, null, 2));

        batch = await runAtolCommandsRaw(commands);
        const parsed = parseBatchResult(batch);
        const statusInfo = determineMarkingStatus(parsed.markingStatuses);

        reset = await resetMarkingValidationState();

        res.json({
            ok: statusInfo.canSell,
            canSell: statusInfo.canSell,
            markingStatus: statusInfo.markingStatus,
            normalizedMarkingCode,
            message: statusInfo.message,
            markingBegins: parsed.markingBegins,
            markingStatuses: parsed.markingStatuses,
            reset,
            batch,
        });
    } catch (error) {
        console.error(error);

        try {
            reset = await resetMarkingValidationState();
        } catch {}

        res.status(502).json({
            ok: false,
            canSell: false,
            markingStatus: 'M',
            message: error instanceof Error
                ? error.message
                : 'Не удалось предварительно проверить КМ',
            reset,
            batch,
        });
    }
});

app.post('/marking/ism-ping', requireToken, async (req, res) => {
    try {
        const result = await runAtolCommands([
            {
                type: 'pingIsm',
            },
        ]);

        res.json({
            ok: true,
            message: 'Проверка связи с ИСМ выполнена',
            result,
        });
    } catch (error) {
        console.error(error);

        res.status(502).json({
            ok: false,
            message: error instanceof Error
                ? error.message
                : 'Не удалось проверить связь с ИСМ',
        });
    }
});

app.post('/marking/clear', requireToken, async (req, res) => {
    try {
        const result = await runAtolCommands([
            {
                type: 'clearMarkingCodeValidationResult',
            },
        ]);

        res.json({
            ok: true,
            message: 'Таблица проверенных КМ очищена',
            result,
        });
    } catch (error) {
        console.error(error);

        res.status(502).json({
            ok: false,
            message: error instanceof Error
                ? error.message
                : 'Не удалось очистить таблицу проверенных КМ',
        });
    }
});

app.post('/marking/reset', requireToken, async (req, res) => {
    try {
        const reset = await resetMarkingValidationState();

        res.json({
            ok: true,
            message: 'Состояние проверки КМ сброшено',
            reset,
        });
    } catch (error) {
        console.error(error);

        res.status(502).json({
            ok: false,
            message: error instanceof Error
                ? error.message
                : 'Не удалось сбросить состояние проверки КМ',
        });
    }
});

app.post('/marking/native-check', requireToken, async (req, res) => {
    let batch = null;

    try {
        const { markingCode } = req.body || {};
        const normalizedMarkingCode = normalizeMarkingCodeInput(markingCode);

        if (!normalizedMarkingCode) {
            res.status(400).json({
                ok: false,
                message: 'Передайте DataMatrix / код маркировки',
            });
            return;
        }

        const commands = buildNativeMarkingCheckCommands(normalizedMarkingCode);

        console.log('Driver native marking batch command:');
        console.log(JSON.stringify(commands, null, 2));

        batch = await runAtolCommandsRaw(commands);

        const parsed = parseBatchResult(batch);
        const statusInfo = determineMarkingStatus(parsed.markingStatuses);

        if (parsed.failed) {
            res.status(statusInfo.markingStatus === 'M+' ? 502 : 409).json({
                ok: false,
                method: 'native-check',
                markingStatus: statusInfo.markingStatus,
                canSell: false,
                message:
                    getAtolResultErrorMessage(parsed.failed) ||
                    parsed.failed.errorDescription ||
                    statusInfo.message ||
                    'Ошибка проверки или принятия КМ',
                failed: parsed.failed,
                markingBegins: parsed.markingBegins,
                markingStatuses: parsed.markingStatuses,
                markingAssertions: parsed.markingAssertions,
                markingAccepts: parsed.markingAccepts,
                batch,
            });
            return;
        }

        res.json({
            ok: true,
            method: 'native-check',
            message: 'КМ проверен и принят в одном COM-сеансе',
            markingStatus: 'M+',
            canSell: true,
            params: buildNativeDriverMarkingParams(normalizedMarkingCode),
            markingBegins: parsed.markingBegins,
            markingStatuses: parsed.markingStatuses,
            markingAssertions: parsed.markingAssertions,
            markingAccepts: parsed.markingAccepts,
            batch,
        });
    } catch (error) {
        console.error(error);

        res.status(502).json({
            ok: false,
            method: 'native-check',
            message: error instanceof Error
                ? error.message
                : 'Не удалось проверить и принять КМ',
            batch,
        });
    }
});

app.post('/marking/native-sell-test', requireToken, async (req, res) => {
    try {
        const {
                  markingCode,
                  name = 'Тест маркировки',
                  price = 1,
                  quantity = 1,
                  paymentMethod = 'cash',
              } = req.body || {};

        const normalizedMarkingCode = normalizeMarkingCodeInput(markingCode);

        if (!normalizedMarkingCode) {
            res.status(400).json({
                ok: false,
                message: 'Передайте DataMatrix / код маркировки',
            });
            return;
        }

        const receipt = {
            paymentMethod,
            items: [
                {
                    name,
                    price,
                    quantity,
                    total: money(Number(price || 1) * Number(quantity || 1)),
                    unit: 'piece',
                    markingCode: normalizedMarkingCode,
                },
            ],
        };

        const {
                  batch,
                  parsed,
                  retried,
                  reset,
              } = await runNativeMarkedReceiptWithRetry({
            receipt,
            logLabel: 'Driver native marking sell-test batch command:',
        });

        if (parsed.failed) {
            const statusInfo = determineMarkingStatus(parsed.markingStatuses);

            res.status(statusInfo.markingStatus === 'M+' ? 502 : 409).json({
                ok: false,
                method: 'native-sell-test',
                markingStatus: statusInfo.markingStatus,
                canSell: false,
                message:
                    getAtolResultErrorMessage(parsed.failed) ||
                    parsed.failed.errorDescription ||
                    statusInfo.message ||
                    'Ошибка тестовой продажи маркированного товара',
                failed: parsed.failed,
                markingBegins: parsed.markingBegins,
                markingStatuses: parsed.markingStatuses,
                markingAssertions: parsed.markingAssertions,
                markingAccepts: parsed.markingAccepts,
                sell: parsed.sell,
                retried,
                reset,
                batch,
            });
            return;
        }

        res.json({
            ok: true,
            method: 'native-sell-test',
            message: 'Тестовый чек с маркировкой пробит в одном COM-сеансе',
            markingStatus: 'M+',
            canSell: true,
            marking: {
                begins: parsed.markingBegins,
                statuses: parsed.markingStatuses,
                assertions: parsed.markingAssertions,
                accepts: parsed.markingAccepts,
            },
            sell: parsed.sell,
            fiscalParams: findFiscalParams(batch.result),
            retried,
            reset,
            batch,
        });
    } catch (error) {
        console.error(error);

        res.status(502).json({
            ok: false,
            method: 'native-sell-test',
            message: error instanceof Error
                ? error.message
                : 'Не удалось пробить тестовый чек с маркировкой',
            batch: null,
        });
    }
});

app.listen(PORT, '127.0.0.1', () => {
    console.log(`ATOL driver local agent started: http://127.0.0.1:${PORT}`);
    console.log('Mode: driver COM / PowerShell bridge');
    console.log(`Taxation type: ${ATOL_TAXATION_TYPE}`);
    console.log(`VAT type: ${ATOL_VAT_TYPE}`);
    console.log(`Marking status attempts: ${MARKING_STATUS_ATTEMPTS}`);
    console.log(`Marking status interval: ${MARKING_STATUS_INTERVAL_MS} ms`);
    console.log('Strict marking sell: enabled. Only [M+] can be fiscalized.');
});

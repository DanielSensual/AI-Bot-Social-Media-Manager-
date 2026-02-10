const DEFAULT_LIMITS = {
    defaultValue: 8,
    min: 1,
    max: 25,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 5000;
const DEFAULT_BACKOFF_BASE_MS = 2000;
const DEFAULT_BACKOFF_MAX_MS = 20000;

function asFiniteInteger(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || !Number.isInteger(num)) return null;
    return num;
}

function parseIsoDate(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toISOString();
}

export function normalizeLimit(value, defaults = {}) {
    const min = asFiniteInteger(defaults.min) ?? DEFAULT_LIMITS.min;
    const max = asFiniteInteger(defaults.max) ?? DEFAULT_LIMITS.max;
    const fallbackDefault = asFiniteInteger(defaults.defaultValue) ?? DEFAULT_LIMITS.defaultValue;
    const defaultValue = Math.min(Math.max(fallbackDefault, min), max);

    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }

    const parsed = asFiniteInteger(value);
    if (parsed === null) {
        throw new Error(`Invalid --limit value "${value}". Expected an integer.`);
    }

    return Math.min(Math.max(parsed, min), max);
}

export function loadEngagedRecords(rawJson, now = new Date()) {
    const nowIso = now.toISOString();

    let parsed = rawJson;
    if (typeof rawJson === 'string') {
        const text = rawJson.trim();
        if (!text) return [];

        try {
            parsed = JSON.parse(text);
        } catch {
            return [];
        }
    }

    if (!Array.isArray(parsed)) return [];

    const records = [];

    for (const entry of parsed) {
        if (typeof entry === 'string') {
            const id = entry.trim();
            if (!id) continue;
            records.push({ id, engagedAt: nowIso });
            continue;
        }

        if (!entry || typeof entry !== 'object') continue;

        const id = typeof entry.id === 'string' ? entry.id.trim() : '';
        if (!id) continue;

        const engagedAt = parseIsoDate(entry.engagedAt) || nowIso;
        records.push({ id, engagedAt });
    }

    return records;
}

export function pruneEngagedRecords(records, ttlDays = 30, maxEntries = DEFAULT_MAX_ENTRIES, now = new Date()) {
    if (!Array.isArray(records) || records.length === 0) return [];

    const ttl = asFiniteInteger(ttlDays);
    const ttlMs = ttl !== null && ttl > 0 ? ttl * DAY_MS : Infinity;
    const cutoffMs = Number.isFinite(ttlMs) ? now.getTime() - ttlMs : -Infinity;

    const max = asFiniteInteger(maxEntries);
    const maxAllowed = max !== null && max > 0 ? max : DEFAULT_MAX_ENTRIES;

    const latestById = new Map();

    for (const entry of records) {
        if (!entry || typeof entry !== 'object') continue;

        const id = typeof entry.id === 'string' ? entry.id.trim() : '';
        if (!id) continue;

        const engagedAt = parseIsoDate(entry.engagedAt);
        if (!engagedAt) continue;

        const engagedMs = Date.parse(engagedAt);
        if (engagedMs < cutoffMs) continue;

        const existing = latestById.get(id);
        if (!existing || engagedMs > existing.engagedMs) {
            latestById.set(id, { id, engagedAt, engagedMs });
        }
    }

    return [...latestById.values()]
        .sort((a, b) => b.engagedMs - a.engagedMs)
        .slice(0, maxAllowed)
        .map(({ id, engagedAt }) => ({ id, engagedAt }));
}

export function serializeEngagedRecords(records) {
    const clean = [];

    if (Array.isArray(records)) {
        for (const entry of records) {
            if (!entry || typeof entry !== 'object') continue;
            const id = typeof entry.id === 'string' ? entry.id.trim() : '';
            const engagedAt = parseIsoDate(entry.engagedAt);
            if (!id || !engagedAt) continue;
            clean.push({ id, engagedAt });
        }
    }

    return JSON.stringify(clean, null, 2);
}

export function shouldRetryTwitterError(error) {
    if (!error || typeof error !== 'object') return false;

    const rawCodes = [
        error.code,
        error.status,
        error.statusCode,
        error?.data?.status,
        error?.response?.status,
    ];

    for (const code of rawCodes) {
        const numeric = Number(code);
        if (!Number.isFinite(numeric)) continue;
        if (numeric === 429) return true;
        if (numeric >= 500) return true;
    }

    const networkCodes = new Set([
        'ETIMEDOUT',
        'ECONNRESET',
        'ECONNREFUSED',
        'ENOTFOUND',
        'EAI_AGAIN',
        'UND_ERR_CONNECT_TIMEOUT',
        'UND_ERR_HEADERS_TIMEOUT',
        'UND_ERR_SOCKET',
        'ERR_NETWORK',
    ]);

    const candidates = [
        error.code,
        error.errno,
        error?.cause?.code,
    ].map(v => (typeof v === 'string' ? v.toUpperCase() : ''));

    if (candidates.some(code => networkCodes.has(code))) {
        return true;
    }

    const message = [error.message, error?.cause?.message]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    if (!message) return false;

    return (
        message.includes('rate limit')
        || message.includes('timed out')
        || message.includes('timeout')
        || message.includes('network')
        || message.includes('socket hang up')
        || message.includes('connection reset')
        || message.includes('fetch failed')
    );
}

export function computeBackoffMs(attempt, baseMs = DEFAULT_BACKOFF_BASE_MS, maxMs = DEFAULT_BACKOFF_MAX_MS) {
    const safeAttempt = Math.max(1, asFiniteInteger(attempt) ?? 1);
    const safeBase = Math.max(1, asFiniteInteger(baseMs) ?? DEFAULT_BACKOFF_BASE_MS);
    const safeMax = Math.max(safeBase, asFiniteInteger(maxMs) ?? DEFAULT_BACKOFF_MAX_MS);

    const exponential = Math.min(safeMax, safeBase * (2 ** (safeAttempt - 1)));
    const jitterFactor = 0.8 + (Math.random() * 0.4);

    return Math.min(safeMax, Math.max(1, Math.round(exponential * jitterFactor)));
}

export function sleep(ms) {
    const delay = Math.max(0, Number(ms) || 0);
    return new Promise(resolve => setTimeout(resolve, delay));
}

export default {
    normalizeLimit,
    loadEngagedRecords,
    pruneEngagedRecords,
    serializeEngagedRecords,
    shouldRetryTwitterError,
    computeBackoffMs,
    sleep,
};

const DEFAULT_TIMEZONE = process.env.BOT_TIMEZONE || 'America/New_York';

const dateFormatterCache = new Map();

function getDateFormatter(timeZone = DEFAULT_TIMEZONE) {
    const key = String(timeZone || DEFAULT_TIMEZONE);
    if (!dateFormatterCache.has(key)) {
        dateFormatterCache.set(key, new Intl.DateTimeFormat('en-CA', {
            timeZone: key,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }));
    }
    return dateFormatterCache.get(key);
}

export function getDefaultTimezone() {
    return DEFAULT_TIMEZONE;
}

export function getTimeZoneDateKey(input = new Date(), timeZone = DEFAULT_TIMEZONE) {
    const date = input instanceof Date ? input : new Date(input);
    if (!Number.isFinite(date.getTime())) {
        throw new Error(`Invalid date input: ${input}`);
    }
    return getDateFormatter(timeZone).format(date);
}

export function parseStoredTimestamp(value) {
    if (!value) return null;

    if (value instanceof Date) {
        return Number.isFinite(value.getTime()) ? value : null;
    }

    if (typeof value === 'number') {
        const parsed = new Date(value);
        return Number.isFinite(parsed.getTime()) ? parsed : null;
    }

    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
        const parsed = new Date(trimmed.replace(' ', 'T') + 'Z');
        return Number.isFinite(parsed.getTime()) ? parsed : null;
    }

    const parsed = new Date(trimmed);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function isTimestampOnDateInTimeZone(timestamp, dateKey, timeZone = DEFAULT_TIMEZONE) {
    const parsed = parseStoredTimestamp(timestamp);
    if (!parsed) return false;
    return getTimeZoneDateKey(parsed, timeZone) === dateKey;
}

export function formatTimestampInTimeZone(timestamp, timeZone = DEFAULT_TIMEZONE, locale = 'en-US') {
    const parsed = parseStoredTimestamp(timestamp);
    if (!parsed) return String(timestamp || '');
    return parsed.toLocaleString(locale, { timeZone });
}

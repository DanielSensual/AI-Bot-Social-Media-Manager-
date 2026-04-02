/**
 * Structured Logger — @ghostai/shared
 * Drop-in replacement for console.log with levels, timestamps, and optional JSON mode.
 *
 * Usage:
 *   import { createLogger } from '@ghostai/shared/logger';
 *   const log = createLogger('scheduler');
 *   log.info('Posted to X', { postId: '123' });
 *   log.error('Failed', { error: err.message });
 *
 * Set LOG_FORMAT=json for machine-parseable output.
 * Set LOG_LEVEL=debug|info|warn|error to filter output.
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const EMOJIS = { debug: '🔍', info: 'ℹ️ ', warn: '⚠️', error: '🚨' };

const LOG_LEVEL = LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVELS.info;
const JSON_MODE = process.env.LOG_FORMAT === 'json';

/**
 * Create a namespaced logger
 * @param {string} namespace - Module name (e.g. 'scheduler', 'alerts')
 * @returns {object} Logger with debug/info/warn/error methods
 */
export function createLogger(namespace = 'app') {
    function emit(level, message, meta = {}) {
        if (LEVELS[level] < LOG_LEVEL) return;

        const timestamp = new Date().toISOString();

        if (JSON_MODE) {
            const entry = { timestamp, level, namespace, message, ...meta };
            const writer = level === 'error' ? console.error : console.log;
            writer(JSON.stringify(entry));
        } else {
            const prefix = `${EMOJIS[level]} [${timestamp.slice(11, 19)}] [${namespace}]`;
            const metaStr = Object.keys(meta).length
                ? ` ${JSON.stringify(meta)}`
                : '';

            if (level === 'error') {
                console.error(`${prefix} ${message}${metaStr}`);
            } else if (level === 'warn') {
                console.warn(`${prefix} ${message}${metaStr}`);
            } else {
                console.log(`${prefix} ${message}${metaStr}`);
            }
        }
    }

    return {
        debug: (msg, meta) => emit('debug', msg, meta),
        info: (msg, meta) => emit('info', msg, meta),
        warn: (msg, meta) => emit('warn', meta ? msg : msg, meta),
        error: (msg, meta) => emit('error', msg, meta),
    };
}

export default { createLogger };

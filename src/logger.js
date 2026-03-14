/**
 * Structured Logger — JSON or Pretty output
 *
 * Usage:
 *   import { log, createLogger } from './logger.js';
 *   log.info('Task completed', { task_id: '123', platform: 'x' });
 *   log.error('Post failed', { task_id: '123', error: err.message });
 *
 * Env:
 *   LOG_FORMAT=json   → JSON lines (for containers / CloudWatch)
 *   LOG_FORMAT=pretty → Human-readable (default for local dev)
 */

const FORMAT = (process.env.LOG_FORMAT || 'pretty').toLowerCase();
const isJSON = FORMAT === 'json';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL = LEVELS[process.env.LOG_LEVEL?.toLowerCase()] || LEVELS.info;

// ANSI colors for pretty mode
const COLORS = {
    debug: '\x1b[90m',  // gray
    info:  '\x1b[36m',  // cyan
    warn:  '\x1b[33m',  // yellow
    error: '\x1b[31m',  // red
    reset: '\x1b[0m',
};

const ICONS = { debug: '🔍', info: '📋', warn: '⚠️', error: '❌' };

function formatTimestamp() {
    return new Date().toISOString();
}

function emit(level, msg, fields = {}) {
    if (LEVELS[level] < MIN_LEVEL) return;

    const ts = formatTimestamp();

    if (isJSON) {
        const entry = {
            ts,
            level,
            msg,
            ...fields,
        };
        // Remove undefined values
        for (const key of Object.keys(entry)) {
            if (entry[key] === undefined) delete entry[key];
        }
        const stream = level === 'error' ? process.stderr : process.stdout;
        stream.write(JSON.stringify(entry) + '\n');
    } else {
        const color = COLORS[level] || '';
        const icon = ICONS[level] || '';
        const fieldStr = Object.keys(fields).length > 0
            ? ` ${COLORS.debug}${JSON.stringify(fields)}${COLORS.reset}`
            : '';
        const stream = level === 'error' ? process.stderr : process.stdout;
        stream.write(`${color}${icon} [${ts}] [${level.toUpperCase()}]${COLORS.reset} ${msg}${fieldStr}\n`);
    }
}

/**
 * Create a child logger with default fields baked in.
 * Useful for per-task or per-platform loggers.
 *
 *   const taskLog = createLogger({ task_id: 'xyz', platform: 'x' });
 *   taskLog.info('Starting post');
 */
export function createLogger(defaults = {}) {
    return {
        debug: (msg, fields = {}) => emit('debug', msg, { ...defaults, ...fields }),
        info:  (msg, fields = {}) => emit('info',  msg, { ...defaults, ...fields }),
        warn:  (msg, fields = {}) => emit('warn',  msg, { ...defaults, ...fields }),
        error: (msg, fields = {}) => emit('error', msg, { ...defaults, ...fields }),
    };
}

/** Root logger (no default fields) */
export const log = createLogger();

export default log;

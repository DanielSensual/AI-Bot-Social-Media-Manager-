#!/usr/bin/env node

/**
 * ClawBot Log Watcher
 * Tails OpenClaw structured JSON logs and pushes interesting events
 * to the GhostAI Dashboard via POST /api/clawbot.
 *
 * Usage:
 *   node scripts/clawbot-watcher.js
 *   node scripts/clawbot-watcher.js --dry-run
 *   node scripts/clawbot-watcher.js --dashboard-url https://your-dashboard.vercel.app
 */

import fs from 'fs';
import path from 'path';

const LOG_DIR = '/tmp/openclaw';
const PUSH_INTERVAL_MS = 10_000;
const DRY_RUN = process.argv.includes('--dry-run');

const DASHBOARD_URL = (() => {
    const idx = process.argv.indexOf('--dashboard-url');
    if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
    return process.env.DASHBOARD_URL || 'https://ghostai-dashboard.vercel.app';
})();

/** Get today's log file path */
function getLogPath() {
    const today = new Date().toISOString().slice(0, 10);
    return path.join(LOG_DIR, `openclaw-${today}.log`);
}

/** Classify a log entry into an event type */
function classifyEntry(entry) {
    const raw = entry['0'] || entry['1'] || '';
    const msg = typeof raw === 'string' ? raw : JSON.stringify(raw);
    const level = (entry._meta?.logLevelName || '').toUpperCase();

    // Errors
    if (level === 'ERROR' || msg.includes('failed') || msg.includes('error')) {
        return 'error';
    }

    // Browser actions
    if (msg.includes('[browser') || msg.includes('browser:') || msg.includes('locator.')) {
        return 'browser';
    }

    // Tool calls
    if (msg.includes('[tools]') || msg.includes('tool-images') || msg.includes('exec')) {
        return 'tool';
    }

    // Messages (inbound/outbound)
    if (msg.includes('inbound message') || msg.includes('outbound') || msg.includes('web-inbound') || msg.includes('auto-reply')) {
        return 'message';
    }

    // System events
    if (msg.includes('[gateway]') || msg.includes('[heartbeat]') || msg.includes('[health') ||
        msg.includes('started') || msg.includes('listening')) {
        return 'system';
    }

    return null; // Skip uninteresting entries
}

/** Extract channel info from an entry */
function extractChannel(entry) {
    const meta = entry['0'] || '';
    const metaStr = typeof meta === 'string' ? meta : JSON.stringify(meta);

    if (metaStr.includes('telegram')) return 'telegram';
    if (metaStr.includes('whatsapp') || metaStr.includes('web-inbound')) return 'whatsapp';
    if (metaStr.includes('imessage')) return 'imessage';
    if (metaStr.includes('browser')) return 'browser';

    const msg = entry['2'] || entry['1'] || '';
    const msgStr = typeof msg === 'string' ? msg : '';
    if (msgStr.includes('telegram')) return 'telegram';
    if (msgStr.includes('whatsapp')) return 'whatsapp';

    return '';
}

/** Extract a readable message from a log entry */
function extractMessage(entry) {
    // Prefer the human-readable message field (index 2 or the raw string at 0)
    const humanMsg = entry['2'];
    if (typeof humanMsg === 'string' && humanMsg.length > 0) return humanMsg;

    const raw = entry['0'] || '';
    if (typeof raw === 'string') {
        // Strip ANSI escape codes
        return raw.replace(/\u001b\[[0-9;]*m/g, '').trim();
    }

    return JSON.stringify(raw).slice(0, 200);
}

/** Extract detail info (like media paths, error stacks) */
function extractDetail(entry) {
    const data = entry['1'];
    if (!data || typeof data !== 'object') return '';

    if (data.mediaPath) return `media: ${path.basename(data.mediaPath)}`;
    if (data.from) return `from: ${data.from}`;
    if (data.error) return `error: ${data.error}`;

    return '';
}

/** Parse a single JSON log line into an event */
function parseLogLine(line) {
    try {
        const entry = JSON.parse(line);
        const type = classifyEntry(entry);
        if (!type) return null;

        return {
            type,
            channel: extractChannel(entry),
            message: extractMessage(entry).slice(0, 500),
            status: type === 'error' ? 'error' : 'ok',
            timestamp: entry.time || entry._meta?.date || new Date().toISOString(),
            detail: extractDetail(entry).slice(0, 200),
        };
    } catch {
        return null;
    }
}

/** Push events to the dashboard */
async function pushEvents(events) {
    if (events.length === 0) return;

    if (DRY_RUN) {
        console.log(`[dry-run] Would push ${events.length} events:`);
        for (const e of events) {
            console.log(`  [${e.type}] ${e.channel || '-'} :: ${e.message.slice(0, 80)}`);
        }
        return;
    }

    try {
        const res = await fetch(`${DASHBOARD_URL}/api/clawbot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ events }),
            signal: AbortSignal.timeout(15000),
        });

        if (res.ok) {
            const data = await res.json();
            console.log(`📤 Pushed ${data.added} events to dashboard (total: ${data.total})`);
        } else {
            console.warn(`⚠️ Dashboard returned ${res.status}: ${await res.text()}`);
        }
    } catch (err) {
        console.warn(`⚠️ Failed to push to dashboard: ${err.message}`);
    }
}

// ── Main Loop ─────────────────────────────────────────────────────────────────

let lastOffset = 0;
let pendingEvents = [];
let currentLogPath = '';

function tailLog() {
    const logPath = getLogPath();

    // Reset offset if the log file changed (new day)
    if (logPath !== currentLogPath) {
        currentLogPath = logPath;
        lastOffset = 0;
        console.log(`📋 Watching: ${logPath}`);
    }

    if (!fs.existsSync(logPath)) return;

    const stat = fs.statSync(logPath);
    if (stat.size <= lastOffset) return;

    const stream = fs.createReadStream(logPath, {
        start: lastOffset,
        encoding: 'utf8',
    });

    let buffer = '';
    stream.on('data', (chunk) => { buffer += chunk; });
    stream.on('end', () => {
        lastOffset = stat.size;
        const lines = buffer.split('\n').filter(Boolean);

        for (const line of lines) {
            const event = parseLogLine(line);
            if (event) pendingEvents.push(event);
        }
    });
}

async function pushLoop() {
    if (pendingEvents.length > 0) {
        const batch = pendingEvents.splice(0, 50);
        await pushEvents(batch);
    }
}

// Boot
console.log('');
console.log('🦞 ClawBot Log Watcher');
console.log(`   Dashboard: ${DASHBOARD_URL}`);
console.log(`   Log dir: ${LOG_DIR}`);
console.log(`   Push interval: ${PUSH_INTERVAL_MS / 1000}s`);
if (DRY_RUN) console.log('   Mode: DRY RUN');
console.log('');

// Start loops
tailLog();
setInterval(tailLog, 3000);
setInterval(pushLoop, PUSH_INTERVAL_MS);

// Initial push of recent events (last 50 lines of current log)
const logPath = getLogPath();
if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split('\n').filter(Boolean).slice(-50);
    for (const line of lines) {
        const event = parseLogLine(line);
        if (event) pendingEvents.push(event);
    }
    console.log(`📋 Loaded ${pendingEvents.length} recent events from log`);
    // Push immediately
    pushLoop();
}

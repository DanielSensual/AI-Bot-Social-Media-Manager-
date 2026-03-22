#!/usr/bin/env node
/**
 * GhostAI Command Agent
 * Long-lived local worker that executes bot commands for the remote dashboard.
 *
 * Endpoints:
 *   GET  /health
 *   GET  /state
 *   POST /run
 *
 * Auth:
 *   Authorization: Bearer <COMMAND_AGENT_TOKEN>
 */

import 'dotenv/config';
import http from 'http';
import path from 'path';
import { spawn } from 'child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOT_ROOT = path.join(__dirname, '..');
const PORT = Number.parseInt(process.env.PORT || process.env.COMMAND_AGENT_PORT || '8787', 10);
const HOST = process.env.COMMAND_AGENT_HOST || '127.0.0.1';
const AUTH_TOKEN = process.env.COMMAND_AGENT_TOKEN || '';
const CORS_ORIGIN = process.env.COMMAND_AGENT_CORS_ORIGIN || '';

const MAX_RUNS = 40;
const MAX_OUTPUT_CHARS = 60000;
const MAX_BODY_BYTES = 1024 * 256;

// Rate limiting — sliding window per IP
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 60; // requests per window
const rateLimitMap = new Map();

function checkRateLimit(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

    if (now > entry.resetAt) {
        entry.count = 0;
        entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
    }

    entry.count++;
    rateLimitMap.set(ip, entry);

    return entry.count <= RATE_LIMIT_MAX;
}

const state = {
    runs: [],
};

function json(res, statusCode, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': CORS_ORIGIN,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    });
    res.end(body);
}

function timingSafeTokenCheck(candidate, expected) {
    if (!candidate || !expected) return false;
    const a = Buffer.from(String(candidate));
    const b = Buffer.from(String(expected));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

function isAuthorized(req) {
    const raw = req.headers.authorization || '';
    const [scheme, token] = raw.split(' ');
    if (String(scheme || '').toLowerCase() !== 'bearer') return false;
    return timingSafeTokenCheck(token || '', AUTH_TOKEN);
}

function toInt(value, fallback) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (Number.isNaN(parsed)) return fallback;
    return parsed;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function asString(value, fallback = '') {
    const str = typeof value === 'string' ? value : fallback;
    return str.trim();
}

function sanitizeChunk(chunk) {
    return String(chunk || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function appendOutput(run, chunk) {
    const next = `${run.output || ''}${sanitizeChunk(chunk)}`;
    run.output = next.length <= MAX_OUTPUT_CHARS
        ? next
        : next.slice(next.length - MAX_OUTPUT_CHARS);
}

function getCatalog() {
    return [
        {
            id: 'engage-x',
            title: 'Engage X',
            description: 'Reply to fresh, high-value X posts.',
            singleFlight: true,
            fields: [
                { key: 'limit', type: 'number', label: 'Limit', min: 1, max: 25, defaultValue: 10 },
                { key: 'dryRun', type: 'boolean', label: 'Dry Run', defaultValue: false },
            ],
            build(params = {}) {
                const limit = clamp(toInt(params.limit, 10), 1, 25);
                const dryRun = Boolean(params.dryRun);
                const args = ['scripts/engage-x.js', `--limit=${limit}`];
                if (dryRun) args.push('--dry-run');
                return {
                    command: 'node',
                    args,
                    cwd: BOT_ROOT,
                    env: {
                        AI_PROVIDER: process.env.AI_PROVIDER || 'auto',
                        OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-5.2',
                    },
                };
            },
        },
        {
            id: 'engage-instagram',
            title: 'Engage Instagram',
            description: 'Find and comment on relevant Instagram posts.',
            singleFlight: true,
            fields: [
                { key: 'limit', type: 'number', label: 'Limit', min: 1, max: 30, defaultValue: 10 },
                { key: 'dryRun', type: 'boolean', label: 'Dry Run', defaultValue: true },
            ],
            build(params = {}) {
                const limit = clamp(toInt(params.limit, 10), 1, 30);
                const dryRun = Boolean(params.dryRun);
                const args = ['scripts/engage-instagram.js', `--limit=${limit}`];
                if (dryRun) args.push('--dry-run');
                return {
                    command: 'node',
                    args,
                    cwd: BOT_ROOT,
                    env: {
                        AI_PROVIDER: process.env.AI_PROVIDER || 'auto',
                        OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-5.2',
                    },
                };
            },
        },
        {
            id: 'instagram-autopilot-once',
            title: 'Instagram Autopilot (Once)',
            description: 'Run API-only Instagram autopilot once for comments/story/reel.',
            singleFlight: true,
            fields: [
                { key: 'slot', type: 'text', label: 'Slot (all|comment|story|reel)', defaultValue: 'all' },
                { key: 'dryRun', type: 'boolean', label: 'Dry Run', defaultValue: true },
            ],
            build(params = {}) {
                const slotRaw = asString(params.slot || 'all').toLowerCase();
                const slot = ['all', 'comment', 'story', 'reel'].includes(slotRaw) ? slotRaw : 'all';
                const dryRun = Boolean(params.dryRun);
                const args = ['scripts/instagram-autopilot.js', '--once', '--slot', slot];
                if (dryRun) args.push('--dry-run');
                return {
                    command: 'node',
                    args,
                    cwd: BOT_ROOT,
                    env: {
                        AI_PROVIDER: process.env.AI_PROVIDER || 'auto',
                        OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-5.2',
                    },
                };
            },
        },
        {
            id: 'post-all-video',
            title: 'Post Video (All Platforms)',
            description: 'Post one local video to X, LinkedIn, Facebook, and Instagram.',
            singleFlight: true,
            fields: [
                { key: 'videoFile', type: 'text', label: 'Video File Path', defaultValue: '' },
                { key: 'xCaption', type: 'textarea', label: 'X Caption (<= 280)', defaultValue: '' },
                { key: 'mainCaption', type: 'textarea', label: 'Main Caption (LI/FB/IG)', defaultValue: '' },
                { key: 'dryRun', type: 'boolean', label: 'Dry Run', defaultValue: true },
            ],
            build(params = {}) {
                const videoFileRaw = asString(params.videoFile);
                const xCaption = asString(params.xCaption);
                const mainCaption = asString(params.mainCaption);
                const dryRun = Boolean(params.dryRun);

                if (!videoFileRaw) throw new Error('videoFile is required');
                if (!xCaption) throw new Error('xCaption is required');
                if (!mainCaption) throw new Error('mainCaption is required');
                if (xCaption.length > 280) throw new Error('xCaption must be <= 280 chars');
                if (mainCaption.length > 2200) throw new Error('mainCaption must be <= 2200 chars');

                const videoFile = path.isAbsolute(videoFileRaw)
                    ? videoFileRaw
                    : path.resolve(BOT_ROOT, videoFileRaw);

                const args = [
                    'scripts/post-all-video.js',
                    '--video-file',
                    videoFile,
                    '--x-caption',
                    xCaption,
                    '--main-caption',
                    mainCaption,
                ];
                if (dryRun) args.push('--dry-run');

                return {
                    command: 'node',
                    args,
                    cwd: BOT_ROOT,
                    env: {
                        AI_PROVIDER: process.env.AI_PROVIDER || 'auto',
                        OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-5.2',
                    },
                };
            },
        },
        {
            id: 'test-connections',
            title: 'Test Connections',
            description: 'Run end-to-end platform connectivity checks.',
            singleFlight: true,
            fields: [],
            build() {
                return { command: 'node', args: ['scripts/test-connection.js'], cwd: BOT_ROOT };
            },
        },
        {
            id: 'sync-dashboard',
            title: 'Sync Dashboard',
            description: 'Push latest bot metrics into the dashboard.',
            singleFlight: true,
            fields: [],
            build() {
                return {
                    command: 'node',
                    args: ['scripts/sync-dashboard.js'],
                    cwd: BOT_ROOT,
                    env: {
                        DASHBOARD_URL: process.env.DASHBOARD_URL || 'http://localhost:3000',
                        DASHBOARD_SECRET: process.env.DASHBOARD_SECRET || '',
                    },
                };
            },
        },
    ];
}

function compactRun(run) {
    return {
        id: run.id,
        commandId: run.commandId,
        title: run.title,
        description: run.description,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt || null,
        exitCode: Number.isInteger(run.exitCode) ? run.exitCode : null,
        commandLine: run.commandLine,
        output: run.output || '',
        params: run.params || {},
    };
}

function listState() {
    const catalog = getCatalog().map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        fields: item.fields || [],
    }));
    const runs = state.runs.map(compactRun);
    const runningCount = runs.filter((run) => run.status === 'running').length;
    return {
        executorMode: 'agent',
        botRoot: BOT_ROOT,
        commands: catalog,
        runs,
        runningCount,
    };
}

function pushRun(run) {
    state.runs.unshift(run);
    if (state.runs.length > MAX_RUNS) {
        state.runs = state.runs.slice(0, MAX_RUNS);
    }
}

function startRun(commandId, params = {}) {
    const catalog = getCatalog();
    const command = catalog.find((item) => item.id === commandId);
    if (!command) {
        const err = new Error(`Unknown command: ${commandId}`);
        err.code = 'E_UNKNOWN_COMMAND';
        throw err;
    }

    if (command.singleFlight) {
        const existing = state.runs.find((run) => run.commandId === commandId && run.status === 'running');
        if (existing) {
            const err = new Error(`${command.title} is already running`);
            err.code = 'E_BUSY';
            throw err;
        }
    }

    const plan = command.build(params || {});
    const run = {
        id: `run_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        commandId: command.id,
        title: command.title,
        description: command.description,
        status: 'running',
        startedAt: new Date().toISOString(),
        finishedAt: null,
        exitCode: null,
        output: '',
        params: params || {},
        commandLine: `${plan.command} ${(plan.args || []).join(' ')}`,
    };
    pushRun(run);

    const child = spawn(plan.command, plan.args || [], {
        cwd: plan.cwd || BOT_ROOT,
        env: {
            ...process.env,
            ...(plan.env || {}),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (chunk) => appendOutput(run, chunk));
    child.stderr?.on('data', (chunk) => appendOutput(run, chunk));

    child.on('error', (error) => {
        appendOutput(run, `\n❌ Process error: ${error.message}\n`);
        run.status = 'failed';
        run.exitCode = 1;
        run.finishedAt = new Date().toISOString();
    });

    child.on('close', (code) => {
        run.exitCode = Number.isInteger(code) ? code : 1;
        run.status = code === 0 ? 'succeeded' : 'failed';
        run.finishedAt = new Date().toISOString();
    });

    return compactRun(run);
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';

        req.on('data', (chunk) => {
            body += chunk.toString('utf8');
            if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
                reject(new Error('Payload too large'));
                req.destroy();
            }
        });

        req.on('end', () => {
            if (!body.trim()) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(body));
            } catch {
                reject(new Error('Invalid JSON'));
            }
        });

        req.on('error', reject);
    });
}

if (!AUTH_TOKEN) {
    console.error('❌ COMMAND_AGENT_TOKEN is required. Set it as an env var — DASHBOARD_SECRET fallback has been removed for security.');
    process.exit(1);
}

const server = http.createServer(async (req, res) => {
    const clientIp = req.socket?.remoteAddress || 'unknown';

    // Rate limit check (before auth to prevent brute-force)
    if (!checkRateLimit(clientIp)) {
        json(res, 429, { error: 'Too many requests' });
        return;
    }

    if (req.method === 'OPTIONS') {
        json(res, 200, { ok: true });
        return;
    }

    if (!isAuthorized(req)) {
        json(res, 401, { error: 'Unauthorized' });
        return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
        json(res, 200, { ok: true, time: new Date().toISOString() });
        return;
    }

    if (req.method === 'GET' && url.pathname === '/state') {
        json(res, 200, listState());
        return;
    }

    if (req.method === 'POST' && url.pathname === '/run') {
        try {
            const payload = await readJsonBody(req);
            const commandId = asString(payload.commandId);
            const params = payload.params && typeof payload.params === 'object' && !Array.isArray(payload.params)
                ? payload.params
                : {};

            if (!commandId) {
                json(res, 400, { error: 'commandId is required' });
                return;
            }

            const run = startRun(commandId, params);
            json(res, 200, { success: true, run });
        } catch (error) {
            if (error.code === 'E_BUSY') {
                json(res, 409, { error: error.message });
                return;
            }
            if (error.code === 'E_UNKNOWN_COMMAND') {
                json(res, 400, { error: error.message });
                return;
            }
            if (error.message === 'Payload too large') {
                json(res, 413, { error: error.message });
                return;
            }
            json(res, 500, { error: error.message || 'Run failed' });
        }
        return;
    }

    json(res, 404, { error: 'Not found' });
});

server.listen(PORT, HOST, () => {
    console.log(`✅ Command agent listening on http://${HOST}:${PORT}`);
    console.log(`   Bot root: ${BOT_ROOT}`);
});

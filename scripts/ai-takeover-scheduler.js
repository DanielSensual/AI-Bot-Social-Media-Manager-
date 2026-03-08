#!/usr/bin/env node
/**
 * AI Takeover Engagement Scheduler
 * ----------------------------------
 * Long-running process for Railway deployment.
 * - Decodes X session from env var on startup
 * - Runs engagement bot on a cron schedule (10am, 2pm, 7pm ET)
 * - Exposes /health endpoint for Railway health checks
 */

import 'dotenv/config';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import cron from 'node-cron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = path.join(__dirname, '..', '.x-session.json');
const ENGAGE_SCRIPT = path.join(__dirname, 'ai-takeover-engage.js');
const PORT = process.env.PORT || 8787;
const ENGAGE_LIMIT = process.env.ENGAGE_LIMIT || '8';

let lastRunAt = null;
let lastRunResult = null;
let isRunning = false;

// ---------- Session Management ----------
function restoreSession() {
    const b64 = process.env.X_SESSION_JSON;
    if (b64) {
        try {
            const json = Buffer.from(b64, 'base64').toString('utf-8');
            // Validate it's real JSON
            JSON.parse(json);
            fs.writeFileSync(SESSION_FILE, json);
            console.log('✅ Session restored from X_SESSION_JSON env var');
            return true;
        } catch (e) {
            console.error('❌ Failed to decode X_SESSION_JSON:', e.message);
            return false;
        }
    }

    if (fs.existsSync(SESSION_FILE)) {
        console.log('✅ Using existing .x-session.json file');
        return true;
    }

    console.error('❌ No session available. Set X_SESSION_JSON env var (base64 of .x-session.json)');
    return false;
}

// ---------- Run Engagement ----------
function runEngagement() {
    if (isRunning) {
        console.log('⏳ Engagement already running, skipping...');
        return;
    }

    isRunning = true;
    const startTime = new Date();
    console.log(`\n🤖 [${startTime.toISOString()}] Starting engagement run...`);

    const child = spawn('node', [ENGAGE_SCRIPT, `--limit=${ENGAGE_LIMIT}`], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env },
        stdio: 'inherit',
    });

    child.on('close', (code) => {
        isRunning = false;
        lastRunAt = new Date().toISOString();
        lastRunResult = code === 0 ? 'success' : `failed (exit ${code})`;
        console.log(`\n✅ [${lastRunAt}] Engagement run finished: ${lastRunResult}`);
    });

    child.on('error', (err) => {
        isRunning = false;
        lastRunAt = new Date().toISOString();
        lastRunResult = `error: ${err.message}`;
        console.error(`❌ [${lastRunAt}] Engagement run error: ${err.message}`);
    });
}

// ---------- Health Check Server ----------
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        const status = {
            status: 'ok',
            service: 'ai-takeover-engage',
            isRunning,
            lastRunAt,
            lastRunResult,
            sessionExists: fs.existsSync(SESSION_FILE),
            uptime: process.uptime(),
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status));
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('AI Takeover Engagement Scheduler — use /health for status');
    }
});

// ---------- Main ----------
function main() {
    console.log('');
    console.log('🤖 ═══════════════════════════════════════');
    console.log('   AI TAKEOVER ENGAGEMENT SCHEDULER');
    console.log('   Railway Edition — 24/7 Autonomous');
    console.log('═══════════════════════════════════════════');
    console.log('');

    if (!restoreSession()) {
        console.error('Cannot start without a valid X session. Exiting.');
        process.exit(1);
    }

    // Schedule: 10am, 2pm, 7pm ET daily
    // node-cron uses the TZ env var (set to America/New_York)
    cron.schedule('0 10 * * *', () => {
        console.log('⏰ Morning engagement triggered');
        runEngagement();
    });

    cron.schedule('0 14 * * *', () => {
        console.log('⏰ Afternoon engagement triggered');
        runEngagement();
    });

    cron.schedule('0 19 * * *', () => {
        console.log('⏰ Evening engagement triggered');
        runEngagement();
    });

    console.log('📅 Scheduled: 10:00 AM, 2:00 PM, 7:00 PM ET daily');
    console.log(`🎯 Limit: ${ENGAGE_LIMIT} replies per run`);
    console.log('');

    // Start health check server
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`🏥 Health check: http://0.0.0.0:${PORT}/health`);
    });

    // ---------- Keepalive ----------
    // Railway puts services to sleep after 10 min of no outbound traffic.
    // Make an outbound HTTP request every 5 min to keep the process alive.
    setInterval(() => {
        https.get('https://httpbin.org/status/200', (res) => {
            res.resume();
        }).on('error', () => { });
        console.log(`   💓 [${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' })}] Keepalive ping`);
    }, 5 * 60 * 1000);

    // Run immediately on startup (catch up if deployed mid-day)
    console.log('🚀 Running initial engagement on startup...');
    setTimeout(() => runEngagement(), 5000);
}

main();

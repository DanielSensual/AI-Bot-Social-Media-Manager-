#!/usr/bin/env node
/**
 * Railway Unified Bot Entry Point
 *
 * Runs ALL bot schedulers in a single process for Railway deployment.
 * This keeps costs at $5/mo instead of $15/mo (3 separate services).
 *
 * Bots included:
 *   1. ghostai-bot (LinkedIn + X + Facebook scheduler)
 *   2. instagram-autopilot
 *   3. facebook-agent
 *
 * Also starts a tiny HTTP health check server on $PORT for Railway.
 *
 * Usage:
 *   node scripts/railway-start.js              # Run all bots
 *   BOT_ONLY=ghostai node scripts/railway-start.js  # Run just one
 */

import http from 'http';
import { fork } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Restore LinkedIn tokens from env vars (base64-encoded) ──────────────────
function restoreTokensFromEnv() {
    const tokenEnvs = {
        'LINKEDIN_TOKEN_JSON': '.linkedin-token.json',
        'LINKEDIN_TOKEN_DANIEL_JSON': '.linkedin-token-daniel.json',
    };

    for (const [envKey, filename] of Object.entries(tokenEnvs)) {
        const b64 = process.env[envKey];
        if (b64) {
            const tokenPath = path.join(ROOT, filename);
            try {
                const json = Buffer.from(b64, 'base64').toString('utf-8');
                JSON.parse(json); // Validate it's real JSON
                fs.writeFileSync(tokenPath, json);
                console.log(`✅ Restored ${filename} from env`);
            } catch (err) {
                console.error(`❌ Failed to restore ${filename}: ${err.message}`);
            }
        }
    }
}

// ── Health check HTTP server ────────────────────────────────────────────────
const PORT = process.env.PORT || 8787;
const startedAt = new Date().toISOString();
const botStatus = {};

function startHealthServer() {
    const server = http.createServer((req, res) => {
        if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'ok',
                uptime: process.uptime(),
                startedAt,
                bots: botStatus,
                memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
            }));
        } else {
            res.writeHead(200);
            res.end('👻 GhostAI Bot Fleet — Railway');
        }
    });

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`🏥 Health server listening on 0.0.0.0:${PORT}`);
    });
}

// ── Bot process management ──────────────────────────────────────────────────
const BOT_CONFIGS = [
    {
        name: 'ghostai-bot',
        script: 'src/index.js',
        description: 'LinkedIn + X + Facebook scheduler (4x daily)',
    },
    {
        name: 'instagram-autopilot',
        script: 'scripts/instagram-autopilot.js',
        description: 'Instagram Reels + Stories + Comments',
    },
    {
        name: 'facebook-agent',
        script: 'scripts/facebook-agent.js',
        description: 'AI Knowledge Facebook page (4x daily)',
    },
];

function startBot(config) {
    const scriptPath = path.join(ROOT, config.script);

    if (!fs.existsSync(scriptPath)) {
        console.error(`❌ ${config.name}: Script not found at ${config.script}`);
        botStatus[config.name] = 'missing';
        return;
    }

    console.log(`🚀 Starting ${config.name}: ${config.description}`);
    botStatus[config.name] = 'starting';

    const child = fork(scriptPath, [], {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env },
    });

    child.on('spawn', () => {
        botStatus[config.name] = 'running';
        console.log(`✅ ${config.name} is running (PID: ${child.pid})`);
    });

    child.on('error', (err) => {
        botStatus[config.name] = `error: ${err.message}`;
        console.error(`❌ ${config.name} error: ${err.message}`);
    });

    child.on('exit', (code, signal) => {
        botStatus[config.name] = `exited (code=${code}, signal=${signal})`;
        console.warn(`⚠️ ${config.name} exited (code=${code}, signal=${signal})`);

        // Auto-restart after 30 seconds if it crashes
        if (code !== 0 && !signal) {
            console.log(`🔄 Restarting ${config.name} in 30s...`);
            setTimeout(() => startBot(config), 30_000);
        }
    });

    return child;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
    console.log('');
    console.log('👻 ═══════════════════════════════════════════');
    console.log('   G H O S T A I   B O T   F L E E T');
    console.log('   Railway Unified Deployment');
    console.log('═══════════════════════════════════════════════');
    console.log(`   Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
    console.log('');

    // Restore LinkedIn tokens from env
    restoreTokensFromEnv();

    // Start health server first (Railway needs this)
    startHealthServer();

    // Determine which bots to start
    const botOnly = process.env.BOT_ONLY;
    const botsToStart = botOnly
        ? BOT_CONFIGS.filter(b => b.name.includes(botOnly))
        : BOT_CONFIGS;

    if (botsToStart.length === 0) {
        console.error(`❌ No bot matched BOT_ONLY="${botOnly}"`);
        process.exit(1);
    }

    console.log(`📋 Starting ${botsToStart.length} bot(s):`);
    botsToStart.forEach(b => console.log(`   • ${b.name}`));
    console.log('');

    // Stagger starts by 5 seconds to avoid rate-limit bursts
    for (const config of botsToStart) {
        startBot(config);
        if (botsToStart.length > 1) {
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    console.log('');
    console.log('👻 All bots launched. Fleet is operational.');
    console.log('');
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('⏹️ SIGTERM received, shutting down fleet...');
    process.exit(0);
});

main().catch(err => {
    console.error('💀 Fleet startup failed:', err.message);
    process.exit(1);
});

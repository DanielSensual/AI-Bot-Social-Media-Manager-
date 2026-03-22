#!/usr/bin/env node
/**
 * Music Manager Bot — Commander
 *
 * Orchestrates multiple worker bots, each handling a separate
 * Facebook profile/page. Manages scheduling, health checks,
 * and coordination between workers.
 *
 * Architecture:
 *   Commander (this script)
 *     ├── Worker 1: Daniel Castillo (personal profile)
 *     ├── Worker 2: Daniel Sensual (artist page)
 *     └── Worker N: (future profiles)
 *
 * Usage:
 *   node scripts/commander.js                  Run all workers
 *   node scripts/commander.js --worker=daniel  Run specific worker
 *   node scripts/commander.js --status         Show all worker status
 *   node scripts/commander.js --dry-run        Preview without posting
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fork } from 'child_process';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '..', 'data', 'commander-state.json');

const args = process.argv.slice(2);
function getFlag(name) {
    const prefix = `--${name}=`;
    const arg = args.find(v => v.startsWith(prefix));
    return arg ? arg.slice(prefix.length).trim() : '';
}

const flags = {
    worker: getFlag('worker'),
    status: args.includes('--status'),
    dryRun: args.includes('--dry-run'),
    help: args.includes('--help'),
};

// ─── Worker Profiles ────────────────────────────────────────────

const WORKER_PROFILES = [
    {
        id: 'daniel-sensual',
        name: 'Daniel Sensual',
        type: 'artist',
        chromeProfile: path.join(process.env.HOME || '/root', '.danielsensual-chrome-profile'),
        shareScript: 'scripts/danielsensual-share.js',
        engageScript: 'scripts/engagement-bot.js',
        catalogScript: 'scripts/video-catalog.js',
        batches: 3,
        batchSize: 14,
        schedule: {
            rotate: '8:30 AM',
            shares: ['9 AM', '1 PM', '6 PM'],
            engage: ['11 AM', '3 PM', '8 PM'],
            scan: 'Sunday 12 AM',
        },
        active: true,
    },
    {
        id: 'daniel-castillo',
        name: 'Daniel Castillo',
        type: 'personal',
        chromeProfile: path.join(process.env.HOME || '/root', '.danielcastillo-chrome-profile'),
        shareScript: 'scripts/danielsensual-share.js', // Reuses same sharer with different profile
        engageScript: 'scripts/engagement-bot.js',
        catalogScript: 'scripts/video-catalog.js',
        batches: 3,
        batchSize: 14,
        schedule: {
            rotate: '8:45 AM',
            shares: ['9:30 AM', '1:30 PM', '6:30 PM'],
            engage: ['11:30 AM', '3:30 PM', '8:30 PM'],
            scan: 'Sunday 1 AM',
        },
        active: false, // Enable when second Chrome profile is set up
    },
];

// ─── State Management ───────────────────────────────────────────

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    } catch { /* fresh */ }
    return { workers: {}, lastRun: null, totalRuns: 0 };
}

function saveState(state) {
    ensureDir(path.dirname(STATE_FILE));
    state.lastRun = new Date().toISOString();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─── Worker Execution ───────────────────────────────────────────

/**
 * Run a worker's share operation for a specific batch.
 */
function runWorkerBatch(profile, batch, dryRun = false) {
    return new Promise((resolve, reject) => {
        const args = [`--batch=${batch}`];
        if (dryRun) args.push('--dry-run');

        console.log(`   🚀 Starting batch ${batch} for ${profile.name}...`);

        const child = fork(
            path.join(__dirname, '..', profile.shareScript),
            args,
            {
                cwd: path.join(__dirname, '..'),
                env: {
                    ...process.env,
                    CHROME_PROFILE_DIR: profile.chromeProfile,
                    WORKER_ID: profile.id,
                },
                stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
            }
        );

        let output = '';

        child.stdout?.on('data', (data) => {
            const text = data.toString();
            output += text;
            process.stdout.write(`   [${profile.id}] ${text}`);
        });

        child.stderr?.on('data', (data) => {
            process.stderr.write(`   [${profile.id}] ⚠️ ${data.toString()}`);
        });

        child.on('exit', (code) => {
            if (code === 0) {
                resolve({ success: true, output });
            } else {
                resolve({ success: false, error: `Exit code: ${code}`, output });
            }
        });

        child.on('error', (err) => {
            reject(err);
        });

        // Timeout after 30 minutes per batch
        setTimeout(() => {
            child.kill('SIGTERM');
            resolve({ success: false, error: 'Timeout (30m)', output });
        }, 30 * 60 * 1000);
    });
}

/**
 * Run the engagement bot for a worker.
 */
function runWorkerEngagement(profile, dryRun = false) {
    return new Promise((resolve, reject) => {
        const args = ['--max-replies=10'];
        if (dryRun) args.push('--dry-run');

        const child = fork(
            path.join(__dirname, '..', profile.engageScript),
            args,
            {
                cwd: path.join(__dirname, '..'),
                env: {
                    ...process.env,
                    CHROME_PROFILE_DIR: profile.chromeProfile,
                    WORKER_ID: profile.id,
                },
                stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
            }
        );

        let output = '';

        child.stdout?.on('data', (data) => {
            output += data.toString();
            process.stdout.write(`   [${profile.id}] ${data.toString()}`);
        });

        child.stderr?.on('data', (data) => {
            process.stderr.write(`   [${profile.id}] ⚠️ ${data.toString()}`);
        });

        child.on('exit', (code) => {
            resolve({ success: code === 0, output });
        });

        child.on('error', reject);

        setTimeout(() => {
            child.kill('SIGTERM');
            resolve({ success: false, error: 'Timeout', output });
        }, 20 * 60 * 1000);
    });
}

// ─── Commander Orchestration ────────────────────────────────────

/**
 * Run a full cycle for all active workers.
 * Staggers workers by 30 minutes to avoid detection.
 */
async function runFullCycle(targetWorker = '', dryRun = false) {
    const state = loadState();
    const activeProfiles = WORKER_PROFILES.filter(p => {
        if (!p.active) return false;
        if (targetWorker && p.id !== targetWorker) return false;
        return true;
    });

    if (activeProfiles.length === 0) {
        console.log('⚠️ No active workers found');
        if (targetWorker) {
            const profile = WORKER_PROFILES.find(p => p.id === targetWorker);
            if (profile && !profile.active) {
                console.log(`   "${targetWorker}" exists but is not active.`);
                console.log(`   Set active: true in commander.js to enable.`);
            }
        }
        return;
    }

    console.log('\n🎖️ Music Manager — Commander');
    console.log('═'.repeat(55));
    console.log(`   Mode:    ${dryRun ? '🔒 DRY RUN' : '🔴 LIVE'}`);
    console.log(`   Workers: ${activeProfiles.length} active`);
    console.log(`   Time:    ${new Date().toLocaleString()}`);
    console.log('');

    for (let w = 0; w < activeProfiles.length; w++) {
        const profile = activeProfiles[w];

        console.log(`\n┌──────────────────────────────────────────────────────┐`);
        console.log(`│  Worker: ${profile.name.padEnd(42)} │`);
        console.log(`│  Type:   ${profile.type.padEnd(42)} │`);
        console.log(`│  Profile: ${profile.chromeProfile.substring(profile.chromeProfile.lastIndexOf('/') + 1).padEnd(41)} │`);
        console.log(`└──────────────────────────────────────────────────────┘\n`);

        // Initialize worker state
        if (!state.workers[profile.id]) {
            state.workers[profile.id] = {
                totalShares: 0,
                totalReplies: 0,
                lastRun: null,
                runs: [],
            };
        }

        const workerState = state.workers[profile.id];
        const runResult = {
            startedAt: new Date().toISOString(),
            batches: [],
            engagement: null,
        };

        // Run all 3 share batches with delays
        for (let batch = 1; batch <= profile.batches; batch++) {
            console.log(`\n   ── Batch ${batch}/${profile.batches} ──`);

            try {
                const result = await runWorkerBatch(profile, batch, dryRun);
                runResult.batches.push({
                    batch,
                    success: result.success,
                    error: result.error || null,
                });

                if (result.success) {
                    workerState.totalShares += 12; // Approximate
                }
            } catch (err) {
                console.log(`   ❌ Batch ${batch} error: ${err.message}`);
                runResult.batches.push({ batch, success: false, error: err.message });
            }

            // Delay between batches (2-5 min)
            if (batch < profile.batches) {
                const delayMin = Math.floor(Math.random() * 4) + 2;
                console.log(`\n   ⏳ ${delayMin}m cooldown between batches...`);
                await new Promise(r => setTimeout(r, delayMin * 60 * 1000));
            }
        }

        // Run engagement after shares
        console.log(`\n   ── Engagement Scan ──`);
        try {
            const engResult = await runWorkerEngagement(profile, dryRun);
            runResult.engagement = { success: engResult.success };
        } catch (err) {
            console.log(`   ❌ Engagement error: ${err.message}`);
            runResult.engagement = { success: false, error: err.message };
        }

        workerState.lastRun = new Date().toISOString();
        runResult.completedAt = new Date().toISOString();
        workerState.runs.push(runResult);

        // Keep only last 30 runs
        if (workerState.runs.length > 30) {
            workerState.runs = workerState.runs.slice(-30);
        }

        // Stagger between workers (15-30 min)
        if (w < activeProfiles.length - 1) {
            const staggerMin = Math.floor(Math.random() * 16) + 15;
            console.log(`\n⏳ ${staggerMin}m stagger before next worker...`);
            await new Promise(r => setTimeout(r, staggerMin * 60 * 1000));
        }
    }

    state.totalRuns++;
    saveState(state);

    console.log('\n' + '═'.repeat(55));
    console.log('✅ Commander cycle complete');
    console.log(`   Workers: ${activeProfiles.length}`);
    console.log(`   Total runs: ${state.totalRuns}`);
    console.log(`   State: ${STATE_FILE}\n`);
}

// ─── Status Display ─────────────────────────────────────────────

function showStatus() {
    const state = loadState();

    console.log('\n🎖️ Music Manager — Commander Status');
    console.log('═'.repeat(55));
    console.log(`   Last run: ${state.lastRun || 'never'}`);
    console.log(`   Total cycles: ${state.totalRuns}`);
    console.log('');

    for (const profile of WORKER_PROFILES) {
        const ws = state.workers[profile.id] || {};
        const status = profile.active ? '🟢 Active' : '⚪ Inactive';

        console.log(`   ${status}  ${profile.name} (${profile.type})`);
        console.log(`      Profile: ${profile.chromeProfile}`);
        console.log(`      Shares:  ${ws.totalShares || 0} total`);
        console.log(`      Replies: ${ws.totalReplies || 0} total`);
        console.log(`      Last:    ${ws.lastRun || 'never'}`);
        console.log(`      Schedule:`);
        console.log(`         Rotate: ${profile.schedule.rotate}`);
        console.log(`         Shares: ${profile.schedule.shares.join(', ')}`);
        console.log(`         Engage: ${profile.schedule.engage.join(', ')}`);
        console.log(`         Scan:   ${profile.schedule.scan}`);
        console.log('');
    }
}

function showHelp() {
    console.log('\n🎖️ Music Manager — Commander');
    console.log('═'.repeat(55));
    console.log('  (no args)          Run full cycle (all active workers)');
    console.log('  --worker=<id>      Run specific worker only');
    console.log('  --status           Show worker status');
    console.log('  --dry-run          Preview without posting');
    console.log('  --help             Show this help');
    console.log('\n  Worker IDs: daniel-sensual, daniel-castillo\n');
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
    if (flags.help) { showHelp(); return; }
    if (flags.status) { showStatus(); return; }

    await runFullCycle(flags.worker, flags.dryRun);
}

main().catch(err => {
    console.error(`\n❌ Fatal: ${err.message}`);
    process.exit(1);
});

#!/usr/bin/env node

/**
 * Ghost Self-Heal — Autonomous Codebase Doctor
 * 
 * Checks Railway deploy logs and Vercel deployment status for errors,
 * then sends fix goals to the Ghost AI Gateway so it can patch itself.
 *
 * Designed to run at 3AM EST via cron:
 *   0 3 * * * cd ~/Projects/Websites/Bots && node ghostai-x-bot/scripts/self-heal.js >> /tmp/ghost-self-heal.log 2>&1
 *
 * Can also be run manually:
 *   node scripts/self-heal.js
 *   node scripts/self-heal.js --dry-run    # Don't send goals, just report
 */

import { execSync } from 'child_process';

const GATEWAY_URL = process.env.GATEWAY_URL || 'https://ghostai-gateway-production.up.railway.app';
const DRY_RUN = process.argv.includes('--dry-run');

// ── Log Collectors ───────────────────────────────────────────────────────────

function collectRailwayLogs() {
    console.log(`[Self-Heal] 📡 Collecting Railway logs...`);
    try {
        const logs = execSync(
            'railway logs --service ghostai-gateway -n 100 2>&1',
            { cwd: process.env.HOME + '/Projects/Websites/Bots/packages/ghostai-gateway', timeout: 15000, encoding: 'utf-8' }
        );
        return logs;
    } catch (err) {
        console.warn(`[Self-Heal] Could not collect Railway logs: ${err.message}`);
        return '';
    }
}

function collectVercelStatus() {
    console.log(`[Self-Heal] 🔍 Checking Vercel deployments...`);
    try {
        const status = execSync(
            'vercel ls --prod 2>&1 | head -20',
            { cwd: process.env.HOME + '/Projects/Websites/Bots/ghostai-dashboard', timeout: 15000, encoding: 'utf-8' }
        );
        return status;
    } catch (err) {
        console.warn(`[Self-Heal] Could not check Vercel: ${err.message}`);
        return '';
    }
}

// ── Error Detection ──────────────────────────────────────────────────────────

const ERROR_PATTERNS = [
    { regex: /❌\s*(.+)/g, type: 'tool_failure' },
    { regex: /Error:\s*(.+)/g, type: 'runtime_error' },
    { regex: /authentication error/gi, type: 'auth_error' },
    { regex: /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/g, type: 'network_error' },
    { regex: /statusCode.*[45]\d{2}/g, type: 'http_error' },
    { regex: /Cannot find module/g, type: 'missing_module' },
    { regex: /Build (?:error|failed)/gi, type: 'build_failure' },
];

function detectErrors(logs) {
    const errors = [];
    const seen = new Set();

    for (const { regex, type } of ERROR_PATTERNS) {
        let match;
        // Reset regex state
        regex.lastIndex = 0;
        while ((match = regex.exec(logs)) !== null) {
            const errorText = match[0].trim();
            if (errorText.length > 10 && !seen.has(errorText)) {
                seen.add(errorText);
                errors.push({ type, text: errorText });
            }
        }
    }

    return errors;
}

// ── Fix Dispatch ─────────────────────────────────────────────────────────────

async function sendFixGoal(errorSummary) {
    const goal = `[SELF-HEAL] Automated maintenance run at ${new Date().toISOString()}.

The following errors were detected in recent Railway deploy logs:

${errorSummary}

Instructions:
1. For each error, determine if it's actionable (something you can fix with your tools).
2. If it's a code bug, use read_file to inspect the relevant source, then write_file to patch it.
3. If it's a missing env var or config issue, log what needs to be changed.
4. If it's a transient network error, skip it.
5. Report a summary of what you fixed and what needs manual attention.

Be surgical. Only touch files you understand. If unsure, report the issue instead of guessing.`;

    if (DRY_RUN) {
        console.log(`[Self-Heal] 🏃 DRY RUN — would send goal:\n${goal.slice(0, 200)}...`);
        return;
    }

    console.log(`[Self-Heal] 🚀 Sending fix goal to Ghost...`);

    try {
        const res = await fetch(`${GATEWAY_URL}/agent/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goal, fresh: true }),
        });
        const data = await res.json();
        console.log(`[Self-Heal] ✅ Gateway response: ${data.status}`);
    } catch (err) {
        console.error(`[Self-Heal] ❌ Failed to send goal: ${err.message}`);
    }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`\n🩺 Ghost Self-Heal — ${new Date().toLocaleString()}`);
    console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
    console.log(`   Gateway: ${GATEWAY_URL}\n`);

    // Step 1: Collect logs
    const railwayLogs = collectRailwayLogs();
    const vercelStatus = collectVercelStatus();
    const allLogs = railwayLogs + '\n' + vercelStatus;

    // Step 2: Detect errors
    const errors = detectErrors(allLogs);

    if (errors.length === 0) {
        console.log(`[Self-Heal] ✅ No errors detected. System is healthy.`);
        return;
    }

    console.log(`[Self-Heal] ⚠️ Found ${errors.length} error(s):`);
    errors.forEach((e, i) => console.log(`  ${i + 1}. [${e.type}] ${e.text.slice(0, 100)}`));

    // Step 3: Build summary and dispatch
    const summary = errors.map((e, i) => `${i + 1}. [${e.type}] ${e.text}`).join('\n');
    await sendFixGoal(summary);

    console.log(`\n[Self-Heal] Done.`);
}

main().catch(err => {
    console.error(`[Self-Heal] Fatal: ${err.message}`);
    process.exit(1);
});

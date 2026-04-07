#!/usr/bin/env node
/**
 * Daniel Sensual — Facebook Group Video Sharer
 *
 * Shares your latest video/reel to 30-40 groups daily for Meta monetization.
 *
 * Usage:
 *   node scripts/danielsensual-share.js --login
 *   node scripts/danielsensual-share.js --url=https://www.facebook.com/reel/123
 *   node scripts/danielsensual-share.js --url=https://www.facebook.com/reel/123 --batch=1
 *   node scripts/danielsensual-share.js --url=https://www.facebook.com/reel/123 --dry-run
 *   node scripts/danielsensual-share.js --url=https://www.facebook.com/reel/123 --max=5
 *   node scripts/danielsensual-share.js --status
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { saveSession, shareToAllGroups, acquireLock, resolveShareRuntime } from '../src/danielsensual-sharer.js';
import { getShareGroups, getGroupShareStatus, getGroupHealth, resetGroupFailures } from '../src/danielsensual-groups.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const DEFAULT_BOT_NAME = process.env.DS_SHARE_BOT_NAME || 'Daniel Sensual';
const DEFAULT_ENTRY_SCRIPT = process.env.DS_SHARE_ENTRY_SCRIPT || 'scripts/danielsensual-share.js';

function getFlag(name) {
    const prefix = `--${name}=`;
    const arg = args.find(v => v.startsWith(prefix));
    return arg ? arg.slice(prefix.length).trim() : '';
}

function normalizeIdentityMode(value) {
    return String(value || '').toLowerCase() === 'profile' ? 'profile' : 'page';
}

function getLoginCommand() {
    return process.env.DS_SHARE_LOGIN_COMMAND || `node ${DEFAULT_ENTRY_SCRIPT} --login`;
}

const flags = {
    login: args.includes('--login'),
    status: args.includes('--status'),
    health: args.includes('--health'),
    resetHealth: args.includes('--reset-health'),
    force: args.includes('--force'),
    prepare: args.includes('--prepare') || args.includes('--set-url-only'),
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    help: args.includes('--help') || args.includes('-h'),
    url: getFlag('url'),
    batch: parseInt(getFlag('batch') || '0', 10),
    max: parseInt(getFlag('max') || '0', 10),
    caption: getFlag('caption'),
    identity: normalizeIdentityMode(getFlag('identity') || process.env.DS_SHARE_IDENTITY_MODE),
};

process.env.DS_SHARE_IDENTITY_MODE = flags.identity;

// ─── URL State File ──────────────────────────────────────────────
// Persists the current video URL being shared, so batch runs don't
// need the URL repeated for each cron job.

function getUrlStateFile() {
    if (process.env.DS_SHARE_URL_STATE_FILE) {
        return process.env.DS_SHARE_URL_STATE_FILE;
    }

    return path.join(
        __dirname,
        '..',
        flags.identity === 'profile'
            ? '.danielsensual-personal-share-url.json'
            : '.danielsensual-share-url.json',
    );
}

function loadShareUrl() {
    try {
        const urlStateFile = getUrlStateFile();
        if (fs.existsSync(urlStateFile)) {
            const data = JSON.parse(fs.readFileSync(urlStateFile, 'utf-8'));
            // Only use if set today or recently
            const age = Date.now() - new Date(data.setAt).getTime();
            if (age < 48 * 60 * 60 * 1000) { // 48 hours
                return data;
            }
        }
    } catch { /* fresh */ }
    return null;
}

function saveShareUrl(url, caption = '') {
    const urlStateFile = getUrlStateFile();
    const data = {
        url,
        caption,
        setAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(urlStateFile), { recursive: true });
    fs.writeFileSync(urlStateFile, JSON.stringify(data, null, 2));
    return data;
}

// ─── Help ────────────────────────────────────────────────────────

function showHelp() {
    const runtime = resolveShareRuntime({
        identityMode: flags.identity,
        botLabel: DEFAULT_BOT_NAME,
        entryScript: DEFAULT_ENTRY_SCRIPT,
        loginCommand: getLoginCommand(),
    });

    console.log('');
    console.log(`🎬 ${DEFAULT_BOT_NAME} — Facebook Group Video Sharer`);
    console.log('═'.repeat(55));
    console.log(`🙋 Identity: ${flags.identity === 'profile' ? 'Personal profile' : 'Daniel Sensual page'}`);
    console.log(`🗂️  Browser profile: ${runtime.userDataDir}`);
    console.log('');
    console.log('Usage:');
    console.log('  --login                Open browser for one-time Facebook login');
    console.log('  --url=<FB_URL>         Set the video/reel URL to share');
    console.log('  --identity=page|profile Force posting identity (default from bot)');
    console.log('  --batch=1-7            Share to a specific batch of groups');
    console.log('  --max=N                Limit to N groups (overrides batch)');
    console.log('  --caption="text"       Optional caption to include');
    console.log('  --prepare              Save the URL/caption and exit without posting');
    console.log('  --dry-run              Navigate but don\'t actually post');
    console.log('  --status               Show group sharing status');
    console.log('  --help                 Show this help');
    console.log('');
    console.log('Examples:');
    console.log('  # One-time login:');
    console.log(`  ${getLoginCommand()}`);
    console.log('');
    console.log('  # Set video and share to first batch:');
    console.log(`  node ${DEFAULT_ENTRY_SCRIPT} --url=https://fb.com/reel/123 --batch=1`);
    console.log('');
    console.log('  # Save a URL for later scheduled runs:');
    console.log(`  node ${DEFAULT_ENTRY_SCRIPT} --url=https://fb.com/reel/123 --prepare`);
    console.log('');
    console.log('  # Subsequent batches use saved URL:');
    console.log(`  node ${DEFAULT_ENTRY_SCRIPT} --batch=2`);
    console.log(`  node ${DEFAULT_ENTRY_SCRIPT} --batch=3`);
    console.log('');
    console.log('  # Quick test (2 groups, dry run):');
    console.log(`  node ${DEFAULT_ENTRY_SCRIPT} --url=https://fb.com/reel/123 --max=2 --dry-run`);
    console.log('');
}

// ─── Status ──────────────────────────────────────────────────────

function showStatus() {
    const runtime = resolveShareRuntime({
        identityMode: flags.identity,
        botLabel: DEFAULT_BOT_NAME,
        entryScript: DEFAULT_ENTRY_SCRIPT,
        loginCommand: getLoginCommand(),
    });
    const groups = getShareGroups();
    const status = getGroupShareStatus();
    const saved = loadShareUrl();

    console.log('');
    console.log(`🎬 ${DEFAULT_BOT_NAME} — Group Share Status`);
    console.log('═'.repeat(55));
    console.log(`🙋 Identity: ${flags.identity === 'profile' ? 'Personal profile' : 'Daniel Sensual page'}`);
    console.log(`🗂️  Browser profile: ${runtime.userDataDir}`);

    if (saved) {
        console.log(`📹 Current video: ${saved.url}`);
        console.log(`   Set at: ${new Date(saved.setAt).toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
        if (saved.caption) console.log(`   Caption: "${saved.caption}"`);
    } else {
        console.log('📹 No video URL set');
    }

    console.log('');
    console.log(`📋 ${groups.length} groups total:`);
    console.log('');

    const batchNums = [...new Set(groups.map(g => g.batch || 1))].sort((a,b) => a-b);
    for (const b of batchNums) {
        const batch = groups.filter(g => (g.batch || 1) === b);

        console.log(`  Batch ${b} (${batch.length} groups):`);
        for (const g of batch) {
            const s = status.find(gs => gs.name === g.name);
            const lastShare = s?.lastShared
                ? new Date(s.lastShared).toLocaleString('en-US', { timeZone: 'America/New_York' })
                : 'never';
            const cooldown = s?.onCooldown ? ' 🔄' : ' ✅';
            console.log(`    ${cooldown} ${g.name} — last: ${lastShare}`);
        }
        console.log('');
    }
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
    if (flags.help) {
        showHelp();
        return;
    }

    if (flags.login) {
        await saveSession();
        return;
    }

    if (flags.status) {
        showStatus();
        return;
    }

    // Health check
    if (flags.health) {
        const health = getGroupHealth();
        console.log('\n🏥 Group Health Status');
        console.log('═'.repeat(55));
        const unhealthy = health.filter(g => g.consecutiveFailures > 0 || g.autoDisabled);
        if (unhealthy.length === 0) {
            console.log('\n  All groups healthy ✅\n');
        } else {
            for (const g of unhealthy) {
                const status = g.autoDisabled ? '🚫 DISABLED' : `⚠️  ${g.consecutiveFailures} fails`;
                console.log(`  ${status} | ${g.name}`);
                if (g.lastError) console.log(`           ${g.lastError.substring(0, 70)}`);
            }
            console.log(`\n  ${unhealthy.filter(g => g.autoDisabled).length} auto-disabled, ${unhealthy.length} total unhealthy`);
            console.log('  Use --reset-health to clear all failures\n');
        }
        return;
    }

    if (flags.resetHealth) {
        resetGroupFailures();
        console.log('✅ All group health counters reset.\n');
        return;
    }

    // Acquire lock to prevent concurrent instances
    if (!flags.login && !flags.status && !flags.health) {
        if (!acquireLock(flags.force)) {
            process.exit(0);
        }
    }

    // Resolve the video URL
    let postUrl = flags.url;
    let caption = flags.caption;

    if (postUrl) {
        // Save the new URL for batch runs
        saveShareUrl(postUrl, caption);
        console.log(`📹 Saved video URL for batch runs`);
        if (flags.prepare) {
            console.log('✅ Prepare complete — no shares sent.');
            process.exit(0);
        }
    } else {
        // Try to load a previously saved URL
        const saved = loadShareUrl();
        if (saved) {
            postUrl = saved.url;
            caption = caption || saved.caption;
            console.log(`📹 Using saved video URL: ${postUrl}`);
        } else {
            console.error('❌ No video URL provided. Use --url=<FACEBOOK_POST_URL>');
            console.error(`   Seed one with: node ${DEFAULT_ENTRY_SCRIPT} --url=<FACEBOOK_POST_URL> --prepare`);
            console.error('   Run with --help for usage.');
            process.exit(flags.batch > 0 ? 0 : 1);
        }
    }

    // Get groups
    const allGroups = getShareGroups();

    if (allGroups.length === 0) {
        console.error('❌ No share groups configured (all may be on cooldown or auto-disabled)');
        console.error('   Run with --health to see group status, --reset-health to re-enable.');
        process.exit(1);
    }

    // Determine target groups
    let targetGroups = allGroups;

    // Filter by batch property on each group
    if (flags.batch > 0) {
        targetGroups = allGroups.filter(g => (g.batch || 1) === flags.batch);
        if (targetGroups.length === 0) {
            console.log(`⚠️ No groups found for batch ${flags.batch}`);
            process.exit(0);
        }
    }

    if (flags.max > 0) {
        targetGroups = targetGroups.slice(0, flags.max);
    }

    // Run the sharer — groups are already filtered, no batch slicing needed
    const result = await shareToAllGroups({
        postUrl,
        groups: targetGroups,
        caption,
        batch: 0,
        batchSize: targetGroups.length,
        dryRun: flags.dryRun,
        headless: true,
        identityMode: flags.identity,
        botLabel: DEFAULT_BOT_NAME,
        entryScript: DEFAULT_ENTRY_SCRIPT,
        loginCommand: getLoginCommand(),
    });

    process.exit(result.success ? 0 : 1);
}

main().catch(err => {
    console.error(`\n❌ Fatal: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
});

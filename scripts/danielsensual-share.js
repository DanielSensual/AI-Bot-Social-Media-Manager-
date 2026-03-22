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
import { saveSession, shareToAllGroups } from '../src/danielsensual-sharer.js';
import { getShareGroups, getGroupShareStatus, recordGroupShare } from '../src/danielsensual-groups.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

function getFlag(name) {
    const prefix = `--${name}=`;
    const arg = args.find(v => v.startsWith(prefix));
    return arg ? arg.slice(prefix.length).trim() : '';
}

const flags = {
    login: args.includes('--login'),
    status: args.includes('--status'),
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    help: args.includes('--help') || args.includes('-h'),
    url: getFlag('url'),
    batch: parseInt(getFlag('batch') || '0', 10),
    max: parseInt(getFlag('max') || '0', 10),
    caption: getFlag('caption'),
};

// ─── URL State File ──────────────────────────────────────────────
// Persists the current video URL being shared, so batch runs don't
// need the URL repeated for each cron job.

const URL_STATE_FILE = path.join(__dirname, '..', '.danielsensual-share-url.json');

function loadShareUrl() {
    try {
        if (fs.existsSync(URL_STATE_FILE)) {
            const data = JSON.parse(fs.readFileSync(URL_STATE_FILE, 'utf-8'));
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
    const data = {
        url,
        caption,
        setAt: new Date().toISOString(),
    };
    fs.writeFileSync(URL_STATE_FILE, JSON.stringify(data, null, 2));
    return data;
}

// ─── Help ────────────────────────────────────────────────────────

function showHelp() {
    console.log('');
    console.log('🎬 Daniel Sensual — Facebook Group Video Sharer');
    console.log('═'.repeat(55));
    console.log('');
    console.log('Usage:');
    console.log('  --login                Open browser for one-time Facebook login');
    console.log('  --url=<FB_URL>         Set the video/reel URL to share');
    console.log('  --batch=1|2|3          Share to a specific batch of groups');
    console.log('  --max=N                Limit to N groups (overrides batch)');
    console.log('  --caption="text"       Optional caption to include');
    console.log('  --dry-run              Navigate but don\'t actually post');
    console.log('  --status               Show group sharing status');
    console.log('  --help                 Show this help');
    console.log('');
    console.log('Examples:');
    console.log('  # One-time login:');
    console.log('  node scripts/danielsensual-share.js --login');
    console.log('');
    console.log('  # Set video and share to first batch:');
    console.log('  node scripts/danielsensual-share.js --url=https://fb.com/reel/123 --batch=1');
    console.log('');
    console.log('  # Subsequent batches use saved URL:');
    console.log('  node scripts/danielsensual-share.js --batch=2');
    console.log('  node scripts/danielsensual-share.js --batch=3');
    console.log('');
    console.log('  # Quick test (2 groups, dry run):');
    console.log('  node scripts/danielsensual-share.js --url=https://fb.com/reel/123 --max=2 --dry-run');
    console.log('');
}

// ─── Status ──────────────────────────────────────────────────────

function showStatus() {
    const groups = getShareGroups();
    const status = getGroupShareStatus();
    const saved = loadShareUrl();

    console.log('');
    console.log('🎬 Daniel Sensual — Group Share Status');
    console.log('═'.repeat(55));

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

    const batchSize = 14;
    for (let b = 1; b <= 3; b++) {
        const start = (b - 1) * batchSize;
        const end = Math.min(start + batchSize, groups.length);
        const batch = groups.slice(start, end);

        console.log(`  Batch ${b} (${batch.length} groups):`);
        for (const g of batch) {
            const s = status.find(gs => gs.name === g.name);
            const lastShare = s?.lastShared
                ? new Date(s.lastShared).toLocaleString('en-US', { timeZone: 'America/New_York' })
                : 'never';
            const cooldown = s?.onCooldown ? ' 🔄' : ' ✅';
            console.log(`    ${cooldown} ${g.name} (${(g.members || '?').toLocaleString()} members) — last: ${lastShare}`);
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

    // Resolve the video URL
    let postUrl = flags.url;
    let caption = flags.caption;

    if (postUrl) {
        // Save the new URL for batch runs
        saveShareUrl(postUrl, caption);
        console.log(`📹 Saved video URL for batch runs`);
    } else {
        // Try to load a previously saved URL
        const saved = loadShareUrl();
        if (saved) {
            postUrl = saved.url;
            caption = caption || saved.caption;
            console.log(`📹 Using saved video URL: ${postUrl}`);
        } else {
            console.error('❌ No video URL provided. Use --url=<FACEBOOK_POST_URL>');
            console.error('   Run with --help for usage.');
            process.exit(1);
        }
    }

    // Get groups
    const allGroups = getShareGroups();

    if (allGroups.length === 0) {
        console.error('❌ No share groups configured');
        process.exit(1);
    }

    // Determine target groups
    let targetGroups = allGroups;

    if (flags.max > 0) {
        targetGroups = allGroups.slice(0, flags.max);
    }

    // Run the sharer
    const result = await shareToAllGroups({
        postUrl,
        groups: targetGroups,
        caption,
        batch: flags.batch,
        batchSize: 14,
        dryRun: flags.dryRun,
        headless: true,
    });

    // Record successful shares in group state
    if (!flags.dryRun && result.posted > 0) {
        console.log(`\n📝 Recording ${result.posted} shares in group state...`);
    }

    process.exit(result.success ? 0 : 1);
}

main().catch(err => {
    console.error(`\n❌ Fatal: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
});

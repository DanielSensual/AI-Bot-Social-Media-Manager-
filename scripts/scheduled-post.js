#!/usr/bin/env node
/**
 * Scheduled Post Runner
 * 
 * Posts a local video file to IG Reels + Facebook at a scheduled time.
 * Uses Node.js setTimeout for scheduling (no cron dependency).
 * 
 * Usage:
 *   node scripts/scheduled-post.js \
 *     --video ~/Downloads/Cursor-xAI-Ghost-AvatarV.mp4 \
 *     --caption "Your caption" \
 *     --time "2026-04-22T20:00:00" \
 *     --accounts ghostai
 * 
 *   node scripts/scheduled-post.js --video path --time 20:00 --accounts ghostai
 * 
 * Time formats:
 *   "20:00"                → Today at 8:00 PM local time
 *   "2026-04-22T20:00:00"  → Specific date/time
 *   "now"                  → Post immediately
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getFlag(name, def = null) {
    const i = args.indexOf(`--${name}`);
    if (i === -1) return def;
    return (i + 1 < args.length && !args[i + 1].startsWith('--')) ? args[i + 1] : true;
}

const VIDEO_PATH = getFlag('video');
const CAPTION = getFlag('caption', '');
const TIME_STR = getFlag('time', 'now');
const ACCOUNTS = (getFlag('accounts', 'ghostai')).split(',').map(a => a.trim());
const NO_FB = args.includes('--no-fb');

if (!VIDEO_PATH || args.includes('--help')) {
    console.log(`
📅 Scheduled Post Runner
═════════════════════════════════════

Usage:
  node scripts/scheduled-post.js --video <path> --time <time> --caption "text"

Options:
  --video     Path to local video file (required)
  --caption   IG/FB caption text
  --time      Schedule time: "20:00" (today), "2026-04-22T20:00:00", or "now"
  --accounts  Comma-separated: ghostai, danielsensual (default: ghostai)
  --no-fb     Skip Facebook posting
  --help      Show this help
`);
    process.exit(VIDEO_PATH ? 0 : 1);
}

// ─── Account Registry ─────────────────────────────────────────────────────────

const IG_API_BASE = 'https://graph.facebook.com/v24.0';

const ACCOUNT_REGISTRY = {
    ghostai: {
        name: 'Ghost AI Systems',
        igUserId: process.env.INSTAGRAM_GRAPH_USER_ID || '17841474941272373',
        igToken: process.env.INSTAGRAM_GRAPH_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
        fbPageId: '753873537816019',
    },
    danielsensual: {
        name: 'Daniel Sensual',
        igUserId: '17841401422877096',
        igToken: process.env.DANIEL_FACEBOOK_PAGE_ACCESS_TOKEN,
        fbPageId: '2097158930569621',
    },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

function log(msg) {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    console.log(`[${ts}] ${msg}`);
}

function parseScheduleTime(str) {
    if (str === 'now') return new Date();

    // "20:00" format — today at that time
    if (/^\d{1,2}:\d{2}$/.test(str)) {
        const [h, m] = str.split(':').map(Number);
        const d = new Date();
        d.setHours(h, m, 0, 0);
        if (d < new Date()) d.setDate(d.getDate() + 1); // If time passed, schedule tomorrow
        return d;
    }

    // Full ISO or parseable date string
    const d = new Date(str);
    if (isNaN(d.getTime())) throw new Error(`Invalid time: "${str}"`);
    return d;
}

// ─── Upload to Temp Host ──────────────────────────────────────────────────────

async function uploadToTempHost(filePath) {
    log('📤 Uploading to temp host...');
    const { uploadToTempHost: upload } = await import('../src/instagram-client.js');
    const url = await upload(filePath);
    log(`   ✅ Public URL: ${url}`);
    return url;
}

// ─── Post Reel ────────────────────────────────────────────────────────────────

async function postReel(account, caption, videoUrl) {
    const { igUserId, igToken, name } = account;
    if (!igToken) { log(`   ⚠️ ${name}: No token — skipping`); return null; }

    log(`📸 Posting Reel to ${name}...`);

    // Create container
    const createRes = await fetch(`${IG_API_BASE}/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            video_url: videoUrl,
            caption,
            media_type: 'REELS',
            access_token: igToken,
        }),
    });
    const createData = await createRes.json();
    if (createData.error) throw new Error(`IG container: ${createData.error.message}`);
    const containerId = createData.id;

    // Poll for processing
    for (let i = 0; i < 60; i++) {
        await sleep(5000);
        const r = await fetch(`${IG_API_BASE}/${containerId}?fields=status_code&access_token=${igToken}`);
        const d = await r.json();
        if (d.status_code === 'FINISHED') break;
        if (d.status_code === 'ERROR') throw new Error('IG processing error');
        if (i % 4 === 0) log(`   ⏳ ${d.status_code} (${(i + 1) * 5}s)`);
    }

    // Publish
    const pubRes = await fetch(`${IG_API_BASE}/${igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: containerId, access_token: igToken }),
    });
    const pubData = await pubRes.json();
    if (pubData.error) throw new Error(`IG publish: ${pubData.error.message}`);
    log(`   ✅ ${name} Reel posted! ID: ${pubData.id}`);
    return pubData.id;
}

// ─── Post to Facebook ─────────────────────────────────────────────────────────

async function postFacebook(account, caption, videoUrl) {
    if (NO_FB || !account.fbPageId) return null;
    log(`📘 Posting to Facebook: ${account.name}...`);

    const userToken = process.env.FACEBOOK_ACCESS_TOKEN;
    const pagesRes = await fetch(`${IG_API_BASE}/me/accounts?fields=id,access_token&access_token=${userToken}`);
    const pagesData = await pagesRes.json();
    const page = pagesData.data?.find(p => p.id === account.fbPageId);
    if (!page) { log('   ⚠️ FB page not found'); return null; }

    const res = await fetch(`${IG_API_BASE}/${account.fbPageId}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            file_url: videoUrl,
            description: caption,
            access_token: page.access_token,
        }),
    });
    const data = await res.json();
    if (data.error) { log(`   ⚠️ FB: ${data.error.message}`); return null; }
    log(`   ✅ Facebook posted! ID: ${data.id}`);
    return data.id;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    // Validate video
    const absPath = path.resolve(VIDEO_PATH.replace('~', process.env.HOME));
    if (!fs.existsSync(absPath)) {
        console.error(`❌ Video not found: ${absPath}`);
        process.exit(1);
    }

    const scheduleTime = parseScheduleTime(TIME_STR);
    const msUntil = scheduleTime.getTime() - Date.now();

    console.log('');
    console.log('📅 Scheduled Post');
    console.log('═'.repeat(50));
    log(`Video: ${path.basename(absPath)}`);
    log(`Accounts: ${ACCOUNTS.join(', ')}`);
    log(`Scheduled: ${scheduleTime.toLocaleString('en-US', { timeZone: 'America/New_York' })} EST`);

    if (msUntil > 0) {
        const mins = Math.round(msUntil / 60000);
        const hrs = Math.floor(mins / 60);
        const remMins = mins % 60;
        log(`⏳ Waiting ${hrs}h ${remMins}m until post time...`);
        log('   (Keep this terminal open — process will fire at scheduled time)');
        console.log('');

        await sleep(msUntil);
    }

    log('🚀 GO TIME — posting now!');

    // Upload
    const publicUrl = await uploadToTempHost(absPath);

    // Post to each account
    for (const key of ACCOUNTS) {
        const account = ACCOUNT_REGISTRY[key];
        if (!account) { log(`⚠️ Unknown account: ${key}`); continue; }

        try {
            const reelId = await postReel(account, CAPTION, publicUrl);
            await postFacebook(account, CAPTION, publicUrl);

            // Register in clip scheduler's posted log to prevent slot overlap
            const clipLogPath = path.resolve(__dirname, '..', 'media', 'clips', '.posted-clips.json');
            try {
                const clipLog = fs.existsSync(clipLogPath)
                    ? JSON.parse(fs.readFileSync(clipLogPath, 'utf-8'))
                    : [];
                clipLog.push({
                    file: `[scheduled] ${path.basename(absPath)}`,
                    platform: 'instagram',
                    postId: reelId || 'scheduled-post',
                    postedAt: new Date().toISOString(),
                });
                fs.writeFileSync(clipLogPath, JSON.stringify(clipLog, null, 2));
                log('   📋 Registered in clip scheduler log (overlap prevention)');
            } catch (logErr) {
                log(`   ⚠️ Could not update clip log: ${logErr.message}`);
            }
        } catch (err) {
            log(`❌ ${account.name}: ${err.message}`);
        }
    }

    log('✅ Scheduled post complete!');
}

main().catch(err => {
    console.error(`💥 FATAL: ${err.message}`);
    process.exit(1);
});

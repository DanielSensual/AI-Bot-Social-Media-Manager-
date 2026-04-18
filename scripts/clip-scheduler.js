#!/usr/bin/env node
/**
 * Ghost AI — Founder Clip Scheduler (Hardened)
 * 
 * Posts 3 founder clips per day across Facebook & Instagram.
 * Pulls from output/clips/ queue, marks as posted, and never repeats.
 * 
 * Robustness features:
 *   - Async file reads (no event loop blocking)
 *   - Catch-up mechanism for missed posts
 *   - Watchdog interval as backup to cron
 *   - Per-post error isolation
 *   - Automatic retry with exponential backoff
 * 
 * Schedule: 3 posts per day (EST)
 *   09:00 — Morning drop (peak engagement)
 *   13:00 — Lunch break drop
 *   19:00 — Evening prime time
 * 
 * Usage:
 *   node scripts/clip-scheduler.js                 # Start the scheduler
 *   node scripts/clip-scheduler.js --post-now      # Post the next clip immediately
 *   node scripts/clip-scheduler.js --status        # Show queue status
 *   node scripts/clip-scheduler.js --dry-run       # Preview next post without posting
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cron from 'node-cron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
dotenv.config();

const CLIPS_DIR = path.join(__dirname, '..', 'output', 'clips');
const POSTED_LOG = path.join(CLIPS_DIR, '.posted-clips.json');
const TZ = 'America/New_York';

const GRAPH_API = 'https://graph.facebook.com/v21.0';
const PAGE_ID = process.env.GHOST_AI_PAGE_ID || process.env.FACEBOOK_PAGE_ID;
const PAGE_TOKEN = process.env.GHOST_AI_PAGE_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_PAGE_TOKEN;
const IG_ACCOUNT_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

// Scheduled hours in EST — used by both cron and the watchdog catch-up
const SCHEDULE_HOURS = [9, 13, 19];
const SCHEDULE_LABELS = { 9: '☀️ Morning', 13: '🌤️ Lunch', 19: '🌙 Evening' };

// Prevent concurrent postNextClip calls
let postingLock = false;

// ─── Helpers ────────────────────────────────────────────────────

function nowEST() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

function todayDateString() {
    const d = nowEST();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Queue Management ───────────────────────────────────────────

function getPostedLog() {
    if (!fs.existsSync(POSTED_LOG)) return [];
    try { return JSON.parse(fs.readFileSync(POSTED_LOG, 'utf-8')); }
    catch { return []; }
}

function markPosted(clipFile, platform, postId) {
    const log = getPostedLog();
    log.push({
        file: clipFile,
        platform,
        postId,
        postedAt: new Date().toISOString(),
    });
    fs.writeFileSync(POSTED_LOG, JSON.stringify(log, null, 2));
}

/**
 * Returns how many posts have been made today (any platform).
 */
function todayPostCount() {
    const today = todayDateString();
    return getPostedLog().filter(p => p.postedAt?.startsWith(today)).length;
}

/**
 * Returns which schedule hours have already been fulfilled today.
 * Uses the post timestamps to determine which slots were covered.
 */
function getCompletedSlots() {
    const today = todayDateString();
    const todayPosts = getPostedLog()
        .filter(p => p.postedAt?.startsWith(today))
        .map(p => new Date(p.postedAt));

    // Sort by time and assign to slots in order
    todayPosts.sort((a, b) => a - b);
    const completed = new Set();
    const slotsCopy = [...SCHEDULE_HOURS].sort((a, b) => a - b);

    for (let i = 0; i < Math.min(todayPosts.length, slotsCopy.length); i++) {
        completed.add(slotsCopy[i]);
    }

    return completed;
}

function getUnpostedClips() {
    const posted = new Set(getPostedLog().map(p => p.file));

    // Read all clip metadata files
    const metaFiles = fs.readdirSync(CLIPS_DIR)
        .filter(f => f.endsWith('_clips.json') && !f.startsWith('.'));

    const founderClips = [];
    const youtubeClips = [];

    for (const metaFile of metaFiles) {
        const meta = JSON.parse(fs.readFileSync(path.join(CLIPS_DIR, metaFile), 'utf-8'));
        for (const clip of meta.clips) {
            const fileName = path.basename(clip.filePath || clip.fileName);
            if (!posted.has(fileName) && fs.existsSync(path.join(CLIPS_DIR, fileName))) {
                const entry = {
                    fileName,
                    filePath: path.join(CLIPS_DIR, fileName),
                    title: clip.title,
                    caption: clip.caption,
                    hook: clip.hook,
                    source: meta.source,
                    isFounder: fileName.startsWith('founder_'),
                };
                if (entry.isFounder) {
                    founderClips.push(entry);
                } else {
                    youtubeClips.push(entry);
                }
            }
        }
    }

    // ── Interleave: founder → youtube → founder → youtube ──
    // Spreads hero founder content across days instead of burning through all at once
    const queue = [];
    const maxLen = Math.max(founderClips.length, youtubeClips.length);

    for (let i = 0; i < maxLen; i++) {
        if (i < founderClips.length) queue.push(founderClips[i]);
        if (i < youtubeClips.length) queue.push(youtubeClips[i]);
    }

    return queue;
}

// ─── Facebook Video Post (Async — non-blocking) ────────────────

async function postToFacebook(clip, dryRun = false) {
    if (!PAGE_ID || !PAGE_TOKEN) {
        console.log('   ⚠️ Facebook credentials not configured, skipping');
        return null;
    }

    const caption = clip.caption || `${clip.title}\n\n🎯 Curated by Ghost AI Systems\n#AI #Tech #GhostAI #Founders`;

    if (dryRun) {
        console.log(`   🔍 [DRY RUN] Would post to Facebook:`);
        console.log(`      Video: ${clip.fileName}`);
        console.log(`      Caption: ${caption.substring(0, 100)}...`);
        return 'dry-run';
    }

    console.log(`   📘 Posting to Facebook...`);

    // ⚡ ASYNC file read — this was the blocking IO culprit
    const videoData = await fsPromises.readFile(clip.filePath);

    const formData = new FormData();
    formData.append('source', new Blob([videoData]), clip.fileName);
    formData.append('description', caption);
    formData.append('access_token', PAGE_TOKEN);

    try {
        const res = await fetch(`${GRAPH_API}/${PAGE_ID}/videos`, {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(180000), // 3 min timeout for large videos
        });
        const data = await res.json();

        if (data.id) {
            console.log(`   ✅ Facebook posted! ID: ${data.id}`);
            return data.id;
        } else {
            console.error(`   ❌ Facebook error:`, data.error?.message || JSON.stringify(data));
            return null;
        }
    } catch (err) {
        console.error(`   ❌ Facebook upload failed: ${err.message}`);
        return null;
    }
}

// ─── Post Next Clip (with retry) ────────────────────────────────

async function postNextClip(dryRun = false, retries = 2) {
    // Prevent concurrent posts
    if (postingLock) {
        console.log('   ⏳ Another post is in progress, skipping...');
        return null;
    }

    postingLock = true;
    try {
        return await _postNextClipInner(dryRun, retries);
    } finally {
        postingLock = false;
    }
}

async function _postNextClipInner(dryRun, retries) {
    const queue = getUnpostedClips();

    if (queue.length === 0) {
        console.log('📭 No unposted clips in queue. Run the clipper to add more:');
        console.log('   node scripts/yt-clipper.js "https://youtube.com/watch?v=..."');
        return null;
    }

    const clip = queue[0];
    const sizeMB = (fs.statSync(clip.filePath).size / (1024 * 1024)).toFixed(1);

    console.log('');
    console.log(`🎬 Next clip: ${clip.title}`);
    console.log(`   File: ${clip.fileName} (${sizeMB} MB)`);
    console.log(`   Source: "${clip.source.title}" by ${clip.source.channel}`);
    console.log(`   Queue: ${queue.length} clips remaining`);
    console.log('');

    // Post to Facebook with retry
    let fbId = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt > 0) {
            const delayMs = 5000 * Math.pow(2, attempt - 1); // 5s, 10s
            console.log(`   🔄 Retry ${attempt}/${retries} in ${delayMs / 1000}s...`);
            await sleep(delayMs);
        }

        fbId = await postToFacebook(clip, dryRun);
        if (fbId || dryRun) break;
    }

    if (fbId && !dryRun) {
        markPosted(clip.fileName, 'facebook', fbId);
    }

    return { clip, fbId };
}

// ─── Catch-Up Engine ────────────────────────────────────────────

/**
 * Checks if any scheduled slots were missed today and fires them.
 * This is the key robustness feature — if cron ticks were missed
 * due to blocking IO, sleep, or CPU load, the watchdog catches up.
 */
async function catchUpMissedSlots() {
    const now = nowEST();
    const currentHour = now.getHours();
    const completedSlots = getCompletedSlots();

    // Find slots that should have fired by now but haven't
    const missedSlots = SCHEDULE_HOURS.filter(h => h <= currentHour && !completedSlots.has(h));

    if (missedSlots.length === 0) return;

    console.log(`\n🔧 [CATCH-UP] Detected ${missedSlots.length} missed slot(s): ${missedSlots.map(h => `${h}:00`).join(', ')}`);

    for (const hour of missedSlots) {
        const label = SCHEDULE_LABELS[hour] || '📌';
        console.log(`\n[${new Date().toLocaleString('en-US', { timeZone: TZ })}] ${label} clip drop (catch-up for ${hour}:00)`);

        try {
            await postNextClip();
        } catch (err) {
            console.error(`❌ Catch-up post failed for ${hour}:00:`, err.message);
        }

        // Small delay between catch-up posts to avoid rate limits
        if (missedSlots.indexOf(hour) < missedSlots.length - 1) {
            await sleep(3000);
        }
    }
}

// ─── Status Report ──────────────────────────────────────────────

function showStatus() {
    const queue = getUnpostedClips();
    const posted = getPostedLog();
    const today = todayDateString();
    const todayCount = posted.filter(p => p.postedAt?.startsWith(today)).length;

    console.log('');
    console.log('📊 Ghost AI Clip Scheduler — Status');
    console.log('═'.repeat(50));
    console.log(`   ✅ Total posted: ${posted.length} clips`);
    console.log(`   📅 Posted today: ${todayCount}/3`);
    console.log(`   📋 Queued:       ${queue.length} clips`);
    console.log(`   ⏰ Schedule:     9:00 AM, 1:00 PM, 7:00 PM EST`);
    console.log(`   📅 Days left:    ~${Math.floor(queue.length / 3)} days of content`);
    console.log('');

    if (queue.length > 0) {
        console.log('   Next up:');
        for (const clip of queue.slice(0, 5)) {
            const sizeMB = (fs.statSync(clip.filePath).size / (1024 * 1024)).toFixed(1);
            console.log(`      🎬 ${clip.title} (${sizeMB} MB)`);
        }
    }

    if (posted.length > 0) {
        console.log('');
        console.log('   Recently posted:');
        for (const p of posted.slice(-5)) {
            console.log(`      ✅ ${p.file.substring(0, 55)} → ${p.platform} (${new Date(p.postedAt).toLocaleDateString()})`);
        }
    }

    // Show missed slots
    const completedSlots = getCompletedSlots();
    const now = nowEST();
    const currentHour = now.getHours();
    const missedSlots = SCHEDULE_HOURS.filter(h => h <= currentHour && !completedSlots.has(h));
    if (missedSlots.length > 0) {
        console.log('');
        console.log(`   ⚠️ Missed slots today: ${missedSlots.map(h => `${h}:00`).join(', ')}`);
    }

    console.log('');
}

// ─── Scheduler ──────────────────────────────────────────────────

async function startScheduler() {
    const queue = getUnpostedClips();

    console.log('');
    console.log('⏰ Ghost AI — Founder Clip Scheduler (Hardened)');
    console.log('═'.repeat(50));
    console.log(`   📋 ${queue.length} clips in queue`);
    console.log(`   📅 ~${Math.floor(queue.length / 3)} days of content`);
    console.log(`   ⏰ Posting 3x daily: 9AM, 1PM, 7PM EST`);
    console.log(`   🔧 Catch-up: enabled (checks every 30 min)`);
    console.log(`   🔄 Retry: 2 attempts with exponential backoff`);
    console.log('');

    if (queue.length === 0) {
        console.log('⚠️ No clips in queue. Clip some videos first:');
        console.log('   node scripts/yt-clipper.js "https://youtube.com/watch?v=..."');
        process.exit(1);
    }

    // ── Cron schedules (primary) ──

    // 9:00 AM EST — Morning drop
    cron.schedule('0 9 * * *', async () => {
        console.log(`\n[${new Date().toLocaleString('en-US', { timeZone: TZ })}] ☀️ Morning clip drop`);
        try { await postNextClip(); }
        catch (err) { console.error('❌ Morning post failed:', err.message); }
    }, { timezone: TZ });

    // 1:00 PM EST — Lunch drop
    cron.schedule('0 13 * * *', async () => {
        console.log(`\n[${new Date().toLocaleString('en-US', { timeZone: TZ })}] 🌤️ Lunch clip drop`);
        try { await postNextClip(); }
        catch (err) { console.error('❌ Lunch post failed:', err.message); }
    }, { timezone: TZ });

    // 7:00 PM EST — Evening prime time
    cron.schedule('0 19 * * *', async () => {
        console.log(`\n[${new Date().toLocaleString('en-US', { timeZone: TZ })}] 🌙 Evening clip drop`);
        try { await postNextClip(); }
        catch (err) { console.error('❌ Evening post failed:', err.message); }
    }, { timezone: TZ });

    // ── Watchdog: catch-up check every 30 minutes ──
    // This is the safety net — if cron missed a tick, the watchdog picks it up
    setInterval(async () => {
        try {
            await catchUpMissedSlots();
        } catch (err) {
            console.error('❌ Watchdog catch-up error:', err.message);
        }
    }, 30 * 60 * 1000); // 30 minutes

    // ── Heartbeat log every 6 hours ──
    setInterval(() => {
        const queue = getUnpostedClips();
        const todayCount = todayPostCount();
        console.log(`\n💓 [${new Date().toLocaleString('en-US', { timeZone: TZ })}] Heartbeat — ${todayCount}/3 posted today, ${queue.length} in queue`);
    }, 6 * 60 * 60 * 1000);

    console.log('🟢 Scheduler running. Ctrl+C to stop.');
    console.log('   Next post will fire at the next scheduled time.');
    console.log('');

    // ── Immediate catch-up on startup ──
    // If the process just restarted and we missed posts, fire them now
    await catchUpMissedSlots();
}

// ─── CLI ────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--status')) {
    showStatus();
} else if (args.includes('--post-now')) {
    postNextClip(false).catch(console.error);
} else if (args.includes('--dry-run')) {
    postNextClip(true).catch(console.error);
} else {
    startScheduler();
}

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

// ─── 15-Slot Daily Schedule (Content Army v2) ──────────────────
// Peak windows: 8-12AM, 5-9PM EST (2 posts/hr)
// Off-peak: 12-5PM (1 post/hr)
// IG API limit: 25/24hrs — 15 is safe with 30min+ gaps
const SCHEDULE_SLOTS = [
    // Peak Morning (2/hr)
    { hour: 8,  min: 0,  label: '🌅 Early Morning',    tier: 'peak' },
    { hour: 8,  min: 45, label: '🌅 Morning Ramp',     tier: 'peak' },
    { hour: 9,  min: 15, label: '☀️ Peak Morning',      tier: 'peak' },
    { hour: 10, min: 0,  label: '☀️ Mid-Morning',       tier: 'peak' },
    { hour: 10, min: 45, label: '☀️ Late Morning',      tier: 'peak' },
    { hour: 11, min: 30, label: '🌤️ Pre-Lunch',         tier: 'peak' },
    // Off-Peak (1/hr)
    { hour: 12, min: 15, label: '🍽️ Lunch',             tier: 'offpeak' },
    { hour: 13, min: 30, label: '☁️ Afternoon',          tier: 'offpeak' },
    { hour: 15, min: 0,  label: '☁️ Mid-Afternoon',      tier: 'offpeak' },
    // Peak Evening (2/hr)
    { hour: 17, min: 0,  label: '🔥 Evening Ramp',      tier: 'peak' },
    { hour: 17, min: 45, label: '🔥 Pre-Prime',         tier: 'peak' },
    { hour: 18, min: 30, label: '🌙 Prime Time',        tier: 'peak' },
    { hour: 19, min: 15, label: '🌙 Peak Evening',      tier: 'peak' },
    { hour: 20, min: 0,  label: '🌃 Late Prime',        tier: 'peak' },
    { hour: 21, min: 0,  label: '🌃 Night Cap',         tier: 'offpeak' },
];

// Legacy compat
const SCHEDULE_HOURS = SCHEDULE_SLOTS.map(s => s.hour);
const SCHEDULE_LABELS = Object.fromEntries(SCHEDULE_SLOTS.map(s => [s.hour, s.label]));

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

// ─── Facebook Video Post (via curl — reliable for large files) ──

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

    const { execSync } = await import('child_process');

    try {
        const url = `${GRAPH_API}/${PAGE_ID}/videos`;
        const result = execSync(`curl -s -X POST "${url}" \
            -F "source=@${clip.filePath}" \
            -F "description=${caption.replace(/"/g, '\\"').replace(/\n/g, '\\n')}" \
            -F "access_token=${PAGE_TOKEN}" \
            --max-time 300`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });

        const data = JSON.parse(result);

        if (data.id) {
            console.log(`   ✅ Facebook posted! ID: ${data.id}`);
            return data.id;
        } else {
            console.error(`   ❌ Facebook error:`, data.error?.message || JSON.stringify(data));
            return null;
        }
    } catch (err) {
        console.error(`   ❌ Facebook upload failed: ${err.message?.substring(0, 200)}`);
        return null;
    }
}

// ─── Instagram Reels Post (via Graph API) ───────────────────────

const IG_TOKEN = process.env.INSTAGRAM_GRAPH_TOKEN || PAGE_TOKEN;

async function postToInstagramReels(clip, dryRun = false) {
    if (!IG_ACCOUNT_ID || !IG_TOKEN) {
        console.log('   ⚠️ Instagram credentials not configured, skipping');
        return null;
    }

    const caption = clip.caption || `${clip.title}\n\n🎯 Curated by Ghost AI Systems\n#AI #Tech #GhostAI #Founders`;

    if (dryRun) {
        console.log(`   🔍 [DRY RUN] Would post to Instagram Reels:`);
        console.log(`      Video: ${clip.fileName}`);
        console.log(`      Caption: ${caption.substring(0, 100)}...`);
        return 'dry-run';
    }

    console.log(`   📸 Posting to Instagram Reels...`);

    try {
        // IG Reels requires a public URL — upload to FB first, then use the returned URL
        // Step 1: Upload video to get a hosted URL via the page
        const videoData = await fsPromises.readFile(clip.filePath);
        const sizeMB = (videoData.length / (1024 * 1024)).toFixed(1);
        console.log(`   📤 Uploading ${sizeMB} MB video for IG...`);

        // Upload to FB page videos to get a hosted URL
        const uploadForm = new FormData();
        uploadForm.append('source', new Blob([videoData]), clip.fileName);
        uploadForm.append('published', 'false');  // Don't publish on FB — just host
        uploadForm.append('access_token', PAGE_TOKEN);

        const uploadRes = await fetch(`${GRAPH_API}/${PAGE_ID}/videos`, {
            method: 'POST',
            body: uploadForm,
            signal: AbortSignal.timeout(300000),
        });
        const uploadText = await uploadRes.text();
        let uploadData;
        try { uploadData = JSON.parse(uploadText); } catch { 
            console.error(`   ❌ IG upload parse error for ${sizeMB}MB video`);
            return null;
        }

        if (!uploadData.id) {
            console.error(`   ❌ IG video upload failed:`, uploadData.error?.message);
            return null;
        }

        // Get the video source URL from the upload
        const videoInfoRes = await fetch(`${GRAPH_API}/${uploadData.id}?fields=source&access_token=${PAGE_TOKEN}`);
        const videoInfo = await videoInfoRes.json();
        const videoUrl = videoInfo.source;

        if (!videoUrl) {
            console.error(`   ❌ Could not get video URL from FB upload`);
            return null;
        }

        console.log(`   🔗 Got hosted video URL`);

        // Step 2: Create IG media container
        const containerRes = await fetch(`${GRAPH_API}/${IG_ACCOUNT_ID}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                media_type: 'REELS',
                video_url: videoUrl,
                caption: caption,
                share_to_feed: false, // disabled 2026-04-22 — was leaking Reels into stories
                access_token: IG_TOKEN,
            }),
        });
        const containerData = await containerRes.json();

        if (!containerData.id) {
            console.error(`   ❌ IG container error:`, containerData.error?.message || JSON.stringify(containerData));
            return null;
        }

        console.log(`   📦 IG container created: ${containerData.id}`);

        // Step 3: Wait for video processing (poll)
        let ready = false;
        for (let i = 0; i < 30; i++) {
            await sleep(10000); // 10s polling
            const statusRes = await fetch(`${GRAPH_API}/${containerData.id}?fields=status_code&access_token=${IG_TOKEN}`);
            const statusData = await statusRes.json();
            
            if (statusData.status_code === 'FINISHED') {
                ready = true;
                break;
            } else if (statusData.status_code === 'ERROR') {
                console.error(`   ❌ IG processing error`);
                return null;
            }
            
            process.stdout.write(`   ⏳ Processing... (${i * 10}s)\r`);
        }

        if (!ready) {
            console.error(`   ❌ IG processing timed out after 5 minutes`);
            return null;
        }

        // Step 4: Publish
        const publishRes = await fetch(`${GRAPH_API}/${IG_ACCOUNT_ID}/media_publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                creation_id: containerData.id,
                access_token: IG_TOKEN,
            }),
        });
        const publishData = await publishRes.json();

        if (publishData.id) {
            console.log(`   ✅ Instagram Reel posted! ID: ${publishData.id}`);
            return publishData.id;
        } else {
            console.error(`   ❌ IG publish error:`, publishData.error?.message);
            return null;
        }
    } catch (err) {
        console.error(`   ❌ Instagram upload failed: ${err.message}`);
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

    // Post to Instagram Reels
    let igId = null;
    igId = await postToInstagramReels(clip, dryRun);
    if (igId && !dryRun) {
        markPosted(clip.fileName, 'instagram', igId);
    }

    return { clip, fbId, igId };
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
    console.log(`   📅 Posted today: ${todayCount}/15`);
    console.log(`   📋 Queued:       ${queue.length} clips`);
    console.log(`   ⏰ Schedule:     15 slots/day (2/hr peak, 1/hr off-peak)`);
    console.log(`   📅 Days left:    ~${Math.floor(queue.length / 15)} days of pre-made content`);
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
    console.log(`   📅 ~${Math.floor(queue.length / 15)} days of pre-made content`);
    console.log(`   ⏰ Posting 15x daily — 2/hr peak, 1/hr off-peak`);
    console.log(`   🔧 Catch-up: enabled (checks every 15 min)`);
    console.log(`   🔄 Retry: 2 attempts with exponential backoff`);
    console.log(`   📸 Dual-post: FB + IG Reels on each clip`);
    console.log('');

    if (queue.length === 0) {
        console.log('⚠️ No clips in queue. Clip some videos first:');
        console.log('   node scripts/yt-clipper.js "https://youtube.com/watch?v=..."');
        process.exit(1);
    }

    // ── Cron schedules — dynamic from SCHEDULE_SLOTS ──

    for (const slot of SCHEDULE_SLOTS) {
        const cronExpr = `${slot.min} ${slot.hour} * * *`;
        cron.schedule(cronExpr, async () => {
            console.log(`\n[${new Date().toLocaleString('en-US', { timeZone: TZ })}] ${slot.label} clip drop (${slot.tier})`);
            try { await postNextClip(); }
            catch (err) { console.error(`❌ ${slot.label} post failed:`, err.message); }
        }, { timezone: TZ });
        console.log(`   🕒 ${String(slot.hour).padStart(2,'0')}:${String(slot.min).padStart(2,'0')} — ${slot.label} (${slot.tier})`);
    }

    // ── Watchdog: catch-up check every 15 minutes ──
    // Tighter interval for 15-slot schedule
    setInterval(async () => {
        try {
            await catchUpMissedSlots();
        } catch (err) {
            console.error('❌ Watchdog catch-up error:', err.message);
        }
    }, 15 * 60 * 1000); // 15 minutes

    // ── Heartbeat log every 6 hours ──
    setInterval(() => {
        const queue = getUnpostedClips();
        const todayCount = todayPostCount();
        console.log(`\n💓 [${new Date().toLocaleString('en-US', { timeZone: TZ })}] Heartbeat — ${todayCount}/15 posted today, ${queue.length} in queue`);
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

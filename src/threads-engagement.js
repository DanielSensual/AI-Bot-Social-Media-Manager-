/**
 * Threads Engagement Bot — DanielSensual
 * 
 * Aggressive, multi-mode engagement engine:
 * 
 * Mode 1: SELF-TROLL  — Reply to Daniel's own recent threads with hype/banter
 * Mode 2: PROACTIVE   — Post new threads (hot takes, self-promo, controversial)
 * Mode 3: ENGAGE      — Find other threads and drop replies for visibility
 * 
 * Dedup via .threads-engaged.json (same pattern as X bot).
 * Logs to logs/threads-engagement/.
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    getProfile,
    getMyThreads,
    publishText,
    replyToThread,
    hasThreadsCredentials,
} from './threads-client.js';
import {
    generateSelfReply,
    generateProactivePost,
    generateEngagementReply,
    getTodaysCategory,
} from './threads-content.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, '..', 'logs', 'threads-engagement');
const ENGAGED_FILE = path.join(__dirname, '..', '.threads-engaged.json');
const MAX_ENGAGED_RECORDS = 2000;
const DEDUPE_TTL_DAYS = 14;

fs.mkdirSync(LOGS_DIR, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Dedup ──────────────────────────────────────────────────────

function loadEngaged() {
    try {
        if (!fs.existsSync(ENGAGED_FILE)) return [];
        const raw = JSON.parse(fs.readFileSync(ENGAGED_FILE, 'utf-8'));
        const cutoff = Date.now() - DEDUPE_TTL_DAYS * 86400000;
        return raw.filter(r => new Date(r.engagedAt).getTime() > cutoff)
            .slice(-MAX_ENGAGED_RECORDS);
    } catch {
        return [];
    }
}

function saveEngaged(records) {
    const cutoff = Date.now() - DEDUPE_TTL_DAYS * 86400000;
    const pruned = records.filter(r => new Date(r.engagedAt).getTime() > cutoff)
        .slice(-MAX_ENGAGED_RECORDS);
    fs.writeFileSync(ENGAGED_FILE, JSON.stringify(pruned, null, 2));
}

// ─── Logging ────────────────────────────────────────────────────

function logAction(action, details) {
    const timestamp = new Date().toISOString();
    const dateStr = timestamp.split('T')[0];
    const logFile = path.join(LOGS_DIR, `${dateStr}.json`);

    let logs = [];
    if (fs.existsSync(logFile)) {
        try { logs = JSON.parse(fs.readFileSync(logFile, 'utf-8')); } catch { logs = []; }
    }

    logs.push({ timestamp, action, ...details });
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
}

// ─── Mode 1: Self-Troll ────────────────────────────────────────

async function runSelfTroll(options = {}) {
    const { dryRun = false, limit = 3 } = options;

    console.log('');
    console.log('🤡 Mode 1: Self-Troll');
    console.log('─'.repeat(40));

    let myThreads;
    try {
        myThreads = await getMyThreads(10);
    } catch (err) {
        console.error(`   ❌ Failed to fetch own threads: ${err.message}`);
        return 0;
    }

    const posts = myThreads?.data || [];
    if (posts.length === 0) {
        console.log('   ℹ️ No recent threads found — skipping self-troll');
        return 0;
    }

    const engagedRecords = loadEngaged();
    const engagedIds = new Set(engagedRecords.map(r => r.id));
    let count = 0;

    // Pick random posts to self-troll
    const targets = posts
        .filter(p => !p.is_reply && !engagedIds.has(`self-${p.id}`))
        .sort(() => Math.random() - 0.5)
        .slice(0, limit);

    for (const post of targets) {
        const threadText = post.text || '';
        console.log(`   📝 Thread: "${threadText.substring(0, 60)}..."`);

        const reply = await generateSelfReply(threadText);
        console.log(`   💬 Reply: "${reply.substring(0, 60)}..."`);

        if (dryRun) {
            console.log('   🔒 DRY RUN — skipped');
        } else {
            try {
                const result = await replyToThread(post.id, reply);
                console.log(`   ✅ Self-trolled! ID: ${result.id}`);
                logAction('self_troll', {
                    threadId: post.id,
                    reply,
                    resultId: result.id,
                });
                engagedRecords.push({ id: `self-${post.id}`, engagedAt: new Date().toISOString() });
                count++;
            } catch (err) {
                console.error(`   ❌ Reply failed: ${err.message}`);
            }
        }

        await sleep(5000); // Rate limit spacing
    }

    saveEngaged(engagedRecords);
    return count;
}

// ─── Mode 2: Proactive Posts ────────────────────────────────────

async function runProactivePosts(options = {}) {
    const { dryRun = false, count = 2, category = null } = options;

    console.log('');
    console.log('🚀 Mode 2: Proactive Posts');
    console.log('─'.repeat(40));

    let posted = 0;

    for (let i = 0; i < count; i++) {
        const cat = category || (i === 0 ? getTodaysCategory() : Object.keys({
            hot_take: 1, self_promo: 1, banter: 1, controversial: 1,
        })[Math.floor(Math.random() * 4)]);

        console.log(`   📌 Category: ${cat}`);

        const post = await generateProactivePost(cat);
        console.log(`   📝 "${post.text.substring(0, 60)}..." [${post.source}]`);

        if (dryRun) {
            console.log('   🔒 DRY RUN — skipped');
        } else {
            try {
                const result = await publishText(post.text);
                console.log(`   ✅ Posted! ID: ${result.id}`);
                logAction('proactive_post', {
                    text: post.text,
                    category: post.category,
                    source: post.source,
                    resultId: result.id,
                });
                posted++;
            } catch (err) {
                console.error(`   ❌ Post failed: ${err.message}`);
            }
        }

        if (i < count - 1) await sleep(8000); // Space out multiple posts
    }

    return posted;
}

// ─── Mode 3: Outbound Engagement ────────────────────────────────

async function runOutboundEngagement(options = {}) {
    const { dryRun = false, limit = 5 } = options;

    console.log('');
    console.log('🎯 Mode 3: Outbound Engagement');
    console.log('─'.repeat(40));

    // Note: Threads API doesn't have a search endpoint yet
    // So we engage with replies on our own threads (conversation threading)
    // and rely on proactive posts + self-trolling for visibility
    
    let myThreads;
    try {
        myThreads = await getMyThreads(15);
    } catch (err) {
        console.error(`   ❌ Failed to fetch threads: ${err.message}`);
        return 0;
    }

    const posts = myThreads?.data || [];
    const engagedRecords = loadEngaged();
    const engagedIds = new Set(engagedRecords.map(r => r.id));
    let count = 0;

    // Self-bump: add follow-up comments to own threads that have been up a while
    const bumpTargets = posts
        .filter(p => {
            if (p.is_reply) return false;
            if (engagedIds.has(`bump-${p.id}`)) return false;
            const age = Date.now() - new Date(p.timestamp).getTime();
            const ageHours = age / (1000 * 60 * 60);
            return ageHours > 2 && ageHours < 48; // bump 2-48hr old posts
        })
        .sort(() => Math.random() - 0.5)
        .slice(0, limit);

    for (const post of bumpTargets) {
        const threadText = post.text || '';
        console.log(`   🔄 Bumping: "${threadText.substring(0, 50)}..."`);

        const bumpReply = await generateSelfReply(threadText);
        console.log(`   💬 Bump: "${bumpReply.substring(0, 60)}..."`);

        if (dryRun) {
            console.log('   🔒 DRY RUN — skipped');
        } else {
            try {
                const result = await replyToThread(post.id, bumpReply);
                console.log(`   ✅ Bumped! ID: ${result.id}`);
                logAction('bump', {
                    threadId: post.id,
                    reply: bumpReply,
                    resultId: result.id,
                });
                engagedRecords.push({ id: `bump-${post.id}`, engagedAt: new Date().toISOString() });
                count++;
            } catch (err) {
                console.error(`   ❌ Bump failed: ${err.message}`);
            }
        }

        await sleep(5000);
    }

    saveEngaged(engagedRecords);
    return count;
}

// ─── Main Orchestrator ──────────────────────────────────────────

export async function runThreadsBot(options = {}) {
    const {
        dryRun = false,
        modes = ['self_troll', 'proactive', 'engage'],
        selfTrollLimit = 2,
        proactiveCount = 1,
        engageLimit = 3,
        proactiveCategory = null,
    } = options;

    console.log('');
    console.log('═'.repeat(50));
    console.log('🧵 DanielSensual Threads Bot');
    console.log('═'.repeat(50));
    console.log(`   Mode: ${dryRun ? '🔒 DRY RUN' : '🔴 LIVE'}`);
    console.log(`   Active modes: ${modes.join(', ')}`);
    console.log('');

    if (!hasThreadsCredentials()) {
        console.error('❌ Missing THREADS_ACCESS_TOKEN or THREADS_USER_ID');
        console.error('   Set these in your .env file');
        return { success: false, error: 'Missing credentials' };
    }

    // Verify auth
    try {
        const profile = await getProfile();
        console.log(`✅ Authenticated as @${profile.username || profile.id}`);
    } catch (err) {
        console.error(`❌ Auth failed: ${err.message}`);
        return { success: false, error: err.message };
    }

    const results = {
        selfTrolled: 0,
        posted: 0,
        engaged: 0,
    };

    if (modes.includes('self_troll')) {
        results.selfTrolled = await runSelfTroll({ dryRun, limit: selfTrollLimit });
    }

    if (modes.includes('proactive')) {
        results.posted = await runProactivePosts({
            dryRun,
            count: proactiveCount,
            category: proactiveCategory,
        });
    }

    if (modes.includes('engage')) {
        results.engaged = await runOutboundEngagement({ dryRun, limit: engageLimit });
    }

    console.log('');
    console.log('═'.repeat(50));
    console.log(`✅ Done!`);
    console.log(`   Self-trolled: ${results.selfTrolled}`);
    console.log(`   Posted: ${results.posted}`);
    console.log(`   Engaged: ${results.engaged}`);
    console.log('═'.repeat(50));

    return { success: true, ...results };
}

export default { runThreadsBot };

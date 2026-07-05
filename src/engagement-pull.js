/**
 * Engagement Pull — closes the feedback loop.
 * Fetches real public metrics for posted content and records them through
 * content-feedback so pillar weights, top-posts examples, and the brain's
 * RECENT POSTS context reflect actual performance instead of placeholders.
 *
 * Each post is recorded ONCE, after it has aged ≥ MIN_AGE_HOURS (engagement
 * mostly settles by then) — recordEngagement() is cumulative, so re-pulling
 * the same post would double-count.
 *
 * v1 covers X (batched, 1 API read per night). LinkedIn/IG need different
 * scopes — the engagement_log schema already carries a platform column.
 */

import { getDb } from './db.js';
import { getTweetsMetrics } from './twitter-client.js';
import { recordEngagement } from './content-feedback.js';

const MIN_AGE_HOURS = 20;
const MAX_AGE_DAYS = 14;

function ensureTable() {
    const db = getDb();
    db.prepare(`
        CREATE TABLE IF NOT EXISTS engagement_log (
            post_history_id INTEGER PRIMARY KEY,
            platform TEXT NOT NULL,
            external_id TEXT,
            likes INTEGER DEFAULT 0,
            comments INTEGER DEFAULT 0,
            shares INTEGER DEFAULT 0,
            impressions INTEGER DEFAULT 0,
            fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();
    return db;
}

function extractTweetId(resultX) {
    const match = String(resultX || '').match(/status\/(\d+)/);
    return match ? match[1] : null;
}

/**
 * Posts eligible for a metrics pull: posted to X, old enough for engagement
 * to settle, young enough to still matter, not yet recorded.
 */
export function getEligiblePosts() {
    const db = ensureTable();
    return db.prepare(`
        SELECT id, text, pillar, result_x, created_at
        FROM post_history
        WHERE result_x IS NOT NULL AND result_x != ''
          AND datetime(created_at) <= datetime('now', '-${MIN_AGE_HOURS} hours')
          AND datetime(created_at) >= datetime('now', '-${MAX_AGE_DAYS} days')
          AND id NOT IN (SELECT post_history_id FROM engagement_log)
        ORDER BY created_at ASC
        LIMIT 100
    `).all();
}

/**
 * Run one pull cycle. Safe to call daily; throws only on unexpected errors
 * (X circuit-breaker-open surfaces as a skipped run, not a crash).
 * @returns {Promise<{recorded: number, skipped: number}>}
 */
export async function runEngagementPull() {
    const db = ensureTable();
    const eligible = getEligiblePosts();

    if (eligible.length === 0) {
        console.log('📈 Engagement pull: nothing eligible (all recent posts already recorded)');
        return { recorded: 0, skipped: 0 };
    }

    const idToPost = new Map();
    for (const post of eligible) {
        const tweetId = extractTweetId(post.result_x);
        if (tweetId) idToPost.set(tweetId, post);
    }

    console.log(`📈 Engagement pull: fetching metrics for ${idToPost.size} tweets...`);

    let metrics;
    try {
        metrics = await getTweetsMetrics([...idToPost.keys()]);
    } catch (error) {
        console.warn(`⚠️ Engagement pull skipped: ${error.message}`);
        return { recorded: 0, skipped: idToPost.size };
    }

    const insert = db.prepare(`
        INSERT OR IGNORE INTO engagement_log
            (post_history_id, platform, external_id, likes, comments, shares, impressions)
        VALUES (?, 'x', ?, ?, ?, ?, ?)
    `);

    let recorded = 0;
    for (const [tweetId, post] of idToPost) {
        const m = metrics.get(tweetId);
        if (!m) continue; // deleted tweet or lookup miss — retry next run

        insert.run(post.id, tweetId, m.likes, m.comments, m.shares, m.impressions);
        recordEngagement(post.pillar || 'unknown', m, post.text || '', 'x');
        recorded++;
        console.log(`   ✓ [${post.pillar}] ${m.likes}❤ ${m.comments}💬 ${m.shares}🔁 ${m.impressions} views — "${String(post.text).split('\n')[0].slice(0, 50)}"`);
    }

    console.log(`📈 Engagement pull complete: ${recorded} recorded, ${idToPost.size - recorded} pending retry`);
    return { recorded, skipped: idToPost.size - recorded };
}

/**
 * Engagement for recent posts, keyed by post_history id — used by the
 * generation context so the model sees how its own posts performed.
 */
export function getEngagementByPostId() {
    const db = ensureTable();
    const rows = db.prepare('SELECT post_history_id, likes, comments, shares, impressions FROM engagement_log').all();
    const map = new Map();
    for (const r of rows) {
        map.set(r.post_history_id, { likes: r.likes, comments: r.comments, shares: r.shares, impressions: r.impressions });
    }
    return map;
}

export default { runEngagementPull, getEligiblePosts, getEngagementByPostId };

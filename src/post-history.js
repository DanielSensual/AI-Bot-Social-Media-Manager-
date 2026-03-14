/**
 * Post History — SQLite-backed persistent log
 * Replaces JSON flat file with proper DB queries.
 * Prevents duplicate posts and tracks cross-platform results.
 */

import { getDb, textHash } from './db.js';
import { config } from './config.js';
import { getTimeZoneDateKey, isTimestampOnDateInTimeZone } from './timezone.js';

const REPORT_TIMEZONE = config.schedule?.timezone || 'America/New_York';

/**
 * Check if text was recently posted (deduplication)
 * @param {string} text - Content to check
 * @returns {boolean} True if duplicate
 */
export function isDuplicate(text) {
    const db = getDb();
    const hash = textHash(text);
    const row = db.prepare('SELECT 1 FROM post_history WHERE text_hash = ? LIMIT 1').get(hash);
    return !!row;
}

/**
 * Record a successfully posted entry
 * @param {object} post - Post data to record
 */
export function record(post) {
    const db = getDb();
    db.prepare(`
        INSERT INTO post_history (text, text_hash, pillar, ai_generated, has_video, has_image,
            result_x, result_linkedin, result_facebook, result_instagram)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        post.text || '',
        textHash(post.text || ''),
        post.pillar || null,
        post.aiGenerated ? 1 : 0,
        post.hasVideo ? 1 : 0,
        post.hasImage ? 1 : 0,
        post.results?.x || null,
        post.results?.linkedin || null,
        post.results?.facebook || null,
        post.results?.instagram || null,
    );

    // Fire-and-forget sync to dashboard (non-blocking)
    syncToDashboard().catch(() => { });
}

/**
 * Get recent post history
 * @param {number} n - Number of recent posts to return
 * @returns {Array} Recent post entries (mapped to original format)
 */
export function getRecent(n = 10) {
    const db = getDb();
    const rows = db.prepare(
        'SELECT * FROM post_history ORDER BY datetime(created_at) DESC LIMIT ?'
    ).all(n);

    // Map to original JSON format for backward compat
    return rows.map(row => ({
        text: row.text,
        pillar: row.pillar,
        aiGenerated: !!row.ai_generated,
        hasVideo: !!row.has_video,
        hasImage: !!row.has_image,
        results: {
            x: row.result_x,
            linkedin: row.result_linkedin,
            facebook: row.result_facebook,
            instagram: row.result_instagram,
        },
        timestamp: row.created_at,
    })).reverse(); // Reverse to match old format (oldest first)
}

/**
 * Get post history stats
 * @returns {object} Stats summary
 */
export function getStats() {
    const db = getDb();
    const today = getTimeZoneDateKey(new Date(), REPORT_TIMEZONE);

    const total = db.prepare('SELECT COUNT(*) as c FROM post_history').get().c;
    const postsToday = db.prepare('SELECT created_at FROM post_history').all()
        .filter((row) => isTimestampOnDateInTimeZone(row.created_at, today, REPORT_TIMEZONE))
        .length;

    const pillarRows = db.prepare(
        'SELECT pillar, COUNT(*) as count FROM post_history WHERE pillar IS NOT NULL GROUP BY pillar'
    ).all();

    const pillarCounts = {};
    for (const row of pillarRows) {
        pillarCounts[row.pillar] = row.count;
    }

    const lastPost = db.prepare(
        'SELECT * FROM post_history ORDER BY datetime(created_at) DESC LIMIT 1'
    ).get();

    return {
        totalPosts: total,
        postsToday,
        timezone: REPORT_TIMEZONE,
        pillarCounts,
        lastPost: lastPost ? {
            text: lastPost.text,
            pillar: lastPost.pillar,
            timestamp: lastPost.created_at,
        } : null,
    };
}

/**
 * Non-blocking sync to GhostAI Dashboard
 * Fires after every record() call to keep the dashboard live.
 */
async function syncToDashboard() {
    const dashboardUrl = (process.env.DASHBOARD_URL || '').trim().replace(/\/+$/, '');
    const dashboardSecret = (process.env.DASHBOARD_SECRET || '').trim();
    if (!dashboardUrl) return; // No dashboard configured — skip silently

    try {
        const stats = getStats();
        const recentPosts = getRecent(30);

        const payload = {
            stats: {
                totalPosts: stats.totalPosts,
                postsToday: stats.postsToday,
                aiGenerated: recentPosts.filter(p => p.aiGenerated).length,
                videoPosts: recentPosts.filter(p => p.hasVideo).length,
                imagePosts: recentPosts.filter(p => p.hasImage).length,
            },
            postHistory: recentPosts,
            pillarMetrics: stats.pillarCounts || {},
            queue: { pending: 0, approved: 0, posted: stats.totalPosts, rejected: 0 },
            platforms: {
                x: { status: recentPosts.some(p => p.results?.x) ? 'connected' : 'unknown' },
                linkedin: { status: recentPosts.some(p => p.results?.linkedin) ? 'connected' : 'unknown' },
                facebook: { status: recentPosts.some(p => p.results?.facebook) ? 'connected' : 'unknown' },
                instagram: { status: recentPosts.some(p => p.results?.instagram) ? 'connected' : 'unknown' },
            },
        };

        await fetch(`${dashboardUrl}/api/sync`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${dashboardSecret}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(5000),
        });
    } catch {
        // Non-blocking — don't crash the bot if dashboard is down
    }
}

export default { isDuplicate, record, getRecent, getStats };

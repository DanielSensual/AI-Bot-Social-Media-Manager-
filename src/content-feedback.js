/**
 * Content Feedback Loop — SQLite-backed
 * Tracks post engagement over time and adjusts pillar weights
 * to favor content types that perform best.
 */

import { getDb } from './db.js';
import { config } from './config.js';

/**
 * Record engagement for a post
 * @param {string} pillar - Content pillar used
 * @param {object} engagement - { likes, comments, shares, impressions }
 * @param {string} text - The post text
 * @param {string} platform - Platform name
 */
export function recordEngagement(pillar, engagement, text, platform) {
    const db = getDb();
    const totalEngagement = (engagement.likes || 0) + (engagement.comments || 0) * 2 + (engagement.shares || 0) * 3;

    // Upsert pillar metrics
    const existing = db.prepare('SELECT * FROM pillar_metrics WHERE pillar = ?').get(pillar);

    if (existing) {
        const newTotal = existing.total_posts + 1;
        const newAvg = Math.round(
            ((existing.avg_engagement * existing.total_posts) + totalEngagement) / newTotal
        );

        db.prepare(`
            UPDATE pillar_metrics SET
                total_posts = ?,
                total_likes = total_likes + ?,
                total_comments = total_comments + ?,
                total_shares = total_shares + ?,
                total_impressions = total_impressions + ?,
                avg_engagement = ?,
                updated_at = ?
            WHERE pillar = ?
        `).run(
            newTotal,
            engagement.likes || 0,
            engagement.comments || 0,
            engagement.shares || 0,
            engagement.impressions || 0,
            newAvg,
            new Date().toISOString(),
            pillar,
        );
    } else {
        db.prepare(`
            INSERT INTO pillar_metrics (pillar, total_posts, total_likes, total_comments,
                total_shares, total_impressions, avg_engagement, updated_at)
            VALUES (?, 1, ?, ?, ?, ?, ?, ?)
        `).run(
            pillar,
            engagement.likes || 0,
            engagement.comments || 0,
            engagement.shares || 0,
            engagement.impressions || 0,
            totalEngagement,
            new Date().toISOString(),
        );
    }

    // Track top-performing posts (keep max 20)
    db.prepare(
        'INSERT INTO top_posts (text, pillar, platform, score) VALUES (?, ?, ?, ?)'
    ).run(text.substring(0, 200), pillar, platform, totalEngagement);

    // Prune to top 20
    const count = db.prepare('SELECT COUNT(*) as c FROM top_posts').get().c;
    if (count > 20) {
        db.prepare(`
            DELETE FROM top_posts WHERE id NOT IN (
                SELECT id FROM top_posts ORDER BY score DESC LIMIT 20
            )
        `).run();
    }
}

/**
 * Get optimized pillar weights based on engagement data.
 * Blends configured base weights with performance data.
 * @returns {object} { pillarName: adjustedWeight }
 */
export function getOptimizedWeights() {
    const db = getDb();
    const baseWeights = {};
    const pillars = config.pillars || {};

    for (const [name, weight] of Object.entries(pillars)) {
        baseWeights[name] = weight || 1;
    }

    // If insufficient data, return base weights
    const totalRow = db.prepare('SELECT SUM(total_posts) as total FROM pillar_metrics').get();
    if (!totalRow.total || totalRow.total < 10) {
        return baseWeights;
    }

    // Blend base weights with performance
    const metrics = db.prepare('SELECT * FROM pillar_metrics').all();
    const maxAvg = Math.max(...metrics.map(m => m.avg_engagement), 1);

    const optimized = {};
    for (const [name, baseWeight] of Object.entries(baseWeights)) {
        const m = metrics.find(row => row.pillar === name);
        if (m && m.total_posts >= 3) {
            const performanceFactor = 0.5 + (m.avg_engagement / maxAvg) * 1.5;
            optimized[name] = Math.round(baseWeight * performanceFactor);
        } else {
            optimized[name] = baseWeight;
        }
    }

    return optimized;
}

/**
 * Get top-performing posts for use as style examples in AI prompts
 * @param {number} count - Number of examples to return
 * @returns {string[]} Array of post texts
 */
export function getTopPerformingExamples(count = 3) {
    const db = getDb();
    const rows = db.prepare(
        'SELECT text FROM top_posts ORDER BY score DESC LIMIT ?'
    ).all(count);

    return rows.map(r => r.text);
}

/**
 * Get a summary of pillar performance for analytics
 */
export function getPerformanceSummary() {
    const db = getDb();

    const metrics = db.prepare('SELECT * FROM pillar_metrics').all();
    const topPosts = db.prepare('SELECT * FROM top_posts ORDER BY score DESC LIMIT 5').all();

    const pillarPerformance = {};
    for (const m of metrics) {
        pillarPerformance[m.pillar] = {
            posts: m.total_posts,
            avgEngagement: m.avg_engagement,
            totalLikes: m.total_likes,
            totalComments: m.total_comments,
        };
    }

    return {
        pillarPerformance,
        topPosts: topPosts.map(p => ({
            text: p.text,
            pillar: p.pillar,
            platform: p.platform,
            score: p.score,
            timestamp: p.created_at,
        })),
        lastUpdated: metrics[0]?.updated_at || null,
    };
}

export default {
    recordEngagement,
    getOptimizedWeights,
    getTopPerformingExamples,
    getPerformanceSummary,
};

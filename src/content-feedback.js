/**
 * Content Feedback Loop
 * Tracks post engagement over time and adjusts pillar weights
 * to favor content types that perform best.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FEEDBACK_FILE = path.join(__dirname, '..', '.content-feedback.json');

/**
 * Load feedback data from disk
 * @returns {object} { pillarMetrics, recentTopPosts, lastUpdated }
 */
function loadFeedback() {
    try {
        if (fs.existsSync(FEEDBACK_FILE)) {
            return JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf-8'));
        }
    } catch (e) {
        console.warn('⚠️ Error loading feedback data, starting fresh');
    }
    return {
        pillarMetrics: {},
        recentTopPosts: [],
        lastUpdated: null,
    };
}

/**
 * Save feedback data to disk
 */
function saveFeedback(data) {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(data, null, 2));
}

/**
 * Record engagement for a post
 * @param {string} pillar - Content pillar used
 * @param {object} engagement - { likes, comments, shares, impressions }
 * @param {string} text - The post text
 * @param {string} platform - Platform name
 */
export function recordEngagement(pillar, engagement, text, platform) {
    const data = loadFeedback();

    if (!data.pillarMetrics[pillar]) {
        data.pillarMetrics[pillar] = {
            totalPosts: 0,
            totalLikes: 0,
            totalComments: 0,
            totalShares: 0,
            totalImpressions: 0,
            avgEngagement: 0,
        };
    }

    const metrics = data.pillarMetrics[pillar];
    metrics.totalPosts++;
    metrics.totalLikes += engagement.likes || 0;
    metrics.totalComments += engagement.comments || 0;
    metrics.totalShares += engagement.shares || 0;
    metrics.totalImpressions += engagement.impressions || 0;

    const totalEngagement = (engagement.likes || 0) + (engagement.comments || 0) * 2 + (engagement.shares || 0) * 3;
    metrics.avgEngagement = Math.round(
        ((metrics.avgEngagement * (metrics.totalPosts - 1)) + totalEngagement) / metrics.totalPosts,
    );

    // Track top-performing posts for style examples
    const score = totalEngagement;
    data.recentTopPosts.push({
        text: text.substring(0, 200),
        pillar,
        platform,
        score,
        timestamp: new Date().toISOString(),
    });

    // Keep only top 20 posts sorted by score
    data.recentTopPosts.sort((a, b) => b.score - a.score);
    data.recentTopPosts = data.recentTopPosts.slice(0, 20);

    saveFeedback(data);
}

/**
 * Get optimized pillar weights based on engagement data.
 * Blends configured base weights with performance data.
 * @returns {object} { pillarName: adjustedWeight }
 */
export function getOptimizedWeights() {
    const data = loadFeedback();
    const baseWeights = {};
    const pillars = config.pillars || {};

    // Extract base weights from config (pillars is { name: weight })
    for (const [name, weight] of Object.entries(pillars)) {
        baseWeights[name] = weight || 1;
    }

    // If insufficient data, return base weights
    const totalTrackedPosts = Object.values(data.pillarMetrics).reduce((sum, m) => sum + m.totalPosts, 0);
    if (totalTrackedPosts < 10) {
        return baseWeights;
    }

    // Blend base weights with performance
    const optimized = {};
    const maxAvgEngagement = Math.max(
        ...Object.values(data.pillarMetrics).map(m => m.avgEngagement),
        1,
    );

    for (const [name, baseWeight] of Object.entries(baseWeights)) {
        const metrics = data.pillarMetrics[name];
        if (metrics && metrics.totalPosts >= 3) {
            // Performance multiplier: 0.5x to 2.0x based on relative engagement
            const performanceFactor = 0.5 + (metrics.avgEngagement / maxAvgEngagement) * 1.5;
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
    const data = loadFeedback();
    return data.recentTopPosts
        .slice(0, count)
        .map(p => p.text);
}

/**
 * Get a summary of pillar performance for analytics
 * @returns {object} Performance summary
 */
export function getPerformanceSummary() {
    const data = loadFeedback();
    const summary = {};

    for (const [pillar, metrics] of Object.entries(data.pillarMetrics)) {
        summary[pillar] = {
            posts: metrics.totalPosts,
            avgEngagement: metrics.avgEngagement,
            totalLikes: metrics.totalLikes,
            totalComments: metrics.totalComments,
        };
    }

    return {
        pillarPerformance: summary,
        topPosts: data.recentTopPosts.slice(0, 5),
        lastUpdated: data.lastUpdated,
    };
}

export default {
    recordEngagement,
    getOptimizedWeights,
    getTopPerformingExamples,
    getPerformanceSummary,
};

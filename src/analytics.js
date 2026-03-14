/**
 * Engagement Analytics Engine
 * Pulls metrics from X, Facebook, and Instagram.
 * LinkedIn API does not expose post-level analytics for personal profiles.
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRecent } from './post-history.js';
import { config } from './config.js';
import { getTimeZoneDateKey, isTimestampOnDateInTimeZone, parseStoredTimestamp } from './timezone.js';
import { resolvePageToken, getGraphApiBase } from '@ghostai/shared/graph-api';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, '..', 'logs', 'analytics');
const REPORT_TIMEZONE = config.schedule?.timezone || 'America/New_York';

fs.mkdirSync(LOGS_DIR, { recursive: true });

/**
 * Get X (Twitter) post metrics
 * @param {string} postId - Tweet ID
 * @returns {Promise<object|null>} Metrics or null
 */
export async function getXMetrics(postId) {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) return null;

    try {
        const response = await fetch(`https://api.x.com/2/tweets/${postId}?tweet.fields=public_metrics,created_at`, {
            headers: { Authorization: `Bearer ${bearerToken}` },
        });

        const data = await response.json();
        if (data.errors || !data.data) return null;

        return {
            platform: 'x',
            postId,
            createdAt: data.data.created_at,
            ...data.data.public_metrics,
        };
    } catch {
        return null;
    }
}

/**
 * Get Facebook post metrics
 * @param {string} postId - Facebook post ID
 * @returns {Promise<object|null>} Metrics or null
 */
export async function getFacebookMetrics(postId) {
    const resolved = await resolvePageToken();
    if (!resolved) return null;

    try {
        const response = await fetch(`${getGraphApiBase()}/${postId}?fields=likes.summary(true),comments.summary(true),shares,created_time&access_token=${resolved.pageToken}`);
        const data = await response.json();

        if (data.error) return null;

        return {
            platform: 'facebook',
            postId,
            createdAt: data.created_time,
            likes: data.likes?.summary?.total_count || 0,
            comments: data.comments?.summary?.total_count || 0,
            shares: data.shares?.count || 0,
        };
    } catch {
        return null;
    }
}

/**
 * Get Instagram media metrics
 * @param {string} mediaId - IG media ID
 * @returns {Promise<object|null>} Metrics or null
 */
export async function getInstagramMetrics(mediaId) {
    const resolved = await resolvePageToken();
    if (!resolved) return null;

    try {
        const response = await fetch(`${getGraphApiBase()}/${mediaId}?fields=like_count,comments_count,timestamp&access_token=${resolved.pageToken}`);
        const data = await response.json();

        if (data.error) return null;

        return {
            platform: 'instagram',
            postId: mediaId,
            createdAt: data.timestamp,
            likes: data.like_count || 0,
            comments: data.comments_count || 0,
        };
    } catch {
        return null;
    }
}


/**
 * Extract a post ID from various result formats
 */
function extractPostId(resultStr, platform) {
    if (!resultStr || resultStr === 'posted') return null;
    // X: full URL or just ID
    if (platform === 'x' && resultStr.includes('/status/')) {
        return resultStr.split('/status/')[1];
    }
    return resultStr;
}

/**
 * Generate weekly digest from post history
 * @returns {Promise<object>} Digest data
 */
export async function getWeeklyDigest() {
    const recentPosts = getRecent(50);
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const now = new Date();

    const thisWeek = recentPosts.filter((post) => {
        const parsed = parseStoredTimestamp(post.timestamp);
        return parsed && parsed.getTime() >= oneWeekAgo.getTime();
    });

    const digest = {
        period: {
            start: getTimeZoneDateKey(oneWeekAgo, REPORT_TIMEZONE),
            end: getTimeZoneDateKey(now, REPORT_TIMEZONE),
            timezone: REPORT_TIMEZONE,
        },
        totalPosts: thisWeek.length,
        byPlatform: { x: 0, linkedin: 0, facebook: 0, instagram: 0 },
        bySource: { ai: 0, template: 0 },
        withVideo: 0,
        topPosts: [],
    };

    for (const post of thisWeek) {
        if (post.results?.x) digest.byPlatform.x++;
        if (post.results?.linkedin) digest.byPlatform.linkedin++;
        if (post.results?.facebook) digest.byPlatform.facebook++;
        if (post.results?.instagram) digest.byPlatform.instagram++;
        if (post.aiGenerated) digest.bySource.ai++;
        else digest.bySource.template++;
        if (post.hasVideo) digest.withVideo++;

        // Try to fetch engagement metrics for X posts
        const xId = extractPostId(post.results?.x, 'x');
        if (xId) {
            const metrics = await getXMetrics(xId);
            if (metrics) {
                digest.topPosts.push({
                    text: post.text?.substring(0, 80),
                    platform: 'x',
                    ...metrics,
                    timestamp: post.timestamp,
                });
            }
        }

        // Facebook metrics
        const fbId = extractPostId(post.results?.facebook, 'facebook');
        if (fbId) {
            const metrics = await getFacebookMetrics(fbId);
            if (metrics) {
                digest.topPosts.push({
                    text: post.text?.substring(0, 80),
                    platform: 'facebook',
                    ...metrics,
                    timestamp: post.timestamp,
                });
            }
        }
    }

    // Sort top posts by engagement
    digest.topPosts.sort((a, b) => {
        const engA = (a.like_count || a.likes || 0) + (a.retweet_count || a.shares || 0) + (a.reply_count || a.comments || 0);
        const engB = (b.like_count || b.likes || 0) + (b.retweet_count || b.shares || 0) + (b.reply_count || b.comments || 0);
        return engB - engA;
    });

    digest.topPosts = digest.topPosts.slice(0, 10);

    return digest;
}

/**
 * Generate and save today's analytics snapshot
 * @returns {Promise<object>} Today's stats
 */
export async function getTodayStats() {
    const recentPosts = getRecent(20);
    const today = getTimeZoneDateKey(new Date(), REPORT_TIMEZONE);
    const todayPosts = recentPosts.filter((post) =>
        isTimestampOnDateInTimeZone(post.timestamp, today, REPORT_TIMEZONE)
    );

    return {
        date: today,
        timezone: REPORT_TIMEZONE,
        totalPosts: todayPosts.length,
        byPlatform: {
            x: todayPosts.filter(p => p.results?.x).length,
            linkedin: todayPosts.filter(p => p.results?.linkedin).length,
            facebook: todayPosts.filter(p => p.results?.facebook).length,
            instagram: todayPosts.filter(p => p.results?.instagram).length,
        },
        aiGenerated: todayPosts.filter(p => p.aiGenerated).length,
        withVideo: todayPosts.filter(p => p.hasVideo).length,
    };
}

/**
 * Save digest to log file
 */
export function saveDigest(digest) {
    const dateStr = getTimeZoneDateKey(new Date(), REPORT_TIMEZONE);
    const logFile = path.join(LOGS_DIR, `${dateStr}-digest.json`);
    fs.writeFileSync(logFile, JSON.stringify(digest, null, 2));
    console.log(`📊 Digest saved to ${logFile}`);
}

export default { getXMetrics, getFacebookMetrics, getInstagramMetrics, getWeeklyDigest, getTodayStats, saveDigest };

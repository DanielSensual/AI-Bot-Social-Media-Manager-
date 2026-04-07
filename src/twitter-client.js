/**
 * Twitter/X API Client Wrapper
 * Includes circuit breaker for credit exhaustion (402)
 */

import fs from 'fs';
import path from 'path';
import { TwitterApi } from 'twitter-api-v2';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BREAKER_STATE_PATH = path.join(__dirname, '..', '.x-api-breaker.json');

// Initialize client with OAuth 1.0a for user context (posting)
const client = new TwitterApi({
    appKey: process.env.X_CONSUMER_KEY,
    appSecret: process.env.X_CONSUMER_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
});

// Get read-write client
const rwClient = client.readWrite;

// ═══════════════════════════════════════════════════════════
//  CIRCUIT BREAKER — stops hammering X API after 402
//  Escalating cooldown: 24h → 48h → 72h on consecutive trips
// ═══════════════════════════════════════════════════════════
const BASE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const COOLDOWN_TIERS = [BASE_COOLDOWN_MS, 48 * 60 * 60 * 1000, 72 * 60 * 60 * 1000];

function readBreakerState() {
    try {
        if (!fs.existsSync(BREAKER_STATE_PATH)) return { trippedAt: 0, consecutiveTrips: 0 };
        const raw = JSON.parse(fs.readFileSync(BREAKER_STATE_PATH, 'utf8'));
        return {
            trippedAt: Number.isFinite(raw?.trippedAt) ? raw.trippedAt : 0,
            consecutiveTrips: Number.isFinite(raw?.consecutiveTrips) ? raw.consecutiveTrips : 0,
        };
    } catch {
        return { trippedAt: 0, consecutiveTrips: 0 };
    }
}

function getCooldownMs(consecutiveTrips) {
    const tier = Math.min(consecutiveTrips, COOLDOWN_TIERS.length) - 1;
    return COOLDOWN_TIERS[Math.max(0, tier)];
}

function writeBreakerState({ trippedAt, consecutiveTrips }) {
    try {
        if (!trippedAt) {
            if (fs.existsSync(BREAKER_STATE_PATH)) {
                fs.unlinkSync(BREAKER_STATE_PATH);
            }
            return;
        }

        const cooldown = getCooldownMs(consecutiveTrips);
        fs.writeFileSync(BREAKER_STATE_PATH, JSON.stringify({
            trippedAt,
            consecutiveTrips,
            cooldownHours: cooldown / (60 * 60 * 1000),
            resetAt: new Date(trippedAt + cooldown).toISOString(),
        }, null, 2));
    } catch (error) {
        console.warn(`⚠️ Failed to persist X circuit breaker state: ${error.message}`);
    }
}

let breakerState = readBreakerState();

function isBreakerOpen() {
    if (breakerState.trippedAt === 0) return false;
    const cooldown = getCooldownMs(breakerState.consecutiveTrips);
    const elapsed = Date.now() - breakerState.trippedAt;
    if (elapsed > cooldown) {
        // Don't clear consecutiveTrips — only clear after a SUCCESSFUL call
        breakerState.trippedAt = 0;
        writeBreakerState({ trippedAt: 0, consecutiveTrips: breakerState.consecutiveTrips });
        console.log('🔌 X API circuit breaker reset — retrying allowed (1 probe attempt)');
        return false;
    }
    return true;
}

function tripBreaker() {
    breakerState.consecutiveTrips += 1;
    breakerState.trippedAt = Date.now();
    writeBreakerState(breakerState);
    const cooldown = getCooldownMs(breakerState.consecutiveTrips);
    const cooldownHours = cooldown / (60 * 60 * 1000);
    const resetTime = new Date(breakerState.trippedAt + cooldown).toISOString();
    console.error(`⚡ Circuit breaker TRIPPED (trip #${breakerState.consecutiveTrips}) — X API blocked for ${cooldownHours}h until ${resetTime}`);
}

function clearBreaker() {
    breakerState = { trippedAt: 0, consecutiveTrips: 0 };
    writeBreakerState(breakerState);
    console.log('✅ X API circuit breaker cleared — credits confirmed working');
}

export function getBreakerStatus() {
    if (!isBreakerOpen()) return { open: false, consecutiveTrips: breakerState.consecutiveTrips };
    const cooldown = getCooldownMs(breakerState.consecutiveTrips);
    const remainingMs = cooldown - (Date.now() - breakerState.trippedAt);
    return {
        open: true,
        consecutiveTrips: breakerState.consecutiveTrips,
        cooldownHours: cooldown / (60 * 60 * 1000),
        remainingMs,
        resetAt: new Date(breakerState.trippedAt + cooldown).toISOString(),
    };
}

function isBillingError(error) {
    const message = String(error?.message || '');
    return error?.code === 402
        || error?.data?.status === 402
        || /\b402\b/.test(message)
        || /credits exhausted/i.test(message);
}

async function withBreaker(action, fn) {
    if (isBreakerOpen()) {
        const status = getBreakerStatus();
        throw new Error(`X API circuit breaker is OPEN — ${action} blocked until ${status.resetAt}`);
    }

    try {
        const result = await fn();
        // Successful call — clear consecutive trip counter
        if (breakerState.consecutiveTrips > 0) clearBreaker();
        return result;
    } catch (error) {
        if (isBillingError(error)) {
            console.error('💳 ═══════════════════════════════════════');
            console.error('   X API CREDITS EXHAUSTED (HTTP 402)');
            console.error('   Add credits → https://console.x.com');
            console.error('═══════════════════════════════════════════');
            tripBreaker();
            throw new Error('X API credits exhausted — add credits at https://console.x.com');
        }

        throw error;
    }
}

/**
 * Post a single tweet
 * @param {string} text - Tweet content (max 280 chars)
 * @returns {Promise<object>} Tweet data
 */
export async function postTweet(text) {
    return withBreaker('tweet publish', async () => {
        if (text.length > 280) {
            throw new Error(`Tweet exceeds 280 characters (${text.length})`);
        }

        const tweet = await rwClient.v2.tweet(text);

        console.log(`✅ Tweet posted: ${tweet.data.id}`);
        console.log(`📝 "${text.substring(0, 50)}..."`);
        console.log(`🔗 https://x.com/i/status/${tweet.data.id}`);

        return tweet.data;
    });
}

/**
 * Post a tweet with media (image)
 * @param {string} text - Tweet content (max 280 chars)
 * @param {string} imagePath - Path to image file
 * @returns {Promise<object>} Tweet data
 */
export async function postTweetWithMedia(text, imagePath) {
    return withBreaker('tweet-with-media publish', async () => {
        if (text.length > 280) {
            throw new Error(`Tweet exceeds 280 characters (${text.length})`);
        }

        // Upload image first
        console.log('📤 Uploading image to X...');
        const mediaId = await client.v1.uploadMedia(imagePath);
        console.log(`✅ Image uploaded: ${mediaId}`);

        // Post tweet with media
        const tweet = await rwClient.v2.tweet({
            text: text,
            media: { media_ids: [mediaId] },
        });

        console.log(`✅ Tweet with image posted: ${tweet.data.id}`);
        console.log(`📝 "${text.substring(0, 50)}..."`);
        console.log(`🔗 https://x.com/i/status/${tweet.data.id}`);

        return tweet.data;
    });
}

/**
 * Post a tweet with video
 * @param {string} text - Tweet content (max 280 chars)
 * @param {string} videoPath - Path to video file (mp4)
 * @returns {Promise<object>} Tweet data
 */
export async function postTweetWithVideo(text, videoPath) {
    return withBreaker('tweet-with-video publish', async () => {
        if (text.length > 280) {
            throw new Error(`Tweet exceeds 280 characters (${text.length})`);
        }

        // Upload video (this handles chunked upload internally)
        console.log('📤 Uploading video to X (this may take a moment)...');
        const mediaId = await client.v1.uploadMedia(videoPath, {
            mimeType: 'video/mp4',
            longVideo: false,
        });
        console.log(`✅ Video uploaded: ${mediaId}`);

        // Wait for video processing
        console.log('⏳ Waiting for video processing...');
        await waitForMediaProcessing(mediaId);

        // Post tweet with video
        const tweet = await rwClient.v2.tweet({
            text: text,
            media: { media_ids: [mediaId] },
        });

        console.log(`✅ Tweet with video posted: ${tweet.data.id}`);
        console.log(`📝 "${text.substring(0, 50)}..."`);
        console.log(`🔗 https://x.com/i/status/${tweet.data.id}`);

        return tweet.data;
    });
}

/**
 * Wait for media processing to complete
 */
async function waitForMediaProcessing(mediaId, maxWaitMs = 60000) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        try {
            const status = await client.v1.mediaInfo(mediaId);

            if (status.processing_info) {
                const { state, check_after_secs } = status.processing_info;

                if (state === 'succeeded') {
                    console.log('   ✅ Video processing complete');
                    return;
                }

                if (state === 'failed') {
                    throw new Error('Video processing failed on X');
                }

                const waitMs = (check_after_secs || 5) * 1000;
                await new Promise(r => setTimeout(r, waitMs));
            } else {
                return;
            }
        } catch (error) {
            return;
        }
    }

    throw new Error('Video processing timed out');
}

/**
 * Post a thread of tweets
 * @param {string[]} tweets - Array of tweet texts
 * @returns {Promise<object[]>} Array of tweet data
 */
export async function postThread(tweets) {
    return withBreaker('thread publish', async () => {
        const posted = [];
        let lastTweetId = null;

        for (const text of tweets) {
            const options = lastTweetId
                ? { reply: { in_reply_to_tweet_id: lastTweetId } }
                : {};

            const tweet = await rwClient.v2.tweet(text, options);
            posted.push(tweet.data);
            lastTweetId = tweet.data.id;

            console.log(`✅ Thread tweet ${posted.length}/${tweets.length}: ${tweet.data.id}`);
        }

        return posted;
    });
}

/**
 * Get account metrics
 * @returns {Promise<object>} Account metrics
 */
export async function getMetrics() {
    const me = await withBreaker('metrics lookup', () => rwClient.v2.me({
        'user.fields': ['public_metrics', 'description'],
    }));

    return {
        id: me.data.id,
        username: me.data.username,
        name: me.data.name,
        followers: me.data.public_metrics?.followers_count || 0,
        following: me.data.public_metrics?.following_count || 0,
        tweets: me.data.public_metrics?.tweet_count || 0,
    };
}

/**
 * Test connection to X API
 * @returns {Promise<boolean>} Connection success
 */
export async function testConnection() {
    try {
        const me = await withBreaker('connection test', () => rwClient.v2.me());
        console.log(`✅ Connected as @${me.data.username}`);
        return true;
    } catch (error) {
        console.error('❌ Connection failed:', error.message);
        return false;
    }
}

export default { postTweet, postTweetWithMedia, postTweetWithVideo, postThread, getMetrics, testConnection };

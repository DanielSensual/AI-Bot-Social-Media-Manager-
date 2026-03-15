/**
 * Twitter/X API Client Wrapper
 * Includes circuit breaker for credit exhaustion (402)
 */

import { TwitterApi } from 'twitter-api-v2';
import dotenv from 'dotenv';

dotenv.config();

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
// ═══════════════════════════════════════════════════════════
const BREAKER_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
let breakerTrippedAt = 0;

function isBreakerOpen() {
    if (breakerTrippedAt === 0) return false;
    const elapsed = Date.now() - breakerTrippedAt;
    if (elapsed > BREAKER_COOLDOWN_MS) {
        breakerTrippedAt = 0; // Reset after cooldown
        console.log('🔌 X API circuit breaker reset — retrying allowed');
        return false;
    }
    return true;
}

function tripBreaker() {
    breakerTrippedAt = Date.now();
    const resetTime = new Date(breakerTrippedAt + BREAKER_COOLDOWN_MS).toLocaleTimeString();
    console.error(`⚡ Circuit breaker TRIPPED — all X API calls blocked until ${resetTime}`);
}

export function getBreakerStatus() {
    if (!isBreakerOpen()) return { open: false };
    const remainingMs = BREAKER_COOLDOWN_MS - (Date.now() - breakerTrippedAt);
    return { open: true, remainingMs, resetAt: new Date(breakerTrippedAt + BREAKER_COOLDOWN_MS).toISOString() };
}

/**
 * Post a single tweet
 * @param {string} text - Tweet content (max 280 chars)
 * @returns {Promise<object>} Tweet data
 */
export async function postTweet(text) {
    if (isBreakerOpen()) {
        const status = getBreakerStatus();
        throw new Error(`X API circuit breaker is OPEN — credits exhausted. Resets at ${status.resetAt}`);
    }

    if (text.length > 280) {
        throw new Error(`Tweet exceeds 280 characters (${text.length})`);
    }

    let tweet;
    try {
        tweet = await rwClient.v2.tweet(text);
    } catch (error) {
        // Surface clear message for billing issues + trip circuit breaker
        if (error.code === 402 || error.data?.status === 402 || /402/.test(error.message)) {
            console.error('💳 ═══════════════════════════════════════');
            console.error('   X API CREDITS EXHAUSTED (HTTP 402)');
            console.error('   Add credits → https://console.x.com');
            console.error('═══════════════════════════════════════════');
            tripBreaker();
            throw new Error('X API credits exhausted — add credits at https://console.x.com');
        }
        throw error;
    }

    console.log(`✅ Tweet posted: ${tweet.data.id}`);
    console.log(`📝 "${text.substring(0, 50)}..."`);
    console.log(`🔗 https://x.com/i/status/${tweet.data.id}`);

    return tweet.data;
}

/**
 * Post a tweet with media (image)
 * @param {string} text - Tweet content (max 280 chars)
 * @param {string} imagePath - Path to image file
 * @returns {Promise<object>} Tweet data
 */
export async function postTweetWithMedia(text, imagePath) {
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
}

/**
 * Post a tweet with video
 * @param {string} text - Tweet content (max 280 chars)
 * @param {string} videoPath - Path to video file (mp4)
 * @returns {Promise<object>} Tweet data
 */
export async function postTweetWithVideo(text, videoPath) {
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
}

/**
 * Get account metrics
 * @returns {Promise<object>} Account metrics
 */
export async function getMetrics() {
    const me = await rwClient.v2.me({
        'user.fields': ['public_metrics', 'description'],
    });

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
        const me = await rwClient.v2.me();
        console.log(`✅ Connected as @${me.data.username}`);
        return true;
    } catch (error) {
        console.error('❌ Connection failed:', error.message);
        return false;
    }
}

export default { postTweet, postTweetWithMedia, postTweetWithVideo, postThread, getMetrics, testConnection };

/**
 * Twitter/X API Client Wrapper
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

/**
 * Post a single tweet
 * @param {string} text - Tweet content (max 280 chars)
 * @returns {Promise<object>} Tweet data
 */
export async function postTweet(text) {
    if (text.length > 280) {
        throw new Error(`Tweet exceeds 280 characters (${text.length})`);
    }

    const tweet = await rwClient.v2.tweet(text);

    console.log(`✅ Tweet posted: ${tweet.data.id}`);
    console.log(`📝 "${text.substring(0, 50)}..."`);
    console.log(`🔗 https://x.com/i/status/${tweet.data.id}`);

    return tweet.data;
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

export default { postTweet, postThread, getMetrics, testConnection };

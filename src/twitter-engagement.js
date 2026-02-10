/**
 * X (Twitter) Outbound Engagement Bot
 * Proactively finds trending AI/business posts and replies with witty, on-brand comments
 * Goal: Drive traffic to @Ghostaisystems by engaging with large accounts
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hasLLMProvider, generateText } from './llm-client.js';
import { TwitterApi } from 'twitter-api-v2';
import {
    normalizeLimit,
    loadEngagedRecords,
    pruneEngagedRecords,
    serializeEngagedRecords,
    shouldRetryTwitterError,
    computeBackoffMs,
    sleep,
} from './twitter-engagement-utils.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, '..', 'logs', 'twitter-engagement');
const ENGAGED_FILE = path.join(__dirname, '..', '.x-engaged.json');
const MAX_ENGAGED_RECORDS = 5000;
const MAX_BACKOFF_MS = 20000;

fs.mkdirSync(LOGS_DIR, { recursive: true });

/**
 * Target accounts and search queries for engagement
 */
const TARGET_SEARCHES = [
    'AI agents for business',
    'AI automation',
    'AI replacing jobs',
    'vibe coding',
    'ship faster with AI',
    'AI voice agents',
    'built with AI',
    'no-code AI',
    'AI startup',
    'website in 72 hours',
];

/**
 * High-value accounts to monitor
 */
const TARGET_ACCOUNTS = [
    'GeminiApp',
    'OpenAI',
    'xaborja',
    'levelsio',
    'elonmusk',
    'sama',
    'gaborja',
    'AndrewYNg',
    'kaborja',
    'garyvee',
    'dharmesh',
    'naval',
];

function assertRequiredEnv() {
    const requiredKeys = [
        'X_CONSUMER_KEY',
        'X_CONSUMER_SECRET',
        'X_ACCESS_TOKEN',
        'X_ACCESS_TOKEN_SECRET',
    ];

    const missing = requiredKeys.filter(key => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(`Missing required X credentials: ${missing.join(', ')}`);
    }
}

function createClient() {
    return new TwitterApi({
        appKey: process.env.X_CONSUMER_KEY,
        appSecret: process.env.X_CONSUMER_SECRET,
        accessToken: process.env.X_ACCESS_TOKEN,
        accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
    });
}

function loadEngaged(dedupeTtlDays, now = new Date()) {
    try {
        const raw = fs.existsSync(ENGAGED_FILE)
            ? fs.readFileSync(ENGAGED_FILE, 'utf-8')
            : '[]';

        const parsed = loadEngagedRecords(raw, now);
        return pruneEngagedRecords(parsed, dedupeTtlDays, MAX_ENGAGED_RECORDS, now);
    } catch {
        return [];
    }
}

function saveEngaged(records, dedupeTtlDays, now = new Date()) {
    const pruned = pruneEngagedRecords(records, dedupeTtlDays, MAX_ENGAGED_RECORDS, now);
    fs.writeFileSync(ENGAGED_FILE, serializeEngagedRecords(pruned));
}

async function runWithRetry(taskName, fn, options = {}) {
    const maxAttempts = Number.isInteger(options.maxAttempts) && options.maxAttempts > 0
        ? options.maxAttempts
        : 3;
    const baseDelayMs = Number.isInteger(options.baseDelayMs) && options.baseDelayMs > 0
        ? options.baseDelayMs
        : 2000;

    let attempt = 1;

    while (true) {
        try {
            return await fn();
        } catch (error) {
            const retryable = shouldRetryTwitterError(error);
            const message = error?.message || 'Unknown error';

            if (!retryable || attempt >= maxAttempts) {
                throw error;
            }

            const delayMs = computeBackoffMs(attempt, baseDelayMs, MAX_BACKOFF_MS);
            console.log(`   ⚠️ ${taskName} failed (${message}). Retrying in ${delayMs}ms... [${attempt}/${maxAttempts}]`);
            await sleep(delayMs);
            attempt += 1;
        }
    }
}

/**
 * Search for trending tweets to engage with
 */
async function findEngagementTargets(client, myUserId, engagedIds, limit = 15, retryOptions = {}) {
    const targets = [];

    const shuffled = [...TARGET_SEARCHES].sort(() => Math.random() - 0.5);

    for (const query of shuffled.slice(0, 4)) {
        try {
            const results = await runWithRetry(
                `search query "${query}"`,
                () => client.v2.search(query, {
                    max_results: 10,
                    'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'conversation_id'],
                    'user.fields': ['username', 'name', 'public_metrics'],
                    expansions: ['author_id'],
                    sort_order: 'relevancy',
                }),
                retryOptions,
            );

            const users = {};
            if (results?.includes?.users) {
                for (const user of results.includes.users) {
                    users[user.id] = user;
                }
            }

            const tweets = results?.data?.data || results?.tweets || [];
            for (const tweet of tweets) {
                if (engagedIds.has(tweet.id)) continue;
                if (tweet.author_id === myUserId) continue;

                const author = users[tweet.author_id];
                const followers = author?.public_metrics?.followers_count || 0;
                const metrics = tweet.public_metrics || {};
                const engagement = (metrics.like_count || 0) + (metrics.retweet_count || 0) + (metrics.reply_count || 0);

                if (engagement >= 5 || followers >= 1000) {
                    targets.push({
                        id: tweet.id,
                        text: tweet.text,
                        authorUsername: author?.username || 'unknown',
                        authorName: author?.name || 'unknown',
                        followers,
                        engagement,
                        query,
                    });
                }
            }

            await sleep(1500);
        } catch (error) {
            console.error(`   ❌ Search error for "${query}": ${error.message}`);
        }
    }

    targets.sort((a, b) => (b.followers + b.engagement * 100) - (a.followers + a.engagement * 100));
    return targets.slice(0, limit);
}

/**
 * Also check target accounts for recent high-performing tweets
 */
async function findTargetAccountTweets(client, myUserId, engagedIds, limit = 5, retryOptions = {}) {
    const targets = [];
    const shuffledAccounts = [...TARGET_ACCOUNTS].sort(() => Math.random() - 0.5);

    for (const username of shuffledAccounts.slice(0, 3)) {
        try {
            const user = await runWithRetry(
                `lookup @${username}`,
                () => client.v2.userByUsername(username, {
                    'user.fields': ['public_metrics'],
                }),
                retryOptions,
            );

            if (!user?.data?.id) continue;

            const timeline = await runWithRetry(
                `timeline @${username}`,
                () => client.v2.userTimeline(user.data.id, {
                    max_results: 5,
                    'tweet.fields': ['created_at', 'public_metrics', 'text'],
                    exclude: ['retweets'],
                }),
                retryOptions,
            );

            for (const tweet of timeline?.data?.data || []) {
                if (engagedIds.has(tweet.id)) continue;
                if (tweet.author_id === myUserId) continue;

                const metrics = tweet.public_metrics || {};
                const engagement = (metrics.like_count || 0) + (metrics.retweet_count || 0);

                if (engagement >= 10) {
                    targets.push({
                        id: tweet.id,
                        text: tweet.text,
                        authorUsername: username,
                        authorName: user.data.name,
                        followers: user.data.public_metrics?.followers_count || 0,
                        engagement,
                        query: `@${username} timeline`,
                    });
                }
            }

            await sleep(1500);
        } catch (error) {
            console.error(`   ❌ Account scan error for @${username}: ${error.message}`);
        }
    }

    targets.sort((a, b) => b.engagement - a.engagement);
    return targets.slice(0, limit);
}

/**
 * Generate a strategic reply
 */
async function generateEngagementReply(tweet) {
    if (!hasLLMProvider()) return null;

    const prompt = `You are @GhostAISystems on X (Twitter). You build AI automation systems for businesses — websites in 72 hours, AI voice agents, autonomous social media engines.

You're replying to a tweet from @${tweet.authorUsername} (${tweet.followers.toLocaleString()} followers):
"${tweet.text}"

Write a reply that:
1. Adds genuine value or a sharp take — NOT generic praise
2. Shows expertise in AI/automation/business without being salesy
3. Is witty, confident, slightly provocative if the tweet calls for it
4. Under 280 characters
5. Do NOT mention your website or services unless it's PERFECTLY natural
6. Do NOT say "Great post!" or "Love this!" — add substance
7. Match the tone: if they're technical, be technical. If casual, be casual.
8. 0-1 emojis max
9. NO hashtags

The goal is to make people click your profile, not pitch them.

Reply:`;

    const { text } = await generateText({
        prompt,
        maxOutputTokens: 100,
        openaiModel: 'gpt-5.2',
        geminiModel: process.env.GEMINI_MODEL || 'gemini-3-pro-preview',
    });

    let reply = text.trim();
    if (reply.length > 280) reply = reply.substring(0, 277) + '...';
    return reply;
}

/**
 * Log engagement
 */
function logEngagement(tweet, reply) {
    const timestamp = new Date().toISOString();
    const dateStr = timestamp.split('T')[0];
    const logFile = path.join(LOGS_DIR, `${dateStr}.json`);

    let logs = [];
    if (fs.existsSync(logFile)) {
        try { logs = JSON.parse(fs.readFileSync(logFile, 'utf-8')); } catch { logs = []; }
    }

    logs.push({
        timestamp,
        tweetId: tweet.id,
        authorUsername: tweet.authorUsername,
        followers: tweet.followers,
        engagement: tweet.engagement,
        originalText: tweet.text.substring(0, 100),
        reply,
        source: tweet.query,
    });
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
}

/**
 * Main: find trending posts and engage
 */
export async function runOutboundEngagement(options = {}) {
    const {
        dryRun = false,
        limit = 8,
        dedupeTtlDays = 30,
        retryMaxAttempts = 3,
        retryBaseDelayMs = 2000,
    } = options;

    const normalizedLimit = normalizeLimit(limit, {
        defaultValue: 8,
        min: 1,
        max: 25,
    });

    console.log('');
    console.log('🎯 X Outbound Engagement Bot');
    console.log('═'.repeat(50));
    console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`   Max engagements: ${normalizedLimit}`);
    console.log('');

    assertRequiredEnv();
    const client = createClient();

    const retryOptions = {
        maxAttempts: retryMaxAttempts,
        baseDelayMs: retryBaseDelayMs,
    };

    const me = await runWithRetry('authenticate account', () => client.v2.me(), retryOptions);
    console.log(`✅ Authenticated as @${me.data.username}`);

    const engagedRecords = loadEngaged(dedupeTtlDays);
    const engagedIds = new Set(engagedRecords.map(record => record.id));

    console.log('');
    console.log('🔍 Searching for engagement targets...');
    const searchTargets = await findEngagementTargets(client, me.data.id, engagedIds, normalizedLimit, retryOptions);
    console.log(`   Found ${searchTargets.length} from search`);

    const accountTargets = await findTargetAccountTweets(
        client,
        me.data.id,
        engagedIds,
        Math.ceil(normalizedLimit / 2),
        retryOptions,
    );
    console.log(`   Found ${accountTargets.length} from target accounts`);

    const allTargets = [...accountTargets, ...searchTargets];
    const seen = new Set();
    const targets = allTargets.filter(t => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
    }).slice(0, normalizedLimit);

    console.log(`   📋 ${targets.length} total targets to engage`);

    let engageCount = 0;

    for (const tweet of targets) {
        console.log('');
        console.log(`   🎯 @${tweet.authorUsername} (${tweet.followers.toLocaleString()} followers, ${tweet.engagement} engagements)`);
        console.log(`      "${tweet.text.substring(0, 70)}..."`);

        let reply = null;
        try {
            reply = await generateEngagementReply(tweet);
        } catch (error) {
            console.error(`      ❌ Reply generation failed: ${error.message}`);
            continue;
        }

        if (!reply) {
            console.log('      ⚠️ Could not generate reply — skipping');
            continue;
        }

        console.log(`      💬 "${reply.substring(0, 70)}..."`);

        if (dryRun) {
            console.log('      🔒 DRY RUN — skipped');
        } else {
            try {
                const result = await runWithRetry(
                    `post reply to ${tweet.id}`,
                    () => client.v2.tweet({
                        text: reply,
                        reply: { in_reply_to_tweet_id: tweet.id },
                    }),
                    retryOptions,
                );

                console.log(`      ✅ Replied! Tweet ID: ${result.data.id}`);
                logEngagement(tweet, reply);

                const nowIso = new Date().toISOString();
                engagedRecords.push({ id: tweet.id, engagedAt: nowIso });
                engagedIds.add(tweet.id);
                engageCount += 1;
            } catch (error) {
                console.error(`      ❌ Failed after retries: ${error.message}`);
            }
        }

        await sleep(4000);
    }

    saveEngaged(engagedRecords, dedupeTtlDays);

    console.log('');
    console.log('═'.repeat(50));
    console.log(`✅ Done! Engaged with ${engageCount} post(s)`);

    return { success: true, engaged: engageCount };
}

export default { runOutboundEngagement };

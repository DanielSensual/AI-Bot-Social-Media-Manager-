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
const X_BRAIN_PATH = path.join(__dirname, '..', 'x-brain.md');
const MAX_ENGAGED_RECORDS = 5000;
const MAX_BACKOFF_MS = 20000;
const MIN_FOLLOWERS_FOR_ENGAGEMENT = 50000;
const MAX_TWEET_AGE_HOURS = 24;
const SEARCH_QUERIES_PER_RUN = 8;
const SEARCH_MAX_RESULTS = 25;
const TARGET_ACCOUNTS_PER_RUN = 8;

fs.mkdirSync(LOGS_DIR, { recursive: true });

/**
 * Load x-brain.md memory file for persona context
 */
function loadXBrain() {
    try {
        return fs.readFileSync(X_BRAIN_PATH, 'utf-8');
    } catch {
        return null;
    }
}

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
    'Seedance 2.0',
    'Moltbots',
    'AI video generation',
    'Gemini 3',
    'GPT-5',
    'Claude AI',
    'AI agents 2026',
];

/**
 * High-value accounts to monitor
 */
const TARGET_ACCOUNTS = [
    'GeminiApp',
    'OpenAI',
    'sama',
    'Maborja',
    'maborja',
    'GoogleDeepMind',
    'AnthropicAI',
    'huaborja',
    'huggingface',
    'xai',
    'elonmusk',
    'levelsio',
    'AndrewYNg',
    'garyvee',
    'dharmesh',
    'naval',
    'ylecun',
    'kaborja',
    'maborja',
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

function isRecentTweet(createdAt, maxAgeHours = MAX_TWEET_AGE_HOURS, now = Date.now()) {
    if (!createdAt) return false;
    const createdTs = Date.parse(createdAt);
    if (Number.isNaN(createdTs)) return false;
    const ageMs = Math.max(0, now - createdTs);
    return ageMs <= (maxAgeHours * 60 * 60 * 1000);
}

/**
 * Search for trending tweets to engage with
 */
async function findEngagementTargets(client, myUserId, engagedIds, limit = 15, retryOptions = {}) {
    const targets = [];

    const shuffled = [...TARGET_SEARCHES].sort(() => Math.random() - 0.5);

    for (const query of shuffled.slice(0, SEARCH_QUERIES_PER_RUN)) {
        const queryText = `${query} -is:retweet lang:en`;
        try {
            const results = await runWithRetry(
                `search query "${query}"`,
                () => client.v2.search(queryText, {
                    max_results: SEARCH_MAX_RESULTS,
                    'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'conversation_id'],
                    'user.fields': ['username', 'name', 'public_metrics'],
                    expansions: ['author_id'],
                    sort_order: 'recency',
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
                const text = String(tweet.text || '').trim();
                if (!text || text.startsWith('@') || /^RT @/i.test(text)) continue;

                const author = users[tweet.author_id];
                const followers = author?.public_metrics?.followers_count || 0;
                const metrics = tweet.public_metrics || {};
                const engagement = (metrics.like_count || 0) + (metrics.retweet_count || 0) + (metrics.reply_count || 0);
                const recentEnough = isRecentTweet(tweet.created_at);

                if (!recentEnough) continue;
                if (followers < MIN_FOLLOWERS_FOR_ENGAGEMENT) continue;
                if (engagement >= 5 || followers >= MIN_FOLLOWERS_FOR_ENGAGEMENT) {
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

    for (const username of shuffledAccounts.slice(0, TARGET_ACCOUNTS_PER_RUN)) {
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
                    max_results: 10,
                    'tweet.fields': ['created_at', 'public_metrics', 'text'],
                    exclude: ['retweets'],
                }),
                retryOptions,
            );

            for (const tweet of timeline?.data?.data || []) {
                if (engagedIds.has(tweet.id)) continue;
                if (tweet.author_id === myUserId) continue;
                if (!isRecentTweet(tweet.created_at)) continue;
                const text = String(tweet.text || '').trim();
                if (!text || text.startsWith('@') || /^RT @/i.test(text)) continue;

                const metrics = tweet.public_metrics || {};
                const engagement = (metrics.like_count || 0) + (metrics.retweet_count || 0);
                const followers = user.data.public_metrics?.followers_count || 0;
                if (followers < MIN_FOLLOWERS_FOR_ENGAGEMENT) continue;

                if (engagement >= 2) {
                    targets.push({
                        id: tweet.id,
                        text: tweet.text,
                        authorUsername: username,
                        authorName: user.data.name,
                        followers,
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

    const xBrain = loadXBrain();

    let prompt;
    if (xBrain) {
        // Extract just the voice + engagement sections to keep prompt focused
        prompt = `Here is your identity and engagement strategy:\n\n${xBrain}\n\n---\n\nYou're scrolling X and see this from @${tweet.authorUsername} (${tweet.followers.toLocaleString()} followers):\n"${tweet.text}"\n\nWrite a casual reply following ALL the engagement rules from your brain file. Be a real person in the conversation. Under 280 characters. Output ONLY the reply text.`;
    } else {
        // Fallback if x-brain.md is missing
        prompt = `You're a real person named Daniel who runs an AI agency. You're scrolling X and genuinely reacting to posts \u2014 not as a brand, just as a dude who's deep in AI and builds stuff.\n\nYou're replying to @${tweet.authorUsername} (${tweet.followers.toLocaleString()} followers):\n"${tweet.text}"\n\nWrite a casual reply like a real human would. Rules:\n1. Sound like you're texting a friend \u2014 lowercase fine, fragments fine\n2. Have an actual OPINION or ADD something\n3. No \"Great take!\", no \"This \ud83d\udd25\" \u2014 bot energy\n4. 0-1 emojis, NO hashtags, under 280 chars\n5. Don't mention your business\n\nReply:`;
    }

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

/**
 * X (Twitter) Mention Auto-Responder
 * AI-powered replies to mentions and replies on X
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hasLLMProvider, generateText } from './llm-client.js';
import { TwitterApi } from 'twitter-api-v2';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, '..', 'logs', 'twitter-replies');
const REPLIED_FILE = path.join(__dirname, '..', '.x-replied.json');

fs.mkdirSync(LOGS_DIR, { recursive: true });

const WEBSITE = 'https://ghostaisystems.com';

/**
 * Create authenticated Twitter client
 */
function createClient() {
    const client = new TwitterApi({
        appKey: process.env.X_CONSUMER_KEY,
        appSecret: process.env.X_CONSUMER_SECRET,
        accessToken: process.env.X_ACCESS_TOKEN,
        accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
    });
    return client;
}

/**
 * Load already-replied tweet IDs
 */
function loadReplied() {
    try {
        if (fs.existsSync(REPLIED_FILE)) {
            return new Set(JSON.parse(fs.readFileSync(REPLIED_FILE, 'utf-8')));
        }
    } catch { /* ignore */ }
    return new Set();
}

function saveReplied(repliedSet) {
    const arr = [...repliedSet].slice(-2000);
    fs.writeFileSync(REPLIED_FILE, JSON.stringify(arr, null, 2));
}

/**
 * Get recent mentions
 */
async function getRecentMentions(client, userId, sinceId) {
    try {
        const params = {
            max_results: 20,
            'tweet.fields': ['created_at', 'author_id', 'conversation_id', 'in_reply_to_user_id', 'text'],
            'user.fields': ['username', 'name'],
            expansions: ['author_id'],
        };

        if (sinceId) params.since_id = sinceId;

        const mentions = await client.v2.userMentionTimeline(userId, params);
        return mentions;
    } catch (error) {
        if (error.code === 429) {
            console.log('⚠️ Rate limited — will try again next cycle');
            return { data: { data: [] } };
        }
        throw error;
    }
}

/**
 * Generate AI reply to a mention
 */
async function generateMentionReply(mention, authorUsername) {
    if (!hasLLMProvider()) return `Thanks for the mention! Check out what we're building 👻 ${WEBSITE}`;

    const prompt = `You are replying to a tweet/mention on X (Twitter) on behalf of @GhostAISystems (Ghost AI Systems — an AI agency that ships production-ready websites in 72 hours with AI voice agents and automation).

TWEET FROM @${authorUsername}:
${mention.text}

Generate a witty, engaging reply:
1. Reference something specific from their tweet
2. Be sharp, conversational, and confident
3. 1-2 sentences max (stay under 280 chars)
4. Match the energy of the original tweet
5. If they're asking about AI or business — add value
6. If they're being negative — respond with confidence, not defensiveness
7. Occasionally mention ghostaisystems.com (not every reply)
8. DO NOT mention you are AI
9. Use 1 emoji max

Reply:`;

    const { text } = await generateText({
        prompt,
        maxOutputTokens: 100,
        openaiModel: 'gpt-5.2',
        geminiModel: process.env.GEMINI_MODEL || 'gemini-3-pro-preview',
    });

    // Trim to 280 chars for X
    let reply = text.trim();
    if (reply.length > 280) reply = reply.substring(0, 277) + '...';
    return reply;
}

/**
 * Log interaction
 */
function logInteraction(authorUsername, tweetText, reply, tweetId) {
    const timestamp = new Date().toISOString();
    const dateStr = timestamp.split('T')[0];
    const logFile = path.join(LOGS_DIR, `${dateStr}.json`);

    let logs = [];
    if (fs.existsSync(logFile)) {
        try { logs = JSON.parse(fs.readFileSync(logFile, 'utf-8')); } catch { logs = []; }
    }

    logs.push({ timestamp, tweetId, authorUsername, tweetText, reply });
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
}

/**
 * Main: check mentions and reply
 */
export async function respondToMentions(options = {}) {
    const { dryRun = false, limit = 10 } = options;

    console.log('');
    console.log('𝕏 Twitter Mention Auto-Responder');
    console.log('═'.repeat(50));
    console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`   Max replies: ${limit}`);
    console.log('');

    const client = createClient();

    // Get authenticated user
    const me = await client.v2.me();
    console.log(`✅ Authenticated as @${me.data.username} (${me.data.name})`);

    const replied = loadReplied();

    // Get recent mentions
    const mentionsTimeline = await getRecentMentions(client, me.data.id);
    const mentions = mentionsTimeline?.data?.data || [];

    if (mentions.length === 0) {
        console.log('📭 No new mentions found');
        return { success: true, replied: 0 };
    }

    // Build author lookup from expansions
    const users = {};
    if (mentionsTimeline?.data?.includes?.users) {
        for (const user of mentionsTimeline.data.includes.users) {
            users[user.id] = user;
        }
    }

    console.log(`📋 Found ${mentions.length} mention(s)`);

    let replyCount = 0;

    for (const mention of mentions) {
        if (replyCount >= limit) break;
        if (replied.has(mention.id)) continue;

        // Skip our own tweets
        if (mention.author_id === me.data.id) {
            replied.add(mention.id);
            continue;
        }

        const author = users[mention.author_id];
        const username = author?.username || 'unknown';

        console.log('');
        console.log(`   💬 @${username}: "${mention.text.substring(0, 60)}..."`);

        const reply = await generateMentionReply(mention, username);
        console.log(`   🤖 Reply: "${reply.substring(0, 60)}..."`);

        if (dryRun) {
            console.log('   🔒 DRY RUN — skipped');
        } else {
            try {
                const result = await client.v2.tweet({
                    text: reply,
                    reply: { in_reply_to_tweet_id: mention.id },
                });
                console.log(`   ✅ Replied! Tweet ID: ${result.data.id}`);
                logInteraction(username, mention.text, reply, mention.id);
                replied.add(mention.id);
                replyCount++;
            } catch (error) {
                console.error(`   ❌ Failed: ${error.message}`);
                // If rate limited, stop
                if (error.code === 429) {
                    console.log('   ⚠️ Rate limited — stopping');
                    break;
                }
            }
        }

        // Delay between replies to avoid rate limits
        await new Promise(r => setTimeout(r, 3000));
    }

    saveReplied(replied);

    console.log('');
    console.log('═'.repeat(50));
    console.log(`✅ Done! Replied to ${replyCount} mention(s)`);

    return { success: true, replied: replyCount };
}

export default { respondToMentions };

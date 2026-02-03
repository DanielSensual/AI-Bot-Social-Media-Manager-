/**
 * Tweet Scheduler - Cron-based posting system
 */

import cron from 'node-cron';
import { config } from './config.js';
import { postTweet } from './twitter-client.js';
import { generateTweet } from './content-library.js';

// Track posted content to avoid duplicates
const recentTweets = [];
const MAX_RECENT = 20;

/**
 * Post a scheduled tweet
 */
async function scheduledPost() {
    const isDryRun = process.env.DRY_RUN === 'true';

    console.log(`\n⏰ [${new Date().toLocaleString('en-US', { timeZone: config.schedule.timezone })}] Scheduled post triggered`);

    // Generate tweet content
    let attempts = 0;
    let tweet;

    do {
        tweet = generateTweet();
        attempts++;
    } while (recentTweets.includes(tweet.text) && attempts < 5);

    console.log(`📝 Pillar: ${tweet.pillar}`);
    console.log(`📊 Length: ${tweet.length}/280 chars`);
    console.log(`\n${tweet.text}\n`);

    if (isDryRun) {
        console.log('🔇 DRY RUN - Tweet not posted');
        return;
    }

    try {
        await postTweet(tweet.text);

        // Track to avoid duplicates
        recentTweets.push(tweet.text);
        if (recentTweets.length > MAX_RECENT) {
            recentTweets.shift();
        }
    } catch (error) {
        console.error('❌ Failed to post:', error.message);
        if (error.data) {
            console.error('API Error:', JSON.stringify(error.data, null, 2));
        }
    }
}

/**
 * Start the scheduler
 */
export function startScheduler() {
    if (!config.schedule.enabled) {
        console.log('⚠️ Scheduler is disabled in config');
        return;
    }

    const { times, timezone } = config.schedule;

    console.log('🚀 Starting GhostAI X Bot Scheduler');
    console.log(`⏰ Timezone: ${timezone}`);
    console.log(`📅 Posting at: ${times.join(', ')}`);
    console.log('');

    // Create cron jobs for each scheduled time
    times.forEach((time) => {
        const [hour, minute] = time.split(':');
        const cronExpression = `${minute} ${hour} * * *`;

        cron.schedule(cronExpression, scheduledPost, {
            timezone,
        });

        console.log(`  ✓ Scheduled: ${time} (${cronExpression})`);
    });

    console.log('\n👻 Bot is running. Press Ctrl+C to stop.\n');
}

/**
 * Post immediately (manual trigger)
 */
export async function postNow(customText = null) {
    if (customText) {
        console.log('📤 Posting custom tweet...');
        return postTweet(customText);
    }

    console.log('📤 Generating and posting tweet...');
    const tweet = generateTweet();
    console.log(`📝 Pillar: ${tweet.pillar}`);
    console.log(`📊 Length: ${tweet.length}/280 chars`);
    console.log(`\n${tweet.text}\n`);

    return postTweet(tweet.text);
}

export default { startScheduler, postNow };

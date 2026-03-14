/**
 * GhostAI X Bot - Main Entry Point
 */

import dotenv from 'dotenv';
import { startScheduler, postNow } from './scheduler.js';
import { testConnection, getMetrics } from './twitter-client.js';
import { generateTweet } from './content-library.js';
import { getStats, getRecent } from './post-history.js';
import { config } from './config.js';
import { log } from './logger.js';
import { formatTimestampInTimeZone } from './timezone.js';

dotenv.config();

const args = process.argv.slice(2);
const command = args[0];

// ── Graceful Shutdown ────────────────────────────────────────────────────────
export let shuttingDown = false;
const DRAIN_TIMEOUT_MS = 10_000;

function setupGracefulShutdown() {
    for (const signal of ['SIGTERM', 'SIGINT']) {
        process.on(signal, () => {
            if (shuttingDown) return;
            shuttingDown = true;
            log.warn(`Received ${signal}, draining...`, { signal, drain_ms: DRAIN_TIMEOUT_MS });
            // Give in-flight work time to finish
            setTimeout(() => {
                log.info('Drain timeout reached, exiting');
                process.exit(0);
            }, DRAIN_TIMEOUT_MS);
        });
    }
}

async function main() {
    setupGracefulShutdown();

    log.info('GhostAI Bot starting', { version: '3.0.0', command: command || 'scheduler' });

    console.log('');
    console.log('👻 ═══════════════════════════════════════');
    console.log('   G H O S T   A I   B O T   v3.0');
    console.log('   Autonomous Multi-Platform System');
    console.log('═══════════════════════════════════════════');
    console.log('');

    // Test connection first
    const connected = await testConnection();
    if (!connected) {
        log.error('Cannot connect to X API, check credentials');
        process.exit(1);
    }

    // Get current metrics
    const metrics = await getMetrics();
    console.log(`📊 Account: @${metrics.username}`);
    console.log(`👥 Followers: ${metrics.followers} | Following: ${metrics.following}`);
    console.log(`📝 Total tweets: ${metrics.tweets}`);

    // Post history stats
    const stats = getStats();
    console.log(`📈 Post history: ${stats.totalPosts} total | ${stats.postsToday} today`);
    if (stats.lastPost) {
        console.log(`🕐 Last post: ${formatTimestampInTimeZone(stats.lastPost.timestamp, config.schedule.timezone)}`);
    }
    console.log('');

    // Handle commands
    switch (command) {
        case '--dry-run':
            process.env.DRY_RUN = 'true';
            log.info('DRY RUN MODE — no tweets will be posted');
            startScheduler();
            break;

        case '--post':
            // Post immediately
            const customText = args.slice(1).join(' ');
            await postNow(customText || null);
            break;

        case '--preview':
            // Preview without posting
            console.log('👁️ PREVIEW MODE - Generating sample tweets:\n');
            for (let i = 0; i < 5; i++) {
                const tweet = generateTweet();
                console.log(`[${tweet.pillar.toUpperCase()}] (${tweet.length} chars)`);
                console.log(tweet.text);
                console.log('\n---\n');
            }
            // Show recent history
            const recent = getRecent(5);
            if (recent.length > 0) {
                console.log('\n📜 Recent Post History:');
                for (const post of recent) {
                    const ts = formatTimestampInTimeZone(post.timestamp, config.schedule.timezone);
                    console.log(`  [${ts}] ${post.aiGenerated ? '🧠' : '📝'} ${post.hasVideo ? '🎬' : ''} ${post.text?.substring(0, 50)}...`);
                }
            }
            break;

        case '--help':
            console.log('Usage: npm start [options]\n');
            console.log('Options:');
            console.log('  (none)      Start the scheduler');
            console.log('  --dry-run   Start scheduler without posting');
            console.log('  --post      Post a tweet immediately');
            console.log('  --preview   Preview 5 sample tweets');
            console.log('  --help      Show this help message');
            break;

        default:
            // Start the scheduler
            startScheduler();
    }
}

main().catch((error) => {
    log.error('Fatal error', { error: error.message, stack: error.stack });
    process.exit(1);
});

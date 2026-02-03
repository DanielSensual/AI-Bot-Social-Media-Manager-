/**
 * GhostAI X Bot - Main Entry Point
 */

import dotenv from 'dotenv';
import { startScheduler, postNow } from './scheduler.js';
import { testConnection, getMetrics } from './twitter-client.js';
import { generateTweet } from './content-library.js';

dotenv.config();

const args = process.argv.slice(2);
const command = args[0];

async function main() {
    console.log('');
    console.log('👻 ═══════════════════════════════════════');
    console.log('   G H O S T   A I   X   B O T');
    console.log('   Autonomous Twitter Posting System');
    console.log('═══════════════════════════════════════════');
    console.log('');

    // Test connection first
    const connected = await testConnection();
    if (!connected) {
        console.error('❌ Cannot connect to X API. Check credentials.');
        process.exit(1);
    }

    // Get current metrics
    const metrics = await getMetrics();
    console.log(`📊 Account: @${metrics.username}`);
    console.log(`👥 Followers: ${metrics.followers} | Following: ${metrics.following}`);
    console.log(`📝 Total tweets: ${metrics.tweets}`);
    console.log('');

    // Handle commands
    switch (command) {
        case '--dry-run':
            process.env.DRY_RUN = 'true';
            console.log('🔇 DRY RUN MODE - No tweets will be posted\n');
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

            // Keep process running
            process.on('SIGINT', () => {
                console.log('\n\n👋 GhostAI Bot shutting down gracefully...');
                process.exit(0);
            });
    }
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});

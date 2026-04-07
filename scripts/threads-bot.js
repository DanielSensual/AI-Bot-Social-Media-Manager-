#!/usr/bin/env node
/**
 * Threads Bot Runner
 * 
 * Usage:
 *   node scripts/threads-bot.js              # Full run (all 3 modes, LIVE)
 *   node scripts/threads-bot.js --dry-run    # Preview without posting
 *   node scripts/threads-bot.js --once       # Single run then exit
 *   node scripts/threads-bot.js --post-only  # Only post new threads
 *   node scripts/threads-bot.js --troll-only # Only self-troll
 *   node scripts/threads-bot.js --category=controversial  # Force category
 * 
 * Env vars:
 *   THREADS_ACCESS_TOKEN — Long-lived Threads user access token
 *   THREADS_USER_ID      — Your Threads numeric user ID
 */

import dotenv from 'dotenv';
import { runThreadsBot } from '../src/threads-engagement.js';

dotenv.config();

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const once = args.includes('--once');
const postOnly = args.includes('--post-only');
const trollOnly = args.includes('--troll-only');
const engageOnly = args.includes('--engage-only');

const categoryFlag = args.find(a => a.startsWith('--category='));
const category = categoryFlag ? categoryFlag.split('=')[1] : null;

// Determine active modes
let modes = ['self_troll', 'proactive', 'engage'];
if (postOnly) modes = ['proactive'];
if (trollOnly) modes = ['self_troll'];
if (engageOnly) modes = ['engage'];

async function main() {
    console.log('🧵 DanielSensual Threads Bot');
    console.log(`   Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
    
    if (!process.env.THREADS_ACCESS_TOKEN || !process.env.THREADS_USER_ID) {
        console.error('');
        console.error('❌ Missing required env vars:');
        if (!process.env.THREADS_ACCESS_TOKEN) console.error('   - THREADS_ACCESS_TOKEN');
        if (!process.env.THREADS_USER_ID) console.error('   - THREADS_USER_ID');
        console.error('');
        console.error('To get these:');
        console.error('1. Create a Meta Developer App at developers.facebook.com');
        console.error('2. Add the "Threads" product');
        console.error('3. Request threads_content_publish + threads_basic permissions');
        console.error('4. Generate a long-lived access token');
        console.error('5. Your user ID is in the /me endpoint response');
        process.exit(1);
    }

    const result = await runThreadsBot({
        dryRun,
        modes,
        selfTrollLimit: 2,
        proactiveCount: postOnly ? 3 : 1,
        engageLimit: 3,
        proactiveCategory: category,
    });

    if (!result.success) {
        console.error(`\n❌ Bot failed: ${result.error}`);
        process.exit(1);
    }
}

if (once || !args.includes('--loop')) {
    main().catch(err => {
        console.error(`Fatal: ${err.message}`);
        process.exit(1);
    });
} else {
    // Loop mode: run every 2-4 hours with jitter
    async function loop() {
        while (true) {
            await main().catch(err => {
                console.error(`Run failed: ${err.message}`);
            });

            const baseInterval = 2.5 * 60 * 60 * 1000; // 2.5 hours
            const jitter = Math.random() * 60 * 60 * 1000; // 0-60min jitter
            const nextMs = baseInterval + jitter;
            const nextMin = Math.round(nextMs / 60000);
            
            console.log(`\n⏰ Next run in ~${nextMin} minutes`);
            await new Promise(r => setTimeout(r, nextMs));
        }
    }
    loop();
}

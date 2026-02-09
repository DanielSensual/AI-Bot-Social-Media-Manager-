#!/usr/bin/env node
/**
 * Facebook page success pack
 * Publishes a strategic sequence of posts to warm up page engagement.
 *
 * Usage:
 *   node scripts/facebook-success-pack.js --dry-run
 *   node scripts/facebook-success-pack.js --count=3
 *   node scripts/facebook-success-pack.js --count=5 --interval=120
 */

import dotenv from 'dotenv';
import { testFacebookConnection, postToFacebook } from '../src/facebook-client.js';

dotenv.config();

const args = process.argv.slice(2);
const flags = {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    help: args.includes('--help') || args.includes('-h'),
};

const countArg = args.find((a) => a.startsWith('--count='))?.split('=')[1]
    || (args.includes('--count') ? args[args.indexOf('--count') + 1] : '3');
const intervalArg = args.find((a) => a.startsWith('--interval='))?.split('=')[1]
    || (args.includes('--interval') ? args[args.indexOf('--interval') + 1] : '0');

function showHelp() {
    console.log('');
    console.log('Facebook Success Pack');
    console.log('='.repeat(50));
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/facebook-success-pack.js --count=3');
    console.log('  node scripts/facebook-success-pack.js --count=5 --interval=120');
    console.log('');
    console.log('Options:');
    console.log('  --count <1-5>         Number of posts to publish (default: 3)');
    console.log('  --interval <seconds>  Delay between posts (default: 0)');
    console.log('  --dry-run, -d         Preview only; do not publish');
    console.log('  --help, -h            Show help');
    console.log('');
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSuccessPosts() {
    return [
        `🚀 Welcome to Artificial Intelligence Knowledge

This page is built for founders, creators, and business owners who want practical AI wins.

What you’ll get here:
• Simple AI workflows you can use today
• Tools that save real time and money
• Proven prompts for content, sales, and ops

If you want weekly tactical AI breakdowns, follow the page and turn on notifications.`,

        `⚡ 3 AI automations you can set up this week:

1) Lead follow-up bot
Instantly replies to inbound leads and books calls.

2) Content repurposing workflow
Turn 1 long video into 10+ short posts.

3) FAQ assistant
Answers common customer questions 24/7.

Pick one and execute it this week. Consistency beats complexity.`,

        `📈 Most businesses don’t have an AI problem.
They have an execution problem.

The winning approach:
• Start with 1 repetitive task
• Automate it end-to-end
• Measure time saved + revenue impact
• Repeat

Small systems, deployed fast, outperform big ideas left unfinished.`,

        `🎯 If your website isn’t converting, add this AI stack:

• Smart lead capture form
• AI call/chat assistant
• Automated follow-up sequence
• Conversion analytics dashboard

Your site should be a sales system, not a digital brochure.

Want a checklist version? Comment "STACK" and I’ll post it.`,

        `🧠 Quick community check:

What’s the ONE area you want AI to handle better right now?

• Lead generation
• Content creation
• Customer support
• Admin/operations

Drop your answer below and I’ll share a practical workflow for the top response.`,
    ];
}

async function main() {
    if (flags.help) {
        showHelp();
        process.exit(0);
    }

    const count = Number(countArg);
    const intervalSeconds = Number(intervalArg);

    if (!Number.isInteger(count) || count < 1 || count > 5) {
        console.error('Error: --count must be an integer between 1 and 5.');
        process.exit(1);
    }

    if (!Number.isFinite(intervalSeconds) || intervalSeconds < 0) {
        console.error('Error: --interval must be a non-negative number.');
        process.exit(1);
    }

    const connection = await testFacebookConnection();
    if (!connection || connection.type === 'user_no_pages') {
        console.error('Error: Facebook page access is not ready.');
        process.exit(1);
    }

    const posts = getSuccessPosts().slice(0, count);

    console.log('');
    console.log('Success Pack Preview');
    console.log('-'.repeat(50));
    console.log(`Posts: ${count}`);
    console.log(`Interval: ${intervalSeconds}s`);
    console.log(`Mode: ${flags.dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log('-'.repeat(50));
    console.log('');

    posts.forEach((text, idx) => {
        console.log(`[${idx + 1}/${count}]`);
        console.log(text);
        console.log('');
    });

    if (flags.dryRun) {
        console.log('DRY RUN: no posts published.');
        process.exit(0);
    }

    const results = [];

    for (let i = 0; i < posts.length; i++) {
        const text = posts[i];
        try {
            console.log(`📤 Publishing post ${i + 1}/${posts.length}...`);
            const result = await postToFacebook(text);
            results.push(result.id || null);
        } catch (error) {
            console.error(`❌ Failed on post ${i + 1}: ${error.message}`);
            results.push(null);
        }

        if (intervalSeconds > 0 && i < posts.length - 1) {
            console.log(`⏳ Waiting ${intervalSeconds}s before next post...`);
            await sleep(intervalSeconds * 1000);
        }
    }

    console.log('');
    console.log('Result Summary');
    console.log('-'.repeat(50));
    results.forEach((postId, idx) => {
        if (postId) {
            console.log(`✅ Post ${idx + 1}: ${postId}`);
        } else {
            console.log(`❌ Post ${idx + 1}: failed`);
        }
    });
    console.log('-'.repeat(50));
}

main().catch((error) => {
    console.error(`Fatal: ${error.message}`);
    process.exit(1);
});

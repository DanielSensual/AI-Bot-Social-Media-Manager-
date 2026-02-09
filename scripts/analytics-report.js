#!/usr/bin/env node
/**
 * Analytics Report CLI
 * Pull engagement metrics and generate digests
 */

import dotenv from 'dotenv';
import { getWeeklyDigest, getTodayStats, saveDigest } from '../src/analytics.js';

dotenv.config();

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
    console.log(`
📊 Ghost AI Analytics Report
══════════════════════════════

Usage:
  node analytics-report.js [options]

Options:
  --today               Show today's posting stats
  --week                Show weekly digest with engagement metrics
  --save                Save digest to logs/analytics/
  --help, -h            Show this help

Examples:
  node scripts/analytics-report.js --today
  node scripts/analytics-report.js --week --save
`);
    process.exit(0);
}

async function main() {
    console.log('');
    console.log('📊 Ghost AI Analytics');
    console.log('═'.repeat(50));
    console.log('');

    if (args.includes('--today') || (!args.includes('--week') && args.length === 0)) {
        const today = await getTodayStats();
        console.log(`📅 Today (${today.date})`);
        console.log('─'.repeat(30));
        console.log(`   Total posts: ${today.totalPosts}`);
        console.log(`   X: ${today.byPlatform.x} | LinkedIn: ${today.byPlatform.linkedin} | Facebook: ${today.byPlatform.facebook} | Instagram: ${today.byPlatform.instagram}`);
        console.log(`   AI-generated: ${today.aiGenerated} | With video: ${today.withVideo}`);
        console.log('');
    }

    if (args.includes('--week')) {
        console.log('🔄 Fetching weekly engagement data (this may take a moment)...\n');
        const digest = await getWeeklyDigest();

        console.log('📅 Weekly Digest');
        console.log('─'.repeat(30));
        console.log(`   Period: ${digest.period.start.split('T')[0]} → ${digest.period.end.split('T')[0]}`);
        console.log(`   Total posts: ${digest.totalPosts}`);
        console.log('');
        console.log('   Platform breakdown:');
        console.log(`     X: ${digest.byPlatform.x} | LinkedIn: ${digest.byPlatform.linkedin}`);
        console.log(`     Facebook: ${digest.byPlatform.facebook} | Instagram: ${digest.byPlatform.instagram}`);
        console.log('');
        console.log('   Content mix:');
        console.log(`     AI: ${digest.bySource.ai} | Template: ${digest.bySource.template} | Video: ${digest.withVideo}`);

        if (digest.topPosts.length > 0) {
            console.log('');
            console.log('   🏆 Top Posts:');
            for (const post of digest.topPosts.slice(0, 5)) {
                const eng = (post.like_count || post.likes || 0) + (post.retweet_count || post.shares || 0);
                console.log(`     [${post.platform}] ${eng} engagements — "${post.text}..."`);
            }
        }

        if (args.includes('--save')) {
            saveDigest(digest);
        }

        console.log('');
    }

    console.log('═'.repeat(50));
}

main().catch(error => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
});

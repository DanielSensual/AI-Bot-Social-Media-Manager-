#!/usr/bin/env node
/**
 * Bachata Exotica daily posting runner.
 *
 * Usage:
 *   node scripts/bachata-daily-post.js
 *   node scripts/bachata-daily-post.js --dry-run
 *   node scripts/bachata-daily-post.js --image=./path/to/flyer.jpg
 *   node scripts/bachata-daily-post.js --video=./path/to/reel.mp4
 *   node scripts/bachata-daily-post.js --caption="Custom post copy"
 */

import dotenv from 'dotenv';
import { runBachataDailyPost } from '../src/bachata-daily-agent.js';

dotenv.config();

const args = process.argv.slice(2);

function getFlagValue(name) {
    const prefix = `--${name}=`;
    const arg = args.find((value) => value.startsWith(prefix));
    return arg ? arg.slice(prefix.length).trim() : '';
}

const flags = {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    help: args.includes('--help') || args.includes('-h'),
    pageId: getFlagValue('page-id') || process.env.BACHATA_PAGE_ID || '266552527115323',
    caption: getFlagValue('caption') || getFlagValue('text') || '',
    imagePath: getFlagValue('image') || '',
    videoPath: getFlagValue('video') || '',
};

function showHelp() {
    console.log('');
    console.log('Bachata Exotica Daily Facebook Post');
    console.log('='.repeat(58));
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/bachata-daily-post.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --page-id=ID          Target Facebook Page ID (default: 266552527115323)');
    console.log('  --caption="text"      Optional custom caption');
    console.log('  --image=/path/file    Optional image override');
    console.log('  --video=/path/file    Optional video override');
    console.log('  --dry-run, -d         Preview the selected post, do not publish');
    console.log('  --help, -h            Show this help');
    console.log('');
    console.log('Fallback order when no media is provided:');
    console.log('  1) current flyer from event config');
    console.log('  2) bachata history post');
    console.log('  3) Daniel Sensual song post');
    console.log('');
}

async function main() {
    if (flags.help) {
        showHelp();
        process.exit(0);
    }

    if (flags.imagePath && flags.videoPath) {
        console.error('❌ Use either --image or --video, not both.');
        process.exit(1);
    }

    const result = await runBachataDailyPost({
        dryRun: flags.dryRun,
        pageId: flags.pageId,
        caption: flags.caption,
        imagePath: flags.imagePath || null,
        videoPath: flags.videoPath || null,
    });

    if (result.dryRun) {
        console.log('DRY RUN complete. No post was published.');
        process.exit(0);
    }

    console.log(`✅ Posted successfully (${result.selectedType})`);
    if (result.postId) {
        console.log(`Post ID: ${result.postId}`);
    }
}

main().catch((error) => {
    console.error(`❌ Bachata daily post failed: ${error.message}`);
    process.exit(1);
});

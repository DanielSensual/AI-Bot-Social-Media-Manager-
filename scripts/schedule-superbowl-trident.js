#!/usr/bin/env node
/**
 * Schedule one Super Bowl campaign post to X + LinkedIn + Facebook.
 *
 * Usage:
 *   node scripts/schedule-superbowl-trident.js --delay=30
 *   node scripts/schedule-superbowl-trident.js --delay=30 --dry-run
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { testConnection, postTweetWithVideo } from '../src/twitter-client.js';
import { testLinkedInConnection, postToLinkedInWithVideo } from '../src/linkedin-client.js';
import { testFacebookConnection, postToFacebookWithVideo } from '../src/facebook-client.js';
import { generateVideo, cleanupCache } from '../src/video-generator.js';

dotenv.config();

const args = process.argv.slice(2);
const flags = {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    help: args.includes('--help') || args.includes('-h'),
};

const delayArg = args.find((a) => a.startsWith('--delay='))?.split('=')[1]
    || (args.includes('--delay') ? args[args.indexOf('--delay') + 1] : '30');

function showHelp() {
    console.log('');
    console.log('Schedule Super Bowl Trident Post');
    console.log('='.repeat(50));
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/schedule-superbowl-trident.js --delay=30');
    console.log('  node scripts/schedule-superbowl-trident.js --delay=30 --dry-run');
    console.log('');
    console.log('Options:');
    console.log('  --delay <minutes>     Minutes to wait before posting (default: 30)');
    console.log('  --dry-run, -d         Preview only; do not post');
    console.log('  --help, -h            Show help');
    console.log('');
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function formatTargetTime(delayMs) {
    const target = new Date(Date.now() + delayMs);
    return target.toLocaleString('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        month: 'short',
        day: '2-digit',
        year: 'numeric',
    });
}

async function main() {
    if (flags.help) {
        showHelp();
        process.exit(0);
    }

    const delayMinutes = Number.parseInt(String(delayArg), 10);
    if (!Number.isInteger(delayMinutes) || delayMinutes < 0) {
        console.error('Error: --delay must be a non-negative integer (minutes).');
        process.exit(1);
    }

    const delayMs = delayMinutes * 60 * 1000;
    const targetLabel = formatTargetTime(delayMs);

    const xText = `Super Bowl Sunday is where attention gets won or lost.

Big brands pay millions for 30 seconds.
Small teams can still win with AI speed and story.

Who takes it tonight? 🏈⚡ #SuperBowl`;

    const longCaption = `Super Bowl Sunday is the biggest attention market in the world.

Teams fight for rings.
Brands fight for mindshare.

In 2026, AI lets small teams move at Super Bowl speed.

Who are you picking tonight?`;

    const videoPrompt = `Cinematic 16:9 Super Bowl atmosphere at night: packed stadium energy, dramatic lights sweeping across crowd, football spiral in slow motion, high-intensity cuts showing attention spikes and social momentum, bold contrast, trailer pacing, no logos or text.`;

    console.log('');
    console.log('Super Bowl Trident Schedule');
    console.log('-'.repeat(50));
    console.log(`Delay:   ${delayMinutes} minute(s)`);
    console.log(`Post at: ${targetLabel} (America/New_York)`);
    console.log(`Mode:    ${flags.dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log('-'.repeat(50));
    console.log('');

    // Quick preflight checks before waiting
    const [xOk, linkedinOk, fbInfo] = await Promise.all([
        testConnection().catch(() => false),
        testLinkedInConnection().catch(() => false),
        testFacebookConnection().catch(() => false),
    ]);
    const fbOk = Boolean(fbInfo && fbInfo.type !== 'user_no_pages');

    if (!xOk || !linkedinOk || !fbOk) {
        console.error('Preflight failed: one or more platform connections are not ready.');
        console.error(`X: ${xOk ? 'ok' : 'failed'} | LinkedIn: ${linkedinOk ? 'ok' : 'failed'} | Facebook: ${fbOk ? 'ok' : 'failed'}`);
        process.exit(1);
    }

    console.log('Preflight checks passed for X + LinkedIn + Facebook.');

    if (flags.dryRun) {
        console.log('\nDRY RUN preview content (X):');
        console.log(xText);
        console.log('\nDRY RUN preview content (LinkedIn/Facebook):');
        console.log(longCaption);
        process.exit(0);
    }

    console.log(`\nWaiting ${delayMinutes} minute(s) before posting...`);
    await sleep(delayMs);

    cleanupCache();
    console.log('\nGenerating campaign video...');
    const generatedVideo = await generateVideo(videoPrompt, {
        aspectRatio: '16:9',
        duration: 5,
        maxRetries: 3,
        retryDelay: 6000,
    });

    const campaignsDir = path.join(process.cwd(), 'assets', 'campaigns', 'superbowl');
    ensureDir(campaignsDir);
    const finalVideoPath = path.join(campaignsDir, `superbowl-${Date.now()}.mp4`);
    fs.copyFileSync(generatedVideo, finalVideoPath);

    console.log(`Video ready: ${finalVideoPath}`);
    console.log('\nPublishing to X + LinkedIn + Facebook...');

    const results = {
        x: null,
        linkedin: null,
        facebook: null,
    };

    try {
        results.x = await postTweetWithVideo(xText, finalVideoPath);
    } catch (error) {
        console.error(`X failed: ${error.message}`);
    }

    try {
        results.linkedin = await postToLinkedInWithVideo(longCaption, finalVideoPath);
    } catch (error) {
        console.error(`LinkedIn failed: ${error.message}`);
    }

    try {
        results.facebook = await postToFacebookWithVideo(longCaption, finalVideoPath);
    } catch (error) {
        console.error(`Facebook failed: ${error.message}`);
    }

    console.log('\nResult Summary');
    console.log('-'.repeat(50));
    if (results.x?.id) console.log(`X: https://x.com/i/status/${results.x.id}`);
    else console.log('X: failed');

    if (results.linkedin?.id) console.log(`LinkedIn: ${results.linkedin.id}`);
    else console.log('LinkedIn: failed');

    if (results.facebook?.id) console.log(`Facebook video id: ${results.facebook.id}`);
    else console.log('Facebook: failed');
    console.log('-'.repeat(50));

    if (!results.x && !results.linkedin && !results.facebook) {
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(`Fatal: ${error.message}`);
    process.exit(1);
});

#!/usr/bin/env node
/**
 * GhostAI / Artificial Intelligence Knowledge - Instagram Post CLI
 */

import dotenv from 'dotenv';
import path from 'path';
import { testInstagramConnection, postToInstagram, postInstagramReel, uploadToTempHost } from '../../src/instagram-client.js';
import { generateAITweet } from '../../src/content-library.js';
import { generateVideo, cleanupCache } from '../../src/video-generator.js';

dotenv.config();

const config = {
    type: 'facebook_page',
    token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN,
    pageId: process.env.FACEBOOK_PAGE_ID
};

const args = process.argv.slice(2);
const flags = {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    ai: args.includes('--ai') || args.includes('-a'),
    reel: args.includes('--reel') || args.includes('-r'),
    video: args.includes('--video') || args.includes('-v'),
    image: args.find(a => a.startsWith('--image='))?.split('=')[1],
    imageUrl: args.find(a => a.startsWith('--image-url='))?.split('=')[1],
    help: args.includes('--help') || args.includes('-h'),
};

const customText = args.filter(a => !a.startsWith('-')).join(' ').trim();

if (flags.help) {
    console.log('Usage: node post-instagram-now.js [caption] [options]');
    process.exit(0);
}

async function main() {
    console.log('📸 GhostAI Instagram Post');
    console.log(`   Mode: ${flags.dryRun ? 'DRY RUN' : 'LIVE'}`);

    const connection = await testInstagramConnection(config);
    if (!connection) process.exit(1);

    let caption = customText || (flags.ai ? (await generateAITweet({ controversial: false })).text : null);
    if (!caption) throw new Error('Provide a caption');

    console.log(`📝 Caption: ${caption.substring(0, 80)}...`);

    if (flags.video || flags.reel) {
        let videoUrl;
        if (flags.video) {
            cleanupCache();
            const videoPath = await generateVideo(caption, { aspectRatio: '9:16', duration: 5 });
            videoUrl = await uploadToTempHost(videoPath);
        }
        if (flags.dryRun) return console.log('🔒 DRY RUN - Would post Reel');
        await postInstagramReel(caption, videoUrl, config);
        return;
    }

    let imageUrl = flags.imageUrl || (flags.image ? await uploadToTempHost(flags.image) : null);
    if (!imageUrl) throw new Error('Instagram requires media');

    if (flags.dryRun) return console.log('🔒 DRY RUN - Would post image');
    await postToInstagram(caption, imageUrl, config);
}

main().catch(console.error);

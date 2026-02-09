#!/usr/bin/env node
/**
 * Instagram Post CLI
 * One-off posting to Instagram via IG Content Publishing API
 */

import dotenv from 'dotenv';
import path from 'path';
import { testInstagramConnection, postToInstagram, postInstagramReel, postInstagramCarousel, uploadToTempHost } from '../src/instagram-client.js';
import { generateAITweet } from '../src/content-library.js';
import { generateVideo, cleanupCache } from '../src/video-generator.js';

dotenv.config();

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
    console.log(`
📸 Instagram Post CLI
═══════════════════════════

Usage:
  node post-instagram-now.js [caption] [options]

Content:
  --ai, -a              Generate AI caption
  "your text here"      Custom caption text

Media (required — IG requires image or video):
  --image=/path/to/file   Local image (auto-uploaded to temp host)
  --image-url=URL         Publicly accessible image URL
  --reel, -r              Post as Reel (requires video)
  --video, -v             Generate AI video and post as Reel

Other:
  --dry-run, -d           Preview without posting
  --help, -h              Show this help

Examples:
  node scripts/post-instagram-now.js "Check this out!" --image=./photo.jpg
  node scripts/post-instagram-now.js --ai --image-url=https://example.com/photo.jpg
  node scripts/post-instagram-now.js --ai --video
`);
    process.exit(0);
}

async function main() {
    console.log('');
    console.log('📸 Instagram Post');
    console.log('═'.repeat(40));
    console.log(`   Mode: ${flags.dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log('');

    // Test connection
    const connection = await testInstagramConnection();
    if (!connection) {
        console.error('❌ Instagram not connected. Check your Facebook token and linked IG account.');
        process.exit(1);
    }

    // Generate caption
    let caption;
    if (flags.ai) {
        console.log('🧠 Generating AI caption...');
        const content = await generateAITweet({ controversial: false });
        caption = content.text;
    } else if (customText) {
        caption = customText;
    } else {
        console.error('❌ Provide a caption (text or --ai flag)');
        process.exit(1);
    }

    console.log(`📝 Caption: ${caption.substring(0, 80)}...`);

    // Handle video/reel
    if (flags.video || flags.reel) {
        let videoUrl;

        if (flags.video) {
            console.log('🎬 Generating AI video...');
            cleanupCache();
            const videoPath = await generateVideo(caption, {
                aspectRatio: '9:16',
                duration: 5,
            });
            console.log('📤 Uploading video to temp host...');
            videoUrl = await uploadToTempHost(videoPath);
        }

        if (flags.dryRun) {
            console.log('');
            console.log('🔒 DRY RUN - Would post Reel');
            console.log(`   Caption: ${caption}`);
            if (videoUrl) console.log(`   Video URL: ${videoUrl}`);
            process.exit(0);
        }

        const result = await postInstagramReel(caption, videoUrl);
        console.log(`✅ Reel posted! ID: ${result.id}`);
        return;
    }

    // Handle image
    let imageUrl = flags.imageUrl;

    if (flags.image) {
        console.log('📤 Uploading image to temp host...');
        imageUrl = await uploadToTempHost(flags.image);
    }

    if (!imageUrl) {
        console.error('❌ Instagram requires media. Use --image, --image-url, or --video');
        process.exit(1);
    }

    if (flags.dryRun) {
        console.log('');
        console.log('🔒 DRY RUN - Would post image');
        console.log(`   Caption: ${caption}`);
        console.log(`   Image URL: ${imageUrl}`);
        process.exit(0);
    }

    const result = await postToInstagram(caption, imageUrl);
    console.log(`✅ Instagram post published! ID: ${result.id}`);
}

main().catch(error => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
});

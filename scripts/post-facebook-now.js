#!/usr/bin/env node
/**
 * Facebook-only post script
 *
 * Usage:
 *   node scripts/post-facebook-now.js "Your post text"
 *   node scripts/post-facebook-now.js --generate
 *   node scripts/post-facebook-now.js --ai
 *   node scripts/post-facebook-now.js "Post text" --image=./path/to/image.png
 *   node scripts/post-facebook-now.js "Post text" --video=./path/to/video.mp4
 *   node scripts/post-facebook-now.js --ai --dry-run
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import {
    testFacebookConnection,
    postToFacebook,
    postToFacebookWithImage,
    postToFacebookWithVideo,
} from '../src/facebook-client.js';
import { generateTweet, generateAITweet } from '../src/content-library.js';

dotenv.config();

const args = process.argv.slice(2);
const flags = {
    generate: args.includes('--generate') || args.includes('-g'),
    ai: args.includes('--ai') || args.includes('-a'),
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    help: args.includes('--help') || args.includes('-h'),
    image: args.find((a) => a.startsWith('--image='))?.split('=')[1] || null,
    video: args.find((a) => a.startsWith('--video='))?.split('=')[1] || null,
};

const content = args.filter((a) => !a.startsWith('-')).join(' ').trim();

function showHelp() {
    console.log('');
    console.log('Facebook Post Now');
    console.log('='.repeat(50));
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/post-facebook-now.js [content] [options]');
    console.log('');
    console.log('Content options (choose one):');
    console.log('  "Your text here"      Custom post text');
    console.log('  --generate, -g        Generate template-based content');
    console.log('  --ai, -a              Generate AI content');
    console.log('');
    console.log('Media options (optional, choose at most one):');
    console.log('  --image=/path/file    Attach image');
    console.log('  --video=/path/file    Attach video');
    console.log('');
    console.log('Other options:');
    console.log('  --dry-run, -d         Preview only; do not post');
    console.log('  --help, -h            Show help');
    console.log('');
}

function resolveMediaPath(rawPath, kind) {
    if (!rawPath) return null;
    const resolved = path.resolve(rawPath);
    if (!fs.existsSync(resolved)) {
        throw new Error(`${kind} file not found: ${resolved}`);
    }
    return resolved;
}

function normalizeCliText(text) {
    // Allow passing escaped newlines in shell args: "Line 1\nLine 2"
    return text.replace(/\\n/g, '\n');
}

async function buildPostText() {
    const selectedSources = [Boolean(content), flags.generate, flags.ai].filter(Boolean).length;
    if (selectedSources !== 1) {
        throw new Error('Choose exactly one content source: text, --generate, or --ai');
    }

    if (content) {
        return { text: normalizeCliText(content), source: 'custom' };
    }

    if (flags.ai) {
        const generated = await generateAITweet({ controversial: true });
        return { text: generated.text, source: `ai:${generated.pillar}` };
    }

    const generated = generateTweet();
    return { text: generated.text, source: `template:${generated.pillar}` };
}

async function main() {
    if (flags.help) {
        showHelp();
        process.exit(0);
    }

    if (flags.image && flags.video) {
        console.error('Error: use either --image or --video, not both.');
        process.exit(1);
    }

    let imagePath;
    let videoPath;
    try {
        imagePath = resolveMediaPath(flags.image, 'Image');
        videoPath = resolveMediaPath(flags.video, 'Video');
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }

    let post;
    try {
        post = await buildPostText();
    } catch (error) {
        console.error(`Error: ${error.message}`);
        showHelp();
        process.exit(1);
    }

    const fbConnection = await testFacebookConnection();
    if (!fbConnection || fbConnection.type === 'user_no_pages') {
        console.error('Error: Facebook page access is not ready. Check token permissions.');
        process.exit(1);
    }

    console.log('');
    console.log('Facebook Post Preview');
    console.log('-'.repeat(50));
    console.log(post.text);
    console.log('-'.repeat(50));
    console.log(`Length: ${post.text.length}`);
    console.log(`Source: ${post.source}`);
    if (imagePath) console.log(`Media: image (${path.basename(imagePath)})`);
    if (videoPath) console.log(`Media: video (${path.basename(videoPath)})`);
    console.log('');

    if (flags.dryRun) {
        console.log('DRY RUN: no post sent.');
        process.exit(0);
    }

    try {
        let result;
        if (videoPath) {
            result = await postToFacebookWithVideo(post.text, videoPath);
        } else if (imagePath) {
            result = await postToFacebookWithImage(post.text, imagePath);
        } else {
            result = await postToFacebook(post.text);
        }

        const postId = result.post_id || result.id;
        console.log(`Success: posted to Facebook. Post ID: ${postId}`);
    } catch (error) {
        console.error(`Error: Facebook post failed: ${error.message}`);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(`Fatal: ${error.message}`);
    process.exit(1);
});

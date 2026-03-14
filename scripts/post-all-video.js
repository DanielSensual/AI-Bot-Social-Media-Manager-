#!/usr/bin/env node
/**
 * Post one local video to all configured platforms (X, LinkedIn, Facebook, Instagram).
 *
 * Usage:
 *   node scripts/post-all-video.js --video-file=/abs/path/video.mp4 --caption-file=/abs/path/caption.txt
 *   node scripts/post-all-video.js --video-file=/abs/path/video.mp4 "Caption text"
 *   node scripts/post-all-video.js --video-file=/abs/path/video.mp4 --caption-file=/abs/path/caption.txt --dry-run
 *   node scripts/post-all-video.js --video-file=/abs/path/video.mp4 --main-caption="Long caption..." --x-caption="Short X caption..."
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { postTweetWithVideo, testConnection } from '../src/twitter-client.js';
import { postToLinkedInWithVideo, testLinkedInConnection } from '../src/linkedin-client.js';
import { postToFacebookWithVideo, testFacebookConnection } from '../src/facebook-client.js';
import { postInstagramReel, testInstagramConnection, uploadToTempHost } from '../src/instagram-client.js';

dotenv.config();

function getFlagValue(args, key) {
    const inline = args.find(arg => arg.startsWith(`${key}=`));
    if (inline) return inline.slice(key.length + 1);
    const idx = args.indexOf(key);
    if (idx === -1) return null;
    const next = args[idx + 1];
    if (!next || next.startsWith('-')) return null;
    return next;
}

function parseArgs(argv) {
    const dryRun = argv.includes('--dry-run') || argv.includes('-d');
    const videoFile = getFlagValue(argv, '--video-file');
    const captionFile = getFlagValue(argv, '--caption-file');
    const mainCaptionFile = getFlagValue(argv, '--main-caption-file');
    const xCaptionFile = getFlagValue(argv, '--x-caption-file');
    const mainCaptionInline = getFlagValue(argv, '--main-caption');
    const xCaptionInline = getFlagValue(argv, '--x-caption');

    const positional = [];
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--dry-run' || arg === '-d') continue;
        if (arg.startsWith('--video-file=')) continue;
        if (arg.startsWith('--caption-file=')) continue;
        if (arg.startsWith('--main-caption=')) continue;
        if (arg.startsWith('--x-caption=')) continue;
        if (arg.startsWith('--main-caption-file=')) continue;
        if (arg.startsWith('--x-caption-file=')) continue;
        if (
            (arg === '--video-file'
                || arg === '--caption-file'
                || arg === '--main-caption'
                || arg === '--x-caption'
                || arg === '--main-caption-file'
                || arg === '--x-caption-file')
            && i + 1 < argv.length
        ) {
            i += 1;
            continue;
        }
        if (arg.startsWith('-')) continue;
        positional.push(arg);
    }

    return {
        dryRun,
        videoFile,
        captionFile,
        mainCaptionFile,
        xCaptionFile,
        mainCaptionInline,
        xCaptionInline,
        captionInline: positional.join(' ').trim(),
    };
}

function readCaptionFromFile(filePath) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
        throw new Error(`Caption file not found: ${resolved}`);
    }
    const text = fs.readFileSync(resolved, 'utf-8').trim();
    if (!text) throw new Error('Caption file is empty');
    return text;
}

function resolveCaptions(args) {
    const legacyCaption = args.captionFile
        ? readCaptionFromFile(args.captionFile)
        : args.captionInline;

    const mainCaption = args.mainCaptionFile
        ? readCaptionFromFile(args.mainCaptionFile)
        : (args.mainCaptionInline || legacyCaption || '').trim();

    if (!mainCaption) {
        throw new Error('Caption is required. Provide --caption-file, --main-caption-file, --main-caption, or inline text.');
    }

    const xCaption = args.xCaptionFile
        ? readCaptionFromFile(args.xCaptionFile)
        : (args.xCaptionInline || mainCaption).trim();

    if (!xCaption) {
        throw new Error('X caption is empty after parsing.');
    }

    return { mainCaption, xCaption };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (!args.videoFile) {
        throw new Error('Missing required --video-file');
    }

    const videoPath = path.resolve(args.videoFile);
    if (!fs.existsSync(videoPath)) {
        throw new Error(`Video file not found: ${videoPath}`);
    }

    const { mainCaption, xCaption } = resolveCaptions(args);

    if (xCaption.length > 280) {
        throw new Error(`X caption is ${xCaption.length} chars. Keep under 280.`);
    }
    if (mainCaption.length > 2200) {
        throw new Error(`Main caption is ${mainCaption.length} chars. Keep under 2200 for Instagram.`);
    }

    console.log('');
    console.log('🎬 All-Platform Video Post');
    console.log('═'.repeat(50));
    console.log(`Mode: ${args.dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`Video: ${videoPath}`);
    console.log(`Main caption length: ${mainCaption.length}`);
    console.log(`X caption length: ${xCaption.length}`);
    console.log('');

    const connections = {
        x: await testConnection().catch(() => false),
        linkedin: await testLinkedInConnection().catch(() => false),
        facebook: await testFacebookConnection().catch(() => false),
        instagram: await testInstagramConnection().catch(() => false),
    };

    console.log('');
    console.log('Connectivity:');
    console.log(`  X: ${connections.x ? 'ready' : 'unavailable'}`);
    console.log(`  LinkedIn: ${connections.linkedin ? 'ready' : 'unavailable'}`);
    console.log(`  Facebook: ${connections.facebook ? 'ready' : 'unavailable'}`);
    console.log(`  Instagram: ${connections.instagram ? 'ready' : 'unavailable'}`);

    if (args.dryRun) {
        console.log('');
        console.log('Dry-run complete. No posts were sent.');
        return;
    }

    const results = {
        x: null,
        linkedin: null,
        facebook: null,
        instagram: null,
    };

    if (connections.x) {
        try {
            results.x = await postTweetWithVideo(xCaption, videoPath);
        } catch (error) {
            results.x = { error: error.message };
        }
    } else {
        results.x = { skipped: 'connection unavailable' };
    }

    if (connections.linkedin) {
        try {
            results.linkedin = await postToLinkedInWithVideo(mainCaption, videoPath);
        } catch (error) {
            results.linkedin = { error: error.message };
        }
    } else {
        results.linkedin = { skipped: 'connection unavailable' };
    }

    if (connections.facebook) {
        try {
            results.facebook = await postToFacebookWithVideo(mainCaption, videoPath);
        } catch (error) {
            results.facebook = { error: error.message };
        }
    } else {
        results.facebook = { skipped: 'connection unavailable' };
    }

    if (connections.instagram) {
        try {
            const videoUrl = await uploadToTempHost(videoPath);
            results.instagram = await postInstagramReel(mainCaption, videoUrl);
        } catch (error) {
            results.instagram = { error: error.message };
        }
    } else {
        results.instagram = { skipped: 'connection unavailable' };
    }

    console.log('');
    console.log('Results:');
    console.log(`  X: ${results.x?.id ? `posted (${results.x.id})` : results.x?.error ? `failed (${results.x.error})` : `skipped (${results.x?.skipped || 'unknown'})`}`);
    console.log(`  LinkedIn: ${results.linkedin?.id ? `posted (${results.linkedin.id})` : results.linkedin?.error ? `failed (${results.linkedin.error})` : `skipped (${results.linkedin?.skipped || 'unknown'})`}`);
    console.log(`  Facebook: ${results.facebook?.id || results.facebook?.post_id ? `posted (${results.facebook.post_id || results.facebook.id})` : results.facebook?.error ? `failed (${results.facebook.error})` : `skipped (${results.facebook?.skipped || 'unknown'})`}`);
    console.log(`  Instagram: ${results.instagram?.id ? `posted (${results.instagram.id})` : results.instagram?.error ? `failed (${results.instagram.error})` : `skipped (${results.instagram?.skipped || 'unknown'})`}`);

    const failed = ['x', 'linkedin', 'facebook', 'instagram'].some((key) => results[key]?.error);
    if (failed) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(`❌ Fatal: ${error.message}`);
    process.exit(1);
});

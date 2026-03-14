#!/usr/bin/env node
/**
 * Generate a video using OpenAI Sora 2
 *
 * Usage:
 *   node scripts/generate-sora-video.js --prompt "Your prompt" [--model sora-2] [--seconds 8] [--size 720x1280]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function parseArgs(argv) {
    let prompt = null;
    let model = 'sora-2';
    let seconds = '8';
    let size = '720x1280';
    let tag = 'sora2';

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith('--prompt=')) { prompt = arg.slice('--prompt='.length); continue; }
        if (arg === '--prompt') { prompt = argv[++i]; continue; }
        if (arg.startsWith('--model=')) { model = arg.slice('--model='.length); continue; }
        if (arg === '--model') { model = argv[++i]; continue; }
        if (arg.startsWith('--seconds=')) { seconds = arg.slice('--seconds='.length); continue; }
        if (arg === '--seconds') { seconds = argv[++i]; continue; }
        if (arg.startsWith('--size=')) { size = arg.slice('--size='.length); continue; }
        if (arg === '--size') { size = argv[++i]; continue; }
        if (arg.startsWith('--tag=')) { tag = arg.slice('--tag='.length); continue; }
        if (arg === '--tag') { tag = argv[++i]; continue; }
    }

    return { prompt, model, seconds, size, tag };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (!args.prompt) {
        console.log('Usage: node scripts/generate-sora-video.js --prompt "Your prompt"');
        console.log('       [--model sora-2|sora-2-pro]');
        console.log('       [--seconds 4|8|12]');
        console.log('       [--size 720x1280|1280x720|1024x1792|1792x1024]');
        console.log('       [--tag label]');
        process.exit(1);
    }

    const videosDir = path.resolve(__dirname, '..', 'assets', 'videos');
    if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    const baseName = `${args.tag}-${ts}`;

    console.log('');
    console.log('🎬 Sora 2 Video Generation');
    console.log('═'.repeat(50));
    console.log(`Model:    ${args.model}`);
    console.log(`Size:     ${args.size}`);
    console.log(`Duration: ${args.seconds}s`);
    console.log(`Prompt:   ${args.prompt.substring(0, 100)}...`);
    console.log('');

    // Step 1: Create video job
    console.log('⏳ Submitting video generation job...');
    const job = await openai.videos.create({
        prompt: args.prompt,
        model: args.model,
        seconds: args.seconds,
        size: args.size,
    });
    console.log(`✅ Job created: ${job.id}`);
    console.log(`   Status: ${job.status}`);

    // Save initial job metadata
    const jobFile = path.join(videosDir, `${baseName}-job.json`);
    fs.writeFileSync(jobFile, JSON.stringify({ create: job }, null, 2));

    // Step 2: Poll until complete
    console.log('');
    console.log('⏳ Waiting for video generation...');
    let current = job;
    const startTime = Date.now();
    const maxWaitMs = 10 * 60 * 1000; // 10 minutes

    while (current.status !== 'completed' && current.status !== 'failed') {
        if (Date.now() - startTime > maxWaitMs) {
            throw new Error('Video generation timed out after 10 minutes');
        }

        await new Promise(r => setTimeout(r, 5000));
        current = await openai.videos.retrieve(job.id);

        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`   [${elapsed}s] Status: ${current.status} | Progress: ${current.progress}%`);
    }

    if (current.status === 'failed') {
        console.error('❌ Video generation failed:', current.error);
        fs.writeFileSync(jobFile, JSON.stringify({ create: job, final: current }, null, 2));
        process.exit(1);
    }

    // Save final job metadata
    fs.writeFileSync(jobFile, JSON.stringify({ create: job, final: current }, null, 2));
    console.log('');
    console.log('✅ Video generation complete!');

    // Step 3: Download the video
    console.log('📥 Downloading video...');
    const videoResponse = await openai.videos.downloadContent(job.id);
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    const videoFile = path.join(videosDir, `${baseName}.mp4`);
    fs.writeFileSync(videoFile, videoBuffer);

    const sizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(2);
    console.log(`✅ Video saved: ${videoFile} (${sizeMB} MB)`);

    // Step 4: Download thumbnail
    try {
        console.log('📥 Downloading thumbnail...');
        const thumbResponse = await openai.videos.downloadContent(job.id, { variant: 'thumbnail' });
        const thumbBuffer = Buffer.from(await thumbResponse.arrayBuffer());
        const thumbFile = path.join(videosDir, `${baseName}-thumb.jpg`);
        fs.writeFileSync(thumbFile, thumbBuffer);
        console.log(`✅ Thumbnail saved: ${thumbFile}`);
    } catch {
        console.log('   ⚠️  Thumbnail download skipped (not available)');
    }

    console.log('');
    console.log('═'.repeat(50));
    console.log(`🎉 Done! Video: ${videoFile}`);
    console.log(`   Job metadata: ${jobFile}`);
}

main().catch((error) => {
    console.error(`❌ Fatal: ${error.message}`);
    process.exit(1);
});

#!/usr/bin/env node
/**
 * Generate a Grok image, animate it to video, and post to X.
 *
 * Usage:
 *   node scripts/post-grok-times-square-x.js
 *   node scripts/post-grok-times-square-x.js --dry-run
 *   node scripts/post-grok-times-square-x.js --hook "Stop scrolling..."
 *   node scripts/post-grok-times-square-x.js --caption "Custom caption"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { generateVideoFromImage } from '../src/video-generator.js';
import { postTweetWithVideo, testConnection } from '../src/twitter-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'assets', 'videos');

dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });

const XAI_API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY || '';
const GROK_IMAGE_MODEL = process.env.GROK_IMAGE_MODEL || '';
const GROK_IMAGE_FALLBACK_MODELS = [
    'grok-imagine-image',
    'grok-imagine-image-pro',
    'grok-2-image-1212',
    'grok-2-image',
];
const execFileAsync = promisify(execFile);
const openaiClient = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

const DEFAULT_HOOK = 'Stop scrolling. If your brand still looks like 2023, you are already behind.';
const DEFAULT_IMAGE_PROMPT = [
    'Photorealistic cinematic portrait of an adult woman in her mid-20s,',
    'beautiful American look, wearing an elegant red dress,',
    'standing in the middle of Times Square at night, neon signs and traffic bokeh,',
    'confident expression, natural skin texture, shallow depth of field,',
    '35mm lens style, high detail, realistic lighting, no text, no watermark.',
].join(' ');

function createUsageError(message) {
    const err = new Error(message);
    err.code = 'ERR_USAGE';
    return err;
}

function parseFlagValue(argv, index, flagName) {
    const value = argv[index + 1];
    if (!value || value.startsWith('-')) {
        throw createUsageError(`Missing value for ${flagName}.`);
    }
    return value;
}

export function parseArgs(argv = []) {
    const parsed = {
        dryRun: false,
        hook: DEFAULT_HOOK,
        caption: '',
        imagePrompt: DEFAULT_IMAGE_PROMPT,
        aspectRatio: '9:16',
        duration: 12,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];

        if (arg === '--dry-run' || arg === '-d') {
            parsed.dryRun = true;
            continue;
        }

        if (arg.startsWith('--hook=')) {
            parsed.hook = arg.slice('--hook='.length).trim();
            continue;
        }

        if (arg === '--hook') {
            parsed.hook = parseFlagValue(argv, i, '--hook').trim();
            i += 1;
            continue;
        }

        if (arg.startsWith('--caption=')) {
            parsed.caption = arg.slice('--caption='.length).trim();
            continue;
        }

        if (arg === '--caption') {
            parsed.caption = parseFlagValue(argv, i, '--caption').trim();
            i += 1;
            continue;
        }

        if (arg.startsWith('--image-prompt=')) {
            parsed.imagePrompt = arg.slice('--image-prompt='.length).trim();
            continue;
        }

        if (arg === '--image-prompt') {
            parsed.imagePrompt = parseFlagValue(argv, i, '--image-prompt').trim();
            i += 1;
            continue;
        }

        if (arg.startsWith('--aspect-ratio=')) {
            parsed.aspectRatio = arg.slice('--aspect-ratio='.length).trim();
            continue;
        }

        if (arg === '--aspect-ratio') {
            parsed.aspectRatio = parseFlagValue(argv, i, '--aspect-ratio').trim();
            i += 1;
            continue;
        }

        if (arg.startsWith('--duration=')) {
            const value = Number.parseInt(arg.slice('--duration='.length), 10);
            if (Number.isNaN(value)) {
                throw createUsageError('Invalid --duration value. Expected integer seconds.');
            }
            parsed.duration = value;
            continue;
        }

        if (arg === '--duration') {
            const raw = parseFlagValue(argv, i, '--duration');
            const value = Number.parseInt(raw, 10);
            if (Number.isNaN(value)) {
                throw createUsageError('Invalid --duration value. Expected integer seconds.');
            }
            parsed.duration = value;
            i += 1;
            continue;
        }

        throw createUsageError(`Unknown argument: ${arg}`);
    }

    if (!parsed.hook) throw createUsageError('Hook cannot be empty.');
    if (!parsed.imagePrompt) throw createUsageError('Image prompt cannot be empty.');
    if (!parsed.aspectRatio) throw createUsageError('Aspect ratio cannot be empty.');
    if (!Number.isInteger(parsed.duration) || parsed.duration < 3 || parsed.duration > 20) {
        throw createUsageError('Duration must be an integer between 3 and 20 seconds.');
    }

    return parsed;
}

function buildVideoPrompt(hook) {
    return [
        'Animate this exact woman from the image with realistic motion in Times Square.',
        'She faces camera, subtle head movement and natural blinking.',
        `She speaks directly to camera with this line: "${hook}"`,
        'Camera does a slight push-in, cinematic lighting, realistic, premium ad style.',
        'No subtitles or on-screen text.',
    ].join(' ');
}

function buildCaption(hook, customCaption = '') {
    if (customCaption) return normalizeCaption(customCaption);

    return normalizeCaption(
        `Times Square stopped. Your audience should too. ${hook} Built with AI visual workflows by @Ghostaisystems.`,
    );
}

function normalizeCaption(text) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) throw new Error('Caption is empty.');
    if (clean.length <= 280) return clean;
    return `${clean.slice(0, 277).trim()}...`;
}

function timestampTag() {
    return new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getImageModelCandidates() {
    const candidates = [
        ...String(GROK_IMAGE_MODEL || '')
            .split(',')
            .map(v => v.trim())
            .filter(Boolean),
        ...GROK_IMAGE_FALLBACK_MODELS,
    ];

    const seen = new Set();
    const ordered = [];
    for (const model of candidates) {
        if (seen.has(model)) continue;
        seen.add(model);
        ordered.push(model);
    }
    return ordered;
}

function pickImageData(data = {}) {
    const item = Array.isArray(data.data) ? data.data[0] : null;
    if (!item) throw new Error('Grok image API returned no image payload.');

    const base64 = item.b64_json || item.base64 || item.image_base64 || null;
    const url = item.url || item.image_url || null;

    return { base64, url };
}

async function generateGrokImage(imagePrompt, tag) {
    if (!XAI_API_KEY) {
        throw new Error('XAI_API_KEY / GROK_API_KEY is required.');
    }

    console.log('🎨 Generating Grok image...');
    const models = getImageModelCandidates();
    console.log(`   Models: ${models.join(', ')}`);

    const maxAttempts = 3;
    const baseDelayMs = 3000;
    let data = null;
    let lastError = null;

    for (const model of models) {
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const response = await fetch('https://api.x.ai/v1/images/generations', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${XAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model,
                    prompt: imagePrompt,
                    n: 1,
                }),
            });

            data = await response.json().catch(() => ({}));
            if (response.ok) {
                console.log(`   ✅ Image model selected: ${model}`);
                break;
            }

            const msg = data?.error?.message || JSON.stringify(data);
            lastError = new Error(`Grok image generation failed (${response.status}) on ${model}: ${msg}`);
            const retryable = response.status === 429 || response.status >= 500;
            if (!retryable || attempt >= maxAttempts) {
                break;
            }

            const delayMs = baseDelayMs * attempt;
            console.log(`   ⚠️ ${model} attempt ${attempt}/${maxAttempts} failed (${response.status}). Retrying in ${Math.round(delayMs / 1000)}s...`);
            await sleep(delayMs);
        }

        if (data?.data?.[0]) {
            break;
        }
    }

    if (!data || !data?.data?.[0]) {
        throw lastError || new Error('Grok image generation returned empty response.');
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const imagePath = path.join(OUTPUT_DIR, `${tag}-source.png`);
    const { base64, url } = pickImageData(data);

    if (base64) {
        fs.writeFileSync(imagePath, Buffer.from(base64, 'base64'));
    } else if (url) {
        const imageRes = await fetch(url);
        if (!imageRes.ok) throw new Error(`Failed to download generated image: ${imageRes.status}`);
        const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
        fs.writeFileSync(imagePath, imageBuffer);
    } else {
        throw new Error('Grok image generation returned neither base64 nor URL.');
    }

    console.log(`✅ Image saved: ${imagePath}`);
    return imagePath;
}

async function exportVideo720(inputVideoPath, tag) {
    const outputPath = path.join(OUTPUT_DIR, `${tag}-720x1280.mp4`);

    console.log('');
    console.log('🎞️ Exporting 720x1280 delivery file...');

    const ffmpegArgs = [
        '-y',
        '-i',
        inputVideoPath,
        '-vf',
        'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2',
        '-map',
        '0:v:0',
        '-map',
        '0:a?',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-preset',
        'medium',
        '-crf',
        '20',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        outputPath,
    ];

    try {
        await execFileAsync('ffmpeg', ffmpegArgs, { maxBuffer: 20 * 1024 * 1024 });
    } catch (error) {
        const stderr = error?.stderr ? ` | ${String(error.stderr).split('\n').slice(-6).join(' ')}` : '';
        throw new Error(`ffmpeg 720 export failed${stderr}`);
    }

    if (!fs.existsSync(outputPath)) {
        throw new Error('ffmpeg did not produce a 720 output file.');
    }

    console.log(`✅ 720 file ready: ${outputPath}`);
    return outputPath;
}

async function generateVoiceover(hook, tag) {
    const voicePath = path.join(OUTPUT_DIR, `${tag}-voice.mp3`);

    if (openaiClient) {
        try {
            console.log('🗣️ Generating voiceover...');
            const ttsModel = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
            const ttsVoice = process.env.OPENAI_TTS_VOICE || 'alloy';

            const response = await openaiClient.audio.speech.create({
                model: ttsModel,
                voice: ttsVoice,
                input: hook,
                format: 'mp3',
            });

            const buffer = Buffer.from(await response.arrayBuffer());
            fs.writeFileSync(voicePath, buffer);
            console.log(`✅ Voiceover saved: ${voicePath}`);
            return voicePath;
        } catch (error) {
            console.warn(`⚠️ OpenAI TTS failed: ${error.message}`);
        }
    }

    const fallbackPath = path.join(OUTPUT_DIR, `${tag}-voice.aiff`);
    try {
        console.log('🗣️ Generating voiceover with macOS `say` fallback...');
        const voice = process.env.MAC_TTS_VOICE || 'Samantha';
        await execFileAsync('say', [
            '-v',
            voice,
            '-o',
            fallbackPath,
            hook,
        ]);

        if (fs.existsSync(fallbackPath)) {
            console.log(`✅ Voiceover saved: ${fallbackPath}`);
            return fallbackPath;
        }
    } catch (error) {
        console.warn(`⚠️ macOS say fallback failed: ${error.message}`);
    }

    throw new Error('Voiceover generation failed (OpenAI TTS unavailable and macOS `say` fallback failed).');
}

async function renderFallbackAnimation(imagePath, voicePath, duration, tag) {
    const outputPath = path.join(OUTPUT_DIR, `${tag}-animated.mp4`);

    console.log('🎞️ Rendering fallback animation from image...');
    const filter = [
        '[0:v]scale=720:1280:force_original_aspect_ratio=increase,',
        'crop=720:1280,',
        "zoompan=z='min(zoom+0.0008,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=720x1280:fps=30,",
        'format=yuv420p[v]',
    ].join('');

    const ffmpegArgs = [
        '-y',
        '-loop',
        '1',
        '-i',
        imagePath,
        '-stream_loop',
        '-1',
        '-i',
        voicePath,
        '-filter_complex',
        filter,
        '-map',
        '[v]',
        '-map',
        '1:a:0',
        '-t',
        String(duration),
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '20',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        outputPath,
    ];

    try {
        await execFileAsync('ffmpeg', ffmpegArgs, { maxBuffer: 20 * 1024 * 1024 });
    } catch (error) {
        const stderr = error?.stderr ? ` | ${String(error.stderr).split('\n').slice(-8).join(' ')}` : '';
        throw new Error(`Fallback animation render failed${stderr}`);
    }

    if (!fs.existsSync(outputPath)) {
        throw new Error('Fallback animation file missing after ffmpeg render.');
    }

    console.log(`✅ Fallback animation ready: ${outputPath}`);
    return outputPath;
}

export async function runCampaign(options = {}) {
    const {
        dryRun = false,
        hook = DEFAULT_HOOK,
        caption = '',
        imagePrompt = DEFAULT_IMAGE_PROMPT,
        aspectRatio = '9:16',
        duration = 12,
    } = options;

    const finalCaption = buildCaption(hook, caption);
    const videoPrompt = buildVideoPrompt(hook);
    const tag = `grok-times-square-${timestampTag()}`;

    console.log('');
    console.log('🚀 Grok Image-to-Video X Post');
    console.log('═'.repeat(50));
    console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`Hook: ${hook}`);
    console.log(`Caption (${finalCaption.length}/280): ${finalCaption}`);
    console.log('');

    if (!dryRun) {
        const connected = await testConnection();
        if (!connected) {
            throw new Error('X connection failed. Check credentials in .env.');
        }
    }

    const imagePath = await generateGrokImage(imagePrompt, tag);

    console.log('');
    console.log('🎬 Animating image with Grok video...');
    let rawVideoPath;
    try {
        rawVideoPath = await generateVideoFromImage(imagePath, videoPrompt, {
            provider: 'grok',
            aspectRatio,
            duration,
            maxRetries: 3,
        });
    } catch (error) {
        console.warn(`⚠️ Grok image-to-video unavailable: ${error.message}`);
        const voicePath = await generateVoiceover(hook, tag);
        rawVideoPath = await renderFallbackAnimation(imagePath, voicePath, duration, tag);
    }

    const videoPath = await exportVideo720(rawVideoPath, tag);

    console.log('');
    console.log(`✅ Video ready: ${videoPath}`);

    if (dryRun) {
        console.log('🔒 DRY RUN - Skipping X post');
        return {
            dryRun: true,
            imagePath,
            videoPath,
            caption: finalCaption,
            tweetId: null,
            url: null,
        };
    }

    console.log('');
    console.log('📤 Posting to X...');
    const tweet = await postTweetWithVideo(finalCaption, videoPath);
    const url = `https://x.com/i/status/${tweet.id}`;
    console.log(`✅ Posted: ${url}`);

    return {
        dryRun: false,
        imagePath,
        videoPath,
        caption: finalCaption,
        tweetId: tweet.id,
        url,
    };
}

async function main() {
    let parsed;
    try {
        parsed = parseArgs(process.argv.slice(2));
    } catch (error) {
        console.error(`❌ ${error.message}`);
        process.exit(1);
    }

    try {
        await runCampaign(parsed);
    } catch (error) {
        console.error(`❌ Fatal: ${error.message}`);
        process.exit(1);
    }
}

const isDirectRun = Boolean(process.argv[1])
    && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
    main();
}

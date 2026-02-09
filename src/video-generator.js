/**
 * Unified Video Generator (Veo + Grok)
 * Provider order is controlled by VIDEO_PROVIDER (auto|veo|grok).
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', '.video-cache');

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const VEO_MODEL = process.env.VEO_MODEL || 'veo-3.1-generate-preview';
const VEO_API_KEY = process.env.VEO_API_KEY || process.env.GEMINI_API_KEY || '';

const XAI_BASE_URL = 'https://api.x.ai/v1';
const XAI_API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY || '';
const GROK_VIDEO_MODEL = process.env.GROK_VIDEO_MODEL || 'grok-imagine-video';

if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMimeType(filepath) {
    const ext = path.extname(filepath).toLowerCase();
    const mimes = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
    };
    return mimes[ext] || 'image/png';
}

function toBase64(filepath) {
    return fs.readFileSync(filepath).toString('base64');
}

function sanitizeId(value) {
    return String(value || '')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 80) || `${Date.now()}`;
}

function buildError(prefix, status, data) {
    const details = data?.error?.message
        || data?.message
        || (typeof data === 'string' ? data : JSON.stringify(data || {}));
    return `${prefix}: ${status}${details ? ` - ${details}` : ''}`;
}

function normalizePrompt(prompt) {
    const normalized = String(prompt || '').trim();
    if (!normalized) {
        throw new Error('Video prompt is required');
    }
    return normalized;
}

function normalizeImagePath(imagePath) {
    const resolved = path.resolve(imagePath);
    if (!fs.existsSync(resolved)) {
        throw new Error(`Image not found: ${resolved}`);
    }
    return resolved;
}

function getProviderOrder(requestedProvider = 'auto') {
    const mode = String(requestedProvider || process.env.VIDEO_PROVIDER || 'auto').toLowerCase();
    if (mode === 'veo') return ['veo'];
    if (mode === 'grok') return ['grok'];
    return ['veo', 'grok'];
}

async function downloadVideoToCache(videoUrl, generationId) {
    const filename = `video_${sanitizeId(generationId)}_${Date.now()}.mp4`;
    const filepath = path.join(CACHE_DIR, filename);

    console.log('\n📥 Downloading video...');

    const response = await fetch(videoUrl, {
        method: 'GET',
        headers: {
            ...(VEO_API_KEY ? { 'x-goog-api-key': VEO_API_KEY } : {}),
        },
        redirect: 'follow',
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(buildError('Video download failed', response.status, errorBody));
    }

    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(arrayBuffer));

    return filepath;
}

function buildVeoParameters(options = {}) {
    const params = {};

    const aspectRatio = String(options.aspectRatio || process.env.VEO_ASPECT_RATIO || '9:16').trim();
    if (aspectRatio) params.aspectRatio = aspectRatio;

    const resolution = String(options.resolution || process.env.VEO_RESOLUTION || '720p').trim();
    if (resolution) params.resolution = resolution;

    const enhancePrompt = options.enhancePrompt ?? process.env.VEO_ENHANCE_PROMPT;
    if (enhancePrompt != null && String(enhancePrompt) !== '') {
        params.enhancePrompt = ['1', 'true', 'yes', 'on'].includes(String(enhancePrompt).toLowerCase());
    }

    if (options.negativePrompt) {
        params.negativePrompt = String(options.negativePrompt);
    }

    return params;
}

async function startVeoGeneration({ prompt, imagePath = null, options = {} }) {
    if (!VEO_API_KEY) {
        throw new Error('VEO_API_KEY or GEMINI_API_KEY is not configured');
    }

    const model = String(options.model || VEO_MODEL).trim();
    if (!model) {
        throw new Error('VEO model is not configured');
    }

    const instance = { prompt: normalizePrompt(prompt) };
    if (imagePath) {
        const resolvedImagePath = normalizeImagePath(imagePath);
        instance.image = {
            inlineData: {
                mimeType: getMimeType(resolvedImagePath),
                data: toBase64(resolvedImagePath),
            },
        };
    }

    const endpoint = `${GEMINI_BASE_URL}/models/${encodeURIComponent(model)}:predictLongRunning?key=${encodeURIComponent(VEO_API_KEY)}`;
    const payload = {
        instances: [instance],
        parameters: buildVeoParameters(options),
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(buildError('Veo request failed', response.status, data));
    }

    const operationName = data?.name;
    if (!operationName) {
        throw new Error('Veo API did not return an operation name');
    }

    return operationName;
}

async function fetchVeoOperation(operationName) {
    const normalized = String(operationName || '').replace(/^\/+/, '');
    const endpoint = `${GEMINI_BASE_URL}/${normalized}?key=${encodeURIComponent(VEO_API_KEY)}`;
    const response = await fetch(endpoint, { method: 'GET' });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(buildError('Veo operation poll failed', response.status, data));
    }

    return data;
}

function extractVeoVideoUri(operationData) {
    const primary = operationData?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    if (primary) return primary;

    const fallbackA = operationData?.response?.generatedVideos?.[0]?.video?.uri;
    if (fallbackA) return fallbackA;

    const fallbackB = operationData?.response?.generate_video_response?.generated_samples?.[0]?.video?.uri;
    if (fallbackB) return fallbackB;

    return null;
}

async function pollVeoVideoUri(operationName, maxWaitMs = 12 * 60 * 1000, pollIntervalMs = 10000) {
    const start = Date.now();
    let dots = 0;

    while (Date.now() - start < maxWaitMs) {
        const operation = await fetchVeoOperation(operationName);
        const elapsed = Math.round((Date.now() - start) / 1000);

        if (operation?.done) {
            if (operation?.error) {
                throw new Error(operation.error.message || JSON.stringify(operation.error));
            }

            const videoUri = extractVeoVideoUri(operation);
            if (!videoUri) {
                throw new Error('Veo operation completed but no video URI was returned');
            }

            process.stdout.write(`\r   Status: completed ${'.'.repeat(4)} (${elapsed}s)\n`);
            return videoUri;
        }

        dots = (dots + 1) % 4;
        process.stdout.write(`\r   Status: processing ${'.'.repeat(dots + 1).padEnd(4)} (${elapsed}s)`);
        await sleep(pollIntervalMs);
    }

    throw new Error('Veo generation timed out');
}

async function generateWithVeo(prompt, options = {}, imagePath = null) {
    if (!VEO_API_KEY) {
        throw new Error('VEO_API_KEY or GEMINI_API_KEY not configured in .env');
    }

    const {
        maxRetries = 2,
        retryDelay = 8000,
        maxWaitMs = Number.parseInt(String(process.env.VEO_MAX_WAIT_MS || ''), 10) || 12 * 60 * 1000,
        pollIntervalMs = Number.parseInt(String(process.env.VEO_POLL_INTERVAL_MS || ''), 10) || 10000,
    } = options;

    if (options.duration != null) {
        console.log('   ℹ️ Veo 3.1 duration is model-controlled; ignoring custom duration option.');
    }

    console.log(`🎬 Generating video${imagePath ? ' from image' : ''} with Veo 3.1...`);
    console.log(`   Prompt: "${String(prompt || '').substring(0, 70)}..."`);
    if (imagePath) {
        console.log(`   Image: ${path.basename(imagePath)}`);
    }
    console.log(`   Model: ${options.model || VEO_MODEL}`);

    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`\n⏳ Starting generation (attempt ${attempt}/${maxRetries})...`);
            const operationName = await startVeoGeneration({ prompt, imagePath, options });
            console.log(`   Operation: ${operationName}`);

            const videoUri = await pollVeoVideoUri(operationName, maxWaitMs, pollIntervalMs);
            const videoPath = await downloadVideoToCache(videoUri, operationName.split('/').pop());

            console.log('\n✅ Video generated successfully!');
            console.log(`   Path: ${videoPath}`);
            return videoPath;
        } catch (error) {
            lastError = error;
            console.error(`❌ Attempt ${attempt} failed: ${error.message}`);

            if (attempt < maxRetries) {
                console.log(`   Retrying in ${Math.round(retryDelay / 1000)}s...`);
                await sleep(retryDelay);
            }
        }
    }

    throw new Error(`Video generation failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
}

async function startGrokGeneration({ prompt, imagePath = null, options = {} }) {
    if (!XAI_API_KEY) {
        throw new Error('XAI_API_KEY / GROK_API_KEY is not configured');
    }

    const body = {
        model: String(options.grokModel || GROK_VIDEO_MODEL),
        prompt: normalizePrompt(prompt),
    };

    if (options.aspectRatio) {
        body.aspect_ratio = options.aspectRatio;
    }

    const duration = Number.parseInt(String(options.duration ?? process.env.GROK_VIDEO_DURATION ?? ''), 10);
    if (!Number.isNaN(duration) && duration > 0) {
        body.duration = duration;
    }

    if (imagePath) {
        const resolvedImagePath = normalizeImagePath(imagePath);
        body.image = `data:${getMimeType(resolvedImagePath)};base64,${toBase64(resolvedImagePath)}`;
    }

    const response = await fetch(`${XAI_BASE_URL}/videos/generations`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${XAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(buildError('Grok video request failed', response.status, data));
    }

    const generationId = data?.request_id || data?.id;
    if (!generationId) {
        throw new Error('Grok API did not return a generation ID');
    }

    return generationId;
}

async function fetchGrokGeneration(generationId) {
    const response = await fetch(`${XAI_BASE_URL}/videos/${encodeURIComponent(generationId)}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${XAI_API_KEY}`,
        },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(buildError('Grok generation poll failed', response.status, data));
    }

    return data;
}

function extractGrokVideoUrl(data) {
    return data?.video?.url || data?.video_url || data?.output?.video_url || data?.result?.url || null;
}

async function pollGrokVideoUrl(generationId, maxWaitMs = 6 * 60 * 1000, pollIntervalMs = 3000) {
    const startTime = Date.now();
    let dots = 0;

    while (Date.now() - startTime < maxWaitMs) {
        const data = await fetchGrokGeneration(generationId);
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const status = data?.status || 'processing';

        const videoUrl = extractGrokVideoUrl(data);
        if (videoUrl) {
            process.stdout.write(`\r   Status: completed ${'.'.repeat(4)} (${elapsed}s)\n`);
            return videoUrl;
        }

        if (status === 'failed' || status === 'error') {
            throw new Error(`Grok generation failed: ${data?.error || 'Unknown error'}`);
        }

        dots = (dots + 1) % 4;
        process.stdout.write(`\r   Status: ${status} ${'.'.repeat(dots + 1).padEnd(4)} (${elapsed}s)`);
        await sleep(pollIntervalMs);
    }

    throw new Error('Grok generation timed out');
}

async function generateWithGrok(prompt, options = {}, imagePath = null) {
    if (!XAI_API_KEY) {
        throw new Error('XAI_API_KEY / GROK_API_KEY not configured in .env');
    }

    const {
        maxRetries = 3,
        retryDelay = 5000,
        maxWaitMs = Number.parseInt(String(process.env.GROK_VIDEO_MAX_WAIT_MS || ''), 10) || 6 * 60 * 1000,
        pollIntervalMs = Number.parseInt(String(process.env.GROK_VIDEO_POLL_INTERVAL_MS || ''), 10) || 3000,
    } = options;

    console.log(`🎬 Generating video${imagePath ? ' from image' : ''} with Grok...`);
    console.log(`   Prompt: "${String(prompt || '').substring(0, 70)}..."`);
    if (imagePath) {
        console.log(`   Image: ${path.basename(imagePath)}`);
    }
    console.log(`   Model: ${options.grokModel || GROK_VIDEO_MODEL}`);

    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`\n⏳ Starting generation (attempt ${attempt}/${maxRetries})...`);
            const generationId = await startGrokGeneration({ prompt, imagePath, options });
            console.log(`   Generation ID: ${generationId}`);

            const videoUrl = await pollGrokVideoUrl(generationId, maxWaitMs, pollIntervalMs);
            const videoPath = await downloadVideoToCache(videoUrl, generationId);

            console.log('\n✅ Video generated successfully!');
            console.log(`   Path: ${videoPath}`);
            return videoPath;
        } catch (error) {
            lastError = error;
            console.error(`❌ Attempt ${attempt} failed: ${error.message}`);

            if (attempt < maxRetries) {
                console.log(`   Retrying in ${Math.round(retryDelay / 1000)}s...`);
                await sleep(retryDelay);
            }
        }
    }

    throw new Error(`Video generation failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Generate a video from a text prompt.
 * @param {string} prompt
 * @param {object} options
 * @returns {Promise<string>}
 */
export async function generateVideo(prompt, options = {}) {
    normalizePrompt(prompt);

    const providers = getProviderOrder(options.provider);
    let lastError = null;

    for (const provider of providers) {
        try {
            if (provider === 'veo') return await generateWithVeo(prompt, options);
            if (provider === 'grok') return await generateWithGrok(prompt, options);
        } catch (error) {
            lastError = error;
        }
    }

    throw new Error(`No video provider succeeded: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Generate a video from an image + prompt.
 * @param {string} imagePath
 * @param {string} prompt
 * @param {object} options
 * @returns {Promise<string>}
 */
export async function generateVideoFromImage(imagePath, prompt, options = {}) {
    normalizeImagePath(imagePath);
    normalizePrompt(prompt);

    const providers = getProviderOrder(options.provider);
    let lastError = null;

    for (const provider of providers) {
        try {
            if (provider === 'veo') return await generateWithVeo(prompt, options, imagePath);
            if (provider === 'grok') return await generateWithGrok(prompt, options, imagePath);
        } catch (error) {
            lastError = error;
        }
    }

    throw new Error(`No video provider succeeded: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Clean up old cached videos (older than 24 hours).
 */
export function cleanupCache() {
    const maxAge = 24 * 60 * 60 * 1000;
    const now = Date.now();

    if (!fs.existsSync(CACHE_DIR)) return;

    const files = fs.readdirSync(CACHE_DIR);
    let cleaned = 0;

    for (const file of files) {
        const filepath = path.join(CACHE_DIR, file);
        const stats = fs.statSync(filepath);
        if (now - stats.mtimeMs > maxAge) {
            fs.unlinkSync(filepath);
            cleaned++;
        }
    }

    if (cleaned > 0) {
        console.log(`🧹 Cleaned up ${cleaned} old cached videos`);
    }
}


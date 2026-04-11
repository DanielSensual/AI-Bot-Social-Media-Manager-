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
const VEO_BREAKER_STATE_PATH = path.join(CACHE_DIR, 'veo-breaker.json');
const VEO_BREAKER_COOLDOWN_MS = Number.parseInt(String(process.env.VEO_BREAKER_COOLDOWN_MS || ''), 10) || 24 * 60 * 60 * 1000;

const XAI_BASE_URL = 'https://api.x.ai/v1';
const XAI_API_KEY = process.env.XAI_VIDEO_API_KEY || process.env.XAI_API_KEY || process.env.GROK_API_KEY || '';
const GROK_VIDEO_MODEL = process.env.GROK_VIDEO_MODEL || 'grok-imagine-video';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_VIDEO_MODEL = process.env.OPENAI_VIDEO_MODEL || 'sora-2';

const FAL_KEY = process.env.FAL_KEY || '';
const FAL_KLING_ENDPOINT = 'https://queue.fal.run/fal-ai/kling-video/v2/master/text-to-video';
const FAL_KLING_I2V_ENDPOINT = 'https://queue.fal.run/fal-ai/kling-video/v2/master/image-to-video';

if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function readBreakerState(filepath) {
    try {
        if (!fs.existsSync(filepath)) return 0;
        const raw = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        const trippedAt = Number.parseInt(String(raw?.trippedAt || ''), 10);
        return Number.isFinite(trippedAt) ? trippedAt : 0;
    } catch {
        return 0;
    }
}

function writeBreakerState(filepath, trippedAt, cooldownMs) {
    try {
        if (!trippedAt) {
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
            }
            return;
        }

        fs.writeFileSync(filepath, JSON.stringify({
            trippedAt,
            resetAt: new Date(trippedAt + cooldownMs).toISOString(),
        }, null, 2));
    } catch (error) {
        console.warn(`⚠️ Failed to persist breaker state (${path.basename(filepath)}): ${error.message}`);
    }
}

let veoBreakerTrippedAt = readBreakerState(VEO_BREAKER_STATE_PATH);

function isVeoBreakerOpen() {
    if (!veoBreakerTrippedAt) return false;

    const elapsed = Date.now() - veoBreakerTrippedAt;
    if (elapsed > VEO_BREAKER_COOLDOWN_MS) {
        veoBreakerTrippedAt = 0;
        writeBreakerState(VEO_BREAKER_STATE_PATH, 0, VEO_BREAKER_COOLDOWN_MS);
        console.log('🔌 Veo breaker reset — retrying allowed');
        return false;
    }

    return true;
}

function getVeoBreakerStatus() {
    if (!isVeoBreakerOpen()) return { open: false };
    const remainingMs = VEO_BREAKER_COOLDOWN_MS - (Date.now() - veoBreakerTrippedAt);
    return {
        open: true,
        remainingMs,
        resetAt: new Date(veoBreakerTrippedAt + VEO_BREAKER_COOLDOWN_MS).toISOString(),
    };
}

function tripVeoBreaker(reason) {
    veoBreakerTrippedAt = Date.now();
    writeBreakerState(VEO_BREAKER_STATE_PATH, veoBreakerTrippedAt, VEO_BREAKER_COOLDOWN_MS);
    const resetTime = new Date(veoBreakerTrippedAt + VEO_BREAKER_COOLDOWN_MS).toLocaleTimeString();
    console.error(`⚡ Veo breaker TRIPPED — provider blocked until ${resetTime}`);
    if (reason) {
        console.error(`   Reason: ${reason}`);
    }
}

function isVeoQuotaError(error) {
    const message = String(error?.message || '');
    return /\b429\b/.test(message)
        || /rate limit/i.test(message)
        || /quota/i.test(message)
        || /RESOURCE_EXHAUSTED/i.test(message);
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
    if (mode === 'openai') return ['openai'];
    if (mode === 'kling') return ['kling'];
    // Auto: Kling (best motion/consistency) → Grok → Veo → OpenAI
    return ['kling', 'grok', 'veo', 'openai'];
}

export async function downloadVideoToCache(videoUrl, generationId) {
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

    if (isVeoBreakerOpen()) {
        const status = getVeoBreakerStatus();
        throw new Error(`Veo breaker is OPEN — quota failures recently detected. Retry after ${status.resetAt}`);
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

            if (isVeoQuotaError(error)) {
                tripVeoBreaker(error.message);
                break;
            }

            if (attempt < maxRetries) {
                console.log(`   Retrying in ${Math.round(retryDelay / 1000)}s...`);
                await sleep(retryDelay);
            }
        }
    }

    throw new Error(`Video generation failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
}

async function startGrokGeneration({ prompt, imagePath = null, videoUrl = null, options = {} }) {
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
        body.duration = Math.min(Math.max(duration, 1), 15);
    }

    // Resolution & size controls (new API) — default 720p to avoid IG algorithm penalty
    body.resolution = options.resolution || process.env.GROK_VIDEO_RESOLUTION || '720p';
    if (options.size) {
        body.size = options.size; // '848x480' | '1696x960' | '1280x720' | '1920x1080'
    }

    // Image input — new API expects { url: "..." } object format
    if (imagePath) {
        const resolvedImagePath = normalizeImagePath(imagePath);
        const base64Data = `data:${getMimeType(resolvedImagePath)};base64,${toBase64(resolvedImagePath)}`;
        body.image = { url: base64Data };
    } else if (options.imageUrl) {
        body.image = { url: options.imageUrl };
    }

    // Reference images (R2V) — Ghost character face consistency
    if (options.referenceImages?.length) {
        body.reference_images = options.referenceImages.map(url => ({ url }));
        console.log(`   👻 Reference images: ${options.referenceImages.length} attached for character consistency`);
    }

    if (videoUrl) {
        body.video = { url: videoUrl };
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

/**
 * Start a Grok video EDIT (dedicated /v1/videos/edits endpoint)
 */
async function startGrokEdit({ prompt, videoUrl, options = {} }) {
    if (!XAI_API_KEY) {
        throw new Error('XAI_API_KEY / GROK_API_KEY is not configured');
    }
    if (!videoUrl) {
        throw new Error('videoUrl is required for video edit');
    }

    const body = {
        model: String(options.grokModel || GROK_VIDEO_MODEL),
        prompt: normalizePrompt(prompt),
        video: { url: videoUrl },
    };

    const response = await fetch(`${XAI_BASE_URL}/videos/edits`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${XAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(buildError('Grok video edit request failed', response.status, data));
    }

    return data?.request_id || data?.id;
}

/**
 * Start a Grok video EXTENSION (dedicated /v1/videos/extensions endpoint)
 */
async function startGrokExtension({ prompt, videoUrl, options = {} }) {
    if (!XAI_API_KEY) {
        throw new Error('XAI_API_KEY / GROK_API_KEY is not configured');
    }
    if (!videoUrl) {
        throw new Error('videoUrl is required for video extension');
    }

    const extensionDuration = Number.parseInt(String(options.extensionDuration ?? 6), 10);

    const body = {
        model: String(options.grokModel || GROK_VIDEO_MODEL),
        prompt: normalizePrompt(prompt),
        video: { url: videoUrl },
        duration: Math.min(Math.max(extensionDuration, 1), 10),
    };

    const response = await fetch(`${XAI_BASE_URL}/videos/extensions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${XAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(buildError('Grok video extension request failed', response.status, data));
    }

    return data?.request_id || data?.id;
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
        const progress = data?.progress ?? 0;

        // Done — extract video URL
        if (status === 'done') {
            const videoUrl = extractGrokVideoUrl(data);

            // Check moderation
            if (data?.video?.respect_moderation === false) {
                throw new Error('Grok generation completed but video was blocked by moderation');
            }

            if (!videoUrl) {
                throw new Error('Grok generation completed but no video URL returned');
            }

            process.stdout.write(`\r   Status: completed [100%] (${elapsed}s)\n`);

            // Log duration and cost if available
            if (data?.video?.duration) {
                console.log(`   ⏱️  Duration: ${data.video.duration}s`);
            }
            if (data?.usage?.cost_in_usd_ticks) {
                const costUsd = data.usage.cost_in_usd_ticks / 10_000_000_000;
                console.log(`   💰 Cost: $${costUsd.toFixed(4)}`);
            }

            return videoUrl;
        }

        // Legacy: check for URL in non-'done' status (backwards compat)
        const videoUrl = extractGrokVideoUrl(data);
        if (videoUrl) {
            process.stdout.write(`\r   Status: completed [100%] (${elapsed}s)\n`);
            return videoUrl;
        }

        // Failed — extract structured error
        if (status === 'failed' || status === 'error') {
            const errorMsg = data?.error?.message || data?.error?.code || data?.error || 'Unknown error';
            throw new Error(`Grok generation failed: ${errorMsg}`);
        }

        dots = (dots + 1) % 4;
        process.stdout.write(`\r   Status: ${status} [${progress}%] ${'.'.repeat(dots + 1).padEnd(4)} (${elapsed}s)`);
        await sleep(pollIntervalMs);
    }

    throw new Error('Grok generation timed out');
}

async function generateWithGrok(prompt, options = {}, inputPath = null) {
    if (!XAI_API_KEY) {
        throw new Error('XAI_API_KEY / GROK_API_KEY not configured in .env');
    }

    const {
        maxRetries = 3,
        retryDelay = 5000,
        maxWaitMs = Number.parseInt(String(process.env.GROK_VIDEO_MAX_WAIT_MS || ''), 10) || 6 * 60 * 1000,
        pollIntervalMs = Number.parseInt(String(process.env.GROK_VIDEO_POLL_INTERVAL_MS || ''), 10) || 3000,
    } = options;

    const inputType = inputPath ? (inputPath.startsWith('http') ? 'url' : (path.extname(inputPath) === '.mp4' ? 'video' : 'image')) : 'text';

    console.log(`🎬 Generating video from ${inputType} with Grok...`);
    console.log(`   Prompt: "${String(prompt || '').substring(0, 70)}..."`);
    if (inputPath) {
        console.log(`   Source: ${inputPath.startsWith('http') ? inputPath : path.basename(inputPath)}`);
    }
    console.log(`   Model: ${options.grokModel || GROK_VIDEO_MODEL}`);

    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`\n⏳ Starting generation (attempt ${attempt}/${maxRetries})...`);

            let genArgs = { prompt, options };
            if (inputType === 'image') genArgs.imagePath = inputPath;
            if (inputType === 'url' || inputType === 'video') genArgs.videoUrl = inputPath;

            // Allow explicit overrides from options
            if (options.imagePath) genArgs.imagePath = options.imagePath;
            if (options.videoUrl) genArgs.videoUrl = options.videoUrl;

            const generationId = await startGrokGeneration(genArgs);
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

async function generateWithOpenAI(prompt, options = {}, imagePath = null) {
    if (!OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY not configured in .env');
    }

    const {
        maxRetries = 2,
        retryDelay = 8000,
        maxWaitMs = Number.parseInt(String(process.env.OPENAI_VIDEO_MAX_WAIT_MS || ''), 10) || 10 * 60 * 1000,
        pollIntervalMs = Number.parseInt(String(process.env.OPENAI_VIDEO_POLL_INTERVAL_MS || ''), 10) || 5000,
    } = options;

    const model = String(options.openaiVideoModel || OPENAI_VIDEO_MODEL).trim();

    console.log(`🎬 Generating video${imagePath ? ' from image' : ''} with OpenAI (${model})...`);
    console.log(`   Prompt: "${String(prompt || '').substring(0, 70)}..."`);
    console.log(`   Model: ${model}`);

    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`\n⏳ Starting generation (attempt ${attempt}/${maxRetries})...`);

            const body = {
                model,
                input: normalizePrompt(prompt),
            };

            if (options.aspectRatio) {
                body.aspect_ratio = options.aspectRatio;
            }

            const duration = Number.parseInt(String(options.duration ?? ''), 10);
            if (!Number.isNaN(duration) && duration > 0) {
                body.duration = duration;
            }

            if (imagePath) {
                const resolvedImagePath = normalizeImagePath(imagePath);
                body.image = {
                    type: 'base64',
                    media_type: getMimeType(resolvedImagePath),
                    data: toBase64(resolvedImagePath),
                };
            }

            // Start generation
            const startResponse = await fetch('https://api.openai.com/v1/videos/generations', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            const startData = await startResponse.json().catch(() => ({}));
            if (!startResponse.ok) {
                throw new Error(buildError('OpenAI video request failed', startResponse.status, startData));
            }

            const generationId = startData?.id;
            if (!generationId) {
                throw new Error('OpenAI API did not return a generation ID');
            }

            console.log(`   Generation ID: ${generationId}`);

            // Poll for completion
            const startTime = Date.now();
            let dots = 0;

            while (Date.now() - startTime < maxWaitMs) {
                const pollResponse = await fetch(`https://api.openai.com/v1/videos/generations/${encodeURIComponent(generationId)}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    },
                });

                const pollData = await pollResponse.json().catch(() => ({}));
                if (!pollResponse.ok) {
                    throw new Error(buildError('OpenAI generation poll failed', pollResponse.status, pollData));
                }

                const elapsed = Math.round((Date.now() - startTime) / 1000);
                const status = pollData?.status || 'processing';

                if (status === 'completed' || status === 'succeeded') {
                    const videoUrl = pollData?.output?.url || pollData?.video?.url || pollData?.result?.url;
                    if (!videoUrl) {
                        throw new Error('OpenAI generation completed but no video URL returned');
                    }

                    process.stdout.write(`\r   Status: completed ${'.'.repeat(4)} (${elapsed}s)\n`);
                    const videoPath = await downloadVideoToCache(videoUrl, generationId);

                    console.log('\n✅ Video generated successfully!');
                    console.log(`   Path: ${videoPath}`);
                    return videoPath;
                }

                if (status === 'failed' || status === 'error') {
                    throw new Error(`OpenAI generation failed: ${pollData?.error?.message || pollData?.error || 'Unknown error'}`);
                }

                dots = (dots + 1) % 4;
                process.stdout.write(`\r   Status: ${status} ${'.'.repeat(dots + 1).padEnd(4)} (${elapsed}s)`);
                await sleep(pollIntervalMs);
            }

            throw new Error('OpenAI generation timed out');
        } catch (error) {
            lastError = error;
            console.error(`❌ Attempt ${attempt} failed: ${error.message}`);

            if (attempt < maxRetries) {
                console.log(`   Retrying in ${Math.round(retryDelay / 1000)}s...`);
                await sleep(retryDelay);
            }
        }
    }

    throw new Error(`OpenAI video generation failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
}

// ═══════════════════════════════════════════════════════════════
// KLING via fal.ai — Async queue-based generation
// ═══════════════════════════════════════════════════════════════

async function pollFalQueue(requestId, statusUrl, maxWaitMs = 5 * 60 * 1000, pollIntervalMs = 5000) {
    const start = Date.now();
    const pollUrl = statusUrl || `https://queue.fal.run/fal-ai/kling-video/requests/${requestId}/status`;

    while (Date.now() - start < maxWaitMs) {
        const response = await fetch(pollUrl, {
            headers: { 'Authorization': `Key ${FAL_KEY}` },
        });
        const data = await response.json().catch(() => ({}));

        if (data.status === 'COMPLETED') {
            // Fetch the actual result
            const resultUrl = `https://queue.fal.run/fal-ai/kling-video/requests/${requestId}`;
            const resultResponse = await fetch(resultUrl, {
                headers: { 'Authorization': `Key ${FAL_KEY}` },
            });
            const result = await resultResponse.json().catch(() => ({}));
            return result;
        }

        if (data.status === 'FAILED') {
            throw new Error(`Kling generation failed: ${data.error || 'Unknown error'}`);
        }

        const elapsed = Math.round((Date.now() - start) / 1000);
        const queuePos = data.queue_position != null ? ` (queue: #${data.queue_position})` : '';
        console.log(`   ⏳ Kling: ${data.status || 'processing'}${queuePos} (${elapsed}s)`);

        await sleep(pollIntervalMs);
    }

    throw new Error(`Kling generation timed out after ${Math.round(maxWaitMs / 1000)}s`);
}

async function generateWithKling(prompt, options = {}, imagePath = null) {
    if (!FAL_KEY) {
        throw new Error('FAL_KEY not configured for Kling video generation');
    }

    const {
        maxWaitMs = 5 * 60 * 1000,
        pollIntervalMs = 5000,
        duration = '5',
        aspectRatio = '9:16',
    } = options;

    const isI2V = !!imagePath;
    const endpoint = isI2V ? FAL_KLING_I2V_ENDPOINT : FAL_KLING_ENDPOINT;
    const mode = isI2V ? 'image-to-video' : 'text-to-video';

    console.log(`🎬 Generating video with Kling 3.0 (${mode} via fal.ai)...`);
    console.log(`   Prompt: "${String(prompt || '').substring(0, 80)}..."`);

    const body = {
        prompt,
        duration: String(duration),
        aspect_ratio: aspectRatio,
    };

    // If image-to-video, upload the image first
    if (isI2V) {
        const imageData = fs.readFileSync(imagePath);
        const base64 = imageData.toString('base64');
        const mimeType = getMimeType(imagePath) || 'image/jpeg';
        body.image_url = `data:${mimeType};base64,${base64}`;
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Key ${FAL_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const msg = data?.detail || data?.error || `fal.ai error ${response.status}`;
        throw new Error(`Kling queue submission failed: ${msg}`);
    }

    if (!data.request_id) {
        throw new Error('Kling queue submission returned no request_id');
    }

    console.log(`   ✅ Queued: ${data.request_id}`);

    // Poll for completion
    const result = await pollFalQueue(data.request_id, data.status_url, maxWaitMs, pollIntervalMs);

    // Extract video URL from result
    const videoUrl = result?.video?.url || result?.data?.video?.url;
    if (!videoUrl) {
        throw new Error('Kling result contained no video URL');
    }

    // Download to cache
    const videoPath = await downloadVideoToCache(videoUrl, `kling_${data.request_id}`);
    console.log(`   ✅ Kling video saved: ${videoPath}`);
    return videoPath;
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
            if (provider === 'kling') return await generateWithKling(prompt, options);
            if (provider === 'veo') return await generateWithVeo(prompt, options);
            if (provider === 'grok') return await generateWithGrok(prompt, options);
            if (provider === 'openai') return await generateWithOpenAI(prompt, options);
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
            if (provider === 'kling') return await generateWithKling(prompt, options, imagePath);
            if (provider === 'veo') return await generateWithVeo(prompt, options, imagePath);
            if (provider === 'grok') return await generateWithGrok(prompt, options, imagePath);
            if (provider === 'openai') return await generateWithOpenAI(prompt, options, imagePath);
        } catch (error) {
            lastError = error;
        }
    }

    throw new Error(`No video provider succeeded: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Transform an existing video (Edit) using a prompt.
 * Uses the dedicated /v1/videos/edits endpoint for Grok.
 * @param {string} videoSource - Public URL of the video to edit
 * @param {string} prompt - Edit instructions
 * @param {object} options
 * @returns {Promise<string>} Path to edited video
 */
export async function transformVideo(videoSource, prompt, options = {}) {
    normalizePrompt(prompt);

    if (!XAI_API_KEY) {
        throw new Error('XAI_API_KEY / GROK_API_KEY not configured for video editing');
    }

    const {
        maxRetries = 2,
        retryDelay = 5000,
        maxWaitMs = Number.parseInt(String(process.env.GROK_VIDEO_MAX_WAIT_MS || ''), 10) || 6 * 60 * 1000,
        pollIntervalMs = Number.parseInt(String(process.env.GROK_VIDEO_POLL_INTERVAL_MS || ''), 10) || 3000,
    } = options;

    console.log(`🎬 Editing video with Grok (dedicated /edits endpoint)...`);
    console.log(`   Prompt: "${String(prompt || '').substring(0, 70)}..."`);
    console.log(`   Source: ${videoSource}`);

    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`\n⏳ Starting edit (attempt ${attempt}/${maxRetries})...`);
            const generationId = await startGrokEdit({ prompt, videoUrl: videoSource, options });
            console.log(`   Generation ID: ${generationId}`);

            const videoUrl = await pollGrokVideoUrl(generationId, maxWaitMs, pollIntervalMs);
            const videoPath = await downloadVideoToCache(videoUrl, generationId);

            console.log('\n✅ Video edited successfully!');
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

    throw new Error(`Video edit failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Extend a video by generating continuation content.
 * Uses the /v1/videos/extensions endpoint.
 * Useful for chaining clips to create longer Reels (8s base → extend multiple times).
 * @param {string} videoSource - Public URL of the video to extend
 * @param {string} prompt - What should happen next in the video
 * @param {object} options
 * @param {number} [options.extensionDuration=6] - Duration of extension (1-10s)
 * @returns {Promise<string>} Path to extended video
 */
export async function extendVideo(videoSource, prompt, options = {}) {
    normalizePrompt(prompt);

    if (!XAI_API_KEY) {
        throw new Error('XAI_API_KEY / GROK_API_KEY not configured for video extension');
    }

    const {
        maxRetries = 2,
        retryDelay = 5000,
        maxWaitMs = Number.parseInt(String(process.env.GROK_VIDEO_MAX_WAIT_MS || ''), 10) || 6 * 60 * 1000,
        pollIntervalMs = Number.parseInt(String(process.env.GROK_VIDEO_POLL_INTERVAL_MS || ''), 10) || 3000,
    } = options;

    const extDuration = options.extensionDuration ?? 6;

    console.log(`🎬 Extending video with Grok (+${extDuration}s)...`);
    console.log(`   Prompt: "${String(prompt || '').substring(0, 70)}..."`);
    console.log(`   Source: ${videoSource}`);

    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`\n⏳ Starting extension (attempt ${attempt}/${maxRetries})...`);
            const generationId = await startGrokExtension({ prompt, videoUrl: videoSource, options });
            console.log(`   Generation ID: ${generationId}`);

            const videoUrl = await pollGrokVideoUrl(generationId, maxWaitMs, pollIntervalMs);
            const videoPath = await downloadVideoToCache(videoUrl, generationId);

            console.log('\n✅ Video extended successfully!');
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

    throw new Error(`Video extension failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
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

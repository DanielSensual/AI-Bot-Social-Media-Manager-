/**
 * Minimal OpenAI Sora video generator helper for autopilot workflows.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEO_CACHE_DIR = path.join(__dirname, '..', '.video-cache');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function requireOpenAiApiKey() {
    const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY is required for Sora video generation');
    }
    return apiKey;
}

function sanitizeTag(value) {
    return String(value || 'sora')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'sora';
}

export async function generateSoraVideo(prompt, options = {}) {
    const text = String(prompt || '').trim();
    if (!text) throw new Error('Sora prompt is required');

    const apiKey = requireOpenAiApiKey();
    const client = new OpenAI({ apiKey });

    const model = String(options.model || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5').trim();
    const seconds = String(options.seconds || process.env.SORA_SECONDS || '8').trim();
    const size = String(options.size || process.env.SORA_SIZE || '720x1280').trim();
    const pollIntervalMs = Number.parseInt(String(options.pollIntervalMs || process.env.SORA_POLL_INTERVAL_MS || '5000'), 10);
    const maxWaitMs = Number.parseInt(String(options.maxWaitMs || process.env.SORA_MAX_WAIT_MS || `${10 * 60 * 1000}`), 10);
    const tag = sanitizeTag(options.tag || process.env.SORA_TAG || 'autopilot');

    fs.mkdirSync(VIDEO_CACHE_DIR, { recursive: true });

    const startedAt = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    const baseName = `${tag}-${timestamp}`;

    const job = await client.videos.create({
        prompt: text,
        model,
        seconds,
        size,
    });

    let current = job;
    while (current.status !== 'completed' && current.status !== 'failed') {
        if (Date.now() - startedAt > maxWaitMs) {
            throw new Error(`Sora generation timed out after ${Math.round(maxWaitMs / 1000)}s`);
        }

        await sleep(Math.max(1000, pollIntervalMs));
        current = await client.videos.retrieve(job.id);
    }

    if (current.status === 'failed') {
        throw new Error(`Sora generation failed: ${current.error?.message || 'Unknown error'}`);
    }

    const response = await client.videos.downloadContent(job.id);
    const buffer = Buffer.from(await response.arrayBuffer());
    const filePath = path.join(VIDEO_CACHE_DIR, `${baseName}.mp4`);
    fs.writeFileSync(filePath, buffer);

    return filePath;
}

export default {
    generateSoraVideo,
};

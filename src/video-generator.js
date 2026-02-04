/**
 * xAI Grok Video Generator
 * Generates short videos from text prompts using Grok Imagine Video API
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', '.video-cache');

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_BASE_URL = 'https://api.x.ai/v1';

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Generate a video from a text prompt
 * @param {string} prompt - Description of the video to generate
 * @param {object} options - Generation options
 * @returns {Promise<string>} Path to the generated video file
 */
export async function generateVideo(prompt, options = {}) {
    if (!XAI_API_KEY) {
        throw new Error('XAI_API_KEY not configured in .env');
    }

    const {
        aspectRatio = '16:9',
        duration = 5,
        maxRetries = 3,
        retryDelay = 5000,
    } = options;

    console.log('🎬 Generating video with Grok...');
    console.log(`   Prompt: "${prompt.substring(0, 60)}..."`);
    console.log(`   Aspect Ratio: ${aspectRatio}`);
    console.log(`   Duration: ${duration}s`);

    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Step 1: Start video generation
            console.log(`\n⏳ Starting generation (attempt ${attempt}/${maxRetries})...`);

            const generateResponse = await fetch(`${XAI_BASE_URL}/videos/generations`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${XAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'grok-imagine-video',
                    prompt: prompt,
                    aspect_ratio: aspectRatio,
                    duration: duration,
                }),
            });

            if (!generateResponse.ok) {
                const errorData = await generateResponse.json().catch(() => ({}));
                throw new Error(`API error: ${generateResponse.status} - ${JSON.stringify(errorData)}`);
            }

            const generateData = await generateResponse.json();
            const generationId = generateData.request_id || generateData.id;

            console.log(`   Generation ID: ${generationId}`);

            // Step 2: Poll for completion
            const videoUrl = await pollForCompletion(generationId);

            // Step 3: Download video
            const videoPath = await downloadVideo(videoUrl, generationId);

            console.log(`\n✅ Video generated successfully!`);
            console.log(`   Path: ${videoPath}`);

            return videoPath;

        } catch (error) {
            lastError = error;
            console.error(`❌ Attempt ${attempt} failed: ${error.message}`);

            if (attempt < maxRetries) {
                console.log(`   Retrying in ${retryDelay / 1000}s...`);
                await sleep(retryDelay);
            }
        }
    }

    throw new Error(`Video generation failed after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Generate a video from an image
 * @param {string} imagePath - Path to source image
 * @param {string} prompt - Motion/animation description
 * @param {object} options - Generation options
 * @returns {Promise<string>} Path to the generated video file
 */
export async function generateVideoFromImage(imagePath, prompt, options = {}) {
    if (!XAI_API_KEY) {
        throw new Error('XAI_API_KEY not configured in .env');
    }

    if (!fs.existsSync(imagePath)) {
        throw new Error(`Image not found: ${imagePath}`);
    }

    const {
        duration = 5,
        maxRetries = 3,
        retryDelay = 5000,
    } = options;

    console.log('🎬 Generating video from image with Grok...');
    console.log(`   Image: ${path.basename(imagePath)}`);
    console.log(`   Prompt: "${prompt.substring(0, 60)}..."`);

    // Read image and convert to base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = getMimeType(imagePath);

    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`\n⏳ Starting generation (attempt ${attempt}/${maxRetries})...`);

            const generateResponse = await fetch(`${XAI_BASE_URL}/videos/generations`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${XAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'grok-imagine-video',
                    prompt: prompt,
                    image: `data:${mimeType};base64,${base64Image}`,
                    duration: duration,
                }),
            });

            if (!generateResponse.ok) {
                const errorData = await generateResponse.json().catch(() => ({}));
                throw new Error(`API error: ${generateResponse.status} - ${JSON.stringify(errorData)}`);
            }

            const generateData = await generateResponse.json();
            const generationId = generateData.request_id || generateData.id;

            console.log(`   Generation ID: ${generationId}`);

            const videoUrl = await pollForCompletion(generationId);
            const videoPath = await downloadVideo(videoUrl, generationId);

            console.log(`\n✅ Video generated successfully!`);
            console.log(`   Path: ${videoPath}`);

            return videoPath;

        } catch (error) {
            lastError = error;
            console.error(`❌ Attempt ${attempt} failed: ${error.message}`);

            if (attempt < maxRetries) {
                console.log(`   Retrying in ${retryDelay / 1000}s...`);
                await sleep(retryDelay);
            }
        }
    }

    throw new Error(`Video generation failed after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Poll for video generation completion
 */
async function pollForCompletion(generationId, maxWaitMs = 120000) {
    const startTime = Date.now();
    const pollInterval = 3000;
    let dots = 0;

    while (Date.now() - startTime < maxWaitMs) {
        const response = await fetch(`${XAI_BASE_URL}/videos/${generationId}`, {
            headers: {
                'Authorization': `Bearer ${XAI_API_KEY}`,
            },
        });

        if (!response.ok) {
            throw new Error(`Poll error: ${response.status}`);
        }

        const data = await response.json();

        // Progress indicator
        dots = (dots + 1) % 4;
        const elapsed = Math.round((Date.now() - startTime) / 1000);

        // Check if video is ready (API returns video.url when complete)
        if (data.video?.url) {
            process.stdout.write(`\r   Status: completed ${'.'.repeat(4)} (${elapsed}s)\n`);
            return data.video.url;
        }

        // Also check legacy response formats
        const status = data.status || 'processing';
        process.stdout.write(`\r   Status: ${status} ${'.'.repeat(dots + 1).padEnd(4)} (${elapsed}s)`);

        if (status === 'completed' || status === 'succeeded') {
            console.log('');
            return data.video_url || data.output?.video_url || data.result?.url;
        }

        if (status === 'failed' || status === 'error') {
            console.log('');
            throw new Error(`Generation failed: ${data.error || 'Unknown error'}`);
        }

        await sleep(pollInterval);
    }

    throw new Error('Video generation timed out');
}

/**
 * Download video from URL to local cache
 */
async function downloadVideo(url, generationId) {
    const filename = `video_${generationId}_${Date.now()}.mp4`;
    const filepath = path.join(CACHE_DIR, filename);

    console.log(`\n📥 Downloading video...`);

    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filepath);

        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Follow redirect
                https.get(response.headers.location, (redirectResponse) => {
                    redirectResponse.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        resolve(filepath);
                    });
                }).on('error', reject);
            } else {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(filepath);
                });
            }
        }).on('error', (err) => {
            fs.unlink(filepath, () => { });
            reject(err);
        });
    });
}

/**
 * Get MIME type from file extension
 */
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

/**
 * Clean up old cached videos (older than 24 hours)
 */
export function cleanupCache() {
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
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

/**
 * Sleep helper
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default { generateVideo, generateVideoFromImage, cleanupCache };

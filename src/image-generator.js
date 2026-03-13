/**
 * Image Generator
 * Creates branded visual cards for social media posts using AI image generation.
 * Ensures every post has media for Instagram/Facebook even without video.
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGE_CACHE_DIR = path.join(__dirname, '..', '.image-cache');

// Ensure cache directory exists
fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });

const openaiClient = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

const GROK_API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY || '';
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

/**
 * Generate a branded image card for a social media post.
 * Tries OpenAI Sora 2 first, then xAI Grok.
 * @param {string} postText - The post content to create a visual for
 * @param {object} options
 * @param {string} [options.style='minimal'] - 'minimal', 'bold', or 'cinematic'
 * @param {string} [options.size='1024x1024'] - Image dimensions
 * @returns {Promise<string>} Path to generated image file
 */
export async function generateImage(postText, options = {}) {
    const {
        style = 'bold',
        size = '1024x1024',
    } = options;

    const prompt = buildImagePrompt(postText, style);

    // Try Grok first (cheaper, reliably working)
    if (GROK_API_KEY) {
        try {
            return await generateWithGrok(prompt);
        } catch (err) {
            console.warn(`⚠️ Grok image generation failed: ${err.message}`);
        }
    }

    // Fallback to OpenAI
    if (openaiClient) {
        try {
            return await generateWithDallE(prompt, size);
        } catch (err) {
            console.warn(`⚠️ OpenAI image generation failed: ${err.message}`);
        }
    }

    throw new Error('No image generation provider available (need XAI_API_KEY or OPENAI_API_KEY)');
}

/**
 * Build a style-appropriate prompt for image generation
 */
function buildImagePrompt(postText, style) {
    // Extract the core topic (first 100 chars, strip hashtags/emojis)
    const topic = postText
        .replace(/#\w+/g, '')
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .trim()
        .substring(0, 150);

    const styles = {
        minimal: `Clean, minimal corporate design card. Dark background (#0a0a0a) with subtle ghost-white accent. Abstract geometric shapes. Topic: "${topic}". Professional tech brand aesthetic. No text in image.`,
        bold: `Bold, eye-catching social media graphic. Deep black background with electric blue and ghost-white gradients. Abstract AI/tech imagery with neural network patterns. Topic: "${topic}". Premium, futuristic brand feel. No readable text.`,
        cinematic: `Cinematic, wide-angle tech scene. Dark moody lighting with glowing blue/purple accents. Futuristic workspace or AI visualization. Topic: "${topic}". High-end production quality. No text in image.`,
        bachata: `Warm, vibrant social media graphic for bachata dance culture. Golden sunset tones, Caribbean ocean blues, and tropical palm silhouettes. A couple dancing bachata in close embrace under warm string lights. Dominican Republic inspired — think Punta Cana beach nights, neon-lit dance clubs, acoustic guitar close-ups. Topic: "${topic}". Rich, sensual, premium Latin dance aesthetic. Photorealistic style. No text or words in image.`,
        bachata_music: `Premium music industry visual for a bachata record label. Dark moody studio with warm amber and purple neon accents. Dominican guitar, bongos, or mixing board in cinematic lighting. Feels like a late-night studio session in Santo Domingo. Topic: "${topic}". High-end music production aesthetic. No text in image.`,
    };

    return styles[style] || styles.bold;
}

/**
 * Generate image using OpenAI DALL-E
 */
async function generateWithDallE(prompt, size) {
    console.log(`🎨 Generating image with OpenAI (${OPENAI_IMAGE_MODEL})...`);

    const params = {
        model: OPENAI_IMAGE_MODEL,
        prompt,
        n: 1,
        size,
    };

    // gpt-image-1 doesn't use 'quality' param, dall-e-3 does
    if (OPENAI_IMAGE_MODEL.includes('dall-e')) {
        params.quality = 'standard';
    }

    const response = await openaiClient.images.generate(params);

    const imageUrl = response.data[0]?.url;
    if (!imageUrl) throw new Error('DALL-E returned no image URL');

    // Download and save locally
    const imagePath = path.join(IMAGE_CACHE_DIR, `ghostai-${Date.now()}.png`);
    const imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(60_000) });
    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    fs.writeFileSync(imagePath, buffer);

    console.log(`✅ Image generated: ${imagePath}`);
    return imagePath;
}

/**
 * Generate image using xAI Grok
 */
async function generateWithGrok(prompt) {
    console.log('🎨 Generating image with Grok...');

    const models = [
        process.env.GROK_IMAGE_MODEL,
        'grok-imagine-image',
        'grok-imagine-image-pro',
        'grok-2-image-1212',
        'grok-2-image',
    ].filter(Boolean);

    let lastError = null;
    let data = null;

    for (const model of models) {
        try {
            console.log(`   Trying model: ${model}`);
            const response = await fetch('https://api.x.ai/v1/images/generations', {
                method: 'POST',
                signal: AbortSignal.timeout(60_000),
                headers: {
                    'Authorization': `Bearer ${GROK_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model,
                    prompt,
                    n: 1,
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Grok image API error (${response.status}) on ${model}: ${error}`);
            }

            data = await response.json();
            if (data && data.data?.[0]) {
                console.log(`   ✅ Success with model: ${model}`);
                break;
            }
        } catch (err) {
            console.warn(`   ⚠️ ${model} failed: ${err.message}`);
            lastError = err;
        }
    }

    if (!data || !data.data?.[0]) {
        throw lastError || new Error('Grok image generation failed on all candidate models');
    }

    const item = data.data[0];
    const base64 = item.b64_json || item.base64 || item.image_base64;
    const url = item.url || item.image_url;

    const imagePath = path.join(IMAGE_CACHE_DIR, `ghostai-${Date.now()}.png`);

    if (base64) {
        fs.writeFileSync(imagePath, Buffer.from(base64, 'base64'));
    } else if (url) {
        const imageResponse = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        const buffer = Buffer.from(await imageResponse.arrayBuffer());
        fs.writeFileSync(imagePath, buffer);
    } else {
        throw new Error('Grok returned no image data (neither base64 nor URL)');
    }

    console.log(`✅ Image generated: ${imagePath}`);
    return imagePath;
}

/**
 * Clean up old cached images (older than 24 hours)
 */
export function cleanupImageCache() {
    const maxAge = 24 * 60 * 60 * 1000;
    const now = Date.now();

    try {
        const files = fs.readdirSync(IMAGE_CACHE_DIR);
        let cleaned = 0;

        for (const file of files) {
            const filePath = path.join(IMAGE_CACHE_DIR, file);
            const stat = fs.statSync(filePath);

            if (now - stat.mtimeMs > maxAge) {
                fs.unlinkSync(filePath);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`🧹 Cleaned ${cleaned} cached images`);
        }
    } catch (err) {
        // Ignore cleanup errors
    }
}

export default { generateImage, cleanupImageCache };

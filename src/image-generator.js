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

/**
 * Generate a branded image card for a social media post.
 * Tries OpenAI DALL-E first, then xAI Grok.
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

    // Try DALL-E first
    if (openaiClient) {
        try {
            return await generateWithDallE(prompt, size);
        } catch (err) {
            console.warn(`⚠️ DALL-E image generation failed: ${err.message}`);
        }
    }

    // Fallback to Grok
    if (GROK_API_KEY) {
        try {
            return await generateWithGrok(prompt);
        } catch (err) {
            console.warn(`⚠️ Grok image generation failed: ${err.message}`);
        }
    }

    throw new Error('No image generation provider available (need OPENAI_API_KEY or XAI_API_KEY)');
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
    };

    return styles[style] || styles.bold;
}

/**
 * Generate image using OpenAI DALL-E
 */
async function generateWithDallE(prompt, size) {
    console.log('🎨 Generating image with DALL-E...');

    const response = await openaiClient.images.generate({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size,
        quality: 'standard',
    });

    const imageUrl = response.data[0]?.url;
    if (!imageUrl) throw new Error('DALL-E returned no image URL');

    // Download and save locally
    const imagePath = path.join(IMAGE_CACHE_DIR, `ghostai-${Date.now()}.png`);
    const imageResponse = await fetch(imageUrl);
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

    const response = await fetch('https://api.x.ai/v1/images/generations', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GROK_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'grok-2-image',
            prompt,
            n: 1,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Grok image API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const base64 = data.data?.[0]?.b64_json;
    const url = data.data?.[0]?.url;

    const imagePath = path.join(IMAGE_CACHE_DIR, `ghostai-${Date.now()}.png`);

    if (base64) {
        fs.writeFileSync(imagePath, Buffer.from(base64, 'base64'));
    } else if (url) {
        const imageResponse = await fetch(url);
        const buffer = Buffer.from(await imageResponse.arrayBuffer());
        fs.writeFileSync(imagePath, buffer);
    } else {
        throw new Error('Grok returned no image data');
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

/**
 * Image Generator
 * Creates branded visual cards for social media posts using AI image generation.
 * Ensures every post has media for Instagram/Facebook even without video.
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildGhostPrompt } from './ghost-character.js';
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
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5';

/**
 * Generate a branded image card for a social media post.
 * Tries Grok first (cheaper), then OpenAI as fallback.
 * @param {string} postText - The post content to create a visual for
 * @param {object} options
 * @param {string} [options.style='bold'] - Style key or 'bachata'/'bachata_music'
 * @param {string} [options.pillar] - Content pillar for flavor keywords
 * @param {string} [options.size='1024x1024'] - Image dimensions
 * @returns {Promise<string>} Path to generated image file
 */
export async function generateImage(postText, options = {}) {
    const {
        style = 'bold',
        size = '1024x1024',
        pillar,
    } = options;

    const prompt = buildImagePrompt(postText, style, pillar);

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
 * 8 visually DISTINCT concepts — human, lifestyle, personal feel.
 * These go on Daniel's personal LinkedIn, so they need to feel like a real person,
 * NOT a tech company. Think: iPhone photos a founder would actually take.
 */
const VISUAL_CONCEPTS = [
    // 0 — Coffee Shop Hustle
    (topic) => `A Latino man working on a laptop at a cozy coffee shop, warm natural light streaming through the window. A cortadito and a notebook sit beside him. The vibe is focused but relaxed, candid iPhone photo. Golden hour window light, shallow depth of field. Topic: "${topic}". No text, no logos.`,
    // 1 — Rooftop Sunset
    (topic) => `Silhouette of a young man standing on a rooftop at sunset overlooking a city skyline (Orlando vibes — low-rise buildings, palm trees). He's looking at his phone, backlit by warm orange and pink sky. Cinematic, contemplative, authentic. Topic: "${topic}". No text.`,
    // 2 — Late Night Desk
    (topic) => `Overhead shot of a clean desk at night — a glowing laptop screen illuminates the space, a half-drunk coffee, AirPods, and a notebook with handwritten notes. Moody ambient lighting from a desk lamp. The vibe is "shipping at midnight." Topic: "${topic}". Cozy, real, no text.`,
    // 3 — Walking & Thinking
    (topic) => `A man walking down a palm-lined street in Orlando wearing casual clothes, AirPods in, looking thoughtful. Warm afternoon light creates long shadows. Shot from slightly behind — feels like a candid street photo. Topic: "${topic}". Natural colors, documentary style, no text.`,
    // 4 — Whiteboard Moment
    (topic) => `A blurry whiteboard in the background covered in diagrams and sticky notes. In the foreground, a hand holds a marker mid-thought. The scene feels like a real brainstorming session — messy, real, in-progress. Warm office lighting. Topic: "${topic}". No text readable.`,
    // 5 — Team Dinner
    (topic) => `A group of friends at an outdoor restaurant table at night, string lights overhead, laughter mid-conversation. Plates of food, drinks on the table. Warm, social, the kind of photo you'd post on a Friday night. Topic: "${topic}". Candid, slightly blurry, real moment. No text.`,
    // 6 — Morning Energy
    (topic) => `A man jogging past a lake at sunrise, earbuds in, palm trees in the background. Golden morning light, slight lens flare. Feels like a wellness/hustle culture photo but authentic — not staged gym content. Topic: "${topic}". Natural photography, no text.`,
    // 7 — Home Office Real
    (topic) => `A lived-in home office — dual monitors, a plant, a framed photo, coffee mug. Natural light from a nearby window. The desk has character — stickers on the laptop, a book open to a random page. Real, not minimalist perfection. Topic: "${topic}". Editorial lifestyle photography, no text.`,
];

/**
 * Extra flavor words injected based on the content pillar — human emotions, not corporate jargon
 */
const PILLAR_KEYWORDS = {
    hotTakes: 'confident energy, strong opinion, main character moment',
    builderLogs: 'late night grind, shipping code, builder energy',
    industryCommentary: 'thoughtful, informed perspective, in-the-know',
    subtleFlex: 'casual confidence, no big deal energy, earned success',
    cta: 'friendly invitation, approachable, genuine connection',
    value: 'sharing knowledge, teaching moment, generosity',
    portfolio: 'proud of the work, showing results, client love',
    bts: 'raw and real, unfiltered, work in progress',
};

/**
 * Time-of-day mood modifiers
 */
function getTimeOfDayMood() {
    const hour = new Date().getHours();
    if (hour < 10) return 'warm morning light, soft golden tones, fresh energy';
    if (hour < 14) return 'bright midday clarity, clean whites and blues, sharp focus';
    if (hour < 18) return 'warm afternoon glow, amber highlights, golden hour feel';
    return 'dramatic evening mood, deep shadows, moody atmosphere, cool tones';
}

/**
 * Load history of recently used visual concept indices
 */
function loadImageHistory() {
    const historyFile = path.join(IMAGE_CACHE_DIR, 'history.json');
    try {
        if (fs.existsSync(historyFile)) {
            return JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
        }
    } catch { /* ignore */ }
    return { recent: [] };
}

/**
 * Save the concept index to history (keep last 6)
 */
function saveImageHistory(conceptIndex) {
    const historyFile = path.join(IMAGE_CACHE_DIR, 'history.json');
    const history = loadImageHistory();
    history.recent.push(conceptIndex);
    if (history.recent.length > 6) history.recent = history.recent.slice(-6);
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
}

/**
 * Pick a concept index that hasn't been used recently
 */
function pickFreshConcept() {
    const history = loadImageHistory();
    const recent = new Set(history.recent);

    // Find concepts not recently used
    const available = VISUAL_CONCEPTS.map((_, i) => i).filter(i => !recent.has(i));

    // If all have been used recently, just pick random
    const pool = available.length > 0 ? available : VISUAL_CONCEPTS.map((_, i) => i);
    const chosen = pool[Math.floor(Math.random() * pool.length)];

    saveImageHistory(chosen);
    return chosen;
}

/**
 * Build a style-appropriate prompt for image generation.
 * Rotates through 8 distinct visual concepts with dedup, pillar context, and time-of-day mood.
 */
function buildImagePrompt(postText, style, pillar) {
    // Extract the core topic (first 150 chars, strip hashtags/emojis)
    const topic = postText
        .replace(/#\w+/g, '')
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .trim()
        .substring(0, 150);

    // Ghost character mode — consistent AI influencer
    if (style === 'ghost') {
        return buildGhostPrompt(postText, { pillar });
    }

    // Special named styles override the concept rotation
    const namedStyles = {
        bachata: `Warm, vibrant social media graphic for bachata dance culture. Golden sunset tones, Caribbean ocean blues, and tropical palm silhouettes. A couple dancing bachata in close embrace under warm string lights. Dominican Republic inspired — think Punta Cana beach nights, neon-lit dance clubs, acoustic guitar close-ups. Topic: "${topic}". Rich, sensual, premium Latin dance aesthetic. Photorealistic style. No text or words in image.`,
        bachata_music: `Premium music industry visual for a bachata record label. Dark moody studio with warm amber and purple neon accents. Dominican guitar, bongos, or mixing board in cinematic lighting. Feels like a late-night studio session in Santo Domingo. Topic: "${topic}". High-end music production aesthetic. No text in image.`,
    };

    if (namedStyles[style]) return namedStyles[style];

    // Pick a fresh concept that hasn't been used recently
    const conceptIdx = pickFreshConcept();
    const basePrompt = VISUAL_CONCEPTS[conceptIdx](topic);

    // Layer on pillar keywords and time-of-day mood
    const pillarFlavor = PILLAR_KEYWORDS[pillar] || '';
    const timeMood = getTimeOfDayMood();

    console.log(`   🎨 Visual concept: #${conceptIdx} | Pillar: ${pillar || 'default'} | Mood: ${timeMood.split(',')[0]}`);

    return `${basePrompt} Mood: ${timeMood}. ${pillarFlavor ? `Atmosphere: ${pillarFlavor}.` : ''}`;
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

    // gpt-image-1.5 doesn't use 'quality' param, dall-e-3 does
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

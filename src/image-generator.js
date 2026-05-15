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
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';

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
 * 16 visually DISTINCT concepts — wildly different compositions, settings, and moods.
 * Each concept has unique lighting, angle, and subject matter to guarantee
 * the feed never looks repetitive. Think: a photographer's diverse portfolio.
 */
const VISUAL_CONCEPTS = [
    // 0 — Coffee Shop Hustle
    (topic) => `A Latino man working on a laptop at a cozy coffee shop, warm natural light streaming through the window. A cortadito and a notebook sit beside him. Focused but relaxed, candid iPhone photo. Golden hour window light, shallow depth of field. Topic: "${topic}". No text, no logos.`,
    // 1 — Neon Rain Walk
    (topic) => `A man walking alone on a rain-soaked city street at night, neon signs reflecting off wet pavement in purples and blues. He's wearing a dark jacket, hands in pockets, looking ahead with quiet determination. Shot from across the street — cinematic wide angle. Topic: "${topic}". Blade Runner mood, no text.`,
    // 2 — Aerial Drone — Orlando Skyline
    (topic) => `Drone aerial photograph of downtown Orlando at twilight, city lights beginning to glow, Lake Eola visible below. The sky transitions from deep indigo to burnt orange at the horizon. Feels like an establishing shot from a documentary. Topic: "${topic}". Ultra-wide, architectural photography, no text.`,
    // 3 — Dark Studio Portrait
    (topic) => `Dramatic portrait of a man lit by a single strip light from the left, face half in shadow. He's wearing a simple black tee, looking directly at camera with intensity. Dark studio background, Rembrandt lighting. The mood is serious, powerful, editorial. Topic: "${topic}". Fashion photography, no text.`,
    // 4 — Abstract Tech Close-Up
    (topic) => `Extreme macro close-up of circuit board traces with shallow depth of field, tiny components glowing with warm amber light. Abstract, almost alien — feels like a landscape from another world. Topic: "${topic}". Macro photography, teal and copper tones, no text.`,
    // 5 — Boardroom Power Shot
    (topic) => `A man standing at the head of a modern glass conference table, floor-to-ceiling windows behind him showing a city view at golden hour. He's mid-gesture, presenting to an unseen audience. Confident, executive energy. Topic: "${topic}". Corporate editorial photography, no text.`,
    // 6 — Beach Sunrise Meditation
    (topic) => `Silhouette of a person sitting cross-legged on a Florida beach at sunrise, waves lapping gently. The sky is painted in coral, peach, and lavender. Peaceful, minimal, the kind of photo that stops the scroll. Shot from behind, wide composition. Topic: "${topic}". Mindfulness aesthetic, no text.`,
    // 7 — Car Interior Night Drive
    (topic) => `Interior of a car at night, dashboard lights casting a warm glow. Through the windshield, city highway lights streak by in a long exposure. A hand rests on the steering wheel. The vibe is late-night drive, introspective playlist energy. Topic: "${topic}". Automotive mood photography, no text.`,
    // 8 — Whiteboard War Room
    (topic) => `A massive whiteboard covered in hand-drawn system architecture diagrams, arrows, and sticky notes. Shot from an angle that makes it feel like a detective board. Warm office lighting, depth of field blur on edges. Topic: "${topic}". Documentary style, no readable text.`,
    // 9 — Tropical Patio Work Session
    (topic) => `A laptop open on a patio table surrounded by tropical plants — monstera, bird of paradise. A glass of cold brew sweats in the humidity. Dappled sunlight through palm fronds creates shadow patterns on the table. Topic: "${topic}". Lifestyle editorial, lush greens, no text.`,
    // 10 — Server Room Glow
    (topic) => `Rows of server racks in a data center, blue and green LED lights creating geometric patterns in the darkness. A technician's silhouette stands between aisles. Cold, precise, futuristic atmosphere. Topic: "${topic}". Tech infrastructure photography, no text.`,
    // 11 — Rooftop Golden Hour
    (topic) => `A man standing on a rooftop at sunset overlooking a city skyline with palm trees. He's looking at his phone, backlit by warm orange and pink sky. Cinematic, contemplative, authentic. Wide shot with skyline context. Topic: "${topic}". No text.`,
    // 12 — Late Night Code Session
    (topic) => `Overhead flat-lay of a desk at 2AM — glowing laptop with code on screen, energy drink, mechanical keyboard, scattered sticky notes. The only light is the screen glow and a small desk lamp. Intimate, real. Topic: "${topic}". Cozy developer aesthetic, no text.`,
    // 13 — Street Art Backdrop
    (topic) => `A man leaning against a vibrant graffiti-covered wall in an urban alley, arms crossed, wearing clean streetwear. The mural behind him bursts with color — abstract shapes, neon pinks, electric blues. Topic: "${topic}". Urban portrait, high contrast, no text.`,
    // 14 — Analog Film Texture
    (topic) => `A candid moment shot on 35mm film — visible grain, warm color shift, light leak on the right edge. A man in a bookstore pulling a book off the shelf, natural overhead lighting. Nostalgic, authentic, imperfect beauty. Topic: "${topic}". Film photography aesthetic, no text.`,
    // 15 — AI Visualization Abstract
    (topic) => `Abstract visualization of a neural network — glowing nodes connected by luminous threads in deep space. Colors shift from electric blue at the core to warm gold at the edges. Feels like looking at a galaxy made of intelligence. Topic: "${topic}". Data art, generative aesthetic, no text.`,
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
 * Save the concept index to history (keep last 12 — with 16 concepts, this guarantees no repeats for 12 posts)
 */
function saveImageHistory(conceptIndex) {
    const historyFile = path.join(IMAGE_CACHE_DIR, 'history.json');
    const history = loadImageHistory();
    history.recent.push(conceptIndex);
    if (history.recent.length > 12) history.recent = history.recent.slice(-12);
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
 * Rotates through 16 distinct visual concepts with dedup, pillar context, and time-of-day mood.
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

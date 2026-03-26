/**
 * Ghost Character — AI Influencer Identity Module
 * ================================================
 * Defines "Ghost" — the consistent AI persona for Ghost AI Systems.
 * Every Instagram post features this same character to train the
 * algorithm to recognize a single face associated with the brand.
 *
 * Character: Black man, late 30s, tapered fade, trimmed beard.
 * Documentary-style, ARRI Alexa aesthetic, natural lighting.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGE_CACHE_DIR = path.join(__dirname, '..', '.image-cache');

// ═══════════════════════════════════════════════════════════════
// CHARACTER IDENTITY — never changes across generations
// ═══════════════════════════════════════════════════════════════
export const GHOST_IDENTITY = [
    'A Black man in his late 30s with a tapered fade and trimmed beard',
    'Natural skin texture, no retouching, no gloss',
    'Calm intensity in his expression, focused but not forced',
    'Documentary-style, shot on ARRI Alexa, slight film grain, natural lighting',
].join('. ') + '.';

// ═══════════════════════════════════════════════════════════════
// WARDROBE ROTATION — 6 distinct looks
// ═══════════════════════════════════════════════════════════════
const GHOST_WARDROBE = [
    'Wearing a fitted black tee, clean and minimal',
    'Wearing a dark navy henley, sleeves pushed up',
    'Wearing a black crew-neck under a charcoal bomber jacket',
    'Wearing a dark button-down shirt, top button undone, no tie',
    'Wearing a fitted black jacket over a dark shirt',
    'Wearing all black — shirt, pants, watch, subtle and clean',
];

// ═══════════════════════════════════════════════════════════════
// SCENE TEMPLATES — 8 cinematic environments featuring Ghost
// ═══════════════════════════════════════════════════════════════
const GHOST_SCENES = [
    // 0 — Dark Studio
    (identity, wardrobe, topic) =>
        `${identity} ${wardrobe}. Dark studio, single key light from the left, a monitor with code behind him. He sits at a desk and looks at camera. Topic context: "${topic}". Natural lighting, shallow depth of field, no text in image.`,

    // 1 — Modern Office
    (identity, wardrobe, topic) =>
        `${identity} ${wardrobe}. Modern office, ambient monitors in the background, warm tungsten lighting. He leans forward in his chair, speaking. Topic context: "${topic}". Documentary feel, 35mm lens, no text.`,

    // 2 — City Walk
    (identity, wardrobe, topic) =>
        `${identity} ${wardrobe}. Walking down a palm-lined street at golden hour. Warm amber light, long shadows. Shot from slightly behind, candid documentary style. Topic context: "${topic}". Natural photography, no text.`,

    // 3 — Window Light
    (identity, wardrobe, topic) =>
        `${identity} ${wardrobe}. Standing near a window, natural light on one side of his face. Simple interior, out of focus city view. Contemplative, looking out. Topic context: "${topic}". Portrait, shallow DOF, no text.`,

    // 4 — Late Night Desk
    (identity, wardrobe, topic) =>
        `${identity} ${wardrobe}. Seated at a desk late at night, face lit by laptop screen glow. Coffee nearby. Dark room, single-source lighting. Topic context: "${topic}". Moody, cinematic, no text.`,

    // 5 — Stadium/Stage
    (identity, wardrobe, topic) =>
        `${identity} ${wardrobe}. Standing on a minimal stage, single spotlight from above. Dark background, audience silhouettes. Mid-speech, one hand gesturing. Topic context: "${topic}". Event photography, no text.`,

    // 6 — Urban Night
    (identity, wardrobe, topic) =>
        `${identity} ${wardrobe}. On a city street at night, streetlights and soft neon in the background. Arms at his sides, looking at camera. Wet pavement. Topic context: "${topic}". Street photography, no text.`,

    // 7 — Hallway Walk
    (identity, wardrobe, topic) =>
        `${identity} ${wardrobe}. Walking through a dimly lit concrete hallway, camera tracking alongside him. Raw, gritty, cinéma vérité feel. Topic context: "${topic}". Handheld camera, no text.`,
];

// ═══════════════════════════════════════════════════════════════
// PILLAR MOOD MODIFIERS — emotion layer on top of scene
// ═══════════════════════════════════════════════════════════════
const GHOST_PILLAR_MOODS = {
    drill: 'Determined focus, commanding but grounded, speaking with earned authority',
    weapons: 'Strategic calm, showing capability, operational clarity',
    grit: 'Weathered resolve, hard-won experience, quiet toughness',
    funnel: 'Purposeful energy, building something, recruiting with conviction',
    systems: 'Thoughtful precision, engineering mindset, methodical confidence',
};

/**
 * Time-of-day lighting modifier
 */
function getTimeOfDayLighting() {
    const hour = new Date().getHours();
    if (hour < 10) return 'Warm golden morning light, soft amber tones';
    if (hour < 14) return 'Clean bright midday light, sharp contrast';
    if (hour < 18) return 'Rich golden hour warmth, deep amber highlights';
    return 'Dramatic night lighting, deep shadows, neon and ambient glow';
}

/**
 * Load and save scene history to prevent immediate repeats.
 * Reuses same pattern as image-generator.js
 */
function loadSceneHistory() {
    const historyFile = path.join(IMAGE_CACHE_DIR, 'ghost-scene-history.json');
    try {
        if (fs.existsSync(historyFile)) {
            return JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
        }
    } catch { /* ignore */ }
    return { recentScenes: [], recentWardrobe: [] };
}

function saveSceneHistory(sceneIndex, wardrobeIndex) {
    const historyFile = path.join(IMAGE_CACHE_DIR, 'ghost-scene-history.json');
    const history = loadSceneHistory();

    history.recentScenes.push(sceneIndex);
    if (history.recentScenes.length > 6) {
        history.recentScenes = history.recentScenes.slice(-6);
    }

    history.recentWardrobe.push(wardrobeIndex);
    if (history.recentWardrobe.length > 4) {
        history.recentWardrobe = history.recentWardrobe.slice(-4);
    }

    fs.mkdirSync(path.dirname(historyFile), { recursive: true });
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
}

/**
 * Pick a fresh scene index not used recently
 */
export function pickFreshScene(randomFn = Math.random) {
    const history = loadSceneHistory();
    const recentScenes = new Set(history.recentScenes);

    const available = GHOST_SCENES.map((_, i) => i).filter(i => !recentScenes.has(i));
    const pool = available.length > 0 ? available : GHOST_SCENES.map((_, i) => i);

    return pool[Math.floor(randomFn() * pool.length)];
}

/**
 * Pick a fresh wardrobe index not used recently
 */
function pickFreshWardrobe(randomFn = Math.random) {
    const history = loadSceneHistory();
    const recentWardrobe = new Set(history.recentWardrobe);

    const available = GHOST_WARDROBE.map((_, i) => i).filter(i => !recentWardrobe.has(i));
    const pool = available.length > 0 ? available : GHOST_WARDROBE.map((_, i) => i);

    return pool[Math.floor(randomFn() * pool.length)];
}

/**
 * Build a complete image generation prompt featuring Ghost.
 *
 * @param {string} postText - The caption/post content for topic extraction
 * @param {object} [options]
 * @param {string} [options.pillar] - Content pillar for mood modifiers
 * @param {number} [options.sceneIndex] - Force a specific scene (for testing)
 * @param {number} [options.wardrobeIndex] - Force a specific wardrobe (for testing)
 * @param {Function} [options.randomFn] - Custom random function (for testing)
 * @returns {string} Complete image generation prompt
 */
export function buildGhostPrompt(postText, options = {}) {
    const {
        pillar,
        sceneIndex: forcedScene,
        wardrobeIndex: forcedWardrobe,
        randomFn = Math.random,
    } = options;

    // Extract topic from post text
    const topic = String(postText || '')
        .replace(/#\w+/g, '')
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .trim()
        .substring(0, 150);

    // Pick scene and wardrobe
    const sceneIdx = forcedScene ?? pickFreshScene(randomFn);
    const wardrobeIdx = forcedWardrobe ?? pickFreshWardrobe(randomFn);

    const wardrobe = GHOST_WARDROBE[wardrobeIdx];
    const sceneBuilder = GHOST_SCENES[sceneIdx];
    const basePrompt = sceneBuilder(GHOST_IDENTITY, wardrobe, topic);

    // Layer mood and lighting
    const pillarMood = GHOST_PILLAR_MOODS[pillar] || '';
    const lighting = getTimeOfDayLighting();

    // Save history for dedup
    if (forcedScene == null) {
        saveSceneHistory(sceneIdx, wardrobeIdx);
    }

    console.log(`   👻 Ghost scene: #${sceneIdx} | Wardrobe: #${wardrobeIdx} | Pillar: ${pillar || 'default'}`);

    let prompt = basePrompt;
    if (lighting) prompt += ` Lighting: ${lighting}.`;
    if (pillarMood) prompt += ` Mood: ${pillarMood}.`;

    return prompt;
}

export { GHOST_WARDROBE, GHOST_SCENES, GHOST_PILLAR_MOODS };

export default {
    GHOST_IDENTITY,
    GHOST_WARDROBE,
    GHOST_SCENES,
    GHOST_PILLAR_MOODS,
    buildGhostPrompt,
    pickFreshScene,
};

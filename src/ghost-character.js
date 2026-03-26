/**
 * Ghost Character — AI Influencer Identity Module
 * ================================================
 * Defines "Ghost" — the consistent AI persona for Ghost AI Systems.
 * Every Instagram post features this same character to train the
 * algorithm to recognize a single face associated with the brand.
 *
 * Character locked from reference image: dark-skinned Black man,
 * early-to-mid 30s, athletic build, tapered fade, full beard,
 * intense commanding expression.
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
    'A dark-skinned Black man, early-to-mid 30s, athletic muscular build',
    'Short tapered fade haircut with natural texture on top',
    'Close-cropped full beard with sharp jawline',
    'Intense focused expression with commanding presence, never smiling',
    'Strong brow, piercing dark brown eyes, confident posture',
].join('. ') + '.';

// ═══════════════════════════════════════════════════════════════
// WARDROBE ROTATION — 6 distinct looks
// ═══════════════════════════════════════════════════════════════
const GHOST_WARDROBE = [
    'Wearing a tailored dark charcoal three-piece suit with a patterned tie and pocket square',
    'Wearing a black fitted tactical jacket over a dark henley, military-inspired clean look',
    'Wearing a premium black turtleneck under a dark grey overcoat, executive minimalist',
    'Wearing a dark navy blazer over a crisp white shirt, no tie, top button undone',
    'Wearing a matte black bomber jacket over a dark crew-neck tee, gold watch visible',
    'Wearing an all-black ensemble — black shirt, black pants, sleeves slightly rolled',
];

// ═══════════════════════════════════════════════════════════════
// SCENE TEMPLATES — 8 cinematic environments featuring Ghost
// ═══════════════════════════════════════════════════════════════
const GHOST_SCENES = [
    // 0 — Cyberpunk Rooftop
    (identity, wardrobe, topic) =>
        `${identity} ${wardrobe}. Standing on a rooftop at night overlooking a cyberpunk cityscape with neon signs reflecting off wet surfaces. Futuristic skyscrapers with holographic billboards in the background. Cinematic lighting — deep blues, electric purples, and red neon accents. Shot from a slight low angle, powerful stance. Topic context: "${topic}". Photorealistic, 8K quality, no text in image.`,

    // 1 — Dark Luxury Office
    (identity, wardrobe, topic) =>
        `${identity} ${wardrobe}. Seated in a dark luxury office behind a massive desk. Holographic screens and data visualizations float in the air around him. Floor-to-ceiling windows show a night city view. Ambient lighting from screens casts blue-white glow on his face. The mood is powerful, calculated, AI executive. Topic context: "${topic}". Photorealistic, cinematic color grading, no text.`,

    // 2 — Orlando Street Walk
    (identity, wardrobe, topic) =>
        `${identity} ${wardrobe}. Walking down a palm-lined Orlando street at golden hour. Warm amber sunlight creates long dramatic shadows. Shot from slightly behind and to the side, candid documentary style. He has AirPods in, looking ahead with purpose. Tropical architecture in the background. Topic context: "${topic}". Natural photography, cinematic depth of field, no text.`,

    // 3 — Glass Wall Sunset
    (identity, wardrobe, topic) =>
        `${identity} ${wardrobe}. Standing at a floor-to-ceiling glass wall in a high-rise, silhouetted against a vivid orange and purple sunset. One hand in pocket, looking out over the city with a reflective expression. The glass reflects the city lights below. Dramatic backlighting, cinematic composition. Topic context: "${topic}". Premium photography, no text.`,

    // 4 — Late Night Coding
    (identity, wardrobe, topic) =>
        `${identity} ${wardrobe}. Seated at a sleek dark desk late at night, face illuminated by the glow of a laptop screen showing code. A cortadito and AirPods case sit nearby. The room is dark except for the screen light and a subtle ambient desk lamp. Moody, focused, shipping at midnight. Topic context: "${topic}". Dramatic single-source lighting, photorealistic, no text.`,

    // 5 — Stage Speaker
    (identity, wardrobe, topic) =>
        `${identity} ${wardrobe}. Standing on a dark conference stage, a single dramatic spotlight illuminating him from above. Audience silhouettes visible in the foreground. He is mid-speech, one hand gesturing with authority. Large screen behind him glows with abstract AI/tech visuals. The mood is powerful keynote energy. Topic context: "${topic}". Event photography, cinematic lighting, no text.`,

    // 6 — Night City Car
    (identity, wardrobe, topic) =>
        `${identity} ${wardrobe}. Leaning against a matte black luxury car at night on a city street. Streetlights and neon signs create colorful bokeh in the background. Arms crossed, looking directly at camera with quiet intensity. Wet pavement reflects the lights. The vibe is understated power, not flashy. Topic context: "${topic}". Automotive editorial photography, no text.`,

    // 7 — Cinematic Portrait
    (identity, wardrobe, topic) =>
        `${identity} ${wardrobe}. Close-up portrait shot with dramatic Rembrandt side-lighting. Dark moody background with subtle smoke or haze. Half his face is lit, half in shadow. Looking slightly off-camera. Golden rim light catches the edge of his jaw and ear. Intense, magnetic, unforgettable. Topic context: "${topic}". Studio portrait, 85mm lens feel, shallow depth of field, no text.`,
];

// ═══════════════════════════════════════════════════════════════
// PILLAR MOOD MODIFIERS — emotion layer on top of scene
// ═══════════════════════════════════════════════════════════════
const GHOST_PILLAR_MOODS = {
    drill: 'Marine Corps drill instructor intensity, commanding authority, zero tolerance for excuses',
    weapons: 'Tactical precision, showing the arsenal, strategic dominance, operational superiority',
    grit: 'Battle-tested resilience, forged in fire, earned scars, unstoppable force',
    funnel: 'Visionary recruitment energy, building an army of builders, mission-driven purpose',
    systems: 'Engineer precision, systems architect mentality, quiet operational power',
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

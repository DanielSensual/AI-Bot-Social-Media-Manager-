/**
 * Bachata After Dark — FB Page + Instagram content agent
 *
 * Posts 2x/day to the Bachata After Dark FB page (1242888518898385) and
 * mirrors to the linked IG @bachatafterdark. Content pillars, in priority:
 *   1. recap    — a video dropped in data/bachata-afterdark-recaps/ (reel + FB video)
 *   2. event    — upcoming events from data/bachata-afterdark-events.json
 *   3. rotation — culture | engagement | carousel (no-repeat memory, persisted)
 *
 * Captions are LLM-generated in the After Dark voice, QC-gated (no invented
 * events, no fake stats), with template fallbacks. Images ride the existing
 * 'bachata' style in image-generator.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { postToFacebookWithImage, postToFacebookWithVideo } from './facebook-client.js';
import {
    postToInstagram,
    postInstagramReel,
    postInstagramCarousel,
    uploadToTempHost,
} from './instagram-client.js';
import { generateImage, cleanupImageCache } from './image-generator.js';
import { isDuplicate, record } from './post-history.js';
import { hasLLMProvider, generateText } from './llm-client.js';
import { reviewPost, formatViolations } from './qc-gate.js';

dotenv.config({ quiet: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE_ID = process.env.BACHATA_AD_PAGE_ID || '1242888518898385';
const EVENTS_PATH = path.join(__dirname, '..', 'data', 'bachata-afterdark-events.json');
const RECAP_DIR = path.join(__dirname, '..', 'data', 'bachata-afterdark-recaps');
const STATE_PATH = path.join(__dirname, '..', 'data', 'bachata-afterdark-state.json');
const EVENT_PROMO_WINDOW_DAYS = 21;

const BRAIN = `You write social posts for "Bachata After Dark" — the late-night bachata social scene page (Orlando based, but the audience is dancers everywhere).

VOICE:
- A dancer talking to dancers at 1am — warm, sensual, a little playful, never corporate.
- Short human sentences. Contractions. A light Spanglish sprinkle is welcome ("pa' la pista", "con sabor") but never forced.
- Community first: connection, musicality, the social floor, the after-hours vibe.

HARD RULES:
- NEVER invent an event, date, venue, time, or price. Only mention event facts explicitly given to you.
- NEVER invent statistics, attendance numbers, or claims about specific people.
- No bullet lists or arrow lists. Flowing short paragraphs, one blank line between them.
- Max 2 hashtags, only at the end, only if natural.
- 1-2 emojis max, placed naturally.
- Keep captions between 120 and 500 characters unless told otherwise.
- End with a question OR a closing line — not both.`;

const FALLBACKS = {
    culture: [
        'The best dances of the night usually happen after midnight.\n\nThe floor thins out, the DJ digs deeper, and the people still standing are the ones who really came to dance.\n\nThat last hour is the whole point. 🌙',
        'Musicality isn\'t hitting every accent.\n\nIt\'s choosing the right ones — and letting the rest breathe.\n\nThe pause is part of the dance too.',
        'You can always tell who trains their basic.\n\nNot from the tricks. From how the simplest step feels con sabor.\n\nFundamentals are the flex.',
        'Bachata was banned from Dominican radio once. "Música de amargue," they called it.\n\nNow it owns dance floors on every continent.\n\nRespect the roots every time you step on the floor.',
    ],
    engagement: [
        'Honest question for the late-night crew:\n\nwhat\'s the ONE song that, no matter how tired you are, pulls you back onto the floor?\n\nDrop it below — building a playlist. 🎶',
        'Settle this: sensual, traditional, or moderna — which one takes the longest to actually get GOOD at?\n\nDefend your answer.',
        'What time do the real dances start for you — 11pm? Midnight? 1am?\n\nBe honest about how late you\'ve closed a social.',
        'Leads: what\'s harder — musicality or connection?\nFollows: what do you actually notice first in a dance?\n\nComparing notes.',
    ],
    recap: [
        'Last night, after dark. 🌙\n\nIf you were on that floor, you already know. If you weren\'t — this is what you missed.',
        'The kind of night that reminds you why you started dancing.\n\nSound on. Save this one.',
    ],
};

// ── State (pillar rotation memory across one-shot runs) ─────────────────────

function loadState() {
    try {
        return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
    } catch {
        return { recentPillars: [] };
    }
}

function saveState(state) {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function rememberPillar(state, pillar) {
    state.recentPillars = [...(state.recentPillars || []), pillar].slice(-3);
    saveState(state);
}

// ── Pillar selection ────────────────────────────────────────────────────────

function nextRecapVideo() {
    try {
        const files = fs.readdirSync(RECAP_DIR)
            .filter((f) => /\.(mp4|mov)$/i.test(f))
            .sort();
        return files.length ? path.join(RECAP_DIR, files[0]) : null;
    } catch {
        return null;
    }
}

function upcomingEvents(now = new Date()) {
    try {
        const events = JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf-8'));
        return events.filter((e) => {
            const d = new Date(`${e.date}T23:59:59`);
            const days = (d - now) / 86400000;
            return days >= 0 && days <= EVENT_PROMO_WINDOW_DAYS;
        });
    } catch {
        return [];
    }
}

function pickPillar(state, override = null) {
    if (override) return override;
    if (nextRecapVideo()) return 'recap';

    const rotation = ['culture', 'engagement', 'carousel'];
    if (upcomingEvents().length) rotation.push('event', 'event'); // weight events up when they exist

    const recent = state.recentPillars || [];
    const fresh = rotation.filter((p) => !recent.includes(p));
    const pool = fresh.length ? fresh : rotation;
    return pool[Math.floor(Math.random() * pool.length)];
}

// ── Visual direction ────────────────────────────────────────────────────────
// Detailed cinematic scenes — never "two people dancing" centered on a plain
// background. Used when the LLM doesn't supply a matched imagePrompt.
const SCENE_POOL = [
    'Overhead wide shot of a packed bachata social at 1am — dozens of couples mid-turn on a worn wooden floor, warm amber uplights against exposed brick, a haze of atmosphere catching red and gold beams, motion blur on the spinning dresses at the edges of frame. Documentary event photography, 24mm, shallow grain.',
    'Extreme close-up of a Dominican guitar\'s strings mid-strum, fingertips catching warm stage light, deep bokeh behind resolving into blurred string lights and silhouetted dancers on a patio social. Macro lens, cinematic shallow depth of field, amber and teal palette.',
    'A DJ booth at a late-night Latin social seen from the dance floor — vinyl controller glowing, the DJ leaning into one headphone, red neon wash and floating dust in the beam of a single moving head light, crowd hands raised in soft-focus foreground. Concert photography, high contrast.',
    'Low angle across a dance floor at shoe level — a pair of suede dance heels and leather dress shoes frozen mid basic-step, wooden floorboards reflecting strings of Edison bulbs above, other feet blurred with motion around them. 35mm, f/1.8, warm nostalgic tone.',
    'A courtyard social under a canopy of string lights after midnight — long exposure leaving light trails from dancers in motion, palm silhouettes against a deep indigo sky, one couple sharp in the center of the blur. Fine-art night photography, rich shadows.',
    'Backlit silhouettes of dancers against a wall of deep red club light, atmospheric haze, one dramatic shaft of white light cutting the frame diagonally, sweat and motion frozen at 1/25 shutter. Moody editorial photography, cinematic composition, nearly abstract.',
];

const IMAGE_QUALITY_SUFFIX = 'Photorealistic, cinematic color grade, editorial quality, no text or words in the image, no watermarks, no distorted faces or hands.';

function fallbackScene() {
    return SCENE_POOL[Math.floor(Math.random() * SCENE_POOL.length)];
}

async function generateAfterDarkImage(imagePrompt) {
    return generateImage('', {
        rawPrompt: `${imagePrompt} ${IMAGE_QUALITY_SUFFIX}`,
        provider: 'openai', // gpt-image-2 — pinned after grok images came out generic (2026-07-13)
    });
}

// ── Caption generation (LLM + QC gate, template fallback) ───────────────────

function safeJsonParse(content) {
    const raw = String(content || '').trim();
    try {
        return JSON.parse(raw);
    } catch {
        const m = raw.match(/\{[\s\S]*\}/);
        if (!m) return null;
        try { return JSON.parse(m[0]); } catch { return null; }
    }
}

async function generateCaption(pillar, context = '', qcFeedback = '') {
    if (!hasLLMProvider()) return null;

    const feedback = qcFeedback
        ? `\n\nYour previous draft was REJECTED by QC: ${qcFeedback}\nFix every violation. Do not invent events, dates, numbers, or results.`
        : '';

    const ask = {
        culture: 'Write one culture/technique/history post for bachata dancers. Pick a specific angle (musicality, connection, a fundamentals truth, a piece of bachata history, late-night social culture).',
        engagement: 'Write one engagement post — a question, debate, or poll-style prompt that gets dancers commenting. One clear question, easy to answer from the phone.',
        event: `Write one event promo post using ONLY these event facts (do not add or embellish any detail):\n${context}\nMake people feel the night, state the facts plainly, and end asking who's coming.`,
        recap: 'Write one short recap caption for a video from last night\'s bachata social. No specific claims about attendance or people — pure vibe.',
    }[pillar];

    const { text } = await generateText({
        prompt: `${BRAIN}\n\n---\n\n${ask}\n\nAlso art-direct the photo that accompanies this post. NOT a generic "couple dancing" shot — a specific, detailed cinematic scene: name the setting, camera angle, lens/framing, lighting, palette, and mood. Late-night Latin social world (floors, DJ booths, guitars, string-light patios, silhouettes, shoes, hands — pick what fits the caption). No text in the image.\n\nReturn strict JSON only:\n{\n  "caption": "the post caption",\n  "imagePrompt": "the detailed scene description"\n}${feedback}`,
        maxOutputTokens: 700,
    });

    const parsed = safeJsonParse(text);
    const caption = String(parsed?.caption || '').trim();
    if (caption.length < 40) return null;
    return {
        caption,
        imagePrompt: String(parsed?.imagePrompt || '').trim() || fallbackScene(),
    };
}

async function qcApprovedCaption(pillar, context = '') {
    let feedback = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
        const generated = await generateCaption(pillar, context, feedback);
        const fallbackCaption = FALLBACKS[pillar]?.[Math.floor(Math.random() * (FALLBACKS[pillar]?.length || 1))];
        const candidate = generated || (fallbackCaption ? { caption: fallbackCaption, imagePrompt: fallbackScene() } : null);
        if (!candidate) return null;

        const qc = reviewPost(candidate.caption, { platform: 'facebook' });
        if (!qc.pass) {
            feedback = formatViolations(qc.violations);
            console.warn(`   🚧 QC rejected attempt ${attempt}/3: ${feedback}`);
            continue;
        }
        if (isDuplicate(candidate.caption)) {
            feedback = 'Caption too similar to a recent post — take a completely different angle.';
            console.warn(`   Duplicate detected (attempt ${attempt}/3), regenerating...`);
            continue;
        }
        return candidate;
    }
    return null;
}

// ── Carousel (educational slides) ───────────────────────────────────────────

async function generateCarouselPlan(qcFeedback = '') {
    if (!hasLLMProvider()) return null;

    const feedback = qcFeedback ? `\n\nPrevious draft REJECTED by QC: ${qcFeedback}. Fix every violation.` : '';
    const { text } = await generateText({
        prompt: `${BRAIN}\n\n---\n\nDesign an educational Instagram CAROUSEL for bachata dancers: one focused mini-lesson (examples: reading the music's phrasing, connection basics for leads, styling without losing timing, social floor etiquette, the anatomy of bachata rhythm, how to survive your first social). Pick ONE topic.\n\nReturn strict JSON only:\n{\n  "caption": "feed caption for the carousel (needs a hook + tell them to swipe)",\n  "slides": [ { "heading": "3-6 word slide heading", "body": "one tight sentence for the slide" } ]\n}\n\nExactly 4 slides. Slide 1 is the hook/title slide.${feedback}`,
        maxOutputTokens: 700,
    });

    const plan = safeJsonParse(text);
    if (!plan?.caption || !Array.isArray(plan.slides) || plan.slides.length < 3) return null;
    return { caption: plan.caption.trim(), slides: plan.slides.slice(0, 4) };
}

// ── Posting helpers ─────────────────────────────────────────────────────────

// facebook-client resolves the page from env — scope it to After Dark per call
async function onAfterDarkPage(fn) {
    const prev = process.env.FACEBOOK_PAGE_ID;
    process.env.FACEBOOK_PAGE_ID = PAGE_ID;
    try {
        return await fn();
    } finally {
        if (prev === undefined) delete process.env.FACEBOOK_PAGE_ID;
        else process.env.FACEBOOK_PAGE_ID = prev;
    }
}

const igConfig = { pageId: PAGE_ID };

// ── Main cycle ──────────────────────────────────────────────────────────────

export async function runAfterDarkCycle(options = {}) {
    const dryRun = Boolean(options.dryRun);
    const state = loadState();
    const pillar = pickPillar(state, options.pillar || null);

    console.log(`\n${'═'.repeat(58)}`);
    console.log(`  🌙 Bachata After Dark — pillar: ${pillar}${dryRun ? ' (DRY RUN)' : ''}`);
    console.log(`  📅 ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
    console.log('═'.repeat(58));

    if (pillar === 'recap') {
        const video = nextRecapVideo();
        const caption = (await qcApprovedCaption('recap'))?.caption
            || FALLBACKS.recap[Math.floor(Math.random() * FALLBACKS.recap.length)];
        console.log(`\nCaption:\n${caption}\n\nVideo: ${path.basename(video)}`);
        if (dryRun) return { dryRun: true, pillar, caption };

        const hostedUrl = await uploadToTempHost(video);
        const igResult = await postInstagramReel(caption, hostedUrl, igConfig)
            .catch((e) => { console.error(`   IG reel failed (continuing): ${e.message}`); return null; });
        const fbResult = await onAfterDarkPage(() => postToFacebookWithVideo(caption, video))
            .catch((e) => { console.error(`   FB video failed: ${e.message}`); return null; });

        if (igResult || fbResult) {
            record({ pillar: 'bachata_ad_recap', area: 'BachataAfterDark', textLength: caption.length });
            const postedDir = path.join(RECAP_DIR, 'posted');
            fs.mkdirSync(postedDir, { recursive: true });
            fs.renameSync(video, path.join(postedDir, path.basename(video)));
            console.log(`✅ Recap posted (IG: ${Boolean(igResult)}, FB: ${Boolean(fbResult)}) — video archived`);
        }
        rememberPillar(state, pillar);
        return { pillar, posted: Boolean(igResult || fbResult) };
    }

    if (pillar === 'carousel') {
        let plan = null;
        for (let attempt = 1; attempt <= 2 && !plan; attempt++) {
            plan = await generateCarouselPlan();
            if (plan) {
                const qc = reviewPost([plan.caption, ...plan.slides.map((s) => `${s.heading} ${s.body}`)].join('\n'), { platform: 'facebook' });
                if (!qc.pass) {
                    console.warn(`   🚧 Carousel QC rejected: ${formatViolations(qc.violations)}`);
                    plan = null;
                }
            }
        }
        if (!plan) {
            console.warn('   Carousel generation failed — falling back to culture post.');
            return runAfterDarkCycle({ ...options, pillar: 'culture' });
        }

        console.log(`\nCarousel caption:\n${plan.caption}\n`);
        plan.slides.forEach((s, i) => console.log(`  Slide ${i + 1}: ${s.heading} — ${s.body}`));
        if (dryRun) return { dryRun: true, pillar, plan };

        const slidePaths = [];
        for (let i = 0; i < plan.slides.length; i++) {
            const slide = plan.slides[i];
            // Designed typographic cards — gpt-image-2 renders short headings reliably
            const slidePrompt = `Elegant square social media slide design, slide ${i + 1} of ${plan.slides.length} for a bachata dance mini-lesson. Deep charcoal-black background with a subtle out-of-focus late-night dance floor scene (warm amber string lights, faint silhouettes). The exact heading text "${slide.heading}" rendered large in a refined modern serif, warm gold-on-dark, perfectly spelled. A thin amber underline accent. Premium editorial layout, generous margins, consistent visual system across slides. No other text besides the heading.`;
            slidePaths.push(await generateImage('', { rawPrompt: slidePrompt, provider: 'openai' }));
        }
        const mediaItems = [];
        for (const p of slidePaths) {
            mediaItems.push({ type: 'image', url: await uploadToTempHost(p) });
        }

        const igResult = await postInstagramCarousel(plan.caption, mediaItems, igConfig)
            .catch((e) => { console.error(`   IG carousel failed (continuing): ${e.message}`); return null; });
        const fbResult = await onAfterDarkPage(() => postToFacebookWithImage(plan.caption, slidePaths[0]))
            .catch((e) => { console.error(`   FB post failed: ${e.message}`); return null; });

        if (igResult || fbResult) {
            record({ pillar: 'bachata_ad_carousel', area: 'BachataAfterDark', textLength: plan.caption.length });
            console.log(`✅ Carousel posted (IG: ${Boolean(igResult)}, FB: ${Boolean(fbResult)})`);
        }
        cleanupImageCache();
        rememberPillar(state, pillar);
        return { pillar, posted: Boolean(igResult || fbResult) };
    }

    // culture | engagement | event → text + AI image, FB + IG mirror
    let context = '';
    if (pillar === 'event') {
        context = upcomingEvents()
            .map((e) => `- ${e.name} | ${e.date}${e.time ? ` ${e.time}` : ''}${e.venue ? ` | ${e.venue}` : ''}${e.details ? ` | ${e.details}` : ''}`)
            .join('\n');
    }

    const approved = await qcApprovedCaption(pillar, context);
    if (!approved) {
        console.error('🛑 No compliant caption after retries — skipping slot (better silent than wrong).');
        return { skipped: true, pillar };
    }
    const { caption, imagePrompt } = approved;

    console.log(`\nCaption:\n${'-'.repeat(58)}\n${caption}\n${'-'.repeat(58)}`);
    console.log(`\n🎨 Scene: ${imagePrompt.slice(0, 140)}...`);
    if (dryRun) return { dryRun: true, pillar, caption, imagePrompt };

    const imagePath = await generateAfterDarkImage(imagePrompt);
    const fbResult = await onAfterDarkPage(() => postToFacebookWithImage(caption, imagePath))
        .catch((e) => { console.error(`   FB post failed: ${e.message}`); return null; });
    const igResult = await uploadToTempHost(imagePath)
        .then((url) => postToInstagram(caption, url, igConfig))
        .catch((e) => { console.error(`   IG post failed (continuing): ${e.message}`); return null; });

    if (fbResult || igResult) {
        record({ pillar: `bachata_ad_${pillar}`, area: 'BachataAfterDark', textLength: caption.length });
        console.log(`✅ Posted (FB: ${Boolean(fbResult)}, IG: ${Boolean(igResult)})`);
    }
    cleanupImageCache();
    rememberPillar(state, pillar);
    return { pillar, posted: Boolean(fbResult || igResult) };
}

export default { runAfterDarkCycle };

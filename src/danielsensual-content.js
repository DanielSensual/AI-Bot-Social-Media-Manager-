/**
 * DanielSensual Content Engine
 * 
 * 3-pillar content system for Daniel's personal brand:
 * 1) AI Music — song drops, music video shorts, behind-the-scenes
 * 2) Social Dance — dance clips, tips, class highlights
 * 3) Events — pool parties, socials, workshops
 * 
 * AI-first caption generation with template fallback.
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { generateText, hasLLMProvider } from './llm-client.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_MAX_LENGTH = 1500;
const EVENTS_DIR = path.join(__dirname, '..', 'events');

// ─── Content Pillars ────────────────────────────────────────────

export const PILLARS = ['music', 'dance', 'event'];

// ─── AI Music Templates ────────────────────────────────────────

const MUSIC_TEMPLATES = [
    () => `Just finished this track at 2am and honestly can't stop playing it back.

Something about this melody just sits right. The guitar line alone is worth the listen.

If you love bachata that actually makes you feel something, save this one.

#bachata #danielsensual #newmusic`,

    () => `I've been sitting on this one for a while. Finally let it go.

This is what happens when you stop overthinking the production and just let the music breathe.

#danielsensual #bachatamusic #orlando`,

    () => `Made this one after a long night of social dancing. Came home, opened the laptop, and this just poured out.

Sometimes the best tracks write themselves.

#bachata #danielsensual #musicproduction`,

    () => `Quick story — I played this for a friend who doesn't even listen to bachata. She asked me to send it to her.

That's when you know it hits different.

#danielsensual #bachata #aimusic`,

    () => `New one up. Not gonna overthink the caption on this one.

Just press play and let me know what you think.

#danielsensual #bachata #newtrack`,
];

// ─── Social Dance Templates ────────────────────────────────────

const DANCE_TEMPLATES = [
    () => `Connection over patterns. Every single time.

The best social dancers I've seen aren't the ones doing the flashiest combos — they're the ones who make their partner feel safe from step one.

Practice your basics. Everything else follows.

#bachata #socialdance #orlando`,

    () => `Sometimes you get a dance at a social that reminds you why you fell in love with bachata in the first place.

No agenda. No filming. Just two people feeling the music. That's the whole point.

#bachatadance #socialdancing #dancelife`,

    () => `Orlando's bachata scene right now is something else. The level of dancing, the energy at every social — it's real.

Grateful to be part of this community.

#orlandobachata #socialdance #centralflorida`,

    () => `Real talk — if you're just starting bachata, the best thing you can do is go social dancing. Like tonight.

You learn more in one night out than a month of YouTube tutorials. Get uncomfortable. That's where growth lives.

#bachatadance #dancetips #socialdance`,

    () => `There's a difference between dancing AT someone and dancing WITH someone. You can feel it immediately.

The best partners make you forget anyone else is in the room.

#bachata #connection #socialdance`,
];

// ─── Event Templates ────────────────────────────────────────────

const EVENT_TEMPLATES = [
    (event) => `${event.name} is coming up and I'm genuinely excited about this one.

${event.date} at ${event.venue}
${event.time} · ${event.price}

${event.description || 'Good music, good people, good vibes. Come dance.'}

DM me if you need details.

${event.hashtags || '#bachata #orlandodance #danceevents'}`,

    (event) => `Mark your calendar — ${event.name}

${event.date} · ${event.time}
${event.venue}
${event.price}

This one's going to be special. Who's coming?

${event.hashtags || '#bachata #danceevent #orlandonights'}`,

    (event) => `${event.name}

${event.date} at ${event.venue}
${event.time} · ${event.price}

No big speech. Just come dance. You'll thank yourself later.

${event.hashtags || '#bachata #dancenight #orlando'}`,
];

// ─── Group-Specific Adapters ────────────────────────────────────

const GROUP_CATEGORY_ADAPTERS = {
    BACHATA_DANCE: {
        music: (base) => base, // music posts are perfect for bachata dance groups
        dance: (base) => base, // dance posts are perfect here
        event: (base) => base, // events too
    },
    LATIN_DANCE: {
        music: (base) => base.replace(/#Bachata\b/g, '#Bachata #SalsaBachata'),
        dance: (base) => base,
        event: (base) => base,
    },
    LATIN_MUSIC: {
        music: (base) => base, // perfect fit
        dance: (base) => base,
        event: (base) => base,
    },
    LATINO_COMMUNITY: {
        music: (base) => base.replace(/#danielsensual/g, '#danielsensual #orlandolatino'),
        dance: (base) => base,
        event: (base) => base, // events are great for community groups
    },
    AI_MUSIC: {
        music: (base) => base, // perfect fit
        dance: null, // skip dance posts for AI music groups
        event: null, // skip event posts for AI music groups
    },
};

// ─── Helpers ────────────────────────────────────────────────────

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function parseJsonObject(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return null;
        try { return JSON.parse(match[0]); } catch { return null; }
    }
}

function normalizeCaption(text, maxLength = DEFAULT_MAX_LENGTH) {
    const normalized = String(text || '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (!normalized) return '';
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

// ─── Event Loader ───────────────────────────────────────────────

export function loadActiveEvents() {
    const events = [];
    if (!fs.existsSync(EVENTS_DIR)) return events;

    for (const dir of fs.readdirSync(EVENTS_DIR)) {
        const configPath = path.join(EVENTS_DIR, dir, 'config.json');
        if (!fs.existsSync(configPath)) continue;

        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            const eventDate = new Date(config.event?.date || config.date);
            const now = new Date();
            const graceDays = 7; // still promote up to 7 days after event

            if (eventDate >= new Date(now.getTime() - graceDays * 86400000)) {
                events.push({
                    slug: dir,
                    name: config.event?.name || config.name || dir,
                    date: config.event?.date || config.date || 'TBA',
                    time: config.event?.time || config.time || 'TBA',
                    venue: typeof config.event?.venue === 'string'
                        ? `${config.event.venue}${config.event?.address ? ' — ' + config.event.address : ''}`
                        : `${config.event?.venue?.name || config.venue || 'TBA'}${config.event?.venue?.address ? ' — ' + config.event.venue.address : ''}`,
                    price: config.event?.price || (config.event?.pricing ? `Presale $${config.event.pricing.presale} · Door $${config.event.pricing.door}` : (config.price || 'See details')),
                    description: config.event?.description || config.description || '',
                    hashtags: config.event?.hashtags?.map(h => `#${h}`).join(' ') || '',
                    eventUrl: config.event?.eventUrl || config.event?.url || config.url || '',
                    flyerPath: config.event?.flyerPath ? path.join(EVENTS_DIR, dir, config.event.flyerPath) : null,
                    config,
                });
            }
        } catch (err) {
            console.warn(`⚠️ Could not load event config: ${configPath} — ${err.message}`);
        }
    }

    return events;
}

// ─── AI Caption Generation ──────────────────────────────────────

function buildAIPrompt(pillar, context = {}) {
    const pillarPrompts = {
        music: `You write Facebook posts for Daniel Sensual — a bachata music artist in Orlando who creates AI-produced bachata tracks.

Write about: a new song drop, studio session, or music update.
Vibe: genuine excitement, Dominican bachata culture, personal.`,

        dance: `You write Facebook posts for Daniel Sensual — a bachata dancer in Orlando, FL.

Write about: social dancing, bachata tips, the Orlando dance scene, or a personal dance moment.
Vibe: warm, real, community-first.`,

        event: `You write Facebook posts for Daniel Sensual, promoting an upcoming bachata event.

Event info:
${context.name || 'Bachata Event'} — ${context.date || 'TBA'}
${context.time || 'TBA'} at ${context.venue || 'TBA'}
${context.price || 'See details'}

Vibe: hype and FOMO but genuine — like telling your friend about a party, not writing an ad.`,
    };

    return `${pillarPrompts[pillar] || pillarPrompts.dance}

═══ FORMATTING RULES (CRITICAL — READ CAREFULLY) ═══

You are writing for Facebook, where robotic-looking posts get buried or flagged.

1. Write like a REAL PERSON typing on their phone — not a marketer, not a bot.
2. Use SHORT paragraphs (1-3 sentences each). Separate with a single blank line.
3. VARY your sentence length — mix short punchy lines ("That's it.") with longer thoughts.
4. Do NOT start every line with an emoji. Use 2-4 emojis total, placed naturally.
5. Do NOT use bullet lists (→ • ✓). Write in flowing paragraphs instead.
6. Keep hashtags to 3-4 max, at the very end.
7. First line should be a hook — but vary the type (question, bold claim, mid-story, emotional).
8. Do NOT use markdown (no **bold**, no _italic_, no headers).
9. Under 1000 characters total.
10. Sound like Daniel — a veteran who dances bachata, not a LinkedIn influencer.

BAD EXAMPLE (too structured, too robotic):
"🎵 New track alert! Daniel Sensual just dropped another one 🔥
This one hits different — pure bachata vibes.
Save it for your next social dance night 💃🕺
#DanielSensual #BachataMusic"

GOOD EXAMPLE (human, natural):
"Just finished this track at 2am and I can't stop playing it back.

Something about this melody hits different. The guitar line alone is worth the listen.

If you love bachata that actually makes you FEEL something, save this one 🔥

#bachata #danielsensual #bachatadance"

Return strict JSON only:
{
  "caption": "post text"
}`;
}

// ─── Main Content Builder ───────────────────────────────────────

export function getTemplatePost(pillar, context = {}) {
    switch (pillar) {
        case 'music':
            return normalizeCaption(pick(MUSIC_TEMPLATES)());
        case 'dance':
            return normalizeCaption(pick(DANCE_TEMPLATES)());
        case 'event': {
            const events = loadActiveEvents();
            const event = context.eventSlug
                ? events.find(e => e.slug === context.eventSlug)
                : events[0];
            if (!event) return normalizeCaption(pick(DANCE_TEMPLATES)());
            return normalizeCaption(pick(EVENT_TEMPLATES)(event));
        }
        default:
            return normalizeCaption(pick(DANCE_TEMPLATES)());
    }
}

export async function buildPost(pillar, context = {}) {
    const aiEnabled = context.aiEnabled !== false;

    // For event pillar, enrich context with loaded event details
    if (pillar === 'event' && !context.name) {
        const events = loadActiveEvents();
        const event = context.eventSlug
            ? events.find(e => e.slug === context.eventSlug)
            : events[0];
        if (event) {
            context = { ...context, ...event };
        }
    }

    // Build base result object
    const baseResult = {
        pillar,
        // For event posts, include flyer and event URL for attachment
        ...(pillar === 'event' && context.flyerPath ? { flyerPath: context.flyerPath } : {}),
        ...(pillar === 'event' && context.eventUrl ? { eventUrl: context.eventUrl } : {}),
    };

    if (aiEnabled && hasLLMProvider()) {
        try {
            const prompt = buildAIPrompt(pillar, context);
            const { text, provider, model } = await generateText({
                prompt,
                provider: 'auto',
                maxOutputTokens: 600,
                openaiModel: 'gpt-5.4-mini',
            });

            const parsed = parseJsonObject(text);
            const caption = normalizeCaption(parsed?.caption);

            if (caption) {
                return {
                    ...baseResult,
                    caption,
                    source: 'ai',
                    provider,
                    model,
                    fallbackReason: null,
                };
            }
        } catch (err) {
            console.warn(`⚠️ AI generation failed, using template: ${err.message}`);
        }
    }

    const caption = getTemplatePost(pillar, context);
    return {
        ...baseResult,
        caption,
        source: 'template',
        provider: null,
        model: null,
        fallbackReason: aiEnabled ? 'ai_unavailable' : 'ai_disabled',
    };
}

export function getPostForGroup(groupName, pillar, context = {}) {
    const { getGroupCategory } = context;
    const category = getGroupCategory ? getGroupCategory(groupName) : 'BACHATA_DANCE';
    const adapter = GROUP_CATEGORY_ADAPTERS[category];

    if (!adapter || !adapter[pillar]) {
        return null; // skip this pillar for this group category
    }

    const baseCaption = getTemplatePost(pillar, context);
    const adapted = adapter[pillar](baseCaption);
    return {
        caption: adapted,
        pillar,
        category,
        source: 'template',
    };
}

/**
 * Get today's pillar based on day rotation.
 * Music → Dance → Event → repeat
 */
export function getTodaysPillar(now = new Date()) {
    const dayOfYear = Math.floor(
        (now - new Date(now.getFullYear(), 0, 0)) / 86400000
    );
    return PILLARS[dayOfYear % PILLARS.length];
}

export default {
    PILLARS,
    buildPost,
    getTemplatePost,
    getPostForGroup,
    getTodaysPillar,
    loadActiveEvents,
};

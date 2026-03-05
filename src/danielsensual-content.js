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
    () => `🎵 New track alert! Daniel Sensual just dropped another one 🔥

This one hits different — pure bachata vibes with that AI production edge. Listen and let me know what you think in the comments.

Save it for your next social dance night 💃🕺

#DanielSensual #BachataMusic #AIMusic #BachataVibes #LatinMusic`,

    () => `🎶 Behind the scenes of creating bachata music with AI 🤖

Most people don't believe this is AI-generated until they hear it. The technology is evolving fast and the music is getting better every day.

Drop a 🔥 if this hits your soul.

#DanielSensual #AIMusic #Bachata #MusicProduction #OrlandoArtist`,

    () => `💿 Daniel Sensual music session 🎧

Late night studio vibes. New bachata track in the works — AI-assisted production meets real Dominican roots.

Who wants a sneak peek? Comment below 👇

#DanielSensual #BachataMusica #AIGeneratedMusic #LatinVibes`,

    () => `🎵 This is what happens when you mix bachata tradition with AI innovation 🚀

Daniel Sensual is pushing the boundaries of what bachata music can sound like. Every track tells a story.

Share this with someone who loves bachata 💜

#DanielSensual #Bachata #AIMusic #Innovation #LatinMusic`,

    () => `🔊 New Daniel Sensual track just dropped!

Pure bachata energy — made with AI but feels 100% real. Save this one for the dance floor 💃

Link to stream in the comments 👇

#DanielSensual #BachataNew #AIMusic #OrlandoBachata`,
];

// ─── Social Dance Templates ────────────────────────────────────

const DANCE_TEMPLATES = [
    () => `💃🕺 Social dance nights hit different when the music is right and the partner connects.

Nothing beats the feeling of a clean body wave into a turn pattern that just flows.

Who's dancing this weekend? Tag your dance partner! 👇

#Bachata #SocialDance #BachataSensual #OrlandoDance #DanceLife`,

    () => `🔥 Quick bachata tip:

Connection > Patterns. Every time.

The best social dancers aren't the ones doing the most moves — they're the ones who make their partner feel comfortable from the very first step.

Practice your basics. The fancy stuff comes later.

#BachataTips #SocialDancing #DanceTips #BachataOrlando #LatinDance`,

    () => `💃 Orlando's bachata scene is on fire right now 🔥

So many incredible dancers, events, and energy in Central Florida. Grateful to be part of this community.

Where's your favorite spot to social dance? Drop it below 👇

#OrlandoBachata #BachataScene #CentralFloridaDance #SocialDance`,

    () => `🕺 This is why we dance.

Not for the Instagram likes. Not for the perfect video. For the feeling.

That moment when the music hits, your partner follows, and everything just clicks. That's bachata.

#BachataLove #SocialDance #DanceIsLife #BachataSensual #OrlandoDancers`,

    () => `💃 Practice makes progress, not perfection.

Every social dance night is a chance to get 1% better. Don't worry about looking perfect — just enjoy the music and the connection.

See you on the dance floor 🔥

#BachataTips #DanceMotivation #SocialDancing #OrlandoBachata`,
];

// ─── Event Templates ────────────────────────────────────────────

const EVENT_TEMPLATES = [
    (event) => `🚨 EVENT ALERT! ${event.name} 🎉

📅 ${event.date}
⏰ ${event.time}
📍 ${event.venue}
💰 ${event.price}

${event.description || 'Come dance with us! This is going to be an incredible night of bachata, good vibes, and amazing people.'}

Drop a comment or DM me for details! 💃🕺

${event.hashtags || '#BachataEvent #OrlandoDance #BachataParty #CentralFloridaDance'}`,

    (event) => `🎉 Who's ready for ${event.name}?! 🔥

We're bringing the best vibes to ${event.venue} on ${event.date}!

${event.time} · ${event.price}

This is going to be one of the best bachata events in Central Florida. Don't miss it!

Tag someone you want to bring! 👇

${event.hashtags || '#BachataOrlando #DanceEvent #LatinParty #OrlandoNightlife'}`,

    (event) => `💃 SAVE THE DATE 💃

${event.name}
📅 ${event.date} · ${event.time}
📍 ${event.venue}
🎟️ ${event.price}

Bring your swimsuits, sunnies, and your BEST dance moves! This is going to be epic 🔥

Comment "IN" if you're coming! 

${event.hashtags || '#BachataPoolParty #OrlandoEvents #LatinDance #BachataVibes'}`,
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
        dance: (base) => `${base}\n\n🎵 Check out Daniel Sensual's bachata tracks too!`,
        event: (base) => base,
    },
    LATINO_COMMUNITY: {
        music: (base) => base.replace(/#DanielSensual/g, '#DanielSensual #OrlandoLatino'),
        dance: (base) => base.replace(/#OrlandoDance/g, '#OrlandoLatino #OrlandoDance'),
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
        music: `You write Facebook posts for Daniel Sensual, a bachata artist who creates AI-generated bachata music.

Post about: a new AI bachata song drop or music update.
Tone: excited but authentic, Dominican bachata culture vibes.
Include: emojis, hashtags, call-to-action (comment, share, save).
`,
        dance: `You write Facebook posts for Daniel Sensual, a bachata dancer and instructor in Orlando, FL.

Post about: social dancing, bachata tips, dance community vibes.
Tone: warm, encouraging, community-focused.
Include: emojis, hashtags, call-to-action (tag partner, comment, share).
`,
        event: `You write Facebook posts for Daniel Sensual, promoting a bachata/Latin dance event in Orlando.

Event details:
- Name: ${context.name || 'Bachata Event'}
- Date: ${context.date || 'TBA'}
- Time: ${context.time || 'TBA'}
- Venue: ${context.venue || 'TBA'}
- Price: ${context.price || 'See details'}

Tone: hype, exciting, FOMO-inducing but genuine.
Include: emojis, hashtags, all event details, call-to-action.
`,
    };

    return `${pillarPrompts[pillar] || pillarPrompts.dance}

Return strict JSON only:
{
  "caption": "post text"
}

Rules:
- Keep it authentic and high-energy
- Use emojis naturally (not every line)
- Include relevant hashtags at the end
- 3-8 paragraphs
- Under 1200 characters
- No markdown formatting`;
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
                openaiModel: 'gpt-5.2',
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

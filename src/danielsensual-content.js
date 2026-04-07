/**
 * DanielSensual Content Engine — Ghost AI SMMA
 * 
 * AI social media manager powered by the Brand Intelligence System.
 * Loads full brand context from brands/daniel-sensual.json so every
 * AI worker truly knows the brand they're posting for.
 * 
 * Content angles: music_drop, dance_tip, dance_moment, opinion,
 * behind_scenes, community, personal, event
 * 
 * AI-first caption generation with brand-validated output.
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { generateText, hasLLMProvider } from './llm-client.js';
import { loadBrand, getBrandPrompt, getBrandRules, validateCaption, getPillarConfig } from './brand-loader.js';
import { getRecent as getRecentPosts } from './post-history.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_MAX_LENGTH = 1500;
const EVENTS_DIR = path.join(__dirname, '..', 'events');

// ─── Content Pillars ────────────────────────────────────────────

export const PILLARS = [
    'music', 'music_drop', 'dance', 'dance_tip', 'dance_moment',
    'opinion', 'behind_scenes', 'community', 'personal', 'event',
];

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

// ─── AI Social Media Manager Brain ──────────────────────────────

// Load brand intelligence from the central profile
const DEFAULT_BRAND_ID = 'daniel-sensual';

function getBrand(brandId) {
    try {
        return loadBrand(brandId || DEFAULT_BRAND_ID);
    } catch (err) {
        console.warn(`⚠️ Brand load failed: ${err.message} — using inline fallback`);
        return null;
    }
}

// Content angles from brand profile (with inline fallback)
const CONTENT_ANGLES = [
    'music_drop', 'dance_tip', 'dance_moment', 'opinion',
    'behind_scenes', 'community', 'personal', 'event',
];

function getRecentPostSummary() {
    try {
        // SQLite-backed history (primary source)
        const recent = getRecentPosts(5);
        if (recent.length > 0) {
            return recent.map(p => {
                const pillar = p.pillar || 'unknown';
                const preview = (p.text || '').substring(0, 60);
                return `- [${pillar}] "${preview}..."`;
            }).join('\n');
        }
    } catch {
        // SQLite not available — try JSON fallback
        try {
            const historyPath = path.join(__dirname, '..', 'data', 'post-history.json');
            if (fs.existsSync(historyPath)) {
                const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
                const recent = (history.posts || []).slice(-5);
                if (recent.length > 0) {
                    return recent.map(p => {
                        const pillar = p.pillar || 'unknown';
                        const preview = (p.text || p.caption || '').substring(0, 60);
                        return `- [${pillar}] "${preview}..."`;
                    }).join('\n');
                }
            }
        } catch { /* no history at all */ }
    }
    return '(no recent posts available)';
}

function getTimeContext(now = new Date()) {
    const hour = now.getHours();
    const day = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' });
    const isWeekend = ['Saturday', 'Sunday'].includes(day);

    let timeOfDay = 'morning';
    if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
    else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
    else if (hour >= 21 || hour < 5) timeOfDay = 'late night';

    return { day, timeOfDay, isWeekend, hour };
}

function buildAIPrompt(pillar, context = {}) {
    const now = new Date();
    const timeCtx = getTimeContext(now);
    const recentPosts = getRecentPostSummary();
    const events = loadActiveEvents();
    const activeEvent = events.length > 0 ? events[0] : null;
    const brand = getBrand(context.brandId);

    // Generate brand context from profile (or use minimal fallback)
    const brandPrompt = brand
        ? getBrandPrompt(brand, context.platform || 'facebook', { pillar })
        : `You are Daniel Sensual's social media manager. Bachata artist, dancer, Orlando FL. U.S. Veteran. AI-produced music. Voice: warm, real, Spanglish natural. Never corporate.`;

    const eventContext = activeEvent
        ? `\nACTIVE EVENT: ${activeEvent.name} — ${activeEvent.date} at ${activeEvent.venue} (${activeEvent.price})`
        : '\nNo active events right now.';

    const pillarGuidance = pillar === 'auto'
        ? `You are the social media manager. Choose the best content angle for right now based on the day, time, recent posts, and what would perform best. Available angles: ${CONTENT_ANGLES.join(', ')}`
        : `Content angle for this post: ${pillar}`;

    // Pull angle instructions from brand profile if available
    const brandPillarConfig = brand ? getPillarConfig(brand, pillar) : null;
    let angleInstruction = '';
    
    if (brandPillarConfig) {
        const practices = (brandPillarConfig.bestPractices || []).map(p => `  - ${p}`).join('\n');
        angleInstruction = `${brandPillarConfig.description}\nGoal: ${brandPillarConfig.goal}\nBest practices:\n${practices}`;
    } else {
        // Inline fallback for angles not in brand profile
        const angleDetails = {
            music_drop: 'Focus on music — a new track, production insight, or studio moment. Make people curious enough to listen.',
            music: 'Focus on music — a new track, production insight, or studio moment.',
            dance_tip: 'Share a real technique insight or musicality tip. From experience, not a textbook.',
            dance: 'Share a real technique insight, social dance story, or community moment dancers relate to.',
            dance_moment: 'Tell a short story from a real social dance night. 3-4 sentences.',
            opinion: 'Share a real, slightly polarizing opinion. Drive comments and debate.',
            behind_scenes: 'Pull back the curtain — making music with AI, the creative grind.',
            community: 'Show genuine love for the Orlando bachata scene or the broader community.',
            personal: 'Share something real about your journey — veteran life, creative risks.',
            event: activeEvent
                ? `Promote naturally:\n${activeEvent.name}\n${activeEvent.date} · ${activeEvent.time}\n${activeEvent.venue}\n${activeEvent.price}\n${activeEvent.description || ''}`
                : 'No active event — write a dance or community post instead.',
            auto: '',
        };
        angleInstruction = angleDetails[pillar] || angleDetails.dance;
    }

    // Get formatting rules from brand
    const rules = brand ? getBrandRules(brand) : { maxEmojis: 2, maxHashtags: 3, maxChars: 800 };

    return `${brandPrompt}

═══ CURRENT CONTEXT ═══
Day: ${timeCtx.day} ${timeCtx.timeOfDay}${timeCtx.isWeekend ? ' (WEEKEND — peak engagement window)' : ''}
${eventContext}

═══ RECENT POSTS (do NOT repeat similar content or angles) ═══
${recentPosts}

═══ YOUR TASK ═══
${pillarGuidance}

${angleInstruction}

═══ FORMATTING ═══
1. Write for Facebook. Sound human — typing on your phone, not a press release.
2. SHORT paragraphs (1-3 sentences). Single blank lines between.
3. Vary sentence length. Mix punchy ("That's it.") with longer thoughts.
4. Max ${rules.maxEmojis} emojis, placed naturally. Never start a line with one.
5. Max ${rules.maxHashtags} ${rules.hashtagCase || 'lowercase'} hashtags at the very end.
6. No markdown. No bullet lists. No bold/italic.
7. Under ${rules.maxChars} characters total.
8. First line = hook. Vary the type (question, mid-story, hot take, emotional, observational).
9. You can be funny. You can be serious. Match the angle.

Return strict JSON:
{
  "caption": "your post text",
  "angle": "${pillar === 'auto' ? 'the angle you chose' : pillar}",
  "reasoning": "1 sentence — why this content, why now"
}`;
}

// ─── Main Content Builder ───────────────────────────────────────

export function getTemplatePost(pillar, context = {}) {
    // Map extended angles to base template pillars
    const templateMap = {
        music_drop: 'music', music: 'music',
        dance_tip: 'dance', dance: 'dance', dance_moment: 'dance',
        opinion: 'dance', behind_scenes: 'music',
        community: 'dance', personal: 'dance',
        event: 'event', auto: 'dance',
    };
    const basePillar = templateMap[pillar] || 'dance';

    switch (basePillar) {
        case 'music':
            return normalizeCaption(pick(MUSIC_TEMPLATES)());
        case 'event': {
            const events = loadActiveEvents();
            const event = context.eventSlug
                ? events.find(e => e.slug === context.eventSlug)
                : events[0];
            if (!event) return normalizeCaption(pick(DANCE_TEMPLATES)());
            return normalizeCaption(pick(EVENT_TEMPLATES)(event));
        }
        case 'dance':
        default:
            return normalizeCaption(pick(DANCE_TEMPLATES)());
    }
}

/**
 * Build a post with full AI social media manager capabilities.
 * When pillar is 'auto', the AI chooses the best angle based on context.
 */
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
        ...(pillar === 'event' && context.flyerPath ? { flyerPath: context.flyerPath } : {}),
        ...(pillar === 'event' && context.eventUrl ? { eventUrl: context.eventUrl } : {}),
    };

    if (aiEnabled && hasLLMProvider()) {
        try {
            const prompt = buildAIPrompt(pillar, context);
            const { text, provider, model } = await generateText({
                prompt,
                provider: 'auto',
                maxOutputTokens: 800,
                openaiModel: 'gpt-5.4-mini',
            });

            const parsed = parseJsonObject(text);
            const caption = normalizeCaption(parsed?.caption);
            const angle = parsed?.angle || pillar;
            const reasoning = parsed?.reasoning || '';

            if (caption) {
                if (reasoning) {
                    console.log(`   🧠 AI strategy: ${reasoning}`);
                }
                
                // Validate against brand rules
                const brand = getBrand(context.brandId);
                let brandViolations = [];
                if (brand) {
                    const validation = validateCaption(brand, caption);
                    if (!validation.valid) {
                        brandViolations = validation.violations;
                        console.warn(`   ⚠️ Brand violations: ${brandViolations.join(', ')}`);
                    }
                }
                
                return {
                    ...baseResult,
                    pillar: angle,
                    caption,
                    source: 'ai',
                    provider,
                    model,
                    angle,
                    reasoning,
                    brandViolations,
                    fallbackReason: null,
                };
            }
        } catch (err) {
            console.warn(`⚠️ AI generation failed, using template: ${err.message}`);
        }
    }

    // Template fallback — map extended angles to base pillars
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

    // Map extended angles to base pillars for group adapters
    const basePillar = ['music', 'dance', 'event'].includes(pillar) ? pillar : 'dance';

    if (!adapter || !adapter[basePillar]) {
        return null;
    }

    const baseCaption = getTemplatePost(basePillar, context);
    const adapted = adapter[basePillar](baseCaption);
    return {
        caption: adapted,
        pillar: basePillar,
        category,
        source: 'template',
    };
}

/**
 * Smart pillar selection — context-aware instead of rigid rotation.
 * Weekends favor events/community. Evenings favor personal/opinion.
 * When AI is available, use 'auto' to let it decide.
 */
export function getTodaysPillar(now = new Date()) {
    const timeCtx = getTimeContext(now);

    // If AI is available, let it decide
    if (hasLLMProvider()) {
        return 'auto';
    }

    // Template fallback: time-aware rotation
    const dayOfYear = Math.floor(
        (now - new Date(now.getFullYear(), 0, 0)) / 86400000
    );

    if (timeCtx.isWeekend) {
        const weekendOptions = ['event', 'dance', 'dance', 'music'];
        return weekendOptions[dayOfYear % weekendOptions.length];
    }

    if (timeCtx.timeOfDay === 'evening' || timeCtx.timeOfDay === 'late night') {
        const eveningOptions = ['dance', 'music', 'dance', 'music'];
        return eveningOptions[dayOfYear % eveningOptions.length];
    }

    const defaultOptions = ['music', 'dance', 'dance', 'music', 'dance', 'music', 'dance'];
    return defaultOptions[dayOfYear % defaultOptions.length];
}

export default {
    PILLARS: CONTENT_ANGLES,
    buildPost,
    getTemplatePost,
    getPostForGroup,
    getTodaysPillar,
    loadActiveEvents,
    CONTENT_ANGLES,
    getBrand,
};


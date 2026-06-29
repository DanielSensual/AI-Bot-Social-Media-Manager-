/**
 * Group Share Caption Generator — Ghost AI SMMA
 *
 * Generates unique, human-sounding captions for Facebook group shares.
 * Powered by Grok 4.3 + Brand Intelligence System + Real-Time Event Data.
 *
 * v4: Grok 4.3 engine, live event context from danielsensual.com,
 *     Bachata After Dark promotion priority.
 */

import { generateText, hasLLMProvider } from './llm-client.js';
import { loadBrand, getBrandRules, getNeverSayList, getStreamingLinks } from './brand-loader.js';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_BRAND_ID = 'daniel-sensual';
const SITE_ORIGIN = 'https://danielsensual.com';
const EVENT_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

// ─── Event Context Cache ─────────────────────────────────────────

let _eventCache = null;
let _eventCacheTime = 0;

// ─── Streaming Links (from brand profile) ───────────────────────

function getLinks(brandId) {
    try {
        const brand = loadBrand(brandId || DEFAULT_BRAND_ID);
        return getStreamingLinks(brand);
    } catch {
        // Hardcoded fallback
        return {
            spotify: 'https://open.spotify.com/album/23lMQH9zN7UXY4SBFUxTnk',
            appleMusic: 'https://music.apple.com/us/album/bachata-sensual-single/1889991063',
            youtube: 'https://www.youtube.com/watch?v=NhXWEuRXqbU',
        };
    }
}

// ─── Locale Detection ───────────────────────────────────────────

const LOCALE_PATTERNS = {
    es: [
        /\bespañ/i, /\blatino/i, /\blatina/i, /\bhispano/i,
        /\bboricua/i, /\bdominic/i, /\burbana\b/i, /\bmusica\b/i,
        /\bbachateo/i, /\bsalsa memes/i, /\bunivers/i,
        /\bpuertorri/i, /\ben orlando/i, /\bcomunidad/i,
        /\bayuda\b/i, /\bcasa de la/i,
    ],
    fr: [
        /\bfranc/i, /\bparis/i, /\bfrench/i,
        /\bkizomba dans\b/i,
    ],
    de: [
        /\bgerman/i, /\bhamburg/i, /\bdeutsch/i, /\bberlin/i,
    ],
    pt: [
        /\bbrasil/i, /\bportugu/i, /\bforró/i,
    ],
};

export function detectLocale(groupName) {
    const name = groupName || '';
    for (const [locale, patterns] of Object.entries(LOCALE_PATTERNS)) {
        if (patterns.some(p => p.test(name))) return locale;
    }
    return 'en';
}

function getLocaleName(locale) {
    const names = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese' };
    return names[locale] || 'English';
}

// ─── Extract City / Region from Group Name ──────────────────────

function extractCity(groupName) {
    const cities = [
        'Orlando', 'Miami', 'Tampa', 'Jacksonville', 'Chicago', 'Houston',
        'Dallas', 'San Jose', 'San Francisco', 'Bay Area', 'LA', 'Los Angeles',
        'New York', 'NYC', 'Atlanta', 'Denver', 'Phoenix', 'Austin', 'DC',
        'Baltimore', 'London', 'Paris', 'Berlin', 'Hamburg', 'Connecticut',
        'South Florida', 'Central Florida', 'North Carolina',
    ];
    for (const city of cities) {
        if (groupName.toLowerCase().includes(city.toLowerCase())) return city;
    }
    return null;
}

// ─── Real-Time Event Context ────────────────────────────────────

/**
 * Hardcoded event data (source of truth from dance-events.ts).
 * Updated whenever the event details change on danielsensual.com.
 */
const BACHATA_AFTER_DARK = {
    title: 'Bachata After Dark',
    subtitle: 'Free Class by Daniel Sensual',
    day: 'Wednesday',
    recurring: true,
    timeLabel: 'Free Bachata Class 9 PM · Social until midnight',
    venue: 'Eola Lounge',
    address: '100 S Eola Dr, Ste 104, Orlando, FL',
    city: 'Orlando',
    priceLabel: 'Free until 9 PM · $10 after',
    rsvpUrl: 'https://danielsensual.com/bachata#register',
    pageUrl: 'https://danielsensual.com/bachata',
    image: '/img/bachata/bachata-after-dark-weekly-flyer.jpg',
    tags: ['weekly', 'social', 'class', 'orlando'],
};

/**
 * Try to fetch live event context from danielsensual.com.
 * Falls back to hardcoded data on failure.
 */
export async function fetchEventContext() {
    // Return cache if fresh
    if (_eventCache && (Date.now() - _eventCacheTime) < EVENT_CACHE_TTL_MS) {
        return _eventCache;
    }

    try {
        const response = await fetch(`${SITE_ORIGIN}/api/bachata/register`, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const data = await response.json();
            // If the API returns event info, merge with our hardcoded data
            if (data && (data.event || data.title)) {
                const live = data.event || data;
                _eventCache = {
                    ...BACHATA_AFTER_DARK,
                    // Override with live data where available
                    ...(live.title && { title: live.title }),
                    ...(live.dateLabel && { dateLabel: live.dateLabel }),
                    ...(live.venue && { venue: live.venue }),
                    ...(live.timeLabel && { timeLabel: live.timeLabel }),
                    ...(live.priceLabel && { priceLabel: live.priceLabel }),
                    live: true,
                };
                _eventCacheTime = Date.now();
                return _eventCache;
            }
        }
    } catch {
        // Fetch failed — use hardcoded data
    }

    _eventCache = { ...BACHATA_AFTER_DARK, live: false };
    _eventCacheTime = Date.now();
    return _eventCache;
}

/**
 * Determine if there's an event to promote right now.
 * Returns the event object if we should promote, null otherwise.
 *
 * Logic: Bachata After Dark is weekly on Wednesdays.
 * Promote it starting Monday through Wednesday (3-day ramp).
 */
export async function getPromotedEvent() {
    const event = await fetchEventContext();
    if (!event) return null;

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed

    // For the weekly Wednesday event, promote Mon–Wed (days 1, 2, 3)
    if (event.recurring && event.day === 'Wednesday') {
        if (dayOfWeek >= 1 && dayOfWeek <= 3) {
            // Calculate this Wednesday's date for the caption
            const daysUntilWed = 3 - dayOfWeek;
            const wednesday = new Date(now);
            wednesday.setDate(now.getDate() + daysUntilWed);

            const dateLabel = wednesday.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
            });

            return {
                ...event,
                dateLabel,
                daysUntil: daysUntilWed,
                isToday: daysUntilWed === 0,
                isTomorrow: daysUntilWed === 1,
            };
        }
    }

    return null;
}

// ─── Caption Styles ─────────────────────────────────────────────

const CAPTION_STYLES = [
    'personal',      // "Been working on this one for weeks..."
    'casual',        // "Had to share this with y'all 💃"
    'curious',       // "What do you think of this vibe?"
    'grateful',      // "Love sharing music with this community"
    'excited',       // "Yo this one came out way better than expected"
    'storytelling',  // "Made this after a crazy night dancing..."
    'bilingual',     // Spanglish mix — natural for Daniel's brand
    'minimal',       // Short and clean, 1 sentence
];

const EVENT_CAPTION_STYLES = [
    'inviting',      // "Come through this Wednesday"
    'hype',          // "This week's gonna be different"
    'personal',      // "Been looking forward to this all week"
    'casual',        // "Orlando fam — free class Wednesday"
    'bilingual',     // "Ven a bailar conmigo this Wednesday"
    'minimal',       // Short, punchy event invite
];

// ─── Template Fallbacks ─────────────────────────────────────────

const TEMPLATE_CAPTIONS = {
    en: [
        "Had to share this one with y'all 💃",
        "This beat has been stuck in my head all week",
        "Who's feeling this vibe? 🎶",
        "Just dropped something new — let me know what you think",
        "Late night studio session turned into this 🔥",
        "The bachata never stops 💃 new music",
        "Been wanting to share this with the community",
        "This one's for the dancers 🎵",
        "What do you guys think of this?",
        "Can't stop listening to this one honestly",
        "Weekend mood right here 🌊",
        "New track just went live — genuinely curious what y'all think",
    ],
    es: [
        "Tenía que compartir esto con ustedes 💃",
        "Este ritmo no me sale de la cabeza",
        "¿Quién siente esta vibra? 🎶",
        "Salió algo nuevo — díganme qué les parece",
        "Sesión de estudio de madrugada y salió esto 🔥",
        "La bachata nunca para 💃 música nueva",
        "Quería compartir esto con la comunidad",
        "Este va pa' los que bailan 🎵",
        "¿Qué opinan de esto?",
        "No puedo dejar de escuchar este tema la verdad",
        "Vibra del fin de semana 🌊",
        "Nuevo tema — me interesa saber qué piensan",
    ],
    fr: [
        "Il fallait que je partage ça avec vous 💃",
        "Ce rythme me reste en tête depuis des jours",
        "Qui ressent cette vibe? 🎶",
        "Nouveau morceau — dites-moi ce que vous en pensez",
    ],
    de: [
        "Musste das einfach mit euch teilen 💃",
        "Dieser Beat geht mir nicht mehr aus dem Kopf",
        "Wer fühlt diesen Vibe? 🎶",
        "Neuer Track — sagt mir was ihr denkt",
    ],
};

const EVENT_TEMPLATE_CAPTIONS = {
    en: [
        "Free bachata class this Wednesday at Eola Lounge, Orlando 💃 Come dance!",
        "Bachata After Dark — free class 9 PM, social until midnight. See you there 🌙",
        "Orlando dancers — free bachata class this Wednesday. Bring a friend 💃",
        "This Wednesday: Bachata After Dark at Eola Lounge. Free class at 9, $10 after. Let's dance 🎶",
    ],
    es: [
        "Clase gratis de bachata este miércoles en Eola Lounge, Orlando 💃 Ven a bailar!",
        "Bachata After Dark — clase gratis a las 9 PM, social hasta medianoche 🌙",
        "Bailadores de Orlando — clase gratis este miércoles. Trae a un amigo 💃",
    ],
};

function getTemplateCaption(locale, groupName, isEvent = false) {
    const pool = isEvent
        ? (EVENT_TEMPLATE_CAPTIONS[locale] || EVENT_TEMPLATE_CAPTIONS.en)
        : (TEMPLATE_CAPTIONS[locale] || TEMPLATE_CAPTIONS.en);
    let caption = pool[Math.floor(Math.random() * pool.length)];

    // Occasionally add city reference for personalization (30% chance)
    if (!isEvent) {
        const city = extractCity(groupName);
        if (city && Math.random() < 0.3) {
            const cityPrefixes = {
                en: [`${city} fam —`, `Shoutout ${city} 🙌`, `${city}!`],
                es: [`${city} familia —`, `Saludos ${city} 🙌`],
            };
            const prefixes = cityPrefixes[locale] || cityPrefixes.en;
            const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
            caption = `${prefix} ${caption}`;
        }
    }

    return caption;
}

// ─── AI Caption Prompts ─────────────────────────────────────────

function buildEventCaptionPrompt({ groupName, locale, style, event, brandId }) {
    const langName = getLocaleName(locale);
    const city = extractCity(groupName);

    // Load brand intelligence
    let brandContext = '';
    let neverSayRules = '';
    try {
        const brand = loadBrand(brandId || DEFAULT_BRAND_ID);
        const v = brand.voice || {};
        const id = brand.identity || {};
        const neverSay = getNeverSayList(brand);

        brandContext = `You are ${brand.displayName}, ${id.background}
Voice: ${v.tone}
Language style: ${v.language}`;

        neverSayRules = neverSay.length > 0
            ? `\nNEVER SAY any of these:\n${neverSay.map(p => `  ✗ "${p}"`).join('\n')}`
            : '';
    } catch {
        brandContext = 'You are Daniel Sensual, a bachata artist and dancer based in Orlando.';
    }

    const urgency = event.isToday
        ? 'TONIGHT — maximum urgency, this is happening in hours'
        : event.isTomorrow
            ? 'TOMORROW — build excitement, this is tomorrow night'
            : `THIS ${event.day.toUpperCase()} — coming up this week`;

    return `${brandContext}

You are promoting YOUR weekly bachata event in a Facebook dance group.

═══ EVENT DETAILS ═══
Event: ${event.title}
${event.subtitle ? `Subtitle: ${event.subtitle}` : ''}
When: ${event.dateLabel} — ${urgency}
Time: ${event.timeLabel}
Venue: ${event.venue}, ${event.address}
Price: ${event.priceLabel}
RSVP: ${event.rsvpUrl}

═══ POST CONTEXT ═══
GROUP: "${groupName}"
LANGUAGE: ${langName}
TONE: ${style}
${city ? `GROUP CITY: ${city}` : ''}

═══ RULES ═══
1. Write in ${langName}. Spanglish is natural if writing in English
2. Keep it SHORT — 2-3 sentences max. Sound like you're texting a friend about your event
3. Include the key info naturally: what night, venue name, free class detail
4. ${event.isToday ? 'This is TONIGHT — convey urgency without being pushy' : event.isTomorrow ? 'This is TOMORROW — build anticipation' : 'Mention it\'s this Wednesday'}
5. 0-1 emojis max. No hashtags, no links (the flyer image is attached separately)
6. Sound like the host inviting people — NOT like an ad or a flyer
7. Don't start with "Hey everyone" or "@everyone"
8. ${city === 'Orlando' || city === 'Central Florida' ? 'This is a local group — reference the local scene naturally' : city ? `The group is in ${city} — acknowledge the distance or say "if you\'re ever in Orlando"` : 'This is an international/general group — mention it\'s in Orlando, FL'}
9. Vary the angle: sometimes lead with the free class, sometimes the social, sometimes the vibe
${neverSayRules}

Return ONLY the caption text. No quotes, no JSON, no links.`;
}

function buildMusicCaptionPrompt({ groupName, locale, style, videoContext, brandId }) {
    const langName = getLocaleName(locale);
    const city = extractCity(groupName);

    // Load brand intelligence
    let brandContext = '';
    let neverSayRules = '';
    try {
        const brand = loadBrand(brandId || DEFAULT_BRAND_ID);
        const v = brand.voice || {};
        const id = brand.identity || {};
        const music = brand.music || {};
        const rules = getBrandRules(brand);
        const neverSay = getNeverSayList(brand);

        brandContext = `You are ${brand.displayName}, ${id.background}
Voice: ${v.tone}
Language style: ${v.language}
Current release: "${music.currentRelease?.title}"
Music catalog: ${(music.catalog || []).slice(0, 8).join(', ')}
Production: ${music.productionNotes || 'AI-produced bachata'}`;

        neverSayRules = neverSay.length > 0
            ? `\nNEVER SAY any of these:\n${neverSay.map(p => `  ✗ "${p}"`).join('\n')}`
            : '';
    } catch {
        brandContext = 'You are Daniel Sensual, a bachata artist and dancer based in Orlando.';
    }

    return `${brandContext}

Write a caption to share your music in a Facebook dance group.

GROUP: "${groupName}"
LANGUAGE: ${langName}
TONE: ${style}
${city ? `CITY: ${city} — reference it naturally if it fits` : ''}

═══ RULES ═══
1. Write in ${langName}. Spanglish is natural if writing in English
2. Do NOT start with "@everyone"
3. Keep it SHORT — 1-2 sentences max, under 150 characters ideal
4. Sound like a REAL PERSON sharing music they're proud of
5. Be conversational — texting a friend, not writing an ad
6. 0-1 emojis max
7. No links, URLs, hashtags, or platform names
8. Vary tone: chill, excited, minimal — match the style requested
9. Reference the group's city/vibe when natural
${videoContext ? `10. Video context: ${videoContext}` : ''}
${neverSayRules}

Return ONLY the caption text. No quotes, no JSON.`;
}

// ─── AI Caption Generation (Grok 4.3) ───────────────────────────

/**
 * Generate a unique caption for a group share.
 * Uses Grok 4.3 as the primary LLM.
 */
export async function generateGroupCaption(options = {}) {
    const { groupName = '', videoContext = '', event = null } = options;
    const locale = detectLocale(groupName);
    const isEvent = !!event;

    const stylePool = isEvent ? EVENT_CAPTION_STYLES : CAPTION_STYLES;
    const style = stylePool[Math.floor(Math.random() * stylePool.length)];

    // Try AI first — Grok 4.3
    if (hasLLMProvider()) {
        try {
            const prompt = isEvent
                ? buildEventCaptionPrompt({ groupName, locale, style, event })
                : buildMusicCaptionPrompt({ groupName, locale, style, videoContext });

            const { text } = await generateText({
                prompt,
                provider: 'grok',
                grokModel: 'grok-4.3',
                maxOutputTokens: 200,
            });

            let caption = (text || '').trim().replace(/^["']|["']$/g, '');
            if (caption && caption.length > 5) {
                // Strip @everyone if AI added it anyway
                caption = caption.replace(/^@everyone\s*/i, '');
                // Strip hashtags if AI added them
                caption = caption.replace(/#\w+/g, '').trim();
                // Strip trailing emoji spam (more than 2 consecutive)
                caption = caption.replace(/([\u{1F600}-\u{1F9FF}\u{2600}-\u{27BF}]\s*){3,}$/gu, '').trim();
                // Strip links if AI added them despite instructions
                caption = caption.replace(/https?:\/\/\S+/gi, '').trim();

                return { caption, locale, style, source: 'grok-4.3', isEvent };
            }
        } catch (err) {
            console.log(`   ⚠️ Grok 4.3 caption failed: ${err.message}, using template`);
        }
    }

    // Fallback to template
    return {
        caption: getTemplateCaption(locale, groupName, isEvent),
        locale,
        style: 'template',
        source: 'template',
        isEvent,
    };
}

/**
 * Generate the comment text with streaming links.
 * Softer tone — not aggressive promo.
 */
export function generateStreamingComment(locale = 'en', brandId) {
    const links = getLinks(brandId);
    const comments = {
        en: `Full track on streaming\n${links.spotify}\n${links.appleMusic}`,
        es: `Tema completo en streaming\n${links.spotify}\n${links.appleMusic}`,
        fr: `Morceau complet en streaming\n${links.spotify}\n${links.appleMusic}`,
        de: `Ganzer Track im Streaming\n${links.spotify}\n${links.appleMusic}`,
    };
    return comments[locale] || comments.en;
}

/**
 * Generate a comment with event RSVP link (for event posts).
 */
export function generateEventComment(locale = 'en', event) {
    if (!event) return '';
    const comments = {
        en: `RSVP free: ${event.rsvpUrl}\n\n📍 ${event.venue}, ${event.address}`,
        es: `RSVP gratis: ${event.rsvpUrl}\n\n📍 ${event.venue}, ${event.address}`,
        fr: `RSVP gratuit: ${event.rsvpUrl}\n\n📍 ${event.venue}, ${event.address}`,
        de: `Kostenlos anmelden: ${event.rsvpUrl}\n\n📍 ${event.venue}, ${event.address}`,
    };
    return comments[locale] || comments.en;
}

export default {
    generateGroupCaption,
    generateStreamingComment,
    generateEventComment,
    detectLocale,
    getLinks,
    fetchEventContext,
    getPromotedEvent,
};

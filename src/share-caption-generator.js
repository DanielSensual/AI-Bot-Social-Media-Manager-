/**
 * Group Share Caption Generator — Ghost AI SMMA
 *
 * Generates unique, human-sounding captions for Facebook group shares.
 * Powered by the Brand Intelligence System — loads voice, rules, and
 * streaming links from the brand profile.
 *
 * v3: Brand-loader integration. Dynamic voice + guardrails.
 */

import { generateText, hasLLMProvider } from './llm-client.js';
import { loadBrand, getBrandRules, getNeverSayList, getStreamingLinks } from './brand-loader.js';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_BRAND_ID = 'daniel-sensual';

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

// ─── Caption Styles (more natural variety) ──────────────────────

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

// ─── Template Fallbacks (sound like a PERSON, not a bot) ────────

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

function getTemplateCaption(locale, groupName) {
    const templates = TEMPLATE_CAPTIONS[locale] || TEMPLATE_CAPTIONS.en;
    let caption = templates[Math.floor(Math.random() * templates.length)];

    // Occasionally add city reference for personalization (30% chance)
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

    return caption;
}

// ─── AI Caption Generation (Brand-Powered) ─────────────────────

function buildCaptionPrompt({ groupName, locale, style, videoContext, brandId }) {
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
Current release: "${music.currentRelease?.title}"`;

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

/**
 * Generate a unique caption for a group share.
 */
export async function generateGroupCaption(options = {}) {
    const { groupName = '', videoContext = '' } = options;
    const locale = detectLocale(groupName);
    const style = CAPTION_STYLES[Math.floor(Math.random() * CAPTION_STYLES.length)];

    // Try AI first
    if (hasLLMProvider()) {
        try {
            const prompt = buildCaptionPrompt({ groupName, locale, style, videoContext });
            const { text } = await generateText({
                prompt,
                provider: 'auto',
                maxOutputTokens: 150,
                openaiModel: 'gpt-5.4-nano',
            });

            let caption = (text || '').trim().replace(/^["']|["']$/g, '');
            if (caption && caption.length > 5) {
                // Strip @everyone if AI added it anyway
                caption = caption.replace(/^@everyone\s*/i, '');
                // Strip hashtags if AI added them
                caption = caption.replace(/#\w+/g, '').trim();
                // Strip trailing emoji spam (more than 2 consecutive)
                caption = caption.replace(/([\u{1F600}-\u{1F9FF}\u{2600}-\u{27BF}]\s*){3,}$/gu, '').trim();

                return { caption, locale, style, source: 'ai' };
            }
        } catch (err) {
            console.log(`   ⚠️ AI caption failed: ${err.message}, using template`);
        }
    }

    // Fallback to template
    return {
        caption: getTemplateCaption(locale, groupName),
        locale,
        style: 'template',
        source: 'template',
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

export default {
    generateGroupCaption,
    generateStreamingComment,
    detectLocale,
    STREAMING_LINKS,
};

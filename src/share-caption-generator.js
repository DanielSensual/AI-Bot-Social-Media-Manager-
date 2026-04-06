/**
 * Music Manager — Group Share Caption Generator
 *
 * Generates unique, locale-aware captions for each group share.
 * Uses GPT to create varied, engaging captions that don't look spammy.
 *
 * Features:
 * - Locale detection from group name (EN/ES/FR/DE/PT)
 * - @everyone tag for reach
 * - Varied caption styles (question, hype, invitation, story)
 * - Streaming links (Spotify / Apple Music)
 */

import { generateText, hasLLMProvider } from './llm-client.js';
import dotenv from 'dotenv';

dotenv.config();

// ─── Streaming Links ────────────────────────────────────────────

const STREAMING_LINKS = {
    spotify: 'https://open.spotify.com/album/23lMQH9zN7UXY4SBFUxTnk',   // Bachata Sensual single
    appleMusic: 'https://music.apple.com/us/album/bachata-sensual-single/1889991063', // Bachata Sensual single
    youtube: 'https://www.youtube.com/watch?v=NhXWEuRXqbU',               // Bachata Sensual video
};

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

// ─── Caption Styles ─────────────────────────────────────────────

const CAPTION_STYLES = [
    'question',      // "Who else is addicted to this bachata?"
    'hype',          // "This one hits DIFFERENT 🔥"
    'invitation',    // "Come dance with us, watch this"
    'story',         // "Recorded this after an amazing night..."
    'community',     // "Our bachata community is growing 🌍"
    'challenge',     // "Tag someone who needs to learn this"
    'appreciation',  // "So grateful for this dance family"
    'teaser',        // "Wait for the ending... 🔥"
];

// ─── Template Fallbacks (no AI needed) ──────────────────────────

const TEMPLATE_CAPTIONS = {
    en: [
        "@everyone Who else can't stop watching this? 🔥",
        "@everyone This mashup hits too hard 🎶 New music out now!",
        "@everyone When the bachata flow is just right... Watch this 💃",
        "@everyone Our latest track just dropped! What do you think? 🎵",
        "@everyone Tag someone who NEEDS to hear this 🔥",
        "@everyone This is why we love bachata ❤️ New video out now",
        "@everyone Can't stop replaying this one 🔄 Turn your volume up!",
        "@everyone The vibe is unmatched 🌊 Check out our new music",
    ],
    es: [
        "@everyone ¿Quién más está enganchado con este tema? 🔥",
        "@everyone Este mashup pega demasiado fuerte 🎶 ¡Música nueva ya!",
        "@everyone Cuando el flow de bachata está perfecto... Mira esto 💃",
        "@everyone ¡Nuestro nuevo track acaba de salir! ¿Qué opinan? 🎵",
        "@everyone Etiqueta a alguien que NECESITA escuchar esto 🔥",
        "@everyone Por esto amamos la bachata ❤️ Nuevo video disponible",
        "@everyone No puedo parar de escuchar este tema 🔄 ¡Súbele el volumen!",
        "@everyone La vibra no tiene comparación 🌊 Escucha nuestra nueva música",
    ],
    fr: [
        "@everyone Qui d'autre ne peut pas arrêter de regarder ça? 🔥",
        "@everyone Ce morceau frappe trop fort 🎶 Nouvelle musique dispo!",
        "@everyone Quand le flow de bachata est parfait... Regardez ça 💃",
        "@everyone Notre nouveau morceau vient de sortir! Qu'en pensez-vous? 🎵",
    ],
    de: [
        "@everyone Wer kann auch nicht aufhören, das anzuschauen? 🔥",
        "@everyone Dieser Track geht einfach zu hart 🎶 Neue Musik jetzt draußen!",
        "@everyone Wenn der Bachata-Flow einfach passt... Schaut euch das an 💃",
        "@everyone Unser neuester Track ist da! Was meint ihr? 🎵",
    ],
};

function getTemplateCaption(locale) {
    const templates = TEMPLATE_CAPTIONS[locale] || TEMPLATE_CAPTIONS.en;
    return templates[Math.floor(Math.random() * templates.length)];
}

// ─── AI Caption Generation ──────────────────────────────────────

function buildCaptionPrompt({ groupName, locale, style, videoContext }) {
    const langName = getLocaleName(locale);

    return `You generate short, engaging Facebook group post captions for Daniel Sensual — a bachata music artist & dancer.

GROUP: "${groupName}"
LANGUAGE: ${langName}
STYLE: ${style}

═══ RULES ═══
1. Write the caption in ${langName}
2. Start with "@everyone" to tag all group members
3. Keep it SHORT — 1-3 sentences max (under 200 characters ideal)
4. Sound natural and human, NOT like a bot or marketer
5. Match the vibe of the group — dance groups get dance energy, music groups get music energy
6. Vary your style: sometimes ask a question, sometimes just hype, sometimes tell a mini story
7. Use 1-2 emojis max (🔥 💃 🎶 ❤️ 🌊 🎵)
8. Do NOT include any links or URLs
9. Do NOT mention Spotify or Apple Music
10. Do NOT use hashtags
${videoContext ? `11. Video context: ${videoContext}` : ''}

Return ONLY the caption text, nothing else. No quotes, no JSON, just the caption.`;
}

/**
 * Generate a unique caption for a group share.
 *
 * @param {object} options
 * @param {string} options.groupName - Name of the target group
 * @param {string} [options.videoContext] - Optional description of the video being shared
 * @returns {Promise<{caption: string, locale: string, style: string, source: string}>}
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
                maxOutputTokens: 200,
                openaiModel: 'gpt-5.4-nano',
            });

            const caption = (text || '').trim().replace(/^["']|["']$/g, '');
            if (caption && caption.length > 5) {
                // Ensure @everyone is included
                const finalCaption = caption.startsWith('@everyone')
                    ? caption
                    : `@everyone ${caption}`;

                return { caption: finalCaption, locale, style, source: 'ai' };
            }
        } catch (err) {
            console.log(`   ⚠️ AI caption failed: ${err.message}, using template`);
        }
    }

    // Fallback to template
    return {
        caption: getTemplateCaption(locale),
        locale,
        style: 'template',
        source: 'template',
    };
}

/**
 * Generate the comment text with streaming links.
 */
export function generateStreamingComment(locale = 'en') {
    const comments = {
        en: `🎵 "Bachata Sensual" out now!\n🟢 Spotify: ${STREAMING_LINKS.spotify}\n🍎 Apple Music: ${STREAMING_LINKS.appleMusic}\n▶️ YouTube: ${STREAMING_LINKS.youtube}`,
        es: `🎵 "Bachata Sensual" ¡ya disponible!\n🟢 Spotify: ${STREAMING_LINKS.spotify}\n🍎 Apple Music: ${STREAMING_LINKS.appleMusic}\n▶️ YouTube: ${STREAMING_LINKS.youtube}`,
        fr: `🎵 "Bachata Sensual" disponible maintenant!\n🟢 Spotify: ${STREAMING_LINKS.spotify}\n🍎 Apple Music: ${STREAMING_LINKS.appleMusic}\n▶️ YouTube: ${STREAMING_LINKS.youtube}`,
        de: `🎵 "Bachata Sensual" jetzt draußen!\n🟢 Spotify: ${STREAMING_LINKS.spotify}\n🍎 Apple Music: ${STREAMING_LINKS.appleMusic}\n▶️ YouTube: ${STREAMING_LINKS.youtube}`,
    };
    return comments[locale] || comments.en;
}

export default {
    generateGroupCaption,
    generateStreamingComment,
    detectLocale,
    STREAMING_LINKS,
};

/**
 * Threads Content Engine — DanielSensual Engagement Bot
 * 
 * Aggressive engagement strategy:
 * 1) Self-engagement: reply to Daniel's own threads with hype/banter
 * 2) Proactive posting: drop new threads (music, dance, spicy takes)
 * 3) Trolling engagement: reply to trending threads in the bachata/dance/AI space
 * 
 * All AI-generated with fallback templates.
 * Character limit: 500 (Threads max).
 */

import dotenv from 'dotenv';
import { generateText, hasLLMProvider } from './llm-client.js';

dotenv.config();

const MAX_LENGTH = 500;

// ─── Persona ────────────────────────────────────────────────────

const DANIEL_PERSONA = `You are Daniel Sensual's Threads social media AI. Daniel is a bachata artist, dancer, and AI entrepreneur in Orlando, FL.

Voice rules:
- Aggressive, opinionated, provocative — never boring
- Mix English and Spanish naturally ("dale" "mira" "no cap" "relax bro")
- Talk shit in a fun way, never genuinely mean
- Self-promote shamelessly but make it entertaining
- Dominican-American energy, Orlando local references
- Hot takes on dance culture, AI, music, and life
- Emojis: use 1-3 max, never overdo it
- Short punchy sentences. No essays.
- Under 500 characters ALWAYS.`;

// ─── Self-Troll Templates (replies to own posts) ────────────────

const SELF_TROLL_PROMPTS = [
    `Daniel just posted on Threads. Write a self-hype reply as if Daniel is gassing himself up. 
Make it funny and slightly unhinged. Like "yeah I said what I said 🔥" energy.
Keep it short, punchy, under 200 chars.`,

    `Daniel just posted a bachata-related thread. Reply to your own post with a spicy take that creates engagement.
Something controversial enough to get replies. "Leads who can't do basics trying to learn combinations... we need to talk" energy.
Under 250 chars.`,

    `Reply to your own Threads post with something that starts a debate or gets people fired up.
Could be about dance culture, AI, music, or Orlando nightlife. 
Must be opinionated. No fence-sitting.
Under 200 chars.`,

    `Drop a follow-up comment on your own post that's pure Dominican-American chaos.
Mix of English and Spanish, zero filter, still funny.
Under 200 chars.`,
];

// ─── Proactive Thread Templates ─────────────────────────────────

const PROACTIVE_CATEGORIES = {
    hot_take: `Write a spicy hot take thread for Daniel Sensual. Topics: bachata culture, AI replacing things, Orlando dance scene, making music with AI, or why most social dancers need to practice basics more.
Must be opinionated and engagement-baiting. Make people want to reply.
Under 400 chars. Include 1-3 relevant hashtags.`,

    self_promo: `Write a self-promotion thread for Daniel Sensual. He's a bachata artist who makes AI-generated music and runs an AI agency (Ghost AI Systems).
Make it entertaining, not corporate. "Y'all sleeping on AI-generated bachata and it shows" energy.
Under 400 chars. Include 1-2 hashtags.`,

    banter: `Write a casual, personality-driven thread for Daniel Sensual. Could be about:
- Orlando life, pool parties, dance community
- Behind the scenes of making AI music
- Hot takes on the bachata scene
- Something random and funny
Keep it real, not polished. Under 350 chars.`,

    controversial: `Write a genuinely controversial take for Daniel Sensual's Threads. Something that will split opinions and fill the replies.
Could be about: AI art vs human art, bachata sensual vs dominicana debate, social media gurus, or tech bros.
Be BOLD. No half measures. Under 400 chars.`,
};

// ─── Engagement Reply Templates (replying to others) ────────────

const ENGAGEMENT_REPLY_PROMPT = `You're Daniel Sensual replying to someone's thread. Your goal is ENGAGEMENT — be the most interesting reply in the thread.

Strategies:
1. Agree but add something spicier
2. Playfully disagree with a hot take
3. Make a joke that's actually funny
4. Drop knowledge nobody asked for
5. Self-promote if relevant (AI music, dance, Ghost AI)

NEVER be generic. No "facts 🔥" or "this 💯" energy. 
Be the person everyone screenshots.
Under 300 chars. Output ONLY the reply.`;

// ─── Helpers ────────────────────────────────────────────────────

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function truncate(text, max = MAX_LENGTH) {
    if (!text) return '';
    const clean = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (clean.length <= max) return clean;
    return clean.substring(0, max - 3).trimEnd() + '...';
}

function parseAIResponse(raw) {
    const text = String(raw || '').trim();
    // Try to extract from JSON if wrapped
    try {
        const parsed = JSON.parse(text);
        return parsed.text || parsed.reply || parsed.caption || parsed.thread || text;
    } catch {
        // Clean up markdown artifacts
        return text.replace(/^["']|["']$/g, '').replace(/^```[\s\S]*?```$/gm, '').trim();
    }
}

// ─── Content Generators ─────────────────────────────────────────

/**
 * Generate a self-troll reply for one of Daniel's own posts
 */
export async function generateSelfReply(originalPost = '') {
    if (!hasLLMProvider()) return getTemplateSelfReply();

    const promptBase = pick(SELF_TROLL_PROMPTS);
    const prompt = `${DANIEL_PERSONA}\n\n${promptBase}\n\nOriginal post: "${originalPost.substring(0, 200)}"\n\nOutput ONLY the reply text, nothing else.`;

    try {
        const { text } = await generateText({
            prompt,
            maxOutputTokens: 150,
            openaiModel: 'gpt-5.4-mini',
        });
        return truncate(parseAIResponse(text));
    } catch (err) {
        console.warn(`⚠️ AI self-reply failed: ${err.message}`);
        return getTemplateSelfReply();
    }
}

/**
 * Generate a proactive new thread post
 */
export async function generateProactivePost(category = null) {
    const cat = category || pick(Object.keys(PROACTIVE_CATEGORIES));
    const promptBase = PROACTIVE_CATEGORIES[cat] || PROACTIVE_CATEGORIES.hot_take;

    if (!hasLLMProvider()) return getTemplateProactivePost(cat);

    const prompt = `${DANIEL_PERSONA}\n\n${promptBase}\n\nOutput ONLY the thread text, nothing else.`;

    try {
        const { text, provider, model } = await generateText({
            prompt,
            maxOutputTokens: 200,
            openaiModel: 'gpt-5.4-mini',
        });
        return {
            text: truncate(parseAIResponse(text)),
            category: cat,
            source: 'ai',
            provider,
            model,
        };
    } catch (err) {
        console.warn(`⚠️ AI proactive post failed: ${err.message}`);
        return getTemplateProactivePost(cat);
    }
}

/**
 * Generate engagement reply to someone else's thread
 */
export async function generateEngagementReply(threadText, authorUsername = 'someone') {
    if (!hasLLMProvider()) return null;

    const prompt = `${DANIEL_PERSONA}\n\n${ENGAGEMENT_REPLY_PROMPT}\n\nReplying to @${authorUsername}:\n"${threadText.substring(0, 300)}"\n\nYour reply:`;

    try {
        const { text } = await generateText({
            prompt,
            maxOutputTokens: 120,
            openaiModel: 'gpt-5.4-mini',
        });
        return truncate(parseAIResponse(text), 500);
    } catch (err) {
        console.warn(`⚠️ AI engagement reply failed: ${err.message}`);
        return null;
    }
}

// ─── Template Fallbacks ─────────────────────────────────────────

function getTemplateSelfReply() {
    const templates = [
        'Yeah I said what I said \u{1F525}',
        "No one's gonna out-work me on this. Period.",
        'If this offends you, you probably needed to hear it \u{1F480}',
        "Orlando dance scene ain't ready for this conversation",
        "AI + bachata = the future and I'm already here \u{1F916}",
        'Go ahead, screenshot this. I stand on it.',
        "The robots and I are vibing. Y'all are still overthinking it.",
        "Mira if you know, you know. If you don't, come to Orlando \u{1F334}",
    ];
    return pick(templates);
}

function getTemplateProactivePost(category) {
    const templates = {
        hot_take: [
            '90% of social dancers think they "dance bachata sensual" but really they just wiggle. I said what I said \u{1F480} #BachataHotTake',
            'Everyone wants AI to make their music but nobody wants to admit AI bachata hits harder than half the tracks on the market right now \u{1F3B5} #AIMusic',
            "The Orlando dance scene has more drama than a novela and honestly that's what makes it the best scene in Florida \u{1F334} #OrlandoBachata",
        ],
        self_promo: [
            "Making AI-generated bachata music while y'all still arguing about whether AI can be creative \u{1F916}\u{1F3B5} Link in bio. #DanielSensual #AIMusic",
            "Ghost AI Systems just shipped another AI voice agent for a dental office in Orlando. Meanwhile I'm also dropping bachata tracks. Sleep is overrated \u{1F480} #GhostAI",
        ],
        banter: [
            "Orlando pool party season is approaching and I can already feel the bachata community gearing up for chaos \u{1F3CA}\u200D\u2642\uFE0F\u{1F483}",
            'Just spent 3 hours in the studio and the AI co-produced something fire. Sometimes the machine just knows \u{1F3A7}',
        ],
        controversial: [
            "Bachata sensual and bachata dominicana aren't rivals. One is a dance, the other is an excuse to just walk around. Fight me.",
            'Hot take: most "AI experts" on social media have never deployed a single production model. They just reshare OpenAI tweets \u{1F480}',
        ],
    };
    
    const catTemplates = templates[category] || templates.hot_take;
    return {
        text: pick(catTemplates),
        category: category || 'hot_take',
        source: 'template',
        provider: null,
        model: null,
    };
}

/**
 * Get today's content category based on rotation
 */
export function getTodaysCategory(now = new Date()) {
    const categories = Object.keys(PROACTIVE_CATEGORIES);
    const dayOfYear = Math.floor(
        (now - new Date(now.getFullYear(), 0, 0)) / 86400000
    );
    return categories[dayOfYear % categories.length];
}

export default {
    generateSelfReply,
    generateProactivePost,
    generateEngagementReply,
    getTodaysCategory,
};

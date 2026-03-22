/**
 * Daniel Facebook caption builder.
 * AI-first with deterministic template fallback.
 *
 * v2 — Rewired for ENGAGEMENT. No more LinkedIn energy.
 * Gritty, motivational, trending, controversial.
 */

import dotenv from 'dotenv';
import { generateText, hasLLMProvider } from './llm-client.js';

dotenv.config();

const DEFAULT_MAX_LENGTH = 1500;

// ═══════════════════════════════════════════════════════════════
// CONTENT PILLARS — rotate between these for variety
// ═══════════════════════════════════════════════════════════════
const CONTENT_PILLARS = [
    // ── RAW MOTIVATIONAL ────────────────────────────────────
    {
        pillar: 'grit',
        theme: 'raw motivational — came from nothing, built everything',
        tone: 'intense, personal, veteran energy',
    },
    {
        pillar: 'grit',
        theme: 'nobody believed in you, now they watch you build',
        tone: 'defiant, underdog energy',
    },
    {
        pillar: 'grit',
        theme: 'the grind nobody sees — 2am sessions, failed deploys, still shipping',
        tone: 'raw and honest, slightly exhausted but unstoppable',
    },
    {
        pillar: 'grit',
        theme: 'military discipline applied to building a tech company',
        tone: 'disciplined, no-nonsense, veteran mindset',
    },

    // ── HOT TAKES & CONTROVERSY ─────────────────────────────
    {
        pillar: 'friction',
        theme: 'hot take: most people using AI are just making expensive noise',
        tone: 'provocative, slightly arrogant, backed by real experience',
    },
    {
        pillar: 'friction',
        theme: 'unpopular opinion about the tech industry right now',
        tone: 'contrarian, confident, willing to be wrong',
    },
    {
        pillar: 'friction',
        theme: 'why 99% of AI startups will fail and what the 1% do differently',
        tone: 'blunt truth, no sugarcoating',
    },
    {
        pillar: 'friction',
        theme: 'the lie people tell themselves about passive income and automation',
        tone: 'calling out BS, real talk',
    },

    // ── TRENDING / REACTIVE ─────────────────────────────────
    {
        pillar: 'trending',
        theme: 'react to the biggest AI or tech news this week',
        tone: 'informed insider, quick take with a strong opinion',
    },
    {
        pillar: 'trending',
        theme: 'something happening in the world right now that connects to building',
        tone: 'culturally aware, ties current events to hustle',
    },
    {
        pillar: 'trending',
        theme: 'what a recent tech company move means for small business owners',
        tone: 'translating big tech news for the everyday entrepreneur',
    },

    // ── REAL STORIES ────────────────────────────────────────
    {
        pillar: 'story',
        theme: 'a real client story — what happened, what we built, what it changed',
        tone: 'storytelling, specific details, emotional payoff',
    },
    {
        pillar: 'story',
        theme: 'a personal failure that taught you more than any success',
        tone: 'vulnerable but strong, lesson-driven',
    },
    {
        pillar: 'story',
        theme: 'the moment you realized you could actually do this — build real AI systems',
        tone: 'reflective, inspiring, specific memory',
    },

    // ── TACTICAL (kept but upgraded) ────────────────────────
    {
        pillar: 'tactical',
        theme: 'one specific thing you automated this week and the exact result',
        tone: 'show dont tell, receipts over theory',
    },
    {
        pillar: 'tactical',
        theme: 'the $20k+ system you just built — what it does in plain english',
        tone: 'flex without being cringe, let the work speak',
    },
];

// ═══════════════════════════════════════════════════════════════
// TEMPLATE FALLBACKS — when AI is unavailable
// ═══════════════════════════════════════════════════════════════
const TEMPLATE_CAPTIONS = [
    () => `Nobody handed me a playbook.

No trust fund. No network. No "connections."

Just a veteran with a laptop, a ridiculous work ethic, and the audacity to believe AI could change everything.

3 years later I'm building voice agents, lead gen engines, and entire SaaS platforms from scratch.

The secret? There is no secret. You just don't quit.

Every single day you show up and build. Even when nobody's watching. Especially when nobody's watching.

Your timeline is lying to you. Behind every "overnight success" is 1,000 nights of grinding alone.

Keep building. 🔥`,

    () => `Hot take: 90% of people posting about AI have never deployed a single production system.

They screenshot ChatGPT responses and call it "leveraging AI."

Meanwhile, we're over here building:
→ Voice agents that answer phones 24/7
→ Lead gen systems that find, qualify, and nurture automatically
→ Quote-to-invoice platforms that close deals while you sleep

The gap between talking about AI and BUILDING with AI is massive.

Which side are you on?`,

    () => `Real talk for a second.

I've been broke. Like actually broke. Not "I only have $500 in my checking account" broke.

I'm talking negative balance, selling equipment, figuring out which bills can wait another month.

That version of me would be SHOCKED at what we're building now.

But here's the thing — that version of me is the reason we're here. That hunger doesn't just go away.

If you're in that chapter right now, hear me: it's fuel, not a sentence.

Keep going.`,

    () => `People ask me "what does Ghost AI actually do?"

Simple: we make businesses money while they sleep.

Your phone rings at 2am? Our AI answers it, qualifies the lead, books the appointment.

You need proposals sent to 50 realtors? Done by morning with follow-ups loaded.

Your social media is dead? We've got AI agents posting, engaging, and building your audience on autopilot.

This isn't science fiction. This is Tuesday for us.

The question isn't whether AI will change your business.
It's whether you'll adopt it before your competitor does.`,

    () => `Controversial opinion:

The best business advice isn't in any course or masterclass.

It's in the military.

→ Execute under pressure
→ Adapt when the plan falls apart
→ Lead when nobody wants to
→ Show up when conditions are terrible

I didn't learn entrepreneurship from a guru.
I learned it from service.

Veterans — you already have the hardest skills. Now apply them to building something that's yours.`,
];

function pick(array, randomFn = Math.random) {
    return array[Math.floor(randomFn() * array.length)];
}

function parseJsonObject(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return null;
        try {
            return JSON.parse(match[0]);
        } catch {
            return null;
        }
    }
}

export function normalizeDanielFacebookCaption(text, maxLength = DEFAULT_MAX_LENGTH) {
    const normalized = String(text || '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (!normalized) return '';
    if (!Number.isFinite(maxLength) || maxLength < 4) return normalized;
    if (normalized.length <= maxLength) return normalized;

    return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function buildPrompt({ theme, tone, pillar, maxLength }) {
    const today = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });

    return `You write daily Facebook posts for Daniel Castillo — a military veteran turned AI agency founder in Orlando, FL.

He runs Ghost AI Systems (AI voice agents, lead gen, SaaS) and MediaGeekz (cinematic video production).

TODAY IS: ${today}

═══ CONTENT DIRECTION ═══
Pillar: ${pillar}
Theme: ${theme}
Tone: ${tone}

═══ AUDIENCE ═══
- Small business owners tired of generic advice
- Hustlers and grinders who respect action over talk
- People curious about AI but overwhelmed by the noise
- Veterans and blue-collar workers building something new
- Local Orlando business community

═══ VOICE RULES ═══
- Write like you're talking to a friend at a bar, not presenting at a conference
- Start with a HOOK — first line must stop the scroll (bold claim, question, controversial statement, or raw emotion)
- Be SPECIFIC — real numbers, real situations, real emotions
- Short paragraphs. Lots of white space. Facebook rewards readability.
- Mix in personality: humor, sarcasm, intensity, vulnerability — whatever fits the theme
- End with either a call-to-action question OR a powerful closing line
- NO hashtags. NO emojis except occasionally 🔥 or 💀 for emphasis.
- NO corporate speak. NO "leverage" or "synergy" or "ecosystem."
- Aim for comments and shares, not just likes

${pillar === 'trending' ? `═══ TRENDING CONTEXT ═══
Reference a REAL, RECENT development in AI, tech, or business from the last 7 days.
Examples: new model releases, company layoffs, funding rounds, regulation news, viral AI demos.
React to it with a strong opinion — don't just report it.` : ''}

${pillar === 'friction' ? `═══ FRICTION RULES ═══
Take a position that some people will disagree with.
The goal is to spark debate in the comments.
Don't be mean — be honest. There's a difference.
"I'd rather have 50 angry comments than 500 hollow likes."` : ''}

Return strict JSON only:
{
  "caption": "the full post text",
  "hook_type": "question|bold_claim|controversial|emotional|story_opener"
}

Keep total length under ${maxLength} characters.`;
}

export function createDanielFacebookContentBuilder(deps = {}) {
    const hasLLMProviderFn = deps.hasLLMProviderFn || hasLLMProvider;
    const generateTextFn = deps.generateTextFn || generateText;
    const randomFn = deps.randomFn || Math.random;

    function getTemplateCaption(options = {}) {
        const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
        const template = pick(TEMPLATE_CAPTIONS, randomFn);
        const caption = normalizeDanielFacebookCaption(template(), maxLength);

        return {
            caption,
            source: 'template',
            pillar: 'template',
            theme: 'template_fallback',
            provider: null,
            fallbackReason: null,
        };
    }

    async function buildCaption(options = {}) {
        const aiEnabled = options.aiEnabled !== false;
        const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
        const provider = options.provider || 'auto';
        const contentPillar = options.contentPillar || pick(CONTENT_PILLARS, randomFn);

        if (aiEnabled && hasLLMProviderFn()) {
            try {
                const prompt = buildPrompt({
                    theme: contentPillar.theme,
                    tone: contentPillar.tone,
                    pillar: contentPillar.pillar,
                    maxLength,
                });
                const { text, provider: usedProvider, model } = await generateTextFn({
                    prompt,
                    provider,
                    maxOutputTokens: 800,
                    openaiModel: 'gpt-5.4-mini',
                    geminiModel: process.env.GEMINI_MODEL || 'gemini-3-pro-preview',
                });

                const parsed = parseJsonObject(text);
                const caption = normalizeDanielFacebookCaption(parsed?.caption, maxLength);

                if (caption) {
                    return {
                        caption,
                        source: 'ai',
                        pillar: contentPillar.pillar,
                        theme: contentPillar.theme,
                        hookType: parsed?.hook_type || 'unknown',
                        provider: usedProvider || provider,
                        model: model || null,
                        fallbackReason: null,
                    };
                }

                const fallback = getTemplateCaption({ maxLength });
                return {
                    ...fallback,
                    fallbackReason: 'ai_empty',
                };
            } catch (error) {
                const fallback = getTemplateCaption({ maxLength });
                return {
                    ...fallback,
                    fallbackReason: `ai_error:${error.message}`,
                };
            }
        }

        const fallback = getTemplateCaption({ maxLength });
        return {
            ...fallback,
            fallbackReason: aiEnabled ? 'ai_unavailable' : 'ai_disabled',
        };
    }

    return {
        buildCaption,
        getTemplateCaption,
    };
}

const defaultBuilder = createDanielFacebookContentBuilder();

export async function buildDanielFacebookCaption(options = {}) {
    return defaultBuilder.buildCaption(options);
}

export function getDanielFacebookTemplateCaption(options = {}) {
    return defaultBuilder.getTemplateCaption(options);
}

export default {
    createDanielFacebookContentBuilder,
    buildDanielFacebookCaption,
    getDanielFacebookTemplateCaption,
    normalizeDanielFacebookCaption,
    CONTENT_PILLARS,
};

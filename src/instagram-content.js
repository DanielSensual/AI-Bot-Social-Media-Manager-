/**
 * Instagram Content Builder
 * =========================
 * Dedicated content engine for Instagram captions.
 * NOT tweets — these are 500-2200 char captions designed for
 * reels, stories, and carousel posts.
 *
 * Pillars: grit, friction, trending, story, tactical, lifestyle
 */

import dotenv from 'dotenv';
import { generateText, hasLLMProvider } from './llm-client.js';

dotenv.config();

const DEFAULT_MAX_LENGTH = 2000;

// ═══════════════════════════════════════════════════════════════
// CONTENT PILLARS — rotate for variety + engagement
// ═══════════════════════════════════════════════════════════════
const CONTENT_PILLARS = [
    // ── RAW MOTIVATIONAL ────────────────────────────────────
    {
        pillar: 'grit',
        theme: 'came from nothing — veteran, broke, figured it out, now building an empire',
        tone: 'raw, intense, personal, no filter',
    },
    {
        pillar: 'grit',
        theme: 'the nights nobody sees — late deploys, client fires, still going',
        tone: 'exhausted but unstoppable, let them see the struggle',
    },
    {
        pillar: 'grit',
        theme: 'they said it was impossible — military to tech founder with no degree',
        tone: 'defiant, underdog victory lap',
    },
    {
        pillar: 'grit',
        theme: 'discipline is the cheat code — not talent, not luck, just showing up',
        tone: 'drill sergeant energy meets entrepreneur',
    },

    // ── HOT TAKES & CONTROVERSY ─────────────────────────────
    {
        pillar: 'friction',
        theme: 'most people posting about AI have never shipped a single product',
        tone: 'calling out the noise, gatekeeping with receipts',
    },
    {
        pillar: 'friction',
        theme: 'your favorite guru is lying — here is what actually works',
        tone: 'myth-busting, aggressive truth, slightly cocky',
    },
    {
        pillar: 'friction',
        theme: 'the uncomfortable truth about entrepreneurship nobody shares on Instagram',
        tone: 'anti-highlight-reel, raw honesty',
    },
    {
        pillar: 'friction',
        theme: 'hot take: the 9-5 is not the enemy — laziness disguised as "freedom" is',
        tone: 'punching in all directions, holding everyone accountable',
    },

    // ── TRENDING / REACTIVE ─────────────────────────────────
    {
        pillar: 'trending',
        theme: 'react to the biggest AI or tech development this week',
        tone: 'informed insider dropping knowledge, strong opinion',
    },
    {
        pillar: 'trending',
        theme: 'why this week matters if you are building anything with technology right now',
        tone: 'urgent, connecting dots between news and action',
    },

    // ── REAL STORIES ────────────────────────────────────────
    {
        pillar: 'story',
        theme: 'a client came to us broken — here is what we built and what happened next',
        tone: 'narrative arc, specific details, emotional payoff, transformation',
    },
    {
        pillar: 'story',
        theme: 'the worst day in my business — and why it changed everything',
        tone: 'vulnerable but powerful, lesson at the end',
    },
    {
        pillar: 'story',
        theme: 'Orlando at 2am — the city sleeps but we are deploying another system',
        tone: 'cinematic, atmospheric, romanticizing the grind',
    },

    // ── LIFESTYLE / ASPIRATIONAL ────────────────────────────
    {
        pillar: 'lifestyle',
        theme: 'building from a laptop anywhere — what freedom actually looks like vs Instagram fantasy',
        tone: 'show the real version, not the rented lambo version',
    },
    {
        pillar: 'lifestyle',
        theme: 'creative meets technical — filming all day, coding all night',
        tone: 'dual identity energy, MediaGeekz + Ghost AI Systems',
    },

    // ── TACTICAL FLEX ───────────────────────────────────────
    {
        pillar: 'tactical',
        theme: 'one thing I automated this week that saves 10 hours — here is how',
        tone: 'show receipts, real numbers, make people screenshot this',
    },
    {
        pillar: 'tactical',
        theme: 'the AI voice agent answered 47 calls while the owner slept — this is the future',
        tone: 'let the work speak, subtle flex with proof',
    },
];

// ═══════════════════════════════════════════════════════════════
// TEMPLATE FALLBACKS — engaging, not generic
// ═══════════════════════════════════════════════════════════════
const TEMPLATE_CAPTIONS = [
    () => `Nobody handed me a playbook.

No trust fund. No network. No "connections."

Just a veteran with a laptop, a stupid amount of discipline, and the audacity to believe I could build an AI company from scratch.

Now we're building voice agents that answer phones 24/7, lead gen systems that run on autopilot, and entire SaaS platforms.

The secret? There is no secret.

You just don't quit. You show up at 6am. You deploy at midnight. You fix it when it breaks at 3am.

Every "overnight success" has 1,000 nights of grinding behind it.

If you're in the struggle right now — good. That's where the foundation gets built.

Keep going. 🔥`,

    () => `Unpopular opinion: 90% of people posting about AI have never deployed a single production system.

They screenshot ChatGPT and call it "leveraging AI."

Meanwhile we're over here building:
→ Voice agents handling real phone calls at 2am
→ Lead gen bots qualifying prospects in their sleep
→ Quote-to-invoice platforms closing deals automatically
→ Social media engines running 30 bots on autopilot

The gap between TALKING about AI and BUILDING with AI is massive.

Stop consuming. Start shipping.

Which side are you on?`,

    () => `Real talk.

I've been broke. Actually broke. Not "I only have $500" broke.

Negative balance. Selling equipment. Figuring out which bills can wait another month.

That version of me would be SHOCKED at what we're building now.

But here's the thing — that version of me is the REASON we're here.

That hunger doesn't disappear when you start making money. It just gets sharper.

If you're in that chapter right now, hear me: it's fuel, not a sentence.

Your story isn't over. It's barely started.`,

    () => `The best business advice I ever got wasn't from a course.

It was from the military.

→ Execute under pressure
→ Adapt when the plan falls apart  
→ Lead when nobody wants to
→ Show up when conditions are terrible
→ Never leave your people behind

I didn't learn entrepreneurship from a guru on YouTube.

I learned it in service. Then I applied it to building tech companies.

Veterans — you already have the hardest skills in the game. Now it's time to build something that's yours.`,

    () => `People ask what Ghost AI Systems actually does.

Simple answer: we make businesses money while the owner sleeps.

Phone rings at 2am? Our AI answers it, qualifies the lead, books the appointment.

Need 50 custom proposals sent? Done by morning with follow-ups loaded.

Social media dead? AI agents posting, engaging, building your audience on autopilot.

This is not science fiction. This is a random Tuesday for us.

The question isn't whether AI will transform your business.

It's whether you'll adopt it before your competitor does.

DM "GHOST" if you want to see what we can build for you. 👻`,
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

function normalizeCaption(text, maxLength = DEFAULT_MAX_LENGTH) {
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

    return `You write Instagram captions for Daniel Castillo — a military veteran turned AI agency founder in Orlando, FL.

He runs Ghost AI Systems (AI voice agents, lead gen, SaaS platforms) and MediaGeekz (cinematic video production).

TODAY IS: ${today}

═══ CONTENT DIRECTION ═══
Pillar: ${pillar}
Theme: ${theme}
Tone: ${tone}

═══ AUDIENCE ═══
- Entrepreneurs and small business owners
- Hustlers who respect grind over gimmicks
- People curious about AI but tired of the hype
- Veterans and working-class builders
- Orlando local business community
- Creative professionals (filmmakers, photographers, producers)

═══ INSTAGRAM CAPTION RULES ═══
- HOOK FIRST: The first line shows in preview — it MUST stop the scroll. Bold statement, provocative question, or emotional gut punch.
- Use line breaks aggressively. Short paragraphs. One idea per line. Instagram rewards readability.
- Write 500-1500 characters. Not too short (looks lazy), not too long (loses attention).
- Use → arrows and bullet points for lists. They pop visually.
- End with ENGAGEMENT: Ask a question, request a comment, or leave a powerful one-liner that lingers.
- 1-2 emojis MAX. Use 🔥 or 💀 or 👻 sparingly for emphasis. Never emoji soup.
- NO hashtags in the caption body (they go in comments).
- Sound like a REAL PERSON texting, not a brand copywriting agency.

${pillar === 'trending' ? `═══ TRENDING CONTEXT ═══
Reference a REAL, RECENT AI/tech/business development from the last 7 days.
React with a strong opinion. Don't just report — take a position that sparks debate.` : ''}

${pillar === 'friction' ? `═══ FRICTION RULES ═══
Take a position some people will hate. The goal is saves + shares + comments.
"I'd rather 50 angry comments than 500 empty likes."
Don't be mean. Be honest. There's a difference.` : ''}

${pillar === 'lifestyle' ? `═══ LIFESTYLE RULES ═══
Show the REAL version, not the rented lifestyle version.
Coffee at 6am. Coding at midnight. Shooting a commercial at noon.
Instagram loves aspirational — but make it AUTHENTIC aspirational.` : ''}

Return strict JSON only:
{
  "caption": "the full Instagram caption",
  "hook_type": "question|bold_claim|controversial|emotional|story_opener|flex"
}

Keep total length under ${maxLength} characters.`;
}

export function createInstagramContentBuilder(deps = {}) {
    const hasLLMProviderFn = deps.hasLLMProviderFn || hasLLMProvider;
    const generateTextFn = deps.generateTextFn || generateText;
    const randomFn = deps.randomFn || Math.random;

    function getTemplateCaption(options = {}) {
        const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
        const template = pick(TEMPLATE_CAPTIONS, randomFn);
        const caption = normalizeCaption(template(), maxLength);

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
                    openaiModel: 'gpt-5.2',
                    geminiModel: process.env.GEMINI_MODEL || 'gemini-3-pro-preview',
                });

                const parsed = parseJsonObject(text);
                const caption = normalizeCaption(parsed?.caption, maxLength);

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
                return { ...fallback, fallbackReason: 'ai_empty' };
            } catch (error) {
                const fallback = getTemplateCaption({ maxLength });
                return { ...fallback, fallbackReason: `ai_error:${error.message}` };
            }
        }

        const fallback = getTemplateCaption({ maxLength });
        return {
            ...fallback,
            fallbackReason: aiEnabled ? 'ai_unavailable' : 'ai_disabled',
        };
    }

    return { buildCaption, getTemplateCaption };
}

const defaultBuilder = createInstagramContentBuilder();

export async function buildInstagramCaption(options = {}) {
    return defaultBuilder.buildCaption(options);
}

export function getInstagramTemplateCaption(options = {}) {
    return defaultBuilder.getTemplateCaption(options);
}

export default {
    createInstagramContentBuilder,
    buildInstagramCaption,
    getInstagramTemplateCaption,
    CONTENT_PILLARS,
};

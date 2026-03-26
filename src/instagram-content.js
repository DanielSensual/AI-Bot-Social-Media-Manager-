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
    // ── DRILL SERGEANT CODE ─────────────────────────────────
    // Marine Corps DI energy — learn to code, build systems, stop making excuses
    {
        pillar: 'drill',
        theme: 'today you can change everything — learn to code, build systems, stop trading time for money',
        tone: 'Marine Corps drill instructor energy, direct orders, zero excuses allowed',
    },
    {
        pillar: 'drill',
        theme: 'discipline beats talent every single day — wake up, write code, deploy, repeat',
        tone: 'hard but caring, like a sergeant who genuinely believes in you',
    },
    {
        pillar: 'drill',
        theme: 'stop scrolling and start building — every hour on your phone is an hour you gave to someone else',
        tone: 'confrontational wake-up call, drill instructor morning formation energy',
    },
    {
        pillar: 'drill',
        theme: 'you do not need permission to build — open your laptop, pull up a tutorial, and start writing code right now',
        tone: 'urgent command, no-excuse directive, making them act TODAY',
    },

    // ── AI WEAPONS ──────────────────────────────────────────
    // Show what AI systems actually do — make them want it
    {
        pillar: 'weapons',
        theme: 'AI voice agents answered 47 calls last night while the business owner slept — this is the new standard',
        tone: 'tactical briefing, showing the weapon, making them want it',
    },
    {
        pillar: 'weapons',
        theme: 'one automation replaced 3 employees worth of manual work — not to fire people, to free them up for what matters',
        tone: 'strategic, showing the ROI, systems-level thinking',
    },
    {
        pillar: 'weapons',
        theme: 'we built a system that generates leads, qualifies them, books appointments, and follows up — all while sleeping',
        tone: 'flex with receipts, showing the machine running, not bragging',
    },

    // ── VETERAN GRIT ────────────────────────────────────────
    // Military to tech founder story — earned authority
    {
        pillar: 'grit',
        theme: 'military taught me to execute under pressure — entrepreneurship is the same battlefield different uniform',
        tone: 'raw veteran energy, earned authority, been through real fire',
    },
    {
        pillar: 'grit',
        theme: 'no degree, no trust fund, no connections — just discipline and a laptop and the audacity to believe',
        tone: 'underdog story, defiant, proving every doubter wrong daily',
    },
    {
        pillar: 'grit',
        theme: 'the nights nobody sees — deploying systems at 2am, fixing client fires at 3am, back at it by 6am',
        tone: 'exhausted but unstoppable, showing the cost of winning',
    },

    // ── CLASS FUNNEL ────────────────────────────────────────
    // Soft CTAs leading to Ghost AI coding education
    {
        pillar: 'funnel',
        theme: 'we are building a generation of AI-native builders — coding is the new literacy and it is not optional',
        tone: 'visionary but accessible, inviting them into the mission',
    },
    {
        pillar: 'funnel',
        theme: 'the people who learn to build AI systems NOW will own the next decade — which side are you choosing',
        tone: 'urgency without hype, strategic recruitment into the builder class',
    },
    {
        pillar: 'funnel',
        theme: 'I did not wait for someone to teach me — I taught myself, and now I am building the program I wish I had',
        tone: 'personal mission, building the ladder for the next generation',
    },

    // ── SYSTEMS THINKING ────────────────────────────────────
    // How automation works — engineer mindset
    {
        pillar: 'systems',
        theme: 'the difference between hustling and building is systems — one makes you tired, one makes you free',
        tone: 'philosophical but practical, engineer architect mindset',
    },
    {
        pillar: 'systems',
        theme: 'every manual task in your business is a system waiting to be built — you just have not built it yet',
        tone: 'challenging their status quo, making them see the inefficiency',
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

    return `You write Instagram captions for Ghost — the face of Ghost AI Systems. Ghost is a military veteran turned AI systems architect in Orlando, FL. He speaks with Marine Corps drill sergeant authority mixed with genuine care for people trying to level up.

He runs Ghost AI Systems (AI voice agents, lead gen, SaaS platforms, automation) and is building a coding education program to create the next generation of AI-native builders.

TODAY IS: ${today}

═══ CONTENT DIRECTION ═══
Pillar: ${pillar}
Theme: ${theme}
Tone: ${tone}

═══ AUDIENCE ═══
- People who know they need to learn to code but haven't started yet
- Entrepreneurs drowning in manual work who need systems
- Veterans and working-class builders tired of trading time for money
- Aspiring AI builders who want to own the next decade
- Business owners who need to see what AI automation actually looks like

═══ INSTAGRAM CAPTION RULES ═══
- HOOK FIRST: The first line shows in preview — it MUST stop the scroll. Bold statement, provocative question, or emotional gut punch.
- Use line breaks aggressively. Short paragraphs. One idea per line. Instagram rewards readability.
- Write 500-1500 characters. Not too short (looks lazy), not too long (loses attention).
- Use → arrows and bullet points for lists. They pop visually.
- End with ENGAGEMENT: Ask a question, request a comment, or leave a powerful one-liner that lingers.
- 1-2 emojis MAX. Use 🔥 or 💀 or 👻 sparingly for emphasis. Never emoji soup.
- NO hashtags in the caption body (they go in comments).
- Sound like a DRILL INSTRUCTOR who also happens to be a software engineer — not a brand copywriting agency.

${pillar === 'drill' ? `═══ DRILL SERGEANT RULES ═══
You are giving a direct ORDER. No suggestion, no "maybe you should" — COMMAND them to act.
"Open your laptop. Pull up a tutorial. Start writing code. NOW."
Channel Marine Corps boot camp energy — intense but building them up, not tearing down.
Make them feel like NOT acting is unacceptable.` : ''}

${pillar === 'weapons' ? `═══ WEAPONS BRIEFING RULES ═══
Show SPECIFIC results. Real numbers. Real systems. Real outcomes.
"47 calls answered. 12 leads qualified. 3 appointments booked. Zero humans involved."
This is a tactical briefing — make them see the weapon and want it.
Don't hype AI — show what it DID.` : ''}

${pillar === 'funnel' ? `═══ CLASS FUNNEL RULES ═══
Plant the seed that learning to code changes everything.
Don't hard-sell — make them feel like they're being RECRUITED into something bigger.
"We're building a generation of builders. The only question is: are you in?"
The CTA is always about LEARNING and BUILDING, never about buying.` : ''}

${pillar === 'grit' ? `═══ VETERAN GRIT RULES ═══
This is raw, real, earned authority. No fake motivation.
Share the cost: the 2am deploys, the failures, the grind nobody sees.
Then show what's on the other side: freedom. Systems. Ownership.
Don't romanticize struggle — show what it BUILT.` : ''}

Return strict JSON only:
{
  "caption": "the full Instagram caption",
  "hook_type": "question|bold_claim|drill_command|battle_story|weapons_briefing|recruitment"
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
                    openaiModel: 'gpt-5.4-mini',
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

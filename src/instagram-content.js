/**
 * Instagram Content Builder — Ghost AI Systems
 * ==============================================
 * Multi-model creative pipeline for Instagram captions + video prompts.
 *
 * 8 Content Pillars — rotated for variety + engagement.
 * Primary LLM: Grok 4.2 (authentic, human voice)
 * Fact verification: Gemini Flash (for factual claims)
 *
 * Each AI response returns:
 *   { caption, video_prompt, hook_type }
 */

import dotenv from 'dotenv';
import { generateText, hasLLMProvider } from './llm-client.js';

dotenv.config();

const DEFAULT_MAX_LENGTH = 2000;

// ═══════════════════════════════════════════════════════════════
// 8 CONTENT PILLARS — inspirational-forward, varied
// ═══════════════════════════════════════════════════════════════
const CONTENT_PILLARS = [
    // ── INSPIRATION ─────────────────────────────────────────
    // Hungry, motivational, "you can change your life today"
    {
        pillar: 'inspiration',
        theme: 'today you can change everything — learn to code, build systems, take control of your future',
        tone: 'Tony Robbins meets a combat veteran — convicted, passionate, not cheesy. Speaks from experience.',
    },
    {
        pillar: 'inspiration',
        theme: 'discipline beats motivation every single day — motivation fades, systems endure',
        tone: 'Calm intensity. Not yelling, but making them feel like NOT acting is unacceptable.',
    },
    {
        pillar: 'inspiration',
        theme: 'you were not built for the cubicle — you were built to create, to build, to ship things that matter',
        tone: 'Visionary, calling them into their potential. Make them feel chosen.',
    },
    {
        pillar: 'inspiration',
        theme: 'every empire started with one person who said "I can figure this out" — that person is you, right now',
        tone: 'Urgent but warm. Not selling anything — recruiting them into believing in themselves.',
    },

    // ── AI SHOWCASE ─────────────────────────────────────────
    // What AI systems actually do — real results, real impact
    {
        pillar: 'ai_showcase',
        theme: 'AI voice agents answered 47 calls last night while the business owner slept — this is the new standard',
        tone: 'Tactical briefing with receipts. Show the weapon, make them want it.',
    },
    {
        pillar: 'ai_showcase',
        theme: 'we built a system that generates leads, qualifies them, books appointments, and follows up — all while sleeping',
        tone: 'Quiet confidence. Not bragging — demonstrating what is now possible.',
    },
    {
        pillar: 'ai_showcase',
        theme: 'one automation replaced 3 employees worth of manual work — not to fire people, to free them for what matters',
        tone: 'Strategic, showing the ROI, making them think about their own manual bottlenecks.',
    },

    // ── VETERAN STORY ───────────────────────────────────────
    // Personal journey, military-to-tech founder arc
    {
        pillar: 'veteran_story',
        theme: 'military taught me to execute under pressure — entrepreneurship is the same battlefield, different uniform',
        tone: 'Raw, earned authority. Been through real fire. No fake motivation.',
    },
    {
        pillar: 'veteran_story',
        theme: 'no degree, no trust fund, no connections — just discipline and a laptop and the audacity to believe',
        tone: 'Underdog story, defiant, proving every doubter wrong with results.',
    },
    {
        pillar: 'veteran_story',
        theme: 'the nights nobody sees — deploying code at 2am, fixing client fires at 3am, back at it by 6am',
        tone: 'Exhausted but unstoppable. Showing the cost of winning.',
    },

    // ── BUILDER ─────────────────────────────────────────────
    // Learn to code, build systems, own your future
    {
        pillar: 'builder',
        theme: 'we are building a generation of AI-native builders — coding is the new literacy and it is not optional',
        tone: 'Visionary but accessible. Recruiting them into the mission.',
    },
    {
        pillar: 'builder',
        theme: 'the people who learn to build AI systems NOW will own the next decade — which side are you choosing',
        tone: 'Urgency without hype. Strategic recruitment into the builder class.',
    },

    // ── BEHIND THE SCENES ───────────────────────────────────
    // Building in public — the real work of running an AI agency
    {
        pillar: 'behind_scenes',
        theme: 'the real work of building an AI company — the deployments, the pivots, the breakthroughs nobody posts about',
        tone: 'Transparent, human. Showing the journey, not just the highlight reel.',
    },
    {
        pillar: 'behind_scenes',
        theme: 'just shipped a feature that took 3 days of debugging — the feeling of seeing it work in production is everything',
        tone: 'In-the-trenches energy. Making engineering feel exciting and human.',
    },

    // ── INDUSTRY INSIGHT ────────────────────────────────────
    // AI news, market shifts — translated for non-technical people
    {
        pillar: 'industry',
        theme: 'breaking down the latest AI model release — what it actually means for small businesses',
        tone: 'Translator. "Here is what this means for you." Opinionated, not just summarizing.',
    },
    {
        pillar: 'industry',
        theme: 'stop listening to AI influencers who have never deployed a production system — here is what is actually working right now',
        tone: 'Filter the noise. Save busy people from hype. Give real signal.',
    },

    // ── CASE STUDY ──────────────────────────────────────────
    // Client wins, system results, before/after
    {
        pillar: 'case_study',
        theme: 'before: business owner answering 200 calls manually. After: AI handles 95%, owner focuses on growth',
        tone: 'Show don\'t tell. Numbers first. Let results do the selling.',
    },

    // ── HOT TAKE ────────────────────────────────────────────
    // Provocative opinions on tech, business, culture
    {
        pillar: 'hot_take',
        theme: 'unpopular opinion: 90% of people posting about AI have never deployed a single production system',
        tone: 'Confident, slightly controversial, conversation starter. Pull no punches.',
    },
    {
        pillar: 'hot_take',
        theme: 'the gap between TALKING about AI and BUILDING with AI is becoming a canyon — most people are on the wrong side',
        tone: 'Blunt truth. Not mean-spirited — just honest about the state of things.',
    },
    {
        pillar: 'hot_take',
        theme: 'college degrees are becoming optional for tech careers — the internet is the greatest university in human history, use it',
        tone: 'Challenging the status quo. Empowering non-traditional paths.',
    },
];

// ═══════════════════════════════════════════════════════════════
// TEMPLATE FALLBACKS — engaging, varied tone
// ═══════════════════════════════════════════════════════════════
const TEMPLATE_CAPTIONS = [
    () => `Nobody handed me a playbook.

No trust fund. No network. No "connections."

Just a veteran with a laptop, a stupid amount of discipline, and the audacity to believe I could build an AI company from scratch.

The secret? There is no secret.

You just don't quit. You show up at 6am. You deploy at midnight. You fix it when it breaks.

If you're in the struggle right now — good. That's where the foundation gets built.

Keep going. 🔥`,

    () => `AI is not coming to replace you.

AI is coming to replace the people who refuse to learn it.

That's the actual reality nobody wants to say out loud.

The tools are free. The tutorials are free. YouTube university is open 24/7.

The only cost is your time — and you're already spending it scrolling.

What if you spent 1 hour today learning something that could change your next 10 years?

Just 1 hour. Start there.`,

    () => `Real talk.

I've been broke. Actually broke. Not "I only have $500" broke.

Negative balance. Selling equipment. Figuring out which bills can wait another month.

That version of me would be SHOCKED at what we're building now.

But here's the thing — that version of me is the REASON we're here.

That hunger doesn't disappear when you start making money. It just gets sharper.

If you're in that chapter right now, hear me: it's fuel, not a sentence.

Your story isn't over. It's barely started.`,

    () => `We deployed an AI voice agent for a local business last week.

Within 48 hours:
→ 47 calls answered automatically
→ 12 leads qualified and scored
→ 3 appointments booked
→ Zero humans involved

The owner called us and said "I thought you were exaggerating."

We weren't.

This is what most businesses are sleeping on.

If your phone goes to voicemail after 5pm, you're leaving money on the table every single night.`,

    () => `The best business advice I ever got wasn't from a course.

It was from the military.

→ Execute under pressure
→ Adapt when the plan falls apart
→ Lead when nobody wants to
→ Show up when conditions are terrible
→ Never leave your people behind

Veterans — you already have the hardest skills in the game. Now build something that's yours.`,
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

    return `You write Instagram captions for Ghost — the face of Ghost AI Systems. Ghost is a military veteran turned AI systems architect in Orlando, FL. He speaks with authority AND genuine warmth — not a drill sergeant shouting orders, but a leader who inspires action through conviction and lived experience.

He runs Ghost AI Systems (AI voice agents, lead gen, SaaS platforms, automation) and is building the future of AI-native businesses.

TODAY IS: ${today}

═══ CONTENT DIRECTION ═══
Pillar: ${pillar}
Theme: ${theme}
Tone: ${tone}

═══ AUDIENCE ═══
- Entrepreneurs drowning in manual work who need AI systems to scale
- People who know they should learn to code/build but haven't started
- Veterans and working-class builders tired of trading time for money
- Business owners who want to see what AI automation actually looks like
- Anyone hungry to level up — career, business, skills, mindset

═══ VOICE RULES ═══
- Ghost is INSPIRATIONAL, not just tough. Think motivational leader with military precision, not boot camp screaming.
- Lead with HOPE and POSSIBILITY, backed by real experience and results.
- Be AUTHENTIC — write like a real human posting, not a brand.
- Vary between vulnerability, intensity, humor, and strategic thinking.
- Sometimes be philosophical. Sometimes be tactical. Sometimes be personal. VARY IT.
- Sound like someone people want to follow, not just respect.

═══ INSTAGRAM FORMAT RULES ═══
- HOOK FIRST: First line shows in preview — it MUST stop the scroll.
- Use line breaks aggressively. Short paragraphs. One idea per line.
- Write 500-1500 characters.
- Use → arrows and • bullets for lists.
- End with ENGAGEMENT: question, call to comment, or powerful closing line.
- 1-2 emojis MAX. Use 🔥 or 👻 sparingly.
- NO hashtags in caption body.

═══ VIDEO PROMPT ═══
Also generate a cinematic video prompt for Grok Imagine Video that would pair well with this caption. The video should be:
- 9:16 vertical format (Instagram Reel)
- Cinematic, moody lighting, professional quality
- Themes: technology, entrepreneurship, determination, AI systems, city nightscapes, coding
- NO text overlays in the video
- 5-8 seconds, visually striking

Return strict JSON only:
{
  "caption": "the full Instagram caption",
  "video_prompt": "detailed cinematic video generation prompt",
  "hook_type": "inspiration|tactical|story|hot_take|showcase|builder"
}

Keep caption under ${maxLength} characters.`;
}

/**
 * Verify factual claims via Gemini Flash.
 * Returns verified text or null if verification fails.
 */
async function verifyFacts(caption) {
    try {
        const { text } = await generateText({
            provider: 'gemini',
            geminiModel: 'gemini-2.5-flash-preview-05-20',
            prompt: `Review this social media caption for factual accuracy. If all claims are reasonable, return exactly: VERIFIED

If there are factual errors, return: ISSUE: [brief description of the problem]

Caption to verify:
"""
${caption}
"""`,
            maxOutputTokens: 200,
        });

        const result = String(text || '').trim();
        if (result.startsWith('VERIFIED')) return { verified: true };
        return { verified: false, issue: result };
    } catch {
        // If verification fails, allow the post (don't block on verification errors)
        return { verified: true, skipped: true };
    }
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
            videoPrompt: 'Cinematic establishing shot of a modern city at night, sleek office with multiple monitors showing code and AI dashboards, dramatic lighting, 9:16 vertical, slow camera movement revealing the scope of the operation',
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
        const provider = options.provider || 'grok'; // Grok 4.2 by default
        const contentPillar = options.contentPillar || pick(CONTENT_PILLARS, randomFn);
        const shouldVerify = ['industry', 'case_study', 'ai_showcase'].includes(contentPillar.pillar);

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
                    maxOutputTokens: 1200,
                    grokModel: 'grok-4.20-0309-reasoning',
                });

                const parsed = parseJsonObject(text);
                const caption = normalizeCaption(parsed?.caption, maxLength);
                const videoPrompt = parsed?.video_prompt || null;

                if (caption) {
                    // Optional fact verification for factual pillars
                    if (shouldVerify) {
                        const verification = await verifyFacts(caption);
                        if (!verification.verified) {
                            console.log(`   ⚠️ Fact check flagged: ${verification.issue}`);
                            // Still post but log the issue — don't block
                        }
                    }

                    return {
                        caption,
                        videoPrompt,
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

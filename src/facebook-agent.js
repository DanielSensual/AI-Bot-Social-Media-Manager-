/**
 * Facebook Agentic Automation
 * Autonomous scheduler for text + reel-style video posting on Facebook.
 */

import dotenv from 'dotenv';
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { testFacebookConnection, postToFacebook, postToFacebookWithVideo } from './facebook-client.js';
import { generateVideo, cleanupCache } from './video-generator.js';
import { isDuplicate, record } from './post-history.js';
import { hasLLMProvider, generateText } from './llm-client.js';
import { humanizeCaption } from './caption-utils.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FB_BRAIN_PATH = path.join(__dirname, '..', 'fb-brain.md');
const DEFAULT_TIMES = ['09:30', '13:00', '18:30', '21:00'];
const WEBSITE = 'https://ghostaisystems.com';
const CTA_LINKS = [
    { url: `${WEBSITE}`, label: 'See what we build' },
    { url: `${WEBSITE}/buy`, label: 'Get a site shipped in 72 hours' },
    { url: `${WEBSITE}/intake`, label: 'Ask us anything' },
    { url: `${WEBSITE}/consulting`, label: 'Book a strategy call' },
    { url: `${WEBSITE}/ai`, label: 'See our AI stack' },
];

// Counter for CTA injection — every 3rd post gets a direct link
let postCounter = 0;

function getCtaLink() {
    return CTA_LINKS[Math.floor(Math.random() * CTA_LINKS.length)];
}

function injectCTA(caption) {
    postCounter++;
    if (postCounter % 3 === 0) {
        const cta = getCtaLink();
        return `${caption}\n\n🔗 ${cta.label}: ${cta.url}`;
    }
    return caption;
}

// ── Day-of-Week Content Themes ──────────────────────────────────────────
// Maps EST day-of-week (0=Sun) to a content theme from fb-brain.md
const DAY_THEMES = {
    0: { id: 'community',   label: 'Community Engagement' },
    1: { id: 'value',       label: 'Value Bomb' },
    2: { id: 'friction',    label: 'Friction Engine' },
    3: { id: 'bts',         label: 'Behind the Scenes' },
    4: { id: 'portfolio',   label: 'Portfolio Showcase' },
    5: { id: 'cta',         label: 'CTA & Offer' },
    6: { id: 'commentary',  label: 'Industry Commentary' },
};

// Strategies tagged with their theme ID for day-of-week matching
const STRATEGIES = [
    {
        id: 'myth-breaker',
        theme: 'value',
        angle: 'Break a common myth about AI in business and replace it with a practical execution framework.',
        cta: 'Ask people to comment their biggest AI bottleneck.',
        fallbackCaption: `Most businesses are using AI backwards.

They chase tools first, and outcomes second.

Better order:
1) Pick one recurring bottleneck
2) Design a simple workflow
3) Add AI where speed and consistency matter
4) Measure weekly impact

AI wins come from systems, not hype.

Comment "WORKFLOW" and I will share one practical setup.`,
        fallbackVideoPrompt: 'Vertical 9:16 cinematic short-form scene of a business owner overwhelmed by tasks, then smoothly transitioning into a calm AI-driven workflow dashboard with strong visual contrast and fast stop-scroll pacing.',
    },
    {
        id: 'viral-ai-stat',
        theme: 'value',
        angle: 'Share a jaw-dropping AI statistic or prediction that stops scrollers. Frame it as an opportunity, not a threat. Position Ghost AI Systems as the team already building this future.',
        cta: `Link to ${WEBSITE} with a soft CTA.`,
        fallbackCaption: `AI agents will handle 80% of customer interactions by 2027.

Not chatbots. Autonomous agents that:
→ Answer calls in any language
→ Book appointments 24/7
→ Follow up on leads instantly
→ Never take a day off

We already build these for businesses.

🔗 See the stack: ${WEBSITE}/ai`,
        fallbackVideoPrompt: 'Vertical 9:16 futuristic AI control room with holographic dashboards, autonomous agents represented as glowing orbs processing requests, dramatic cinematic lighting with deep blue and gold tones.',
    },
    {
        id: 'ai-hot-take',
        theme: 'friction',
        angle: 'Drop a controversial opinion about AI that sparks debate. Be bold. Take a side. Make people feel something — then position Ghost AI as proof of the thesis.',
        cta: 'Engage commenters and mention the website naturally.',
        fallbackCaption: `Hot take: 90% of "AI companies" are just API wrappers.

Real AI integration means:
• Voice agents that book appointments
• Systems that learn from your data
• Automation that runs while you sleep

We ship real AI systems, not demos.

Agree or disagree? 👇`,
        fallbackVideoPrompt: 'Vertical 9:16 dramatic split-screen: left side shows a generic chatbot widget, right side shows a full AI operations center with voice agents, booking flows, and analytics — cinematic reveal.',
    },
    {
        id: 'pain-hook',
        theme: 'friction',
        angle: 'Call out missed revenue from slow lead response and position automation as the solution. Make it debatable.',
        cta: 'Ask followers to choose one area to automate this month.',
        fallbackCaption: `The hidden cost in most businesses is response speed.

Every missed call, delayed message, and untracked lead leaks revenue.

Agentic automation fixes that:
- Instant lead follow-up
- Auto qualification
- Smart handoff to your team

What is the first thing you want automated this month?`,
        fallbackVideoPrompt: 'Vertical 9:16 high-energy social clip showing incoming leads piling up, then AI systems instantly replying, sorting, and booking calls, with dynamic camera movement and punchy transitions.',
    },
    {
        id: 'builder-log',
        theme: 'bts',
        angle: 'Share a raw behind-the-scenes moment — a late-night deploy, a problem solved, a metric hit. Authenticity over polish.',
        cta: 'Ask what others shipped this week.',
        fallbackCaption: `Shipped a client site at 11pm last night.

By midnight their AI receptionist had booked 3 calls.
By morning: 2 new customers.

This is what "always on" actually means.

What did you ship this week? 👇`,
        fallbackVideoPrompt: 'Vertical 9:16 atmospheric late-night coding session transitioning to a dashboard lighting up with incoming bookings and AI call notifications, moody cinematic lighting.',
    },
    {
        id: 'case-style',
        theme: 'portfolio',
        angle: 'Present a concise transformation narrative: before vs after using AI systems.',
        cta: 'Invite people to request the blueprint.',
        fallbackCaption: `Before: random posting, slow follow-up, inconsistent sales pipeline.
After: one agentic system driving content, lead response, and booking flow.

The difference is not talent.
The difference is operating rhythm.

When your systems execute daily, growth compounds.

Comment "BLUEPRINT" if you want the exact structure.`,
        fallbackVideoPrompt: 'Vertical 9:16 before-and-after montage: chaotic business operations transform into clean AI dashboards, booked calendar notifications, and smooth team workflows, cinematic and high-contrast.',
    },
    {
        id: 'website-showcase',
        theme: 'portfolio',
        angle: 'Showcase what Ghost AI Systems ships in 72 hours — a production-ready website with AI integrations, analytics, and security. Make it aspirational.',
        cta: `Direct link to ${WEBSITE}/buy to purchase SiteDrop.`,
        fallbackCaption: `What you get when we build your website:

✓ Full custom design + development
✓ SEO + metadata setup
✓ AI voice agent integration
✓ Analytics dashboard
✓ Security headers
✓ Cross-device testing
✓ Production deploy

All in 72 hours. Not a prototype — a system.

🔗 Get started: ${WEBSITE}/buy`,
        fallbackVideoPrompt: 'Vertical 9:16 rapid-fire montage of beautiful websites being designed, coded, and deployed — screens lighting up with analytics dashboards, phones ringing with AI voice agents, all set to dynamic electronic music pace.',
    },
    {
        id: 'free-audit-offer',
        theme: 'cta',
        angle: 'Offer a free AI website audit to drive inbound leads. Create urgency with limited spots.',
        cta: `Direct link to ${WEBSITE}/intake for the audit form.`,
        fallbackCaption: `Free for the next 48 hours:

I will personally audit your website and show you:
✓ 3 quick wins for more conversions
✓ How AI can handle your leads 24/7
✓ What your competitors are doing that you're not

DM "AUDIT" or fill out the form:
🔗 ${WEBSITE}/intake`,
        fallbackVideoPrompt: 'Vertical 9:16 screen recording style showing a website audit in progress — highlighting conversion issues, then AI improvements being implemented in real-time, satisfying before/after reveal.',
    },
    {
        id: 'ai-news-reaction',
        theme: 'commentary',
        angle: 'React to the latest AI industry news with a sharp, contrarian take. Be specific about what it means for small businesses and operators.',
        cta: 'Ask what people think about the news.',
        fallbackCaption: `Everyone is talking about the latest AI model releases.

But here is what nobody is asking:
Does your business actually USE the last model upgrade?

Most companies are 2 years behind on implementation.
The gap is not capability — it is execution.

What AI tool has actually changed your daily workflow? 👇`,
        fallbackVideoPrompt: 'Vertical 9:16 news-style kinetic typography with AI headlines flying in, then a calm operator perspective cutting through the noise with practical insights.',
    },
    {
        id: 'conversation-starter',
        theme: 'community',
        angle: 'Post a high-engagement question that prompts replies from founders and operators. Zero selling.',
        cta: 'Prompt a simple one-word/one-number answer.',
        fallbackCaption: `Quick founder poll:

If you could deploy one AI agent today, what should it own?

1) Lead follow-up
2) Content creation
3) Customer support
4) Operations

Reply with a number and I will share the fastest implementation path.`,
        fallbackVideoPrompt: 'Vertical 9:16 social-first visual with bold kinetic typography-style motion and abstract AI interface backgrounds, optimized for immediate attention and a polling call-to-action feel.',
    },
];

let cycleInProgress = false;

function parseBoolean(value, fallback = false) {
    if (value == null || value === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseIntInRange(value, fallback, min, max) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function parseTimes(value, fallbackTimes) {
    if (!value) return fallbackTimes;

    const raw = String(value).split(',').map((t) => t.trim()).filter(Boolean);
    const pattern = /^([01]?\d|2[0-3]):([0-5]\d)$/;
    const normalized = raw
        .filter((time) => pattern.test(time))
        .map((time) => {
            const [h, m] = time.split(':');
            return `${h.padStart(2, '0')}:${m}`;
        });

    return normalized.length > 0 ? [...new Set(normalized)] : fallbackTimes;
}

function shouldUse(ratio) {
    return Math.random() * 100 < ratio;
}

/**
 * Load the fb-brain.md persona file for AI prompt context
 */
function loadFBBrain() {
    try {
        return fs.readFileSync(FB_BRAIN_PATH, 'utf-8');
    } catch {
        console.warn('⚠️ fb-brain.md not found — using fallback prompts');
        return null;
    }
}

/**
 * Get today's content theme based on the EST day of week.
 * Returns { id, label } from DAY_THEMES.
 */
function getDayTheme(timezone = 'America/New_York') {
    const now = new Date();
    // Get the current day of week in the configured timezone
    const dayOfWeek = Number(
        new Intl.DateTimeFormat('en-US', { weekday: 'narrow', timeZone: timezone })
            .formatToParts(now)
            .find((p) => p.type === 'weekday')?.value
            // Fallback: parse the locale day name to a number
    ) || now.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'short' });

    // Map locale weekday short name to day number (0=Sun)
    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dayShort = now.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'short' });
    const dayNum = dayMap[dayShort] ?? now.getDay();

    return DAY_THEMES[dayNum] || DAY_THEMES[0];
}

/**
 * Pick a strategy matching today's day-of-week theme.
 * Falls back to random if no matching strategy is found.
 */
function pickStrategy(timezone = 'America/New_York') {
    const dayTheme = getDayTheme(timezone);
    console.log(`📅 Day theme: ${dayTheme.label} (${dayTheme.id})`);

    // Filter strategies that match today's theme
    const matching = STRATEGIES.filter((s) => s.theme === dayTheme.id);

    if (matching.length > 0) {
        return matching[Math.floor(Math.random() * matching.length)];
    }

    // Fallback: random strategy if no match (shouldn't happen with full coverage)
    console.warn(`   ⚠️ No strategies for theme "${dayTheme.id}", picking random`);
    return STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)];
}

function getFacebookAgentConfig() {
    return {
        enabled: parseBoolean(process.env.FACEBOOK_AGENT_ENABLED, true),
        timezone: process.env.FACEBOOK_AGENT_TIMEZONE || 'America/New_York',
        times: parseTimes(process.env.FACEBOOK_AGENT_TIMES, DEFAULT_TIMES),
        aiRatio: parseIntInRange(process.env.FACEBOOK_AGENT_AI_RATIO, 85, 0, 100),
        reelRatio: parseIntInRange(process.env.FACEBOOK_AGENT_REEL_RATIO, 45, 0, 100),
        videoDuration: parseIntInRange(process.env.FACEBOOK_AGENT_VIDEO_DURATION, 5, 3, 10),
        jitterMinutes: parseIntInRange(process.env.FACEBOOK_AGENT_JITTER_MINUTES, 5, 0, 45),
        healthCheck: parseBoolean(process.env.FACEBOOK_AGENT_HEALTH_CHECK, true),
        runOnStart: parseBoolean(process.env.FACEBOOK_AGENT_RUN_ON_START, false),
        dryRun: parseBoolean(process.env.DRY_RUN, false),
    };
}

function normalizeText(text) {
    return humanizeCaption(text);
}

function safeJsonParse(content) {
    const raw = String(content || '').trim();
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch {
        const blockMatch = raw.match(/\{[\s\S]*\}/);
        if (!blockMatch) return null;
        try {
            return JSON.parse(blockMatch[0]);
        } catch {
            return null;
        }
    }
}

async function generateAICreative(strategy, useReel) {
    if (!hasLLMProvider()) return null;

    // Load fb-brain.md for full persona context
    const fbBrain = loadFBBrain();
    const dayTheme = getDayTheme();

    let prompt;
    if (fbBrain) {
        prompt = `Here is your complete identity, voice, and content strategy:\n\n${fbBrain}\n\n---\n\nToday is ${dayTheme.label} day (theme: ${dayTheme.id}).\n\nSTRATEGY:\n${strategy.angle}\n\nENGAGEMENT CTA:\n${strategy.cta}\n\nOUTPUT FORMAT:\nReturn strict JSON only:\n{\n  "caption": "facebook caption text",\n  "videoPrompt": "only if useReel=true, otherwise empty string"\n}\n\n═══ ANTI-BOT FORMATTING (OVERRIDE ALL OTHER STYLE RULES) ═══\n\nFacebook's algorithm buries and flags robotic-looking posts. You MUST write like a real human.\n\n1. Write like you're texting a friend. NOT writing marketing copy.\n2. SHORT paragraphs (1-3 sentences). One blank line between them.\n3. VARY sentence length — mix "That's it." with longer flowing thoughts.\n4. Do NOT start with an emoji. Max 1-2 emojis total, placed naturally.\n5. Do NOT use bullet lists, arrow lists (→ • ✓), or numbered lists. Natural paragraphs only.\n6. Do NOT use markdown (no **bold**, no _italic_).\n7. Max 2 hashtags, only if absolutely necessary.\n8. Vary your hook type — don't always start with "Hot take:" or a statistic.\n9. End with either a question OR a closing line. Not both.\n\nBAD (robotic):\n"🚀 AI is revolutionizing business!\n→ Voice agents\n→ Lead gen\n→ Automation\nComment below! 👇🔥"\n\nGOOD (human):\n"I shipped a client site at 11pm last night.\n\nBy midnight their AI receptionist had booked 3 calls.\n\nThis is what 'always on' actually means.\n\nWhat did you ship this week?"\n\nuseReel=${useReel ? 'true' : 'false'}`;
    } else {
        prompt = `You create high-performing Facebook Page content for "Artificial Intelligence Knowledge".
This page is run by Ghost AI Systems (${WEBSITE}) — an AI agency that ships production-ready websites in 72 hours with AI voice agents, analytics, and automation.

TODAY'S THEME: ${dayTheme.label} (${dayTheme.id})

OBJECTIVE:\n${strategy.angle}

ENGAGEMENT CTA:\n${strategy.cta}

OUTPUT FORMAT:\nReturn strict JSON only:\n{\n  "caption": "facebook caption text",\n  "videoPrompt": "only if useReel=true, otherwise empty string"\n}

═══ FORMATTING RULES (CRITICAL — FOLLOW EXACTLY) ═══\n\nFacebook's algorithm buries and flags robotic-looking posts. Your caption MUST look like a real person wrote it on their phone.\n\n1. Write like you're texting — not presenting at a conference, not writing a LinkedIn post.\n2. SHORT paragraphs (1-3 sentences max per block). One blank line between blocks.\n3. VARY sentence length — mix short punchy lines with longer flowing thoughts.\n4. Do NOT start with an emoji. Do NOT start every line with an emoji.\n5. Max 1-2 emojis TOTAL in the caption, placed naturally mid-sentence or at the end.\n6. Do NOT use bullet lists, numbered lists, or arrow lists (→ • ✓ 1. 2. 3.). Write flowing paragraphs.\n7. No markdown (**bold**, _italic_, headers). Plain text only.\n8. No hashtags unless absolutely necessary (max 2).\n9. First line = scroll-stopper. Vary the type: question, bold claim, mid-story opener.\n10. Keep caption between 200 and 600 characters.\n11. If the strategy CTA mentions a link, INCLUDE the exact URL naturally in the text.\n12. End with a question or a powerful closer — NOT both.\n13. Write for a broad audience: business owners, marketers, tech enthusiasts — not just developers.\n\nBAD (robotic, will get flagged):\n"🚀 5 ways AI is changing business in 2026!\n\n1. Voice agents\n2. Lead generation\n3. Content automation\n4. Customer support\n5. Analytics\n\nAre you ready? Drop a comment! 👇🔥💯"\n\nGOOD (human, natural):\n"The hidden cost in most businesses is response speed.\n\nEvery missed call leaks revenue. Every slow follow-up loses trust.\n\nWe built an AI system that answers in under 2 seconds, qualifies the lead, and books the call. All while the owner sleeps.\n\nWhat's the first thing you'd automate?"\n\nuseReel=${useReel ? 'true' : 'false'}`;
    }

    const { text } = await generateText({
        prompt,
        maxOutputTokens: 600,
        openaiModel: 'gpt-5.4-mini',
        geminiModel: process.env.GEMINI_MODEL || 'gemini-3-pro-preview',
    });

    const parsed = safeJsonParse(text || '');
    if (!parsed) return null;

    const caption = normalizeText(parsed.caption);
    const videoPrompt = normalizeText(parsed.videoPrompt);

    if (!caption) return null;

    if (useReel && !videoPrompt) {
        return {
            caption,
            videoPrompt: strategy.fallbackVideoPrompt,
            source: 'ai_partial',
        };
    }

    return {
        caption,
        videoPrompt,
        source: 'ai',
    };
}

function buildFallbackCreative(strategy, useReel) {
    return {
        caption: strategy.fallbackCaption,
        videoPrompt: useReel ? strategy.fallbackVideoPrompt : '',
        source: 'template',
    };
}

function saveAgenticVideo(videoPath) {
    const reelsDir = path.join(__dirname, '..', 'assets', 'facebook', 'reels');
    fs.mkdirSync(reelsDir, { recursive: true });
    const targetPath = path.join(reelsDir, `agentic-${Date.now()}.mp4`);
    fs.copyFileSync(videoPath, targetPath);
    return targetPath;
}

async function buildCreativePlan({ strategy, useAI, useReel }) {
    if (useAI) {
        try {
            const aiCreative = await generateAICreative(strategy, useReel);
            if (aiCreative?.caption) {
                return aiCreative;
            }
        } catch (error) {
            console.warn(`   AI generation fallback: ${error.message}`);
        }
    }

    return buildFallbackCreative(strategy, useReel);
}

async function runScheduledCycle(options = {}) {
    if (cycleInProgress) {
        console.warn('⚠️ Facebook agent cycle already in progress, skipping trigger.');
        return { skipped: true };
    }

    cycleInProgress = true;

    const config = getFacebookAgentConfig();
    const dryRun = options.dryRun ?? config.dryRun;
    const trigger = options.trigger || 'scheduled';

    try {
        const timestamp = new Date().toLocaleString('en-US', { timeZone: config.timezone });
        console.log(`\n${'='.repeat(58)}`);
        console.log(`FB Agent Triggered [${timestamp}] (${trigger})`);
        console.log('='.repeat(58));

        if (config.healthCheck) {
            console.log('Running Facebook health check...');
            const connection = await testFacebookConnection().catch(() => false);
            if (!connection || connection.type === 'user_no_pages') {
                throw new Error('Facebook page access unavailable for current token.');
            }
        }

        const useReel = shouldUse(config.reelRatio);
        const useAI = shouldUse(config.aiRatio) && hasLLMProvider();
        const strategy = pickStrategy(config.timezone);

        console.log(`Strategy: ${strategy.id} | ${useReel ? 'reel' : 'text'} | ${useAI ? 'ai' : 'template'}`);

        let creative = null;
        let attempts = 0;
        const maxAttempts = 4;

        do {
            creative = await buildCreativePlan({ strategy, useAI, useReel });
            attempts += 1;
            if (!isDuplicate(creative.caption)) break;
            console.warn(`   Duplicate content detected (attempt ${attempts}/${maxAttempts}). Regenerating...`);
        } while (attempts < maxAttempts);

        console.log('\nCaption Preview:');
        console.log('-'.repeat(58));
        console.log(creative.caption);
        console.log('-'.repeat(58));

        if (useReel) {
            console.log(`Video Prompt: ${creative.videoPrompt.substring(0, 140)}${creative.videoPrompt.length > 140 ? '...' : ''}`);
        }

        if (dryRun) {
            console.log('DRY RUN enabled: no content published.');
            return {
                dryRun: true,
                useReel,
                strategy: strategy.id,
                source: creative.source,
            };
        }

        let result;
        let savedVideoPath = null;

        if (useReel) {
            cleanupCache();
            const generatedVideoPath = await generateVideo(creative.videoPrompt, {
                aspectRatio: '9:16',
                duration: config.videoDuration,
            });
            savedVideoPath = saveAgenticVideo(generatedVideoPath);
            result = await postToFacebookWithVideo(injectCTA(creative.caption), savedVideoPath);
        } else {
            result = await postToFacebook(injectCTA(creative.caption));
        }

        record({
            text: creative.caption,
            pillar: `facebook_agent:${strategy.id}`,
            aiGenerated: creative.source.startsWith('ai'),
            hasVideo: useReel,
            results: {
                facebook: result?.id || result?.post_id || 'posted',
            },
        });

        console.log('\nFacebook agent cycle complete.');
        if (result?.id) {
            console.log(`Post ID: ${result.id}`);
        }
        if (savedVideoPath) {
            console.log(`Saved reel: ${savedVideoPath}`);
        }

        return {
            success: true,
            useReel,
            source: creative.source,
            strategy: strategy.id,
            postId: result?.id || result?.post_id || null,
            videoPath: savedVideoPath,
        };
    } finally {
        cycleInProgress = false;
    }
}

export function startFacebookAgent(options = {}) {
    const config = getFacebookAgentConfig();
    const dryRun = options.dryRun ?? config.dryRun;
    const runOnStart = options.runOnStart ?? config.runOnStart;

    if (!config.enabled) {
        console.log('Facebook agent is disabled (FACEBOOK_AGENT_ENABLED=false).');
        return [];
    }

    console.log('');
    console.log('Starting Facebook Agentic Automation');
    console.log('-'.repeat(58));
    console.log(`Timezone: ${config.timezone}`);
    console.log(`Times: ${config.times.join(', ')}`);
    console.log(`AI Ratio: ${config.aiRatio}%`);
    console.log(`Reel Ratio: ${config.reelRatio}%`);
    console.log(`Video Duration: ${config.videoDuration}s`);
    console.log(`Jitter: up to ${config.jitterMinutes}m`);
    console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log('-'.repeat(58));

    const jobs = [];

    for (const time of config.times) {
        const [hour, minute] = time.split(':');
        const expression = `${minute} ${hour} * * *`;

        const job = cron.schedule(expression, async () => {
            const jitterMs = config.jitterMinutes > 0
                ? Math.floor(Math.random() * (config.jitterMinutes * 60 * 1000))
                : 0;

            if (jitterMs > 0) {
                const jitterSec = Math.round(jitterMs / 1000);
                console.log(`Applying jitter: ${jitterSec}s before publishing.`);
            }

            setTimeout(() => {
                runScheduledCycle({ dryRun, trigger: `cron:${time}` }).catch((error) => {
                    console.error(`Facebook agent cycle failed: ${error.message}`);
                });
            }, jitterMs);
        }, { timezone: config.timezone });

        jobs.push(job);
        console.log(`Scheduled ${time} (${expression})`);
    }

    if (runOnStart) {
        runScheduledCycle({ dryRun, trigger: 'startup' }).catch((error) => {
            console.error(`Startup cycle failed: ${error.message}`);
        });
    }

    console.log('\nFacebook agent is running. Press Ctrl+C to stop.\n');
    return jobs;
}

export async function runFacebookAgentCycle(options = {}) {
    return runScheduledCycle({
        dryRun: options.dryRun,
        trigger: options.trigger || 'manual',
    });
}

export default { startFacebookAgent, runFacebookAgentCycle };

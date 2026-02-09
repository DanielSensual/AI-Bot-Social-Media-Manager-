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

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

const STRATEGIES = [
    {
        id: 'myth-breaker',
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
        id: 'pain-hook',
        angle: 'Call out missed revenue from slow lead response and position automation as the solution.',
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
        id: 'case-style',
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
        id: 'conversation-starter',
        angle: 'Post a high-engagement question that prompts replies from founders and operators.',
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
    {
        id: 'viral-ai-stat',
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
        id: 'website-showcase',
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
        id: 'ai-hot-take',
        angle: 'Drop a controversial opinion about AI that sparks debate. Be bold. Take a side. Make people feel something — then position Ghost AI as proof of the thesis.',
        cta: 'Engage commenters and mention the website naturally.',
        fallbackCaption: `Hot take: 90% of "AI companies" are just API wrappers.

Real AI integration means:
• Voice agents that book appointments
• Systems that learn from your data
• Automation that runs while you sleep

We ship real AI systems, not demos.

🔗 ${WEBSITE}`,
        fallbackVideoPrompt: 'Vertical 9:16 dramatic split-screen: left side shows a generic chatbot widget, right side shows a full AI operations center with voice agents, booking flows, and analytics — cinematic reveal.',
    },
    {
        id: 'free-audit-offer',
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

function pickStrategy() {
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
    return String(text || '')
        .replace(/\r\n/g, '\n')
        .trim();
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

    const prompt = `You create high-performing Facebook Page content for "Artificial Intelligence Knowledge".
This page is run by Ghost AI Systems (${WEBSITE}) — an AI agency that ships production-ready websites in 72 hours with AI voice agents, analytics, and automation.

OBJECTIVE:
${strategy.angle}

ENGAGEMENT CTA:
${strategy.cta}

OUTPUT FORMAT:
Return strict JSON only:
{
  "caption": "facebook caption text",
  "videoPrompt": "only if useReel=true, otherwise empty string"
}

RULES:
- Caption should be concise, scannable, and compelling.
- Use short paragraphs and line breaks.
- No hashtags unless absolutely necessary (max 3).
- No markdown.
- Make the first line a strong hook that stops scrollers.
- Keep caption between 200 and 600 characters.
- If the strategy CTA mentions a link, INCLUDE the exact URL in the caption.
- If useReel=true, videoPrompt must describe a cinematic 9:16 scroll-stopping scene.
- Write for a broad audience: business owners, marketers, tech enthusiasts — not just developers.

useReel=${useReel ? 'true' : 'false'}`;

    const { text } = await generateText({
        prompt,
        maxOutputTokens: 600,
        openaiModel: 'gpt-5.2',
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
        const strategy = pickStrategy();

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

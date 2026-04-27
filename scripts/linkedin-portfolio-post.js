#!/usr/bin/env node
/**
 * LinkedIn Portfolio Engine — Daily case study posts from Ghost AI's real portfolio
 * 
 * Posts 1x/day to Daniel's personal LinkedIn with AI-generated content
 * based on REAL projects, REAL results, and REAL infrastructure.
 * 
 * Usage:
 *   node scripts/linkedin-portfolio-post.js              # Generate + post
 *   node scripts/linkedin-portfolio-post.js --dry-run    # Preview only
 *   node scripts/linkedin-portfolio-post.js --topic prime # Force a specific topic
 *   node scripts/linkedin-portfolio-post.js --list       # List all topics
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { postToLinkedIn } from '../src/linkedin-client.js';
import { generateText } from '../src/llm-client.js';
import { record, getRecent, isDuplicate } from '../src/post-history.js';
import { log } from '../src/logger.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAX_LENGTH = 3000; // LinkedIn allows ~3000 chars
const MAX_RETRIES = 3;
const PROFILE = process.env.LINKEDIN_PORTFOLIO_PROFILE || 'default'; // Daniel's personal

// ═══════════════════════════════════════════════════════════════════════════
// PORTFOLIO TOPICS — Every real product/demo Ghost AI has shipped
// ═══════════════════════════════════════════════════════════════════════════
const TOPICS = {
    prime_steakhouse: {
        weight: 15,
        title: 'PRIME Steakhouse AI Demo',
        facts: `
- Built a fully operational AI restaurant ordering system in 20 minutes
- Bilingual AI maître d' (English + Spanish) using xAI Grok Realtime voice
- Takes phone orders, manages cart with running totals, books reservations
- 3-minute call guillotine for cost protection (~$0.30/call max)
- Multi-tenant: this is tenant #5 on the same relay server
- Orlando area code (321) — local presence for restaurant owners
- $77/mo operating cost vs $40-80K traditional dev quote
- Sends real-time order confirmations to owner's inbox
- Zero new infrastructure — plugged into existing relay
        `,
        angles: ['speed of deployment', 'cost comparison vs traditional', 'bilingual capability', 'infrastructure compounding'],
    },
    orderhub: {
        weight: 15,
        title: 'Ghost OrderHub — AI Restaurant Ordering Platform',
        facts: `
- Direct ordering platform that eliminates 30% DoorDash/UberEats commissions
- Three tiers: Lite ($199/mo), Pro ($9,500 one-time), Elite ($15,000 one-time)
- AI voice agent answers calls, takes orders, books reservations
- Built-in cost protection with per-call budgets
- Restaurant keeps 100% of revenue — no commission model
- Bilingual out of the box (English + Spanish)
- Each restaurant is just a tenant config — onboarding takes minutes not months
- SMS ordering bot for text-based orders
- Real-time email notifications with branded templates
        `,
        angles: ['disrupting food delivery', 'commission-free model', 'speed of onboarding', 'restaurant owner ROI'],
    },
    voice_agents: {
        weight: 12,
        title: 'Multi-Tenant AI Voice Agent Infrastructure',
        facts: `
- Single Fastify relay server on Railway handles 5+ businesses simultaneously
- xAI Grok Realtime API for sub-800ms voice response latency
- Tenants: HVAC company, real estate agency, video production, restaurant, agency
- Each new tenant = 1 config file + 1 phone number ($1.15/mo)
- Twilio Media Streams → WebSocket bridge → xAI Realtime
- Function calling: book appointments, capture leads, process orders
- 24/7 uptime on Railway Docker infrastructure
- Cost: ~$0.15/min per call including AI + telephony
        `,
        angles: ['multi-tenant efficiency', 'infrastructure compounding', 'cost per tenant', 'universal voice agent'],
    },
    reelestate: {
        weight: 10,
        title: 'ReelEstate Orlando — AI-Powered Real Estate Platform',
        facts: `
- Luxury real estate lead generation platform for Orlando realtors
- AI voice agent (Anna) answers calls, qualifies leads, books showings
- Obsidian & Gold design system — premium dark luxury aesthetic
- Meta CAPI integration for conversion tracking
- Cinematic video hero sections with Cloudflare R2 hosting
- Custom proposal pages for individual realtors (e.g., /marye)
- Lead scoring and automated nurturing sequences
- Built with Next.js 14 App Router + Prisma + Supabase
        `,
        angles: ['luxury tech', 'AI replacing traditional lead gen', 'design as conversion tool', 'vertical SaaS'],
    },
    mediageekz: {
        weight: 10,
        title: 'MediaGeekz — AI-Enhanced Video Production',
        facts: `
- Premium video production company in Orlando
- AI-powered quote builder that generates instant estimates
- E-commerce store with LUTs, courses, and merch (Square payments)
- Ghost Captions Engine for automated viral subtitles
- AI product image generation via OpenAI gpt-image-2
- Glassmorphism design system with dark navy + vibrant orange
- Google Ads campaign running at $200/mo targeting convention videography
- Services: commercials, music videos, podcasts, Reels content
        `,
        angles: ['AI augmenting creative work', 'automated quoting', 'production company meets tech', 'vertical integration'],
    },
    social_automation: {
        weight: 10,
        title: 'Autonomous Social Media Engine',
        facts: `
- AI bot posts to X, LinkedIn, and Facebook simultaneously
- Weighted content pillar system (Value 30%, Hot Takes 20%, Portfolio 20%, BTS 15%, CTA 15%)
- LinkedIn OAuth API for programmatic posting with images and video
- Multi-provider LLM fallback: Grok → Claude → OpenAI → Gemini
- SQLite-backed post history with deduplication
- PM2 scheduled jobs: 9am/1pm/5pm EST posting windows
- LinkedIn engagement responder for automated comment replies
- Analytics reporting with cross-platform metrics
- Runs on Railway 24/7 — zero manual intervention
        `,
        angles: ['AI posting about AI', 'zero-touch social presence', 'multi-platform automation', 'content at scale'],
    },
    conductor: {
        weight: 8,
        title: 'Conductor — Visual Multi-Agent IDE',
        facts: `
- Visual IDE for building multi-agent AI workflows
- React Flow canvas with custom nodes (Agent, Tool, Router)
- Compiles visual workflows into LangGraph state machines
- FastAPI backend for execution
- Real-time visualization: MiniTerminals, animated edges, active-node glows
- Deployed as Vercel + Railway monorepo
- Drag-and-drop agent orchestration — no code required
- Open source on GitHub
        `,
        angles: ['no-code AI orchestration', 'visual programming for agents', 'democratizing AI workflows', 'builder tools'],
    },
    antigravity: {
        weight: 8,
        title: 'Anti-Gravity — On-Device Agentic Video AI',
        facts: `
- AI-powered video editing engine that runs on-device
- Agentic decision matrix with 0.3 threshold for edit suggestions
- Frame striding logic for thermal management ("The Caveman Bottleneck")
- Premium dark-mode UI with glassmorphism and interactive preview
- FFmpeg-based processing pipeline
- Cross-platform: web + iOS native
- AI analyzes footage and suggests cuts, transitions, color grades
- Local-first architecture — no cloud dependency
        `,
        angles: ['AI editing video autonomously', 'on-device AI performance', 'thermal management innovation', 'local-first'],
    },
    hydra: {
        weight: 7,
        title: 'HYDRA — Adaptive Marketing Automation',
        facts: `
- Multi-channel marketing automation with AI-driven lead scoring (0-100)
- Persona classification: identifies prospect type automatically
- Personalized content generation for Email, SMS, DM, Reels
- Engagement-based sequence runners — adapts based on response
- Webhook intake from any lead source
- Premium dark-mode dashboard UI
- Built on Supabase + Next.js
- Nurturing sequences that learn and adapt
        `,
        angles: ['adaptive marketing', 'AI lead scoring', 'personalized at scale', 'marketing that learns'],
    },
    infrastructure: {
        weight: 5,
        title: 'Ghost AI Infrastructure — The Compound Effect',
        facts: `
- Every new client costs less to onboard than the last
- Same Railway server runs voice agents for 5+ industries
- Same email templates, same cost protection, same analytics
- Vercel for static sites, Railway for persistent services, Supabase for data
- Multi-provider AI fallback (Grok, Claude, OpenAI, Gemini)
- Total infrastructure cost: ~$200/mo for everything
- Revenue potential: $50k+/mo across all products
- One developer (with AI assistance) ships faster than 10-person agencies
        `,
        angles: ['infrastructure compounding', 'solo founder efficiency', 'AI as force multiplier', 'cost efficiency'],
    },
};

// ── Parse CLI args ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIST_MODE = args.includes('--list');

const forcedTopic = (() => {
    const idx = args.indexOf('--topic');
    if (idx >= 0 && args[idx + 1]) return args[idx + 1];
    return null;
})();

// ── List mode ───────────────────────────────────────────────────────────
if (LIST_MODE) {
    console.log('\n📋 Available LinkedIn Portfolio Topics:\n');
    for (const [key, topic] of Object.entries(TOPICS)) {
        console.log(`  ${key.padEnd(25)} (weight: ${topic.weight}) — ${topic.title}`);
    }
    console.log(`\nUsage: node scripts/linkedin-portfolio-post.js --topic prime_steakhouse\n`);
    process.exit(0);
}

// ── Pick a weighted random topic ────────────────────────────────────────
function pickTopic() {
    if (forcedTopic) {
        if (!TOPICS[forcedTopic]) {
            console.error(`❌ Unknown topic: ${forcedTopic}`);
            console.error(`   Valid: ${Object.keys(TOPICS).join(', ')}`);
            process.exit(1);
        }
        return forcedTopic;
    }

    // Avoid recently posted topics
    const recent = getRecent(10);
    const recentTopics = recent
        .filter(p => p.pillar?.startsWith('linkedin:'))
        .map(p => p.pillar.replace('linkedin:', ''));

    const totalWeight = Object.entries(TOPICS)
        .filter(([key]) => !recentTopics.includes(key))
        .reduce((s, [, t]) => s + t.weight, 0);

    let roll = Math.random() * totalWeight;
    for (const [name, topic] of Object.entries(TOPICS)) {
        if (recentTopics.includes(name)) continue;
        roll -= topic.weight;
        if (roll <= 0) return name;
    }

    return Object.keys(TOPICS)[0]; // fallback
}

// ── Get recent posts for dedup ──────────────────────────────────────────
function getRecentContext() {
    const recent = getRecent(5)
        .filter(p => p.pillar?.startsWith('linkedin:'));
    if (recent.length === 0) return '';
    return `\n\nRecent LinkedIn posts (DO NOT repeat these angles):\n${recent.map(p => `- ${p.text?.substring(0, 100)}...`).join('\n')}`;
}

// ── Generate the LinkedIn post ──────────────────────────────────────────
async function generateLinkedInPost(topicKey) {
    const topic = TOPICS[topicKey];
    const recentContext = getRecentContext();

    const prompt = `You are Daniel Castillo — founder of Ghost AI Systems, a one-person AI agency in Orlando, FL. You're a U.S. Military Veteran who builds production-ready AI systems that would take traditional dev shops months and tens of thousands of dollars.

Your voice: Direct, confident, results-oriented. You don't hype — you show receipts. You speak from experience, not theory. You're building in public and every post proves what one person with the right infrastructure can do.

═══ TODAY'S TOPIC ═══
${topic.title}

═══ REAL FACTS (use these — they are 100% true) ═══
${topic.facts}

═══ SUGGESTED ANGLES (pick ONE, go deep) ═══
${topic.angles.map(a => `- ${a}`).join('\n')}

═══ LINKEDIN POST RULES ═══
1. First line = pattern interrupt / scroll stopper. Short. Punchy. Makes them stop scrolling.
2. Use single-line paragraphs separated by blank lines (LinkedIn formatting)
3. Use → bullets for lists, not - or •
4. Include specific numbers and real data — NO vague claims
5. Maximum 2000 characters (LinkedIn sweet spot)
6. End with a question OR a CTA — NOT both
7. 3-5 hashtags at the very end, on their own line
8. NO emojis in the first line
9. Write like a builder showing receipts, not a guru giving advice
10. DO NOT use "game-changer", "revolutionize", "synergy", "leverage" or any corporate buzzwords
11. Mention Ghost AI Systems or OrderHub naturally — not forced
12. Make it REAL and SPECIFIC — this actually happened, these are real products

═══ FORMATTING ═══
Output ONLY the LinkedIn post text. No quotes, no labels, no metadata.
${recentContext}`;

    console.log(`🧠 Generating LinkedIn post about "${topic.title}"...`);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const { text, provider } = await generateText({
            prompt,
            maxOutputTokens: 1500,
        });

        let post = text.trim().replace(/^["']|["']$/g, '');

        if (post.length > MAX_LENGTH) {
            if (attempt < MAX_RETRIES) {
                console.warn(`   ⚠️ Attempt ${attempt}: ${post.length} chars (too long), retrying...`);
                continue;
            }
            post = post.substring(0, MAX_LENGTH - 3) + '...';
        }

        if (isDuplicate(post)) {
            console.warn(`   ⚠️ Attempt ${attempt}: Duplicate detected, retrying...`);
            continue;
        }

        return { text: post, topic: topicKey, title: topic.title, provider };
    }

    throw new Error('Failed to generate valid LinkedIn post after max retries');
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
    console.log('');
    console.log('🔥 ═══════════════════════════════════════════');
    console.log('   G H O S T   L I N K E D I N   E N G I N E');
    console.log('   "showing receipts, not giving advice"');
    console.log('═══════════════════════════════════════════════');
    console.log('');

    const topicKey = pickTopic();
    const topic = TOPICS[topicKey];
    console.log(`📋 Topic: ${topic.title} (${topicKey})`);

    if (DRY_RUN) {
        console.log('👁️  DRY RUN — no actual post will be made\n');
    }

    const post = await generateLinkedInPost(topicKey);

    console.log('');
    console.log('─'.repeat(60));
    console.log(post.text);
    console.log('─'.repeat(60));
    console.log(`📊 Length: ${post.text.length}/${MAX_LENGTH} | Topic: ${post.topic} | Provider: ${post.provider}`);
    console.log('');

    if (DRY_RUN) {
        console.log('👁️  DRY RUN complete — post NOT published');
        return;
    }

    try {
        console.log(`📤 Posting to LinkedIn [${PROFILE}]...`);
        const result = await postToLinkedIn(post.text, PROFILE);
        console.log(`✅ Published! Post ID: ${result.id}`);

        // Record in history
        record({
            text: post.text,
            pillar: `linkedin:${post.topic}`,
            aiGenerated: true,
            hasImage: false,
            results: {
                linkedin: result.id,
            },
        });

        log.info('LinkedIn Portfolio post published', {
            postId: result.id,
            topic: post.topic,
            title: post.title,
            length: post.text.length,
            provider: post.provider,
        });

        console.log('\n🔥 receipts posted. infrastructure compounds.');
    } catch (error) {
        console.error(`❌ Post failed: ${error.message}`);
        log.error('LinkedIn Portfolio post failed', { error: error.message, topic: post.topic });
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('💀 Fatal error:', err.message);
    process.exit(1);
});

#!/usr/bin/env node
/**
 * Bent Danholm — LinkedIn Content Scheduler (Railway)
 *
 * Persistent scheduler that posts LinkedIn content for Bent Danholm.
 * Runs as a long-lived process — designed for Railway/Docker deployment.
 *
 * Schedule: 3 posts per week (Mon/Wed/Fri at 8:30 AM ET)
 *   Monday    — Windermere lifestyle, market insights, or buyer education
 *   Wednesday — Neighborhood comparisons, executive relocation, or community insider
 *   Friday    — Video/content strategy, market insights, or lifestyle
 *
 * Usage:
 *   node scripts/bent-linkedin-scheduler.js              # Run as daemon
 *   node scripts/bent-linkedin-scheduler.js --fire-now   # Post immediately + schedule
 *   node scripts/bent-linkedin-scheduler.js --dry-run    # Preview mode (no actual posts)
 */

import dotenv from 'dotenv';
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { postToLinkedIn } from '../src/linkedin-client.js';
import { generateText } from '../src/llm-client.js';
import { record, getRecent, isDuplicate } from '../src/post-history.js';
import { log } from '../src/logger.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TZ = 'America/New_York';
const MAX_LENGTH = 3000;
const MAX_RETRIES = 3;
const PROFILE = process.env.BENT_LINKEDIN_PROFILE || 'bent';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FIRE_NOW = args.includes('--fire-now');

// Load Bent's brain
const BRAIN = (() => {
    try {
        return fs.readFileSync(path.resolve(__dirname, '..', 'bent-brain.md'), 'utf-8');
    } catch {
        console.warn('⚠️ bent-brain.md not found, using fallback persona');
        return 'You are Bent Danholm, a luxury real estate agent in Windermere, Florida.';
    }
})();

// Log directory
const LOG_DIR = path.resolve(__dirname, '..', 'logs', 'bent-linkedin');

function logPost(data) {
    const date = new Date().toLocaleString('en-CA', { timeZone: TZ }).split(',')[0];
    const logFile = path.join(LOG_DIR, `${date}.json`);
    let entries = [];
    try { entries = JSON.parse(fs.readFileSync(logFile, 'utf-8')); } catch { /* first entry */ }
    entries.push({ ...data, timestamp: new Date().toISOString() });
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(logFile, JSON.stringify(entries, null, 2));
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT TOPICS — Bent's real expertise areas
// ═══════════════════════════════════════════════════════════════════════════
const TOPICS = {
    windermere_lifestyle: {
        weight: 20,
        title: 'Windermere — Community & Lifestyle',
        facts: `
- Windermere is a town of ~3,500 people tucked between Disney and downtown Orlando
- Known as "The Mayberry of Orlando" — small-town charm, dirt roads, cops who knock on doors to check on you
- The town turned down a million-dollar development deal to preserve its character
- Butler Chain of Lakes — 11 interconnected lakes, some of the most pristine in Florida
- Home to professional athletes, executives, and families who want privacy + proximity
- Windermere walkway along Lake Down — free, beautiful, locals-only-feel
- Local coffee shop, elementary school where everyone knows each other
- 15 minutes to Disney, 25 minutes to downtown Orlando, 45 minutes to the coast
        `,
        angles: ['small-town charm in a big city', 'why people choose Windermere over other luxury areas', 'the community feel that money can\'t buy', 'what makes Windermere different from every other Orlando suburb'],
    },
    luxury_market_insights: {
        weight: 18,
        title: 'Central Florida Luxury Market Insights',
        facts: `
- Central Florida luxury price ladder: $2M (entry luxury) → $4M (established) → $7M+ (ultra)
- Windermere median home price is significantly above Orlando metro average
- Remote work migration accelerated luxury buying — NY/NJ/CA executives relocating
- No state income tax in Florida — major draw for high-income buyers
- Luxury inventory cycles differently — spring preview, summer decision, fall close
- New construction in Windermere is limited — town restricts aggressive development
- Waterfront on Butler Chain commands premium — $1M+ for lot alone
- Golden Oak (Disney's luxury community) starts at $2M+ for the Disney lifestyle premium
        `,
        angles: ['price ladders buyers don\'t understand', 'what the market is actually doing vs headlines', 'why luxury inventory moves differently', 'the Florida tax advantage for executives'],
    },
    neighborhood_comparisons: {
        weight: 15,
        title: 'Neighborhood Deep-Dives & Comparisons',
        facts: `
- Windermere vs Winter Park: Windermere = lakefront privacy, Winter Park = walkable urban luxury
- Isleworth: gated, 600-acre, golf community on Butler Chain. Tiger Woods lived here. $3M-$20M+
- Keene's Pointe: gated on Lake Tibet, more family-oriented luxury, $1.5M-$5M
- Golden Oak: inside Walt Disney World property, unique HOA includes Disney perks, $2M-$12M+
- Lake Nona: newer, tech-forward, medical city anchor. Different buyer profile — younger, corporate
- Butler Chain communities: Lake Down, Pocket Lake, Lake Butler, Tibet — each has its own personality
- Dr. Phillips: more suburban luxury, restaurant row, close to Universal, $800K-$3M
        `,
        angles: ['neighborhood personality tests for buyers', 'where your money goes furthest', 'the gated community decision tree', 'why location within Windermere matters'],
    },
    executive_relocation: {
        weight: 15,
        title: 'Executive Relocation to Central Florida',
        facts: `
- Top feeder states: New York, New Jersey, California, Connecticut, Illinois
- No state income tax saves a $500K earner approximately $50K/year
- Remote work made location-flexible executives the #1 luxury buyer segment
- School quality is a top-3 concern — Windermere has strong public + private options
- Country club memberships are part of the social infrastructure — Isleworth, Bay Hill, Orange County National
- The Orlando executive airport (ORL) is 20 minutes from Windermere — easy for business travel
- Private schools: Windermere Prep, The First Academy, Foundation Academy
- Medical: AdventHealth, Orlando Health — both expanding in the Windermere corridor
        `,
        angles: ['the executive relocation checklist nobody talks about', 'what NY/NJ buyers are surprised by', 'the real cost of living comparison', 'how to evaluate a community before you visit'],
    },
    community_insider: {
        weight: 12,
        title: 'Community Insider Access',
        facts: `
- Bent has personal relationships with town leadership — mayor, council members
- Currently producing a podcast-style interview with Windermere's mayor/council member
- Active in community events, local businesses, school functions
- American Dream TV appearance — legitimate media credibility
- YouTube channel with 301 videos documenting Central Florida luxury communities
- 5,740 YouTube subscribers — organic growth from genuine community content
- Windermere Farmers Market, town parades, holiday events — insider knowledge
        `,
        angles: ['behind the scenes of a small Florida town', 'why knowing the mayor matters in real estate', 'community involvement as a competitive advantage', 'the stories that don\'t make the listing'],
    },
    video_and_content: {
        weight: 10,
        title: 'Real Estate Video & Content Strategy',
        facts: `
- 301 YouTube videos — more content than 95% of realtors in the market
- Best organic video: 4,327 views, 331.6 watch hours, +37 subscribers
- Current production: 4K dual-camera interview with town leadership
- Professional-grade: drone, gimbal, pro audio — not iPhone vlogs
- YouTube is the #2 search engine — 68% of homebuyers use video in their search
- Cinematic community storytelling outperforms property listing videos 3:1 for engagement
- Keyword-first titles (SEO) > hook-first titles for real estate YouTube discovery
        `,
        angles: ['why video is the moat in real estate', 'cinematic vs listing videos', 'the YouTube SEO game for realtors', 'building authority through consistent content'],
    },
    buyer_education: {
        weight: 10,
        title: 'Buyer Education & Decision-Making',
        facts: `
- Most luxury buyers tour 6-12 homes before deciding
- The #1 mistake: falling in love with a home before understanding the community
- HOA governance varies wildly — some communities vote on your landscaping, others don't care
- Insurance in Florida: flood zones, hurricane deductibles, Citizens vs private — know before you buy
- Closing costs in Florida: ~2-3% for buyers, plus title insurance (higher than most states)
- Property tax homestead exemption saves $thousands — must apply within 12 months of purchase
- Lake access vs lakefront vs lake view — three very different price tiers and lifestyles
        `,
        angles: ['mistakes luxury buyers make', 'what your agent should tell you before showing homes', 'the hidden costs nobody mentions', 'community vs house — which matters more'],
    },
};

// ── Post Schedule (Mon/Wed/Fri 8:30 AM ET) ──────────────────────────────
const SCHEDULE = [
    { cron: '30 8 * * 1', label: 'Monday 8:30 AM' },
    { cron: '30 8 * * 3', label: 'Wednesday 8:30 AM' },
    { cron: '30 8 * * 5', label: 'Friday 8:30 AM' },
];

// ── Pick a weighted random topic (avoids recent repeats) ────────────────
function pickTopic() {
    const recent = getRecent(10);
    const recentTopics = recent
        .filter(p => p.pillar?.startsWith('bent-linkedin:'))
        .map(p => p.pillar.replace('bent-linkedin:', ''));

    const available = Object.entries(TOPICS).filter(([key]) => !recentTopics.includes(key));
    const totalWeight = available.reduce((s, [, t]) => s + t.weight, 0);

    let roll = Math.random() * totalWeight;
    for (const [name, topic] of available) {
        roll -= topic.weight;
        if (roll <= 0) return name;
    }

    return Object.keys(TOPICS)[0];
}

// ── Get recent posts for dedup context ──────────────────────────────────
function getRecentContext() {
    const recent = getRecent(5)
        .filter(p => p.pillar?.startsWith('bent-linkedin:'));
    if (recent.length === 0) return '';
    return `\n\nRecent LinkedIn posts (DO NOT repeat these angles):\n${recent.map(p => `- ${p.text?.substring(0, 100)}...`).join('\n')}`;
}

// ── Generate + Post ─────────────────────────────────────────────────────
async function generateAndPost() {
    const topicKey = pickTopic();
    const topic = TOPICS[topicKey];
    const recentContext = getRecentContext();

    // Add random 0-5 min jitter for human feel
    const jitter = Math.floor(Math.random() * 5 * 60 * 1000);
    if (jitter > 0) {
        console.log(`   ⏳ Jitter: waiting ${Math.round(jitter / 1000)}s for human feel...`);
        await new Promise(r => setTimeout(r, jitter));
    }

    console.log(`\n🏡 ─── Bent LinkedIn Engine ──────────────────────`);
    console.log(`   Topic: ${topic.title} (${topicKey})`);
    if (DRY_RUN) console.log('   👁️  DRY RUN — no actual post');

    const prompt = `${BRAIN}

═══ TODAY'S TOPIC ═══
${topic.title}

═══ REAL FACTS (use these — they are 100% true) ═══
${topic.facts}

═══ SUGGESTED ANGLES (pick ONE, go deep) ═══
${topic.angles.map(a => `- ${a}`).join('\n')}

═══ FORMATTING ═══
Output ONLY the LinkedIn post text. No quotes, no labels, no metadata.
${recentContext}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const { text, provider } = await generateText({ prompt, maxOutputTokens: 1500 });
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

            console.log(`   📊 ${post.length} chars | Provider: ${provider}`);
            console.log('   ─'.repeat(30));
            console.log(`   ${post.substring(0, 150)}...`);
            console.log('   ─'.repeat(30));

            if (DRY_RUN) {
                console.log('   👁️  DRY RUN complete — post NOT published');
                logPost({ topic: topicKey, title: topic.title, length: post.length, provider, dryRun: true });
                return;
            }

            console.log(`   📤 Posting to LinkedIn [${PROFILE}]...`);
            const result = await postToLinkedIn(post, PROFILE);
            console.log(`   ✅ Published! Post ID: ${result.id}`);

            record({
                text: post,
                pillar: `bent-linkedin:${topicKey}`,
                aiGenerated: true,
                hasImage: false,
                results: { linkedin: result.id },
            });

            logPost({
                topic: topicKey,
                title: topic.title,
                length: post.length,
                provider,
                postId: result.id,
                dryRun: false,
            });

            log.info('Bent LinkedIn post published', {
                postId: result.id,
                topic: topicKey,
                title: topic.title,
                length: post.length,
                provider,
            });

            console.log('   🏡 local knowledge deployed.\n');
            return;

        } catch (err) {
            console.error(`   ❌ Attempt ${attempt} failed: ${err.message}`);
            if (attempt === MAX_RETRIES) {
                log.error('Bent LinkedIn post failed after all retries', { error: err.message, topic: topicKey });
            }
        }
    }
}

// ── Main: Start Scheduler ───────────────────────────────────────────────
function main() {
    console.log('');
    console.log('🏡 ═══════════════════════════════════════════');
    console.log('   B E N T   L I N K E D I N   S C H E D U L E R');
    console.log('   "local knowledge. luxury service."');
    console.log('═══════════════════════════════════════════════');
    console.log(`   Time: ${new Date().toLocaleString('en-US', { timeZone: TZ })}`);
    console.log(`   Profile: ${PROFILE}`);
    console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
    console.log('');

    // Register cron jobs
    for (const slot of SCHEDULE) {
        cron.schedule(slot.cron, () => {
            console.log(`\n⏰ Cron trigger: ${slot.label}`);
            generateAndPost().catch(err => {
                console.error(`💀 Scheduled post failed: ${err.message}`);
            });
        }, { timezone: TZ });
        console.log(`   📅 Scheduled: ${slot.label} (${slot.cron})`);
    }

    console.log('');
    console.log('   ✅ Scheduler is running. Waiting for next cron trigger...');

    // Fire immediately if --fire-now flag is set
    if (FIRE_NOW) {
        console.log('\n🔥 --fire-now flag detected, posting immediately...');
        generateAndPost().catch(err => {
            console.error(`💀 Immediate post failed: ${err.message}`);
        });
    }

    // Fire immediately if within a posting window and just started (Railway restart)
    const now = new Date();
    const etNow = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
    const hour = etNow.getHours();
    const minute = etNow.getMinutes();
    const day = etNow.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri

    if (!FIRE_NOW && [1, 3, 5].includes(day) && hour === 8 && minute >= 25 && minute <= 45) {
        console.log(`\n🔄 Started during posting window (${hour}:${minute} on day ${day}), firing catch-up post...`);
        generateAndPost().catch(err => {
            console.error(`💀 Catch-up post failed: ${err.message}`);
        });
    }

    console.log('');
}

main();

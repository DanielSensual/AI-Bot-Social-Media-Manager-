#!/usr/bin/env node
/**
 * Bent Danholm — LinkedIn Content Engine
 * 
 * Posts 3-4x/week to Bent's LinkedIn with AI-generated content
 * based on his REAL neighborhoods, REAL expertise, and REAL market data.
 * 
 * Adapted from linkedin-portfolio-post.js (Ghost AI's proven pattern).
 * 
 * Usage:
 *   node scripts/bent-linkedin-daily.js              # Generate + post
 *   node scripts/bent-linkedin-daily.js --dry-run    # Preview only
 *   node scripts/bent-linkedin-daily.js --topic windermere  # Force topic
 *   node scripts/bent-linkedin-daily.js --list       # List all topics
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { postToLinkedIn } from '../src/linkedin-client.js';
import { generateText } from '../src/llm-client.js';
import { record, getRecent, isDuplicate } from '../src/post-history.js';
import { log } from '../src/logger.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAX_LENGTH = 3000;
const MAX_RETRIES = 3;
const PROFILE = process.env.BENT_LINKEDIN_PROFILE || 'bent';

// Load Bent's brain for the system prompt
const BRAIN = (() => {
    try {
        return fs.readFileSync(path.resolve(__dirname, '..', 'bent-brain.md'), 'utf-8');
    } catch {
        console.warn('⚠️ bent-brain.md not found, using fallback persona');
        return 'You are Bent Danholm, a luxury real estate agent in Windermere, Florida.';
    }
})();

// Log file for daily tracking
const LOG_DIR = path.resolve(__dirname, '..', 'logs', 'bent-linkedin');
function logPost(data) {
    const date = new Date().toISOString().split('T')[0];
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
    console.log('\n📋 Bent Danholm — LinkedIn Content Topics:\n');
    for (const [key, topic] of Object.entries(TOPICS)) {
        console.log(`  ${key.padEnd(30)} (weight: ${topic.weight}) — ${topic.title}`);
    }
    console.log(`\nUsage: node scripts/bent-linkedin-daily.js --topic windermere_lifestyle\n`);
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
        .filter(p => p.pillar?.startsWith('bent-linkedin:'))
        .map(p => p.pillar.replace('bent-linkedin:', ''));

    const available = Object.entries(TOPICS).filter(([key]) => !recentTopics.includes(key));
    const totalWeight = available.reduce((s, [, t]) => s + t.weight, 0);

    let roll = Math.random() * totalWeight;
    for (const [name, topic] of available) {
        roll -= topic.weight;
        if (roll <= 0) return name;
    }

    return Object.keys(TOPICS)[0]; // fallback
}

// ── Get recent posts for dedup ──────────────────────────────────────────
function getRecentContext() {
    const recent = getRecent(5)
        .filter(p => p.pillar?.startsWith('bent-linkedin:'));
    if (recent.length === 0) return '';
    return `\n\nRecent LinkedIn posts (DO NOT repeat these angles):\n${recent.map(p => `- ${p.text?.substring(0, 100)}...`).join('\n')}`;
}

// ── Generate the LinkedIn post ──────────────────────────────────────────
async function generateLinkedInPost(topicKey) {
    const topic = TOPICS[topicKey];
    const recentContext = getRecentContext();

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

    console.log(`🧠 Generating LinkedIn post about "${topic.title}"...`);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const { text, provider } = await generateText({
            prompt,
            maxOutputTokens: 1500,
            provider: 'openai',
            openaiModel: 'gpt-5.5',
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
    console.log('🏡 ═══════════════════════════════════════════');
    console.log('   B E N T   L I N K E D I N   E N G I N E');
    console.log('   "local knowledge. luxury service."');
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
        logPost({ topic: post.topic, title: post.title, length: post.text.length, provider: post.provider, dryRun: true });
        return;
    }

    try {
        console.log(`📤 Posting to LinkedIn [${PROFILE}]...`);
        const result = await postToLinkedIn(post.text, PROFILE);
        console.log(`✅ Published! Post ID: ${result.id}`);

        // Record in shared post history (with bent-linkedin prefix)
        record({
            text: post.text,
            pillar: `bent-linkedin:${post.topic}`,
            aiGenerated: true,
            hasImage: false,
            results: {
                linkedin: result.id,
            },
        });

        // Log to Bent-specific log file
        logPost({
            topic: post.topic,
            title: post.title,
            length: post.text.length,
            provider: post.provider,
            postId: result.id,
            dryRun: false,
        });

        log.info('Bent LinkedIn post published', {
            postId: result.id,
            topic: post.topic,
            title: post.title,
            length: post.text.length,
            provider: post.provider,
        });

        console.log('\n🏡 local knowledge deployed. windermere represented.');
    } catch (error) {
        console.error(`❌ Post failed: ${error.message}`);
        log.error('Bent LinkedIn post failed', { error: error.message, topic: post.topic });
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('💀 Fatal error:', err.message);
    process.exit(1);
});

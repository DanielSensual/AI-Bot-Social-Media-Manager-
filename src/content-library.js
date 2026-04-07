/**
 * Content Library — Ghost AI Systems (X/Twitter)
 * Template-based + AI-powered tweet generation.
 * Powered by Brand Intelligence System with x-brain.md fallback.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import dotenv from 'dotenv';
import { generateText } from './llm-client.js';
import { loadBrand, getBrandPrompt, getNeverSayList } from './brand-loader.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const X_BRAIN_PATH = path.join(__dirname, '..', 'x-brain.md');

/**
 * Load the x-brain.md memory file for AI prompt context
 */
function loadXBrain() {
    try {
        return fs.readFileSync(X_BRAIN_PATH, 'utf-8');
    } catch {
        console.warn('⚠️ x-brain.md not found — using fallback prompts');
        return null;
    }
}

// Helper to get random item from array
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Helper to get random hashtags
const getHashtags = (count = 2) => {
    const all = [...config.hashtags.primary, ...config.hashtags.secondary];
    const shuffled = all.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count).join(' ');
};

/**
 * VALUE BOMBS - Educational content
 */
export const valueTemplates = [
    () => `🚫 Stop building websites that just "look good"

Your site should:
→ Convert visitors into leads
→ Track every meaningful click
→ Load in under 2 seconds
→ Have an AI that never sleeps

That's what we ship in 72 hours.

${config.brand.website}`,

    () => `Most landing pages fail because they:

❌ Load too slow (3+ seconds)
❌ Have no clear CTA above fold
❌ Don't track user behavior
❌ Can't answer questions at 2am

Fix all 4 = 3x more conversions.

${getHashtags(2)}`,

    () => `The 72-hour website formula:

Day 1: Strategy + Copy + Architecture
Day 2: Full build + Analytics + Security
Day 3: QA + Performance + Launch

No meetings. No scope creep. Just ship.

${config.brand.website}`,

    () => `Your website should work while you sleep.

→ AI answering calls at 3am ✓
→ Leads booking themselves ✓
→ Analytics tracking everything ✓
→ You waking up to new customers ✓

That's the difference between a site and a system.`,

    () => `3 things killing your landing page:

1. Generic stock photos (use real work)
2. "Contact Us" instead of specific CTAs
3. No social proof above the fold

Fix these today. Thank me tomorrow.

${getHashtags(2)}`,

    () => `Hot take: Most "AI websites" are just chatbots.

Real AI integration means:
• Voice agents that book appointments
• Predictive analytics on user behavior
• Personalized CTAs based on source
• Automated follow-up sequences

We build the latter. 👻`,

    () => `Your competitor's website loads in 1.2 seconds.

Yours loads in 4.

That's not a "nice to have" problem.
That's a "losing customers daily" problem.

Speed = Trust = Conversions`,

    () => `The best websites don't need:
- Sliders (nobody uses them)
- Hamburger menus on desktop
- "Welcome to our website" copy
- Stock photos of handshakes

They need:
+ Clear value prop in 3 seconds
+ One obvious next step
+ Proof that works`,
];

/**
 * HOT TAKES - Controversial/Provocative opinions that drive engagement
 */
export const hotTakeTemplates = [
    () => `Unpopular opinion: 90% of web agencies are scamming you.

They charge $15k for a WordPress template.
Take 6 weeks to deliver.
Then hit you with "maintenance fees."

We ship custom sites in 72 hours.
No templates. No BS.

The industry hates us for this. 👻`,

    () => `Your web developer is lying to you.

"It'll be ready in 2 weeks" = 2 months
"It just needs a few tweaks" = Complete rebuild
"The design is almost done" = Haven't started

We don't play those games.
72 hours. Done. Period.`,

    () => `Hot take: AI will replace 80% of web developers by 2027.

The survivors will be:
→ Those who use AI as a force multiplier
→ Those who automate the boring stuff
→ Those who ship faster than humanly possible

We're already there. Are you?`,

    () => `Controversial: Your $50k website is worse than my $5k website.

Yours:
- Loads in 4 seconds
- No tracking
- Can't answer a phone

Mine:
- Sub-2s load
- Full analytics
- AI handles calls 24/7

Agencies are in panic mode. 🔥`,

    () => `The uncomfortable truth about Webflow, Wix, and Squarespace:

You're paying for the illusion of ownership.
You're locked into their ecosystem.
You have zero competitive advantage.

Custom code > drag-and-drop.
Fight me. 👻`,

    () => `Why most startups fail isn't product-market fit.

It's that their website:
- Converts at 0.5%
- Loses 60% of mobile users
- Can't capture leads at 2am

Your site is your silent killer.
Most founders just don't know it yet.`,

    () => `"We need a redesign."

No. You need a CONVERSION SYSTEM.

Redesigns = $30k and 4 months
Conversion systems = $5k and 72 hours

One makes designers happy.
One makes you money.

Choose wisely.`,

    () => `Agencies charging by the hour is the biggest scam in tech.

Slow = More money for them
Fast = Less money for them

We charge fixed price. 
We're incentivized to be FAST.
Funny how that works. 👻`,

    () => `The AI website future nobody's talking about:

Your site will:
→ Rewrite copy based on who's visiting
→ Adjust pricing based on behavior
→ Close deals without you

Static websites are dead.
Dynamic, AI-powered systems are the future.

We're already building them.`,

    () => `"But AI can't replace real creativity!"

Tell that to our AI that:
- Writes converting copy
- Answers calls in 4 languages
- Books appointments 24/7
- Never calls in sick

Your "creativity" can stay home.
Results don't need egos.`,
];

/**
 * PORTFOLIO - Client work showcases
 */
export const portfolioTemplates = [
    () => {
        const p = pick(config.portfolio);
        return `Just shipped ${p.name} ✨

72 hours from kickoff to live:
• Full booking system
• AI voice agent (24/7)
• Conversion tracking
• Mobile-first design

Result: ${p.result}

See it live → ${config.brand.website}`;
    },

    () => {
        const p = pick(config.portfolio);
        return `Client win: ${p.name} 🏆

The brief: "${p.niche} site that converts"
The timeline: 72 hours
The result: ${p.result}

No templates. Custom-built. Production-ready.

${getHashtags(2)}`;
    },

    () => {
        const p = pick(config.portfolio);
        return `Before Ghost AI: "Our website just sits there"
After Ghost AI: "${p.result}"

${p.name} launched in 72 hours with:
→ AI receptionist
→ Online booking
→ Lead tracking
→ Performance analytics

Your move. ${config.brand.website}`;
    },

    () => `What ships in 72 hours:

✓ Strategy & information architecture
✓ Full development build
✓ SEO + metadata setup
✓ CTA event tracking
✓ Security headers
✓ Performance audit
✓ Cross-device testing
✓ Production deploy

Not a prototype. A system.

${config.brand.website}`,
];

/**
 * BEHIND THE SCENES - AI agent stories
 */
export const btsTemplates = [
    () => {
        const agent = pick(Object.values(config.agents));
        return `Our AI agent "${agent.name}" just handled her 1000th call 🎉

She:
• Books appointments
• Answers FAQs
• Speaks 4 languages
• Never takes a day off

Want one for your business?

DM me "${agent.name.toUpperCase()}" 👻`;
    },

    () => `Building in public: Ghost AI stats this month

📞 ${Math.floor(Math.random() * 200 + 100)} AI voice calls handled
🌐 ${Math.floor(Math.random() * 10 + 3)} sites shipped
⚡ Average build time: 68 hours
📈 Client conversion lift: 2.4x average

The AI never sleeps. Neither do the results.`,

    () => `Just watched our AI handle a 3am call.

Caller: "What are your prices?"
AI: *Gives pricing, answers 3 follow-ups*
AI: "Let me book that for you"
Caller: *Booked*

Owner woke up to a new customer.

This is the future. 👻`,

    () => `Real conversation our AI had yesterday:

"¿Hablas español?"
"Sí, absolutamente. ¿En qué puedo ayudarte?"

Seamless switch. No delay. No human needed.

Your receptionist can't do that at 2am.
Our AI can. Every time.`,

    () => `The Council convened today. 🧠

5 AI agents. 1 decision matrix.
Outcome: 3 new site architectures optimized.

We don't just build websites.
We build systems that evolve.

${getHashtags(2)}`,
];

/**
 * CTA - Direct calls to action
 */
export const ctaTemplates = [
    () => {
        const offer = pick(config.offers);
        return `Free for the next 48 hours:

${offer.description} for your business

I'll show you:
→ What's killing your conversions
→ Where you're losing mobile users
→ How AI can 3x your lead flow

DM "${offer.keyword}" to claim yours 👻`;
    },

    () => `Ready to stop losing leads to slow websites?

Here's my offer:

→ Free 15-min audit call
→ I'll show you exactly what to fix
→ No pitch (unless you ask)

DM "GHOST" and let's talk.

${config.brand.website}`,

    () => `Your website working for you 24/7?

If not, we should talk.

• AI voice agents
• Conversion tracking
• 72-hour delivery
• Results guaranteed

DM "AUDIT" for a free breakdown 👻`,

    () => `Founders: Stop leaving money on your website.

I'll audit your site for free and show you:
✓ 3 quick wins for more conversions
✓ How AI can handle your leads
✓ What your competitors are doing

DM "AUDIT" - limited spots this week.`,
];

/**
 * Get a random tweet by pillar type
 */
export function getTweetByPillar(pillar) {
    // Map new pillar names to template pools (legacy templates still work)
    const templates = {
        hotTakes: hotTakeTemplates,
        builderLogs: [...btsTemplates, ...valueTemplates],
        industryCommentary: hotTakeTemplates,
        subtleFlex: portfolioTemplates,
        cta: ctaTemplates,
        // Legacy fallbacks
        value: valueTemplates,
        portfolio: portfolioTemplates,
        bts: btsTemplates,
    };

    const pillarTemplates = templates[pillar];
    if (!pillarTemplates) {
        throw new Error(`Unknown pillar: ${pillar}`);
    }

    const template = pick(pillarTemplates);
    return template();
}

/**
 * Get a random pillar based on weighted distribution
 */
export function getWeightedPillar() {
    const { pillars } = config;
    const rand = Math.random() * 100;

    let cumulative = 0;
    for (const [pillar, weight] of Object.entries(pillars)) {
        cumulative += weight;
        if (rand <= cumulative) {
            return pillar;
        }
    }

    return 'hotTakes'; // fallback — spicy by default
}

/**
 * Generate a tweet using weighted pillar selection (template-based)
 */
export function generateTweet() {
    const pillar = getWeightedPillar();
    const tweet = getTweetByPillar(pillar);

    return {
        pillar,
        text: tweet,
        length: tweet.length,
    };
}

/**
 * Generate AI-powered tweet using configured LLM provider(s)
 * Reads x-brain.md for centralized persona, voice, and strategy.
 */
export async function generateAITweet(options = {}) {
    const {
        pillar = getWeightedPillar(),
        controversial = true,
        maxLength = 280,
        provider = 'auto',
    } = options;

    const pillarDescriptions = {
        hotTakes: 'a controversial hot take that makes people want to argue or agree strongly. Challenge assumptions about AI, agencies, or tech.',
        builderLogs: 'a raw, real builder log — what you shipped today, a late-night deploy, a problem you solved. Show the work, not the polish.',
        industryCommentary: 'a sharp take on something happening in AI right now — a launch, an acquisition, a trend. Have a strong position.',
        subtleFlex: 'a subtle flex — client result, speed record, or revenue milestone. Let the numbers do the talking, don\'t brag explicitly.',
        cta: 'a soft sell — offer a free audit, mention the website naturally, or invite DMs. Never pushy, never more than 1 in 10 posts.',
        value: 'educational value about web development, AI, or conversion optimization',
        portfolio: 'showcase of client work and results',
        bts: 'behind-the-scenes look at building with AI',
    };

    // Priority 1: Brand Intelligence System
    let prompt;
    try {
        const brand = loadBrand('ghost-ai');
        const brandPrompt = getBrandPrompt(brand, 'x');
        const neverSay = getNeverSayList(brand);
        const neverSayBlock = neverSay.length > 0
            ? `\nNEVER SAY: ${neverSay.slice(0, 8).map(p => `"${p}"`).join(', ')}`
            : '';

        prompt = `${brandPrompt}\n\nPLATFORM: X (Twitter) — ${maxLength} char limit\n${neverSayBlock}\n\nGenerate a tweet for: ${pillarDescriptions[pillar] || pillarDescriptions.hotTakes}\n\n${controversial ? 'Make this SPICY — the kind of tweet that gets quote-tweeted and argued about.' : 'Keep it punchy but not necessarily controversial.'}\n\nRULES:\n- MUST be under ${maxLength} characters\n- NO hashtags ever\n- 1 emoji max\n- casual voice, lowercase ok, "ngl" "tbh" ok\n- Output ONLY the tweet text, nothing else`;
    } catch {
        // Priority 2: x-brain.md
        const xBrain = loadXBrain();
        if (xBrain) {
            prompt = `Here is your complete identity, voice, and strategy guide:\n\n${xBrain}\n\n---\n\nNow generate a tweet for the "${pillar}" content pillar: ${pillarDescriptions[pillar] || pillarDescriptions.hotTakes}\n\n${controversial ? 'Make this SPICY.' : 'Keep it punchy.'}\n\nRULES:\n- MUST be under ${maxLength} characters\n- Follow ALL the voice rules from the brain file above\n- Output ONLY the tweet text, nothing else`;
        } else {
            // Priority 3: inline fallback
            prompt = `You are Daniel Castillo, founder of Ghost AI Systems. You build AI-powered websites in 72 hours, AI voice agents, and automation.\n\nYour voice on X: casual, spicy, builder energy. Lowercase ok. "ngl", "tbh" ok. NO hashtags ever. 1 emoji max.\n\nGenerate a tweet for: ${pillarDescriptions[pillar] || pillarDescriptions.hotTakes}\n\n${controversial ? 'Make it controversial and engagement-baiting.' : 'Keep it punchy.'}\n\nMust be under ${maxLength} characters. Output ONLY the tweet text.`;
        }
    }

    console.log('🧠 Generating AI content...');

    const { text } = await generateText({
        prompt,
        provider,
        maxOutputTokens: 300,
        openaiModel: 'gpt-5.4-mini',
        geminiModel: process.env.GEMINI_MODEL || 'gemini-3-pro-preview',
    });

    const tweet = text.trim();

    const finalTweet = tweet.length > maxLength
        ? tweet.substring(0, maxLength - 3) + '...'
        : tweet;

    return {
        pillar,
        text: finalTweet,
        length: finalTweet.length,
        aiGenerated: true,
    };
}

export default { generateTweet, generateAITweet, getTweetByPillar, getWeightedPillar };

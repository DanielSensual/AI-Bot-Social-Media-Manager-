/**
 * Content Library - Pre-written tweet templates by pillar
 */

import { config } from './config.js';

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
    const templates = {
        value: valueTemplates,
        portfolio: portfolioTemplates,
        bts: btsTemplates,
        cta: ctaTemplates,
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

    return 'value'; // fallback
}

/**
 * Generate a tweet using weighted pillar selection
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

export default { generateTweet, getTweetByPillar, getWeightedPillar };

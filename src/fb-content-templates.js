/**
 * Facebook Group Content Templates — MediaGeekz
 * 
 * Buyer-persona specific templates for each group category.
 * Usage: import { getPostForGroup } from './fb-content-templates.js';
 */

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ─── Real Estate Templates ──────────────────────────────────────

const REAL_ESTATE_POSTS = [
    () => `Stop losing listings to agents with better marketing.

A 60-second cinematic walkthrough video gets 4x more engagement than photos alone.

We shoot luxury property tours with cinema-grade cameras + FAA-licensed drones right here in Orlando.

Book a walkthrough shoot: mediageekz.com`,

    () => `Realtors — your listing photos aren't enough anymore.

Buyers scroll past photos. They stop for video.

We create cinematic property tours that sell the lifestyle, not just the square footage.

Drone aerials, interior walkthroughs, twilight shots — all in one shoot.

DM us or visit mediageekz.com`,

    () => `Quick tip for Orlando realtors:

Listings with video get 403% more inquiries (NAR data).

If you're not using professional video for your listings, you're leaving deals on the table.

We specialize in luxury real estate video production right here in Central FL.

mediageekz.com`,

    () => `Just wrapped a cinematic property tour in Windermere.

The difference between a $500K listing that sits for 90 days and one that sells in 2 weeks? The marketing.

Professional video isn't an expense — it's an investment that closes deals faster.

See our work: mediageekz.com`,
];

// ─── Restaurant / Hospitality Templates ─────────────────────────

const RESTAURANT_POSTS = [
    () => `Restaurant owners — your food looks incredible in person. Does your Instagram show that?

We create cinematic food + ambiance reels that make people hungry just watching.

60-second social videos. Same-week delivery. Orlando-based.

mediageekz.com`,

    () => `Grand opening coming up? Rebranding your menu?

A 30-second cinematic reel shot on cinema cameras will do more for your restaurant than a month of iPhone posts.

We're Orlando's video production team for restaurants and bars.

mediageekz.com`,

    () => `Your competitor down the street has 10x your Instagram engagement. Their food isn't better — their content is.

Professional video content pays for itself in the first week.

We shoot menu videos, bar ambiance reels, and chef stories right here in Orlando.

DM us: mediageekz.com`,
];

// ─── Small Business / Entrepreneur Templates ────────────────────

const BUSINESS_POSTS = [
    () => `Orlando business owners — a 60-second brand video converts 80% more than text alone.

We create cinematic commercials, social media content, and brand films for local businesses.

No stock footage. No templates. Your story, shot on cinema cameras.

mediageekz.com`,

    () => `Your website has 3 seconds to grab attention.

A professional brand video in your hero section keeps visitors engaged 2x longer.

We shoot brand videos, team intros, and product demos for Orlando businesses.

Same-week turnaround. Cinema quality. Local crew.

mediageekz.com`,

    () => `Small businesses spending $500/month on ads but posting iPhone videos:

Your content quality IS your brand quality in the customer's eyes.

One professional shoot gives you 30+ days of premium social content.

We make it easy and affordable. DM us or visit mediageekz.com`,

    () => `Orlando entrepreneurs — what's your visual story?

We've filmed commercials, brand launches, and social content for businesses across Central FL.

Cinema cameras. Drone footage. Same-week delivery.

Check our portfolio: mediageekz.com`,
];

// ─── Wedding Templates ──────────────────────────────────────────

const WEDDING_POSTS = [
    () => `Your wedding day happens once. Don't trust it to Uncle Bob's iPhone.

We create cinematic wedding films that capture every moment with cinema-grade cameras and professional audio.

Central Florida's premiere wedding videography team.

See our highlight reels: mediageekz.com`,

    () => `Newly engaged? Congrats!

Before you book your florist, DJ, and caterer — book your videographer.

The flowers die. The food gets eaten. The video lasts forever.

Cinematic wedding films starting from one simple shoot day. Orlando-based.

mediageekz.com`,

    () => `Wedding vendors — looking for a reliable video partner to refer your clients to?

We shoot cinematic wedding highlights, ceremony coverage, and reception films.

Fast turnaround. Premium quality. Happy couples guaranteed.

Let's connect: mediageekz.com`,
];

// ─── General / Networking Templates ─────────────────────────────

const GENERAL_POSTS = [
    () => `Orlando's premiere cinematic video production team.

Commercials, brand films, real estate tours, wedding films, social content — all shot on cinema cameras with FAA-licensed drone pilots.

See our work: mediageekz.com`,

    () => `Need video content that actually converts?

We're MediaGeekz — Orlando's cinematic production company.

We shoot everything from 30-second social reels to full commercials.

Cinema cameras. Professional audio. Drone aerials. Same-week delivery.

mediageekz.com`,
];

// ─── Category Matcher ───────────────────────────────────────────

const GROUP_CATEGORIES = {
    'REAL_ESTATE': /real estate|realt|investor|luxury.*list|property/i,
    'RESTAURANT': /restaurant|food|hospitality|bar owner|nightlife/i,
    'WEDDING': /wedding|bride|groom|vendor/i,
    'BUSINESS': /business|entrepreneur|startup|networking|small biz/i,
};

/**
 * Get a contextually appropriate post for a group based on its name.
 * @param {string} groupName - Name of the target Facebook group
 * @returns {{ text: string, category: string }}
 */
export function getPostForGroup(groupName) {
    for (const [category, regex] of Object.entries(GROUP_CATEGORIES)) {
        if (regex.test(groupName)) {
            let templates;
            switch (category) {
                case 'REAL_ESTATE': templates = REAL_ESTATE_POSTS; break;
                case 'RESTAURANT': templates = RESTAURANT_POSTS; break;
                case 'WEDDING': templates = WEDDING_POSTS; break;
                case 'BUSINESS': templates = BUSINESS_POSTS; break;
            }
            return { text: pick(templates)(), category };
        }
    }
    // Fallback to general
    return { text: pick(GENERAL_POSTS)(), category: 'GENERAL' };
}

/**
 * Get all available categories and their template counts.
 */
export function getTemplateStats() {
    return {
        REAL_ESTATE: REAL_ESTATE_POSTS.length,
        RESTAURANT: RESTAURANT_POSTS.length,
        BUSINESS: BUSINESS_POSTS.length,
        WEDDING: WEDDING_POSTS.length,
        GENERAL: GENERAL_POSTS.length,
    };
}

export default { getPostForGroup, getTemplateStats };

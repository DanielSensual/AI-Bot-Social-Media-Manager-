/**
 * GhostAI X Bot Configuration
 */

import 'dotenv/config';

export const config = {
    // Brand Info
    brand: {
        name: 'Ghost AI Systems',
        handle: '@GhostAISystems',
        website: 'ghostaisystems.com',
        tagline: 'AI-enhanced websites shipped in 72 hours',
    },

    // Content Pillars with weights (must sum to 100)
    // Quality Sniper mode — prioritize real builds over generic takes
    pillars: {
        builderLogs: 35,        // Show the real work — screenshots, repos, deploys
        hotTakes: 25,            // Still spicy, but earned through substance
        portfolio: 20,           // Client results with proof — numbers, before/after
        industryCommentary: 15,  // React to AI news with a sharp position
        cta: 5,                  // Barely any — let results speak
    },

    // Posting Schedule (EST timezone)
    // Algorithm-optimized: Thunder retention window favors recency.
    // 3x/day stays under AuthorDiversityScorer penalty threshold.
    schedule: {
        timezone: 'America/New_York',
        times: ['9:00', '12:00', '17:00'],
        enabled: true,
    },

    // Hashtag Strategy — less is more, X deprioritizes hashtag-heavy posts
    hashtags: {
        primary: ['#BuildInPublic', '#AI'],
        secondary: ['#WebDev', '#Automation', '#IndieHacker'],
        maxPerTweet: 2,
    },

    // Portfolio Showcase Data
    portfolio: [
        { name: 'ReelEstate Orlando', niche: 'Real Estate Video', result: '12 bookings first week' },
        { name: 'ÉLAN Aesthetics', niche: 'Medical Spa', result: '3x lead flow' },
        { name: 'PRIME Steakhouse', niche: 'Fine Dining', result: 'Full booking calendar' },
        { name: 'OBSIDIAN Detailing', niche: 'Auto Detailing', result: '47 voice calls/month' },
        { name: 'LUMIÈRE Barbershop', niche: 'Barbershop', result: 'Online booking 24/7' },
    ],

    // AI Voice Agent Names
    agents: {
        anna: { name: 'Anna', client: 'ReelEstate', specialty: 'Real estate video' },
        maya: { name: 'Maya', client: 'MediaGeekz', specialty: 'Creative agency quotes' },
    },

    // CTA Offers
    offers: [
        { keyword: 'AUDIT', description: 'Free AI website audit' },
        { keyword: 'ANNA', description: 'AI receptionist demo' },
        { keyword: 'GHOST', description: 'Discovery call booking' },
    ],

    // Autonomy Settings — X Algorithm Optimized
    // Based on xai-org/x-algorithm source analysis (May 2026)
    autonomy: {
        // AI posts tuned to algorithm scoring signals (hook-first, reply-bait, dwell-optimized)
        aiRatio: 85,
        // ALWAYS attach video — triggers P(dwell) + P(video_view) + P(share) prediction heads
        // that text-only posts literally cannot activate
        videoRatio: 100,
        // Which platforms to post to
        platforms: {
            x: true,
            linkedin: true,
            facebook: false, // Owned by dedicated facebook-agent (ecosystem.config.cjs)
            instagram: process.env.INSTAGRAM_ENABLED !== 'false',
        },
        // Health check before each post
        healthCheck: true,
        // Smart content adaptation per platform
        contentAdapt: process.env.CONTENT_ADAPT_ENABLED === 'true',
    },

    // Facebook Sales Funnel
    facebookFunnel: {
        website: 'https://ghostaisystems.com',
        ctaPages: [
            '/buy',       // SiteDrop purchase
            '/intake',    // Lead form
            '/consulting', // High-ticket consulting
            '/ai',        // AI stack showcase
        ],
        // Every Nth post gets a direct link injected
        ctaFrequency: 3,
        // Reel ratio for Facebook (higher than X/LinkedIn)
        reelRatio: 60,
    },
};

export default config;

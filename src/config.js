/**
 * GhostAI X Bot Configuration
 */

export const config = {
    // Brand Info
    brand: {
        name: 'Ghost AI Systems',
        handle: '@GhostAISystems',
        website: 'ghostaisystems.com',
        tagline: 'AI-enhanced websites shipped in 72 hours',
    },

    // Content Pillars with weights (must sum to 100)
    pillars: {
        value: 30,      // Educational content, tips, insights
        hotTakes: 20,   // Controversial/provocative content for engagement
        portfolio: 20,  // Client work showcases
        bts: 15,        // Behind the scenes, AI agent stories
        cta: 15,        // Direct calls to action
    },

    // Posting Schedule (EST timezone)
    schedule: {
        timezone: 'America/New_York',
        times: ['8:00', '12:00', '17:00', '21:00'], // 4x daily
        enabled: true,
    },

    // Hashtag Strategy
    hashtags: {
        primary: ['#AI', '#WebDev', '#Startup'],
        secondary: ['#SaaS', '#Automation', '#GrowthHacking', '#BuildInPublic'],
        maxPerTweet: 3,
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
};

export default config;

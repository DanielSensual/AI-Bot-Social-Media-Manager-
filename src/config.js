import dotenv from 'dotenv';
dotenv.config();

export default {
    brand: {
        name: 'Ghost AI Systems',
        website: 'https://ghostai.dev',
        calendarLink: process.env.CALENDAR_LINK || 'https://calendly.com/ghostai/audit',
        fromEmail: process.env.FROM_EMAIL || 'daniel@ghostai.dev',
        fromName: process.env.FROM_NAME || 'Daniel Castillo',
        tagline: 'AI-powered websites, voice agents & automation for local businesses',
    },

    // Services to pitch
    services: [
        { name: 'AI Website', price: '$2,500 - $5,000', turnaround: '72 hours' },
        { name: 'AI Voice Receptionist', price: '$297/mo', turnaround: '24 hours' },
        { name: 'Social Media Automation', price: '$497/mo', turnaround: '48 hours' },
    ],

    // Outreach config
    outreach: {
        maxPerDay: 50,
        followUpDays: [3, 7, 14],
        cooldownDays: 30,      // Don't re-contact for 30 days
        subjectLines: [
            'Quick question about {businessName}',
            '{businessName} — spotted something on your site',
            'Idea for {businessName} (took 30 sec to check)',
        ],
    },

    // Lead scoring thresholds
    scoring: {
        hotThreshold: 70,
        warmThreshold: 40,
    },

    // API keys
    api: {
        googlePlaces: process.env.GOOGLE_PLACES_API_KEY,
        xai: process.env.XAI_API_KEY || process.env.GROK_API_KEY,
        resend: process.env.RESEND_API_KEY,
    },
};

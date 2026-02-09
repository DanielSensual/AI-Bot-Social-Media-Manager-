module.exports = {
    apps: [
        {
            // ═══ MORNING: Full pipeline — hunt, qualify, enrich, outreach ═══
            name: 'lead-hunter-pipeline',
            script: 'scripts/daily-pipeline.js',
            cwd: '/Users/danielcastillo/Projects/Websites/Bots/ghostai-lead-hunter',
            cron_restart: '0 9 * * 1-5', // 9 AM EST, Mon-Fri
            autorestart: false,
            watch: false,
            env: {
                NODE_ENV: 'production',
            },
        },
        {
            // ═══ AFTERNOON: Follow-up sequences ═══
            name: 'lead-hunter-followups',
            script: 'scripts/outreach.js',
            args: '--followup',
            cwd: '/Users/danielcastillo/Projects/Websites/Bots/ghostai-lead-hunter',
            cron_restart: '0 14 * * 1-5', // 2 PM EST, Mon-Fri
            autorestart: false,
            watch: false,
            env: {
                NODE_ENV: 'production',
            },
        },
        {
            // ═══ WEEKLY BLITZ: Multi-city hunt + enrich (Mondays only) ═══
            name: 'lead-hunter-blitz',
            script: 'scripts/blitz.js',
            args: '--enrich',
            cwd: '/Users/danielcastillo/Projects/Websites/Bots/ghostai-lead-hunter',
            cron_restart: '0 7 * * 1', // 7 AM Monday
            autorestart: false,
            watch: false,
            env: {
                NODE_ENV: 'production',
            },
        },
        {
            // ═══ DASHBOARD SYNC: Push stats every hour ═══
            name: 'lead-hunter-sync',
            script: 'scripts/sync.js',
            cwd: '/Users/danielcastillo/Projects/Websites/Bots/ghostai-lead-hunter',
            cron_restart: '0 * * * *', // Every hour
            autorestart: false,
            watch: false,
            env: {
                NODE_ENV: 'production',
            },
        },
        {
            // ═══ WEBHOOK SERVER: Always-on reply/open/click tracking ═══
            name: 'lead-hunter-webhooks',
            script: 'scripts/webhooks.js',
            cwd: '/Users/danielcastillo/Projects/Websites/Bots/ghostai-lead-hunter',
            autorestart: true, // Keep the server running
            watch: false,
            env: {
                NODE_ENV: 'production',
                WEBHOOK_PORT: 3847,
            },
        },
    ],
};

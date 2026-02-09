module.exports = {
    apps: [
        {
            name: 'lead-hunter-daily',
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
    ],
};

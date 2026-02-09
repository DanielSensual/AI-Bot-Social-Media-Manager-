/**
 * PM2 Ecosystem Configuration
 * Manages scheduled jobs for the GhostAI Bot
 */

module.exports = {
    apps: [
        {
            name: 'ghostai-bot',
            script: 'src/index.js',
            cwd: __dirname,
            watch: false,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 5000,
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        {
            name: 'facebook-agent',
            script: 'scripts/facebook-agent.js',
            cwd: __dirname,
            watch: false,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 5000,
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        {
            name: 'linkedin-responder-morning',
            script: 'scripts/respond-messages.js',
            cwd: __dirname,
            cron_restart: '0 9 * * *', // 9:00 AM daily
            watch: false,
            autorestart: false,
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        {
            name: 'linkedin-responder-evening',
            script: 'scripts/respond-messages.js',
            cwd: __dirname,
            cron_restart: '0 17 * * *', // 5:00 PM daily
            watch: false,
            autorestart: false,
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        {
            name: 'facebook-responder-morning',
            script: 'scripts/respond-facebook.js',
            cwd: __dirname,
            cron_restart: '0 9 * * *', // 9:00 AM daily
            watch: false,
            autorestart: false,
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        {
            name: 'facebook-responder-evening',
            script: 'scripts/respond-facebook.js',
            cwd: __dirname,
            cron_restart: '0 17 * * *', // 5:00 PM daily
            watch: false,
            autorestart: false,
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        {
            name: 'facebook-comment-responder',
            script: 'scripts/respond-comments.js',
            cwd: __dirname,
            cron_restart: '0 10,18 * * *', // 10:00 AM + 6:00 PM daily
            watch: false,
            autorestart: false,
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
    ],
};

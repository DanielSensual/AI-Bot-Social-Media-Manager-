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
            error_file: './logs/pm2/ghostai-bot-error.log',
            out_file: './logs/pm2/ghostai-bot-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
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
            error_file: './logs/pm2/facebook-agent-error.log',
            out_file: './logs/pm2/facebook-agent-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        {
            name: 'daniel-facebook-manager',
            script: 'scripts/danieldigital/facebook-manager.js',
            cwd: __dirname,
            watch: false,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 5000,
            error_file: './logs/pm2/daniel-facebook-manager-error.log',
            out_file: './logs/pm2/daniel-facebook-manager-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
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
            name: 'facebook-responder-bachata-morning',
            script: 'scripts/respond-facebook.js',
            args: '--mode=live --page-id=266552527115323 --profile=bachata_exotica --limit=5',
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
            name: 'facebook-responder-bachata-evening',
            script: 'scripts/respond-facebook.js',
            args: '--mode=live --page-id=266552527115323 --profile=bachata_exotica --limit=5',
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
            name: 'facebook-bachata-daily-post',
            script: 'scripts/bachata-daily-post.js',
            args: '--page-id=266552527115323',
            cwd: __dirname,
            cron_restart: '0 10 * * *', // 10:00 AM daily
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
        {
            name: 'instagram-autopilot',
            script: 'scripts/instagram-autopilot.js',
            cwd: __dirname,
            watch: false,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 5000,
            error_file: './logs/pm2/instagram-autopilot-error.log',
            out_file: './logs/pm2/instagram-autopilot-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        {
            name: 'twitter-responder-morning',
            script: 'scripts/respond-twitter.js',
            cwd: __dirname,
            cron_restart: '0 10 * * *', // 10:00 AM daily
            watch: false,
            autorestart: false,
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        {
            name: 'twitter-responder-evening',
            script: 'scripts/respond-twitter.js',
            cwd: __dirname,
            cron_restart: '0 18 * * *', // 6:00 PM daily
            watch: false,
            autorestart: false,
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        {
            name: 'x-engagement-bot',
            script: 'scripts/engage-x.js',
            cwd: __dirname,
            cron_restart: '0 9,13,18 * * *', // 9:00 AM, 1:00 PM, 6:00 PM daily
            watch: false,
            autorestart: false,
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        {
            name: 'danielsensual-daily',
            script: 'scripts/danielsensual-agent.js',
            cwd: __dirname,
            cron_restart: '0 11 * * *', // 11:00 AM daily
            watch: false,
            autorestart: false,
            error_file: './logs/pm2/danielsensual-daily-error.log',
            out_file: './logs/pm2/danielsensual-daily-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        {
            name: 'bachataexotica-music-daily',
            script: 'scripts/bachataexotica-music-post.js',
            cwd: __dirname,
            cron_restart: '0 14 * * *', // 2:00 PM daily
            watch: false,
            autorestart: false,
            error_file: './logs/pm2/bachataexotica-music-error.log',
            out_file: './logs/pm2/bachataexotica-music-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
    ],
};

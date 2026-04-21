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
        // ── DISABLED: Bachata Exotica page paused (2026-04-06) ──────────
        /*
        {
            name: 'facebook-responder-bachata-morning',
            script: 'scripts/respond-facebook.js',
            args: '--mode=live --page-id=266552527115323 --profile=bachata_exotica --limit=5',
            cwd: __dirname,
            cron_restart: '0 9 * * *',
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
            cron_restart: '0 17 * * *',
            watch: false,
            autorestart: false,
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        */
        // ── DISABLED: Bachata Exotica daily post paused (2026-04-06) ─────
        /*
        {
            name: 'facebook-bachata-daily-post',
            script: 'scripts/bachata-daily-post.js',
            args: '--page-id=266552527115323',
            cwd: __dirname,
            cron_restart: '0 10 * * *',
            watch: false,
            autorestart: false,
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        */
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
        // ── DISABLED: Bachata Exotica music post paused (2026-04-06) ─────
        /*
        {
            name: 'bachataexotica-music-daily',
            script: 'scripts/bachataexotica-music-post.js',
            cwd: __dirname,
            cron_restart: '0 14 * * *',
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
        */
        // ── Ghost AI News Posts (Real-Time AI News) ─────────────────────
        {
            name: 'ghostai-news-morning',
            script: 'scripts/ghostai-news-post.js',
            cwd: __dirname,
            cron_restart: '0 9 * * *', // 9:00 AM — morning news drop
            watch: false,
            autorestart: false,
            error_file: './logs/pm2/ghostai-news-error.log',
            out_file: './logs/pm2/ghostai-news-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        {
            name: 'ghostai-news-afternoon',
            script: 'scripts/ghostai-news-post.js',
            cwd: __dirname,
            cron_restart: '0 13 * * *', // 1:00 PM — lunch break news
            watch: false,
            autorestart: false,
            error_file: './logs/pm2/ghostai-news-error.log',
            out_file: './logs/pm2/ghostai-news-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        {
            name: 'ghostai-news-evening',
            script: 'scripts/ghostai-news-post.js',
            cwd: __dirname,
            cron_restart: '0 18 * * *', // 6:00 PM — evening prime time
            watch: false,
            autorestart: false,
            error_file: './logs/pm2/ghostai-news-error.log',
            out_file: './logs/pm2/ghostai-news-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },


        // ── Daniel Sensual Video Group Shares ────────────────────────────
        {
            name: 'danielsensual-share-morning',
            script: 'scripts/danielsensual-share.js',
            args: '--batch=1',
            cwd: __dirname,
            cron_restart: '0 9 * * *', // 9:00 AM daily
            watch: false,
            autorestart: false,
            error_file: './logs/pm2/danielsensual-share-error.log',
            out_file: './logs/pm2/danielsensual-share-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        {
            name: 'danielsensual-share-afternoon',
            script: 'scripts/danielsensual-share.js',
            args: '--batch=2',
            cwd: __dirname,
            cron_restart: '0 13 * * *', // 1:00 PM daily
            watch: false,
            autorestart: false,
            error_file: './logs/pm2/danielsensual-share-error.log',
            out_file: './logs/pm2/danielsensual-share-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        {
            name: 'danielsensual-share-evening',
            script: 'scripts/danielsensual-share.js',
            args: '--batch=3',
            cwd: __dirname,
            cron_restart: '0 18 * * *', // 6:00 PM daily
            watch: false,
            autorestart: false,
            error_file: './logs/pm2/danielsensual-share-error.log',
            out_file: './logs/pm2/danielsensual-share-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        {
            name: 'danielsensual-share-latenight',
            script: 'scripts/danielsensual-share.js',
            args: '--batch=4',
            cwd: __dirname,
            cron_restart: '0 23 * * *', // 11:00 PM EST (peak LATAM time)
            watch: false,
            autorestart: false,
            error_file: './logs/pm2/danielsensual-share-error.log',
            out_file: './logs/pm2/danielsensual-share-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        {
            name: 'danielsensual-share-earlybird',
            script: 'scripts/danielsensual-share.js',
            args: '--batch=5',
            cwd: __dirname,
            cron_restart: '0 7 * * *', // 7:00 AM EST — Orlando locals + Europe evening
            watch: false,
            autorestart: false,
            error_file: './logs/pm2/danielsensual-share-error.log',
            out_file: './logs/pm2/danielsensual-share-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        {
            name: 'danielsensual-share-creators',
            script: 'scripts/danielsensual-share.js',
            args: '--batch=6',
            cwd: __dirname,
            cron_restart: '0 10 * * *', // 10:00 AM EST — Content creators + filmmakers
            watch: false,
            autorestart: false,
            error_file: './logs/pm2/danielsensual-share-error.log',
            out_file: './logs/pm2/danielsensual-share-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        {
            name: 'danielsensual-share-extended',
            script: 'scripts/danielsensual-share.js',
            args: '--batch=7',
            cwd: __dirname,
            cron_restart: '0 16 * * *', // 4:00 PM EST — Extended LATAM + International
            watch: false,
            autorestart: false,
            error_file: './logs/pm2/danielsensual-share-error.log',
            out_file: './logs/pm2/danielsensual-share-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },

        // ── Daniel Sensual Personal Profile Group Shares ──────────────────
        {
            name: 'danielsensual-personal-share-morning',
            script: 'scripts/danielsensual-personal-share.js',
            args: '--batch=1',
            cwd: __dirname,
            cron_restart: '0 8 * * *', // 8:00 AM daily — personal post rollout before page shares
            watch: false,
            autorestart: false,
            error_file: './logs/pm2/danielsensual-personal-share-error.log',
            out_file: './logs/pm2/danielsensual-personal-share-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        {
            name: 'danielsensual-personal-share-afternoon',
            script: 'scripts/danielsensual-personal-share.js',
            args: '--batch=2',
            cwd: __dirname,
            cron_restart: '0 12 * * *', // 12:00 PM daily — core city/dance groups
            watch: false,
            autorestart: false,
            error_file: './logs/pm2/danielsensual-personal-share-error.log',
            out_file: './logs/pm2/danielsensual-personal-share-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
        {
            name: 'danielsensual-personal-share-evening',
            script: 'scripts/danielsensual-personal-share.js',
            args: '--batch=3',
            cwd: __dirname,
            cron_restart: '0 17 * * *', // 5:00 PM daily — international prime-time window
            watch: false,
            autorestart: false,
            error_file: './logs/pm2/danielsensual-personal-share-error.log',
            out_file: './logs/pm2/danielsensual-personal-share-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },

        // ── Music Manager — Video Catalog ───────────────────────────────
        {
            name: 'music-manager-rotate-daily',
            script: 'scripts/video-catalog.js',
            args: '--next',
            cwd: __dirname,
            cron_restart: '30 8 * * *', // 8:30 AM daily (before 9 AM shares)
            watch: false,
            autorestart: false,
            error_file: './logs/pm2/video-catalog-error.log',
            out_file: './logs/pm2/video-catalog-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: { NODE_ENV: 'production', TZ: 'America/New_York' },
        },
        {
            name: 'music-manager-scan-weekly',
            script: 'scripts/video-catalog.js',
            args: '--scan',
            cwd: __dirname,
            cron_restart: '0 0 * * 0', // Midnight every Sunday
            watch: false,
            autorestart: false,
            error_file: './logs/pm2/video-catalog-error.log',
            out_file: './logs/pm2/video-catalog-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: { NODE_ENV: 'production', TZ: 'America/New_York' },
        },

        // ── Music Manager — Engagement Bot ──────────────────────────────
        {
            name: 'music-manager-engage-morning',
            script: 'scripts/engagement-bot.js',
            args: '--max-replies=10',
            cwd: __dirname,
            cron_restart: '0 11 * * *', // 11:00 AM (2h after morning shares)
            watch: false,
            autorestart: false,
            error_file: './logs/pm2/engagement-bot-error.log',
            out_file: './logs/pm2/engagement-bot-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: { NODE_ENV: 'production', TZ: 'America/New_York' },
        },
        {
            name: 'music-manager-engage-afternoon',
            script: 'scripts/engagement-bot.js',
            args: '--max-replies=10',
            cwd: __dirname,
            cron_restart: '0 15 * * *', // 3:00 PM (2h after afternoon shares)
            watch: false,
            autorestart: false,
            error_file: './logs/pm2/engagement-bot-error.log',
            out_file: './logs/pm2/engagement-bot-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: { NODE_ENV: 'production', TZ: 'America/New_York' },
        },
        {
            name: 'music-manager-engage-evening',
            script: 'scripts/engagement-bot.js',
            args: '--max-replies=10',
            cwd: __dirname,
            cron_restart: '0 20 * * *', // 8:00 PM (2h after evening shares)
            watch: false,
            autorestart: false,
            error_file: './logs/pm2/engagement-bot-error.log',
            out_file: './logs/pm2/engagement-bot-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: { NODE_ENV: 'production', TZ: 'America/New_York' },
        },

        // ── ClawBot Log Watcher ─────────────────────────────────────────
        {
            name: 'clawbot-watcher',
            script: 'scripts/clawbot-watcher.js',
            cwd: __dirname,
            watch: false,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 30000,
            error_file: './logs/pm2/clawbot-watcher-error.log',
            out_file: './logs/pm2/clawbot-watcher-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
                DASHBOARD_URL: 'https://ghostai-dashboard.vercel.app',
            },
        },



        // ── DanielSensual Threads Bot ────────────────────────────────────
        {
            name: 'threads-bot-morning',
            script: 'scripts/threads-bot.js',
            args: '--once',
            cwd: __dirname,
            cron_restart: '0 10 * * *', // 10:00 AM daily
            watch: false,
            autorestart: false,
            error_file: './logs/pm2/threads-bot-error.log',
            out_file: './logs/pm2/threads-bot-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: { NODE_ENV: 'production', TZ: 'America/New_York' },
        },
        {
            name: 'threads-bot-afternoon',
            script: 'scripts/threads-bot.js',
            args: '--once --troll-only',
            cwd: __dirname,
            cron_restart: '0 14 * * *', // 2:00 PM daily
            watch: false,
            autorestart: false,
            error_file: './logs/pm2/threads-bot-error.log',
            out_file: './logs/pm2/threads-bot-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: { NODE_ENV: 'production', TZ: 'America/New_York' },
        },
        {
            name: 'threads-bot-evening',
            script: 'scripts/threads-bot.js',
            args: '--once --category=controversial',
            cwd: __dirname,
            cron_restart: '0 19 * * *', // 7:00 PM daily
            watch: false,
            autorestart: false,
            error_file: './logs/pm2/threads-bot-error.log',
            out_file: './logs/pm2/threads-bot-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: { NODE_ENV: 'production', TZ: 'America/New_York' },
        },

        // ── Ghost Command Center — Orchestrator & Self-Healer ───────────
        // Always-on daemon that monitors, schedules, and heals the fleet.
        // Coexists safely with PM2 cron_restart — ghost-command has its own
        // idempotency layer (cronRan state) to prevent double-fires.
        {
            name: 'ghost-command',
            script: '../scripts/ghost-command.mjs',
            cwd: __dirname,
            watch: false,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 10000,
            error_file: './logs/pm2/ghost-command-error.log',
            out_file: './logs/pm2/ghost-command-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            env: {
                NODE_ENV: 'production',
                TZ: 'America/New_York',
            },
        },
    ],
};

// NOTE: Add these entries to the apps array for the Lana campaign:
// (Added via append - will need manual merge into apps array)

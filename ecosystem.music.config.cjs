module.exports = {
  "apps": [
    {
      "name": "danielsensual-share-morning",
      "script": "scripts/danielsensual-share.js",
      "args": "--batch=1",
      cwd: __dirname,
      "cron_restart": "0 9 * * *",
      "watch": false,
      "autorestart": false,
      "error_file": "./logs/pm2/danielsensual-share-error.log",
      "out_file": "./logs/pm2/danielsensual-share-out.log",
      "merge_logs": true,
      "log_date_format": "YYYY-MM-DD HH:mm:ss Z",
      "env": {
        "NODE_ENV": "production",
        "TZ": "America/New_York"
      }
    },
    {
      "name": "danielsensual-share-afternoon",
      "script": "scripts/danielsensual-share.js",
      "args": "--batch=2",
      cwd: __dirname,
      "cron_restart": "0 13 * * *",
      "watch": false,
      "autorestart": false,
      "error_file": "./logs/pm2/danielsensual-share-error.log",
      "out_file": "./logs/pm2/danielsensual-share-out.log",
      "merge_logs": true,
      "log_date_format": "YYYY-MM-DD HH:mm:ss Z",
      "env": {
        "NODE_ENV": "production",
        "TZ": "America/New_York"
      }
    },
    {
      "name": "danielsensual-share-evening",
      "script": "scripts/danielsensual-share.js",
      "args": "--batch=3",
      cwd: __dirname,
      "cron_restart": "0 18 * * *",
      "watch": false,
      "autorestart": false,
      "error_file": "./logs/pm2/danielsensual-share-error.log",
      "out_file": "./logs/pm2/danielsensual-share-out.log",
      "merge_logs": true,
      "log_date_format": "YYYY-MM-DD HH:mm:ss Z",
      "env": {
        "NODE_ENV": "production",
        "TZ": "America/New_York"
      }
    },
    {
      "name": "danielsensual-share-latenight",
      "script": "scripts/danielsensual-share.js",
      "args": "--batch=4",
      cwd: __dirname,
      "cron_restart": "0 23 * * *",
      "watch": false,
      "autorestart": false,
      "error_file": "./logs/pm2/danielsensual-share-error.log",
      "out_file": "./logs/pm2/danielsensual-share-out.log",
      "merge_logs": true,
      "log_date_format": "YYYY-MM-DD HH:mm:ss Z",
      "env": {
        "NODE_ENV": "production",
        "TZ": "America/New_York"
      }
    },
    {
      "name": "danielsensual-share-earlybird",
      "script": "scripts/danielsensual-share.js",
      "args": "--batch=5",
      cwd: __dirname,
      "cron_restart": "0 7 * * *",
      "watch": false,
      "autorestart": false,
      "error_file": "./logs/pm2/danielsensual-share-error.log",
      "out_file": "./logs/pm2/danielsensual-share-out.log",
      "merge_logs": true,
      "log_date_format": "YYYY-MM-DD HH:mm:ss Z",
      "env": {
        "NODE_ENV": "production",
        "TZ": "America/New_York"
      }
    },
    {
      "name": "danielsensual-share-creators",
      "script": "scripts/danielsensual-share.js",
      "args": "--batch=6",
      cwd: __dirname,
      "cron_restart": "0 10 * * *",
      "watch": false,
      "autorestart": false,
      "error_file": "./logs/pm2/danielsensual-share-error.log",
      "out_file": "./logs/pm2/danielsensual-share-out.log",
      "merge_logs": true,
      "log_date_format": "YYYY-MM-DD HH:mm:ss Z",
      "env": {
        "NODE_ENV": "production",
        "TZ": "America/New_York"
      }
    },
    {
      "name": "danielsensual-share-extended",
      "script": "scripts/danielsensual-share.js",
      "args": "--batch=7",
      cwd: __dirname,
      "cron_restart": "0 16 * * *",
      "watch": false,
      "autorestart": false,
      "error_file": "./logs/pm2/danielsensual-share-error.log",
      "out_file": "./logs/pm2/danielsensual-share-out.log",
      "merge_logs": true,
      "log_date_format": "YYYY-MM-DD HH:mm:ss Z",
      "env": {
        "NODE_ENV": "production",
        "TZ": "America/New_York"
      }
    },
    {
      "name": "danielsensual-personal-share-morning",
      "script": "scripts/danielsensual-personal-share.js",
      "args": "--batch=1",
      cwd: __dirname,
      "cron_restart": "0 8 * * *",
      "watch": false,
      "autorestart": false,
      "error_file": "./logs/pm2/danielsensual-personal-share-error.log",
      "out_file": "./logs/pm2/danielsensual-personal-share-out.log",
      "merge_logs": true,
      "log_date_format": "YYYY-MM-DD HH:mm:ss Z",
      "env": {
        "NODE_ENV": "production",
        "TZ": "America/New_York"
      }
    },
    {
      "name": "danielsensual-personal-share-afternoon",
      "script": "scripts/danielsensual-personal-share.js",
      "args": "--batch=2",
      cwd: __dirname,
      "cron_restart": "0 12 * * *",
      "watch": false,
      "autorestart": false,
      "error_file": "./logs/pm2/danielsensual-personal-share-error.log",
      "out_file": "./logs/pm2/danielsensual-personal-share-out.log",
      "merge_logs": true,
      "log_date_format": "YYYY-MM-DD HH:mm:ss Z",
      "env": {
        "NODE_ENV": "production",
        "TZ": "America/New_York"
      }
    },
    {
      "name": "danielsensual-personal-share-evening",
      "script": "scripts/danielsensual-personal-share.js",
      "args": "--batch=3",
      cwd: __dirname,
      "cron_restart": "0 17 * * *",
      "watch": false,
      "autorestart": false,
      "error_file": "./logs/pm2/danielsensual-personal-share-error.log",
      "out_file": "./logs/pm2/danielsensual-personal-share-out.log",
      "merge_logs": true,
      "log_date_format": "YYYY-MM-DD HH:mm:ss Z",
      "env": {
        "NODE_ENV": "production",
        "TZ": "America/New_York"
      }
    },
    {
      "name": "music-manager-rotate-daily",
      "script": "scripts/video-catalog.js",
      "args": "--next",
      cwd: __dirname,
      "cron_restart": "30 8 * * *",
      "watch": false,
      "autorestart": false,
      "error_file": "./logs/pm2/video-catalog-error.log",
      "out_file": "./logs/pm2/video-catalog-out.log",
      "merge_logs": true,
      "log_date_format": "YYYY-MM-DD HH:mm:ss Z",
      "env": {
        "NODE_ENV": "production",
        "TZ": "America/New_York"
      }
    },
    {
      "name": "music-manager-scan-weekly",
      "script": "scripts/video-catalog.js",
      "args": "--scan",
      cwd: __dirname,
      "cron_restart": "0 0 * * 0",
      "watch": false,
      "autorestart": false,
      "error_file": "./logs/pm2/video-catalog-error.log",
      "out_file": "./logs/pm2/video-catalog-out.log",
      "merge_logs": true,
      "log_date_format": "YYYY-MM-DD HH:mm:ss Z",
      "env": {
        "NODE_ENV": "production",
        "TZ": "America/New_York"
      }
    },
    {
      "name": "music-manager-engage-morning",
      "script": "scripts/engagement-bot.js",
      "args": "--max-replies=10",
      cwd: __dirname,
      "cron_restart": "0 11 * * *",
      "watch": false,
      "autorestart": false,
      "error_file": "./logs/pm2/engagement-bot-error.log",
      "out_file": "./logs/pm2/engagement-bot-out.log",
      "merge_logs": true,
      "log_date_format": "YYYY-MM-DD HH:mm:ss Z",
      "env": {
        "NODE_ENV": "production",
        "TZ": "America/New_York"
      }
    },
    {
      "name": "music-manager-engage-afternoon",
      "script": "scripts/engagement-bot.js",
      "args": "--max-replies=10",
      cwd: __dirname,
      "cron_restart": "0 15 * * *",
      "watch": false,
      "autorestart": false,
      "error_file": "./logs/pm2/engagement-bot-error.log",
      "out_file": "./logs/pm2/engagement-bot-out.log",
      "merge_logs": true,
      "log_date_format": "YYYY-MM-DD HH:mm:ss Z",
      "env": {
        "NODE_ENV": "production",
        "TZ": "America/New_York"
      }
    },
    {
      "name": "music-manager-engage-evening",
      "script": "scripts/engagement-bot.js",
      "args": "--max-replies=10",
      cwd: __dirname,
      "cron_restart": "0 20 * * *",
      "watch": false,
      "autorestart": false,
      "error_file": "./logs/pm2/engagement-bot-error.log",
      "out_file": "./logs/pm2/engagement-bot-out.log",
      "merge_logs": true,
      "log_date_format": "YYYY-MM-DD HH:mm:ss Z",
      "env": {
        "NODE_ENV": "production",
        "TZ": "America/New_York"
      }
    }
  ]
};
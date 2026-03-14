# Bachata Exotica Daily Posting Automation

## What it does

- Runs one daily Facebook post for the Bachata Exotica page.
- Fallback order when no media is provided:
  1. current flyer from `events/bachata-pool-party/config.json`
  2. bachata history post
  3. Daniel Sensual song post

## Commands

```bash
cd /Users/danielcastillo/Projects/Websites/Bots/ghostai-x-bot

# Targeted readiness check for the Bachata page (safe: no publish, no replies)
npm run bachata:health

# Dry-run daily decision (no publish)
npm run bachata:daily:dry

# Live run now
npm run bachata:daily

# Override with custom image
npm run bachata:daily -- --image=./events/bachata-pool-party/flyer.jpg --caption="Tonight in Orlando 💃"

# Override with custom video
npm run bachata:daily -- --video=./assets/facebook/reels/agentic-1770655248593.mp4 --caption="Bachata vibe check 🔥"
```

## Unified automation JSON runner

```bash
cd /Users/danielcastillo/Projects/Websites/Bots/ghostai-x-bot

# Dry run with one JSON payload (post + inbox summary)
npm run bachata:agent:dry -- --page-id=266552527115323 --limit=5

# Live run with one JSON payload (publishes + processes inbox)
npm run bachata:agent -- --mode=live --page-id=266552527115323 --profile=bachata_exotica --limit=5
```

## Daily schedule

- PM2 app: `facebook-bachata-daily-post`
- Schedule: `10:00 AM` America/New_York (`cron_restart: '0 10 * * *'`)

## Required env

- `FACEBOOK_ACCESS_TOKEN` (user token with access to Bachata page)
- `BACHATA_PAGE_ID=266552527115323`
- `BACHATA_EVENT_CONFIG=events/bachata-pool-party/config.json`
- `BACHATA_FORCE_USER_TOKEN=true`
- Optional: `BACHATA_DANIEL_SENSUAL_SONG_URLS` (comma-separated URLs)

## Operational note

- `npm run test:connection` checks the default/global Facebook page for the current token.
- Use `npm run bachata:health` when you need to verify the Bachata Exotica page specifically.

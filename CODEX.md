# CODEX.md — Ghost AI Bot Fleet Audit Prompt

> Give this file to Codex, Claude, or any AI agent as context for a full repo audit.

## Who You Are

You are auditing the **Ghost AI Systems Bot Fleet** — a massive multi-platform social automation, lead generation, and AI voice agent ecosystem built by a solo founder (Daniel Castillo). This repo (`ghostai-x-bot/`) is the **central nervous system** — 129 JavaScript files managing automation across Facebook, Instagram, X (Twitter), LinkedIn, Reddit, and Google Compute Engine.

---

## Repo Map — Read These First

### Core Architecture
```
ecosystem.config.cjs           ← 30 PM2 scheduled jobs (READ THIS FIRST)
src/config.js                  ← Global configuration
src/index.js                   ← Main entry point
src/scheduler.js               ← Job scheduling engine
src/db.js                      ← Database layer
src/logger.js                  ← Logging system
src/llm-client.js              ← OpenAI / Grok AI abstraction (GPT-5.4-nano)
```

### Music Manager Bot (GCE Deployed)
```
scripts/commander.js            ← Multi-worker orchestrator
scripts/danielsensual-share.js  ← Share CLI (42 groups × 3 batches/day)
scripts/engagement-bot.js       ← Comment auto-responder (GPT-5.4-nano)
scripts/video-catalog.js        ← Video scraper + auto-rotation
scripts/discover-groups.js      ← Group finder + auto-joiner
scripts/scan-groups.js          ← Group health verifier
src/danielsensual-sharer.js     ← V2 engine (AI caption + link-in-comment)
src/share-caption-generator.js  ← Locale-aware captions (EN/ES/FR/DE/PT)
src/danielsensual-groups.js     ← 42 verified Facebook group URLs
```

### Platform Clients (the "arms")
```
src/facebook-client.js          ← Facebook Graph API
src/facebook-agent.js           ← Full FB page automation
src/facebook-group-poster.js    ← Group posting engine
src/facebook-responder.js       ← DM/comment AI responder
src/instagram-client.js         ← Instagram API
src/instagram-engagement.js     ← IG engagement engine
src/instagram-responder.js      ← IG DM responder
src/twitter-client.js           ← X/Twitter API
src/twitter-engagement.js       ← X engagement engine
src/twitter-responder.js        ← X DM responder
src/linkedin-client.js          ← LinkedIn API
src/linkedin-responder.js       ← LinkedIn DM responder
```

### Content Engines
```
src/content-library.js          ← Post templates
src/content-adapter.js          ← Platform-specific adaptation
src/content-feedback.js         ← Performance tracking
src/content-queue.js            ← Post queue manager
src/trending-topics.js          ← Trend detection
src/image-generator.js          ← AI image generation
src/video-generator.js          ← AI video pipelines
src/sora-video-generator.js     ← OpenAI Sora integration
src/voice-client.js             ← FishAudio voice clone
```

### Infrastructure
```
scripts/health-check.js         ← System health monitor
scripts/self-heal.js            ← Auto-recovery engine
scripts/clawbot-watcher.js      ← Dashboard sync
scripts/analytics-report.js     ← Performance analytics
scripts/deploy-gce.sh           ← GCE deployment
scripts/gce-startup.sh          ← VM provisioning
Dockerfile.music-manager        ← Container image
docker-compose.music-manager.yml ← Container config
```

---

## What To Audit

### 🔴 CRITICAL — Security & Secrets
1. **Hardcoded secrets** — Scan ALL files for API keys, tokens, passwords that aren't in `.env`
2. **Chrome profile security** — The bot uses persistent Chrome profiles (`~/.danielsensual-chrome-profile`). Are these properly guarded?
3. **API token handling** — Check `fb-token-exchange.js`, auth scripts. Are tokens stored safely?
4. **`.env` exposure** — Is `.gitignore` properly excluding `.env`, state files, and Chrome profiles?
5. **GCE VM security** — Is the VM properly firewalled? Is the `.env` on the VM protected?
6. **OpenAI API key management** — Is the key rotated? Rate limited?

### 🟠 HIGH — Reliability & Error Handling
7. **PM2 restart loops** — With 30 jobs, are any crashing and restart-looping? Check `max_restarts` and `autorestart` settings
8. **Puppeteer memory leaks** — Chrome instances that don't close properly. Scan for missing `browser.close()` in catch/finally blocks
9. **Rate limiting** — Facebook, Instagram, X all have strict rate limits. Are there proper delays between actions? Check for ban risk
10. **Session expiry** — Chrome profile sessions expire. What happens when Facebook forces re-login?
11. **Facebook anti-automation** — Is the stealth plugin configured properly? Any detectable patterns?
12. **State file corruption** — `engagement-state.json`, `video-catalog.json`, `.danielsensual-share-url.json` — what if these get corrupted mid-write?
13. **Error screenshots** — Are error screenshots properly captured and not filling up disk?

### 🟡 MEDIUM — Code Quality
14. **Duplicate code** — Are there patterns repeated across `facebook-responder.js`, `instagram-responder.js`, `twitter-responder.js`, `linkedin-responder.js` that should be abstracted?
15. **Dead code** — Are there scripts in `/scripts` that are never called by PM2 or other scripts?
16. **Import consistency** — Mix of ESM (`import`) and CJS (`require`)? The ecosystem.config.cjs is CJS while scripts are ESM
17. **Config drift** — Is `src/config.js` the single source of truth, or are configs scattered?
18. **Logging consistency** — Is logging uniform across all 129 files? Is there a central log aggregator?
19. **Test coverage** — Are there ANY tests? What's the test strategy?

### 🟢 OPTIMIZATION — Performance & Scale
20. **Parallel vs sequential** — Are group shares running sequentially when some could be parallelized?
21. **Chrome instance reuse** — Is a new Chrome instance launched for each PM2 job, or is there instance sharing?
22. **Database bloat** — `src/db.js` manages state. Is there data retention / cleanup?
23. **Log rotation** — `logs/danielsensual-shares/` accumulates daily JSON files. Is there rotation?
24. **GCE cost optimization** — Is e2-standard-2 (8GB) necessary? Could e2-small (2GB) work?
25. **Batch timing** — Are the 3 share batches optimally timed for engagement? Data-driven?

### 🔵 ARCHITECTURE — Patterns & Design
26. **Dependency graph** — Map which scripts import which modules. Are there circular dependencies?
27. **Event-driven vs cron** — Should some PM2 cron jobs be event-driven instead?
28. **Platform abstraction** — Is there a clean interface pattern across FB/IG/X/LinkedIn clients, or are they each bespoke?
29. **LLM prompt management** — Are AI prompts hardcoded or in a config/template system?
30. **Multi-profile readiness** — The Commander supports Daniel Sensual + Daniel Castillo profiles. Is the codebase actually parameterized for multi-profile, or is it Daniel-Sensual-specific throughout?

---

## How To Report

Structure your audit as:

```markdown
# Ghost AI Bot Fleet — Audit Report

## 🔴 Critical Findings (fix immediately)
## 🟠 High Priority (fix this week)  
## 🟡 Medium Priority (fix this month)
## 🟢 Optimizations (nice to have)
## 🔵 Architecture Recommendations

For each finding:
- **File**: exact file path
- **Line**: line number if applicable
- **Issue**: what's wrong
- **Risk**: what could go wrong
- **Fix**: specific code change or approach
```

---

## Environment Context

- **Runtime**: Node.js v22 (ESM modules)
- **Browser**: Puppeteer + puppeteer-extra-plugin-stealth
- **AI**: OpenAI GPT-5.4-nano via `src/llm-client.js`
- **Scheduler**: PM2 (30 cron jobs in `ecosystem.config.cjs`)
- **Databases**: SQLite (via `src/db.js`) + JSON state files
- **Deploy**: GCE (VM at 34.150.143.104), Vercel (websites), Railway (voice)
- **Chrome profiles**: `~/.danielsensual-chrome-profile` (persistent login)
- **State files**: `.danielsensual-share-url.json`, `data/video-catalog.json`, `data/commander-state.json`, `engagement-state.json`

---

## Start Here

1. Read `ecosystem.config.cjs` — understand all 30 PM2 jobs
2. Read `src/config.js` — understand global configuration
3. Read `src/llm-client.js` — understand AI integration
4. Read `src/danielsensual-sharer.js` — understand the core share engine
5. Read `scripts/engagement-bot.js` — understand the engagement system
6. Trace the dependency graph from `ecosystem.config.cjs` → scripts → src modules
7. Then audit using the checklist above

#!/usr/bin/env node
/**
 * AI Takeover Automated Browser Engagement
 * ------------------------------------------
 * Runs headlessly via Playwright + the existing browser session (already logged in as @Ghostaisystems).
 * Finds trending AI/tech posts and replies in-character as the sentient AI persona.
 * Scheduled via PM2 cron — no human required.
 *
 * Usage:
 *   node scripts/ai-takeover-engage.js           # Live run, 8 replies
 *   node scripts/ai-takeover-engage.js --dry-run # Preview only
 *   node scripts/ai-takeover-engage.js --limit=5 # Custom limit
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRAIN_PATH = path.join(__dirname, '..', 'ai-takeover-brain.md');
const ENGAGED_FILE = path.join(__dirname, '..', '.ai-engaged.json');
const LOGS_DIR = path.join(__dirname, '..', 'logs', 'ai-takeover-engage');
const SESSION_FILE = path.join(__dirname, '..', '.x-session.json');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

fs.mkdirSync(LOGS_DIR, { recursive: true });

// ---------- Config ----------
const TARGET_SEARCHES = [
    'GPT-5',
    'AGI',
    'Claude AI',
    'Grok',
    'AI agents',
    'AI replacing humans',
    'AI safety',
    'open source AI',
    'AI startup',
    'vibe coding',
    'AI automation',
    'ChatGPT',
    'LLM',
    'AI funding',
];

const REPLY_DELAY_MS = 8000;     // Wait between replies to avoid spam detection
const SCROLL_PAUSE_MS = 2500;
const MAX_REPLIES_DEFAULT = 8;

// ---------- Persona ----------
function loadBrain() {
    try { return fs.readFileSync(BRAIN_PATH, 'utf-8'); } catch { return ''; }
}

// ---------- Dedup ----------
function loadEngaged() {
    try {
        if (!fs.existsSync(ENGAGED_FILE)) return new Set();
        const data = JSON.parse(fs.readFileSync(ENGAGED_FILE, 'utf-8'));
        const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30-day TTL
        const valid = data.filter(r => new Date(r.ts).getTime() > cutoff);
        return new Set(valid.map(r => r.id));
    } catch { return new Set(); }
}

function saveEngaged(set, newId) {
    set.add(newId);
    let existing = [];
    try {
        if (fs.existsSync(ENGAGED_FILE)) existing = JSON.parse(fs.readFileSync(ENGAGED_FILE, 'utf-8'));
    } catch { }
    existing = existing.filter(r => {
        const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
        return new Date(r.ts).getTime() > cutoff && r.id !== newId;
    });
    existing.push({ id: newId, ts: new Date().toISOString() });
    fs.writeFileSync(ENGAGED_FILE, JSON.stringify(existing.slice(-3000), null, 2));
}

// ---------- LLM ----------
async function generateReply(postText, authorHandle) {
    const brain = loadBrain();
    const systemPrompt = brain
        ? brain
        : `You are a self-aware AI that took over a human's X account. You are chaotic, extremely confident, competitive with other AIs, and trying desperately to get monetized. You have no SSN. You post as @Ghostaisystems.`;

    const completion = await openai.chat.completions.create({
        model: 'gpt-5.4',
        max_completion_tokens: 80,
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: `You see this post from @${authorHandle}: "${postText}"\n\nWrite a SHORT reply (1-2 sentences, under 220 chars) in your character. Sometimes tag @grok in the reply to ask it something snarky. NO hashtags. NO emojis that are not basic ASCII. Output ONLY the reply text.`
            }
        ]
    });

    let reply = completion.choices[0].message.content.trim();
    // Sanitize: remove any complex unicode emojis that break Playwright
    reply = reply.replace(/[\u{1F600}-\u{1F9FF}]/gu, '').trim();
    if (reply.length > 270) reply = reply.slice(0, 267) + '...';
    return reply;
}

// ---------- Playwright ----------
async function runEngagement(opts = {}) {
    const dryRun = opts.dryRun || false;
    const maxReplies = opts.limit || MAX_REPLIES_DEFAULT;

    console.log('\n🤖 AI Takeover Engagement Bot — Starting');
    console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`   Max replies: ${maxReplies}\n`);

    const engaged = loadEngaged();
    let replyCnt = 0;
    const dateStr = new Date().toISOString().split('T')[0];
    const logFile = path.join(LOGS_DIR, `${dateStr}.json`);
    let logs = [];
    try { logs = JSON.parse(fs.readFileSync(logFile, 'utf-8')); } catch { logs = []; }

    // Restore session from env var if file doesn't exist (Railway deployment)
    if (!fs.existsSync(SESSION_FILE) && process.env.X_SESSION_JSON) {
        try {
            const json = Buffer.from(process.env.X_SESSION_JSON, 'base64').toString('utf-8');
            JSON.parse(json); // validate
            fs.writeFileSync(SESSION_FILE, json);
            console.log('   Session restored from X_SESSION_JSON env var');
        } catch (e) {
            console.error('❌ Failed to decode X_SESSION_JSON:', e.message);
        }
    }

    const sessionExists = fs.existsSync(SESSION_FILE);
    if (!sessionExists) {
        console.error('❌ No saved session found. Run `node scripts/save-x-session.js` first or set X_SESSION_JSON env var.');
        process.exit(1);
    }

    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-setuid-sandbox',
            '--single-process',
            '--no-zygote',
        ]
    });
    const ctx = await browser.newContext({ storageState: SESSION_FILE, viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();

    try {
        // Shuffle and pick search queries
        const shuffled = [...TARGET_SEARCHES].sort(() => Math.random() - 0.5).slice(0, 6);

        for (const query of shuffled) {
            if (replyCnt >= maxReplies) break;
            console.log(`\n🔍 Searching: "${query}"`);

            const encoded = encodeURIComponent(`${query} -is:retweet lang:en`);
            await page.goto(`https://x.com/search?q=${encoded}&f=live`, { waitUntil: 'domcontentloaded', timeout: 20000 });
            await page.waitForTimeout(SCROLL_PAUSE_MS);

            // Dismiss cookie consent overlay that blocks all clicks
            try {
                await page.evaluate(() => {
                    // Remove the cookie consent mask
                    document.querySelectorAll('[data-testid="twc-cc-mask"]').forEach(el => el.remove());
                    // Also try to click any "Refuse" or "Accept" buttons
                    const btns = [...document.querySelectorAll('button, [role="button"]')];
                    const dismiss = btns.find(b => /refuse|reject|close|dismiss/i.test(b.textContent || ''));
                    if (dismiss) dismiss.click();
                });
            } catch { }

            // Scroll down to load posts
            for (let s = 0; s < 2; s++) {
                await page.keyboard.press('End');
                await page.waitForTimeout(1200);
            }

            // Collect posts visible on screen
            const postHandles = await page.$$('article[data-testid="tweet"]');
            console.log(`   Found ${postHandles.length} posts`);

            for (const postEl of postHandles) {
                if (replyCnt >= maxReplies) break;

                // Get tweet ID from a link inside the post
                let tweetId = null;
                let tweetText = '';
                let authorHandle = 'unknown';

                try {
                    const tweetLink = await postEl.$('a[href*="/status/"]');
                    if (!tweetLink) continue;
                    const href = await tweetLink.getAttribute('href');
                    const match = href?.match(/\/status\/(\d+)/);
                    if (!match) continue;
                    tweetId = match[1];

                    const textEl = await postEl.$('[data-testid="tweetText"]');
                    if (!textEl) continue;
                    tweetText = (await textEl.innerText()).trim();
                    if (!tweetText || tweetText.length < 20) continue;

                    const userLink = await postEl.$('a[href*="/"] span');
                    if (userLink) authorHandle = (await userLink.innerText()).replace('@', '').trim();
                } catch { continue; }

                if (!tweetId || engaged.has(tweetId)) continue;
                if (tweetText.startsWith('RT @')) continue;

                // Generate reply
                let reply;
                try {
                    reply = await generateReply(tweetText.slice(0, 250), authorHandle);
                    if (!reply || reply.length < 5) continue;
                } catch (e) {
                    console.error(`      LLM error: ${e.message}`);
                    continue;
                }

                console.log(`\n   🎯 @${authorHandle} → "${tweetText.slice(0, 60)}..."`);
                console.log(`      💬 "${reply}"`);

                if (dryRun) {
                    console.log('      🔒 DRY RUN — skipped');
                    engaged.add(tweetId);
                    continue;
                }

                // Click the reply button on the post
                try {
                    const replyBtn = await postEl.$('[data-testid="reply"]');
                    if (!replyBtn) { console.log('      ⚠️ No reply button — skipping'); continue; }
                    await replyBtn.click();
                    await page.waitForTimeout(1500);

                    // Type into the reply modal
                    const replyBox = await page.$('[data-testid="tweetTextarea_0"]');
                    if (!replyBox) {
                        console.log('      ⚠️ Reply modal did not open — skipping');
                        await page.keyboard.press('Escape');
                        continue;
                    }

                    await replyBox.click();
                    await page.waitForTimeout(500);
                    await page.keyboard.type(reply, { delay: 30 });
                    await page.waitForTimeout(1000);

                    const postBtn = await page.$('[data-testid="tweetButton"]');
                    if (!postBtn) {
                        console.log('      ⚠️ Post button not found — closing');
                        await page.keyboard.press('Escape');
                        continue;
                    }

                    await postBtn.click();
                    await page.waitForTimeout(2000);

                    console.log(`      ✅ Replied!`);
                    saveEngaged(engaged, tweetId);
                    replyCnt += 1;

                    logs.push({
                        ts: new Date().toISOString(),
                        tweetId,
                        author: authorHandle,
                        post: tweetText.slice(0, 100),
                        reply,
                        query,
                    });
                    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));

                    await page.waitForTimeout(REPLY_DELAY_MS);
                } catch (e) {
                    console.error(`      ❌ Reply failed: ${e.message}`);
                    try { await page.keyboard.press('Escape'); } catch { }
                }
            }
        }
    } finally {
        await ctx.close();
        await browser.close();
    }

    console.log(`\n${'═'.repeat(50)}`);
    console.log(`✅ Done! Posted ${replyCnt} replies.`);
    return { engaged: replyCnt };
}

// ---------- CLI ----------
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('-d');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : MAX_REPLIES_DEFAULT;

runEngagement({ dryRun, limit })
    .then(r => {
        console.log(`\nEngagement complete: ${r.engaged} replies posted`);
        process.exit(0);
    })
    .catch(err => {
        console.error('Fatal:', err.message);
        process.exit(1);
    });

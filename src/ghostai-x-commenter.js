/**
 * GhostAI X Commenter — Browser-Based Engagement Bot
 *
 * Zero API cost — uses Puppeteer with a persistent Chrome profile.
 * Finds trending AI/tech tweets, generates smart comments via AI,
 * and manages all reply threads.
 *
 * Schedule: ~5–8 comments/hr, 10-hour days (8am–6pm ET)
 * Account: @Ghostaisystems
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();
puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_DATA_DIR = path.join(process.env.HOME, '.ghostai-x-chrome-profile');
const LOGS_DIR = path.join(__dirname, '..', 'logs', 'x-commenter');
const ENGAGED_FILE = path.join(__dirname, '..', '.x-commenter-engaged.json');

// ── Config ───────────────────────────────────────────────────────
const CONFIG = {
    schedule: {
        startHour: 8,        // 8 AM ET
        endHour: 18,         // 6 PM ET
        timezone: 'America/New_York',
    },
    engagement: {
        commentsPerCycle: 3,             // comments per cycle
        cycleLengthMinutes: 30,          // run every 30 min = ~6 comments/hr
        minDelayBetweenCommentsSec: 45,  // minimum gap between comments
        maxDelayBetweenCommentsSec: 120, // max gap (human-like cadence)
        replyCheckInterval: 15,          // check for replies to our comments every 15 min
    },
    topics: [
        'AI agents',
        'AI automation',
        'voice AI',
        'AI web development',
        'AI SaaS',
        'GPT',
        'Claude',
        'Gemini AI',
        'AI startup',
        'build in public AI',
        'AI agency',
        'no-code AI',
        'AI video',
        'AI business',
    ],
    brand: {
        handle: '@Ghostaisystems',
        name: 'Ghost AI Systems',
        website: 'ghostaisystems.com',
        personality: `You are Ghost — a sharp, no-BS AI agency founder who builds AI websites in 72 hours and ships voice agents. 
You're commenting on X (Twitter). Your tone is: confident, direct, occasionally witty, never corporate.
Rules:
- Keep comments 1-3 sentences max
- Add genuine value or a hot take — never generic "Great post!"
- Reference specific details from the tweet
- Occasionally mention what you build (AI websites, voice agents) but NEVER hard-sell
- Use emojis sparingly (max 1)
- No hashtags in comments
- Sound like a real human, not a bot
- Match the energy of the original tweet (technical → technical, casual → casual)`,
    },
};

// ── Helpers ───────────────────────────────────────────────────────

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function randomDelay(minSec, maxSec) {
    const ms = Math.floor(Math.random() * (maxSec - minSec + 1) * 1000) + minSec * 1000;
    return new Promise(r => setTimeout(r, ms));
}

function getETHour() {
    return parseInt(new Date().toLocaleString('en-US', {
        timeZone: CONFIG.schedule.timezone,
        hour: 'numeric',
        hour12: false,
    }));
}

function getETTime() {
    return new Date().toLocaleString('en-US', {
        timeZone: CONFIG.schedule.timezone,
        dateStyle: 'short',
        timeStyle: 'medium',
    });
}

function log(msg) {
    console.log(`${getETTime()}: ${msg}`);
}

function logEngagement(entry) {
    ensureDir(LOGS_DIR);
    const dateStr = new Date().toISOString().split('T')[0];
    const logFile = path.join(LOGS_DIR, `${dateStr}.json`);
    let logs = [];
    if (fs.existsSync(logFile)) {
        try { logs = JSON.parse(fs.readFileSync(logFile, 'utf-8')); } catch { /**/ }
    }
    logs.push({ timestamp: new Date().toISOString(), ...entry });
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
}

function loadEngaged() {
    try {
        if (fs.existsSync(ENGAGED_FILE)) {
            const data = JSON.parse(fs.readFileSync(ENGAGED_FILE, 'utf-8'));
            // Prune entries older than 7 days
            const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
            return data.filter(e => new Date(e.timestamp).getTime() > cutoff);
        }
    } catch { /**/ }
    return [];
}

function saveEngaged(entries) {
    fs.writeFileSync(ENGAGED_FILE, JSON.stringify(entries.slice(-500), null, 2));
}

function isAlreadyEngaged(tweetUrl, engaged) {
    return engaged.some(e => e.tweetUrl === tweetUrl);
}

// ── AI Comment Generator ─────────────────────────────────────────

async function generateComment(tweetText, tweetAuthor) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
        model: process.env.GHOST_MODEL || 'gpt-4o-mini',
        messages: [
            { role: 'system', content: CONFIG.brand.personality },
            {
                role: 'user',
                content: `Generate a reply to this tweet by @${tweetAuthor}:\n\n"${tweetText}"\n\nReply (1-3 sentences, no hashtags, sound human):`,
            },
        ],
        temperature: 0.8,
        max_tokens: 150,
    });

    let comment = response.choices[0].message.content.trim();
    // Strip wrapping quotes if AI added them
    if ((comment.startsWith('"') && comment.endsWith('"')) || (comment.startsWith("'") && comment.endsWith("'"))) {
        comment = comment.slice(1, -1);
    }
    return comment;
}

// ── Browser Session ──────────────────────────────────────────────

async function launchBrowser(headless = true) {
    return puppeteer.launch({
        headless: headless ? 'new' : false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--user-data-dir=${USER_DATA_DIR}`,
            '--disable-notifications',
            '--disable-blink-features=AutomationControlled',
        ],
        defaultViewport: { width: 1280, height: 900 },
        protocolTimeout: 60000,
    });
}

async function verifyLogin(page) {
    await page.goto('https://x.com/home', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    const url = page.url();
    if (url.includes('/login') || url.includes('/i/flow/login')) {
        return false;
    }

    // Check for the compose tweet button as a sign we're logged in
    try {
        await page.waitForSelector('[data-testid="SideNav_NewTweet_Button"], [data-testid="tweetTextarea_0"], a[href="/compose/post"]', { timeout: 8000 });
        return true;
    } catch {
        return false;
    }
}

// ── Tweet Discovery ──────────────────────────────────────────────

async function findTweets(page, topic) {
    const searchQuery = encodeURIComponent(`${topic} min_faves:50 -filter:replies lang:en`);
    const url = `https://x.com/search?q=${searchQuery}&src=typed_query&f=top`;

    log(`   🔍 Searching: "${topic}"`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    // Scroll once to load more tweets
    await page.evaluate(() => window.scrollBy(0, 800));
    await new Promise(r => setTimeout(r, 1500));

    const tweets = await page.evaluate(() => {
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        const results = [];

        for (const article of articles) {
            try {
                // Get tweet text
                const textEl = article.querySelector('[data-testid="tweetText"]');
                if (!textEl) continue;
                const text = textEl.innerText.trim();
                if (!text || text.length < 20) continue;

                // Get author handle
                const handleEl = article.querySelector('a[role="link"][href*="/"] span');
                const authorLinks = article.querySelectorAll('a[role="link"]');
                let author = '';
                for (const link of authorLinks) {
                    const href = link.getAttribute('href') || '';
                    if (href.match(/^\/[a-zA-Z0-9_]+$/) && !href.includes('/search') && !href.includes('/explore')) {
                        author = href.replace('/', '');
                        break;
                    }
                }

                // Get tweet link (for deduplication)
                let tweetUrl = '';
                const timeLink = article.querySelector('a[href*="/status/"] time');
                if (timeLink) {
                    tweetUrl = timeLink.closest('a')?.getAttribute('href') || '';
                }

                // Get engagement metrics
                const likeBtn = article.querySelector('[data-testid="like"] span, [data-testid="unlike"] span');
                const likes = parseInt(likeBtn?.textContent?.replace(/[^0-9]/g, '') || '0');

                const replyBtn = article.querySelector('[data-testid="reply"] span');
                const replies = parseInt(replyBtn?.textContent?.replace(/[^0-9]/g, '') || '0');

                if (author.toLowerCase() === 'ghostaisystems') continue; // Don't reply to ourselves

                results.push({ text, author, tweetUrl, likes, replies });
            } catch { /**/ }
        }

        return results;
    });

    // Prefer tweets with good engagement but not too many replies (our comment can stand out)
    return tweets
        .filter(t => t.likes >= 10 && t.replies < 200)
        .sort((a, b) => b.likes - a.likes)
        .slice(0, 10);
}

// ── Comment Posting ──────────────────────────────────────────────

async function postComment(page, tweetUrl, commentText) {
    const fullUrl = tweetUrl.startsWith('http') ? tweetUrl : `https://x.com${tweetUrl}`;
    await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    // Click the reply field
    const replyBox = await page.waitForSelector(
        '[data-testid="tweetTextarea_0"]',
        { timeout: 10000 }
    );

    await replyBox.click();
    await new Promise(r => setTimeout(r, 500));

    // Type the comment with human-like delay
    for (const char of commentText) {
        await page.keyboard.type(char, { delay: Math.floor(Math.random() * 30) + 10 });
    }
    await new Promise(r => setTimeout(r, 1000));

    // Click Reply button
    const replyButton = await page.waitForSelector(
        '[data-testid="tweetButtonInline"]',
        { timeout: 5000 }
    );
    await replyButton.click();
    await new Promise(r => setTimeout(r, 3000));

    return true;
}

// ── Reply Manager ────────────────────────────────────────────────

async function checkAndReplyToResponses(page) {
    log('📫 Checking for replies to our comments...');

    // Go to notifications
    await page.goto('https://x.com/notifications/mentions', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    const mentions = await page.evaluate(() => {
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        const results = [];

        for (const article of articles) {
            try {
                const textEl = article.querySelector('[data-testid="tweetText"]');
                if (!textEl) continue;

                const authorLinks = article.querySelectorAll('a[role="link"]');
                let author = '';
                for (const link of authorLinks) {
                    const href = link.getAttribute('href') || '';
                    if (href.match(/^\/[a-zA-Z0-9_]+$/) && !href.includes('/search')) {
                        author = href.replace('/', '');
                        break;
                    }
                }

                let tweetUrl = '';
                const timeLink = article.querySelector('a[href*="/status/"] time');
                if (timeLink) {
                    tweetUrl = timeLink.closest('a')?.getAttribute('href') || '';
                }

                if (author.toLowerCase() === 'ghostaisystems') continue;

                results.push({
                    text: textEl.innerText.trim(),
                    author,
                    tweetUrl,
                });
            } catch { /**/ }
        }

        return results.slice(0, 5); // Only handle latest 5 mentions
    });

    const engaged = loadEngaged();
    let repliedCount = 0;

    for (const mention of mentions) {
        if (!mention.tweetUrl || isAlreadyEngaged(mention.tweetUrl, engaged)) continue;

        try {
            const comment = await generateComment(mention.text, mention.author);
            log(`   💬 Replying to @${mention.author}: "${comment.slice(0, 60)}..."`);

            await postComment(page, mention.tweetUrl, comment);

            engaged.push({
                tweetUrl: mention.tweetUrl,
                author: mention.author,
                type: 'reply-to-mention',
                comment: comment.slice(0, 100),
                timestamp: new Date().toISOString(),
            });
            logEngagement({ type: 'reply-to-mention', author: mention.author, comment });
            repliedCount++;

            await randomDelay(30, 60);
        } catch (err) {
            log(`   ❌ Failed to reply to @${mention.author}: ${err.message}`);
        }
    }

    saveEngaged(engaged);
    log(`   📫 Replied to ${repliedCount}/${mentions.length} mentions`);
    return repliedCount;
}

// ── Main Engagement Cycle ────────────────────────────────────────

async function runEngagementCycle(page) {
    const engaged = loadEngaged();
    const topic = CONFIG.topics[Math.floor(Math.random() * CONFIG.topics.length)];
    let commented = 0;

    try {
        const tweets = await findTweets(page, topic);
        log(`   📋 Found ${tweets.length} tweets for "${topic}"`);

        for (const tweet of tweets) {
            if (commented >= CONFIG.engagement.commentsPerCycle) break;
            if (!tweet.tweetUrl || isAlreadyEngaged(tweet.tweetUrl, engaged)) continue;

            try {
                const comment = await generateComment(tweet.text, tweet.author);
                log(`   💬 @${tweet.author} (❤️${tweet.likes}): "${comment.slice(0, 70)}..."`);

                await postComment(page, tweet.tweetUrl, comment);

                engaged.push({
                    tweetUrl: tweet.tweetUrl,
                    author: tweet.author,
                    type: 'proactive-comment',
                    topic,
                    comment: comment.slice(0, 100),
                    timestamp: new Date().toISOString(),
                });
                logEngagement({
                    type: 'proactive-comment',
                    topic,
                    author: tweet.author,
                    likes: tweet.likes,
                    comment,
                });
                commented++;

                // Human-like spacing between comments
                if (commented < CONFIG.engagement.commentsPerCycle) {
                    const delay = CONFIG.engagement.minDelayBetweenCommentsSec +
                        Math.random() * (CONFIG.engagement.maxDelayBetweenCommentsSec - CONFIG.engagement.minDelayBetweenCommentsSec);
                    log(`   ⏳ Waiting ${Math.round(delay)}s before next comment...`);
                    await new Promise(r => setTimeout(r, delay * 1000));
                }
            } catch (err) {
                log(`   ❌ Failed to comment on @${tweet.author}: ${err.message}`);
            }
        }
    } catch (err) {
        log(`   ❌ Search failed for "${topic}": ${err.message}`);
    }

    saveEngaged(engaged);
    return commented;
}

// ── Main Loop ────────────────────────────────────────────────────

async function main() {
    console.log(`\n══════════════════════════════════════════════════════════`);
    console.log(`🤖 GhostAI X Commenter — Browser Engagement Bot`);
    console.log(`   Account: ${CONFIG.brand.handle}`);
    console.log(`   Schedule: ${CONFIG.schedule.startHour}AM–${CONFIG.schedule.endHour % 12 || 12}PM ET`);
    console.log(`   Rate: ~${CONFIG.engagement.commentsPerCycle} comments/${CONFIG.engagement.cycleLengthMinutes}min`);
    console.log(`   Topics: ${CONFIG.topics.length} AI/tech topics`);
    console.log(`   API cost: $0 (browser automation)`);
    console.log(`══════════════════════════════════════════════════════════\n`);

    const browser = await launchBrowser(process.argv.includes('--visible') ? false : true);

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

        // Verify login
        log('🔐 Verifying X login...');
        const loggedIn = await verifyLogin(page);
        if (!loggedIn) {
            log('❌ Not logged in to X. Run with --visible flag to log in manually:');
            log('   node src/ghostai-x-commenter.js --visible');
            await browser.close();
            process.exit(1);
        }
        log('✅ Logged in to X as @Ghostaisystems');

        // Main loop
        let cycleCount = 0;
        while (true) {
            const hour = getETHour();

            if (hour < CONFIG.schedule.startHour || hour >= CONFIG.schedule.endHour) {
                log(`😴 Outside business hours (${hour}:00 ET) — sleeping 30min`);
                await new Promise(r => setTimeout(r, 30 * 60 * 1000));
                continue;
            }

            cycleCount++;
            console.log(`\n────────────────────────────────────────`);
            log(`🔄 Cycle #${cycleCount}`);
            console.log(`────────────────────────────────────────\n`);

            // Every other cycle, check mentions/replies first
            if (cycleCount % 2 === 0) {
                try {
                    await checkAndReplyToResponses(page);
                } catch (err) {
                    log(`❌ Reply check failed: ${err.message}`);
                }
            }

            // Main engagement
            const commented = await runEngagementCycle(page);
            const todayLog = path.join(LOGS_DIR, `${new Date().toISOString().split('T')[0]}.json`);
            let totalToday = 0;
            if (fs.existsSync(todayLog)) {
                try { totalToday = JSON.parse(fs.readFileSync(todayLog, 'utf-8')).length; } catch { /**/ }
            }

            log(`📊 Cycle #${cycleCount}: ${commented} comments | Today total: ${totalToday}`);
            log(`⏳ Next cycle in ${CONFIG.engagement.cycleLengthMinutes} minutes...\n`);

            await new Promise(r => setTimeout(r, CONFIG.engagement.cycleLengthMinutes * 60 * 1000));
        }
    } catch (err) {
        console.error('Fatal error:', err);
    } finally {
        await browser.close();
    }
}

main().catch(console.error);

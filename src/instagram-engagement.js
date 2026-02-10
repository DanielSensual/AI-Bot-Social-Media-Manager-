/**
 * Instagram Outbound Engagement Bot
 * Uses Instagram web automation to discover posts and leave strategic comments.
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { hasLLMProvider, generateText } from './llm-client.js';
import {
    normalizeLimit,
    loadEngagedRecords,
    pruneEngagedRecords,
    serializeEngagedRecords,
    sleep,
} from './twitter-engagement-utils.js';

dotenv.config();
puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, '..', 'logs', 'instagram-engagement');
const ENGAGED_FILE = path.join(__dirname, '..', '.ig-engaged.json');
const SESSION_FILE = path.join(__dirname, '..', '.instagram-session.json');

const LIMIT_DEFAULTS = {
    defaultValue: 10,
    min: 1,
    max: 30,
};

const MAX_ENGAGED_RECORDS = 5000;
const DEDUPE_TTL_DAYS = 45;

const TARGET_HASHTAGS = [
    'ai',
    'artificialintelligence',
    'machinelearning',
    'aiautomation',
    'saas',
    'webdevelopment',
    'startup',
    'smallbusiness',
];

const TARGET_ACCOUNTS = [
    'openai',
    'anthropicai',
    'googledeepmind',
    'mistralai',
    'huggingface',
];

const GRAPH_API_BASE = 'https://graph.facebook.com/v24.0';

fs.mkdirSync(LOGS_DIR, { recursive: true });

function shuffle(array = []) {
    const clone = [...array];
    for (let i = clone.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [clone[i], clone[j]] = [clone[j], clone[i]];
    }
    return clone;
}

function loadEngaged(now = new Date()) {
    try {
        const raw = fs.existsSync(ENGAGED_FILE)
            ? fs.readFileSync(ENGAGED_FILE, 'utf-8')
            : '[]';
        const parsed = loadEngagedRecords(raw, now);
        return pruneEngagedRecords(parsed, DEDUPE_TTL_DAYS, MAX_ENGAGED_RECORDS, now);
    } catch {
        return [];
    }
}

function saveEngaged(records, now = new Date()) {
    const pruned = pruneEngagedRecords(records, DEDUPE_TTL_DAYS, MAX_ENGAGED_RECORDS, now);
    fs.writeFileSync(ENGAGED_FILE, serializeEngagedRecords(pruned));
}

function appendLog(entry) {
    const now = new Date();
    const logFile = path.join(LOGS_DIR, `${now.toISOString().split('T')[0]}.json`);

    let logs = [];
    try {
        if (fs.existsSync(logFile)) {
            logs = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
            if (!Array.isArray(logs)) logs = [];
        }
    } catch {
        logs = [];
    }

    logs.push({
        timestamp: now.toISOString(),
        ...entry,
    });

    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
}

function getCredentials() {
    const username = String(process.env.INSTAGRAM_USERNAME || '').trim();
    const password = String(process.env.INSTAGRAM_PASSWORD || '').trim();
    return {
        username,
        password,
        hasCreds: Boolean(username && password),
    };
}

function normalizePostHref(href) {
    if (!href || typeof href !== 'string') return null;
    const cleaned = href.trim().split('?')[0];
    if (!/^\/(p|reel)\//.test(cleaned)) return null;
    return `https://www.instagram.com${cleaned}`;
}

function postIdFromUrl(url) {
    if (!url) return null;
    const parts = url.split('/').filter(Boolean);
    return parts[parts.length - 1] || null;
}

async function dismissPopups(page) {
    await page.evaluate(() => {
        const candidates = [
            ...document.querySelectorAll('button'),
            ...document.querySelectorAll('[role="button"]'),
        ];
        const labels = new Set(['not now', 'cancel', 'skip']);
        for (const button of candidates) {
            const text = (button.textContent || '').trim().toLowerCase();
            if (labels.has(text)) {
                button.click();
            }
        }
    }).catch(() => { });
}

async function isLoggedIn(page) {
    return page.evaluate(() => {
        const loginInput = document.querySelector(
            'input[name="username"], input[name="email"], input[name="password"], input[name="pass"]',
        );
        if (loginInput) return false;

        const url = window.location.pathname || '';
        if (url.startsWith('/accounts/login')) return false;

        return true;
    }).catch(() => false);
}

async function saveSession(page) {
    const cookies = await page.cookies();
    fs.writeFileSync(SESSION_FILE, JSON.stringify(cookies, null, 2));
}

async function restoreSession(page) {
    if (!fs.existsSync(SESSION_FILE)) return false;

    try {
        const cookies = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
        if (!Array.isArray(cookies) || cookies.length === 0) return false;
        await page.setCookie(...cookies);
        return true;
    } catch {
        return false;
    }
}

async function loginIfNeeded(page, options = {}) {
    const {
        headless = true,
        manualLogin = false,
    } = options;

    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await dismissPopups(page);

    if (await isLoggedIn(page)) {
        console.log(`   ℹ️ Login check passed via existing session (${page.url()})`);
        return true;
    }

    const restored = await restoreSession(page);
    if (restored) {
        console.log('   ℹ️ Restored Instagram session cookies');
        await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await dismissPopups(page);
        if (await isLoggedIn(page)) {
            console.log(`   ℹ️ Login check passed after cookie restore (${page.url()})`);
            return true;
        }
    }

    const creds = getCredentials();
    if (creds.hasCreds) {
        await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle2', timeout: 90000 });

        const usernameSelectorCandidates = [
            'input[name="username"]',
            'input[name="email"]',
            'input[aria-label*="username" i]',
            'input[aria-label*="email" i]',
            'input[aria-label*="mobile number" i]',
        ];
        const passwordSelectorCandidates = [
            'input[name="password"]',
            'input[name="pass"]',
            'input[type="password"]',
        ];

        let usernameSelector = null;
        for (const candidate of usernameSelectorCandidates) {
            const handle = await page.$(candidate);
            if (handle) {
                usernameSelector = candidate;
                break;
            }
        }

        let passwordSelector = null;
        for (const candidate of passwordSelectorCandidates) {
            const handle = await page.$(candidate);
            if (handle) {
                passwordSelector = candidate;
                break;
            }
        }

        if (!usernameSelector || !passwordSelector) {
            throw new Error('Unable to locate Instagram login inputs');
        }

        await page.focus(usernameSelector);
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        await page.keyboard.type(creds.username, { delay: 35 });

        await page.focus(passwordSelector);
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        await page.keyboard.type(creds.password, { delay: 35 });

        await page.keyboard.press('Enter');
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
        await sleep(2000);

        await dismissPopups(page);
        if (await isLoggedIn(page)) {
            console.log(`   ℹ️ Login check passed after credential submit (${page.url()})`);
            await saveSession(page);
            return true;
        }
        console.log(`   ⚠️ Credential submit did not produce logged-in state (${page.url()})`);
    }

    if (!headless && manualLogin) {
        console.log('🔐 Manual Instagram login required. Complete login in browser window...');

        const waitUntil = Date.now() + (3 * 60 * 1000);
        while (Date.now() < waitUntil) {
            if (await isLoggedIn(page)) {
                await saveSession(page);
                return true;
            }
            await sleep(2000);
        }
    }

    return false;
}

async function collectPostUrls(page, discoveryLimit = 60) {
    return page.evaluate((limit) => {
        const links = new Set();
        const anchors = [...document.querySelectorAll('a[href]')];
        for (const anchor of anchors) {
            const href = anchor.getAttribute('href');
            if (!href) continue;
            if (!/^\/(p|reel)\//.test(href)) continue;
            links.add(href.split('?')[0]);
            if (links.size >= limit) break;
        }
        return [...links];
    }, discoveryLimit).catch(() => []);
}

async function collectTargets(page, engagedIds, options = {}) {
    const {
        hashtags = TARGET_HASHTAGS,
        accounts = TARGET_ACCOUNTS,
        hashtagCount = 4,
        accountCount = 3,
        discoveryLimit = 60,
    } = options;

    const targets = [];
    const seenUrls = new Set();

    const chosenHashtags = shuffle(hashtags).slice(0, hashtagCount);
    const chosenAccounts = shuffle(accounts).slice(0, accountCount);

    for (const tag of chosenHashtags) {
        const url = `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`;
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForSelector('a[href]', { timeout: 20000 });
            const links = await collectPostUrls(page, discoveryLimit);
            for (const link of links) {
                const fullUrl = normalizePostHref(link);
                if (!fullUrl || seenUrls.has(fullUrl)) continue;

                const id = postIdFromUrl(fullUrl);
                if (!id || engagedIds.has(id)) continue;

                seenUrls.add(fullUrl);
                targets.push({ id, url: fullUrl, source: `#${tag}` });
            }
        } catch {
            // Keep run resilient and continue on discovery failures.
        }
        await sleep(1200 + Math.round(Math.random() * 900));
    }

    for (const username of chosenAccounts) {
        const url = `https://www.instagram.com/${encodeURIComponent(username)}/`;
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForSelector('a[href]', { timeout: 20000 });
            const links = await collectPostUrls(page, discoveryLimit);
            for (const link of links) {
                const fullUrl = normalizePostHref(link);
                if (!fullUrl || seenUrls.has(fullUrl)) continue;

                const id = postIdFromUrl(fullUrl);
                if (!id || engagedIds.has(id)) continue;

                seenUrls.add(fullUrl);
                targets.push({ id, url: fullUrl, source: `@${username}` });
            }
        } catch {
            // Keep run resilient and continue on discovery failures.
        }
        await sleep(1200 + Math.round(Math.random() * 900));
    }

    return targets;
}

async function graphGet(url) {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(20000),
    });
    return response.json();
}

async function resolveGraphContext() {
    const baseToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN;
    if (!baseToken) return null;

    const me = await graphGet(`${GRAPH_API_BASE}/me?fields=id,name&access_token=${encodeURIComponent(baseToken)}`);
    if (!me?.id || me?.error) return null;

    let pageId = me.id;
    let pageToken = baseToken;

    const pageCheck = await graphGet(`${GRAPH_API_BASE}/${me.id}?fields=category&access_token=${encodeURIComponent(baseToken)}`);
    if (pageCheck?.error || !pageCheck?.category) {
        const pages = await graphGet(`${GRAPH_API_BASE}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(baseToken)}`);
        const page = pages?.data?.[0];
        if (!page?.id || !page?.access_token) return null;
        pageId = page.id;
        pageToken = page.access_token;
    }

    const ig = await graphGet(`${GRAPH_API_BASE}/${pageId}?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(pageToken)}`);
    const igId = ig?.instagram_business_account?.id;
    if (!igId) return null;

    return {
        pageId,
        pageToken,
        igId,
    };
}

async function collectTargetsFromGraphApi(engagedIds, options = {}) {
    const {
        hashtags = TARGET_HASHTAGS,
        hashtagCount = 4,
        perTagLimit = 15,
    } = options;

    try {
        const context = await resolveGraphContext();
        if (!context) return [];

        const chosenHashtags = shuffle(hashtags).slice(0, hashtagCount);
        const results = [];
        const seen = new Set();

        for (const tag of chosenHashtags) {
            const search = await graphGet(
                `${GRAPH_API_BASE}/ig_hashtag_search?user_id=${context.igId}&q=${encodeURIComponent(tag)}&access_token=${encodeURIComponent(context.pageToken)}`,
            );
            const hashtagId = search?.data?.[0]?.id;
            if (!hashtagId) continue;

            const media = await graphGet(
                `${GRAPH_API_BASE}/${hashtagId}/recent_media?user_id=${context.igId}&fields=id,caption,media_type,comments_count,like_count,timestamp,permalink&limit=${perTagLimit}&access_token=${encodeURIComponent(context.pageToken)}`,
            );

            for (const item of media?.data || []) {
                const id = String(item?.id || '').trim();
                const permalink = String(item?.permalink || '').trim();
                if (!id || !permalink) continue;
                if (!/instagram\.com\/(p|reel)\//i.test(permalink)) continue;
                if (engagedIds.has(id) || seen.has(id)) continue;

                const score = (Number(item?.comments_count || 0) * 12) + Number(item?.like_count || 0);
                seen.add(id);
                results.push({
                    id,
                    url: permalink,
                    source: `#${tag}`,
                    score,
                });
            }
        }

        return results.sort((a, b) => b.score - a.score);
    } catch {
        return [];
    }
}

async function extractPostContext(page) {
    return page.evaluate(() => {
        const author = document.querySelector('article header a')?.textContent?.trim() || 'unknown';
        const caption = document.querySelector('article h1')?.textContent?.trim()
            || document.querySelector('meta[property="og:description"]')?.getAttribute('content')
            || '';
        return {
            author,
            caption: caption.slice(0, 900),
        };
    }).catch(() => ({
        author: 'unknown',
        caption: '',
    }));
}

async function generateOutboundComment(context) {
    const fallback = `Strong take. Curious what result moved the most for you here?`;

    if (!hasLLMProvider()) {
        return fallback;
    }

    const prompt = `You are commenting on an Instagram post as Ghost AI Systems.

Author: @${context.author}
Post text:
${context.caption || '[No caption extracted]'}

Write one concise, high-signal comment:
1. 1 sentence only (max 180 chars)
2. Sound human, confident, and constructive
3. Add one thoughtful question when possible
4. No hashtags, no links, no emojis spam
5. Do not mention being AI`;

    try {
        const { text } = await generateText({
            prompt,
            maxOutputTokens: 90,
            openaiModel: 'gpt-5.2',
            geminiModel: process.env.GEMINI_MODEL || 'gemini-3-pro-preview',
        });

        const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
        if (!cleaned) return fallback;
        if (cleaned.length <= 180) return cleaned;
        return `${cleaned.slice(0, 177)}...`;
    } catch {
        return fallback;
    }
}

async function submitComment(page, comment, dryRun = false) {
    const composerSelector = [
        'textarea[aria-label*="comment" i]',
        'textarea[placeholder*="comment" i]',
        'form textarea',
    ];

    let selector = null;
    for (const candidate of composerSelector) {
        const exists = await page.$(candidate);
        if (exists) {
            selector = candidate;
            break;
        }
    }

    if (!selector) {
        return { ok: false, reason: 'No comment composer found' };
    }

    if (dryRun) {
        return { ok: true, reason: 'dry-run' };
    }

    const safeSelector = selector;

    await page.evaluate((sel) => {
        const field = document.querySelector(sel);
        if (field) field.focus();
    }, safeSelector);

    await page.evaluate(
        ({ sel, text }) => {
            const field = document.querySelector(sel);
            if (!field) return false;
            field.value = '';
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.value = text;
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        },
        { sel: safeSelector, text: comment },
    );

    const clicked = await page.evaluate(() => {
        const forms = [...document.querySelectorAll('form')];
        for (const form of forms) {
            const textarea = form.querySelector('textarea');
            if (!textarea) continue;
            const submit = form.querySelector('button[type="submit"]');
            if (submit && !submit.disabled) {
                submit.click();
                return true;
            }
        }

        const buttons = [...document.querySelectorAll('button')];
        const candidate = buttons.find(button => {
            const text = (button.textContent || '').trim().toLowerCase();
            return ['post', 'publish', 'share', 'publicar'].includes(text) && !button.disabled;
        });
        if (candidate) {
            candidate.click();
            return true;
        }

        return false;
    });

    if (!clicked) {
        const fallbackSubmit = await page.evaluate((sel) => {
            const field = document.querySelector(sel);
            if (!field) return false;
            const form = field.closest('form');
            if (!form) return false;
            form.requestSubmit?.();
            return true;
        }, safeSelector);

        if (!fallbackSubmit) {
            return { ok: false, reason: 'Unable to submit comment' };
        }
    }

    await sleep(3500);
    return { ok: true };
}

export async function runInstagramOutboundEngagement(options = {}) {
    const dryRun = Boolean(options.dryRun);
    const limit = normalizeLimit(options.limit, LIMIT_DEFAULTS);
    const headless = options.headless ?? true;
    const manualLogin = Boolean(options.manualLogin);

    console.log('');
    console.log('📈 Instagram Outbound Engagement Bot');
    console.log('══════════════════════════════════════════════════');
    console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`   Max engagements: ${limit}`);
    console.log(`   Browser: ${headless ? 'headless' : 'headful'}`);
    console.log('');

    const browser = await puppeteer.launch({
        headless,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1440,900',
        ],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    await page.setViewport({ width: 1440, height: 900 });

    try {
        const loggedIn = await loginIfNeeded(page, { headless, manualLogin });
        if (!loggedIn) {
            throw new Error(
                'Instagram login failed. Set INSTAGRAM_USERNAME/INSTAGRAM_PASSWORD or run with --headful --manual-login once.',
            );
        }

        const engagedRecords = loadEngaged();
        const engagedIds = new Set(engagedRecords.map(record => record.id));

        console.log('🔍 Discovering outbound engagement targets...');
        const webTargets = await collectTargets(page, engagedIds);
        console.log(`   Found ${webTargets.length} web candidate post(s)`);

        const graphTargets = await collectTargetsFromGraphApi(engagedIds);
        if (graphTargets.length > 0) {
            console.log(`   Found ${graphTargets.length} graph candidate post(s)`);
        }

        const targetMap = new Map();
        for (const target of [...webTargets, ...graphTargets]) {
            if (!target?.id || !target?.url) continue;
            if (!targetMap.has(target.id)) {
                targetMap.set(target.id, target);
            }
        }

        const targets = [...targetMap.values()];
        console.log(`   📋 ${targets.length} total targets`);

        const selected = targets.slice(0, Math.max(limit * 2, limit));
        let engaged = 0;

        for (const target of selected) {
            if (engaged >= limit) break;

            try {
                await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                await dismissPopups(page);
                await sleep(1600 + Math.round(Math.random() * 1000));

                const context = await extractPostContext(page);
                const comment = await generateOutboundComment(context);

                console.log(`   🎯 ${target.source} ${target.url}`);
                console.log(`      💬 "${comment.substring(0, 120)}${comment.length > 120 ? '...' : ''}"`);

                const result = await submitComment(page, comment, dryRun);
                if (!result.ok) {
                    console.log(`      ⚠️ Skipped: ${result.reason}`);
                    appendLog({
                        url: target.url,
                        source: target.source,
                        status: 'skipped',
                        reason: result.reason,
                        author: context.author,
                    });
                    continue;
                }

                engaged += 1;
                engagedRecords.push({
                    id: target.id,
                    engagedAt: new Date().toISOString(),
                });
                engagedIds.add(target.id);

                appendLog({
                    url: target.url,
                    source: target.source,
                    status: dryRun ? 'dry-run' : 'engaged',
                    author: context.author,
                    comment,
                });

                console.log(`      ✅ ${dryRun ? 'Dry-run recorded' : 'Comment posted'}`);
                await sleep(5500 + Math.round(Math.random() * 5500));
            } catch (error) {
                console.log(`      ❌ Failed: ${error.message}`);
                appendLog({
                    url: target.url,
                    source: target.source,
                    status: 'error',
                    reason: error.message,
                });
                await sleep(1500);
            }
        }

        saveEngaged(engagedRecords);

        console.log('');
        console.log('══════════════════════════════════════════════════');
        console.log(`✅ Done! Engaged with ${engaged} post(s)`);

        return {
            engaged,
            candidates: targets.length,
        };
    } finally {
        await page.close().catch(() => { });
        await browser.close().catch(() => { });
    }
}

export default {
    runInstagramOutboundEngagement,
};

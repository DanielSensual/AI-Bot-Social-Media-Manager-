/**
 * Music Manager Bot — Facebook Group Video Sharer (V2)
 *
 * V2 Upgrades:
 * - AI-generated unique captions per group (GPT)
 * - Video URL posted in comment, not body (cleaner engagement)
 * - @everyone tag for maximum reach
 * - Locale-aware language (EN/ES/FR/DE)
 * - Spotify + Apple Music streaming links in comment
 *
 * Uses puppeteer-extra + stealth plugin with a persistent Chrome session.
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { generateGroupCaption, generateStreamingComment, detectLocale } from './share-caption-generator.js';
import { recordGroupFailure, recordGroupShare } from './danielsensual-groups.js';

dotenv.config();
puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_USER_DATA_DIR = path.join(process.env.HOME || '/root', '.danielsensual-chrome-profile');
const LOGS_DIR = path.join(__dirname, '..', 'logs', 'danielsensual-shares');
let activeLockFile = null;

// ─── Helpers ─────────────────────────────────────────────────────

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function randomDelay(minMs, maxMs) {
    const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise(r => setTimeout(r, ms));
}

function timestamp() {
    return new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York',
        dateStyle: 'short',
        timeStyle: 'medium',
    });
}

function logResult(entry) {
    ensureDir(LOGS_DIR);
    const dateStr = new Date().toISOString().split('T')[0];
    const logFile = path.join(LOGS_DIR, `${dateStr}.json`);

    let logs = [];
    if (fs.existsSync(logFile)) {
        try { logs = JSON.parse(fs.readFileSync(logFile, 'utf-8')); } catch { /* fresh */ }
    }
    logs.push({ timestamp: new Date().toISOString(), ...entry });
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
}

function screenshotOnError(page, label) {
    ensureDir(LOGS_DIR);
    const name = label.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const file = path.join(LOGS_DIR, `error_${name}_${Date.now()}.png`);
    return page.screenshot({ path: file, fullPage: false }).catch(() => {});
}

function normalizeIdentityMode(mode) {
    return String(mode || '').toLowerCase() === 'profile' ? 'profile' : 'page';
}

export function resolveShareRuntime(options = {}) {
    const identityMode = normalizeIdentityMode(options.identityMode || process.env.DS_SHARE_IDENTITY_MODE);
    const userDataDir = options.userDataDir || process.env.DANIELSENSUAL_SHARE_USER_DATA_DIR || DEFAULT_USER_DATA_DIR;

    const lockFile = options.lockFile ||
        process.env.DANIELSENSUAL_SHARE_LOCK_FILE ||
        `/tmp/.danielsensual-share-${createHash('sha1').update(path.resolve(userDataDir)).digest('hex').slice(0, 12)}.lock`;

    const entryScript = options.entryScript ||
        process.env.DS_SHARE_ENTRY_SCRIPT ||
        'scripts/danielsensual-share.js';

    const botLabel = options.botLabel ||
        process.env.DS_SHARE_BOT_NAME ||
        (identityMode === 'profile' ? 'Daniel Sensual Personal' : 'Daniel Sensual');

    const loginCommand = options.loginCommand ||
        process.env.DS_SHARE_LOGIN_COMMAND ||
        `node ${entryScript} --login`;

    return {
        identityMode,
        userDataDir,
        lockFile,
        botLabel,
        loginCommand,
    };
}

// ─── Lockfile (Singleton Guard) ────────────────────────────────

function isProcessAlive(pid) {
    try { process.kill(pid, 0); return true; } catch { return false; }
}

export function acquireLock(force = false, options = {}) {
    const { lockFile } = resolveShareRuntime(options);

    if (fs.existsSync(lockFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(lockFile, 'utf-8'));
            if (!force && isProcessAlive(data.pid)) {
                const age = Math.round((Date.now() - data.startedAt) / 1000);
                console.log(`\n🔒 Another sharing instance is running (PID ${data.pid}, ${age}s ago)`);
                console.log(`   Use --force to override.\n`);
                return false;
            }
            // Stale lock — process is dead, clean up
            console.log(`🪓 Cleaning up stale lock (PID ${data.pid} is dead)`);
        } catch {
            // Corrupt lock file, overwrite
        }
    }
    fs.writeFileSync(lockFile, JSON.stringify({
        pid: process.pid,
        startedAt: Date.now(),
        startedAtISO: new Date().toISOString(),
    }));
    activeLockFile = lockFile;
    return true;
}

export function releaseLock() {
    try {
        if (activeLockFile && fs.existsSync(activeLockFile)) {
            const data = JSON.parse(fs.readFileSync(activeLockFile, 'utf-8'));
            // Only release our own lock
            if (data.pid === process.pid) {
                fs.unlinkSync(activeLockFile);
            }
        }
    } catch { /* best effort */ }
}

// Auto-release lock on exit
process.on('exit', releaseLock);
process.on('SIGINT', () => { releaseLock(); process.exit(1); });
process.on('SIGTERM', () => { releaseLock(); process.exit(0); });

// ─── Browser Session ─────────────────────────────────────────────

async function launchBrowser(headless = true, options = {}) {
    const { userDataDir } = resolveShareRuntime(options);

    // When DISPLAY is set (Xvfb), run headed to avoid Facebook's headless detection
    const useHeadless = headless && !process.env.DISPLAY;

    // Detect system Chrome — Puppeteer's bundled browser may not be installed on VMs
    const systemChrome = ['/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium']
        .find(p => { try { return fs.existsSync(p); } catch { return false; } });

    const launchOpts = {
        headless: useHeadless ? 'new' : false,
        protocolTimeout: 300_000, // 5 min protocol timeout — Facebook SPA is slow
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--user-data-dir=${userDataDir}`,
            '--disable-notifications',
            '--disable-blink-features=AutomationControlled',
            // VM hardening
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-extensions',
            '--disable-background-networking',
        ],
        defaultViewport: { width: 1280, height: 900 },
    };

    if (systemChrome) {
        launchOpts.executablePath = systemChrome;
    }

    return puppeteer.launch(launchOpts);
}

async function isLoggedIn(page) {
    try {
        await page.goto('https://www.facebook.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        const url = page.url();
        return !url.includes('/login') && !url.includes('/checkpoint') && !url.includes('r.php');
    } catch {
        return false;
    }
}

/**
 * Open a visible browser for manual Facebook login.
 * Session persists in ~/.danielsensual-chrome-profile/
 */
export async function saveSession() {
    const runtime = resolveShareRuntime();
    console.log('');
    console.log(`🔐 ${runtime.botLabel} — Facebook Session Saver`);
    console.log('═'.repeat(50));
    console.log('');
    console.log('A browser will open. Please:');
    console.log(`1. Log in to the Facebook account for ${runtime.botLabel}`);
    console.log('2. Complete any 2FA verification');
    console.log('3. Once logged in, press Enter in this terminal');
    console.log('');

    const browser = await launchBrowser(false, runtime);
    const page = await browser.newPage();
    await page.goto('https://www.facebook.com/login');

    console.log('⏳ Waiting for login... (press Enter when done)');
    await new Promise(resolve => process.stdin.once('data', resolve));

    const loggedIn = await isLoggedIn(page);
    await browser.close();

    if (loggedIn) {
        console.log('');
        console.log('✅ Session saved!');
        console.log(`   Profile stored in: ${runtime.userDataDir}`);
    } else {
        console.log('⚠️ Login not detected. Please try again.');
    }

    return loggedIn;
}

// ─── Share to a Single Group ─────────────────────────────────────

/**
 * Share a video to a single Facebook group (V2).
 * Posts an AI-generated caption, then adds the video URL
 * + streaming links as a comment for cleaner engagement.
 */
async function shareToGroup(page, {
    postUrl,
    groupUrl,
    groupName,
    caption = '',
    commentText = '',
    dryRun = false,
    owned = false,
    identityMode = 'page',
}) {
    // Disable nav timeout BEFORE goto — Facebook SPA does constant internal navigations
    // that would otherwise cause Puppeteer to timeout (link preview fetches, frame swaps, etc.)
    page.setDefaultNavigationTimeout(0);
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded' });
    await randomDelay(3000, 5000);

    // ── Early detection: dead/banned/unavailable pages ──
    // BYPASS for owned groups — admin view renders differently and
    // triggers false-positive "unavailable" detection
    if (!owned) {
        const pageStatus = await page.evaluate(() => {
            const bodyText = document.body?.textContent || '';
            const url = window.location.href;

            if (bodyText.includes("This content isn't available right now") ||
                bodyText.includes('This content is not available') ||
                bodyText.includes("this page isn't available")) {
                return 'unavailable';
            }
            if (url.includes('/login') || url.includes('/checkpoint')) {
                return 'login_required';
            }

            const btns = Array.from(document.querySelectorAll('div[role="button"]'));
            const joinBtn = btns.find(b => {
                const label = b.getAttribute('aria-label') || '';
                const txt = b.textContent?.trim() || '';
                return label === 'Join group' || txt === 'Join group' || txt === 'Cancel request';
            });
            if (joinBtn) return 'not_member';
            return 'ok';
        });

        if (pageStatus === 'unavailable') throw new Error('Group unavailable (deleted/banned/restricted)');
        if (pageStatus === 'login_required') throw new Error('Login required — session may have expired');
        if (pageStatus === 'not_member') throw new Error('Not a member of this group');
    } else {
        console.log(`   👑 Owned group — skipping availability check`);
        // Still check for login redirect
        const isLoginPage = page.url().includes('/login') || page.url().includes('/checkpoint');
        if (isLoginPage) throw new Error('Login required — session may have expired');
    }

    // ── Click the "Write something..." composer ──
    // Use page.evaluate to handle Facebook's SPA frame destruction during dialog open
    const composerOpened = await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('div[role="button"]'));
        const prompt = candidates.find(el => {
            const txt = el.textContent?.toLowerCase() || '';
            return txt.includes('write something') || txt.includes("what's on your mind");
        });
        if (prompt) { prompt.click(); return true; }
        return false;
    });

    if (!composerOpened) throw new Error('No composer found');

    // Wait for the dialog to appear — poll because frame may be recreated
    await randomDelay(2000, 3000);
    let dialogReady = false;
    for (let poll = 0; poll < 10; poll++) {
        try {
            dialogReady = await page.evaluate(() => {
                return !!document.querySelector('div[role="dialog"] div[contenteditable="true"][role="textbox"]');
            });
            if (dialogReady) break;
        } catch { /* frame detached — wait and retry */ }
        await new Promise(r => setTimeout(r, 1000));
    }
    if (!dialogReady) throw new Error('Composer dialog did not appear');

    // ── Identity switch temporarily disabled — destroys the composer dialog DOM ──
    // TODO: Fix identity switch to reopen composer after switching
    if (identityMode === 'page' && false) {
        try {
            const PAGE_NAME = 'Daniel Sensual';
            const switchResult = await page.evaluate((pageName) => {
                const dialog = document.querySelector('div[role="dialog"]');
                if (!dialog) return { status: 'no_dialog', buttons: [] };

                const allButtons = Array.from(dialog.querySelectorAll('div[role="button"]'));

                const buttonInfo = allButtons.slice(0, 20).map((btn, i) => ({
                    i,
                    aria: btn.getAttribute('aria-label') || '',
                    text: (btn.textContent?.trim() || '').substring(0, 80),
                    hasImg: !!btn.querySelector('img, image, svg'),
                }));

                let switcher = allButtons.find(btn => {
                    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                    return ariaLabel.includes('posting') ||
                        ariaLabel.includes('identity') ||
                        ariaLabel.includes('switch') ||
                        ariaLabel.includes('as your');
                });

                if (!switcher) {
                    switcher = allButtons.find(btn => {
                        const hasImage = btn.querySelector('img, image');
                        const rect = btn.getBoundingClientRect();
                        const dialogRect = dialog.getBoundingClientRect();
                        return hasImage && (rect.top - dialogRect.top) < 80;
                    });
                }

                if (!switcher) {
                    const topElements = allButtons.filter(btn => {
                        const rect = btn.getBoundingClientRect();
                        const dialogRect = dialog.getBoundingClientRect();
                        return (rect.top - dialogRect.top) < 100;
                    });
                    switcher = topElements.find(btn => btn.querySelector('img, image, svg'));
                }

                if (switcher) {
                    switcher.click();
                    return { status: 'clicked', buttons: buttonInfo };
                }

                return { status: 'not_found', buttons: buttonInfo };
            }, PAGE_NAME);

            if (switchResult.status === 'not_found' || switchResult.status === 'no_dialog') {
                console.log('   ℹ️  No page switcher found — posting as personal profile');
                if (switchResult.buttons.length > 0) {
                    console.log('   📋 Dialog buttons for diagnostics:');
                    for (const b of switchResult.buttons.slice(0, 8)) {
                        console.log(`      [${b.i}] aria="${b.aria}" text="${b.text}" img=${b.hasImg}`);
                    }
                }
                await page.screenshot({
                    path: path.join(LOGS_DIR, `composer_dialog_${Date.now()}.png`),
                    fullPage: false,
                }).catch(() => {});
            }

            if (switchResult.status === 'clicked') {
                await randomDelay(1500, 2500);

                const selected = await page.evaluate((pageName) => {
                    const candidates = Array.from(document.querySelectorAll(
                        'div[role="menuitem"], div[role="option"], div[role="radio"], div[role="listbox"] div, div[role="menu"] div[role="button"], div[role="dialog"] div[role="button"]'
                    ));

                    let pageOption = candidates.find(el => {
                        const text = el.textContent?.trim() || '';
                        return text === pageName || text.startsWith(pageName + '\n') || text.startsWith(pageName + ' ');
                    });

                    if (!pageOption) {
                        const allElements = Array.from(document.querySelectorAll('span, div[role="button"]'));
                        pageOption = allElements.find(el => (el.textContent?.trim() || '') === pageName);
                        if (pageOption) {
                            const btn = pageOption.closest('div[role="button"], div[role="menuitem"], div[role="option"]');
                            if (btn) {
                                btn.click();
                                return 'selected';
                            }
                            pageOption.click();
                            return 'selected';
                        }
                    }

                    if (pageOption) {
                        pageOption.click();
                        return 'selected';
                    }

                    const visible = candidates.slice(0, 10).map(el => el.textContent?.trim().substring(0, 60));
                    return `page_not_found:${visible.join(' | ')}`;
                }, PAGE_NAME);

                if (selected === 'selected') {
                    console.log(`   🏷️  Switched to post as "${PAGE_NAME}"`);
                    await randomDelay(1500, 2500);
                } else {
                    console.log(`   ⚠️ Could not find "${PAGE_NAME}" in switcher — posting as personal`);
                    console.log(`   📋 Visible options: ${selected}`);
                }
            }
        } catch (switchErr) {
            console.log(`   ⚠️ Page switch failed: ${switchErr.message} — posting as personal`);
        }
    } else {
        console.log('   🙋 Posting as personal profile');
    }

    // ── Find the text editor (after identity switch which may recreate dialog) ──
    let editorFound = false;
    for (let poll = 0; poll < 15; poll++) {
        try {
            editorFound = await page.evaluate(() => {
                const tb = document.querySelector('div[role="dialog"] div[contenteditable="true"][role="textbox"]')
                    || document.querySelector('div[contenteditable="true"][role="textbox"]');
                if (tb) { tb.focus(); tb.click(); return true; }
                return false;
            });
            if (editorFound) break;
        } catch { /* frame detached — wait and retry */ }
        await new Promise(r => setTimeout(r, 1000));
    }

    if (!editorFound) throw new Error('Could not find post text editor');
    await randomDelay(400, 800);

    // Only put caption in post body — including the URL triggers Facebook SPA
    // re-navigation (link preview fetch) that fatally conflicts with Puppeteer
    const postText = caption || `🎬 Check this out! 🔥`;

    const textInserted = await page.evaluate((text) => {
        const textbox = document.querySelector(
            'div[role="dialog"] div[contenteditable="true"][role="textbox"]'
        ) || document.querySelector('div[contenteditable="true"][role="textbox"]');
        if (!textbox) return 'no_textbox';
        textbox.focus();

        // Method 1: Lexical-compatible InputEvent (Facebook's editor framework)
        const beforeInput = new InputEvent('beforeinput', {
            inputType: 'insertText',
            data: text,
            bubbles: true,
            cancelable: true,
            composed: true,
        });
        textbox.dispatchEvent(beforeInput);
        // Also dispatch the actual input event
        textbox.dispatchEvent(new InputEvent('input', {
            inputType: 'insertText',
            data: text,
            bubbles: true,
        }));
        if (textbox.textContent.trim().length > 0) return 'lexical';

        // Method 2: execCommand
        const cmd = document.execCommand('insertText', false, text);
        if (cmd && textbox.textContent.trim().length > 0) return 'execCommand';

        // Method 3: DataTransfer paste
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        textbox.dispatchEvent(new ClipboardEvent('paste', {
            clipboardData: dt, bubbles: true, cancelable: true
        }));
        if (textbox.textContent.trim().length > 0) return 'paste';

        return 'failed';
    }, postText);

    if (textInserted === 'no_textbox') {
        throw new Error('Could not find post text editor in dialog');
    }

    if (textInserted === 'failed') {
        // Last resort: use page.type on the focused element
        // Wrap in try-catch because this may trigger SPA page navigations
        console.log('   ⚠️ In-page methods failed, trying page.type...');
        try {
            const sel = 'div[role="dialog"] div[contenteditable="true"][role="textbox"]';
            await page.type(sel, postText, { delay: 5 });
            console.log('   📝 Text inserted via page.type');
        } catch (typeErr) {
            // If page.type triggered a navigation/timeout, the text might still be there
            console.log(`   ⚠️ page.type interrupted: ${typeErr.message.substring(0, 60)}`);
            await randomDelay(2000, 3000);
            const hasText = await page.evaluate(() => {
                const tb = document.querySelector('div[role="dialog"] div[contenteditable="true"][role="textbox"]');
                return tb?.textContent?.trim().length > 0;
            }).catch(() => false);
            if (!hasText) throw new Error('All text insertion methods failed');
            console.log('   📝 Text present after interrupted type');
        }
    } else {
        console.log(`   📝 Text inserted via ${textInserted}`);
    }

    await randomDelay(2000, 3000);

    // ── Click Post ──
    if (dryRun) {
        console.log('   🔒 DRY RUN — skipping Post button click');
        return true;
    }

    const postClicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll(
            'div[role="dialog"] div[role="button"], div[role="dialog"] button'
        ));
        const postBtn = btns.find(b => b.textContent?.trim() === 'Post');
        if (postBtn && !postBtn.getAttribute('aria-disabled')) {
            postBtn.click();
            return true;
        }
        return false;
    });

    if (!postClicked) throw new Error('Could not click Post button (may be disabled)');

    // Wait for dialog to close and post to appear
    await randomDelay(4000, 6000);

    // ── V2: Add comment with video URL + streaming links ──
    if (commentText) {
        try {
            await addCommentToLatestPost(page, commentText);
            console.log('   💬 Comment added (link + streaming)');
        } catch (err) {
            console.log(`   ⚠️ Comment failed: ${err.message} (post still shared)`);
        }
    }

    return true;
}

/**
 * Add a comment to the latest post on the current page.
 * Finds the most recent comment box and types the comment text.
 */
async function addCommentToLatestPost(page, commentText) {
    await randomDelay(1000, 2000);

    // Scroll up slightly to ensure the latest post is visible
    await page.evaluate(() => window.scrollTo(0, 0));
    await randomDelay(1000, 2000);

    // Try to find and click the "Comment" button or comment input on the latest post
    const commentBoxFound = await page.evaluate(() => {
        // Look for comment input areas — Facebook shows them after clicking "Comment"
        // First try: find the "Comment" action button on the latest post
        const commentBtns = Array.from(document.querySelectorAll('div[role="button"]'));
        const commentBtn = commentBtns.find(b => {
            const label = b.getAttribute('aria-label') || '';
            const txt = b.textContent?.trim() || '';
            return label === 'Leave a comment' || txt === 'Comment' ||
                   label === 'Write a comment' || label === 'Comentar';
        });
        if (commentBtn) {
            commentBtn.click();
            return true;
        }
        return false;
    });

    if (!commentBoxFound) {
        throw new Error('Could not find comment button');
    }

    await randomDelay(1500, 2500);

    // Find the comment textbox
    const commentEditorSelectors = [
        'div[contenteditable="true"][aria-label*="comment"]',
        'div[contenteditable="true"][aria-label*="Comment"]',
        'div[contenteditable="true"][aria-label*="comentar"]',
        'div[contenteditable="true"][role="textbox"][aria-label*="Write"]',
        'div[contenteditable="true"][role="textbox"]',
    ];

    let commentEditor = null;
    for (const sel of commentEditorSelectors) {
        try {
            const els = await page.$$(sel);
            // Get the last one (most recently opened)
            if (els.length > 0) {
                commentEditor = els[els.length - 1];
                break;
            }
        } catch { /* next */ }
    }

    if (!commentEditor) {
        throw new Error('Could not find comment textbox');
    }

    await commentEditor.click();
    await randomDelay(300, 600);

    // Type the comment
    await page.keyboard.type(commentText, { delay: 10 });
    await randomDelay(500, 1000);

    // Press Enter to submit the comment
    await page.keyboard.press('Enter');
    await randomDelay(2000, 3000);
}

// ─── Share to Multiple Groups ────────────────────────────────────

/**
 * Share a video URL to multiple groups.
 *
 * @param {object} options
 * @param {string} options.postUrl - Facebook video/reel URL to share
 * @param {Array}  options.groups - Array of { name, url } group objects
 * @param {string} [options.caption] - Optional caption text
 * @param {number} [options.batch] - Batch number (1, 2, or 3) for splitting 40 groups across 3 runs
 * @param {number} [options.batchSize] - Groups per batch (default: 14)
 * @param {boolean} [options.dryRun=false] - Preview only
 * @param {boolean} [options.headless=true] - Run headless
 */
export async function shareToAllGroups(options = {}) {
    const {
        postUrl,
        groups,
        caption = '',
        batch = 0,
        batchSize = 14,
        dryRun = false,
        headless = true,
    } = options;
    const runtime = resolveShareRuntime(options);

    if (!postUrl) {
        throw new Error('postUrl is required — provide a Facebook video/reel URL');
    }

    // Split into batches if specified
    let targetGroups = groups;
    if (batch > 0) {
        const start = (batch - 1) * batchSize;
        const end = start + batchSize;
        targetGroups = groups.slice(start, end);
        if (targetGroups.length === 0) {
            console.log(`⚠️ Batch ${batch} is empty (only ${groups.length} groups total)`);
            return { success: true, posted: 0, failed: 0, skipped: 0 };
        }
    }

    console.log('');
    console.log(`🎬 ${runtime.botLabel} — Group Video Sharer V2`);
    console.log('═'.repeat(55));
    console.log(`   Mode:      ${dryRun ? 'DRY RUN' : '🔴 LIVE'}`);
    console.log(`   Identity:  ${runtime.identityMode === 'profile' ? 'Personal profile' : 'Daniel Sensual page'}`);
    console.log(`   Video:     ${postUrl.substring(0, 70)}...`);
    console.log(`   Groups:    ${targetGroups.length}${batch ? ` (batch ${batch})` : ''}`);
    console.log(`   Captions:  AI-generated (locale-aware)`);
    console.log(`   Links:     In comments (Spotify + Apple Music)`);
    console.log(`   Time:      ${timestamp()}`);
    console.log('');

    const browser = await launchBrowser(headless, runtime);
    const page = await browser.newPage();
    // Set generous timeouts — Facebook SPA never truly stops loading
    page.setDefaultNavigationTimeout(0);
    page.setDefaultTimeout(120000);

    try {
        // Verify login
        const loggedIn = await isLoggedIn(page);
        if (!loggedIn) {
            console.log(`❌ Not logged in. Run: ${runtime.loginCommand}`);
            await browser.close();
            return { success: false, error: 'Not logged in', posted: 0, failed: 0, skipped: 0 };
        }
        console.log('✅ Logged in to Facebook');
        console.log('');

        let posted = 0;
        let failed = 0;
        let skipped = 0;

        for (let i = 0; i < targetGroups.length; i++) {
            const group = targetGroups[i];
            const label = `[${i + 1}/${targetGroups.length}]`;

            // Skip disabled groups
            if (group.shareDisabled) {
                console.log(`${label} ⏭️  ${group.name} — sharing disabled`);
                skipped++;
                continue;
            }

            console.log(`${label} 📌 ${group.name}`);

            try {
                // V2: Generate unique AI caption per group
                const captionResult = await generateGroupCaption({ groupName: group.name });
                const locale = detectLocale(group.name);
                const streamingComment = `${postUrl}\n\n${generateStreamingComment(locale)}`;

                console.log(`   🤖 Caption (${captionResult.locale}/${captionResult.source}): "${captionResult.caption.substring(0, 60)}..."`);

                // Retry logic — 1 retry with 10s backoff for transient failures
                let lastErr = null;
                for (let attempt = 0; attempt < 2; attempt++) {
                    try {
                        await shareToGroup(page, {
                            postUrl,
                            groupUrl: group.url,
                            groupName: group.name,
                            caption: captionResult.caption,
                            commentText: streamingComment,
                            dryRun,
                            owned: group.owned || false,
                            identityMode: runtime.identityMode,
                        });
                        lastErr = null;
                        break; // success
                    } catch (retryErr) {
                        lastErr = retryErr;
                        const isTransient = retryErr.message.includes('timeout') ||
                            retryErr.message.includes('Timed out') ||
                            retryErr.message.includes('Navigation timeout') ||
                            retryErr.message.includes('detached Frame') ||
                            retryErr.message.includes('frame was detached') ||
                            retryErr.message.includes('Target closed');
                        if (attempt === 0 && isTransient) {
                            console.log(`   🔄 Transient failure, retrying in 10s...`);
                            await new Promise(r => setTimeout(r, 10000));
                        }
                    }
                }

                if (lastErr) throw lastErr;

                console.log(`   ✅ ${dryRun ? 'Would share' : 'Shared'} successfully`);
                logResult({
                    group: group.name,
                    status: dryRun ? 'dry_run' : 'shared',
                    postUrl: postUrl.substring(0, 100),
                    caption: captionResult.caption.substring(0, 100),
                    locale: captionResult.locale,
                    captionSource: captionResult.source,
                    batch: batch || null,
                });
                if (!dryRun) {
                    recordGroupShare(group.name, postUrl);
                }
                posted++;
            } catch (error) {
                console.log(`   ❌ Failed: ${error.message}`);
                await screenshotOnError(page, group.name);
                logResult({
                    group: group.name,
                    status: 'failed',
                    error: error.message,
                    postUrl: postUrl.substring(0, 100),
                    batch: batch || null,
                });
                // Track failure for auto-disable
                recordGroupFailure(group.name, error.message);
                failed++;
            }

            // Human-like delay between groups (30-90 seconds)
            if (i < targetGroups.length - 1) {
                const waitSec = Math.floor(Math.random() * 61) + 30;
                console.log(`   ⏳ Waiting ${waitSec}s before next group...`);
                await new Promise(r => setTimeout(r, waitSec * 1000));
            }
        }

        await browser.close();

        console.log('');
        console.log('═'.repeat(55));
        console.log(`✅ Done! ${posted} shared, ${failed} failed, ${skipped} skipped`);
        console.log(`   Total time: ${timestamp()}`);

        return { success: true, posted, failed, skipped };

    } catch (error) {
        console.error(`❌ Fatal error: ${error.message}`);
        await browser.close();
        return { success: false, error: error.message, posted: 0, failed: 0, skipped: 0 };
    }
}

export default { saveSession, shareToAllGroups };

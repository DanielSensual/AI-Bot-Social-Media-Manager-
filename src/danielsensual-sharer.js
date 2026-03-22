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
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { generateGroupCaption, generateStreamingComment, detectLocale } from './share-caption-generator.js';

dotenv.config();
puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_DATA_DIR = path.join(process.env.HOME, '.danielsensual-chrome-profile');
const LOGS_DIR = path.join(__dirname, '..', 'logs', 'danielsensual-shares');

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

// ─── Browser Session ─────────────────────────────────────────────

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
    });
}

async function isLoggedIn(page) {
    try {
        await page.goto('https://www.facebook.com/', {
            waitUntil: 'networkidle2',
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
    console.log('');
    console.log('🔐 Daniel Sensual — Facebook Session Saver');
    console.log('═'.repeat(50));
    console.log('');
    console.log('A browser will open. Please:');
    console.log('1. Log in to YOUR personal Facebook (Daniel Sensual)');
    console.log('2. Complete any 2FA verification');
    console.log('3. Once logged in, press Enter in this terminal');
    console.log('');

    const browser = await launchBrowser(false);
    const page = await browser.newPage();
    await page.goto('https://www.facebook.com/login');

    console.log('⏳ Waiting for login... (press Enter when done)');
    await new Promise(resolve => process.stdin.once('data', resolve));

    const loggedIn = await isLoggedIn(page);
    await browser.close();

    if (loggedIn) {
        console.log('');
        console.log('✅ Session saved!');
        console.log(`   Profile stored in: ${USER_DATA_DIR}`);
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
async function shareToGroup(page, { postUrl, groupUrl, groupName, caption = '', commentText = '', dryRun = false }) {
    // Navigate to the group
    await page.goto(groupUrl, { waitUntil: 'networkidle2', timeout: 45000 });
    await randomDelay(2000, 4000);

    // ── Early detection: dead/banned/unavailable pages ──
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

    // ── Click the "Write something..." composer ──
    const composerSelectors = [
        'div[role="button"] span::-p-text(Write something)',
        'div[role="button"] span::-p-text(write something)',
        'div[role="button"] span::-p-text(What\'s on your mind)',
    ];

    let composerClicked = false;
    for (const sel of composerSelectors) {
        try {
            const el = await page.waitForSelector(sel, { timeout: 5000 });
            if (el) { await el.click(); composerClicked = true; break; }
        } catch { /* next */ }
    }

    if (!composerClicked) {
        await page.evaluate(() => {
            const candidates = Array.from(document.querySelectorAll('div[role="button"]'));
            const prompt = candidates.find(el => {
                const txt = el.textContent?.toLowerCase() || '';
                return txt.includes('write something') || txt.includes("what's on your mind");
            });
            if (prompt) prompt.click();
            else throw new Error('No composer found');
        });
    }

    await randomDelay(2000, 4000);

    // ── Find the text editor ──
    const editorSelectors = [
        'div[role="dialog"] div[contenteditable="true"][role="textbox"]',
        'div[role="dialog"] div[contenteditable="true"]',
        'div[contenteditable="true"][data-lexical-editor="true"]',
        'div[contenteditable="true"][role="textbox"]',
    ];

    let editor = null;
    for (const sel of editorSelectors) {
        try {
            editor = await page.waitForSelector(sel, { timeout: 5000 });
            if (editor) break;
        } catch { /* next */ }
    }

    if (!editor) throw new Error('Could not find post text editor');

    // ── V2: Post caption ONLY (no URL in body) ──
    await editor.click();
    await randomDelay(400, 800);

    // Caption only — URL goes in comment
    const postText = caption || postUrl;

    const textInserted = await page.evaluate((text) => {
        const textbox = document.querySelector(
            'div[role="dialog"] div[contenteditable="true"][role="textbox"]'
        ) || document.querySelector('div[contenteditable="true"][role="textbox"]');
        if (!textbox) return false;
        textbox.focus();

        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/plain', text);
        const pasteEvent = new ClipboardEvent('paste', {
            clipboardData: dataTransfer,
            bubbles: true,
            cancelable: true,
        });
        const handled = textbox.dispatchEvent(pasteEvent);
        if (handled && textbox.textContent.trim().length === 0) {
            document.execCommand('insertText', false, text);
        }
        return textbox.textContent.trim().length > 0;
    }, postText);

    if (!textInserted) {
        console.log('   ⚠️ Paste failed, falling back to keyboard.type...');
        await page.keyboard.type(postText, { delay: 15 });
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
    console.log('🎬 Music Manager Bot — Group Video Sharer V2');
    console.log('═'.repeat(55));
    console.log(`   Mode:      ${dryRun ? 'DRY RUN' : '🔴 LIVE'}`);
    console.log(`   Video:     ${postUrl.substring(0, 70)}...`);
    console.log(`   Groups:    ${targetGroups.length}${batch ? ` (batch ${batch})` : ''}`);
    console.log(`   Captions:  AI-generated (locale-aware)`);
    console.log(`   Links:     In comments (Spotify + Apple Music)`);
    console.log(`   Time:      ${timestamp()}`);
    console.log('');

    const browser = await launchBrowser(headless);
    const page = await browser.newPage();

    try {
        // Verify login
        const loggedIn = await isLoggedIn(page);
        if (!loggedIn) {
            console.log('❌ Not logged in. Run: node scripts/danielsensual-share.js --login');
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

                await shareToGroup(page, {
                    postUrl,
                    groupUrl: group.url,
                    groupName: group.name,
                    caption: captionResult.caption,
                    commentText: streamingComment,
                    dryRun,
                });

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

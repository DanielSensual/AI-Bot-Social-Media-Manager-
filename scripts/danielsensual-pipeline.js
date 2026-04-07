#!/usr/bin/env node
/**
 * Daniel Sensual — Join-Then-Share Pipeline
 *
 * Single autonomous pipeline that visits every group and:
 *   - Already a member → SHARE the video
 *   - Not a member    → JOIN the group (share later)
 *   - Pending         → SKIP
 *   - Unavailable     → LOG and skip
 *
 * One continuous browser session, fully autonomous, human-proof.
 *
 * Usage:
 *   node scripts/danielsensual-pipeline.js --url=https://facebook.com/reel/123
 *   node scripts/danielsensual-pipeline.js --url=https://facebook.com/reel/123 --max=10
 *   node scripts/danielsensual-pipeline.js --url=https://facebook.com/reel/123 --batch=2
 *   node scripts/danielsensual-pipeline.js --url=https://facebook.com/reel/123 --dry-run
 *   node scripts/danielsensual-pipeline.js --status
 *   node scripts/danielsensual-pipeline.js --help
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { SHARE_GROUPS, GROUPS } from '../src/danielsensual-groups.js';
import { generateGroupCaption, generateStreamingComment, detectLocale } from '../src/share-caption-generator.js';
import { recordGroupShare, recordGroupFailure } from '../src/danielsensual-groups.js';

dotenv.config();
puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, '..', 'logs', 'pipeline');
const LOCK_FILE = '/tmp/.danielsensual-pipeline.lock';
const USER_DATA_DIR = path.join(process.env.HOME || '/root', '.danielsensual-chrome-profile');

// ─── CLI Flags ──────────────────────────────────────────────────

const args = process.argv.slice(2);

function getFlag(name) {
    const prefix = `--${name}=`;
    const arg = args.find((v) => v.startsWith(prefix));
    return arg ? arg.slice(prefix.length).trim() : '';
}

const flags = {
    help: args.includes('--help') || args.includes('-h'),
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    status: args.includes('--status'),
    force: args.includes('--force'),
    url: getFlag('url'),
    caption: getFlag('caption'),
    batch: parseInt(getFlag('batch') || '0', 10),
    max: parseInt(getFlag('max') || '0', 10),
    source: getFlag('source') || 'all',
};

// ─── Helpers ────────────────────────────────────────────────────

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function randomDelay(minMs, maxMs) {
    return new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs),
    );
}

function timestamp() {
    return new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York',
        dateStyle: 'short',
        timeStyle: 'medium',
    });
}

// ─── Lockfile ───────────────────────────────────────────────────

function acquireLock(force = false) {
    if (fs.existsSync(LOCK_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
            if (!force) {
                try { process.kill(data.pid, 0); } catch { 
                    // Process dead, clean up
                    fs.unlinkSync(LOCK_FILE);
                    fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
                    return true;
                }
                console.log(`\n🔒 Pipeline already running (PID ${data.pid}). Use --force to override.\n`);
                return false;
            }
        } catch { /* corrupt */ }
    }
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
    return true;
}

function releaseLock() {
    try {
        if (fs.existsSync(LOCK_FILE)) {
            const data = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
            if (data.pid === process.pid) fs.unlinkSync(LOCK_FILE);
        }
    } catch { /* best effort */ }
}

process.on('exit', releaseLock);
process.on('SIGINT', () => { releaseLock(); process.exit(1); });
process.on('SIGTERM', () => { releaseLock(); process.exit(0); });

// ─── Browser ────────────────────────────────────────────────────

async function launchBrowser() {
    const systemChrome = ['/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium']
        .find((p) => { try { return fs.existsSync(p); } catch { return false; } });

    const useHeadless = !process.env.DISPLAY;

    return puppeteer.launch({
        headless: useHeadless ? 'new' : false,
        protocolTimeout: 300_000,
        args: [
            '--no-sandbox', '--disable-setuid-sandbox',
            `--user-data-dir=${USER_DATA_DIR}`,
            '--disable-notifications',
            '--disable-blink-features=AutomationControlled',
            '--disable-gpu', '--disable-dev-shm-usage',
            '--disable-extensions', '--disable-background-networking',
        ],
        defaultViewport: { width: 1280, height: 900 },
        ...(systemChrome ? { executablePath: systemChrome } : {}),
    });
}

// ─── Group Status Detection ─────────────────────────────────────

async function detectGroupStatus(page, groupUrl) {
    page.setDefaultNavigationTimeout(0);
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded' });
    await randomDelay(3000, 5000);

    return page.evaluate(() => {
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

        const cancelBtn = btns.find((b) => {
            const txt = b.textContent?.trim() || '';
            return txt === 'Cancel request' || txt === 'Cancel Request';
        });
        if (cancelBtn) return 'pending';

        const joinBtn = btns.find((b) => {
            const txt = b.textContent?.trim() || '';
            const aria = b.getAttribute('aria-label') || '';
            return txt === 'Join group' || txt === 'Join Group' || aria === 'Join group';
        });
        if (joinBtn) return 'not_member';

        return 'member';
    });
}

// ─── Join Action ────────────────────────────────────────────────

async function clickJoinButton(page) {
    const clicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('div[role="button"]'));
        const joinBtn = btns.find((b) => {
            const txt = b.textContent?.trim() || '';
            const aria = b.getAttribute('aria-label') || '';
            return txt === 'Join group' || txt === 'Join Group' || aria === 'Join group';
        });
        if (joinBtn) { joinBtn.click(); return true; }
        return false;
    });

    if (!clicked) return false;
    await randomDelay(2000, 3000);

    // Handle rules/questions modal
    await page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"]');
        if (!dialog) return;
        const dialogText = dialog.textContent || '';
        if (dialogText.includes('Answer') || dialogText.includes('question') || dialogText.includes('agree')) {
            const checkboxes = dialog.querySelectorAll('input[type="checkbox"], div[role="checkbox"]');
            checkboxes.forEach((cb) => {
                if (cb.getAttribute('aria-checked') !== 'true' && !cb.checked) cb.click();
            });
            const dialogBtns = Array.from(dialog.querySelectorAll('div[role="button"], button'));
            const submitBtn = dialogBtns.find((b) => {
                const txt = b.textContent?.trim() || '';
                return ['Submit', 'Join group', 'Join Group', 'Agree and join', 'Agree & join'].includes(txt);
            });
            if (submitBtn) submitBtn.click();
        }
    });
    await randomDelay(1500, 2500);
    return true;
}

// ─── Share Action ───────────────────────────────────────────────

async function shareToGroup(page, { postUrl, groupName, caption, commentText, dryRun }) {
    // Find and click composer ("Write something...")
    const composerClicked = await page.evaluate(() => {
        const spans = Array.from(document.querySelectorAll('span'));
        const writeSpan = spans.find((s) => {
            const t = s.textContent?.trim() || '';
            return t.includes('Write something') || t.includes('What\'s on your mind');
        });
        if (writeSpan) { writeSpan.click(); return true; }

        // Fallback: find the composer area directly
        const composerAreas = document.querySelectorAll(
            'div[role="button"][tabindex="0"]',
        );
        for (const area of composerAreas) {
            const txt = area.textContent || '';
            if (txt.includes('Write something') || txt.includes('What\'s on your mind')) {
                area.click();
                return true;
            }
        }
        return false;
    });

    if (!composerClicked) {
        throw new Error('No composer found');
    }

    await randomDelay(2000, 3500);

    // Find the active textbox in the modal
    const textbox = await page.waitForSelector(
        'div[role="dialog"] div[role="textbox"][contenteditable="true"]',
        { timeout: 10000 },
    ).catch(() => null);

    if (!textbox) {
        throw new Error('Composer textbox not found');
    }

    // Type caption
    const fullText = caption || `Check out this video! 🔥\n${postUrl}`;
    await textbox.click();
    await randomDelay(300, 600);

    // Type in chunks for human-like behavior
    const lines = fullText.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (i > 0) {
            await page.keyboard.down('Shift');
            await page.keyboard.press('Enter');
            await page.keyboard.up('Shift');
            await randomDelay(100, 300);
        }
        await page.keyboard.type(lines[i], { delay: 15 + Math.random() * 25 });
        await randomDelay(200, 500);
    }

    await randomDelay(1500, 3000);

    if (dryRun) {
        console.log(`   🔒 DRY RUN — would post here`);
        // Press Escape to close dialog
        await page.keyboard.press('Escape');
        await randomDelay(500, 1000);
        await page.keyboard.press('Escape');
        return true;
    }

    // Click Post button
    const postClicked = await page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"]');
        if (!dialog) return false;
        const btns = Array.from(dialog.querySelectorAll('div[role="button"]'));
        const postBtn = btns.find((b) => {
            const label = b.getAttribute('aria-label') || '';
            const txt = b.textContent?.trim() || '';
            return label === 'Post' || txt === 'Post' || txt === 'Submit';
        });
        if (postBtn && !postBtn.getAttribute('aria-disabled')) {
            postBtn.click();
            return true;
        }
        return false;
    });

    if (!postClicked) {
        throw new Error('Could not click Post button');
    }

    await randomDelay(3000, 5000);

    // Post comment with video link + streaming links
    if (commentText) {
        await postComment(page, commentText);
    }

    return true;
}

async function postComment(page, text) {
    try {
        await randomDelay(3000, 5000);

        // Find "Write a comment" or "Comment" input
        const commentBox = await page.evaluateHandle(() => {
            const inputs = Array.from(document.querySelectorAll(
                'div[contenteditable="true"][role="textbox"]',
            ));
            return inputs.find((el) => {
                const placeholder = el.getAttribute('aria-placeholder') || el.getAttribute('placeholder') || '';
                return placeholder.toLowerCase().includes('comment') || placeholder.toLowerCase().includes('write');
            });
        });

        if (!commentBox?.asElement()) return;

        await commentBox.asElement().click();
        await randomDelay(500, 1000);
        await page.keyboard.type(text, { delay: 20 });
        await randomDelay(500, 1000);
        await page.keyboard.press('Enter');
        await randomDelay(2000, 3000);
        console.log(`   💬 Comment posted`);
    } catch {
        console.log(`   ⚠️ Comment failed (non-critical)`);
    }
}

// ─── Build Group List ───────────────────────────────────────────

function buildGroupList() {
    const allGroups = [];
    const seen = new Set();

    function addGroups(list, source) {
        for (const g of list) {
            const key = g.url.replace(/\/$/, '').toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            allGroups.push({ ...g, source });
        }
    }

    if (flags.source === 'share' || flags.source === 'all') addGroups(SHARE_GROUPS, 'share');
    if (flags.source === 'daily' || flags.source === 'all') addGroups(GROUPS, 'daily');

    return allGroups;
}

// ─── Help ───────────────────────────────────────────────────────

function showHelp() {
    console.log('');
    console.log('🔄 Daniel Sensual — Join-Then-Share Pipeline');
    console.log('═'.repeat(60));
    console.log('');
    console.log('Autonomous bot that visits every group and:');
    console.log('  • Already a member → SHARES the video');
    console.log('  • Not a member     → JOINS the group');
    console.log('  • Pending / Unavailable → SKIPS');
    console.log('');
    console.log('Usage:');
    console.log('  --url=<FB_URL>          Required — video/reel URL to share');
    console.log('  --caption="text"        Override caption');
    console.log('  --batch=N               Only process batch N groups');
    console.log('  --max=N                 Limit to N groups');
    console.log('  --source=share|daily|all  Group list (default: all)');
    console.log('  --dry-run               Detect status + compose but don\'t post/join');
    console.log('  --force                 Override lockfile');
    console.log('  --status                Show last pipeline results');
    console.log('  --help                  Show this help');
    console.log('');
    console.log('Examples:');
    console.log('  # Full pipeline — join & share in one go:');
    console.log('  node scripts/danielsensual-pipeline.js \\');
    console.log('    --url="https://www.facebook.com/share/r/1CrHsuix2k/"');
    console.log('');
    console.log('  # Dry-run audit:');
    console.log('  node scripts/danielsensual-pipeline.js \\');
    console.log('    --url="https://www.facebook.com/share/r/1CrHsuix2k/" --dry-run --max=5');
    console.log('');
}

// ─── Status (last run) ─────────────────────────────────────────

function showLastStatus() {
    ensureDir(LOGS_DIR);
    const files = fs.readdirSync(LOGS_DIR).filter((f) => f.endsWith('.json')).sort().reverse();
    if (files.length === 0) {
        console.log('\n📭 No pipeline runs logged yet.\n');
        return;
    }
    const lastFile = path.join(LOGS_DIR, files[0]);
    const data = JSON.parse(fs.readFileSync(lastFile, 'utf-8'));
    const last = Array.isArray(data) ? data[data.length - 1] : data;

    console.log(`\n🔄 Last Pipeline Run — ${files[0].replace('.json', '')}`);
    console.log('═'.repeat(60));
    console.log(`   Time: ${last.timestamp || 'unknown'}`);
    console.log(`   Video: ${last.videoUrl || 'unknown'}`);
    console.log('');

    const counts = { shared: 0, joined: 0, pending: 0, already_member_shared: 0, unavailable: 0, failed: 0 };
    for (const r of (last.results || [])) {
        if (r.action === 'shared') counts.shared++;
        else if (r.action === 'joined') counts.joined++;
        else if (r.status === 'pending') counts.pending++;
        else if (r.status === 'unavailable') counts.unavailable++;
        else counts.failed++;
    }

    console.log(`   ✅ Shared:      ${counts.shared}`);
    console.log(`   🎯 Joined:      ${counts.joined}`);
    console.log(`   ⏳ Pending:     ${counts.pending}`);
    console.log(`   ⚠️  Unavailable: ${counts.unavailable}`);
    console.log(`   ❌ Failed:      ${counts.failed}`);
    console.log('');
}

// ─── Main Pipeline ──────────────────────────────────────────────

async function runPipeline() {
    const postUrl = flags.url;

    let groups = buildGroupList();
    if (flags.batch > 0) groups = groups.filter((g) => (g.batch || 1) === flags.batch);
    if (flags.max > 0) groups = groups.slice(0, flags.max);

    console.log('');
    console.log('🔄 Daniel Sensual — Join-Then-Share Pipeline');
    console.log('═'.repeat(60));
    console.log(`   Mode:     ${flags.dryRun ? '🔒 DRY RUN' : '🔴 LIVE'}`);
    console.log(`   Video:    ${postUrl}`);
    console.log(`   Groups:   ${groups.length}${flags.batch ? ` (batch ${flags.batch})` : ''}`);
    console.log(`   Time:     ${timestamp()}`);
    console.log('');

    const browser = await launchBrowser();
    const page = await browser.newPage();
    page.setDefaultTimeout(120000);

    const results = [];
    let shared = 0, joined = 0, pending = 0, alreadyMember = 0, failed = 0, unavailable = 0;

    try {
        // Verify login
        page.setDefaultNavigationTimeout(0);
        await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        const loggedIn = !page.url().includes('/login') && !page.url().includes('/checkpoint');

        if (!loggedIn) {
            console.log('❌ Not logged in. Run: node scripts/danielsensual-share.js --login');
            await browser.close();
            return { success: false, error: 'Not logged in', results };
        }
        console.log('✅ Logged in to Facebook\n');

        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            const label = `[${i + 1}/${groups.length}]`;
            console.log(`${label} 📌 ${group.name}`);

            const entry = {
                name: group.name,
                url: group.url,
                batch: group.batch || null,
                status: null,
                action: 'none',
                timestamp: new Date().toISOString(),
            };

            try {
                const status = await detectGroupStatus(page, group.url);
                entry.status = status;

                switch (status) {
                    case 'member': {
                        // ─── SHARE THE VIDEO ───
                        console.log(`   ✅ Member — sharing video...`);

                        const locale = detectLocale(group.name);
                        let caption = flags.caption;
                        if (!caption) {
                            try {
                                caption = await generateGroupCaption(group.name, postUrl, locale);
                                console.log(`   🤖 Caption (${locale}/ai): "${caption.substring(0, 60)}..."`);
                            } catch {
                                caption = `Check this out! 🔥💃 #bachata #danielsensual`;
                            }
                        }

                        let commentText = '';
                        try {
                            commentText = await generateStreamingComment(postUrl);
                        } catch { /* non-critical */ }

                        await shareToGroup(page, {
                            postUrl,
                            groupName: group.name,
                            caption,
                            commentText,
                            dryRun: flags.dryRun,
                        });

                        entry.action = flags.dryRun ? 'would_share' : 'shared';
                        if (!flags.dryRun) {
                            recordGroupShare(group.name, postUrl);
                            shared++;
                        }
                        console.log(`   🎉 ${flags.dryRun ? 'Would share' : 'Shared!'}`);
                        break;
                    }

                    case 'not_member': {
                        // ─── JOIN THE GROUP ───
                        if (flags.dryRun) {
                            console.log(`   🔍 Not a member — would join (dry run)`);
                            entry.action = 'would_join';
                        } else {
                            const didJoin = await clickJoinButton(page);
                            if (didJoin) {
                                console.log(`   🎯 Clicked "Join group" — request sent!`);
                                entry.action = 'joined';
                                joined++;
                            } else {
                                console.log(`   ❌ Join button disappeared`);
                                entry.action = 'join_failed';
                                failed++;
                            }
                        }
                        break;
                    }

                    case 'pending':
                        console.log(`   ⏳ Join request already pending — skip`);
                        pending++;
                        break;

                    case 'unavailable':
                        console.log(`   ⚠️  Group unavailable`);
                        unavailable++;
                        break;

                    case 'login_required':
                        console.log(`   ❌ Session expired — aborting`);
                        entry.action = 'session_expired';
                        results.push(entry);
                        throw new Error('Session expired');
                }
            } catch (err) {
                if (err.message === 'Session expired') throw err;
                console.log(`   ❌ Error: ${err.message}`);
                entry.status = 'error';
                entry.detail = err.message;
                failed++;
                try { recordGroupFailure(group.name, err.message); } catch { /* */ }
            }

            results.push(entry);

            // Human-like delay: 30-90s between groups (longer when sharing)
            if (i < groups.length - 1) {
                const wasShare = entry.action === 'shared';
                const minSec = wasShare ? 45 : 20;
                const maxSec = wasShare ? 90 : 45;
                const waitSec = Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
                console.log(`   ⏳ Waiting ${waitSec}s before next group...`);
                await new Promise((r) => setTimeout(r, waitSec * 1000));
            }
        }

        await browser.close();
    } catch (err) {
        console.error(`\n❌ Fatal: ${err.message}`);
        await browser.close().catch(() => {});
    }

    // ─── Log Results ────────────────────────────────────────
    ensureDir(LOGS_DIR);
    const dateStr = new Date().toISOString().split('T')[0];
    const logFile = path.join(LOGS_DIR, `${dateStr}.json`);
    let logs = [];
    if (fs.existsSync(logFile)) {
        try { logs = JSON.parse(fs.readFileSync(logFile, 'utf-8')); } catch { /* */ }
    }
    logs.push({
        timestamp: new Date().toISOString(),
        videoUrl: postUrl,
        dryRun: flags.dryRun,
        results,
    });
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));

    // ─── Summary ────────────────────────────────────────────
    console.log('');
    console.log('═'.repeat(60));
    console.log(`🔄 Pipeline Complete — ${timestamp()}`);
    console.log('═'.repeat(60));
    console.log(`   ✅ Shared:      ${shared}`);
    console.log(`   🎯 Joined:      ${joined}`);
    console.log(`   ⏳ Pending:     ${pending}`);
    console.log(`   ⚠️  Unavailable: ${unavailable}`);
    console.log(`   ❌ Failed:      ${failed}`);
    console.log(`   📋 Log: logs/pipeline/${dateStr}.json`);

    if (joined > 0) {
        console.log('');
        console.log(`   💡 ${joined} groups joined — run again after approval to share!`);
        console.log(`   node scripts/danielsensual-pipeline.js --url="${postUrl}"`);
    }
    console.log('');

    return { success: true, shared, joined, pending, unavailable, failed, results };
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
    if (flags.help) { showHelp(); return; }
    if (flags.status) { showLastStatus(); return; }

    if (!flags.url) {
        console.error('❌ --url is required. Use --help for usage.');
        process.exit(1);
    }

    if (!acquireLock(flags.force)) process.exit(0);

    const result = await runPipeline();
    process.exit(result?.success ? 0 : 1);
}

main().catch((err) => {
    console.error(`\n❌ Fatal: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
});

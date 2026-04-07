/**
 * DanielSensual — Facebook Group Joiner
 *
 * Visits all configured groups and clicks "Join group" for any
 * group where the account is not yet a member. Reuses the same
 * Puppeteer stealth + Chrome profile as the sharer bot.
 *
 * Features:
 *   - Detects: already member / pending / not member / unavailable
 *   - Human-like delays (15-30s between joins)
 *   - JSON result logs per day
 *   - Lockfile to prevent concurrent runs
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_USER_DATA_DIR = path.join(
    process.env.HOME || '/root',
    '.danielsensual-chrome-profile',
);
const LOGS_DIR = path.join(__dirname, '..', 'logs', 'danielsensual-joins');
const LOCK_FILE = '/tmp/.danielsensual-group-joiner.lock';

// ─── Helpers ─────────────────────────────────────────────────────

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function randomDelay(minMs, maxMs) {
    const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise((r) => setTimeout(r, ms));
}

function timestamp() {
    return new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York',
        dateStyle: 'short',
        timeStyle: 'medium',
    });
}

function logResults(entries) {
    ensureDir(LOGS_DIR);
    const dateStr = new Date().toISOString().split('T')[0];
    const logFile = path.join(LOGS_DIR, `${dateStr}.json`);
    fs.writeFileSync(logFile, JSON.stringify(entries, null, 2));
}

// ─── Lockfile ────────────────────────────────────────────────────

function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

export function acquireLock(force = false) {
    if (fs.existsSync(LOCK_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
            if (!force && isProcessAlive(data.pid)) {
                const age = Math.round((Date.now() - data.startedAt) / 1000);
                console.log(
                    `\n🔒 Another joiner instance is running (PID ${data.pid}, ${age}s ago)`,
                );
                console.log(`   Use --force to override.\n`);
                return false;
            }
            console.log(
                `🪓 Cleaning up stale lock (PID ${data.pid} is dead)`,
            );
        } catch {
            // Corrupt lock file
        }
    }
    fs.writeFileSync(
        LOCK_FILE,
        JSON.stringify({
            pid: process.pid,
            startedAt: Date.now(),
            startedAtISO: new Date().toISOString(),
        }),
    );
    return true;
}

export function releaseLock() {
    try {
        if (fs.existsSync(LOCK_FILE)) {
            const data = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
            if (data.pid === process.pid) {
                fs.unlinkSync(LOCK_FILE);
            }
        }
    } catch {
        /* best effort */
    }
}

process.on('exit', releaseLock);
process.on('SIGINT', () => {
    releaseLock();
    process.exit(1);
});
process.on('SIGTERM', () => {
    releaseLock();
    process.exit(0);
});

// ─── Browser ─────────────────────────────────────────────────────

async function launchBrowser(headless = true) {
    const userDataDir =
        process.env.DANIELSENSUAL_SHARE_USER_DATA_DIR || DEFAULT_USER_DATA_DIR;

    const useHeadless = headless && !process.env.DISPLAY;

    const systemChrome = [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
    ].find((p) => {
        try {
            return fs.existsSync(p);
        } catch {
            return false;
        }
    });

    const launchOpts = {
        headless: useHeadless ? 'new' : false,
        protocolTimeout: 300_000,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--user-data-dir=${userDataDir}`,
            '--disable-notifications',
            '--disable-blink-features=AutomationControlled',
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
        return (
            !url.includes('/login') &&
            !url.includes('/checkpoint') &&
            !url.includes('r.php')
        );
    } catch {
        return false;
    }
}

// ─── Group Status Detection ──────────────────────────────────────

/**
 * Navigate to a group URL and detect membership status.
 * Returns one of: 'member' | 'not_member' | 'pending' | 'unavailable' | 'login_required'
 */
async function detectGroupStatus(page, groupUrl) {
    page.setDefaultNavigationTimeout(0);
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded' });
    await randomDelay(2500, 4000);

    return page.evaluate(() => {
        const bodyText = document.body?.textContent || '';
        const url = window.location.href;

        // Unavailable / banned
        if (
            bodyText.includes("This content isn't available right now") ||
            bodyText.includes('This content is not available') ||
            bodyText.includes("this page isn't available")
        ) {
            return { status: 'unavailable', detail: 'Group deleted or restricted' };
        }

        // Login required
        if (url.includes('/login') || url.includes('/checkpoint')) {
            return { status: 'login_required', detail: 'Session expired' };
        }

        // Check for Join / Cancel request buttons
        const btns = Array.from(document.querySelectorAll('div[role="button"]'));

        // "Cancel request" = already pending
        const cancelBtn = btns.find((b) => {
            const txt = b.textContent?.trim() || '';
            const aria = b.getAttribute('aria-label') || '';
            return (
                txt === 'Cancel request' ||
                aria === 'Cancel request' ||
                txt === 'Cancel Request'
            );
        });
        if (cancelBtn) {
            return { status: 'pending', detail: 'Join request already pending' };
        }

        // "Join group" = not a member
        const joinBtn = btns.find((b) => {
            const txt = b.textContent?.trim() || '';
            const aria = b.getAttribute('aria-label') || '';
            return (
                txt === 'Join group' ||
                txt === 'Join Group' ||
                aria === 'Join group' ||
                aria === 'Join Group'
            );
        });
        if (joinBtn) {
            return { status: 'not_member', detail: 'Join button found' };
        }

        // No join button found — likely already a member
        return { status: 'member', detail: 'No join button detected' };
    });
}

/**
 * Click the "Join group" button on the current page.
 * Returns true if clicked successfully.
 */
async function clickJoinButton(page) {
    const clicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('div[role="button"]'));
        const joinBtn = btns.find((b) => {
            const txt = b.textContent?.trim() || '';
            const aria = b.getAttribute('aria-label') || '';
            return (
                txt === 'Join group' ||
                txt === 'Join Group' ||
                aria === 'Join group' ||
                aria === 'Join Group'
            );
        });
        if (joinBtn) {
            joinBtn.click();
            return true;
        }
        return false;
    });

    if (!clicked) return false;

    // Wait for the join flow to process
    await randomDelay(2000, 3000);

    // Some groups have answer-questions modals — handle them
    const hasModal = await page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"]');
        if (!dialog) return false;

        const dialogText = dialog.textContent || '';
        // Check if it's a "Answer questions" dialog
        if (
            dialogText.includes('Answer') ||
            dialogText.includes('question') ||
            dialogText.includes('agree to the group rules')
        ) {
            // Look for checkboxes to check (agree to rules)
            const checkboxes = dialog.querySelectorAll(
                'input[type="checkbox"], div[role="checkbox"]',
            );
            checkboxes.forEach((cb) => {
                if (
                    cb.getAttribute('aria-checked') !== 'true' &&
                    !cb.checked
                ) {
                    cb.click();
                }
            });

            // Look for submit / "Submit" / "Join group" button inside dialog
            const dialogBtns = Array.from(
                dialog.querySelectorAll('div[role="button"], button'),
            );
            const submitBtn = dialogBtns.find((b) => {
                const txt = b.textContent?.trim() || '';
                return (
                    txt === 'Submit' ||
                    txt === 'Join group' ||
                    txt === 'Join Group' ||
                    txt === 'Agree and join' ||
                    txt === 'Agree & join'
                );
            });
            if (submitBtn) {
                submitBtn.click();
                return true;
            }
        }
        return false;
    });

    if (hasModal) {
        await randomDelay(2000, 3000);
    }

    return true;
}

// ─── Main Join Flow ──────────────────────────────────────────────

/**
 * Join all unregistered groups from the provided list.
 *
 * @param {object} options
 * @param {Array}  options.groups   - Array of { name, url, batch? } objects
 * @param {boolean} [options.dryRun=false]
 * @param {boolean} [options.headless=true]
 * @param {number}  [options.max=0] - Limit joins (0 = no limit)
 * @param {number}  [options.batch=0] - Filter to specific batch
 */
export async function joinUnregisteredGroups(options = {}) {
    const {
        groups,
        dryRun = false,
        headless = true,
        max = 0,
        batch = 0,
    } = options;

    // Filter by batch if specified
    let targetGroups = groups;
    if (batch > 0) {
        targetGroups = groups.filter((g) => (g.batch || 1) === batch);
    }
    if (max > 0) {
        targetGroups = targetGroups.slice(0, max);
    }

    // Deduplicate by URL
    const seen = new Set();
    targetGroups = targetGroups.filter((g) => {
        const key = g.url.replace(/\/$/, '').toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    console.log('');
    console.log('🔗 Daniel Sensual — Facebook Group Joiner');
    console.log('═'.repeat(55));
    console.log(`   Mode:      ${dryRun ? '🔒 DRY RUN (audit only)' : '🔴 LIVE'}`);
    console.log(`   Groups:    ${targetGroups.length}${batch ? ` (batch ${batch})` : ''}`);
    console.log(`   Time:      ${timestamp()}`);
    console.log('');

    const browser = await launchBrowser(headless);
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(0);
    page.setDefaultTimeout(120000);

    const results = [];

    try {
        // Verify login
        const loggedIn = await isLoggedIn(page);
        if (!loggedIn) {
            console.log('❌ Not logged in. Run: node scripts/danielsensual-share.js --login');
            await browser.close();
            return { success: false, error: 'Not logged in', results };
        }
        console.log('✅ Logged in to Facebook');
        console.log('');

        let joined = 0;
        let alreadyMember = 0;
        let pending = 0;
        let failed = 0;

        for (let i = 0; i < targetGroups.length; i++) {
            const group = targetGroups[i];
            const label = `[${i + 1}/${targetGroups.length}]`;

            console.log(`${label} 📌 ${group.name}`);

            try {
                const { status, detail } = await detectGroupStatus(page, group.url);

                const entry = {
                    name: group.name,
                    url: group.url,
                    batch: group.batch || null,
                    status,
                    detail,
                    action: 'none',
                    timestamp: new Date().toISOString(),
                };

                switch (status) {
                    case 'member':
                        console.log(`   ✅ Already a member`);
                        alreadyMember++;
                        break;

                    case 'pending':
                        console.log(`   ⏳ Join request already pending`);
                        pending++;
                        break;

                    case 'not_member':
                        if (dryRun) {
                            console.log(`   🔍 Not a member — would join (dry run)`);
                            entry.action = 'would_join';
                        } else {
                            const clickedJoin = await clickJoinButton(page);
                            if (clickedJoin) {
                                console.log(`   🎯 Clicked "Join group" — request sent!`);
                                entry.action = 'joined';
                                joined++;
                            } else {
                                console.log(`   ❌ Join button disappeared`);
                                entry.action = 'join_failed';
                                entry.detail = 'Button not found on click attempt';
                                failed++;
                            }
                        }
                        break;

                    case 'unavailable':
                        console.log(`   ⚠️  Group unavailable (deleted/banned/restricted)`);
                        failed++;
                        break;

                    case 'login_required':
                        console.log(`   ❌ Session expired — stopping`);
                        entry.action = 'session_expired';
                        results.push(entry);
                        throw new Error('Session expired mid-run');

                    default:
                        console.log(`   ❓ Unknown status: ${status}`);
                        failed++;
                }

                results.push(entry);
            } catch (error) {
                if (error.message === 'Session expired mid-run') throw error;

                console.log(`   ❌ Error: ${error.message}`);
                results.push({
                    name: group.name,
                    url: group.url,
                    status: 'error',
                    detail: error.message,
                    action: 'none',
                    timestamp: new Date().toISOString(),
                });
                failed++;
            }

            // Human-like delay between groups (15-30s)
            if (i < targetGroups.length - 1) {
                const waitSec = Math.floor(Math.random() * 16) + 15;
                console.log(`   ⏳ Waiting ${waitSec}s before next group...`);
                await new Promise((r) => setTimeout(r, waitSec * 1000));
            }
        }

        await browser.close();

        // Log results
        logResults(results);

        console.log('');
        console.log('═'.repeat(55));
        console.log(`✅ Done! ${timestamp()}`);
        console.log(`   Already member: ${alreadyMember}`);
        console.log(`   Joined/requested: ${joined}`);
        console.log(`   Pending: ${pending}`);
        console.log(`   Failed: ${failed}`);
        console.log(`   Log: logs/danielsensual-joins/${new Date().toISOString().split('T')[0]}.json`);

        return { success: true, joined, alreadyMember, pending, failed, results };
    } catch (error) {
        console.error(`❌ Fatal error: ${error.message}`);
        await browser.close();
        logResults(results);
        return {
            success: false,
            error: error.message,
            joined: 0,
            alreadyMember: 0,
            pending: 0,
            failed: 0,
            results,
        };
    }
}

/**
 * Print a membership audit table (no browser needed for formatting,
 * but browser IS needed to actually check — this wraps joinUnregisteredGroups
 * in dry-run mode).
 */
export async function auditGroupMembership(options = {}) {
    return joinUnregisteredGroups({ ...options, dryRun: true });
}

export default { joinUnregisteredGroups, auditGroupMembership, acquireLock, releaseLock };

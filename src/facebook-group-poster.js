/**
 * Facebook Group Poster — Puppeteer Browser Automation
 * Posts text, images, and videos to Facebook Groups using a persistent Chrome session.
 * Same pattern as linkedin-responder.js.
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_DATA_DIR = path.join(process.env.HOME, '.facebook-chrome-profile');
const LOGS_DIR = path.join(__dirname, '..', 'logs', 'facebook-groups');

// ─── Target Groups ──────────────────────────────────────────────
// CLIENT_GROUPS = where BUYERS hang out (realtors, business owners, brides)
// NETWORKING_GROUPS = industry peers (filmmakers, photographers) — portfolio/referral only

// Primary client groups — people who HIRE videographers
const CLIENT_GROUPS = [
    // Real Estate (avg $500–$2K per listing video)
    { name: 'ORLANDO REAL ESTATE INVESTORS', url: 'https://www.facebook.com/groups/orlandorealestateinvestors/' },         // 38K members
    { name: 'ORLANDO REAL ESTATE', url: 'https://www.facebook.com/groups/orlandorealestate/' },                             // 35K members
    { name: 'Real Estate Investors Orlando', url: 'https://www.facebook.com/groups/realesttateinvestorsorlando/' },          // 19K members
    { name: 'Florida Luxury Real Estate Listings', url: 'https://www.facebook.com/groups/FloridaLuxuryRealEstateListings/' },// 4.4K members

    // Restaurant / Hospitality (avg $1K–$3K)
    { name: 'Orlando Restaurant Owners', url: 'https://www.facebook.com/groups/orladorestaurantowners/' },                   // 3.2K members

    // Business Owners / Entrepreneurs (avg $1.5K–$5K)
    { name: 'Florida Small Business Network', url: 'https://www.facebook.com/groups/floridasmallbusinessnetwork/' },         // 136K members
    { name: 'Orlando Networking Group', url: 'https://www.facebook.com/groups/orlandonetworkinggroup/' },                     // 37K members
    { name: 'Downtown Orlando Business & Professionals Network', url: 'https://www.facebook.com/groups/downtownorlando/' }, // 21K members
    { name: 'Central Florida Small Business Network', url: 'https://www.facebook.com/groups/centralfloridasmallbiz/' },      // 13K members
    { name: 'ORLANDO BUSINESS (Windermere/Metro West)', url: 'https://www.facebook.com/groups/809532443017715/' },
    { name: 'Edgy Entrepreneur Community', url: 'https://www.facebook.com/groups/edgyentrepreneurs/' },
    { name: 'Nightlife Roundtable', url: 'https://www.facebook.com/groups/nightliferoundtable/' },

    // Wedding (avg $2K–$5K)
    { name: 'South Florida Weddings', url: 'https://www.facebook.com/groups/southfloridaweddings/' },                        // 36K members
    { name: 'Orlando Wedding Vendors (23K)', url: 'https://www.facebook.com/groups/orlandoweddingvendors/' },                // 23K members
    { name: 'Orlando Brides: Wedding Ideas & Vendors', url: 'https://www.facebook.com/groups/orlandobrides/' },              // 15K members
    { name: 'Orlando Wedding Vendors', url: 'https://www.facebook.com/groups/128191537212383/' },
    { name: 'Brides/Grooms on a Budget (Central Florida)', url: 'https://www.facebook.com/groups/bridesonabudgetcentralflorida/' },
];

// Industry / networking groups — post portfolio/reels occasionally for referrals
const NETWORKING_GROUPS = [
    { name: 'Orlando Film & Commercial Production', url: 'https://www.facebook.com/groups/248535301668744/' },
    { name: 'Orlando Filmmakers', url: 'https://www.facebook.com/groups/504090709674065/' },
    { name: 'Central Florida Drones', url: 'https://www.facebook.com/groups/1692583534367153/' },
    { name: 'Orlando Photography Group', url: 'https://www.facebook.com/groups/813504765340223/' },
    { name: 'Filming in Florida', url: 'https://www.facebook.com/groups/filminginfl/' },
    { name: 'Orlando FL Actors | Filmmakers | Models', url: 'https://www.facebook.com/groups/orlandoflactors/' },
    { name: 'Florida Independent Filmmakers', url: 'https://www.facebook.com/groups/floridaindependentfilmmakers/' },
    { name: 'Central Florida Film Network', url: 'https://www.facebook.com/groups/centralfloridafilmnetwork/' },
];

// Default: only post to client groups (where the money is)
const GROUPS = [...CLIENT_GROUPS];

// ─── Helpers ─────────────────────────────────────────────────────

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function randomDelay(minMs, maxMs) {
    const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise(r => setTimeout(r, ms));
}

function logResult(groupName, status, details = '') {
    ensureDir(LOGS_DIR);
    const dateStr = new Date().toISOString().split('T')[0];
    const logFile = path.join(LOGS_DIR, `${dateStr}.json`);

    let logs = [];
    if (fs.existsSync(logFile)) {
        logs = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
    }

    logs.push({
        timestamp: new Date().toISOString(),
        group: groupName,
        status,
        details,
    });

    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
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
        // If redirected to login or checkpoint, not logged in
        return !url.includes('/login') && !url.includes('/checkpoint') && !url.includes('r.php');
    } catch {
        return false;
    }
}

/**
 * Opens a non-headless browser for manual Facebook login.
 * Session persists in ~/.facebook-chrome-profile/
 */
export async function saveSession() {
    console.log('');
    console.log('🔐 Facebook Session Saver');
    console.log('═'.repeat(50));
    console.log('');
    console.log('A browser will open. Please:');
    console.log('1. Log in to Facebook');
    console.log('2. Complete any 2FA verification');
    console.log('3. Once logged in, press Enter in this terminal');
    console.log('');
    console.log('Your login will be saved to a Chrome profile and');
    console.log('remembered for future automated runs.');
    console.log('');

    const browser = await launchBrowser(false);
    const page = await browser.newPage();
    await page.goto('https://www.facebook.com/login');

    console.log('⏳ Waiting for login... (press Enter when done)');

    await new Promise(resolve => {
        process.stdin.once('data', resolve);
    });

    const loggedIn = await isLoggedIn(page);
    await browser.close();

    if (loggedIn) {
        console.log('');
        console.log('✅ Session saved! You can now post to groups.');
        console.log(`   Profile stored in: ${USER_DATA_DIR}`);
    } else {
        console.log('');
        console.log('⚠️ Login not detected. Please try again.');
    }

    return loggedIn;
}

// ─── Page Identity Switcher ──────────────────────────────────────

/**
 * Switch Facebook browsing identity to a Page (e.g. MediaGeekz Productions).
 * After calling this, all actions (including group posts) happen as the Page.
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} pageName - Partial name match for the page (e.g. 'MediaGeekz')
 * @returns {Promise<boolean>} true if switch succeeded
 */
async function switchToPage(page, pageName = 'MediaGeekz') {
    console.log(`🔄 Switching identity to "${pageName}" page...`);

    // 1. Go to Facebook home
    await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(1500, 2500);

    // 2. Click the profile picture / avatar in the top-right navbar
    const profileClicked = await page.evaluate(() => {
        // Facebook's top-right profile pic is inside the navigation bar
        const avatars = Array.from(document.querySelectorAll('svg[aria-label="Your profile"], image[href], img'));
        // The last avatar-like element in the navbar area is usually the profile button
        const navBar = document.querySelector('div[role="navigation"][aria-label="Facebook"]')
            || document.querySelector('div[role="banner"]');
        if (!navBar) return false;

        const profileLinks = navBar.querySelectorAll('a[aria-label], div[aria-label]');
        for (const el of profileLinks) {
            const label = el.getAttribute('aria-label') || '';
            if (label.includes('Account') || label.includes('profile') || label.includes('menu')) {
                el.click();
                return true;
            }
        }

        // Fallback: click the last clickable element in the top-right nav icons
        const navButtons = navBar.querySelectorAll('[role="button"], a');
        if (navButtons.length > 0) {
            const last = navButtons[navButtons.length - 1];
            last.click();
            return true;
        }

        return false;
    });

    if (!profileClicked) {
        // Visual fallback: click at the profile pic position (top-right corner)
        await page.mouse.click(1350, 30);
    }

    await randomDelay(2000, 3000);

    // 3. Look for the page name in the dropdown and click it
    const pageSwitched = await page.evaluate((targetName) => {
        const links = Array.from(document.querySelectorAll('a[role="link"], div[role="button"], div[role="menuitem"]'));
        for (const link of links) {
            const text = link.textContent?.trim() || '';
            const ariaLabel = link.getAttribute('aria-label') || '';
            if (text.includes(targetName) || ariaLabel.includes(targetName)) {
                // Don't click "See all profiles" — click the actual page name
                if (!text.includes('See all') && !text.includes('Log Out')) {
                    link.click();
                    return true;
                }
            }
        }

        // Fallback: look for "See all profiles" first, then find the page
        const seeAll = links.find(l =>
            l.textContent?.includes('See all profiles') || l.textContent?.includes('See all')
        );
        if (seeAll) {
            seeAll.click();
            return 'SEE_ALL'; // Need a second click
        }

        return false;
    }, pageName);

    if (pageSwitched === 'SEE_ALL') {
        // Wait for profiles list to load, then find the page
        await randomDelay(2000, 3000);
        const found = await page.evaluate((targetName) => {
            const items = Array.from(document.querySelectorAll('a[role="link"], div[role="button"], div[role="radio"]'));
            for (const item of items) {
                if ((item.textContent || '').includes(targetName)) {
                    item.click();
                    return true;
                }
            }
            return false;
        }, pageName);

        if (!found) {
            console.log(`   ⚠️ Could not find "${pageName}" in profile list`);
            return false;
        }
    } else if (!pageSwitched) {
        console.log(`   ⚠️ Could not find page switcher or "${pageName}"`);
        return false;
    }

    await randomDelay(3000, 5000);

    // 4. Verify the switch by checking the current identity
    const currentIdentity = await page.evaluate(() => {
        // After switching, the page usually reloads to the Page's feed
        const title = document.title || '';
        const headerName = document.querySelector('h1')?.textContent || '';
        return { title, headerName, url: window.location.href };
    });

    console.log(`   ✅ Now browsing as: "${currentIdentity.headerName || pageName}"`);
    return true;
}

// ─── Group Posting Logic ─────────────────────────────────────────

/**
 * Post to a single Facebook group.
 * @param {import('puppeteer').Page} page
 * @param {object} options
 * @param {string} options.groupUrl - Full URL of the Facebook group
 * @param {string} options.text - Post caption / body text
 * @param {string} [options.mediaPath] - Absolute path to image or video file
 * @param {'image'|'video'} [options.mediaType] - Type of media attachment
 * @param {boolean} [options.dryRun=false] - Navigate but don't submit
 */
async function postToGroup(page, { groupUrl, text, mediaPath, mediaType, dryRun = false }) {
    // Navigate to the group
    await page.goto(groupUrl, { waitUntil: 'networkidle2', timeout: 45000 });
    await randomDelay(2000, 3000);

    // ── Membership check: skip if "Join group" button is present ──
    const isMember = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('div[role="button"]'));
        const joinBtn = btns.find(b => {
            const label = b.getAttribute('aria-label') || '';
            const txt = b.textContent?.trim() || '';
            return label === 'Join group' || txt === 'Join group' || txt === 'Cancel request';
        });
        return !joinBtn; // true if no join button found = already a member
    });

    if (!isMember) {
        throw new Error('Not a member of this group (join pending or required)');
    }

    // Click the "Write something..." composer prompt to open the post dialog
    const composerSelectors = [
        'div[role="button"] span::-p-text(Write something)',
        'div[role="button"] span::-p-text(write something)',
        'div[role="button"] span::-p-text(What\'s on your mind)',
        'div[role="button"][tabindex="0"]',
    ];

    let composerClicked = false;
    for (const sel of composerSelectors) {
        try {
            const el = await page.waitForSelector(sel, { timeout: 5000 });
            if (el) {
                await el.click();
                composerClicked = true;
                break;
            }
        } catch {
            // Try next selector
        }
    }

    if (!composerClicked) {
        // Fallback: try clicking any element that looks like a post prompt
        try {
            await page.evaluate(() => {
                const candidates = Array.from(document.querySelectorAll('div[role="button"]'));
                const prompt = candidates.find(el => {
                    const txt = el.textContent?.toLowerCase() || '';
                    return txt.includes('write something') || txt.includes('what\'s on your mind');
                });
                if (prompt) prompt.click();
            });
            composerClicked = true;
        } catch {
            throw new Error('Could not find group post composer');
        }
    }

    // Wait for the post dialog / editor to appear
    await randomDelay(2000, 4000);

    // Find the contenteditable text area in the dialog
    const editorSelectors = [
        'div[role="dialog"] div[contenteditable="true"][role="textbox"]',
        'div[role="dialog"] div[contenteditable="true"]',
        'form div[contenteditable="true"]',
        'div[contenteditable="true"][data-lexical-editor="true"]',
        'div[contenteditable="true"][role="textbox"]',
    ];

    let editor = null;
    for (const sel of editorSelectors) {
        try {
            editor = await page.waitForSelector(sel, { timeout: 5000 });
            if (editor) break;
        } catch {
            // Try next
        }
    }

    if (!editor) {
        throw new Error('Could not find post text editor');
    }

    // ── Text injection via clipboard paste (reliable with Draft.js/React) ──
    await editor.click();
    await randomDelay(500, 1000);

    // Use clipboard paste to inject text — works reliably with Facebook's
    // Draft.js/React composer where keyboard.type() often fails with emojis
    const textInserted = await page.evaluate((postText) => {
        const textbox = document.querySelector(
            'div[role="dialog"] div[contenteditable="true"][role="textbox"]'
        ) || document.querySelector('div[contenteditable="true"][role="textbox"]');

        if (!textbox) return false;
        textbox.focus();

        // Method 1: Clipboard paste event (works on most Draft.js editors)
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/plain', postText);
        const pasteEvent = new ClipboardEvent('paste', {
            clipboardData: dataTransfer,
            bubbles: true,
            cancelable: true,
        });
        const handled = textbox.dispatchEvent(pasteEvent);

        // Method 2: Fallback to execCommand if paste didn't work
        if (handled && textbox.textContent.trim().length === 0) {
            document.execCommand('insertText', false, postText);
        }

        return textbox.textContent.trim().length > 0;
    }, text);

    if (!textInserted) {
        // Final fallback: use keyboard.type (slower but sometimes works)
        console.log('   ⚠️ Paste failed, falling back to keyboard.type...');
        await page.keyboard.type(text, { delay: 20 });
    }

    await randomDelay(1000, 2000);

    // Attach media if provided
    if (mediaPath && fs.existsSync(mediaPath)) {
        // Look for the photo/video button in the composer
        const mediaButtonSelectors = [
            'div[role="dialog"] div[role="button"] span::-p-text(Photo/video)',
            'div[role="dialog"] div[role="button"] span::-p-text(Photo/Video)',
            'div[role="dialog"] div[role="button"] span::-p-text(photo/video)',
            'input[type="file"][accept*="image"],input[type="file"][accept*="video"]',
        ];

        let fileInput = null;

        // First, try clicking the Photo/Video button to reveal the file input
        for (const sel of mediaButtonSelectors) {
            try {
                if (sel.includes('input[type="file"]')) {
                    fileInput = await page.$(sel);
                    if (fileInput) break;
                } else {
                    const btn = await page.waitForSelector(sel, { timeout: 3000 });
                    if (btn) {
                        await btn.click();
                        await randomDelay(1500, 2500);
                        break;
                    }
                }
            } catch {
                // Try next
            }
        }

        // Now find the actual file input element
        if (!fileInput) {
            try {
                fileInput = await page.$('input[type="file"][accept*="image"],input[type="file"][accept*="video"]');
            } catch { /* continue without media */ }
        }

        if (!fileInput) {
            // Broader search for any file input
            try {
                fileInput = await page.$('input[type="file"]');
            } catch { /* continue without media */ }
        }

        if (fileInput) {
            await fileInput.uploadFile(mediaPath);
            console.log(`   📎 Attached ${mediaType}: ${path.basename(mediaPath)}`);

            // Wait for upload to process (longer for video)
            const uploadWait = mediaType === 'video' ? [15000, 30000] : [5000, 10000];
            await randomDelay(...uploadWait);

            // Wait until the Post button is no longer disabled (upload complete)
            try {
                await page.waitForFunction(() => {
                    const btns = Array.from(document.querySelectorAll('div[role="dialog"] div[role="button"], div[role="dialog"] button'));
                    const postBtn = btns.find(b => b.textContent?.trim() === 'Post');
                    return postBtn && !postBtn.getAttribute('aria-disabled');
                }, { timeout: 120000 }); // 2 minute max for video upload
            } catch {
                console.log('   ⚠️ Upload may still be processing, attempting to post anyway...');
            }
        } else {
            console.log('   ⚠️ Could not find file input — posting text only');
        }
    }

    // Click the Post button
    if (dryRun) {
        console.log('   🔒 DRY RUN — skipping Post button click');
        return true;
    }

    const postButtonClicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('div[role="dialog"] div[role="button"], div[role="dialog"] button'));
        const postBtn = btns.find(b => b.textContent?.trim() === 'Post');
        if (postBtn && !postBtn.getAttribute('aria-disabled')) {
            postBtn.click();
            return true;
        }
        return false;
    });

    if (!postButtonClicked) {
        throw new Error('Could not click Post button (may be disabled)');
    }

    // Wait for the dialog to close (post submitted)
    await randomDelay(3000, 5000);

    return true;
}

// ─── Main Export ─────────────────────────────────────────────────

/**
 * Post to all configured Facebook groups.
 * @param {object} options
 * @param {string} options.text - Post caption / body text
 * @param {string} [options.mediaPath] - Absolute path to media file
 * @param {'image'|'video'} [options.mediaType] - Type of media
 * @param {boolean} [options.dryRun=false] - Navigate but don't submit
 * @param {boolean} [options.headless=true] - Run headless
 * @param {string[]} [options.filterGroups] - Only post to groups whose names match (substring)
 */
export async function postToAllGroups(options = {}) {
    const {
        text,
        mediaPath,
        mediaType,
        dryRun = false,
        headless = true,
        filterGroups = [],
        postAsPage = 'MediaGeekz', // Page name to switch to (null = post as personal profile)
    } = options;

    if (!text) {
        throw new Error('Post text is required');
    }

    // Determine which groups to post to
    let targetGroups = GROUPS;
    if (filterGroups.length > 0) {
        targetGroups = GROUPS.filter(g =>
            filterGroups.some(f => g.name.toLowerCase().includes(f.toLowerCase()))
        );
        if (targetGroups.length === 0) {
            console.error('❌ No groups matched the filter. Available groups:');
            GROUPS.forEach(g => console.log(`   - ${g.name}`));
            return { success: false, posted: 0, failed: 0 };
        }
    }

    console.log('');
    console.log('📘 Facebook Group Poster');
    console.log('═'.repeat(50));
    console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`   Groups: ${targetGroups.length}`);
    console.log(`   Media: ${mediaPath ? `${mediaType} (${path.basename(mediaPath)})` : 'none'}`);
    console.log(`   Text: "${text.substring(0, 60)}..."`);
    console.log('');

    const browser = await launchBrowser(headless);
    const page = await browser.newPage();

    try {
        // Verify login
        const loggedIn = await isLoggedIn(page);
        if (!loggedIn) {
            console.log('❌ Not logged in. Run: npm run facebook:groups:session');
            await browser.close();
            return { success: false, error: 'Not logged in', posted: 0, failed: 0 };
        }
        console.log('✅ Logged in to Facebook');

        // Switch to Page identity if specified
        if (postAsPage) {
            const switched = await switchToPage(page, postAsPage);
            if (!switched) {
                console.log(`⚠️ Could not switch to "${postAsPage}" page. Posting as personal profile.`);
            }
        }

        console.log('');

        let posted = 0;
        let failed = 0;

        for (let i = 0; i < targetGroups.length; i++) {
            const group = targetGroups[i];
            console.log(`[${i + 1}/${targetGroups.length}] 📌 ${group.name}`);

            try {
                await postToGroup(page, {
                    groupUrl: group.url,
                    text,
                    mediaPath,
                    mediaType,
                    dryRun,
                });

                console.log(`   ✅ ${dryRun ? 'Would post' : 'Posted'} successfully`);
                logResult(group.name, dryRun ? 'dry_run' : 'posted', text.substring(0, 100));
                posted++;
            } catch (error) {
                console.log(`   ❌ Failed: ${error.message}`);
                logResult(group.name, 'failed', error.message);
                failed++;
            }

            // Random delay between groups (30-60 seconds) to look human
            if (i < targetGroups.length - 1) {
                const waitSec = Math.floor(Math.random() * 31) + 30;
                console.log(`   ⏳ Waiting ${waitSec}s before next group...`);
                await new Promise(r => setTimeout(r, waitSec * 1000));
            }
        }

        await browser.close();

        console.log('');
        console.log('═'.repeat(50));
        console.log(`✅ Done! ${posted} posted, ${failed} failed out of ${targetGroups.length} groups`);

        return { success: true, posted, failed };

    } catch (error) {
        console.error(`❌ Fatal error: ${error.message}`);
        await browser.close();
        return { success: false, error: error.message, posted: 0, failed: 0 };
    }
}

/**
 * Get the list of configured groups (for display/help).
 */
export function getConfiguredGroups() {
    return GROUPS;
}

export default { saveSession, postToAllGroups, getConfiguredGroups };

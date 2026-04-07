#!/usr/bin/env node
/**
 * Music Manager — Group Discovery Bot
 *
 * Searches Facebook for bachata/dance/latin groups and auto-joins them.
 * Uses Facebook's group search with configurable search terms.
 *
 * Usage:
 *   node scripts/discover-groups.js
 *   node scripts/discover-groups.js --search="bachata sensual"
 *   node scripts/discover-groups.js --dry-run
 *   node scripts/discover-groups.js --join-pending
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

dotenv.config();
puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_DATA_DIR = path.join(process.env.HOME, '.danielsensual-chrome-profile');
const DISCOVERY_FILE = path.join(__dirname, '..', 'logs', 'danielsensual-shares', 'discovered-groups.json');
const LOGS_DIR = path.join(__dirname, '..', 'logs', 'danielsensual-shares');

const args = process.argv.slice(2);

function getFlag(name) {
    const prefix = `--${name}=`;
    const arg = args.find(v => v.startsWith(prefix));
    return arg ? arg.slice(prefix.length).trim() : '';
}

const flags = {
    search: getFlag('search'),
    dryRun: args.includes('--dry-run'),
    joinPending: args.includes('--join-pending'),
    myGroups: args.includes('--my-groups'),
    latam: args.includes('--latam'),
    report: args.includes('--report'),
    help: args.includes('--help'),
    maxJoin: parseInt(getFlag('max-join') || '10', 10),
    minMembers: parseInt(getFlag('min-members') || '500', 10),
};

// Search terms to find bachata/dance groups worldwide
const SEARCH_TERMS = [
    'bachata sensual',
    'bachata dance',
    'bachata lovers',
    'bachata videos',
    'latin dance bachata',
    'salsa bachata',
    'bachata music',
    'bachata festival',
    'bachata social dance',
    'dominican bachata',
    'bachata asia',
    'bachata europe',
    'bachata colombia',
    'bachata españa',
    'kizomba bachata',
];

// LATAM-focused search terms (per Daniel's 2022 playbook)
// The audience is 90%+ LATAM — these are the money groups
const LATAM_SEARCH_TERMS = [
    'bachata venezuela',
    'bachata argentina',
    'bachata brasil',
    'bachata colombia',
    'bachata dominicana',
    'bachata republica dominicana',
    'baile latino',
    'musica latina',
    'reggaeton y bachata',
    'bachata romantica',
    'salsa y bachata latina',
    'grupos de bachata',
    'bachata en español',
    'latin dance community',
    'bachata world',
    'bachata mexico',
    'bachata peru',
    'bachata chile',
    'bachata caribbean',
    'caribbean dance',
];

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function randomDelay(minMs, maxMs) {
    return new Promise(r => setTimeout(r, Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs));
}

function loadDiscovered() {
    try {
        if (fs.existsSync(DISCOVERY_FILE)) {
            return JSON.parse(fs.readFileSync(DISCOVERY_FILE, 'utf-8'));
        }
    } catch { /* fresh */ }
    return { groups: [], joinRequests: [], lastScan: null };
}

function saveDiscovered(data) {
    ensureDir(path.dirname(DISCOVERY_FILE));
    data.lastScan = new Date().toISOString();
    fs.writeFileSync(DISCOVERY_FILE, JSON.stringify(data, null, 2));
}

// ─── Scrape My Groups Page ──────────────────────────────────────

async function scrapeMyGroups(page) {
    console.log('\n📋 Scraping your Facebook groups...');
    await page.goto('https://www.facebook.com/groups/joins/', {
        waitUntil: 'networkidle2',
        timeout: 30000,
    });
    await randomDelay(2000, 3000);

    // Scroll to load more groups
    for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await randomDelay(1500, 2500);
    }

    const groups = await page.evaluate(() => {
        const results = [];
        // Find all group links on the page
        const links = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
        const seen = new Set();

        for (const link of links) {
            const href = link.href || '';
            // Extract group URL (filter out feed, notifications, etc.)
            const match = href.match(/facebook\.com\/groups\/([^/?]+)/);
            if (!match) continue;

            const slug = match[1];
            if (['feed', 'discover', 'joins', 'notifications', 'settings'].includes(slug)) continue;
            if (seen.has(slug)) continue;
            seen.add(slug);

            // Try to get group name from nearby text
            const container = link.closest('[role="listitem"]') || link.closest('div');
            let name = '';
            if (container) {
                const nameEl = container.querySelector('span[dir="auto"]') || container.querySelector('span');
                name = nameEl?.textContent?.trim() || '';
            }
            if (!name) name = link.textContent?.trim() || slug;

            // Filter out nav items and tiny text
            if (name.length < 3 || name.length > 100) continue;

            results.push({
                name,
                url: `https://www.facebook.com/groups/${slug}/`,
                slug,
            });
        }

        return results;
    });

    console.log(`   Found ${groups.length} groups you're a member of\n`);
    return groups;
}

// ─── Search for Groups ──────────────────────────────────────────

async function searchForGroups(page, searchTerm) {
    const searchUrl = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(searchTerm)}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(2000, 4000);

    // Scroll 3 times to load more results
    for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await randomDelay(1500, 2500);
    }

    const groups = await page.evaluate(() => {
        const results = [];
        const seen = new Set();

        // Look for group cards in search results
        const links = Array.from(document.querySelectorAll('a[href*="/groups/"]'));

        for (const link of links) {
            const href = link.href || '';
            const match = href.match(/facebook\.com\/groups\/([^/?]+)/);
            if (!match) continue;

            const slug = match[1];
            if (['feed', 'discover', 'joins', 'search'].includes(slug)) continue;
            if (seen.has(slug)) continue;
            seen.add(slug);

            // Get group info from the search result card
            const card = link.closest('[role="article"]') || link.closest('div[class]');
            let name = '';
            let memberText = '';
            let privacy = '';

            if (card) {
                // Name is usually the first strong text or heading
                const spans = Array.from(card.querySelectorAll('span[dir="auto"], span'));
                for (const span of spans) {
                    const t = span.textContent?.trim() || '';
                    if (t.length > 3 && t.length < 100 && !name) {
                        name = t;
                    }
                    if (/\d[\d,.]*\s*(members?|miembros?)/i.test(t)) {
                        memberText = t;
                    }
                    if (/public|private|público|privado/i.test(t)) {
                        privacy = t.toLowerCase();
                    }
                }
            }

            if (!name) name = slug;

            // Parse member count
            let members = 0;
            const memberMatch = memberText.match(/([\d,.]+)\s*(K|M|members?|miembros?)/i);
            if (memberMatch) {
                members = parseFloat(memberMatch[1].replace(/,/g, ''));
                if (memberMatch[2]?.toUpperCase() === 'K') members *= 1000;
                if (memberMatch[2]?.toUpperCase() === 'M') members *= 1000000;
            }

            results.push({
                name,
                url: `https://www.facebook.com/groups/${slug}/`,
                slug,
                members: Math.round(members),
                memberText,
                privacy,
            });
        }

        return results;
    });

    return groups;
}

// ─── Join a Group ───────────────────────────────────────────────

async function joinGroup(page, groupUrl, groupName) {
    await page.goto(groupUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(2000, 3000);

    // Check if already a member
    const status = await page.evaluate(() => {
        const bodyText = document.body?.textContent || '';

        if (bodyText.includes("This content isn't available right now")) {
            return 'dead';
        }

        const btns = Array.from(document.querySelectorAll('div[role="button"]'));

        // Already a member
        const hasComposer = btns.some(el => {
            const txt = el.textContent?.toLowerCase() || '';
            return txt.includes('write something') || txt.includes("what's on your mind");
        });
        if (hasComposer) return 'already_member';

        // Has join button
        const joinBtn = btns.find(b => {
            const txt = b.textContent?.trim() || '';
            return txt === 'Join group' || txt === 'Join Group';
        });
        if (joinBtn) return 'can_join';

        // Pending
        const pendingBtn = btns.find(b => {
            const txt = b.textContent?.trim() || '';
            return txt === 'Cancel request' || txt.includes('Pending');
        });
        if (pendingBtn) return 'pending';

        return 'unknown';
    });

    if (status === 'already_member') {
        console.log(`   ✅ Already a member`);
        return 'already_member';
    }

    if (status === 'dead') {
        console.log(`   💀 Group unavailable`);
        return 'dead';
    }

    if (status === 'pending') {
        console.log(`   ⏳ Join request already pending`);
        return 'pending';
    }

    if (status !== 'can_join') {
        console.log(`   ⚠️ Unknown status: ${status}`);
        return status;
    }

    // Click the Join button
    const joined = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('div[role="button"]'));
        const joinBtn = btns.find(b => {
            const txt = b.textContent?.trim() || '';
            return txt === 'Join group' || txt === 'Join Group';
        });
        if (joinBtn) {
            joinBtn.click();
            return true;
        }
        return false;
    });

    if (!joined) {
        console.log(`   ❌ Could not click Join button`);
        return 'failed';
    }

    await randomDelay(2000, 3000);

    // Check if there are questions to answer (some groups require)
    const hasQuestions = await page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"]');
        if (!dialog) return false;
        const text = dialog.textContent || '';
        return text.includes('Answer') || text.includes('question') || text.includes('Question');
    });

    if (hasQuestions) {
        // Try to submit with empty answers (or click Submit/Join)
        await page.evaluate(() => {
            const dialog = document.querySelector('div[role="dialog"]');
            if (!dialog) return;
            const btns = Array.from(dialog.querySelectorAll('div[role="button"]'));
            const submitBtn = btns.find(b => {
                const t = b.textContent?.trim() || '';
                return t === 'Submit' || t === 'Join Group' || t === 'Join group';
            });
            if (submitBtn) submitBtn.click();
        });
        await randomDelay(1000, 2000);
    }

    console.log(`   🔄 Join request sent`);
    return 'requested';
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
    if (flags.help) {
        console.log('\n🔍 Music Manager — Group Discovery Bot');
        console.log('═'.repeat(55));
        console.log('  --my-groups              List all groups you\'re in');
        console.log('  --search="bachata"       Search for specific term');
        console.log('  --latam                  Search LATAM-focused terms only');
        console.log('  --dry-run                Discover but don\'t join');
        console.log('  --max-join=10            Max groups to join (default: 10)');
        console.log('  --min-members=500        Skip groups with fewer members (default: 500)');
        console.log('  --report                 Show discovery stats\n');
        return;
    }

    console.log('\n🔍 Music Manager — Group Discovery Bot');
    console.log('═'.repeat(55));

    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--user-data-dir=${USER_DATA_DIR}`,
            '--disable-notifications',
            '--disable-blink-features=AutomationControlled',
        ],
        defaultViewport: { width: 1280, height: 900 },
    });
    const page = await browser.newPage();

    // Check login
    await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2', timeout: 30000 });
    if (page.url().includes('/login') || page.url().includes('/checkpoint')) {
        console.log('❌ Not logged in. Run: node scripts/danielsensual-share.js --login');
        await browser.close();
        return;
    }
    console.log('✅ Logged in\n');

    const discovery = loadDiscovered();

    // ── Mode: Report ──
    if (flags.report) {
        await browser.close();
        const total = discovery.groups.length;
        const members = discovery.groups.filter(g => g.status === 'member').length;
        const requested = discovery.groups.filter(g => g.status === 'requested').length;
        const discovered = discovery.groups.filter(g => g.status === 'discovered').length;

        console.log('📊 Discovery Report');
        console.log('═'.repeat(55));
        console.log(`   Total discovered:  ${total}`);
        console.log(`   Member:            ${members}`);
        console.log(`   Join requested:    ${requested}`);
        console.log(`   Discovered only:   ${discovered}`);
        if (discovery.lastScan) {
            console.log(`   Last scan:         ${new Date(discovery.lastScan).toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
        }

        // Top groups by member count
        const sorted = [...discovery.groups].filter(g => g.members > 0).sort((a, b) => (b.members || 0) - (a.members || 0));
        if (sorted.length > 0) {
            console.log('\n🏆 Top 10 by member count:');
            for (let i = 0; i < Math.min(10, sorted.length); i++) {
                const g = sorted[i];
                console.log(`   ${i + 1}. ${g.name} — ${g.members?.toLocaleString()} members [${g.status}]`);
            }
        }
        console.log('');
        return;
    }

    // ── Mode: My Groups ──
    if (flags.myGroups) {
        const myGroups = await scrapeMyGroups(page);
        await browser.close();

        // Save to discoveries
        for (const g of myGroups) {
            if (!discovery.groups.find(dg => dg.slug === g.slug)) {
                discovery.groups.push({ ...g, source: 'my_groups', discoveredAt: new Date().toISOString(), status: 'member' });
            }
        }
        saveDiscovered(discovery);

        console.log('📋 Your groups:');
        for (const g of myGroups) {
            console.log(`   • ${g.name} → ${g.url}`);
        }
        console.log(`\nSaved ${myGroups.length} groups to discovery file`);
        return;
    }

    // ── Mode: Search & Join ──
    let searches;
    if (flags.search) {
        searches = [flags.search];
    } else if (flags.latam) {
        searches = LATAM_SEARCH_TERMS;
        console.log('🌎 LATAM mode — searching Latin American dance groups\n');
    } else {
        searches = [...SEARCH_TERMS, ...LATAM_SEARCH_TERMS];
    }
    const allFound = [];
    const alreadyKnown = new Set(discovery.groups.map(g => g.slug));

    console.log(`🔎 Searching with ${searches.length} terms...\n`);

    for (let i = 0; i < searches.length; i++) {
        const term = searches[i];
        process.stdout.write(`[${i + 1}/${searches.length}] "${term}"... `);

        const groups = await searchForGroups(page, term);
        const newGroups = groups.filter(g => !alreadyKnown.has(g.slug));

        console.log(`${groups.length} found, ${newGroups.length} new`);

        for (const g of newGroups) {
            alreadyKnown.add(g.slug);
            allFound.push({ ...g, searchTerm: term });
        }

        await randomDelay(3000, 5000);
    }

    console.log(`\n📊 Total new groups discovered: ${allFound.length}`);

    // Filter by minimum member count
    const sizable = allFound.filter(g => !flags.minMembers || (g.members || 0) >= flags.minMembers);
    if (sizable.length < allFound.length) {
        console.log(`   Filtered to ${sizable.length} with ${flags.minMembers}+ members (skipped ${allFound.length - sizable.length} small groups)`);
    }

    if (sizable.length === 0) {
        console.log('No qualifying groups found.\n');
        await browser.close();
        return;
    }

    // Sort by member count (biggest first)
    sizable.sort((a, b) => (b.members || 0) - (a.members || 0));

    // Display top groups
    console.log('\n🏆 Top groups by member count:');
    for (let i = 0; i < Math.min(20, sizable.length); i++) {
        const g = sizable[i];
        console.log(`   ${i + 1}. ${g.name} — ${g.members?.toLocaleString() || '?'} members ${g.privacy || ''}`);
    }

    // Join groups (up to maxJoin)
    if (!flags.dryRun) {
        const toJoin = sizable.slice(0, flags.maxJoin);
        console.log(`\n🔗 Joining ${toJoin.length} groups...\n`);

        let joined = 0;
        for (let i = 0; i < toJoin.length; i++) {
            const g = toJoin[i];
            console.log(`[${i + 1}/${toJoin.length}] ${g.name} (${g.members?.toLocaleString() || '?'} members)`);

            const status = await joinGroup(page, g.url, g.name);

            // Save to discovery
            discovery.groups.push({
                ...g,
                source: 'search',
                discoveredAt: new Date().toISOString(),
                status,
            });

            if (status === 'requested' || status === 'already_member') {
                joined++;
            }

            // Delay between joins
            if (i < toJoin.length - 1) {
                const waitSec = Math.floor(Math.random() * 21) + 10;
                console.log(`   ⏳ Waiting ${waitSec}s...`);
                await new Promise(r => setTimeout(r, waitSec * 1000));
            }
        }

        console.log(`\n✅ Joined/requested: ${joined}/${toJoin.length}`);
    } else {
        console.log('\n🔒 DRY RUN — not joining any groups');
        // Still save discoveries
        for (const g of sizable) {
            discovery.groups.push({
                ...g,
                source: 'search',
                discoveredAt: new Date().toISOString(),
                status: 'discovered',
            });
        }
    }

    saveDiscovered(discovery);
    await browser.close();

    console.log(`📁 Discovery file: ${DISCOVERY_FILE}\n`);
}

main().catch(err => {
    console.error(`\n❌ Fatal: ${err.message}`);
    process.exit(1);
});

#!/usr/bin/env node
/**
 * Music Manager — Group Scanner
 *
 * Scans all configured groups and checks:
 * 1. Is the page accessible? (vs deleted/banned)
 * 2. Is Daniel a member?
 * 3. Can he post? (composer visible)
 *
 * Outputs a JSON report of verified vs dead groups.
 *
 * Usage:
 *   node scripts/scan-groups.js
 *   node scripts/scan-groups.js --batch=2
 *   node scripts/scan-groups.js --all   (scans share groups + original groups)
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { SHARE_GROUPS } from '../src/danielsensual-groups.js';

dotenv.config();
puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_DATA_DIR = path.join(process.env.HOME, '.danielsensual-chrome-profile');
const REPORT_FILE = path.join(__dirname, '..', 'logs', 'danielsensual-shares', 'group-scan-report.json');

const args = process.argv.slice(2);
const flags = {
    batch: parseInt((args.find(a => a.startsWith('--batch=')) || '').split('=')[1] || '0', 10),
    help: args.includes('--help'),
};

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function randomDelay(minMs, maxMs) {
    return new Promise(r => setTimeout(r, Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs));
}

async function scanGroup(page, group) {
    const result = {
        name: group.name,
        url: group.url,
        members: group.members,
        batch: group.batch,
        status: 'unknown',
        canPost: false,
        error: null,
    };

    try {
        await page.goto(group.url, { waitUntil: 'networkidle2', timeout: 30000 });
        await randomDelay(1500, 3000);

        const check = await page.evaluate(() => {
            const bodyText = document.body?.textContent || '';
            const url = window.location.href;

            // Dead / unavailable
            if (bodyText.includes("This content isn't available right now") ||
                bodyText.includes('This content is not available') ||
                bodyText.includes("this page isn't available") ||
                bodyText.includes("This Page Isn't Available")) {
                return { status: 'dead', canPost: false };
            }

            // Login wall
            if (url.includes('/login') || url.includes('/checkpoint')) {
                return { status: 'login_required', canPost: false };
            }

            // Join button = not a member
            const btns = Array.from(document.querySelectorAll('div[role="button"]'));
            const joinBtn = btns.find(b => {
                const label = b.getAttribute('aria-label') || '';
                const txt = b.textContent?.trim() || '';
                return label === 'Join group' || txt === 'Join group' || txt === 'Cancel request';
            });
            if (joinBtn) {
                return { status: 'not_member', canPost: false };
            }

            // Check for composer
            const hasComposer = btns.some(el => {
                const txt = el.textContent?.toLowerCase() || '';
                return txt.includes('write something') || txt.includes("what's on your mind");
            });

            // Get actual member count from page
            let memberCount = null;
            const memberEl = Array.from(document.querySelectorAll('span, a')).find(el => {
                const t = el.textContent || '';
                return /\d[\d,.]*\s*(members?|miembros?)/i.test(t);
            });
            if (memberEl) {
                const match = memberEl.textContent.match(/([\d,.]+)\s*(members?|miembros?)/i);
                if (match) memberCount = match[1].replace(/,/g, '');
            }

            // Get group name from page
            const h1 = document.querySelector('h1');
            const groupName = h1?.textContent?.trim() || null;

            return {
                status: hasComposer ? 'can_post' : 'member_no_composer',
                canPost: hasComposer,
                memberCount,
                groupName,
            };
        });

        result.status = check.status;
        result.canPost = check.canPost;
        if (check.memberCount) result.actualMembers = parseInt(check.memberCount, 10);
        if (check.groupName) result.actualName = check.groupName;

    } catch (err) {
        result.status = 'error';
        result.error = err.message;
    }

    return result;
}

async function main() {
    if (flags.help) {
        console.log('\n🔍 Music Manager — Group Scanner');
        console.log('═'.repeat(50));
        console.log('  node scripts/scan-groups.js          Scan all groups');
        console.log('  node scripts/scan-groups.js --batch=1 Scan batch 1 only\n');
        return;
    }

    let groups = [...SHARE_GROUPS];
    if (flags.batch > 0) {
        groups = groups.filter(g => g.batch === flags.batch);
    }

    console.log('\n🔍 Music Manager — Group Scanner');
    console.log('═'.repeat(55));
    console.log(`   Scanning ${groups.length} groups${flags.batch ? ` (batch ${flags.batch})` : ''}...`);
    console.log('');

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
    const url = page.url();
    if (url.includes('/login') || url.includes('/checkpoint')) {
        console.log('❌ Not logged in. Run: node scripts/danielsensual-share.js --login');
        await browser.close();
        return;
    }
    console.log('✅ Logged in\n');

    const results = [];
    const summary = { can_post: 0, dead: 0, not_member: 0, member_no_composer: 0, error: 0 };

    for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        process.stdout.write(`[${i + 1}/${groups.length}] ${g.name}... `);

        const result = await scanGroup(page, g);
        results.push(result);

        const icon = result.canPost ? '✅' : result.status === 'dead' ? '💀' : result.status === 'not_member' ? '🚫' : '⚠️';
        console.log(`${icon} ${result.status}${result.actualMembers ? ` (${result.actualMembers.toLocaleString()} members)` : ''}`);

        summary[result.status] = (summary[result.status] || 0) + 1;

        // Small delay between scans
        if (i < groups.length - 1) {
            await randomDelay(2000, 4000);
        }
    }

    await browser.close();

    // Save report
    ensureDir(path.dirname(REPORT_FILE));
    const report = {
        scannedAt: new Date().toISOString(),
        total: results.length,
        summary,
        groups: results,
    };
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

    // Print summary
    console.log('\n' + '═'.repeat(55));
    console.log('📊 SCAN RESULTS:');
    console.log(`   ✅ Can post:           ${summary.can_post || 0}`);
    console.log(`   💀 Dead/banned:        ${summary.dead || 0}`);
    console.log(`   🚫 Not a member:       ${summary.not_member || 0}`);
    console.log(`   ⚠️  Member, no composer: ${summary.member_no_composer || 0}`);
    console.log(`   ❌ Error:              ${summary.error || 0}`);
    console.log(`\n   Report saved: ${REPORT_FILE}`);

    // Print the working groups
    const working = results.filter(r => r.canPost);
    if (working.length > 0) {
        console.log(`\n✅ GROUPS YOU CAN POST TO (${working.length}):`);
        for (const g of working) {
            console.log(`   • ${g.actualName || g.name} (${(g.actualMembers || g.members || '?').toLocaleString()} members)`);
        }
    }

    const dead = results.filter(r => r.status === 'dead');
    if (dead.length > 0) {
        console.log(`\n💀 DEAD/BANNED GROUPS (${dead.length}):`);
        for (const g of dead) {
            console.log(`   • ${g.name}`);
        }
    }

    console.log('');
}

main().catch(err => {
    console.error(`\n❌ Fatal: ${err.message}`);
    process.exit(1);
});

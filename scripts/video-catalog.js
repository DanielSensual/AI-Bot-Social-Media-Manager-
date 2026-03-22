#!/usr/bin/env node
/**
 * Music Manager Bot — Video Catalog
 *
 * Scrapes Daniel Sensual's Facebook profile for video/reel posts
 * and builds a catalog for automatic rotation.
 *
 * Features:
 * - Scrapes videos/reels from profile
 * - Tracks share counts per video
 * - Rotates promotion (least-shared first)
 * - Auto-detects new uploads
 * - Integrates with share CLI via state file
 *
 * Usage:
 *   node scripts/video-catalog.js --scan          Scrape profile for videos
 *   node scripts/video-catalog.js --list          Show all cataloged videos
 *   node scripts/video-catalog.js --next          Pick next video to promote & set it
 *   node scripts/video-catalog.js --add=URL       Manually add a video URL
 *   node scripts/video-catalog.js --help          Show help
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
const CATALOG_FILE = path.join(__dirname, '..', 'data', 'video-catalog.json');
const SHARE_URL_FILE = path.join(__dirname, '..', '.danielsensual-share-url.json');

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function randomDelay(min, max) { return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min)); }

const args = process.argv.slice(2);
function getFlag(name) {
    const prefix = `--${name}=`;
    const arg = args.find(v => v.startsWith(prefix));
    return arg ? arg.slice(prefix.length).trim() : '';
}

const flags = {
    scan: args.includes('--scan'),
    list: args.includes('--list'),
    next: args.includes('--next'),
    add: getFlag('add'),
    help: args.includes('--help'),
};

// ─── Catalog State ──────────────────────────────────────────────

/**
 * Catalog format:
 * {
 *   videos: [{
 *     url: string,
 *     title: string,
 *     addedAt: ISO string,
 *     discoveredAt: ISO string,
 *     shareCount: number,
 *     lastShared: ISO string | null,
 *     source: 'scan' | 'manual',
 *     active: boolean
 *   }],
 *   lastScan: ISO string,
 *   lastRotation: ISO string
 * }
 */

function loadCatalog() {
    try {
        if (fs.existsSync(CATALOG_FILE)) {
            return JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf-8'));
        }
    } catch { /* fresh */ }
    return { videos: [], lastScan: null, lastRotation: null };
}

function saveCatalog(catalog) {
    ensureDir(path.dirname(CATALOG_FILE));
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2));
}

function addVideoToCatalog(catalog, url, title = '', source = 'manual') {
    // Normalize URL
    const normalizedUrl = url.replace(/\/$/, '').split('?')[0];

    // Check for duplicates
    const exists = catalog.videos.find(v =>
        v.url.replace(/\/$/, '').split('?')[0] === normalizedUrl
    );
    if (exists) return false;

    catalog.videos.push({
        url: normalizedUrl,
        title: title || `Video ${catalog.videos.length + 1}`,
        addedAt: new Date().toISOString(),
        discoveredAt: new Date().toISOString(),
        shareCount: 0,
        lastShared: null,
        source,
        active: true,
    });

    return true;
}

// ─── Profile Scraper ────────────────────────────────────────────

const DANIEL_PROFILE_URLS = [
    'https://www.facebook.com/danielsensual/videos',
    'https://www.facebook.com/danielsensual/reels',
];

async function scanProfileForVideos() {
    console.log('\n🔍 Scanning Daniel Sensual profile for videos...\n');

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
    if (page.url().includes('/login')) {
        console.log('❌ Not logged in. Run: node scripts/danielsensual-share.js --login');
        await browser.close();
        return [];
    }
    console.log('✅ Logged in\n');

    const allVideos = [];

    for (const profileUrl of DANIEL_PROFILE_URLS) {
        const isReels = profileUrl.includes('/reels');
        console.log(`📂 Scanning ${isReels ? 'Reels' : 'Videos'}: ${profileUrl}`);

        await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await randomDelay(2000, 3000);

        // Scroll to load more content
        for (let i = 0; i < 5; i++) {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await randomDelay(1500, 2500);
        }

        // Extract video URLs
        const videos = await page.evaluate((isReelsPage) => {
            const results = [];
            const links = Array.from(document.querySelectorAll('a[href]'));

            for (const link of links) {
                const href = link.href || '';

                // Match video/reel URLs
                const isVideo = href.includes('/videos/') ||
                                href.includes('/reel/') ||
                                href.includes('/watch/') ||
                                href.match(/\/share\/[rv]\//);

                if (!isVideo) continue;

                // Skip duplicates within this scan
                if (results.find(r => r.url === href)) continue;

                // Try to get a title/description
                const parentPost = link.closest('div[role="article"]') || link.closest('div');
                const textContent = parentPost?.querySelector('div[dir="auto"]')?.textContent?.trim() || '';
                const title = textContent.substring(0, 100) || (isReelsPage ? 'Reel' : 'Video');

                results.push({
                    url: href.split('?')[0], // Strip query params
                    title,
                    type: isReelsPage ? 'reel' : 'video',
                });
            }

            return results;
        }, isReels);

        console.log(`   Found ${videos.length} ${isReels ? 'reels' : 'videos'}`);
        allVideos.push(...videos);
    }

    await browser.close();
    return allVideos;
}

// ─── Video Rotation ─────────────────────────────────────────────

/**
 * Pick the next video to promote based on rotation strategy.
 *
 * Strategy: Least-shared first, with a preference for newer videos.
 * - Sort by shareCount ascending (least shared first)
 * - Break ties by addedAt descending (newer videos first)
 * - Skip videos shared in the last 24 hours
 */
function pickNextVideo(catalog) {
    const activeVideos = catalog.videos.filter(v => v.active);

    if (activeVideos.length === 0) return null;

    const now = Date.now();
    const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

    // Filter out videos on cooldown (shared in last 24h)
    const eligible = activeVideos.filter(v => {
        if (!v.lastShared) return true;
        return (now - new Date(v.lastShared).getTime()) > COOLDOWN_MS;
    });

    // If all on cooldown, use the least-recently-shared
    const pool = eligible.length > 0 ? eligible : activeVideos;

    // Sort by shareCount (ascending), then by addedAt (newest first)
    pool.sort((a, b) => {
        if (a.shareCount !== b.shareCount) return a.shareCount - b.shareCount;
        return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
    });

    return pool[0];
}

/**
 * Set the share URL state file so the sharer CLI picks it up automatically.
 */
function setShareUrl(video) {
    const data = {
        url: video.url,
        caption: '',
        setAt: new Date().toISOString(),
        source: 'video-catalog',
        videoTitle: video.title,
    };
    fs.writeFileSync(SHARE_URL_FILE, JSON.stringify(data, null, 2));
    return data;
}

/**
 * Record that a video was shared (called after successful share runs).
 */
function recordVideoShare(catalog, videoUrl) {
    const normalizedUrl = videoUrl.replace(/\/$/, '').split('?')[0];
    const video = catalog.videos.find(v =>
        v.url.replace(/\/$/, '').split('?')[0] === normalizedUrl
    );
    if (video) {
        video.shareCount++;
        video.lastShared = new Date().toISOString();
        saveCatalog(catalog);
    }
}

// ─── CLI Commands ───────────────────────────────────────────────

function showHelp() {
    console.log('\n📹 Music Manager — Video Catalog');
    console.log('═'.repeat(55));
    console.log('  --scan          Scrape profile for new videos');
    console.log('  --list          Show all cataloged videos');
    console.log('  --next          Pick & set next video to promote');
    console.log('  --add=<URL>     Manually add a video URL');
    console.log('  --help          Show this help\n');
}

function showCatalog(catalog) {
    console.log('\n📹 Music Manager — Video Catalog');
    console.log('═'.repeat(55));
    console.log(`   Videos: ${catalog.videos.length}`);
    console.log(`   Active: ${catalog.videos.filter(v => v.active).length}`);
    console.log(`   Last scan: ${catalog.lastScan || 'never'}`);
    console.log(`   Last rotation: ${catalog.lastRotation || 'never'}\n`);

    if (catalog.videos.length === 0) {
        console.log('   No videos in catalog. Run --scan or --add=<URL>\n');
        return;
    }

    // Sort by shareCount for display
    const sorted = [...catalog.videos].sort((a, b) => b.shareCount - a.shareCount);

    for (let i = 0; i < sorted.length; i++) {
        const v = sorted[i];
        const status = v.active ? '✅' : '⏸️';
        const lastShared = v.lastShared
            ? new Date(v.lastShared).toLocaleDateString('en-US')
            : 'never';

        console.log(`   ${status} [${v.shareCount} shares] ${v.title.substring(0, 50)}`);
        console.log(`      ${v.url}`);
        console.log(`      Added: ${new Date(v.addedAt).toLocaleDateString('en-US')} | Last shared: ${lastShared} | Source: ${v.source}`);
        console.log('');
    }
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
    if (flags.help) {
        showHelp();
        return;
    }

    const catalog = loadCatalog();

    // ── Manual add ──
    if (flags.add) {
        const added = addVideoToCatalog(catalog, flags.add, '', 'manual');
        if (added) {
            saveCatalog(catalog);
            console.log(`\n✅ Added to catalog: ${flags.add}\n`);
        } else {
            console.log(`\n⚠️ Already in catalog: ${flags.add}\n`);
        }
        showCatalog(catalog);
        return;
    }

    // ── List ──
    if (flags.list) {
        showCatalog(catalog);
        return;
    }

    // ── Scan ──
    if (flags.scan) {
        const videos = await scanProfileForVideos();

        let newCount = 0;
        for (const v of videos) {
            const added = addVideoToCatalog(catalog, v.url, v.title, 'scan');
            if (added) newCount++;
        }

        catalog.lastScan = new Date().toISOString();
        saveCatalog(catalog);

        console.log(`\n═══════════════════════════════════════════════════════`);
        console.log(`✅ Scan complete: ${videos.length} found, ${newCount} new`);
        console.log(`   Total catalog: ${catalog.videos.length} videos\n`);

        showCatalog(catalog);
        return;
    }

    // ── Next (pick and set) ──
    if (flags.next) {
        if (catalog.videos.length === 0) {
            console.log('\n❌ No videos in catalog. Run --scan or --add=<URL> first.\n');
            return;
        }

        const next = pickNextVideo(catalog);
        if (!next) {
            console.log('\n⚠️ No eligible videos (all on cooldown)\n');
            return;
        }

        // Set it as the active share URL
        setShareUrl(next);
        catalog.lastRotation = new Date().toISOString();
        saveCatalog(catalog);

        console.log('\n📹 Music Manager — Next Video Selected');
        console.log('═'.repeat(55));
        console.log(`   🎯 Title:    ${next.title.substring(0, 60)}`);
        console.log(`   🔗 URL:      ${next.url}`);
        console.log(`   📊 Shares:   ${next.shareCount} (least-shared)`);
        console.log(`   ✅ Set as active share URL`);
        console.log(`\n   Next PM2 share run will use this video automatically.\n`);
        return;
    }

    // Default: show help
    showHelp();
}

main().catch(err => {
    console.error(`\n❌ Fatal: ${err.message}`);
    process.exit(1);
});

// Export for use by other scripts
export { loadCatalog, saveCatalog, addVideoToCatalog, pickNextVideo, recordVideoShare, setShareUrl };

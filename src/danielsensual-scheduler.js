/**
 * Daniel Sensual — Facebook Reel Post Scheduler
 *
 * Automates uploading short dance clips as Reels to the Daniel Sensual Facebook page.
 * Picks from a local folder of pre-cut clips, generates AI captions,
 * and posts 1-2 Reels per day on a configurable schedule.
 *
 * Features:
 * - Uploads local video files as Reels via Puppeteer
 * - AI-generated captions per Reel (GPT)
 * - Tracks posted videos (no repeats)
 * - Configurable daily schedule (2 posts/day default)
 * - Integrates with the group sharing bot for amplification
 *
 * Usage:
 *   node src/danielsensual-scheduler.js --post          Post next Reel now
 *   node src/danielsensual-scheduler.js --list          Show queue
 *   node src/danielsensual-scheduler.js --add=/path     Add video to queue
 *   node src/danielsensual-scheduler.js --scan          Scan Reels folder
 *   node src/danielsensual-scheduler.js --schedule      Show/set schedule
 *   node src/danielsensual-scheduler.js --help          Show help
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { generateText, hasLLMProvider } from './llm-client.js';

dotenv.config();
puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_DATA_DIR = path.join(process.env.HOME || '/root', '.danielsensual-chrome-profile');
const QUEUE_FILE = path.join(__dirname, '..', 'data', 'reel-queue.json');
const POSTED_LOG = path.join(__dirname, '..', 'data', 'reel-posted.json');
const REELS_FOLDER = path.join(process.env.HOME || '/root', 'Downloads', 'Dance Projects', 'Reels', '1080p');
const PAGE_URL = 'https://www.facebook.com/danielsensual';

// ─── CLI Args ───────────────────────────────────────────────────

const args = process.argv.slice(2);
function getFlag(name) {
    const prefix = `--${name}=`;
    const arg = args.find(v => v.startsWith(prefix));
    return arg ? arg.slice(prefix.length).trim() : '';
}

const flags = {
    post: args.includes('--post'),
    list: args.includes('--list'),
    add: getFlag('add'),
    scan: args.includes('--scan'),
    schedule: args.includes('--schedule'),
    help: args.includes('--help'),
    dryRun: args.includes('--dry-run'),
};

// ─── Queue Management ───────────────────────────────────────────

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadQueue() {
    try {
        if (fs.existsSync(QUEUE_FILE)) {
            return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
        }
    } catch { /* fresh */ }
    return { videos: [], lastPosted: null };
}

function saveQueue(queue) {
    ensureDir(path.dirname(QUEUE_FILE));
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

function loadPosted() {
    try {
        if (fs.existsSync(POSTED_LOG)) {
            return JSON.parse(fs.readFileSync(POSTED_LOG, 'utf-8'));
        }
    } catch { /* fresh */ }
    return { posts: [] };
}

function savePosted(posted) {
    ensureDir(path.dirname(POSTED_LOG));
    fs.writeFileSync(POSTED_LOG, JSON.stringify(posted, null, 2));
}

function addToQueue(queue, filePath, title = '') {
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) {
        console.log(`❌ File not found: ${absPath}`);
        return false;
    }

    const exists = queue.videos.find(v => v.filePath === absPath);
    if (exists) {
        console.log(`⚠️ Already in queue: ${path.basename(absPath)}`);
        return false;
    }

    queue.videos.push({
        filePath: absPath,
        title: title || path.basename(absPath, path.extname(absPath)),
        addedAt: new Date().toISOString(),
        posted: false,
        postedAt: null,
        fbUrl: null,
    });

    return true;
}

// ─── Scan Reels Folder ──────────────────────────────────────────

function scanReelsFolder(queue) {
    if (!fs.existsSync(REELS_FOLDER)) {
        console.log(`❌ Reels folder not found: ${REELS_FOLDER}`);
        return 0;
    }

    const files = fs.readdirSync(REELS_FOLDER)
        .filter(f => /\.(mp4|mov|m4v)$/i.test(f))
        .map(f => path.join(REELS_FOLDER, f));

    const posted = loadPosted();
    const postedPaths = new Set(posted.posts.map(p => p.filePath));

    let added = 0;
    for (const file of files) {
        if (postedPaths.has(file)) continue;
        if (addToQueue(queue, file)) added++;
    }

    return added;
}

// ─── AI Caption for Reel ────────────────────────────────────────

const REEL_CAPTION_STYLES = [
    'hookQuestion',    // "Wait for it..."
    'vibeCheck',       // Pure energy, let the video speak
    'behindScenes',    // "Desert roads, sunset, bachata."
    'storytelling',    // "We pulled over on the highway for this..."
    'minimalCool',     // Short and clean. 5 words max.
    'emotional',       // Vulnerable, real
    'funny',           // Light, playful
    'spanglish',       // Natural code-switching
];

async function generateReelCaption(videoTitle) {
    const style = REEL_CAPTION_STYLES[Math.floor(Math.random() * REEL_CAPTION_STYLES.length)];

    if (!hasLLMProvider()) {
        return getFallbackCaption(videoTitle);
    }

    try {
        const prompt = `You are Daniel Sensual's social media manager writing a Facebook Reel caption.

BRAND: Bachata music artist & dancer. Orlando, FL. Veteran. Dominican roots. AI-produced music.
VOICE: Real, warm, confident. Spanglish natural. Never corporate.

VIDEO TITLE: "${videoTitle}"
CAPTION STYLE: ${style}

Your job is to write a caption that:
- Makes people STOP scrolling and watch
- Feels like something a real person would type, not a bot
- Matches the style requested but don't force it
- Is SHORT — 1-2 sentences max, ideally under 100 characters
- Uses 0-1 emojis, naturally placed
- Ends with 2-3 lowercase hashtags
- Never says "check this out", "don't miss", "new music alert"
- Can be funny, vulnerable, mysterious, hype — match the video energy
- If the title suggests a dance video: passion, connection, fire
- If it suggests a desert/cinematic video: epic, cinematic, atmospheric
- If it suggests a studio session: raw, creative, behind-the-curtain

Think about what would make YOU stop scrolling. Write that.

Return ONLY the caption text. No quotes, no JSON.`;

        const { text } = await generateText({
            prompt,
            provider: 'auto',
            maxOutputTokens: 150,
            openaiModel: 'gpt-5.4-nano',
        });

        const caption = (text || '').trim().replace(/^["']|["']$/g, '');
        if (caption && caption.length > 5) return caption;
    } catch (err) {
        console.log(`   ⚠️ AI caption failed: ${err.message}`);
    }

    return getFallbackCaption(videoTitle);
}

function getFallbackCaption(videoTitle) {
    const captions = [
        `This is why we dance #bachata #danielsensual`,
        `No caption needed. Just watch #bachata #bachatadance`,
        `Late night energy #bachata #danielsensual`,
        `Tell me this doesn't hit different #bachata #bachatadancing`,
        `Made for the dance floor #bachata #danielsensual`,
        `The vibe was right #bachata #danielsensual`,
        `Some things you just feel #bachata #bachatadance`,
        `Catch this one #bachata #danielsensual`,
    ];
    return captions[Math.floor(Math.random() * captions.length)];
}

// ─── Upload Reel via Puppeteer ──────────────────────────────────

function randomDelay(min, max) {
    return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));
}

async function uploadReel(videoPath, caption) {
    console.log(`\n📤 Uploading Reel: ${path.basename(videoPath)}`);
    console.log(`   Caption: ${caption.substring(0, 80)}...`);

    if (flags.dryRun) {
        console.log('   🏃 DRY RUN — skipping actual upload');
        return { success: true, url: 'dry-run' };
    }

    // Detect system Chrome
    const possiblePaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
    ];
    const executablePath = possiblePaths.find(p => fs.existsSync(p)) || undefined;

    const browser = await puppeteer.launch({
        headless: false,
        executablePath,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--user-data-dir=${USER_DATA_DIR}`,
            '--disable-notifications',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1280,900',
        ],
        defaultViewport: { width: 1280, height: 900 },
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);

    try {
        // Navigate to Facebook and check login
        await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await randomDelay(2000, 3000);

        if (page.url().includes('/login')) {
            throw new Error('Not logged in. Run login flow first.');
        }
        console.log('   ✅ Logged in');

        // Navigate to Reels creation
        await page.goto('https://www.facebook.com/reels/create', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await randomDelay(3000, 5000);
        console.log('   📍 On Reels creation page');

        // Look for file upload input
        const fileInput = await page.waitForSelector('input[type="file"][accept*="video"]', { timeout: 15000 }).catch(() => null);

        if (!fileInput) {
            // Try finding by other selectors
            const inputs = await page.$$('input[type="file"]');
            if (inputs.length === 0) {
                throw new Error('No file upload input found on Reels creation page');
            }
            await inputs[0].uploadFile(videoPath);
        } else {
            await fileInput.uploadFile(videoPath);
        }

        console.log('   📁 Video file selected');
        await randomDelay(5000, 8000);

        // Wait for video to process
        console.log('   ⏳ Waiting for video processing...');
        await randomDelay(10000, 15000);

        // Find caption/description field and enter caption
        const captionField = await page.waitForSelector(
            'div[role="textbox"][contenteditable="true"], textarea[placeholder*="description"], div[aria-label*="description"]',
            { timeout: 15000 }
        ).catch(() => null);

        if (captionField) {
            await captionField.click();
            await randomDelay(500, 1000);
            await page.keyboard.type(caption, { delay: 30 });
            console.log('   ✏️ Caption entered');
        } else {
            console.log('   ⚠️ Caption field not found — posting without caption');
        }

        await randomDelay(2000, 3000);

        // Find and click Post/Share button
        const postButton = await page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
            return buttons.find(b => {
                const text = (b.textContent || '').toLowerCase().trim();
                return text === 'share reel' || text === 'post' || text === 'share' || text === 'publish';
            });
        });

        if (postButton) {
            await postButton.asElement()?.click();
            console.log('   🎉 Post button clicked!');
            await randomDelay(5000, 8000);
        } else {
            console.log('   ⚠️ Post button not found — check manually');
        }

        // Try to capture the posted URL
        const currentUrl = page.url();
        console.log(`   📍 Current URL: ${currentUrl}`);

        await browser.close();
        return { success: true, url: currentUrl };

    } catch (err) {
        console.error(`   ❌ Upload failed: ${err.message}`);
        await browser.close();
        return { success: false, error: err.message };
    }
}

// ─── Post Next Reel ─────────────────────────────────────────────

async function postNextReel() {
    const queue = loadQueue();

    // Get unposted videos
    const pending = queue.videos.filter(v => !v.posted);

    if (pending.length === 0) {
        console.log('\n📭 No videos in queue. Run --scan or --add to add videos.\n');
        return;
    }

    const next = pending[0];
    console.log(`\n🎬 Next Reel: ${next.title}`);
    console.log(`   File: ${next.filePath}`);

    // Verify file exists
    if (!fs.existsSync(next.filePath)) {
        console.log(`   ❌ File missing: ${next.filePath}`);
        next.posted = true; // Skip it
        next.error = 'File missing';
        saveQueue(queue);
        return;
    }

    // Generate caption
    const caption = await generateReelCaption(next.title);
    console.log(`   📝 Caption: ${caption}`);

    // Upload
    const result = await uploadReel(next.filePath, caption);

    if (result.success) {
        next.posted = true;
        next.postedAt = new Date().toISOString();
        next.fbUrl = result.url;
        next.caption = caption;
        queue.lastPosted = new Date().toISOString();
        saveQueue(queue);

        // Log to posted history
        const posted = loadPosted();
        posted.posts.push({
            filePath: next.filePath,
            title: next.title,
            caption,
            postedAt: next.postedAt,
            fbUrl: result.url,
        });
        savePosted(posted);

        console.log(`\n✅ POSTED: ${next.title}`);
        console.log(`   URL: ${result.url}\n`);

        // Trigger group sharing if URL was captured
        if (result.url && result.url !== 'dry-run' && result.url.includes('facebook.com')) {
            console.log('   💡 TIP: Run the group sharer with this URL to amplify reach');
            console.log(`   node scripts/danielsensual-share.js --url="${result.url}"\n`);
        }
    } else {
        console.log(`\n❌ Failed to post: ${result.error}\n`);
    }
}

// ─── CLI Commands ───────────────────────────────────────────────

function showHelp() {
    console.log('\n🎬 Daniel Sensual — Reel Post Scheduler');
    console.log('═'.repeat(55));
    console.log('  --post          Upload next Reel to Facebook');
    console.log('  --list          Show video queue');
    console.log('  --scan          Scan Reels folder for new videos');
    console.log('  --add=<path>    Add a specific video to queue');
    console.log('  --schedule      Show posting schedule');
    console.log('  --dry-run       Test without actually posting');
    console.log('  --help          Show this help\n');
    console.log(`  Reels folder: ${REELS_FOLDER}\n`);
}

function showQueue(queue) {
    console.log('\n🎬 Daniel Sensual — Reel Queue');
    console.log('═'.repeat(55));

    const pending = queue.videos.filter(v => !v.posted);
    const done = queue.videos.filter(v => v.posted);

    console.log(`   Pending: ${pending.length}`);
    console.log(`   Posted:  ${done.length}`);
    console.log(`   Last posted: ${queue.lastPosted || 'never'}\n`);

    if (pending.length > 0) {
        console.log('   📋 QUEUE:');
        for (const v of pending) {
            console.log(`      ⏳ ${v.title}`);
            console.log(`         ${path.basename(v.filePath)}`);
        }
        console.log('');
    }

    if (done.length > 0) {
        console.log('   ✅ POSTED:');
        for (const v of done.slice(-5)) {
            const when = v.postedAt ? new Date(v.postedAt).toLocaleDateString('en-US') : '?';
            console.log(`      ✅ ${v.title} (${when})`);
        }
        console.log('');
    }
}

function showSchedule() {
    console.log('\n🎬 Daniel Sensual — Posting Schedule');
    console.log('═'.repeat(55));
    console.log('   Default: 2 Reels/day\n');
    console.log('   Cron commands to add:');
    console.log('   # Morning post (10:00 AM EDT)');
    console.log('   0 14 * * * cd /opt/music-manager-bot/ghostai-x-bot && node src/danielsensual-scheduler.js --post >> logs/reels.log 2>&1');
    console.log('   # Evening post (6:00 PM EDT)');
    console.log('   0 22 * * * cd /opt/music-manager-bot/ghostai-x-bot && node src/danielsensual-scheduler.js --post >> logs/reels.log 2>&1\n');
    console.log('   Or use PM2:');
    console.log('   pm2 start src/danielsensual-scheduler.js --name "reel-morning" --cron "0 14 * * *" -- --post');
    console.log('   pm2 start src/danielsensual-scheduler.js --name "reel-evening" --cron "0 22 * * *" -- --post\n');
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
    if (flags.help) { showHelp(); return; }

    const queue = loadQueue();

    if (flags.scan) {
        const added = scanReelsFolder(queue);
        saveQueue(queue);
        console.log(`\n✅ Scanned ${REELS_FOLDER}`);
        console.log(`   Added ${added} new videos to queue`);
        showQueue(queue);
        return;
    }

    if (flags.add) {
        const added = addToQueue(queue, flags.add);
        if (added) {
            saveQueue(queue);
            console.log(`\n✅ Added to queue: ${path.basename(flags.add)}\n`);
        }
        showQueue(queue);
        return;
    }

    if (flags.list) { showQueue(queue); return; }
    if (flags.schedule) { showSchedule(); return; }

    if (flags.post) {
        await postNextReel();
        return;
    }

    showHelp();
}

main().catch(err => {
    console.error(`\n❌ Fatal: ${err.message}`);
    process.exit(1);
});

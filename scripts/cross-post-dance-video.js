#!/usr/bin/env node
/**
 * Daniel Castillo x Daniel Sensual — Cross-Page Dance Video Poster
 *
 * Uploads a local dance video as a Facebook Reel from BOTH:
 *   1. Daniel Castillo's personal profile (~/.danielsensual-personal-chrome-profile)
 *   2. Daniel Sensual page (~/.danielsensual-chrome-profile)
 *
 * Generates unique AI captions for each identity and optionally
 * triggers the group sharer for amplification.
 *
 * Usage:
 *   node scripts/cross-post-dance-video.js --video="~/Downloads/dance.mp4"
 *   node scripts/cross-post-dance-video.js --video="~/Downloads/dance.mp4" --title="Daniel & Lotta Bachata"
 *   node scripts/cross-post-dance-video.js --video="~/Downloads/dance.mp4" --personal-only
 *   node scripts/cross-post-dance-video.js --video="~/Downloads/dance.mp4" --page-only
 *   node scripts/cross-post-dance-video.js --video="~/Downloads/dance.mp4" --dry-run
 *   node scripts/cross-post-dance-video.js --help
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { generateText, hasLLMProvider } from '../src/llm-client.js';

dotenv.config();
puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, '..', 'logs', 'crosspost');

// ─── Chrome Profiles ────────────────────────────────────────────

const PROFILES = {
    personal: {
        label: 'Daniel Castillo (Personal)',
        userDataDir: path.join(process.env.HOME || '/root', '.danielsensual-personal-chrome-profile'),
        pageUrl: null, // posts to personal timeline
        tone: 'personal',
    },
    page: {
        label: 'Daniel Sensual (Page)',
        userDataDir: path.join(process.env.HOME || '/root', '.danielsensual-chrome-profile'),
        pageUrl: 'https://www.facebook.com/danielsensual',
        tone: 'brand',
    },
};

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
    personalOnly: args.includes('--personal-only'),
    pageOnly: args.includes('--page-only'),
    video: getFlag('video'),
    title: getFlag('title'),
    caption: getFlag('caption'),
    personalCaption: getFlag('personal-caption'),
    pageCaption: getFlag('page-caption'),
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

function resolveVideoPath(raw) {
    let resolved = raw.replace(/^~/, process.env.HOME || '/root');
    resolved = path.resolve(resolved);
    return resolved;
}

// ─── AI Caption Generation ──────────────────────────────────────

const FALLBACK_CAPTIONS = {
    personal: [
        'When the music hits different 🔥💃 #bachata #dance #moab',
        'This is why we dance 🎶✨ #bachatadance #couples #utah',
        'Some moments you just gotta capture 💃🔥 #bachata #danielcastillo',
        'Desert vibes + bachata = magic 🌅🎵 #dance #sensual #moab',
    ],
    brand: [
        'This energy is everything 🔥💃 #bachata #danielsensual #bachatadance',
        'When the connection is real 🎶✨ #bachatadancing #sensual #danielsensual',
        'Feel every beat 💃🔥 #bachata #danielsensual #bachatalovers',
        'Bachata hits different in the desert 🌅🎵 #danielsensual #dance',
    ],
};

async function generateCaption(videoTitle, tone = 'personal') {
    if (!hasLLMProvider()) {
        return getRandomFallback(tone);
    }

    const persona =
        tone === 'personal'
            ? `You're Daniel Castillo — a dancer, filmmaker, and bachata artist posting a personal dance video. 
Tone: authentic, warm, personal. Reference your dance partner by first name if the title mentions them.
Feel like a real person sharing a moment, NOT a brand.`
            : `You're Daniel Sensual — a bachata music artist & dance brand based in Orlando.
Tone: confident, professional but fun, community-building. 
Feel like a rising dance brand showcasing what you do.`;

    try {
        const prompt = `${persona}

VIDEO TITLE: "${videoTitle}"
PLATFORM: Facebook Reel

RULES:
1. Keep it SHORT — 1-3 sentences max, under 200 characters ideal
2. Sound natural and human, NOT like a bot or marketer
3. Use 2-4 relevant emojis (🔥 💃 🎶 ❤️ 🌊 🎵 🌅 🛣️ ✨)
4. Add 3-5 hashtags at the end (#bachata #bachatadance ${tone === 'brand' ? '#danielsensual' : '#danielcastillo'})
5. Make people want to watch and feel the energy
6. Do NOT mention Spotify, Apple Music, or any links
7. ${tone === 'personal' ? 'Be personal — reference your partner, the location, the vibe' : 'Be brand-forward — showcase the artistry and invite the community'}

Return ONLY the caption text. No quotes, no JSON.`;

        const { text } = await generateText({
            prompt,
            provider: 'auto',
            maxOutputTokens: 200,
            openaiModel: 'gpt-5.4-nano',
        });

        const caption = (text || '').trim().replace(/^["']|["']$/g, '');
        if (caption && caption.length > 5) return caption;
    } catch (err) {
        console.log(`   ⚠️ AI caption failed: ${err.message}`);
    }

    return getRandomFallback(tone);
}

function getRandomFallback(tone) {
    const pool = FALLBACK_CAPTIONS[tone] || FALLBACK_CAPTIONS.personal;
    return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Browser Launcher ───────────────────────────────────────────

async function launchBrowser(userDataDir) {
    const possiblePaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
    ];
    const executablePath =
        possiblePaths.find((p) => fs.existsSync(p)) || undefined;

    return puppeteer.launch({
        headless: false, // Must be headed for Reel upload UI
        executablePath,
        protocolTimeout: 300_000,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--user-data-dir=${userDataDir}`,
            '--disable-notifications',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1280,900',
        ],
        defaultViewport: { width: 1280, height: 900 },
    });
}

// ─── Upload Reel Flow ───────────────────────────────────────────

async function uploadReel(profile, videoPath, caption) {
    console.log(`\n   📤 Uploading as: ${profile.label}`);
    console.log(`   📝 Caption: ${caption.substring(0, 100)}...`);

    if (flags.dryRun) {
        console.log('   🔒 DRY RUN — would upload here');
        return { success: true, url: 'dry-run', identity: profile.label };
    }

    const browser = await launchBrowser(profile.userDataDir);
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);

    try {
        // Check login
        await page.goto('https://www.facebook.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        await randomDelay(2000, 3000);

        if (page.url().includes('/login') || page.url().includes('/checkpoint')) {
            throw new Error(
                `Not logged in on ${profile.label}. Use the appropriate --login command first.`,
            );
        }
        console.log('   ✅ Logged in');

        // Navigate to Reels creation
        await page.goto('https://www.facebook.com/reels/create', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        await randomDelay(3000, 5000);
        console.log('   📍 On Reels creation page');

        // Find file upload input
        let fileInput = await page
            .waitForSelector('input[type="file"][accept*="video"]', {
                timeout: 15000,
            })
            .catch(() => null);

        if (!fileInput) {
            const inputs = await page.$$('input[type="file"]');
            if (inputs.length === 0) {
                throw new Error('No file upload input found on Reels creation page');
            }
            fileInput = inputs[0];
        }

        await fileInput.uploadFile(videoPath);
        console.log('   📁 Video file selected');

        // Wait for video processing
        console.log('   ⏳ Waiting for video processing...');
        await randomDelay(12000, 18000);

        // Find caption/description field
        const captionField = await page
            .waitForSelector(
                'div[role="textbox"][contenteditable="true"], textarea[placeholder*="description"], div[aria-label*="description"], div[aria-label*="Description"]',
                { timeout: 15000 },
            )
            .catch(() => null);

        if (captionField) {
            await captionField.click();
            await randomDelay(500, 1000);
            await page.keyboard.type(caption, { delay: 25 });
            console.log('   ✏️ Caption entered');
        } else {
            console.log('   ⚠️ Caption field not found — posting without caption');
        }

        await randomDelay(2000, 3000);

        // Find and click Post/Share button
        const postClicked = await page.evaluate(() => {
            const buttons = Array.from(
                document.querySelectorAll('div[role="button"], button'),
            );
            const postBtn = buttons.find((b) => {
                const text = (b.textContent || '').toLowerCase().trim();
                return (
                    text === 'share reel' ||
                    text === 'post' ||
                    text === 'share' ||
                    text === 'publish'
                );
            });
            if (postBtn && !postBtn.getAttribute('aria-disabled')) {
                postBtn.click();
                return true;
            }
            return false;
        });

        if (postClicked) {
            console.log('   🎉 Post button clicked!');
            await randomDelay(8000, 12000);
        } else {
            console.log('   ⚠️ Post button not found — check manually');
            // Wait for manual intervention
            console.log('   ⏳ Waiting 30s for manual post...');
            await randomDelay(25000, 35000);
        }

        const currentUrl = page.url();
        console.log(`   📍 URL: ${currentUrl}`);

        await browser.close();
        return { success: true, url: currentUrl, identity: profile.label };
    } catch (err) {
        console.error(`   ❌ Upload failed: ${err.message}`);
        await browser.close().catch(() => {});
        return { success: false, error: err.message, identity: profile.label };
    }
}

// ─── Help ───────────────────────────────────────────────────────

function showHelp() {
    console.log('');
    console.log('🎬 Daniel Castillo x Daniel Sensual — Cross-Page Video Poster');
    console.log('═'.repeat(60));
    console.log('');
    console.log('Uploads a dance video as a Reel to BOTH your personal');
    console.log('profile and the Daniel Sensual page.');
    console.log('');
    console.log('Usage:');
    console.log('  --video=/path/to/file.mp4   Required — local video file');
    console.log('  --title="text"              Video title hint for AI captions');
    console.log('  --caption="text"            Override caption for BOTH pages');
    console.log('  --personal-caption="text"   Override personal profile caption');
    console.log('  --page-caption="text"       Override DS page caption');
    console.log('  --personal-only             Post to personal profile only');
    console.log('  --page-only                 Post to DS page only');
    console.log('  --dry-run                   Preview captions, don\'t upload');
    console.log('  --help                      Show this help');
    console.log('');
    console.log('Examples:');
    console.log('  # Cross-post a dance video:');
    console.log(
        '  node scripts/cross-post-dance-video.js \\',
    );
    console.log(
        '    --video="$HOME/Downloads/Daniel & Lotta Dance 2 Moab.mp4" \\',
    );
    console.log('    --title="Daniel & Lotta Bachata in Moab"');
    console.log('');
    console.log('  # Dry-run to preview AI captions:');
    console.log(
        '  node scripts/cross-post-dance-video.js \\',
    );
    console.log(
        '    --video="$HOME/Downloads/dance.mp4" --title="Sunset Bachata" --dry-run',
    );
    console.log('');
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
    if (flags.help) {
        showHelp();
        return;
    }

    if (!flags.video) {
        console.error('❌ --video is required. Use --help for usage.');
        process.exit(1);
    }

    const videoPath = resolveVideoPath(flags.video);
    if (!fs.existsSync(videoPath)) {
        console.error(`❌ Video file not found: ${videoPath}`);
        process.exit(1);
    }

    const fileSizeMB = (fs.statSync(videoPath).size / (1024 * 1024)).toFixed(1);
    const videoTitle =
        flags.title ||
        path.basename(videoPath, path.extname(videoPath));

    console.log('');
    console.log('🎬 Cross-Page Dance Video Poster');
    console.log('═'.repeat(60));
    console.log(`   Video:    ${path.basename(videoPath)} (${fileSizeMB} MB)`);
    console.log(`   Title:    ${videoTitle}`);
    console.log(`   Mode:     ${flags.dryRun ? '🔒 DRY RUN' : '🔴 LIVE'}`);
    console.log(`   Targets:  ${flags.personalOnly ? 'Personal only' : flags.pageOnly ? 'DS page only' : 'Personal + DS Page'}`);
    console.log(`   Time:     ${timestamp()}`);

    const results = [];

    // Determine which profiles to post to
    const targets = [];
    if (!flags.pageOnly) targets.push('personal');
    if (!flags.personalOnly) targets.push('page');

    for (const target of targets) {
        const profile = PROFILES[target];

        console.log('');
        console.log(`${'─'.repeat(60)}`);
        console.log(`🎯 Step: ${profile.label}`);
        console.log(`${'─'.repeat(60)}`);

        // Generate or use provided caption
        let caption;
        if (target === 'personal' && flags.personalCaption) {
            caption = flags.personalCaption;
            console.log('   📝 Using provided personal caption');
        } else if (target === 'page' && flags.pageCaption) {
            caption = flags.pageCaption;
            console.log('   📝 Using provided page caption');
        } else if (flags.caption) {
            caption = flags.caption;
            console.log('   📝 Using shared caption override');
        } else {
            console.log(`   🤖 Generating AI caption (${profile.tone} tone)...`);
            caption = await generateCaption(videoTitle, profile.tone);
        }

        console.log(`\n   --- Caption Preview ---`);
        console.log(`   ${caption}`);
        console.log(`   --- End ---`);

        // Upload
        const result = await uploadReel(profile, videoPath, caption);
        results.push(result);

        if (!result.success) {
            console.log(`\n   ❌ Failed on ${profile.label}: ${result.error}`);
            console.log('   Continuing to next profile...');
        }

        // Delay between profiles
        if (targets.indexOf(target) < targets.length - 1) {
            const waitSec = Math.floor(Math.random() * 11) + 10; // 10-20s
            console.log(`\n   ⏳ Waiting ${waitSec}s before next profile...`);
            await new Promise((r) => setTimeout(r, waitSec * 1000));
        }
    }

    // ─── Summary ────────────────────────────────────────────────
    console.log('');
    console.log('═'.repeat(60));
    console.log('📊 Cross-Post Summary');
    console.log('═'.repeat(60));

    for (const r of results) {
        const icon = r.success ? '✅' : '❌';
        console.log(`   ${icon} ${r.identity}: ${r.success ? r.url : r.error}`);
    }

    const successCount = results.filter((r) => r.success).length;
    console.log(`\n   ${successCount}/${results.length} posted successfully`);

    // Log results
    ensureDir(LOGS_DIR);
    const logFile = path.join(
        LOGS_DIR,
        `${new Date().toISOString().split('T')[0]}.json`,
    );
    const logEntry = {
        timestamp: new Date().toISOString(),
        video: path.basename(videoPath),
        title: videoTitle,
        dryRun: flags.dryRun,
        results,
    };

    let logs = [];
    if (fs.existsSync(logFile)) {
        try {
            logs = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
        } catch {
            /* fresh */
        }
    }
    logs.push(logEntry);
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
    console.log(`   📋 Log: logs/crosspost/${new Date().toISOString().split('T')[0]}.json`);

    // Hint about group sharer
    const dsResult = results.find(
        (r) => r.identity.includes('Sensual') && r.success && r.url !== 'dry-run',
    );
    if (dsResult) {
        console.log('');
        console.log('   💡 Amplify with group sharer:');
        console.log(
            `   node scripts/danielsensual-share.js --url="${dsResult.url}" --batch=1`,
        );
    }

    console.log('');
}

main().catch((err) => {
    console.error(`\n❌ Fatal: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
});

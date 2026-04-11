#!/usr/bin/env node
/**
 * Instagram API-Only Autopilot
 *
 * Responsibilities:
 * - Publish 1-2 stories daily (Drive asset first, AI fallback)
 * - Publish 1-2 reels daily (Drive asset first, AI fallback)
 * - Run API-based comment response cycles twice daily
 *
 * Notes:
 * - API-only mode cannot comment on third-party public posts directly.
 *   This script runs inbound comment replies on your own posts.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import { fileURLToPath } from 'url';

import { testInstagramConnection, uploadToTempHost, postInstagramReel, postInstagramStory, postInstagramCarousel } from '../src/instagram-client.js';
import { respondToInstagramComments } from '../src/instagram-responder.js';
import { buildInstagramCaption } from '../src/instagram-content.js';
import { generateVideo, cleanupCache } from '../src/video-generator.js';
import { generateImage, cleanupImageCache } from '../src/image-generator.js';
import { generateSoraVideo } from '../src/sora-video-generator.js';
import { getDriveRootStatus, pickNextDriveAsset, archiveDriveAsset } from '../src/drive-ingest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const LOG_DIR = path.join(PROJECT_ROOT, 'logs', 'instagram-autopilot');
const STATE_FILE = path.join(PROJECT_ROOT, '.instagram-autopilot-state.json');
const API_ONLY_NOTE = 'API-only mode cannot comment on other accounts. Running inbound comment replies instead.';
const DRIVE_PENDING_NOTE = 'PENDING: Set IG_DRIVE_ROOT to enable human-recorded media ingestion from Drive.';

fs.mkdirSync(LOG_DIR, { recursive: true });

const args = process.argv.slice(2);

function printHelp() {
    console.log(`
Instagram Autopilot (API-only)
==============================

Usage:
  node scripts/instagram-autopilot.js [options]

Options:
  --once                 Run now and exit
  --slot=<name>          all | comment | story | reel | carousel (default: all)
  --dry-run              Plan/log actions without posting
  -h, --help             Show help

Environment:
  INSTAGRAM_AUTOPILOT_TIMEZONE=America/New_York
  INSTAGRAM_AUTOPILOT_COMMENT_TIMES=09:30,16:30
  INSTAGRAM_AUTOPILOT_STORY_TIMES=11:00,20:00
  INSTAGRAM_AUTOPILOT_REEL_TIMES=15:00,21:00
  INSTAGRAM_AUTOPILOT_CAROUSEL_TIMES=14:00
  INSTAGRAM_AUTOPILOT_COMMENT_LIMIT=8
  INSTAGRAM_AUTOPILOT_POSTS_TO_SCAN=5
  INSTAGRAM_AUTOPILOT_AI_REELS_PER_DAY=1
  INSTAGRAM_AUTOPILOT_AI_STORIES_PER_DAY=2
  INSTAGRAM_AUTOPILOT_AI_CAROUSELS_PER_DAY=1
  INSTAGRAM_AUTOPILOT_AI_VIDEO_PROVIDER=auto|veo|grok|sora
  IG_DRIVE_ROOT=/path/to/drive-sync-folder
`);
}

function parseSlot(raw) {
    const value = String(raw || 'all').toLowerCase().trim();
    const allowed = new Set(['all', 'comment', 'story', 'reel', 'carousel']);
    if (!allowed.has(value)) {
        throw new Error(`Invalid --slot value: ${value}`);
    }
    return value;
}

function parseTimeList(rawValue, fallback) {
    const source = String(rawValue || fallback || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);

    if (source.length === 0) return [];

    const deduped = [];
    const seen = new Set();
    for (const value of source) {
        if (!/^\d{2}:\d{2}$/.test(value)) {
            throw new Error(`Invalid time "${value}". Expected HH:MM`);
        }
        const [hourRaw, minuteRaw] = value.split(':');
        const hour = Number.parseInt(hourRaw, 10);
        const minute = Number.parseInt(minuteRaw, 10);
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            throw new Error(`Invalid time "${value}". Expected 00:00-23:59`);
        }
        if (seen.has(value)) continue;
        seen.add(value);
        deduped.push(value);
    }

    return deduped;
}

function toInt(value, fallback, min, max) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function getDateInTimezone(timezone) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    return formatter.format(new Date());
}

function loadState(timezone) {
    let state = {
        date: getDateInTimezone(timezone),
        aiReelsGenerated: 0,
        aiStoriesGenerated: 0,
        executedSlots: [],
        notes: [],
    };

    try {
        if (fs.existsSync(STATE_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
            if (parsed && typeof parsed === 'object') {
                state = {
                    ...state,
                    ...parsed,
                };
            }
        }
    } catch {
        // Keep default state.
    }

    const today = getDateInTimezone(timezone);
    if (state.date !== today) {
        state = {
            date: today,
            aiReelsGenerated: 0,
            aiStoriesGenerated: 0,
            executedSlots: [],
            notes: [],
        };
    }

    if (!Array.isArray(state.executedSlots)) state.executedSlots = [];
    if (!Array.isArray(state.notes)) state.notes = [];

    return state;
}

function saveState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function resetStateForNewDay(state, timezone) {
    const today = getDateInTimezone(timezone);
    if (state.date === today) return false;

    state.date = today;
    state.aiReelsGenerated = 0;
    state.aiStoriesGenerated = 0;
    state.executedSlots = [];
    state.notes = [];
    return true;
}

function addNote(state, note) {
    const value = String(note || '').trim();
    if (!value) return;
    if (!state.notes.includes(value)) {
        state.notes.push(value);
        if (state.notes.length > 30) {
            state.notes = state.notes.slice(state.notes.length - 30);
        }
    }
}

function truncateCaption(text, max = 2200) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max - 3)}...`;
}

function appendLog(entry) {
    const now = new Date();
    const file = path.join(LOG_DIR, `${now.toISOString().slice(0, 10)}.json`);

    let existing = [];
    try {
        if (fs.existsSync(file)) {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
            if (Array.isArray(parsed)) existing = parsed;
        }
    } catch {
        existing = [];
    }

    existing.push({
        timestamp: now.toISOString(),
        ...entry,
    });

    fs.writeFileSync(file, JSON.stringify(existing, null, 2));
}

function parseArgs(argv) {
    const dryRun = argv.includes('--dry-run');
    const once = argv.includes('--once');
    const help = argv.includes('--help') || argv.includes('-h');

    const slotInline = argv.find(arg => arg.startsWith('--slot='))?.slice('--slot='.length);
    const slotIndex = argv.indexOf('--slot');
    const slotFlag = slotIndex >= 0 ? argv[slotIndex + 1] : null;

    return {
        dryRun,
        once,
        help,
        slot: parseSlot(slotInline || slotFlag || 'all'),
    };
}

async function generateCaptionFallback(kind) {
    try {
        const result = await buildInstagramCaption();
        return {
            caption: truncateCaption(result?.caption || ''),
            videoPrompt: result?.videoPrompt || null,
        };
    } catch {
        if (kind === 'reel') {
            return {
                caption: 'Nobody handed me a playbook. Just a veteran with a laptop and the audacity to believe AI could change everything. Keep building. 🔥',
                videoPrompt: 'Cinematic shot of a person coding late at night, multiple monitors glowing with AI dashboards, city skyline through window, dramatic blue lighting, 9:16 vertical',
            };
        }
        return {
            caption: 'Built different. Shipping daily. The grind never stops. 👻',
            videoPrompt: null,
        };
    }
}

async function generateAiReelFile(caption, provider) {
    if (provider === 'sora') {
        return generateSoraVideo(caption, {
            tag: 'instagram-reel',
            seconds: process.env.SORA_SECONDS || '8',
            size: process.env.SORA_SIZE || '720x1280',
            model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5',
        });
    }

    return generateVideo(caption, {
        provider,
        aspectRatio: '9:16',
        duration: 8,
        resolution: '720p',
    });
}

async function runCommentCycle(context, slotKey) {
    const { config, state } = context;
    addNote(state, API_ONLY_NOTE);

    console.log(`💬 [${slotKey}] Running API comment-reply cycle...`);
    const result = await respondToInstagramComments({
        dryRun: config.dryRun,
        limit: config.commentLimit,
        postsToScan: config.postsToScan,
    });

    appendLog({
        slot: slotKey,
        type: 'comment',
        mode: config.dryRun ? 'dry-run' : 'live',
        replied: result?.replied || 0,
        note: API_ONLY_NOTE,
    });

    return result;
}

async function runStoryCycle(context, slotKey) {
    const { config, state } = context;
    console.log(`📖 [${slotKey}] Running story cycle...`);

    const driveAsset = pickNextDriveAsset('story');
    // Note: stories use drive assets first, AI image fallback — no video prompt needed

    if (driveAsset) {
        if (config.dryRun) {
            appendLog({
                slot: slotKey,
                type: 'story',
                mode: 'dry-run',
                source: 'drive',
                file: driveAsset.filePath,
            });
            return { posted: false, dryRun: true, source: 'drive' };
        }

        const publicUrl = await uploadToTempHost(driveAsset.filePath);
        const post = await postInstagramStory(publicUrl, {
            mediaType: driveAsset.mediaType,
            caption: truncateCaption(driveAsset.caption || '', 500),
        });
        const archived = archiveDriveAsset(driveAsset, { status: 'posted' });

        appendLog({
            slot: slotKey,
            type: 'story',
            mode: 'live',
            source: 'drive',
            mediaType: driveAsset.mediaType,
            mediaId: post?.id || null,
            archived: archived.archivedFilePath,
        });

        return { posted: true, source: 'drive', mediaId: post?.id || null };
    }

    if (state.aiStoriesGenerated >= config.aiStoriesPerDay) {
        appendLog({
            slot: slotKey,
            type: 'story',
            mode: config.dryRun ? 'dry-run' : 'live',
            status: 'skipped',
            reason: `AI story daily cap reached (${config.aiStoriesPerDay})`,
        });
        return { posted: false, skipped: true };
    }

    const captionResult = config.dryRun
        ? { caption: '[dry-run] AI story caption placeholder', videoPrompt: null }
        : await generateCaptionFallback('story');
    const caption = captionResult.caption;

    if (config.dryRun) {
        appendLog({
            slot: slotKey,
            type: 'story',
            mode: 'dry-run',
            source: 'ai',
            caption,
        });
        return { posted: false, dryRun: true, source: 'ai' };
    }

    cleanupImageCache();
    const characterMode = config.characterMode || 'ghost';
    const imagePath = await generateImage(caption, {
        style: characterMode,
        size: '1024x1536',
    });
    const publicUrl = await uploadToTempHost(imagePath);
    const post = await postInstagramStory(publicUrl, { mediaType: 'image' });

    state.aiStoriesGenerated += 1;
    appendLog({
        slot: slotKey,
        type: 'story',
        mode: 'live',
        source: 'ai',
        mediaId: post?.id || null,
        asset: imagePath,
    });

    return { posted: true, source: 'ai', mediaId: post?.id || null };
}

async function runReelCycle(context, slotKey) {
    const { config, state } = context;
    console.log(`🎬 [${slotKey}] Running reel cycle...`);

    const driveAsset = pickNextDriveAsset('reel');

    if (driveAsset) {
        const fallbackResult = config.dryRun
            ? { caption: '[dry-run] Reel caption placeholder', videoPrompt: null }
            : await generateCaptionFallback('reel');
        const caption = truncateCaption(driveAsset.caption || fallbackResult.caption, 2200);

        if (config.dryRun) {
            appendLog({
                slot: slotKey,
                type: 'reel',
                mode: 'dry-run',
                source: 'drive',
                file: driveAsset.filePath,
                caption,
            });
            return { posted: false, dryRun: true, source: 'drive' };
        }

        const publicUrl = await uploadToTempHost(driveAsset.filePath);
        const post = await postInstagramReel(caption, publicUrl);
        const archived = archiveDriveAsset(driveAsset, { status: 'posted' });

        appendLog({
            slot: slotKey,
            type: 'reel',
            mode: 'live',
            source: 'drive',
            mediaId: post?.id || null,
            archived: archived.archivedFilePath,
        });

        return { posted: true, source: 'drive', mediaId: post?.id || null };
    }

    if (state.aiReelsGenerated >= config.aiReelsPerDay) {
        appendLog({
            slot: slotKey,
            type: 'reel',
            mode: config.dryRun ? 'dry-run' : 'live',
            status: 'skipped',
            reason: `AI reel daily cap reached (${config.aiReelsPerDay})`,
        });
        return { posted: false, skipped: true };
    }

    // Generate caption + video prompt pair
    const captionResult = config.dryRun
        ? { caption: '[dry-run] AI reel caption placeholder', videoPrompt: '[dry-run] Cinematic video prompt' }
        : await generateCaptionFallback('reel');
    const caption = truncateCaption(captionResult.caption, 2200);
    // Use dedicated video prompt if available — much better than raw caption for video gen
    const videoGenPrompt = captionResult.videoPrompt || caption;

    if (config.dryRun) {
        appendLog({
            slot: slotKey,
            type: 'reel',
            mode: 'dry-run',
            source: 'ai',
            provider: config.aiVideoProvider,
            caption,
            videoPrompt: videoGenPrompt,
        });
        return { posted: false, dryRun: true, source: 'ai' };
    }

    cleanupCache();
    // Use videoPrompt (optimized for video gen) instead of raw caption text
    const videoPath = await generateAiReelFile(videoGenPrompt, config.aiVideoProvider);
    const publicUrl = await uploadToTempHost(videoPath);
    const post = await postInstagramReel(caption, publicUrl);

    state.aiReelsGenerated += 1;
    appendLog({
        slot: slotKey,
        type: 'reel',
        mode: 'live',
        source: 'ai',
        provider: config.aiVideoProvider,
        mediaId: post?.id || null,
        asset: videoPath,
        videoPromptUsed: videoGenPrompt !== caption,
    });

    return { posted: true, source: 'ai', mediaId: post?.id || null };
}

async function runCarouselCycle(context, slotKey) {
    const { config, state } = context;
    console.log(`🎠 [${slotKey}] Running carousel cycle...`);

    if ((state.aiCarouselsGenerated || 0) >= config.aiCarouselsPerDay) {
        appendLog({
            slot: slotKey,
            type: 'carousel',
            mode: config.dryRun ? 'dry-run' : 'live',
            status: 'skipped',
            reason: `AI carousel daily cap reached (${config.aiCarouselsPerDay})`,
        });
        return { posted: false, skipped: true };
    }

    // Generate carousel content — AI creates slide prompts + caption
    const { generateText } = await import('../src/llm-client.js');

    const slidePrompt = `You are Ghost — AI Systems Architect, military veteran, founder of Ghost AI Systems in Orlando FL.

Create an Instagram CAROUSEL post (swipeable slides). The carousel should teach, inspire, or showcase something valuable.

Carousel types to rotate between:
1. "5 Things" listicle (tips, tools, lessons, mistakes)
2. Before/After transformation (business result, personal growth)
3. Step-by-step tutorial (how to automate X, how to build Y)
4. Hot take thread (controversial opinion broken into slides)
5. Case study breakdown (real results, numbers)

Return strict JSON:
{
  "caption": "the Instagram caption that goes with the carousel",
  "slides": [
    { "text": "Slide 1 headline — big text, 3-8 words", "subtext": "1-2 sentence supporting detail" },
    { "text": "Slide 2 headline", "subtext": "supporting detail" },
    { "text": "Slide 3 headline", "subtext": "supporting detail" },
    { "text": "Slide 4 headline", "subtext": "supporting detail" },
    { "text": "Slide 5 headline", "subtext": "supporting detail" }
  ],
  "carousel_type": "listicle|transformation|tutorial|hot_take|case_study",
  "hook_type": "question|statement|number|challenge"
}

5-7 slides. Make slide 1 a strong hook. Make the last slide a CTA. Keep caption under 1500 chars with 1-2 emojis max.`;

    let slidesData;
    try {
        const { text } = await generateText({
            prompt: slidePrompt,
            provider: 'grok',
            maxOutputTokens: 1500,
            grokModel: 'grok-4.20-0309-reasoning',
        });

        const parsed = text.match(/\{[\s\S]*\}/);
        slidesData = parsed ? JSON.parse(parsed[0]) : null;
    } catch (err) {
        console.error(`   ❌ Carousel AI generation failed: ${err.message}`);
        return { posted: false, error: err.message };
    }

    if (!slidesData?.slides || slidesData.slides.length < 2) {
        console.error('   ❌ AI returned invalid carousel data');
        return { posted: false, error: 'invalid_carousel_data' };
    }

    const caption = String(slidesData.caption || '').trim().slice(0, 2200);
    const slides = slidesData.slides.slice(0, 10); // max 10 slides

    if (config.dryRun) {
        appendLog({
            slot: slotKey,
            type: 'carousel',
            mode: 'dry-run',
            source: 'ai',
            carouselType: slidesData.carousel_type,
            slideCount: slides.length,
            caption,
            slides: slides.map(s => s.text),
        });
        console.log(`   📋 Carousel: ${slidesData.carousel_type} (${slides.length} slides)`);
        slides.forEach((s, i) => console.log(`   [${i + 1}] ${s.text}`));
        return { posted: false, dryRun: true, source: 'ai' };
    }

    // Generate images for each slide
    console.log(`   🎨 Generating ${slides.length} slide images...`);
    const imageUrls = [];

    for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        const imagePrompt = `Instagram carousel slide, dark premium design with subtle ghost/tech aesthetic, large bold white text saying "${slide.text}", smaller subtext: "${slide.subtext}", clean modern layout, 1080x1080, no watermarks, professional social media graphic, dark navy to black gradient background with subtle cyan/purple accent lighting`;

        try {
            const imagePath = await generateImage({ prompt: imagePrompt });
            const publicUrl = await uploadToTempHost(imagePath);
            imageUrls.push(publicUrl);
            console.log(`   ✅ Slide ${i + 1}/${slides.length} generated`);
        } catch (err) {
            console.error(`   ❌ Slide ${i + 1} generation failed: ${err.message}`);
            // If we have at least 2 slides, continue with what we have
            if (imageUrls.length >= 2) break;
            return { posted: false, error: `slide_gen_failed:${err.message}` };
        }
    }

    if (imageUrls.length < 2) {
        console.error('   ❌ Not enough slides generated (need at least 2)');
        return { posted: false, error: 'insufficient_slides' };
    }

    const post = await postInstagramCarousel(caption, imageUrls);

    state.aiCarouselsGenerated = (state.aiCarouselsGenerated || 0) + 1;
    appendLog({
        slot: slotKey,
        type: 'carousel',
        mode: 'live',
        source: 'ai',
        carouselType: slidesData.carousel_type,
        slideCount: imageUrls.length,
        mediaId: post?.id || null,
    });

    return { posted: true, source: 'ai', mediaId: post?.id || null };
}

async function runSlot(context, slot, slotKey) {
    if (slot === 'comment') return runCommentCycle(context, slotKey);
    if (slot === 'story') return runStoryCycle(context, slotKey);
    if (slot === 'reel') return runReelCycle(context, slotKey);
    if (slot === 'carousel') return runCarouselCycle(context, slotKey);
    return null;
}

function createCronExpression(timeString) {
    const [hour, minute] = timeString.split(':').map(value => Number.parseInt(value, 10));
    return `${minute} ${hour} * * *`;
}

async function main() {
    let parsed;
    try {
        parsed = parseArgs(args);
    } catch (error) {
        console.error(`❌ ${error.message}`);
        process.exit(1);
    }

    if (parsed.help) {
        printHelp();
        process.exit(0);
    }

    const config = {
        dryRun: parsed.dryRun,
        once: parsed.once,
        slot: parsed.slot,
        timezone: String(process.env.INSTAGRAM_AUTOPILOT_TIMEZONE || 'America/New_York').trim(),
        commentTimes: parseTimeList(process.env.INSTAGRAM_AUTOPILOT_COMMENT_TIMES, '09:30,16:30'),
        storyTimes: parseTimeList(process.env.INSTAGRAM_AUTOPILOT_STORY_TIMES, '11:00,20:00'),
        reelTimes: parseTimeList(process.env.INSTAGRAM_AUTOPILOT_REEL_TIMES, '15:00,21:00'),
        carouselTimes: parseTimeList(process.env.INSTAGRAM_AUTOPILOT_CAROUSEL_TIMES, '14:00'),
        commentLimit: toInt(process.env.INSTAGRAM_AUTOPILOT_COMMENT_LIMIT, 8, 1, 50),
        postsToScan: toInt(process.env.INSTAGRAM_AUTOPILOT_POSTS_TO_SCAN, 5, 1, 25),
        aiReelsPerDay: toInt(process.env.INSTAGRAM_AUTOPILOT_AI_REELS_PER_DAY, 1, 0, 4),
        aiStoriesPerDay: toInt(process.env.INSTAGRAM_AUTOPILOT_AI_STORIES_PER_DAY, 2, 0, 6),
        aiCarouselsPerDay: toInt(process.env.INSTAGRAM_AUTOPILOT_AI_CAROUSELS_PER_DAY, 1, 0, 3),
        aiVideoProvider: String(process.env.INSTAGRAM_AUTOPILOT_AI_VIDEO_PROVIDER || 'grok').toLowerCase(),
        characterMode: String(process.env.INSTAGRAM_AUTOPILOT_CHARACTER_MODE || 'ghost').toLowerCase(),
    };

    if (!['auto', 'veo', 'grok', 'sora'].includes(config.aiVideoProvider)) {
        throw new Error(`Invalid INSTAGRAM_AUTOPILOT_AI_VIDEO_PROVIDER: ${config.aiVideoProvider}`);
    }

    const connection = await testInstagramConnection();
    if (!connection) {
        throw new Error('Instagram connection check failed. Fix credentials before starting autopilot.');
    }

    const state = loadState(config.timezone);

    const driveStatus = getDriveRootStatus();
    function applyBaseNotes(targetState) {
        addNote(targetState, API_ONLY_NOTE);
        if (!driveStatus.configured) {
            addNote(targetState, DRIVE_PENDING_NOTE);
        } else if (!driveStatus.exists) {
            addNote(targetState, `PENDING: IG_DRIVE_ROOT path not found: ${driveStatus.root}`);
        }
    }

    applyBaseNotes(state);

    saveState(state);

    console.log('');
    console.log('🤖 Instagram Autopilot');
    console.log('═'.repeat(50));
    console.log(`Mode: ${config.dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`Timezone: ${config.timezone}`);
    console.log(`Comments: ${config.commentTimes.join(', ') || '(disabled)'}`);
    console.log(`Stories: ${config.storyTimes.join(', ') || '(disabled)'}`);
    console.log(`Reels: ${config.reelTimes.join(', ') || '(disabled)'}`);
    console.log(`AI video provider: ${config.aiVideoProvider}`);
    if (state.notes.length > 0) {
        console.log('Notes:');
        for (const note of state.notes) {
            console.log(`  - ${note}`);
        }
    }
    console.log('═'.repeat(50));

    const context = { config, state };
    const active = new Set();

    async function guardedRun(slot, slotKey) {
        if (resetStateForNewDay(state, config.timezone)) {
            applyBaseNotes(state);
            saveState(state);
        }

        const lockKey = `${slot}:${slotKey}`;
        if (active.has(lockKey)) return;

        if (!config.dryRun && state.executedSlots.includes(lockKey)) {
            console.log(`ℹ️ [${slotKey}] Already executed today, skipping duplicate`);
            return;
        }

        active.add(lockKey);
        try {
            await runSlot(context, slot, slotKey);
            if (!config.dryRun) {
                state.executedSlots.push(lockKey);
            }
            saveState(state);
        } catch (error) {
            appendLog({
                slot: slotKey,
                type: slot,
                mode: config.dryRun ? 'dry-run' : 'live',
                status: 'error',
                error: error.message,
            });
            console.error(`❌ [${slotKey}] ${error.message}`);
        } finally {
            active.delete(lockKey);
        }
    }

    if (config.once) {
        if (config.slot === 'all') {
            await guardedRun('comment', 'manual-comment');
            await guardedRun('story', 'manual-story');
            await guardedRun('reel', 'manual-reel');
            await guardedRun('carousel', 'manual-carousel');
        } else {
            await guardedRun(config.slot, `manual-${config.slot}`);
        }
        return;
    }

    if (config.slot !== 'all') {
        console.log(`ℹ️ Running scheduler with only "${config.slot}" slot enabled.`);
    }

    function scheduleSlots(slot, times) {
        if (config.slot !== 'all' && config.slot !== slot) return;

        for (const timeString of times) {
            const expression = createCronExpression(timeString);
            cron.schedule(expression, () => {
                guardedRun(slot, `${slot}-${timeString}`);
            }, { timezone: config.timezone });
            console.log(`🕒 Scheduled ${slot} at ${timeString} (${expression})`);
        }
    }

    scheduleSlots('comment', config.commentTimes);
    scheduleSlots('story', config.storyTimes);
    scheduleSlots('reel', config.reelTimes);
    scheduleSlots('carousel', config.carouselTimes);

    console.log('✅ Autopilot is running. Waiting for scheduled windows...');
}

main().catch(error => {
    console.error(`❌ Fatal: ${error.message}`);
    process.exit(1);
});

/**
 * Bachata Exotica Daily Facebook Automation
 * Daily post runner with media + fallback strategy:
 * 1) provided media (video/image)
 * 2) current flyer from event config
 * 3) AI-generated image + bachata history post
 * 4) AI-generated image + Daniel Sensual song post
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    testFacebookConnection,
    postToFacebook,
    postToFacebookWithImage,
    postToFacebookWithVideo,
} from './facebook-client.js';
import { isDuplicate, record } from './post-history.js';
import { generateImage, cleanupImageCache } from './image-generator.js';

dotenv.config({ quiet: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PAGE_ID = '266552527115323';
const DEFAULT_EVENT_CONFIG = path.join(__dirname, '..', 'events', 'bachata-pool-party', 'config.json');
const DEFAULT_CURRENT_EVENT_GRACE_DAYS = 30;

const HISTORY_POST_TEMPLATES = [
    // ── Cultural History ─────────────────────────────────────
    'Bachata started in the barrios of the Dominican Republic in the 1960s. It evolved from bolero and son into a social dance that now connects people in every major city on the planet.\n\nWhat style do you love most right now — traditional, moderna, or sensual?',
    'Quick history: bachata was literally called "música de amargue" — music of bitterness. The upper class dismissed it. Radio stations banned it.\n\nNow it fills dance floors worldwide. Never let anyone tell you your art doesn\'t belong.',
    'What started in neighborhood gatherings in the Dominican Republic became one of the most loved social dances in the world.\n\nRespect the roots. Train the fundamentals. Enjoy the connection.',
    'Juan Luis Guerra\'s "Bachata Rosa" in 1990 changed everything. It proved bachata could win Grammys and fill stadiums.\n\nBefore him, this music was banned from radio. Who\'s your favorite bachata artist of all time?',
    'The güira, the bongo, and the bass guitar — that\'s the holy trinity of bachata rhythm. Everything else is built on top of those three.\n\nNext time you dance, try to isolate each instrument with your body. It changes everything.',

    // ── Technique & Tips ─────────────────────────────────────
    'The foundation of great bachata is timing, weight transfer, and actually listening to the music before chasing patterns.\n\nSounds simple. Most people skip it.',
    'Your basic step IS your style. The way you hit that 4-count, the weight in your step, how your body grooves — that\'s what makes people want to dance with you.\n\nPatterns come and go. Musicality stays.',
    'The best leaders in bachata don\'t force patterns. They listen. They feel where their partner is, read the music, and create something together.\n\nThat\'s the magic. That\'s why we dance.',

    // ── Debate / Engagement ──────────────────────────────────
    'Sensual vs. Traditional vs. Moderna — which style takes the most skill to master?\n\nDefend your pick. I want to hear real answers.',
    'What makes a great social dancer?\n\nA) Clean basics and footwork\nB) Musicality — hitting every accent\nC) Connection — making your partner feel safe\nD) All of the above\n\nHonest answer only.',

    // ── Weekend Hooks ────────────────────────────────────────
    'Wherever you\'re dancing this weekend — put on your favorite playlist, find a good partner, and just be present.\n\nThat\'s it. That\'s the whole plan.',
    'Weekend formula:\n\n1. Pick your outfit\n2. Put on bachata\n3. Hit the social\n4. Dance until they turn the lights on\n\nWho\'s going out? Drop your city.',
];

const DANIEL_SENSUAL_SONG_TEMPLATES = [
    'Put this on, grab your partner, and give yourself one clean-song practice round tonight.\n\nGood music + good basics = better socials.',
    'Use this track for musicality drills — listen for the accents, then match your body movement to the phrasing.\n\nSmall reps, big results on the floor.',
    'This track is built for that slow, connected, musical bachata. The kind where the music does the work and you just flow with it.\n\nSave it. You\'ll thank me at the next social.',
    'Daniel Sensual makes the kind of music that sounds even better at 1am on a warm night with the right person.\n\nWhat\'s your go-to late night bachata track?',
    'Before you go to the social tonight — put on a Daniel Sensual track and practice your body movement in the mirror for 5 minutes.\n\nSmall reps = big results on the floor.',
    'AI-produced bachata that actually sounds like bachata. No gimmicks. Just real Dominican guitar tones, clean rhythms, and tracks made for the dance floor.',
    'Música pa\' sentirla. Daniel Sensual just hits different when you\'re in that zone — lights low, music up, partner close.',
];

function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseBoolean(value, fallback = false) {
    if (value == null || value === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
}

function formatDateIso(date) {
    return date.toISOString().slice(0, 10);
}

function ensureFilePath(rawPath, label) {
    const resolved = path.resolve(rawPath);
    if (!fs.existsSync(resolved)) {
        throw new Error(`${label} file not found: ${resolved}`);
    }
    return resolved;
}

function pickByDay(items, now) {
    const dayNumber = Math.floor(now.getTime() / (24 * 60 * 60 * 1000));
    return items[dayNumber % items.length];
}

function loadJsonFile(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
}

export function isCurrentEventDate(eventDateRaw, now = new Date(), graceDays = DEFAULT_CURRENT_EVENT_GRACE_DAYS) {
    const eventDate = parseDate(eventDateRaw);
    if (!eventDate) return false;

    const cutoff = new Date(now);
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - graceDays);

    return eventDate >= cutoff;
}

export function parseSongLinks(rawSongLinks) {
    if (!rawSongLinks) return [];
    return String(rawSongLinks)
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

export function buildBachataCandidates(options = {}) {
    const now = options.now || new Date();
    const explicitCaption = normalizeText(options.caption);
    const explicitImagePath = options.imagePath ? ensureFilePath(options.imagePath, 'Image') : null;
    const explicitVideoPath = options.videoPath ? ensureFilePath(options.videoPath, 'Video') : null;

    if (explicitImagePath && explicitVideoPath) {
        throw new Error('Use either image or video, not both.');
    }

    const eventConfigPath = options.eventConfigPath || process.env.BACHATA_EVENT_CONFIG || DEFAULT_EVENT_CONFIG;
    const eventConfig = options.eventConfig || loadJsonFile(eventConfigPath);
    const songLinks = options.songLinks || parseSongLinks(process.env.BACHATA_DANIEL_SENSUAL_SONG_URLS || '');

    const eventCaption = normalizeText(eventConfig?.post?.textShort || eventConfig?.post?.text);
    const eventDateRaw = eventConfig?.event?.date;
    const flyerRelative = eventConfig?.event?.flyerPath;
    const flyerPath = flyerRelative
        ? path.resolve(path.dirname(eventConfigPath), flyerRelative)
        : null;
    const hasFlyer = Boolean(flyerPath && fs.existsSync(flyerPath));
    const currentFlyer = hasFlyer && isCurrentEventDate(eventDateRaw, now);

    const historyCaption = pickByDay(HISTORY_POST_TEMPLATES, now);
    const songTemplate = pickByDay(DANIEL_SENSUAL_SONG_TEMPLATES, now);
    const songLink = songLinks.length > 0 ? pickByDay(songLinks, now) : '';
    const songCaption = songLink
        ? `${songTemplate}\n\n\u{1F3B6} ${songLink}`
        : songTemplate;

    const fallbackCaption = eventCaption || historyCaption;
    const candidates = [];

    if (explicitVideoPath) {
        candidates.push({
            type: 'provided_video',
            caption: explicitCaption || fallbackCaption,
            videoPath: explicitVideoPath,
            hasVideo: true,
            hasImage: false,
            reason: 'Operator provided a video override.',
        });
        return candidates;
    }

    if (explicitImagePath) {
        candidates.push({
            type: 'provided_image',
            caption: explicitCaption || fallbackCaption,
            imagePath: explicitImagePath,
            hasVideo: false,
            hasImage: true,
            reason: 'Operator provided an image override.',
        });
        return candidates;
    }

    if (explicitCaption) {
        candidates.push({
            type: 'provided_text',
            caption: explicitCaption,
            hasVideo: false,
            hasImage: false,
            reason: 'Operator provided custom caption text.',
        });
    }

    if (currentFlyer) {
        candidates.push({
            type: 'current_flyer',
            caption: eventCaption || historyCaption,
            imagePath: flyerPath,
            hasVideo: false,
            hasImage: true,
            reason: `Event flyer exists and event date (${eventDateRaw}) is within ${DEFAULT_CURRENT_EVENT_GRACE_DAYS} days, so flyer is highest-priority valid candidate.`,
        });
    }

    candidates.push({
        type: 'history_post',
        caption: historyCaption,
        hasVideo: false,
        hasImage: false,
        reason: 'No valid media candidate selected, using bachata history fallback post.',
    });

    candidates.push({
        type: 'daniel_sensual_song',
        caption: songCaption,
        hasVideo: false,
        hasImage: false,
        reason: songLink
            ? 'Fallback moved to Daniel Sensual song post with configured song link.'
            : 'Fallback moved to Daniel Sensual song post template.',
    });

    return candidates;
}

export function pickCandidate(candidates, now = new Date(), isDuplicateFn = isDuplicate) {
    for (const candidate of candidates) {
        if (!candidate.caption) continue;
        if (!isDuplicateFn(candidate.caption)) return { ...candidate, dedupeBypassed: false };
    }

    const first = candidates.find((candidate) => candidate.caption);
    if (!first) {
        throw new Error('No valid Bachata post candidate could be generated.');
    }

    return {
        ...first,
        caption: `${first.caption}\n\n${formatDateIso(now)}`,
        reason: `${first.reason || 'All candidates were duplicates.'} Duplicate override tag appended to force a unique post.`,
        dedupeBypassed: true,
    };
}

export async function runBachataDailyPost(options = {}, dependencies = {}) {
    const nowFn = dependencies.nowFn || (() => new Date());
    const now = nowFn();
    const dryRun = Boolean(options.dryRun);
    const silent = Boolean(options.silent);
    const pageId = normalizeText(options.pageId || process.env.BACHATA_PAGE_ID || DEFAULT_PAGE_ID);
    const forceUserToken = options.forceUserToken ?? parseBoolean(process.env.BACHATA_FORCE_USER_TOKEN, true);
    const testFacebookConnectionFn = dependencies.testFacebookConnectionFn || testFacebookConnection;
    const postToFacebookFn = dependencies.postToFacebookFn || postToFacebook;
    const postToFacebookWithImageFn = dependencies.postToFacebookWithImageFn || postToFacebookWithImage;
    const postToFacebookWithVideoFn = dependencies.postToFacebookWithVideoFn || postToFacebookWithVideo;
    const isDuplicateFn = dependencies.isDuplicateFn || isDuplicate;
    const recordFn = dependencies.recordFn || record;

    if (!pageId) {
        throw new Error('Missing page ID. Set --page-id or BACHATA_PAGE_ID.');
    }

    const candidates = buildBachataCandidates({
        now,
        caption: options.caption,
        imagePath: options.imagePath,
        videoPath: options.videoPath,
        eventConfigPath: options.eventConfigPath,
        eventConfig: options.eventConfig,
        songLinks: options.songLinks,
    });
    const candidate = pickCandidate(candidates, now, isDuplicateFn);

    if (!silent) {
        console.log('');
        console.log('\u{1F334} Bachata Daily Facebook Automation');
        console.log('\u2550'.repeat(58));
        console.log(`Page ID: ${pageId}`);
        console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
        console.log(`Selected: ${candidate.type}${candidate.dedupeBypassed ? ' (dedupe override)' : ''}`);
        if (candidate.imagePath) console.log(`Image: ${candidate.imagePath}`);
        if (candidate.videoPath) console.log(`Video: ${candidate.videoPath}`);
        console.log('-'.repeat(58));
        console.log(candidate.caption);
        console.log('\u2550'.repeat(58));
    }

    if (dryRun) {
        return {
            success: true,
            dryRun: true,
            pageId,
            selectedType: candidate.type,
            selectedReason: candidate.reason || '',
            hasImage: candidate.hasImage,
            hasVideo: candidate.hasVideo,
            caption: candidate.caption,
        };
    }

    const previousPageId = process.env.FACEBOOK_PAGE_ID;
    const previousPageAccessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

    try {
        process.env.FACEBOOK_PAGE_ID = pageId;
        if (forceUserToken) {
            process.env.FACEBOOK_PAGE_ACCESS_TOKEN = '';
        }

        // Auto-generate an image for text-only posts so every post has media
        const generateImageFn = dependencies.generateImageFn || generateImage;
        if (!candidate.hasImage && !candidate.hasVideo) {
            try {
                if (!silent) console.log('\u{1F3A8} Generating AI image for text-only post...');
                const generatedPath = await generateImageFn(candidate.caption, { style: 'bachata' });
                if (generatedPath) {
                    candidate.imagePath = generatedPath;
                    candidate.hasImage = true;
                    candidate.reason = `${candidate.reason || ''} AI image auto-generated.`;
                    if (!silent) console.log(`\u2705 Image generated: ${generatedPath}`);
                }
            } catch (imgErr) {
                if (!silent) console.warn(`\u26A0\uFE0F Image generation failed, posting text-only: ${imgErr.message}`);
            }
        }

        const connection = await testFacebookConnectionFn();
        if (!connection || connection.type === 'user_no_pages') {
            throw new Error('Facebook connection failed for Bachata daily automation.');
        }

        let result = null;
        if (candidate.videoPath) {
            result = await postToFacebookWithVideoFn(candidate.caption, candidate.videoPath);
        } else if (candidate.imagePath) {
            result = await postToFacebookWithImageFn(candidate.caption, candidate.imagePath);
        } else {
            result = await postToFacebookFn(candidate.caption);
        }

        recordFn({
            text: candidate.caption,
            pillar: `bachata_daily:${candidate.type}`,
            aiGenerated: false,
            hasVideo: candidate.hasVideo,
            hasImage: candidate.hasImage,
            results: {
                facebook: result?.post_id || result?.id || 'posted',
            },
        });

        // Clean up old generated images
        try { cleanupImageCache(); } catch { /* ignore */ }

        return {
            success: true,
            dryRun: false,
            pageId,
            selectedType: candidate.type,
            selectedReason: candidate.reason || '',
            hasImage: candidate.hasImage,
            hasVideo: candidate.hasVideo,
            postId: result?.post_id || result?.id || null,
        };
    } finally {
        if (previousPageId === undefined) delete process.env.FACEBOOK_PAGE_ID;
        else process.env.FACEBOOK_PAGE_ID = previousPageId;

        if (previousPageAccessToken === undefined) delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
        else process.env.FACEBOOK_PAGE_ACCESS_TOKEN = previousPageAccessToken;
    }
}

export default {
    runBachataDailyPost,
    buildBachataCandidates,
    pickCandidate,
    isCurrentEventDate,
    parseSongLinks,
};

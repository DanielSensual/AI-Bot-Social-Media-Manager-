#!/usr/bin/env node
/**
 * Lana Dance Video Campaign — DanielSensual Business Page
 * 
 * Posts 3 clips over 3 days, each with AI-generated catchy captions:
 *   Day 1 (tonight 8PM): 20s teaser clip  — "intro energy"
 *   Day 2 (tomorrow 8PM): 30s clip        — "dynamic steps"
 *   Day 3 (day after 8PM): 40s clip       — "finale showcase"
 * 
 * After posting, triggers group sharing via the existing danielsensual-sharer.
 * 
 * Usage:
 *   node scripts/lana-campaign.js                # Post today's clip NOW
 *   node scripts/lana-campaign.js --day=1        # Force Day 1 clip
 *   node scripts/lana-campaign.js --day=2        # Force Day 2 clip
 *   node scripts/lana-campaign.js --day=3        # Force Day 3 clip
 *   node scripts/lana-campaign.js --dry-run      # Preview without posting
 *   node scripts/lana-campaign.js --caption-only  # Just show the AI caption
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateText, hasLLMProvider } from '../src/llm-client.js';
import { applyDanielFacebookEnvMapping } from '../src/daniel-facebook-env.js';
import { postToFacebookWithVideo } from '../src/facebook-client.js';
import { shareToAllGroups } from '../src/danielsensual-sharer.js';
import { SHARE_GROUPS } from '../src/danielsensual-groups.js';

dotenv.config();

// Map Daniel creds → shared Facebook creds
applyDanielFacebookEnvMapping();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIPS_DIR = '/tmp/lana-campaign/clips';
const STATE_FILE = path.join(__dirname, '..', '.lana-campaign-state.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const captionOnly = args.includes('--caption-only');
const noShare = args.includes('--no-share');
const dayFlag = args.find(a => a.startsWith('--day='));
const forcedDay = dayFlag ? parseInt(dayFlag.split('=')[1]) : null;

// ─── Campaign Schedule ──────────────────────────────────────────

const CAMPAIGN = [
    {
        day: 1,
        clip: 'lana_clip_20s.mp4',
        duration: '20s',
        thumb_offset: 3,
        vibe: 'teaser — the opening energy, first impression, grab attention in 3 seconds',
        hashtags: '#Bachata #BachataSensual #DanielSensual #OrlandoDance #BachataVibes #DanceVideo',
    },
    {
        day: 2,
        clip: 'lana_clip_30s.mp4',
        duration: '30s',
        thumb_offset: 8,
        vibe: 'the fire builds — dynamic footwork, body waves, and partner chemistry',
        hashtags: '#BachataDance #SocialDance #OrlandoBachata #BachataPartner #DanceIsLife #Lana',
    },
    {
        day: 3,
        clip: 'lana_clip_40s.mp4',
        duration: '40s',
        thumb_offset: 11,
        vibe: 'the full experience — finale moves, showstopper energy, leave them wanting more',
        hashtags: '#DanielSensual #BachataShow #BachataSensual #OrlandoDancers #BachataLove #DanceCommunity',
    },
];

// ─── Determine Which Day ────────────────────────────────────────

function getCampaignDay() {
    if (forcedDay) return forcedDay;

    // Check state file for campaign start date
    let state = {};
    if (fs.existsSync(STATE_FILE)) {
        try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); } catch {}
    }

    if (!state.startDate) {
        // First run — start campaign today
        state.startDate = new Date().toISOString().split('T')[0];
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    }

    const startDate = new Date(state.startDate + 'T00:00:00-04:00');
    const now = new Date();
    const daysDiff = Math.floor((now - startDate) / 86400000);
    return Math.min(daysDiff + 1, 3); // Cap at day 3
}

// ─── AI Caption Generator ───────────────────────────────────────

async function generateCaption(entry) {
    const prompt = `You write catchy Facebook Reels/video captions for Daniel Sensual, a bachata dancer in Orlando, FL.

This is Part ${entry.day} of 3 from a bachata dance video called "Lana" — a social dance with a partner.

Clip vibe: ${entry.vibe}
Duration: ${entry.duration}
Part ${entry.day} of 3.

Write a short, catchy Facebook video caption that:
- Hooks in the first line (emoji + punchy statement)
- MUST say "Part ${entry.day} of 3" (NOT "Day") somewhere in the caption
- Feels authentic, not corporate
- Creates anticipation for the next part (if Part 1 or 2)
- On Part 3, go for a strong closer
- Mix a tiny bit of Spanish naturally if it fits
- Max 3-4 short paragraphs
- End with hashtags: ${entry.hashtags}
- Under 600 characters total

${entry.day === 1 ? 'This is the FIRST drop — build hype. Use "Part 1 of 3" phrasing.' : ''}
${entry.day === 2 ? 'This is Part 2 of 3 — the energy is building. Reference that people saw Part 1.' : ''}
${entry.day === 3 ? 'This is the FINALE — Part 3 of 3. Give it a strong ending. "Save this one" energy.' : ''}

IMPORTANT: Say "Part" not "Day". Output ONLY the caption text, nothing else.`;

    if (!hasLLMProvider()) return getFallbackCaption(entry);

    try {
        const { text } = await generateText({
            prompt,
            maxOutputTokens: 250,
            openaiModel: 'gpt-5.4-mini',
        });
        return text.trim().replace(/^["']|["']$/g, '');
    } catch (err) {
        console.warn(`⚠️ AI caption failed: ${err.message}`);
        return getFallbackCaption(entry);
    }
}

function getFallbackCaption(entry) {
    const captions = {
        1: `💃 Part 1 of 3 — "Lana" 🔥\n\nWhen the music starts and everything just clicks. This is how bachata is supposed to feel.\n\nStay tuned for Part 2 tomorrow 👀\n\n${entry.hashtags}`,
        2: `🔥 Part 2 of 3 — "Lana" 💃\n\nThe energy builds. The connection deepens. This is where it gets real.\n\nPart 3 drops tomorrow — you don't want to miss the finale.\n\n${entry.hashtags}`,
        3: `💥 Part 3 of 3 — "Lana" (Full Finale) 🎬\n\nThis is the one. Save it. Share it. This is what bachata looks like when two people are locked in.\n\nWhich part was your favorite? Drop it in the comments 👇\n\n${entry.hashtags}`,
    };
    return captions[entry.day] || captions[1];
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
    const day = getCampaignDay();
    const entry = CAMPAIGN.find(c => c.day === day);

    if (!entry) {
        console.log('✅ Campaign complete! All 3 clips have been posted.');
        return;
    }

    const clipPath = path.join(CLIPS_DIR, entry.clip);

    console.log('');
    console.log('═'.repeat(50));
    console.log('🎬 Lana Dance Video Campaign — DanielSensual');
    console.log('═'.repeat(50));
    console.log(`   Part: ${entry.day} of 3`);
    console.log(`   Clip: ${entry.clip} (${entry.duration})`);
    console.log(`   Thumb offset: ${entry.thumb_offset}s`);
    console.log(`   Mode: ${dryRun ? '🔒 DRY RUN' : '🔴 LIVE'}`);
    console.log('');

    if (!fs.existsSync(clipPath)) {
        console.error(`❌ Clip not found: ${clipPath}`);
        console.error('   Run the FFmpeg extraction first.');
        process.exit(1);
    }

    const stats = fs.statSync(clipPath);
    console.log(`   File size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
    console.log('');

    // Generate caption
    console.log('✍️  Generating caption...');
    const caption = await generateCaption(entry);
    console.log('');
    console.log('─'.repeat(40));
    console.log(caption);
    console.log('─'.repeat(40));
    console.log('');

    if (captionOnly) {
        console.log('📝 Caption-only mode — done.');
        return;
    }

    if (dryRun) {
        console.log('🔒 DRY RUN — would post this clip to DanielSensual page');
        console.log(`   Page ID: ${process.env.FACEBOOK_PAGE_ID}`);
        console.log(`   Clip: ${clipPath}`);
        return;
    }

    // Post to Facebook with thumbnail offset
    console.log('📤 Uploading video to DanielSensual page...');
    try {
        const result = await postToFacebookWithVideo(caption, clipPath, { thumbOffset: entry.thumb_offset });
        console.log(`✅ Posted! Video ID: ${result.id}`);

        // Update state
        let state = {};
        if (fs.existsSync(STATE_FILE)) {
            try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); } catch {}
        }
        state[`part${day}_posted`] = new Date().toISOString();
        state[`part${day}_videoId`] = result.id;
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

        console.log('');
        if (day < 3) {
            console.log(`📅 Part ${day + 1} of 3 drops tomorrow at 8PM.`);
        } else {
            console.log('🎉 Campaign complete! All 3 clips posted.');
        }

        // ── Auto-share to groups ──────────────────────────────
        if (!noShare) {
            const pageId = process.env.FACEBOOK_PAGE_ID || '2097158930569621';
            const postUrl = `https://www.facebook.com/${pageId}/videos/${result.id}`;

            console.log('');
            console.log('═'.repeat(50));
            console.log('📢 Sharing to groups...');
            console.log(`   Video URL: ${postUrl}`);
            console.log(`   Groups: ${SHARE_GROUPS.length} across 3 batches`);
            console.log('═'.repeat(50));
            console.log('');

            try {
                // Share across all 3 batches sequentially
                for (let batch = 1; batch <= 3; batch++) {
                    console.log(`\n── Batch ${batch}/3 ──`);
                    const shareResult = await shareToAllGroups({
                        postUrl,
                        groups: SHARE_GROUPS,
                        batch,
                        batchSize: 14,
                        dryRun: false,
                        headless: true,
                    });
                    console.log(`   Batch ${batch}: ${shareResult.posted} shared, ${shareResult.failed} failed, ${shareResult.skipped} skipped`);

                    // Pause 2-3 min between batches to avoid detection
                    if (batch < 3) {
                        const pauseSec = Math.floor(Math.random() * 61) + 120;
                        console.log(`   ⏳ Pausing ${pauseSec}s before next batch...`);
                        await new Promise(r => setTimeout(r, pauseSec * 1000));
                    }
                }
                console.log('');
                console.log('✅ Group sharing complete!');
            } catch (shareErr) {
                console.error(`⚠️ Group sharing failed: ${shareErr.message}`);
                console.error('   (The video was still posted successfully)');
            }
        } else {
            console.log('\n⏭️  --no-share flag set, skipping group shares');
        }

        return result;
    } catch (err) {
        console.error(`❌ Post failed: ${err.message}`);
        process.exit(1);
    }
}

main().catch(err => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
});

#!/usr/bin/env node
/**
 * DanielSensual Content Scheduler (Railway)
 *
 * Persistent scheduler that posts bachata content throughout the day.
 * Runs as a long-lived process — designed for Railway/Docker.
 *
 * Schedule: 6 posts per day across 3 pillars
 *   08:30 — Dance tip / morning motivation
 *   10:30 — Music drop / studio update
 *   13:00 — Dance scene / community post
 *   16:00 — Music / behind the scenes
 *   19:00 — Event promo / evening dance post
 *   21:30 — Night vibes / social dance energy
 */

import dotenv from 'dotenv';
import cron from 'node-cron';
import {
    buildPost,
    getTodaysPillar,
    loadActiveEvents,
    PILLARS,
} from '../src/danielsensual-content.js';

dotenv.config();

const TZ = 'America/New_York';
const GRAPH_API = 'https://graph.facebook.com/v21.0';

// Daniel's personal profile token for organic posting
const USER_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;
// Use 'me' endpoint for personal profile posting
const PROFILE_TARGET = 'me';

// ─── Post Schedule ──────────────────────────────────────────────
// Each slot has a cron expression + pillar assignment
const SCHEDULE = [
    { cron: '30 08 * * *', pillar: 'dance',  label: 'Morning dance motivation' },
    { cron: '30 10 * * *', pillar: 'music',  label: 'Music drop / studio update' },
    { cron: '00 13 * * *', pillar: 'dance',  label: 'Afternoon community post' },
    { cron: '00 16 * * *', pillar: 'music',  label: 'Behind the scenes' },
    { cron: '00 19 * * *', pillar: 'event',  label: 'Evening event promo' },
    { cron: '30 21 * * *', pillar: 'dance',  label: 'Night social dance vibes' },
];

// ─── Facebook Graph API Poster ──────────────────────────────────

async function postToFacebook(caption, pillar) {
    if (!USER_TOKEN) {
        console.log('   ⚠️ No FACEBOOK_ACCESS_TOKEN — logging content only');
        return { logged: true, posted: false };
    }

    const url = `${GRAPH_API}/${PROFILE_TARGET}/feed`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: caption,
                access_token: USER_TOKEN,
            }),
        });

        const data = await response.json();

        if (data.error) {
            console.error(`   ❌ Facebook API error: ${data.error.message}`);
            return { posted: false, error: data.error.message };
        }

        console.log(`   ✅ Posted to Facebook (ID: ${data.id})`);
        return { posted: true, postId: data.id };
    } catch (err) {
        console.error(`   ❌ Post failed: ${err.message}`);
        return { posted: false, error: err.message };
    }
}

// ─── Content Generation + Post ──────────────────────────────────

async function runPost(pillar, label) {
    const jitter = Math.floor(Math.random() * 5 * 60 * 1000); // 0-5 min jitter
    await new Promise(r => setTimeout(r, jitter));

    const now = new Date().toLocaleString('en-US', { timeZone: TZ });
    console.log(`\n${'─'.repeat(58)}`);
    console.log(`🎯 ${label}`);
    console.log(`📅 ${now} | Pillar: ${pillar.toUpperCase()}`);
    console.log(`${'─'.repeat(58)}`);

    // Check for active events — fallback to dance if no events
    let effectivePillar = pillar;
    if (pillar === 'event') {
        const events = loadActiveEvents();
        if (events.length === 0) {
            console.log('   ⚠️ No active events — switching to dance');
            effectivePillar = 'dance';
        }
    }

    try {
        const result = await buildPost(effectivePillar, { aiEnabled: true });

        console.log(`   📝 Source: ${result.source} | ${result.provider || 'template'}`);
        console.log(`   📏 Length: ${result.caption.length} chars`);
        console.log(`\n${result.caption.slice(0, 200)}${result.caption.length > 200 ? '...' : ''}\n`);

        // Post to Facebook
        const postResult = await postToFacebook(result.caption, effectivePillar);

        return { ...result, ...postResult, pillar: effectivePillar };
    } catch (err) {
        console.error(`   ❌ Generation failed: ${err.message}`);
        return { error: err.message, pillar: effectivePillar };
    }
}

// ─── Main Scheduler ─────────────────────────────────────────────

async function main() {
    console.log('');
    console.log('💃 ═══════════════════════════════════════════');
    console.log('   D A N I E L   S E N S U A L');
    console.log('   Bachata Content Scheduler');
    console.log('═══════════════════════════════════════════════');
    console.log(`   Timezone: ${TZ}`);
    console.log(`   Posts per day: ${SCHEDULE.length}`);
    console.log(`   Facebook token: ${USER_TOKEN ? '✅ set' : '❌ not set'}`);
    console.log(`   Target: Personal profile (${PROFILE_TARGET})`);
    console.log('');

    // Schedule all posts
    for (const slot of SCHEDULE) {
        cron.schedule(slot.cron, () => runPost(slot.pillar, slot.label), {
            timezone: TZ,
        });

        const [min, hour] = slot.cron.split(' ');
        console.log(`   📅 ${hour.padStart(2, '0')}:${min.padStart(2, '0')} — ${slot.label} [${slot.pillar}]`);
    }

    console.log('');
    console.log('💃 DanielSensual scheduler is running. Posting bachata content daily.');
    console.log('');

    // Fire an immediate post on startup (so we know it works)
    const currentHour = new Date().toLocaleString('en-US', {
        timeZone: TZ,
        hour: 'numeric',
        hour12: false,
    });

    const hour = parseInt(currentHour, 10);
    if (hour >= 8 && hour <= 22) {
        console.log('🔥 Firing startup post...');
        const pillar = getTodaysPillar();
        await runPost(pillar, `Startup post (${pillar})`);
    } else {
        console.log('🌙 Night mode — skipping startup post. First post at 08:30 ET.');
    }
}

main().catch(err => {
    console.error(`💀 DanielSensual scheduler crash: ${err.message}`);
    process.exit(1);
});

#!/usr/bin/env node
/**
 * Bachata After Dark — Flyer Animation via Grok Imagine Video
 * 
 * Flyer is hosted on Cloudflare R2 (danielsensual-videos bucket).
 * Grok gets the public URL directly — no catbox/temp host needed.
 * 
 * Usage: node scripts/bachata-flyer-animate.mjs
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const XAI_BASE = 'https://api.x.ai/v1';
const XAI_API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.XAI_VIDEO_API_KEY || '';
const CACHE_DIR = path.join(__dirname, '..', '.video-cache');

// ─── Flyer on R2 (danielsensual-videos bucket) ─────────────────
const FLYER_URL = 'https://pub-08b13d4f16a94e53b21c44448dee943a.r2.dev/events/bachata-after-dark-flyer.png';

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Start Grok I2V generation ──────────────────────────────────
async function startGeneration(imageUrl, prompt) {
    console.log('🎬 Starting Grok Imagine Video generation...');
    console.log(`   Image URL: ${imageUrl}`);

    const body = {
        model: 'grok-imagine-video',
        prompt,
        image: { url: imageUrl },
        duration: 10,
        aspect_ratio: '16:9',
        resolution: '720p',
    };

    const resp = await fetch(`${XAI_BASE}/videos/generations`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${XAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const rawText = await resp.text();
    let data;
    try {
        data = JSON.parse(rawText);
    } catch {
        throw new Error(`Grok API returned non-JSON (${resp.status}): ${rawText.slice(0, 200)}`);
    }
    if (!resp.ok) {
        throw new Error(`Grok API ${resp.status}: ${data?.error?.message || JSON.stringify(data)}`);
    }

    const requestId = data?.request_id || data?.id;
    if (!requestId) throw new Error('No request_id returned from Grok');

    console.log(`   ✅ Request ID: ${requestId}`);
    return requestId;
}

// ─── Poll until video is ready ──────────────────────────────────
async function pollForVideo(requestId, maxWaitMs = 8 * 60 * 1000) {
    const start = Date.now();
    let dots = 0;

    while (Date.now() - start < maxWaitMs) {
        const resp = await fetch(`${XAI_BASE}/videos/${encodeURIComponent(requestId)}`, {
            headers: { 'Authorization': `Bearer ${XAI_API_KEY}` },
        });

        const data = await resp.json();
        const status = data?.status || 'processing';
        const progress = data?.progress ?? 0;
        const elapsed = Math.round((Date.now() - start) / 1000);

        if (status === 'done' || data?.video?.url) {
            const videoUrl = data?.video?.url || data?.video_url;

            if (data?.video?.respect_moderation === false) {
                throw new Error('Video blocked by moderation');
            }
            if (!videoUrl) throw new Error('Completed but no video URL');

            process.stdout.write(`\r   Status: completed [100%] (${elapsed}s)\n`);

            if (data?.video?.duration) console.log(`   ⏱️  Duration: ${data.video.duration}s`);
            if (data?.usage?.cost_in_usd_ticks) {
                console.log(`   💰 Cost: $${(data.usage.cost_in_usd_ticks / 10_000_000_000).toFixed(4)}`);
            }

            return videoUrl;
        }

        if (status === 'failed' || status === 'error') {
            throw new Error(`Generation failed: ${data?.error?.message || JSON.stringify(data?.error || data)}`);
        }

        dots = (dots + 1) % 4;
        process.stdout.write(`\r   Status: ${status} [${progress}%] ${'.'.repeat(dots + 1).padEnd(4)} (${elapsed}s)`);
        await sleep(3000);
    }

    throw new Error('Generation timed out after 8 minutes');
}

// ─── Download to cache ──────────────────────────────────────────
async function downloadVideo(videoUrl, requestId) {
    console.log('\n📥 Downloading video...');
    const resp = await fetch(videoUrl, { redirect: 'follow' });
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);

    const buf = Buffer.from(await resp.arrayBuffer());
    const filename = `bachata_afterdark_${requestId.slice(0, 12)}_${Date.now()}.mp4`;
    const filepath = path.join(CACHE_DIR, filename);
    fs.writeFileSync(filepath, buf);

    console.log(`   ✅ Saved: ${filepath}`);
    return filepath;
}

// ─── Prompt ─────────────────────────────────────────────────────
const PROMPT = `Animate this event flyer poster with cinematic atmospheric effects. 

CRITICAL RULE: DO NOT move, distort, warp, morph, or animate the people/dancers in this image AT ALL. The couple must remain COMPLETELY FROZEN and STATIC in their exact pose. Their bodies, faces, hair, and clothing must not move even slightly.

ONLY animate the ENVIRONMENT and ATMOSPHERE around the static figures:
- Thick dramatic fog slowly rolling in from the bottom edges, creeping across the lower third of the frame
- Soft warm golden bokeh light orbs floating gently upward behind the couple
- A single subtle cinematic lens flare sweeping slowly from left to right
- Very gentle warm pulsing glow on the large "BACHATA AFTER DARK" title text, as if illuminated by flickering candlelight
- Faint sparkle shimmer on the woman's white dress catching stage lighting
- Background party lights in the far distance softly twinkling and shifting color temperature
- Overall filmic 24fps grain overlay for premium cinematic texture
- Subtle vignette darkening at the edges, slowly breathing in and out

The mood: intimate, luxurious, romantic bachata nightlife at a premium Orlando lounge at midnight.
Camera is LOCKED and does NOT move at all. This is a still poster brought to atmospheric life.
Keep ALL text perfectly sharp and legible throughout the entire duration.`;

// ─── Main ───────────────────────────────────────────────────────
async function main() {
    console.log('');
    console.log('🌙 ═══════════════════════════════════════════');
    console.log('   BACHATA AFTER DARK — Flyer Animation');
    console.log('═══════════════════════════════════════════════');
    console.log(`📸 Source: R2 → ${FLYER_URL}`);
    console.log(`🎬 Provider: Grok Imagine Video`);
    console.log(`⏱️  Duration: 10 seconds`);
    console.log(`📐 Aspect: 16:9 / 1080p`);
    console.log('');

    if (!XAI_API_KEY) {
        console.error('❌ Missing XAI_API_KEY / GROK_API_KEY in .env');
        process.exit(1);
    }

    try {
        // 1. Fire Grok I2V with R2 public URL
        const requestId = await startGeneration(FLYER_URL, PROMPT);

        // 2. Poll
        const videoUrl = await pollForVideo(requestId);

        // 3. Download
        const videoPath = await downloadVideo(videoUrl, requestId);

        console.log('');
        console.log('═══════════════════════════════════════════════');
        console.log('✅ ANIMATION COMPLETE');
        console.log(`📁 ${videoPath}`);
        console.log('');
        console.log('Next:');
        console.log(`  open "${videoPath}"`);
        console.log('  → Upload to danielsensual.com/bachata + social');
        console.log('═══════════════════════════════════════════════');

    } catch (err) {
        console.error('');
        console.error('❌ Failed:', err.message);
        process.exit(1);
    }
}

main();

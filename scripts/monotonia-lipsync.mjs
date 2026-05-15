#!/usr/bin/env node
/**
 * Monotonía Lip Sync Pipeline — Sync Labs (sync.so) sync-3 model
 * 
 * Takes Daniel's photo → uploads to Sync Labs → lip syncs with Monotonía audio
 * 
 * Usage: 
 *   node scripts/monotonia-lipsync.mjs
 *   node scripts/monotonia-lipsync.mjs --clip-start 30 --clip-duration 15
 *   node scripts/monotonia-lipsync.mjs --full  (uses entire track)
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { SyncClient } from '@sync.so/sdk';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, '.video-cache', 'monotonia');

// ── Config ──────────────────────────────────────────────────────
const SYNC_API_KEY = process.env.SYNC_API_KEY;
if (!SYNC_API_KEY) {
    console.error('❌ SYNC_API_KEY not found in .env');
    console.error('   Get your key at: https://sync.so/settings/api-keys');
    console.error('   Then add to .env: SYNC_API_KEY=your_key_here');
    process.exit(1);
}

const IMAGE_PATH = '/Users/danielcastillo/Downloads/241434c4-8461-43ca-aaa3-44ddf6aa80f9.jpg';
const AUDIO_PATH = '/Users/danielcastillo/Downloads/monotonia_bachata_final (Remastered) (2).mp3';

// Parse CLI args
const args = process.argv.slice(2);
const useFull = args.includes('--full');
const clipStartIdx = args.indexOf('--clip-start');
const clipDurationIdx = args.indexOf('--clip-duration');
const CLIP_START = clipStartIdx >= 0 ? parseInt(args[clipStartIdx + 1]) : 20;
const CLIP_DURATION = clipDurationIdx >= 0 ? parseInt(args[clipDurationIdx + 1]) : 15;

// ── Helpers ─────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ── Step 0: Prepare audio ───────────────────────────────────────
function prepareAudio() {
    if (useFull) {
        console.log('🎵 Using full track (no trimming)');
        return AUDIO_PATH;
    }

    console.log(`\n✂️  Trimming audio: ${CLIP_START}s → ${CLIP_START + CLIP_DURATION}s (${CLIP_DURATION}s clip)`);
    
    const outPath = path.join(OUTPUT_DIR, `monotonia_clip_${CLIP_START}_${CLIP_DURATION}s.mp3`);
    
    if (fs.existsSync(outPath)) {
        console.log('   ♻️  Clip already exists, reusing');
        return outPath;
    }

    const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
    execSync(
        `${ffmpeg} -y -i "${AUDIO_PATH}" -ss ${CLIP_START} -t ${CLIP_DURATION} -c:a libmp3lame -q:a 2 "${outPath}"`,
        { stdio: 'pipe' }
    );

    console.log(`   ✅ Clip saved: ${path.basename(outPath)}`);
    return outPath;
}

// ── Step 1: Upload file and get public URL ──────────────────────
async function uploadToSyncLabs(filepath) {
    const filename = path.basename(filepath);
    const fileSize = fs.statSync(filepath).size;
    console.log(`   📤 Uploading ${filename} (${(fileSize / 1024 / 1024).toFixed(1)}MB)...`);

    // Use Sync Labs REST upload endpoint
    const ext = path.extname(filepath).slice(1).toLowerCase();
    const mimeMap = {
        mp3: 'audio/mpeg', mp4: 'video/mp4', wav: 'audio/wav',
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        m4a: 'audio/mp4', webm: 'video/webm', mov: 'video/quicktime',
    };
    const mime = mimeMap[ext] || 'application/octet-stream';
    
    const formData = new FormData();
    const fileData = fs.readFileSync(filepath);
    const blob = new Blob([fileData], { type: mime });
    formData.append('file', blob, filename);

    const response = await fetch('https://api.sync.so/v2/upload', {
        method: 'POST',
        headers: {
            'x-api-key': SYNC_API_KEY,
        },
        body: formData,
    });

    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} — ${JSON.stringify(data)}`);
    }

    const url = data.url || data.file_url || data.asset_url;
    if (!url) {
        // If the upload returns an asset ID instead of URL, use that
        const assetId = data.id || data.asset_id;
        if (assetId) {
            console.log(`      ✅ Uploaded → asset:${assetId}`);
            return { type: 'asset', id: assetId };
        }
        throw new Error(`Upload returned no URL or asset ID: ${JSON.stringify(data)}`);
    }

    console.log(`      ✅ Uploaded → ${url.substring(0, 60)}...`);
    return { type: 'url', url };
}

// ── Step 2: Generate lip sync with sync-3 ───────────────────────
async function generateLipSync(imageRef, audioRef) {
    console.log('\n👄 Submitting to Sync Labs (sync-3 model)...');
    
    const sync = new SyncClient({ apiKey: SYNC_API_KEY });

    // Build input array based on upload results
    const input = [];
    
    // Video/Image input
    if (imageRef.type === 'url') {
        input.push({ type: 'video', url: imageRef.url });
    } else {
        input.push({ type: 'video', id: imageRef.id });
    }

    // Audio input
    if (audioRef.type === 'url') {
        input.push({ type: 'audio', url: audioRef.url });
    } else {
        input.push({ type: 'audio', id: audioRef.id });
    }

    console.log('   Input:', JSON.stringify(input.map(i => ({ type: i.type, ...(i.url ? { url: i.url.substring(0, 40) + '...' } : { id: i.id }) })), null, 2));

    const generation = await sync.generations.create({
        input,
        model: 'sync-3',
    });

    console.log(`   ⏳ Job submitted: ${generation.id}`);
    console.log(`   Status: ${generation.status}`);

    // Poll for completion
    const maxWait = 10 * 60 * 1000; // 10 min max
    const start = Date.now();

    while (Date.now() - start < maxWait) {
        await sleep(5000);

        const status = await sync.generations.get(generation.id);
        const elapsed = Math.round((Date.now() - start) / 1000);

        if (status.status === 'COMPLETED') {
            console.log(`\n   ✅ Lip sync complete! (${elapsed}s)`);
            
            // Extract output URL
            const outputUrl = status.outputUrl || status.output_url || 
                             status.output?.url || status.result?.url ||
                             (status.output && typeof status.output === 'string' ? status.output : null);
            
            if (!outputUrl) {
                console.log('   📋 Full response:', JSON.stringify(status, null, 2));
                throw new Error('No output URL found in completed response');
            }
            
            return outputUrl;
        }

        if (status.status === 'FAILED' || status.status === 'REJECTED') {
            console.error(`   ❌ Job ${status.status}:`, status.error || status.message || 'unknown');
            throw new Error(`Sync Labs job ${status.status}`);
        }

        console.log(`   ⏳ ${status.status || 'processing'} (${elapsed}s)`);
    }

    throw new Error('Sync Labs generation timed out (10 min)');
}

// ── Step 3: Download result ─────────────────────────────────────
async function downloadVideo(url) {
    const filename = `monotonia_synclabs_${Date.now()}.mp4`;
    const filepath = path.join(OUTPUT_DIR, filename);

    console.log(`\n   ⬇️  Downloading final video...`);
    const resp = await fetch(url);
    
    if (!resp.ok) {
        throw new Error(`Download failed: ${resp.status}`);
    }

    const buffer = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(filepath, buffer);
    console.log(`      ✅ ${filename} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);
    return filepath;
}

// ── Main Pipeline ───────────────────────────────────────────────
async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('🎵 MONOTONÍA × SYNC LABS — sync-3 Lip Sync');
    console.log('═══════════════════════════════════════════════════\n');

    // Validate inputs
    if (!fs.existsSync(IMAGE_PATH)) {
        console.error(`❌ Image not found: ${IMAGE_PATH}`);
        process.exit(1);
    }
    if (!fs.existsSync(AUDIO_PATH)) {
        console.error(`❌ Audio not found: ${AUDIO_PATH}`);
        process.exit(1);
    }

    console.log(`📸 Image: ${path.basename(IMAGE_PATH)}`);
    console.log(`🎵 Audio: ${path.basename(AUDIO_PATH)}`);
    if (!useFull) {
        console.log(`⏱️  Clip: ${CLIP_START}s → ${CLIP_START + CLIP_DURATION}s`);
    }

    // Step 0: Prepare audio
    const audioPath = prepareAudio();

    // Step 1: Upload both files to Sync Labs
    console.log('\n📤 Uploading assets to Sync Labs...');
    const imageRef = await uploadToSyncLabs(IMAGE_PATH);
    const audioRef = await uploadToSyncLabs(audioPath);

    // Step 2: Generate lip sync
    const outputUrl = await generateLipSync(imageRef, audioRef);

    // Step 3: Download
    const finalPath = await downloadVideo(outputUrl);

    console.log('\n═══════════════════════════════════════════════════');
    console.log('✅ MONOTONÍA LIP SYNC COMPLETE');
    console.log(`   📁 Output: ${finalPath}`);
    console.log('═══════════════════════════════════════════════════\n');

    // Open in Finder
    try { execSync(`open "${path.dirname(finalPath)}"`); } catch { }
}

main().catch(err => {
    console.error('\n❌ Pipeline failed:', err.message);
    if (err.message.includes('401') || err.message.includes('403')) {
        console.error('   → Check your SYNC_API_KEY');
    }
    process.exit(1);
});

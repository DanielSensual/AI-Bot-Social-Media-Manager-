import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ────────────────────────────────────────────────────────────────
const XAI_API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
const XAI_BASE_URL = 'https://api.x.ai/v1';
const CACHE_DIR = path.join(__dirname, '..', '.video-cache');

// The edit prompt — focused and targeted, not a full scene rewrite
const editPrompt = `Change the setting to a tropical beach at night with a giant full moon in the sky. Add palm trees and a crowd of beachgoers watching. Change the performer's outfit to a teal Hawaiian palm tree shirt, cream shorts, black cap, sunglasses and a gold chain.`;

// ─── Upload to Catbox ──────────────────────────────────────────────────────
async function uploadToCatbox(filePath) {
    console.log(`📤 Uploading ${path.basename(filePath)} to Catbox...`);
    const fileData = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    const mimeType = filePath.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg';
    const boundary = '----GrokImagineUpload';

    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\n`),
        Buffer.from(`Content-Disposition: form-data; name="reqtype"\r\n\r\n`),
        Buffer.from(`fileupload\r\n`),
        Buffer.from(`--${boundary}\r\n`),
        Buffer.from(`Content-Disposition: form-data; name="fileToUpload"; filename="${filename}"\r\n`),
        Buffer.from(`Content-Type: ${mimeType}\r\n\r\n`),
        fileData,
        Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const response = await fetch('https://catbox.moe/user/api.php', {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body,
    });

    const url = await response.text();
    if (!url.startsWith('http')) {
        throw new Error(`Catbox upload failed: ${url.substring(0, 200)}`);
    }
    console.log(`✅ Uploaded: ${url}`);
    return url;
}

// ─── Download Streamable video locally ─────────────────────────────────────
async function downloadStreamable(streamableUrl) {
    console.log(`🌐 Fetching Streamable page: ${streamableUrl}`);
    const res = await fetch(streamableUrl);
    const html = await res.text();
    const match = html.match(/(https:\/\/[^"'\\]*\.mp4[^"'\\]*)/i);
    if (!match) throw new Error('Could not extract MP4 URL from Streamable');
    const directUrl = match[1].replace(/&amp;/g, '&');

    console.log(`📥 Downloading source video...`);
    const tmpDir = path.join(__dirname, '..', 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `streamable_${Date.now()}.mp4`);

    const videoRes = await fetch(directUrl);
    if (!videoRes.ok) throw new Error(`Download failed: ${videoRes.status}`);
    const buffer = await videoRes.arrayBuffer();
    fs.writeFileSync(tmpPath, Buffer.from(buffer));
    const sizeMb = (Buffer.from(buffer).length / 1024 / 1024).toFixed(1);
    console.log(`✅ Downloaded: ${sizeMb} MB`);
    return tmpPath;
}

// ─── Poll for video completion ─────────────────────────────────────────────
async function pollForVideo(requestId, maxMs = 900000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
        const res = await fetch(`${XAI_BASE_URL}/videos/${requestId}`, {
            headers: { 'Authorization': `Bearer ${XAI_API_KEY}` },
        });
        const data = await res.json().catch(() => ({}));

        if (data.video?.url) return data.video.url;
        const status = data.status || '';
        if (status === 'failed' || status === 'error' || data.state === 'failed') {
            throw new Error(`Generation failed: ${data.error || JSON.stringify(data)}`);
        }

        const elapsed = Math.round((Date.now() - start) / 1000);
        process.stdout.write(`   ⏳ ${elapsed}s elapsed... (status: ${status || 'processing'})\r`);
        await new Promise(r => setTimeout(r, 5000));
    }
    throw new Error('Timed out waiting for video');
}

// ─── Download result video ─────────────────────────────────────────────────
async function downloadVideo(url, requestId) {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    const dest = path.join(CACHE_DIR, `transform_${requestId}_${Date.now()}.mp4`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(buffer));
    console.log(`\n✅ Video saved: ${dest}`);
    return dest;
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
    if (!XAI_API_KEY) throw new Error('XAI_API_KEY / GROK_API_KEY not set');

    // 1. Download source video from Streamable
    const localVideoPath = await downloadStreamable('https://streamable.com/42wue3');

    // 2. Upload to Catbox to get a public URL (Grok needs a public URL)
    const publicVideoUrl = await uploadToCatbox(localVideoPath);

    // 3. Submit to the VIDEO EDIT endpoint (POST /v1/videos/edits)
    console.log('\n🚀 Submitting video EDIT request to Grok...');
    console.log(`   Video: ${publicVideoUrl}`);
    console.log(`   Prompt: "${editPrompt.substring(0, 80)}..."`);

    const res = await fetch(`${XAI_BASE_URL}/videos/edits`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${XAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'grok-imagine-video',
            prompt: editPrompt,
            video: { url: publicVideoUrl },
        }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(`API error ${res.status}: ${JSON.stringify(data)}`);
    }

    const requestId = data.request_id || data.id;
    if (!requestId) throw new Error(`No request_id: ${JSON.stringify(data)}`);

    console.log(`   Generation ID: ${requestId}`);

    // 4. Poll for completion
    console.log('\n⏳ Waiting for edited video (1–3 min)...');
    const videoUrl = await pollForVideo(requestId);
    console.log(`\n📽  Video ready: ${videoUrl}`);

    // 5. Download locally
    const localPath = await downloadVideo(videoUrl, requestId);
    console.log(`\n🎉 Done! Open with:\n   open "${localPath}"`);
    return localPath;
}

main()
    .then(p => {
        import('child_process').then(({ execFile }) => execFile('open', [p]));
    })
    .catch(err => {
        console.error(`\n❌ Failed:`, err.message);
        process.exit(1);
    });

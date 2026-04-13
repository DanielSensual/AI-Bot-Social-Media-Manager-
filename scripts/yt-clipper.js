/**
 * Ghost AI — YouTube Clip Engine
 * 
 * Downloads YouTube videos from tech founders (Sam Altman, Elon, etc.),
 * transcribes with YouTube captions or Whisper, uses AI to find the
 * best viral moments, and cuts them into social-ready clips.
 * 
 * Usage:
 *   node scripts/yt-clipper.js "https://youtube.com/watch?v=..."
 *   node scripts/yt-clipper.js "https://youtube.com/watch?v=..." --clips 5
 *   node scripts/yt-clipper.js --trending    # Find latest AI news videos
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
dotenv.config();

const WORK_DIR = path.join(__dirname, '..', 'tmp', 'yt-clips');
const OUTPUT_DIR = path.join(__dirname, '..', 'output', 'clips');
const XAI_API_KEY = process.env.XAI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ─── YouTube Download ────────────────────────────────────────────

function ensureDirs() {
    for (const d of [WORK_DIR, OUTPUT_DIR]) {
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    }
}

function downloadVideo(url) {
    console.log(`📥 Downloading: ${url}`);

    // Get video info first
    const infoRaw = execSync(
        `yt-dlp --dump-json --no-download "${url}"`,
        { maxBuffer: 50 * 1024 * 1024, timeout: 60000 }
    ).toString();
    const info = JSON.parse(infoRaw);

    const videoId = info.id;
    const title = info.title;
    const duration = info.duration;
    const channel = info.channel || info.uploader;

    console.log(`   📹 "${title}" by ${channel} (${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')})`);

    // Download video (720p max to save space + time)
    const outTemplate = path.join(WORK_DIR, `${videoId}.%(ext)s`);
    execSync(
        `yt-dlp -f "bestvideo[height<=720]+bestaudio/best[height<=720]" --merge-output-format mp4 -o "${outTemplate}" "${url}"`,
        { maxBuffer: 50 * 1024 * 1024, timeout: 600000, stdio: 'pipe' }
    );

    const videoPath = path.join(WORK_DIR, `${videoId}.mp4`);
    if (!fs.existsSync(videoPath)) {
        // Try webm
        const webm = path.join(WORK_DIR, `${videoId}.webm`);
        if (fs.existsSync(webm)) {
            execSync(`ffmpeg -y -i "${webm}" -c:v libx264 -c:a aac "${videoPath}"`, { timeout: 300000 });
        }
    }

    console.log(`   ✅ Downloaded`);
    return { videoPath, videoId, title, duration, channel, info };
}

// ─── Transcript Extraction ───────────────────────────────────────

function getTranscript(url, videoId) {
    // Try YouTube's auto-captions first (free + fast)
    console.log(`📝 Extracting transcript...`);

    try {
        const subPath = path.join(WORK_DIR, `${videoId}`);
        execSync(
            `yt-dlp --write-auto-sub --sub-lang en --sub-format vtt --skip-download -o "${subPath}" "${url}"`,
            { maxBuffer: 10 * 1024 * 1024, timeout: 30000, stdio: 'pipe' }
        );

        const vttFile = `${subPath}.en.vtt`;
        if (fs.existsSync(vttFile)) {
            const raw = fs.readFileSync(vttFile, 'utf-8');
            const transcript = parseVTT(raw);
            console.log(`   ✅ Got YouTube captions (${transcript.length} segments)`);
            return transcript;
        }
    } catch (e) {
        console.log(`   ⚠️ No YouTube captions, will use AI analysis`);
    }

    return null;
}

function parseVTT(vttContent) {
    const lines = vttContent.split('\n');
    const segments = [];
    let currentTime = null;
    let currentText = '';

    for (const line of lines) {
        const timeMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
        if (timeMatch) {
            if (currentTime && currentText.trim()) {
                segments.push({
                    start: parseTimestamp(currentTime[1]),
                    end: parseTimestamp(currentTime[2]),
                    text: currentText.trim(),
                });
            }
            currentTime = timeMatch;
            currentText = '';
        } else if (currentTime && line.trim() && !line.startsWith('WEBVTT') && !line.startsWith('Kind:') && !line.startsWith('Language:')) {
            // Strip VTT tags
            const clean = line.replace(/<[^>]+>/g, '').trim();
            if (clean) currentText += (currentText ? ' ' : '') + clean;
        }
    }

    // Deduplicate overlapping text (YouTube captions repeat)
    const deduped = [];
    let lastText = '';
    for (const seg of segments) {
        if (seg.text !== lastText) {
            deduped.push(seg);
            lastText = seg.text;
        }
    }

    return deduped;
}

function parseTimestamp(ts) {
    const [h, m, s] = ts.split(':');
    return parseFloat(h) * 3600 + parseFloat(m) * 60 + parseFloat(s);
}

function formatTimestamp(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
                  : `${m}:${String(s).padStart(2, '0')}`;
}

// ─── AI Clip Finder ──────────────────────────────────────────────

async function findClipMoments(transcript, videoTitle, channel, numClips = 3) {
    console.log(`🤖 AI scanning for ${numClips} viral moments...`);

    // Build the full text with timestamps
    const fullText = transcript.map(s =>
        `[${formatTimestamp(s.start)}] ${s.text}`
    ).join('\n');

    // Truncate if too long
    const maxChars = 15000;
    const trimmedText = fullText.length > maxChars
        ? fullText.substring(0, maxChars) + '\n... [transcript truncated]'
        : fullText;

    const prompt = `You are a viral content editor for Ghost AI Systems, an AI agency in Orlando.

Analyze this transcript from "${videoTitle}" by ${channel} and find the ${numClips} best moments to clip for social media (Facebook, Instagram Reels).

TRANSCRIPT:
${trimmedText}

For each clip, respond in this EXACT JSON format:
[
  {
    "start_time": "M:SS",
    "end_time": "M:SS",
    "duration_sec": 45,
    "title": "Catchy title for the clip",
    "hook": "The first sentence that grabs attention",
    "why_viral": "Why this moment is worth clipping",
    "caption": "Ready-to-post Facebook caption with hashtags"
  }
]

Rules:
- Each clip should be 30-90 seconds (ideal for Reels/Shorts)
- Look for: bold statements, predictions, controversial takes, "aha" moments, breaking news
- Add 3-5 seconds buffer before and after the key moment
- The caption should position Ghost AI Systems as the source/curator
- Include #AI #Tech #GhostAI plus relevant hashtags
- Return ONLY the JSON array, no other text`;

    const apiKey = XAI_API_KEY || OPENAI_API_KEY;
    const apiUrl = XAI_API_KEY
        ? 'https://api.x.ai/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
    const model = XAI_API_KEY ? 'grok-3-mini' : 'gpt-4o-mini';

    const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 2000,
            temperature: 0.7,
        }),
        signal: AbortSignal.timeout(60000),
    });

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) throw new Error('AI returned no clips');

    // Parse JSON from response (handle markdown code blocks)
    const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const clips = JSON.parse(jsonStr);

    console.log(`   ✅ Found ${clips.length} clip-worthy moments:`);
    for (const clip of clips) {
        console.log(`      🎬 [${clip.start_time}–${clip.end_time}] ${clip.title}`);
    }

    return clips;
}

// ─── FFmpeg Clip Cutter ──────────────────────────────────────────

function cutClip(videoPath, startTime, endTime, outputName) {
    const outPath = path.join(OUTPUT_DIR, outputName);

    // Parse time strings to seconds
    const startSec = parseTimeStr(startTime);
    const endSec = parseTimeStr(endTime);
    const duration = endSec - startSec;

    console.log(`   ✂️  Cutting ${startTime}–${endTime} (${Math.round(duration)}s)...`);

    execSync(
        `ffmpeg -y -ss ${startSec} -i "${videoPath}" -t ${duration} -c:v libx264 -c:a aac -preset fast -crf 23 "${outPath}"`,
        { timeout: 120000, stdio: 'pipe' }
    );

    const sizeMB = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(1);
    console.log(`   ✅ ${outputName} (${sizeMB} MB)`);

    return outPath;
}

function parseTimeStr(ts) {
    const parts = ts.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0];
}

// ─── Main CLI ────────────────────────────────────────────────────

const args = process.argv.slice(2);

async function main() {
    console.log('');
    console.log('✂️  Ghost AI — YouTube Clip Engine');
    console.log('═'.repeat(50));

    ensureDirs();

    // Find the URL argument
    const url = args.find(a => a.includes('youtube.com') || a.includes('youtu.be'));

    if (!url) {
        console.log('');
        console.log('Usage:');
        console.log('  node scripts/yt-clipper.js "https://youtube.com/watch?v=..."');
        console.log('  node scripts/yt-clipper.js "URL" --clips 5');
        console.log('');
        console.log('Suggested channels:');
        console.log('  - Sam Altman / OpenAI');
        console.log('  - Elon Musk / xAI');
        console.log('  - Lex Fridman (interviews)');
        console.log('  - All-In Podcast');
        console.log('  - MKBHD (tech reviews)');
        return;
    }

    const numClips = args.includes('--clips')
        ? parseInt(args[args.indexOf('--clips') + 1]) || 3
        : 3;

    // Step 1: Download
    const { videoPath, videoId, title, duration, channel } = downloadVideo(url);

    // Step 2: Get transcript
    const transcript = getTranscript(url, videoId);

    if (!transcript || transcript.length === 0) {
        console.log('❌ No transcript available. Need Whisper for this video.');
        console.log('   Run the Colab notebook or add local Whisper.');
        return;
    }

    // Step 3: AI finds best moments
    const clips = await findClipMoments(transcript, title, channel, numClips);

    // Step 4: Cut clips
    console.log('');
    console.log('✂️  Cutting clips...');
    const results = [];

    for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        const safeName = clip.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40);
        const fileName = `${videoId}_clip${i + 1}_${safeName}.mp4`;

        const clipPath = cutClip(videoPath, clip.start_time, clip.end_time, fileName);
        results.push({
            ...clip,
            filePath: clipPath,
            fileName,
        });
    }

    // Step 5: Summary
    console.log('');
    console.log('═'.repeat(50));
    console.log(`✅ ${results.length} clips ready!`);
    console.log(`   Source: "${title}" by ${channel}`);
    console.log(`   Output: ${OUTPUT_DIR}`);
    console.log('');

    for (const r of results) {
        console.log(`   🎬 ${r.fileName}`);
        console.log(`      ${r.title}`);
        console.log(`      Caption: ${r.caption.substring(0, 80)}...`);
        console.log('');
    }

    // Save clip metadata for content manager
    const metaFile = path.join(OUTPUT_DIR, `${videoId}_clips.json`);
    fs.writeFileSync(metaFile, JSON.stringify({
        source: { url, title, channel, duration },
        clips: results.map(r => ({
            ...r,
            filePath: r.filePath,
            posted: false,
        })),
        createdAt: new Date().toISOString(),
    }, null, 2));

    console.log(`   📋 Metadata: ${metaFile}`);
    console.log('');
    console.log('   To post a clip:');
    console.log(`   node scripts/post-graph.js --video "${results[0]?.filePath}" --caption "..."`);
}

main().catch(err => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
});

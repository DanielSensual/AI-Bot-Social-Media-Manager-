/**
 * Ghost AI Podcast Engine
 * Generates AI podcast clips with Daniel × Ghost discussing AI topics.
 *
 * Pipeline:
 * 1. Claude writes alternating dialogue script
 * 2. OpenAI TTS generates voice lines for each character
 * 3. Kling I2V generates base talking-head videos
 * 4. fal.ai Sync Lipsync Pro syncs audio to video
 * 5. FFmpeg composites split-screen final video
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { generateText } from './llm-client.js';
import { downloadVideoToCache } from './video-generator.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(PROJECT_ROOT, '.video-cache');
const PODCAST_DIR = path.join(CACHE_DIR, 'podcast');

const FAL_KEY = process.env.FAL_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Character definitions
const CHARACTERS = {
    daniel: {
        name: 'Daniel Castillo',
        title: 'Founder',
        voice: 'onyx',
        voiceInstructions: 'Speak like a confident tech founder on a podcast. Conversational, direct, occasional passion. Military precision in delivery. Natural pacing with brief pauses between thoughts.',
        referenceImage: path.join(PROJECT_ROOT, 'assets', 'reference-images', 'ghost-primary.jpg'),
        videoPrompt: 'Man in black suit sitting in modern dark podcast studio, professional microphone visible, subtle ambient cyan lighting, engaged expression with slight head nods, cinematic film quality, 9:16 vertical',
    },
    ghost: {
        name: 'Ghost',
        title: 'AI Systems Architect',
        voice: 'echo',
        voiceInstructions: 'Speak like a calm, analytical AI systems architect on a podcast. Measured, insightful, slightly mysterious. Think the smartest person in the room who doesn\'t need to prove it. Smooth and deliberate.',
        referenceImage: path.join(PROJECT_ROOT, 'assets', 'reference-images', 'ghost-persona.jpg'),
        videoPrompt: 'Man in cream linen blazer sitting in modern dark podcast studio, professional microphone visible, dramatic warm side lighting with bokeh, confident posture, cinematic film quality, 9:16 vertical',
    },
};

// Ensure dirs exist
if (!fs.existsSync(PODCAST_DIR)) {
    fs.mkdirSync(PODCAST_DIR, { recursive: true });
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════
// STEP 1: Script Generation (Claude Sonnet 4.6)
// ═══════════════════════════════════════════════════════════════

export async function generatePodcastScript(topic = null) {
    console.log('📝 Generating podcast script...');

    const prompt = `You are writing a podcast script for "Ghost AI Podcast" — a show where Daniel Castillo (founder of Ghost AI Systems, military veteran, Orlando-based AI agency owner) and Ghost (an AI persona, calm and analytical systems architect) discuss AI topics.

${topic ? `Today's topic: ${topic}` : 'Pick a trending, relevant AI topic from the last week that would interest entrepreneurs and builders.'}

Write a natural, engaging 60-90 second podcast conversation. Rules:
- 5-8 exchanges total (alternating speakers)
- Daniel is passionate, direct, speaks from experience building real systems
- Ghost is measured, analytical, provides the technical depth
- They should AGREE on some things and have different PERSPECTIVES on others
- Include at least one specific, verifiable fact or statistic
- End with a strong takeaway or call-to-action
- Keep each line conversational — 1-3 sentences max per turn
- NO greetings or "welcome to the show" — start mid-conversation like a clip

CRITICAL: Do NOT fabricate product launches, model names, or statistics. Only reference real, verified information.

Return strict JSON:
{
  "topic": "Brief topic description",
  "episode_title": "Catchy 3-6 word title",
  "lines": [
    { "speaker": "daniel", "text": "Line of dialogue" },
    { "speaker": "ghost", "text": "Line of dialogue" }
  ],
  "caption": "Instagram caption for this clip (under 500 chars, 1-2 emojis max)"
}`;

    const { text } = await generateText({
        prompt,
        provider: 'claude',
        maxOutputTokens: 1500,
        claudeModel: 'claude-sonnet-4-6',
    });

    const parsed = text.match(/\{[\s\S]*\}/);
    if (!parsed) throw new Error('Claude returned invalid podcast script JSON');

    const script = JSON.parse(parsed[0]);

    if (!script.lines || script.lines.length < 3) {
        throw new Error('Script has too few lines');
    }

    console.log(`   ✅ Script: "${script.episode_title}" (${script.lines.length} lines)`);
    script.lines.forEach((line, i) => {
        console.log(`   [${line.speaker.toUpperCase()}] ${line.text.substring(0, 60)}...`);
    });

    return script;
}

// ═══════════════════════════════════════════════════════════════
// STEP 2: Voice Generation (OpenAI TTS)
// ═══════════════════════════════════════════════════════════════

async function generateVoiceLine(text, character, index) {
    const char = CHARACTERS[character];
    if (!char) throw new Error(`Unknown character: ${character}`);

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini-tts',
            voice: char.voice,
            input: text,
            instructions: char.voiceInstructions,
            response_format: 'mp3',
        }),
    });

    if (!response.ok) {
        const err = await response.text().catch(() => '');
        throw new Error(`TTS failed for ${character}: ${response.status} ${err}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const filename = `podcast_${character}_${String(index).padStart(3, '0')}_${Date.now()}.mp3`;
    const filepath = path.join(PODCAST_DIR, filename);
    fs.writeFileSync(filepath, audioBuffer);

    return filepath;
}

export async function generateVoiceLines(script) {
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured for TTS');

    console.log('\n🎙️ Generating voice lines...');
    const audioFiles = [];

    for (let i = 0; i < script.lines.length; i++) {
        const line = script.lines[i];
        console.log(`   [${i + 1}/${script.lines.length}] ${line.speaker}: "${line.text.substring(0, 40)}..."`);

        const filepath = await generateVoiceLine(line.text, line.speaker, i);

        // Get duration via ffprobe
        let duration = 0;
        try {
            const ffprobeBin = process.env.FFPROBE_PATH || 'ffprobe';
            const probe = execSync(
                `${ffprobeBin} -v quiet -print_format json -show_format "${filepath}"`,
                { encoding: 'utf8' }
            );
            duration = parseFloat(JSON.parse(probe).format?.duration || '0');
        } catch {
            duration = 3; // fallback estimate
        }

        audioFiles.push({
            speaker: line.speaker,
            text: line.text,
            audioPath: filepath,
            duration,
            index: i,
        });

        console.log(`      ✅ ${path.basename(filepath)} (${duration.toFixed(1)}s)`);
    }

    const totalDuration = audioFiles.reduce((sum, f) => sum + f.duration, 0);
    console.log(`   📊 Total audio: ${totalDuration.toFixed(1)}s`);

    return audioFiles;
}

// ═══════════════════════════════════════════════════════════════
// STEP 3: Base Video Generation (Kling I2V via fal.ai)
// ═══════════════════════════════════════════════════════════════

async function generateBaseVideo(character) {
    const char = CHARACTERS[character];
    if (!char) throw new Error(`Unknown character: ${character}`);
    if (!FAL_KEY) throw new Error('FAL_KEY not configured');

    console.log(`   🎬 Generating base video for ${char.name}...`);

    const hasRef = fs.existsSync(char.referenceImage);
    const endpoint = hasRef
        ? 'https://queue.fal.run/fal-ai/kling-video/v2/master/image-to-video'
        : 'https://queue.fal.run/fal-ai/kling-video/v2/master/text-to-video';

    const body = {
        prompt: char.videoPrompt,
        duration: '5',
        aspect_ratio: '9:16',
    };

    if (hasRef) {
        const imageData = fs.readFileSync(char.referenceImage);
        body.image_url = `data:image/jpeg;base64,${imageData.toString('base64')}`;
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Key ${FAL_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    if (!data.request_id) {
        throw new Error(`Kling submission failed: ${data?.detail || 'unknown'}`);
    }

    console.log(`      Queued: ${data.request_id}`);
    return { requestId: data.request_id, statusUrl: data.status_url, character };
}

async function waitForKlingVideo(requestId, statusUrl, maxWaitMs = 5 * 60 * 1000) {
    const start = Date.now();
    const pollUrl = statusUrl || `https://queue.fal.run/fal-ai/kling-video/requests/${requestId}/status`;

    while (Date.now() - start < maxWaitMs) {
        const response = await fetch(pollUrl, {
            headers: { 'Authorization': `Key ${FAL_KEY}` },
        });
        const data = await response.json().catch(() => ({}));

        if (data.status === 'COMPLETED') {
            const resultUrl = `https://queue.fal.run/fal-ai/kling-video/requests/${requestId}`;
            const result = await fetch(resultUrl, {
                headers: { 'Authorization': `Key ${FAL_KEY}` },
            }).then(r => r.json());
            return result?.video?.url;
        }

        if (data.status === 'FAILED') {
            throw new Error(`Kling failed: ${data.error || 'unknown'}`);
        }

        const elapsed = Math.round((Date.now() - start) / 1000);
        console.log(`      ⏳ ${data.status || 'processing'} (${elapsed}s)`);
        await sleep(5000);
    }

    throw new Error('Kling video timed out');
}

export async function generateBaseVideos() {
    console.log('\n🎥 Generating base videos for both characters...');

    // Submit both in parallel
    const [danielJob, ghostJob] = await Promise.all([
        generateBaseVideo('daniel'),
        generateBaseVideo('ghost'),
    ]);

    // Wait for both to complete
    console.log('   Waiting for Kling to render...');
    const [danielUrl, ghostUrl] = await Promise.all([
        waitForKlingVideo(danielJob.requestId, danielJob.statusUrl),
        waitForKlingVideo(ghostJob.requestId, ghostJob.statusUrl),
    ]);

    // Download both
    const danielPath = await downloadVideoToCache(danielUrl, `podcast_daniel_${Date.now()}`);
    const ghostPath = await downloadVideoToCache(ghostUrl, `podcast_ghost_${Date.now()}`);

    console.log(`   ✅ Daniel base: ${path.basename(danielPath)}`);
    console.log(`   ✅ Ghost base: ${path.basename(ghostPath)}`);

    return { daniel: danielPath, ghost: ghostPath };
}

// ═══════════════════════════════════════════════════════════════
// STEP 4: Lip Sync (fal.ai Sync Lipsync 2 Pro)
// ═══════════════════════════════════════════════════════════════

async function uploadToFalStorage(filepath) {
    const fileData = fs.readFileSync(filepath);
    const ext = path.extname(filepath).slice(1).toLowerCase();
    const mimeMap = {
        mp3: 'audio/mpeg', mp4: 'video/mp4', wav: 'audio/wav',
        m4a: 'audio/mp4', webm: 'video/webm', mov: 'video/quicktime',
    };
    const mime = mimeMap[ext] || 'application/octet-stream';
    const filename = path.basename(filepath);

    // Step 1: Initiate upload to get presigned URL
    const initResponse = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate', {
        method: 'POST',
        headers: {
            'Authorization': `Key ${FAL_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            file_name: filename,
            content_type: mime,
        }),
    });

    const initData = await initResponse.json().catch(() => ({}));
    if (!initData.upload_url || !initData.file_url) {
        throw new Error(`fal.ai upload initiation failed: ${JSON.stringify(initData)}`);
    }

    // Step 2: PUT file data to presigned URL
    const uploadResponse = await fetch(initData.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': mime },
        body: fileData,
    });

    if (!uploadResponse.ok) {
        throw new Error(`fal.ai file PUT failed: ${uploadResponse.status}`);
    }

    console.log(`      📤 Uploaded ${filename} → ${initData.file_url.substring(0, 60)}...`);
    return initData.file_url;
}

async function lipSyncClip(videoPath, audioPath, character) {
    console.log(`   👄 Lip syncing ${character}...`);

    // Upload video and audio to fal storage for public URLs
    const videoUrl = await uploadToFalStorage(videoPath);
    const audioUrl = await uploadToFalStorage(audioPath);

    if (!videoUrl || !audioUrl) {
        throw new Error(`Failed to upload files for ${character} lip sync`);
    }

    // Submit to Sync Lipsync
    const response = await fetch('https://queue.fal.run/fal-ai/sync-lipsync/v2/pro', {
        method: 'POST',
        headers: {
            'Authorization': `Key ${FAL_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            video_url: videoUrl,
            audio_url: audioUrl,
            sync_mode: 'cut_off',
        }),
    });

    const data = await response.json().catch(() => ({}));
    if (!data.request_id) {
        throw new Error(`Lip sync submission failed: ${data?.detail || JSON.stringify(data)}`);
    }

    // Poll for result
    const start = Date.now();
    const maxWait = 3 * 60 * 1000;

    while (Date.now() - start < maxWait) {
        const statusResp = await fetch(
            `https://queue.fal.run/fal-ai/sync-lipsync/requests/${data.request_id}/status`,
            { headers: { 'Authorization': `Key ${FAL_KEY}` } }
        );
        const status = await statusResp.json().catch(() => ({}));

        if (status.status === 'COMPLETED') {
            const resultResp = await fetch(
                `https://queue.fal.run/fal-ai/sync-lipsync/requests/${data.request_id}`,
                { headers: { 'Authorization': `Key ${FAL_KEY}` } }
            );
            const result = await resultResp.json().catch(() => ({}));
            const outputUrl = result?.video?.url || result?.output?.video_url;

            if (!outputUrl) throw new Error('Lip sync returned no video URL');

            const outPath = await downloadVideoToCache(outputUrl, `lipsync_${character}_${Date.now()}`);
            console.log(`      ✅ ${path.basename(outPath)}`);
            return outPath;
        }

        if (status.status === 'FAILED') {
            throw new Error(`Lip sync failed: ${status.error || 'unknown'}`);
        }

        await sleep(3000);
    }

    throw new Error('Lip sync timed out');
}

export async function lipSyncAllClips(audioFiles, baseVideos) {
    console.log('\n👄 Running lip sync for both characters...');

    const results = { daniel: [], ghost: [] };

    for (const audioFile of audioFiles) {
        const baseVideo = baseVideos[audioFile.speaker];
        const syncedPath = await lipSyncClip(baseVideo, audioFile.audioPath, audioFile.speaker);
        results[audioFile.speaker].push({
            ...audioFile,
            syncedVideoPath: syncedPath,
        });
    }

    return results;
}

// ═══════════════════════════════════════════════════════════════
// STEP 5: FFmpeg Composite
// ═══════════════════════════════════════════════════════════════

export async function compositeVideo(audioFiles, syncedClips, script) {
    console.log('\n🎬 Compositing final podcast video...');

    const ffmpegBin = process.env.FFMPEG_PATH || 'ffmpeg';

    // Concatenate all synced clips in order with proper speaker switching
    const orderedClips = audioFiles.map(af => {
        const clips = syncedClips[af.speaker];
        return clips.find(c => c.index === af.index);
    }).filter(Boolean);

    // Create concat list file
    const concatListPath = path.join(PODCAST_DIR, `concat_${Date.now()}.txt`);
    const concatLines = orderedClips.map(clip =>
        `file '${clip.syncedVideoPath}'`
    ).join('\n');
    fs.writeFileSync(concatListPath, concatLines);

    // Concatenate all clips
    const concatenatedPath = path.join(PODCAST_DIR, `podcast_concat_${Date.now()}.mp4`);
    execSync(
        `${ffmpegBin} -y -f concat -safe 0 -i "${concatListPath}" -c copy "${concatenatedPath}"`,
        { stdio: 'pipe' }
    );

    // The concatenated video IS the final output
    // (drawtext overlay requires FFmpeg compiled with --enable-libfreetype)
    const finalPath = concatenatedPath;

    console.log(`   ✅ Final video: ${path.basename(finalPath)}`);\n
    // Cleanup temp files
    try {
        fs.unlinkSync(concatListPath);
    } catch { /* ignore */ }\n

    return finalPath;
}

// ═══════════════════════════════════════════════════════════════
// MAIN PIPELINE
// ═══════════════════════════════════════════════════════════════

export async function generatePodcast(options = {}) {
    const { topic = null, dryRun = false } = options;

    console.log('═══════════════════════════════════════════════════');
    console.log('🎙️ GHOST AI PODCAST — Generating Episode');
    console.log('═══════════════════════════════════════════════════\n');

    // Step 1: Generate script
    const script = await generatePodcastScript(topic);

    if (dryRun) {
        console.log('\n🚧 DRY RUN — stopping before generation');
        return { script, dryRun: true };
    }

    // Step 2: Generate voice lines
    const audioFiles = await generateVoiceLines(script);

    // Step 3: Generate base videos for both characters
    const baseVideos = await generateBaseVideos();

    // Step 4: Lip sync each audio clip to its character's base video
    const syncedClips = await lipSyncAllClips(audioFiles, baseVideos);

    // Step 5: Composite final video
    const finalVideoPath = await compositeVideo(audioFiles, syncedClips, script);

    const totalDuration = audioFiles.reduce((sum, f) => sum + f.duration, 0);

    console.log('\n═══════════════════════════════════════════════════');
    console.log('✅ PODCAST EPISODE COMPLETE');
    console.log(`   Title: ${script.episode_title}`);
    console.log(`   Duration: ${totalDuration.toFixed(1)}s`);
    console.log(`   Video: ${finalVideoPath}`);
    console.log('═══════════════════════════════════════════════════\n');

    return {
        script,
        videoPath: finalVideoPath,
        caption: script.caption,
        duration: totalDuration,
        audioFiles,
    };
}

// CLI support
if (process.argv[1] && process.argv[1].includes('podcast-engine')) {
    const topic = process.argv.slice(2).join(' ') || null;
    const dryRun = process.argv.includes('--dry-run');

    generatePodcast({ topic, dryRun })
        .then(result => {
            if (result.dryRun) {
                console.log('\nScript preview:', JSON.stringify(result.script, null, 2));
            } else {
                console.log('\n🎉 Done! Video at:', result.videoPath);
            }
        })
        .catch(err => {
            console.error('❌ Podcast generation failed:', err.message);
            process.exit(1);
        });
}

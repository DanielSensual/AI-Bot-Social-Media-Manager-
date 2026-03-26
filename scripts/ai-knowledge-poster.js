#!/usr/bin/env node
/**
 * AI Knowledge Instagram Poster
 * 
 * Autonomous bot that posts AI trend content to @ghostaisystems Instagram
 * (linked to "Artificial Intelligence Knowledge" Facebook Page).
 * 
 * Runs 2x daily (10AM / 6PM EST) via PM2 cron on GCE VM.
 * 
 * Pipeline:
 *   1. Discover top AI trends (via Gemini)
 *   2. Generate a presenter script (beautiful female AI anchor)
 *   3. Generate a video Reel (Veo 3.1 primary → Grok fallback)
 *   4. Upload video to temp host for public URL
 *   5. Post as Instagram Reel via Graph API
 *   6. Fallback: static image post if video fails
 * 
 * Usage:
 *   node scripts/ai-knowledge-poster.js              # Full pipeline
 *   node scripts/ai-knowledge-poster.js --dry-run    # Generate content without posting
 *   node scripts/ai-knowledge-poster.js --test-post  # Post immediately (ignores schedule)
 *   node scripts/ai-knowledge-poster.js --text-only  # Skip video, post image only
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ─── Config ───────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = 'gpt-4o-mini';

const IG_USER_ID = process.env.INSTAGRAM_GRAPH_USER_ID || '17841474941272373';
const IG_TOKEN = process.env.INSTAGRAM_GRAPH_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '';
const IG_API_BASE = 'https://graph.facebook.com/v24.0';

const LOG_DIR = path.resolve(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const DRY_RUN = process.argv.includes('--dry-run');
const TEXT_ONLY = process.argv.includes('--text-only');
const TEST_POST = process.argv.includes('--test-post');

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(msg) {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${msg}`;
    console.log(line);
    const logFile = path.join(LOG_DIR, `ai-knowledge-${new Date().toISOString().slice(0, 10)}.log`);
    fs.appendFileSync(logFile, line + '\n');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Unified LLM caller (Gemini → OpenAI fallback) ───────────────────────────

async function callGemini(prompt, { temperature = 0.7, maxTokens = 1500 } = {}) {
    const response = await fetch(
        `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature, maxOutputTokens: maxTokens },
            }),
        }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(`Gemini error: ${JSON.stringify(data?.error || data)}`);
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

async function callOpenAI(prompt, { temperature = 0.7, maxTokens = 1500 } = {}) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: OPENAI_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature,
            max_tokens: maxTokens,
        }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`OpenAI error: ${JSON.stringify(data?.error || data)}`);
    return data?.choices?.[0]?.message?.content?.trim() || '';
}

async function callLLM(prompt, options = {}) {
    // Try Gemini first
    if (GEMINI_API_KEY) {
        try {
            const result = await callGemini(prompt, options);
            if (result) return result;
        } catch (err) {
            log(`⚠️ Gemini failed: ${err.message} — trying OpenAI...`);
        }
    }
    // Fallback to OpenAI
    if (OPENAI_API_KEY) {
        return await callOpenAI(prompt, options);
    }
    throw new Error('No LLM provider available (both Gemini and OpenAI failed/unconfigured)');
}

// ─── 1. AI Trend Discovery ───────────────────────────────────────────────────

const TREND_PROMPT = `You are an AI news researcher. Find and summarize the top 3 most interesting AI news stories or trends from TODAY (${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}).

Focus on:
- New AI model releases, breakthroughs, or updates
- Major company announcements (OpenAI, Google, Meta, Anthropic, xAI, etc.)
- Regulatory news, AI safety, or ethics developments
- Surprising AI applications or viral AI moments

Return ONLY a JSON object in this exact format:
{
  "stories": [
    { "headline": "Short headline", "summary": "2-3 sentence summary", "source": "Company/outlet" }
  ],
  "topStory": "The single most interesting headline from above"
}`;

async function discoverTrends() {
    log('🔍 Discovering AI trends...');

    const text = await callLLM(TREND_PROMPT, { temperature: 0.7, maxTokens: 1500 });
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not parse trend JSON from LLM response');

    const trends = JSON.parse(jsonMatch[0]);
    log(`📰 Found ${trends.stories?.length || 0} stories. Top: "${trends.topStory}"`);
    return trends;
}

// ─── 2. Generate Presenter Script ─────────────────────────────────────────────

async function generatePresenterScript(trends) {
    log('✍️ Generating presenter script...');

    const scriptPrompt = `You are writing a short script for a beautiful female AI news anchor. She delivers a 15-second Instagram Reel covering today's top AI trends.

Today's stories:
${trends.stories.map((s, i) => `${i + 1}. ${s.headline}: ${s.summary}`).join('\n')}

Requirements:
- Opening hook: "Hey everyone!" or similar natural greeting
- Cover the top 1-2 stories in simple, exciting language  
- End with a call to action: "Follow for daily AI updates!" or similar
- Keep it under 40 words total (it needs to fit in 15 seconds of speech)
- Speak naturally, like a real influencer — not robotic
- Use excitement and energy

Return ONLY the exact script text the presenter will say, nothing else.`;

    const raw = await callLLM(scriptPrompt, { temperature: 0.9, maxTokens: 300 });
    const script = raw.replace(/^["']|["']$/g, '');
    log(`🎙️ Script: "${script}"`);
    return script;
}

// ─── 3. Generate Caption ──────────────────────────────────────────────────────

async function generateCaption(trends) {
    log('📝 Generating Instagram caption...');

    const captionPrompt = `Write an Instagram caption for an AI news Reel. Cover these stories:
${trends.stories.map((s, i) => `${i + 1}. ${s.headline}: ${s.summary}`).join('\n')}

Requirements:
- Start with a hook emoji + attention-grabbing first line
- Summarize 2-3 key stories in short bullet points using emojis
- Add a question to spark engagement ("What do you think about...?")
- End with 15-20 relevant hashtags on a new line
- Include these hashtags: #AI #ArtificialIntelligence #AINews #TechTrends #AIUpdate
- Keep the caption body under 150 words (before hashtags)
- Use line breaks for readability

Return ONLY the caption text.`;

    const caption = await callLLM(captionPrompt, { temperature: 0.8, maxTokens: 800 });
    log(`📝 Caption length: ${caption.length} chars`);
    return caption;
}

// ─── 4. Generate Video (Veo 3.1 → Grok fallback) ─────────────────────────────

// ── Ghost Character — consistent face for every Reel ──────────────────────────
const GHOST_PRESENTER = 'A commanding dark-skinned Black man with a sharp tapered fade and full groomed beard. He has an athletic build and exudes Marine Corps drill instructor authority mixed with genuine warmth. Photorealistic, cinematic lighting, 9:16 vertical format.';

const GHOST_SCENES = [
    `${GHOST_PRESENTER} He wears a fitted black tactical jacket, standing in a dark luxury studio with holographic AI visualizations floating behind him. He speaks directly to camera with intense energy.`,
    `${GHOST_PRESENTER} He wears a crisp midnight navy henley, sitting in a sleek modern office with multiple monitors showing code and data dashboards. He leans toward the camera, delivering knowledge.`,
    `${GHOST_PRESENTER} He wears a premium charcoal bomber jacket, standing on a cyberpunk rooftop at golden hour with Orlando's skyline behind him. He addresses the camera with visionary confidence.`,
    `${GHOST_PRESENTER} He wears a fitted black crew-neck tee, in a dark high-tech command center with glowing blue UI elements. He briefs the audience like a tactical commander.`,
];

const GHOST_REFERENCE_URL = process.env.GHOST_REFERENCE_IMAGE_URL || '';

async function generateVideo(script) {
    log('🎬 Generating Ghost video...');

    const scene = GHOST_SCENES[Math.floor(Math.random() * GHOST_SCENES.length)];

    const videoPrompt = `${scene} He says: "${script}" Cinematic camera, shallow depth of field, warm studio lighting with subtle lens flare. Ghost is the clear focus, centered in frame.`;

    log(`   Scene: "${scene.substring(0, 60)}..."`);

    // Import video generator dynamically
    const { generateVideo: genVideo } = await import('../src/video-generator.js');

    const videoOptions = {
        aspectRatio: '9:16',
        resolution: '720p',
        provider: 'auto', // Veo 3.1 → Grok
    };

    // Reference image for face consistency (R2V)
    if (GHOST_REFERENCE_URL) {
        videoOptions.referenceImages = [GHOST_REFERENCE_URL];
        log(`   👻 Ghost reference image attached for face consistency`);
    }

    try {
        const videoPath = await genVideo(videoPrompt, videoOptions);

        log(`✅ Video generated: ${videoPath}`);
        return videoPath;
    } catch (err) {
        log(`❌ Video generation failed: ${err.message}`);
        return null;
    }
}

// ─── 5. Upload to Temp Host ───────────────────────────────────────────────────

async function uploadVideo(videoPath) {
    log('📤 Uploading video to temp host...');

    const { default: igClient } = await import('../src/instagram-client.js');
    const publicUrl = await igClient.uploadToTempHost(videoPath);

    log(`✅ Public URL: ${publicUrl}`);
    return publicUrl;
}

// ─── 6. Post to Instagram ─────────────────────────────────────────────────────

async function postReel(caption, videoUrl) {
    log('📸 Posting Reel to Instagram...');

    // Step 1: Create media container
    const createParams = new URLSearchParams({
        media_type: 'REELS',
        video_url: videoUrl,
        caption: caption,
        access_token: IG_TOKEN,
    });

    const createRes = await fetch(`${IG_API_BASE}/${IG_USER_ID}/media`, {
        method: 'POST',
        body: createParams,
    });
    const createData = await createRes.json();
    if (createData.error) throw new Error(`IG container failed: ${createData.error.message}`);

    const containerId = createData.id;
    log(`   Container created: ${containerId}`);

    // Step 2: Wait for container to finish processing
    log('   Waiting for video processing...');
    let ready = false;
    for (let i = 0; i < 30; i++) {
        await sleep(10000); // 10s poll
        const statusRes = await fetch(
            `${IG_API_BASE}/${containerId}?fields=status_code&access_token=${IG_TOKEN}`
        );
        const statusData = await statusRes.json();

        if (statusData.status_code === 'FINISHED') {
            ready = true;
            break;
        }
        if (statusData.status_code === 'ERROR') {
            throw new Error(`IG processing error: ${JSON.stringify(statusData)}`);
        }
        log(`   Status: ${statusData.status_code} (${(i + 1) * 10}s)`);
    }

    if (!ready) throw new Error('IG video processing timed out (5 min)');

    // Step 3: Publish
    const publishParams = new URLSearchParams({
        creation_id: containerId,
        access_token: IG_TOKEN,
    });

    const publishRes = await fetch(`${IG_API_BASE}/${IG_USER_ID}/media_publish`, {
        method: 'POST',
        body: publishParams,
    });
    const publishData = await publishRes.json();
    if (publishData.error) throw new Error(`IG publish failed: ${publishData.error.message}`);

    log(`🎉 Instagram Reel posted! Media ID: ${publishData.id}`);
    return publishData.id;
}

async function postImage(caption, trends) {
    log('🖼️ Falling back to image post...');

    // Generate an AI image via Gemini Imagen
    const imagePrompt = `A futuristic AI news broadcast graphic with a beautiful female anchor's silhouette, holographic data visualizations, neural network patterns, and the text "AI DAILY UPDATE". Premium dark theme with cyan and purple accents. 1080x1080 square format.`;

    // Use Grok image generation as fallback
    const XAI_API_KEY = process.env.XAI_API_KEY || '';
    if (!XAI_API_KEY) {
        log('❌ No XAI_API_KEY — cannot generate fallback image');
        return null;
    }

    const imgRes = await fetch('https://api.x.ai/v1/images/generations', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${XAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'grok-2-image',
            prompt: imagePrompt,
            n: 1,
            response_format: 'url',
        }),
    });

    const imgData = await imgRes.json();
    const imageUrl = imgData?.data?.[0]?.url;
    if (!imageUrl) {
        log(`❌ Image generation failed: ${JSON.stringify(imgData?.error || imgData)}`);
        return null;
    }

    log(`   Image URL: ${imageUrl}`);

    // Post to Instagram
    const createParams = new URLSearchParams({
        image_url: imageUrl,
        caption: caption,
        access_token: IG_TOKEN,
    });

    const createRes = await fetch(`${IG_API_BASE}/${IG_USER_ID}/media`, {
        method: 'POST',
        body: createParams,
    });
    const createData = await createRes.json();
    if (createData.error) throw new Error(`IG image container failed: ${createData.error.message}`);

    await sleep(5000);

    const publishParams = new URLSearchParams({
        creation_id: createData.id,
        access_token: IG_TOKEN,
    });

    const publishRes = await fetch(`${IG_API_BASE}/${IG_USER_ID}/media_publish`, {
        method: 'POST',
        body: publishParams,
    });
    const publishData = await publishRes.json();
    if (publishData.error) throw new Error(`IG image publish failed: ${publishData.error.message}`);

    log(`🎉 Instagram image posted! Media ID: ${publishData.id}`);
    return publishData.id;
}

// ─── Main Pipeline ────────────────────────────────────────────────────────────

async function main() {
    log('═══════════════════════════════════════════════');
    log('🤖 AI Knowledge Instagram Poster — Starting');
    log(`   Mode: ${DRY_RUN ? 'DRY RUN' : TEST_POST ? 'TEST POST' : 'LIVE'}`);
    log(`   Video: ${TEXT_ONLY ? 'DISABLED' : 'ENABLED'}`);
    log('═══════════════════════════════════════════════');

    try {
        // 1. Discover trends
        const trends = await discoverTrends();
        if (!trends?.stories?.length) {
            log('⚠️ No trends found. Skipping post.');
            return;
        }

        // 2. Generate presenter script (for video)
        const script = TEXT_ONLY ? null : await generatePresenterScript(trends);

        // 3. Generate caption
        const caption = await generateCaption(trends);

        if (DRY_RUN) {
            log('\n═══ DRY RUN OUTPUT ═══');
            log(`\nTrends:\n${JSON.stringify(trends, null, 2)}`);
            log(`\nScript: "${script || 'N/A'}"`);
            log(`\nCaption:\n${caption}`);
            log('\n═══ End DRY RUN ═══');
            return;
        }

        // 4. Generate video
        let videoPath = null;
        if (!TEXT_ONLY && script) {
            videoPath = await generateVideo(script);
        }

        if (videoPath) {
            // 5. Upload video & post Reel
            const publicUrl = await uploadVideo(videoPath);
            await postReel(caption, publicUrl);
        } else {
            // 6. Fallback to image post
            log('⚠️ No video generated — falling back to image post');
            await postImage(caption, trends);
        }

        log('✅ Pipeline complete!');
    } catch (err) {
        log(`💥 FATAL ERROR: ${err.message}`);
        log(err.stack || '');
        process.exit(1);
    }
}

main();

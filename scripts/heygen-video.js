/**
 * Ghost AI — HeyGen Avatar Video Engine
 * 
 * Generates AI spokesperson videos using the Ghost AI team avatars
 * and posts them directly to social media.
 * 
 * Team Roster:
 *   Daniel Castillo — Founder (custom avatar + cloned voice)
 *   Ghost — CEO (Claude Opus 4.6)
 *   Tyrion — Head of Engineering (Gemini 2.5 Pro)
 *   Shadow — VP of Operations & Security (Claude Sonnet 4.6)
 *   Valkyra — VP of Strategy & Client Success (Gemini 2.5 Flash)
 *   Jordan — Creative Director (Grok 3)
 *   Maximus — Chief Strategist (Grok 4.2)
 *   Prometheus — Chief Research Officer (o4-pro)
 * 
 * Usage:
 *   node scripts/heygen-video.js --list-avatars          # Show available
 *   node scripts/heygen-video.js --generate "script"     # Generate video
 *   node scripts/heygen-video.js --team daniel "script"  # Specific team member
 *   node scripts/heygen-video.js --status VIDEO_ID       # Check render status
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
dotenv.config();

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY || 'sk_V2_hgu_kv2EYU8oOIo_KfCnPLYvky7qNrf0zUH9YQgTXxHoB4Yk';
const HEYGEN_API = 'https://api.heygen.com';
const OUTPUT_DIR = path.join(__dirname, '..', 'output', 'heygen');

// ─── Ghost AI Team Roster ────────────────────────────────────────

const TEAM = {
    daniel: {
        name: 'Daniel Castillo',
        role: 'Founder & AI Systems Architect',
        avatarId: 'e96754721eb04a69b9bef04d21ce54f0',
        voiceId: 'e6fbafc43e8447708e03307d2996517e',  // Clone Daniel
        brand: 'mediageekz',  // or 'ghostai'
        style: 'Professional, direct, founder energy. Orlando native.',
    },
    ghost: {
        name: 'Ghost',
        role: 'CEO — Ghost AI Systems',
        avatarId: null,  // Uses stock avatar — assign later
        voiceId: 'vdY8O7DAlGoHVOAVoPUK',  // Ghost V3
        brain: { provider: 'anthropic', model: 'claude-opus-4-6' },
        brand: 'ghostai',
        style: 'Authoritative, technical, visionary. AI-native leader. Speaks with earned authority.',
    },
    tyrion: {
        name: 'Tyrion',
        role: 'Head of Engineering',
        avatarId: null,
        voiceId: 'c9674bba39674231acd401adf6c6720e',  // Ghos V3
        brain: { provider: 'google', model: 'gemini-2.5-pro' },
        brand: 'ghostai',
        style: 'Technical, detailed, engineering focus. Loves architecture and system design.',
    },
    shadow: {
        name: 'Shadow',
        role: 'VP of Operations & Security',
        avatarId: null,
        voiceId: 'ebe26ebdb0304f5889956c273868d55f',  // Chill Ghost
        brain: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
        brand: 'ghostai',
        style: 'Calm, measured, security-focused. Ops precision. Speaks in absolutes about infrastructure.',
    },
    valkyra: {
        name: 'Valkyra',
        role: 'VP of Strategy & Client Success',
        avatarId: null,
        voiceId: '6tUIYzIoB6WWDSMbaL5v',  // Trinity female
        brain: { provider: 'google', model: 'gemini-3.1-flash' },
        brand: 'ghostai',
        style: 'Strategic, warm, client-focused. Growth mindset. Makes complex things feel simple.',
    },
    jordan: {
        name: 'Jordan',
        role: 'Creative Director',
        avatarId: null,
        voiceId: 'zTQ8YuLQBpyKN4LLmPSq',  // Trinity V2 female
        brain: { provider: 'google', model: 'gemini-3.1-pro' },
        brand: 'mediageekz',
        style: 'Creative, bold, visual storytelling. Cinematic thinking. Makes everything look like a movie.',
    },
    maximus: {
        name: 'Maximus',
        role: 'Chief Strategist',
        avatarId: null,
        voiceId: null,  // NEEDS: Assign HeyGen voice
        brain: { provider: 'xai', model: 'grok-4.2' },
        brand: 'ghostai',
        style: 'Bold, aggressive, gladiator energy. Speaks in absolute truths. Respects strength, despises mediocrity.',
    },
    prometheus: {
        name: 'Prometheus',
        role: 'Chief Research Officer',
        avatarId: null,
        voiceId: null,  // NEEDS: Assign HeyGen voice
        brain: { provider: 'openai', model: 'o4-pro' },
        brand: 'ghostai',
        style: 'Analytical, prescient, forward-looking. Sees around corners. Academic depth with practical impact.',
    },
};

// ─── HeyGen API Client ──────────────────────────────────────────

async function heygenFetch(endpoint, options = {}) {
    const res = await fetch(`${HEYGEN_API}${endpoint}`, {
        ...options,
        headers: {
            'X-Api-Key': HEYGEN_API_KEY,
            'Content-Type': 'application/json',
            ...options.headers,
        },
        signal: AbortSignal.timeout(30000),
    });

    const data = await res.json();
    if (data.error) {
        throw new Error(`HeyGen: ${data.error.message || JSON.stringify(data.error)}`);
    }
    return data;
}

/**
 * Generate an avatar video
 */
async function generateVideo(options) {
    const {
        avatarId,
        voiceId,
        script,
        title = 'Ghost AI Video',
        aspectRatio = '16:9',
        resolution = '1080p',
    } = options;

    console.log(`🎬 Generating HeyGen video...`);
    console.log(`   Avatar: ${avatarId}`);
    console.log(`   Voice: ${voiceId}`);
    console.log(`   Script: "${script.substring(0, 80)}..."`);

    const payload = {
        video_inputs: [{
            character: {
                type: 'avatar',
                avatar_id: avatarId,
                avatar_style: 'normal',
            },
            voice: {
                type: 'text',
                input_text: script,
                voice_id: voiceId,
                speed: 1.0,
            },
        }],
        dimension: {
            width: aspectRatio === '9:16' ? 1080 : 1920,
            height: aspectRatio === '9:16' ? 1920 : 1080,
        },
        title,
    };

    const data = await heygenFetch('/v2/video/generate', {
        method: 'POST',
        body: JSON.stringify(payload),
    });

    const videoId = data.data?.video_id;
    if (!videoId) throw new Error('No video_id returned');

    console.log(`✅ Video queued! ID: ${videoId}`);
    return videoId;
}

/**
 * Check video render status
 */
async function getVideoStatus(videoId) {
    const data = await heygenFetch(`/v1/video_status.get?video_id=${videoId}`);
    return data.data;
}

/**
 * Poll until video is ready, then download
 */
async function waitForVideo(videoId, maxWaitMs = 600000) {
    const start = Date.now();
    let lastStatus = '';

    while (Date.now() - start < maxWaitMs) {
        const status = await getVideoStatus(videoId);
        const state = status.status;

        if (state !== lastStatus) {
            console.log(`   ⏳ Status: ${state}`);
            lastStatus = state;
        }

        if (state === 'completed') {
            console.log(`✅ Video ready!`);
            console.log(`   URL: ${status.video_url}`);
            console.log(`   Duration: ${status.duration}s`);
            return status;
        }

        if (state === 'failed') {
            throw new Error(`Video render failed: ${status.error || 'unknown'}`);
        }

        // Poll every 10 seconds
        await new Promise(r => setTimeout(r, 10000));
    }

    throw new Error('Video render timed out (10 min)');
}

/**
 * Download rendered video to local disk
 */
async function downloadVideo(videoUrl, fileName) {
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const outPath = path.join(OUTPUT_DIR, fileName);
    const res = await fetch(videoUrl);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outPath, buffer);

    const sizeMB = (buffer.length / (1024 * 1024)).toFixed(1);
    console.log(`   💾 Saved: ${outPath} (${sizeMB} MB)`);
    return outPath;
}

// ─── AI Script Generator ─────────────────────────────────────────

async function generateScript(member, topic) {
    const XAI_API_KEY = process.env.XAI_API_KEY;
    if (!XAI_API_KEY) return topic; // If no AI key, use the topic as the script

    const prompt = `You are ${member.name}, ${member.role} at Ghost AI Systems.
Your personality: ${member.style}

Write a 30-60 second video script (spoken word, first person) about:
${topic}

Rules:
- Start with a strong hook in the first sentence
- Speak naturally, like you're talking to camera
- Keep it under 150 words (30-60 seconds when spoken)
- End with a CTA: visit ghostaisystems.com or contact us
- Sound like a real person, not a corporate statement
- ${member.brand === 'mediageekz' ? 'Mention MediaGeekz and cinematic video production' : 'Mention Ghost AI Systems and AI automation'}
- DO NOT include stage directions, just the spoken words`;

    const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${XAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'grok-3-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 300,
            temperature: 0.8,
        }),
        signal: AbortSignal.timeout(30000),
    });

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || topic;
}

// ─── CLI ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);

async function main() {
    console.log('');
    console.log('👻 Ghost AI — HeyGen Avatar Video Engine');
    console.log('═'.repeat(50));

    if (args.includes('--list-avatars') || args.includes('--list')) {
        console.log('');
        console.log('🎭 Ghost AI Team Roster:');
        console.log('');
        for (const [key, member] of Object.entries(TEAM)) {
            const status = member.avatarId ? '✅' : '⚠️ needs avatar';
            console.log(`   ${status} ${key.padEnd(10)} ${member.name} — ${member.role}`);
            console.log(`              Voice: ${member.voiceId}`);
            console.log(`              Brand: ${member.brand}`);
        }
        return;
    }

    if (args.includes('--status')) {
        const videoId = args[args.indexOf('--status') + 1];
        if (!videoId) { console.error('Usage: --status VIDEO_ID'); return; }

        const status = await getVideoStatus(videoId);
        console.log(`📹 Video ${videoId}`);
        console.log(`   Status: ${status.status}`);
        if (status.video_url) console.log(`   URL: ${status.video_url}`);
        if (status.duration) console.log(`   Duration: ${status.duration}s`);
        return;
    }

    if (args.includes('--generate') || args.includes('--team')) {
        let memberKey = 'daniel';
        let scriptInput = '';

        if (args.includes('--team')) {
            memberKey = args[args.indexOf('--team') + 1];
            scriptInput = args.slice(args.indexOf('--team') + 2)
                .filter(a => !a.startsWith('-')).join(' ').trim();
        } else {
            scriptInput = args.slice(args.indexOf('--generate') + 1)
                .filter(a => !a.startsWith('-')).join(' ').trim();
        }

        const member = TEAM[memberKey];
        if (!member) {
            console.error(`❌ Unknown team member: ${memberKey}`);
            console.error(`   Available: ${Object.keys(TEAM).join(', ')}`);
            return;
        }

        if (!member.avatarId) {
            console.error(`❌ ${member.name} doesn't have an avatar assigned yet.`);
            console.error(`   Assign a HeyGen avatar ID in the TEAM config.`);
            return;
        }

        if (!scriptInput) {
            console.error('❌ Script or topic is required.');
            console.error('   Usage: --team daniel "Why every business needs AI voice agents"');
            return;
        }

        // Check if it's a topic (short) or a full script (long)
        const isFullScript = scriptInput.length > 200;
        let script = scriptInput;

        if (!isFullScript) {
            console.log(`🤖 Generating script for ${member.name}...`);
            console.log(`   Topic: "${scriptInput}"`);
            script = await generateScript(member, scriptInput);
            console.log('');
            console.log('📝 Generated Script:');
            console.log('─'.repeat(40));
            console.log(script);
            console.log('─'.repeat(40));
        }

        const isDryRun = args.includes('--dry-run');
        if (isDryRun) {
            console.log('');
            console.log('🏁 DRY RUN — no video generated.');
            return;
        }

        // Generate the video
        const videoId = await generateVideo({
            avatarId: member.avatarId,
            voiceId: member.voiceId,
            script,
            title: `${member.name} — ${scriptInput.substring(0, 50)}`,
            aspectRatio: args.includes('--vertical') ? '9:16' : '16:9',
        });

        // Wait for render
        if (!args.includes('--no-wait')) {
            const result = await waitForVideo(videoId);

            // Download
            const fileName = `${memberKey}_${Date.now()}.mp4`;
            const localPath = await downloadVideo(result.video_url, fileName);

            console.log('');
            console.log('═'.repeat(50));
            console.log(`✅ ${member.name} video ready!`);
            console.log(`   File: ${localPath}`);
            console.log(`   URL: ${result.video_url}`);

            // Return for chaining with post-graph.js
            return { videoId, videoUrl: result.video_url, localPath };
        } else {
            console.log('');
            console.log(`⏳ Video queued. Check status with:`);
            console.log(`   node scripts/heygen-video.js --status ${videoId}`);
        }
    }

    if (args.length === 0 || args.includes('--help')) {
        console.log('');
        console.log('Usage:');
        console.log('  --list                          Show team roster');
        console.log('  --team daniel "topic"            Generate video with team member');
        console.log('  --generate "full script"         Generate video (Daniel default)');
        console.log('  --status VIDEO_ID                Check render status');
        console.log('  --dry-run                        Preview script without generating');
        console.log('  --vertical                       9:16 aspect ratio (Reels/Shorts)');
        console.log('  --no-wait                        Don\'t wait for render');
        console.log('');
        console.log('Examples:');
        console.log('  node scripts/heygen-video.js --team daniel "Why every business needs AI voice agents"');
        console.log('  node scripts/heygen-video.js --team valkyra "How to scale your agency with AI" --vertical');
        console.log('  node scripts/heygen-video.js --generate "Hey Orlando! Daniel here from MediaGeekz..."');
    }
}

main().catch(err => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
});

export { TEAM, generateVideo, getVideoStatus, waitForVideo, generateScript };

#!/usr/bin/env node
/**
 * HeyGen → Instagram Pipeline
 * 
 * End-to-end: Generate HeyGen video → Download CLEAN copy → Post to IG + Facebook
 * 
 * Usage:
 *   node scripts/heygen-to-ig.js --prompt "Your topic here"
 *   node scripts/heygen-to-ig.js --prompt "Your topic" --image /path/to/image.png
 *   node scripts/heygen-to-ig.js --prompt "Your topic" --accounts ghostai,aiknowledge
 *   node scripts/heygen-to-ig.js --video-id <existing-heygen-id>   # Skip generation
 *   node scripts/heygen-to-ig.js --prompt "Topic" --dry-run         # Preview only
 * 
 * Flags:
 *   --prompt       Topic/prompt for the video (required unless --video-id)
 *   --image        Local image path to attach as visual context
 *   --accounts     Comma-separated: ghostai, aiknowledge, danielsensual (default: ghostai,aiknowledge)
 *   --video-id     Skip generation, use existing HeyGen video ID
 *   --orientation  portrait (default) or landscape
 *   --voice        Voice name filter (default: "Ghost v3")
 *   --caption      Custom IG caption (auto-generated if omitted)
 *   --dry-run      Generate video but don't post
 *   --no-fb        Skip Facebook page posting
 *   --help         Show this help
 * 
 * IMPORTANT: Always downloads the NON-captioned ("video") asset from HeyGen
 *            to avoid double captions (Video Agent adds its own text overlays).
 */

import dotenv from 'dotenv';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ─── CLI Parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getFlag(name, defaultVal = null) {
    const idx = args.indexOf(`--${name}`);
    if (idx === -1) return defaultVal;
    if (idx + 1 < args.length && !args[idx + 1].startsWith('--')) return args[idx + 1];
    return true;
}

const FLAGS = {
    prompt: getFlag('prompt'),
    image: getFlag('image'),
    accounts: (getFlag('accounts', 'ghostai,aiknowledge')).split(',').map(a => a.trim()),
    videoId: getFlag('video-id'),
    orientation: getFlag('orientation', 'portrait'),
    voice: getFlag('voice', 'Ghost v3'),
    caption: getFlag('caption'),
    dryRun: args.includes('--dry-run'),
    noFb: args.includes('--no-fb'),
    help: args.includes('--help') || args.includes('-h'),
};

if (FLAGS.help) {
    console.log(`
🎬 HeyGen → Instagram Pipeline
═══════════════════════════════════════════════

Usage:
  node scripts/heygen-to-ig.js --prompt "OpenAI just released workspace agents"
  node scripts/heygen-to-ig.js --prompt "Topic" --image ~/Downloads/photo.png
  node scripts/heygen-to-ig.js --prompt "Topic" --accounts ghostai,danielsensual
  node scripts/heygen-to-ig.js --video-id abc123def456

Accounts:
  ghostai        → @ghostaisystems Instagram + AI Knowledge FB Page
  aiknowledge    → Same as ghostai (linked to AI Knowledge FB Page)
  danielsensual  → @danielsensual Instagram + Daniel Sensual FB Page

Flags:
  --prompt       Topic for the video (required unless --video-id)
  --image        Local image to attach as visual context
  --accounts     Comma-separated account targets (default: ghostai,aiknowledge)
  --video-id     Use existing HeyGen video (skip generation)
  --orientation  portrait (default) or landscape
  --voice        Voice filter (default: "Ghost v3")
  --caption      Custom IG caption (auto-generated if omitted)
  --dry-run      Preview without posting
  --no-fb        Skip Facebook page cross-post
  --help         Show this help
`);
    process.exit(0);
}

if (!FLAGS.prompt && !FLAGS.videoId) {
    console.error('❌ --prompt or --video-id required. Use --help for usage.');
    process.exit(1);
}

// ─── Account Registry ─────────────────────────────────────────────────────────

const ACCOUNT_REGISTRY = {
    ghostai: {
        name: 'Ghost AI Systems',
        igUserId: process.env.INSTAGRAM_GRAPH_USER_ID || '17841474941272373',
        igToken: process.env.INSTAGRAM_GRAPH_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
        fbPageId: '753873537816019', // Artificial Intelligence Knowledge
        fbEnabled: true,
    },
    aiknowledge: {
        // Same IG as ghostai — "Artificial Intelligence Knowledge" FB page IS @ghostaisystems
        name: 'AI Knowledge (same as Ghost AI)',
        igUserId: process.env.INSTAGRAM_GRAPH_USER_ID || '17841474941272373',
        igToken: process.env.INSTAGRAM_GRAPH_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
        fbPageId: '753873537816019',
        fbEnabled: true,
        aliasOf: 'ghostai', // Prevent double-posting
    },
    danielsensual: {
        name: 'Daniel Sensual',
        // Daniel Sensual uses the user token + page discovery
        igUserId: '17841401422877096',
        igToken: process.env.DANIEL_FACEBOOK_PAGE_ACCESS_TOKEN,
        fbPageId: '2097158930569621',
        fbEnabled: true,
    },
    mediageekz: {
        name: 'MediaGeekz',
        igUserId: '17841447334934131',
        igToken: null, // Needs separate token
        fbPageId: '249491452789470',
        fbEnabled: true,
    },
    bachataexotica: {
        name: 'Bachata Exotica',
        igUserId: '17841405188159174',
        igToken: null, // Needs separate token
        fbPageId: '266552527115323',
        fbEnabled: true,
    },
};

// ─── HeyGen Config ────────────────────────────────────────────────────────────

const HEYGEN_CLI = path.join(process.env.HOME, '.local', 'bin', 'heygen');
const HEYGEN_AVATAR_GROUP = '7e35ed25d0ba4691b03d720327049a2d'; // Ghost photo avatar group
const HEYGEN_AVATAR_LOOK = '7e35ed25d0ba4691b03d720327049a2d';  // Ghost main look

// ─── Helpers ──────────────────────────────────────────────────────────────────

const IG_API_BASE = 'https://graph.facebook.com/v24.0';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function log(msg) {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    console.log(`[${ts}] ${msg}`);
}

function heygenCmd(cmdArgs) {
    const result = execSync(`${HEYGEN_CLI} ${cmdArgs}`, {
        encoding: 'utf-8',
        timeout: 20 * 60 * 1000, // 20 min max
        env: { ...process.env, PATH: `${path.dirname(HEYGEN_CLI)}:${process.env.PATH}` },
    });
    return JSON.parse(result.trim());
}

// ─── 1. Resolve Voice ─────────────────────────────────────────────────────────

function resolveVoice(nameFilter) {
    log(`🎙️ Resolving voice: "${nameFilter}"...`);
    const data = heygenCmd('voice list --type private --limit 20');
    const voices = data.data || [];
    const match = voices.find(v => v.name.toLowerCase().includes(nameFilter.toLowerCase()));
    if (!match) {
        log(`⚠️ Voice "${nameFilter}" not found. Available: ${voices.map(v => v.name).join(', ')}`);
        // Default to first Ghost voice
        const ghost = voices.find(v => v.name.toLowerCase().includes('ghost'));
        if (ghost) return ghost.voice_id;
        throw new Error(`No matching voice for "${nameFilter}"`);
    }
    log(`   ✅ ${match.name} (${match.voice_id})`);
    return match.voice_id;
}

// ─── 2. Upload Asset ──────────────────────────────────────────────────────────

function uploadAsset(filePath) {
    log(`📎 Uploading asset: ${path.basename(filePath)}...`);
    const data = heygenCmd(`asset create --file "${filePath}"`);
    log(`   ✅ Asset ID: ${data.data.asset_id}`);
    return data.data.asset_id;
}

// ─── 3. Generate Video ───────────────────────────────────────────────────────

function generateVideo(prompt, voiceId, orientation, assetId = null) {
    log('🎬 Generating HeyGen video...');
    log(`   Avatar: Ghost | Voice: ${voiceId}`);
    log(`   Orientation: ${orientation}`);

    // Build the enriched prompt
    const fullPrompt = `Create a short, high-energy news update video. The selected presenter delivers this to camera in a confident, knowledgeable tech-CEO tone.

TOPIC: ${prompt}

The presenter should speak naturally and conversationally — like a CEO breaking news to his followers. Keep it punchy, authoritative, and under 60 seconds. End with a call to action: "Follow for more AI updates" or similar.

VISUAL STYLE: Tech news broadcast feel. Dark, premium aesthetic.${assetId ? ' Use the attached image as a key visual or B-roll overlay.' : ''} Keep the energy punchy and authoritative.

FRAMING NOTE: The selected avatar image is in portrait orientation. The avatar should fill the ${orientation} frame comfortably.

This script is a concept and theme to convey — not a verbatim transcript.`;

    // Build CLI command
    let cmd = `video-agent create --avatar-id "${HEYGEN_AVATAR_LOOK}" --voice-id "${voiceId}" --orientation "${orientation}" --prompt '${fullPrompt.replace(/'/g, "'\\''")}'`;

    // Attach image if provided
    if (assetId) {
        cmd += ` -d '{"files":[{"type":"asset_id","asset_id":"${assetId}"}]}'`;
    }

    cmd += ' --wait --timeout 15m';

    const data = heygenCmd(cmd);

    if (data.data?.status !== 'completed') {
        throw new Error(`Video generation failed: ${data.data?.status || JSON.stringify(data)}`);
    }

    log(`   ✅ Video ready! ID: ${data.data.id} | Duration: ${data.data.duration?.toFixed(1)}s`);
    return data.data;
}

// ─── 4. Download Video (CLEAN — no burned-in captions) ────────────────────────

function downloadVideo(videoId) {
    const outputPath = path.join(process.env.HOME, 'Downloads', `heygen-${videoId}.mp4`);

    // CRITICAL: Download "video" asset, NOT "captioned"
    // HeyGen Video Agent already adds text overlays in the video itself.
    // Downloading the "captioned" version double-stacks subtitles.
    log('📥 Downloading CLEAN video (no burned-in captions)...');
    heygenCmd(`video download ${videoId} --asset video --output-path "${outputPath}" --force`);

    log(`   ✅ Saved: ${outputPath}`);
    return outputPath;
}

// ─── 5. Generate Caption ──────────────────────────────────────────────────────

async function generateCaption(topic) {
    log('📝 Generating IG caption...');

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
        // Fallback static caption
        return `🚨 ${topic}\n\nThe future is agentic. Are you ready? 👇\n\n#AI #ArtificialIntelligence #TechNews #AIUpdate #GhostAI #BuildInPublic #Innovation #AgenticAI`;
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{
                role: 'user',
                content: `Write an Instagram Reel caption for this AI news topic: "${topic}"

Requirements:
- Opening hook with emoji
- 3-5 bullet points with emojis summarizing the key points
- End with engagement question
- 15-20 hashtags on a new line
- Must include: #AI #ArtificialIntelligence #GhostAI #TechNews
- Keep body under 120 words
- Sound like a confident tech CEO, not a news anchor
- Return ONLY the caption text, nothing else.`,
            }],
            temperature: 0.8,
            max_tokens: 600,
        }),
    });

    const data = await res.json();
    const caption = data?.choices?.[0]?.message?.content?.trim();
    if (!caption) throw new Error('Caption generation failed');
    log(`   ✅ Caption generated (${caption.length} chars)`);
    return caption;
}

// ─── 6. Upload to Temp Host ───────────────────────────────────────────────────

async function uploadToTempHost(filePath) {
    log('📤 Uploading video to temp host...');
    const { uploadToTempHost: upload } = await import('../src/instagram-client.js');
    const url = await upload(filePath);
    log(`   ✅ Public URL: ${url}`);
    return url;
}

// ─── 7. Post to Instagram ─────────────────────────────────────────────────────

async function postReelToAccount(account, caption, videoUrl) {
    const { igUserId, igToken, name } = account;

    if (!igToken) {
        log(`   ⚠️ ${name}: No IG token configured — skipping`);
        return null;
    }

    log(`📸 Posting Reel to ${name} (@${igUserId})...`);

    // Create container
    const createRes = await fetch(`${IG_API_BASE}/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            video_url: videoUrl,
            caption,
            media_type: 'REELS',
            access_token: igToken,
        }),
    });
    const createData = await createRes.json();
    if (createData.error) throw new Error(`${name} IG container: ${createData.error.message}`);

    const containerId = createData.id;

    // Wait for processing
    for (let i = 0; i < 60; i++) {
        await sleep(5000);
        const statusRes = await fetch(`${IG_API_BASE}/${containerId}?fields=status_code&access_token=${igToken}`);
        const statusData = await statusRes.json();
        if (statusData.status_code === 'FINISHED') break;
        if (statusData.status_code === 'ERROR') throw new Error(`${name} IG processing error`);
        if (i % 4 === 0) log(`   ⏳ ${name}: ${statusData.status_code} (${(i + 1) * 5}s)`);
    }

    // Publish
    const publishRes = await fetch(`${IG_API_BASE}/${igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: containerId, access_token: igToken }),
    });
    const publishData = await publishRes.json();
    if (publishData.error) throw new Error(`${name} IG publish: ${publishData.error.message}`);

    log(`   ✅ ${name} Reel posted! Media ID: ${publishData.id}`);
    return publishData.id;
}

// ─── 8. Post to Facebook Page ─────────────────────────────────────────────────

async function postToFacebookPage(account, caption, videoUrl) {
    if (FLAGS.noFb || !account.fbEnabled || !account.fbPageId) return null;

    log(`📘 Posting to Facebook Page: ${account.name}...`);

    // Get page token from user token
    const userToken = process.env.FACEBOOK_ACCESS_TOKEN;
    const pagesRes = await fetch(`${IG_API_BASE}/me/accounts?fields=id,access_token&access_token=${userToken}`);
    const pagesData = await pagesRes.json();
    const page = pagesData.data?.find(p => p.id === account.fbPageId);
    if (!page) {
        log(`   ⚠️ FB Page ${account.fbPageId} not found — skipping`);
        return null;
    }

    const res = await fetch(`${IG_API_BASE}/${account.fbPageId}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            file_url: videoUrl,
            description: caption,
            access_token: page.access_token,
        }),
    });
    const data = await res.json();
    if (data.error) {
        log(`   ⚠️ FB post failed: ${data.error.message}`);
        return null;
    }

    log(`   ✅ Facebook video posted! ID: ${data.id}`);
    return data.id;
}

// ─── Main Pipeline ────────────────────────────────────────────────────────────

async function main() {
    console.log('');
    console.log('🎬 HeyGen → Instagram Pipeline');
    console.log('═'.repeat(50));
    log(`Mode: ${FLAGS.dryRun ? 'DRY RUN' : 'LIVE'}`);
    log(`Accounts: ${FLAGS.accounts.join(', ')}`);
    console.log('');

    // Step 1: Resolve voice
    const voiceId = resolveVoice(FLAGS.voice);

    // Step 2: Upload image asset (if provided)
    let assetId = null;
    if (FLAGS.image) {
        if (!fs.existsSync(FLAGS.image)) {
            console.error(`❌ Image not found: ${FLAGS.image}`);
            process.exit(1);
        }
        assetId = uploadAsset(FLAGS.image);
    }

    // Step 3: Generate or use existing video
    let videoId;
    let videoDuration;

    if (FLAGS.videoId) {
        videoId = FLAGS.videoId;
        log(`📎 Using existing video: ${videoId}`);
    } else {
        const videoData = generateVideo(FLAGS.prompt, voiceId, FLAGS.orientation, assetId);
        videoId = videoData.id;
        videoDuration = videoData.duration;
    }

    // Step 4: Download CLEAN video (no double captions!)
    const videoPath = downloadVideo(videoId);

    // Step 5: Generate caption
    const caption = FLAGS.caption || await generateCaption(FLAGS.prompt);

    if (FLAGS.dryRun) {
        console.log('\n═══ DRY RUN ═══');
        console.log(`Video: ${videoPath}`);
        console.log(`Duration: ${videoDuration?.toFixed(1) || '?'}s`);
        console.log(`Caption:\n${caption}`);
        console.log('═══════════════\n');
        process.exit(0);
    }

    // Step 6: Upload to temp host
    const publicUrl = await uploadToTempHost(videoPath);

    // Step 7: Post to each account (deduplicate aliases)
    const posted = new Set();
    const results = [];

    for (const accountKey of FLAGS.accounts) {
        const account = ACCOUNT_REGISTRY[accountKey];
        if (!account) {
            log(`⚠️ Unknown account: "${accountKey}" — skipping`);
            continue;
        }

        // Deduplicate (aiknowledge = ghostai)
        const canonical = account.aliasOf || accountKey;
        if (posted.has(canonical)) {
            log(`⏭️ ${account.name}: Already posted (alias of ${canonical})`);
            continue;
        }
        posted.add(canonical);

        try {
            // Post IG Reel
            const igId = await postReelToAccount(account, caption, publicUrl);
            results.push({ account: account.name, platform: 'Instagram', id: igId, status: '✅' });

            // Cross-post to Facebook Page
            const fbId = await postToFacebookPage(account, caption, publicUrl);
            if (fbId) results.push({ account: account.name, platform: 'Facebook', id: fbId, status: '✅' });
        } catch (err) {
            log(`❌ ${account.name} failed: ${err.message}`);
            results.push({ account: account.name, platform: 'IG/FB', id: null, status: '❌' });
        }
    }

    // Summary
    console.log('\n' + '═'.repeat(50));
    console.log('📊 Distribution Summary');
    console.log('═'.repeat(50));
    for (const r of results) {
        console.log(`  ${r.status} ${r.account} (${r.platform}): ${r.id || 'failed'}`);
    }
    console.log(`\n🎬 Video: ${videoPath}`);
    console.log(`⏱️  Duration: ${videoDuration?.toFixed(1) || '?'}s`);
    console.log('');
}

main().catch(err => {
    console.error(`\n💥 FATAL: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
});

#!/usr/bin/env node
/**
 * AI Photo Organizer — Daniel Sensual Content Pipeline
 * 
 * Reads Apple Photos DB directly, classifies with GPT-4o-mini vision,
 * and copies postable content to Google Drive queue folders.
 * 
 * Usage:
 *   node scripts/photo-organizer.js --days=7 --dry-run     # Preview last 7 days
 *   node scripts/photo-organizer.js --days=30              # Organize last 30 days
 *   node scripts/photo-organizer.js --days=7 --type=video  # Videos only
 *   node scripts/photo-organizer.js --days=3 --max=10      # Limit items
 */

import dotenv from 'dotenv';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, '..', 'data');
const RCLONE_REMOTE = 'danielsensual:DanielSensual';

// ─── Categories ─────────────────────────────────────────────────────
const CATEGORIES = {
    post_ready:         { folder: 'queue/reels',              label: '🚀 Post-Ready (LumaFusion/Captioned)' },
    dance_reel:         { folder: 'queue/reels',              label: '💃 Dance / Social Dancing' },
    practice_session:   { folder: 'queue/practice-sessions',  label: '🪞 Practice / Rehearsal' },
    behind_scenes:      { folder: 'queue/behind-scenes',      label: '🎬 Studio / BTS' },
    music_video:        { folder: 'queue/music-videos',       label: '🎵 Music Video' },
    event:              { folder: 'queue/reels',              label: '🎉 Event / Social' },
    ai_production:      { folder: 'queue/behind-scenes',      label: '🤖 AI / Tech' },
    slog_raw:           { folder: 'queue/needs-grading',      label: '🎨 S-Log (needs LUT)' },
    personal:           { folder: 'skip',                     label: '🏠 Personal' },
    screenshot:         { folder: 'skip',                     label: '📱 Screenshot' },
    adult_content:      { folder: 'skip',                     label: '🚫 Adult (auto-skipped)' },
    other:              { folder: 'skip',                     label: '❓ Other' },
};

// ─── Filename Pre-filters (skip without wasting API calls) ────
const SKIP_PATTERNS = [
    /^_users_/i,                          // Grok/Gemini AI-generated video files
    /generated_video/i,                   // AI-generated content
    /gemini_generated/i,                  // Gemini outputs
    /platinum/i,                          // Platinum After Dark content
    /vault/i,                             // Vault content
];

// ─── Priority Patterns (post-ready, skip vision API) ─────────
const PRIORITY_PATTERNS = [
    /lumafusion/i,                        // LumaFusion exports — 90% ready
    /luma.*export/i,                      // LumaFusion naming variants
    /caption/i,                           // Captioned videos — ready to post
    /DANIEL\d{8}/,                        // Daniel's named exports (e.g. DANIEL20260322_0006)
];

// ─── Args ───────────────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, arg) => {
    const [key, val] = arg.replace('--', '').split('=');
    acc[key] = val || true;
    return acc;
}, {});

const DAYS = parseInt(args.days) || 7;
const DRY_RUN = args['dry-run'] === true || args['dry-run'] === 'true';
const TYPE_FILTER = args.type || 'all';
const MAX_ITEMS = parseInt(args.max) || 50;

// ─── OpenAI ─────────────────────────────────────────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Read Photos DB via osxphotos Python ────────────────────────
function getRecentPhotos() {
    console.log(`📸 Scanning Apple Photos (last ${DAYS} days)...`);

    const typeFilter = TYPE_FILTER === 'video'
        ? 'if p.ismovie'
        : TYPE_FILTER === 'photo'
        ? 'if not p.ismovie'
        : '';

    const script = `
import osxphotos, json
from datetime import datetime, timedelta, timezone
db = osxphotos.PhotosDB()
cutoff = datetime.now(timezone.utc) - timedelta(days=${DAYS})
items = [p for p in db.photos() if p.date and p.date > cutoff and p.path ${typeFilter ? 'and (' + typeFilter.replace('if ', '') + ')' : ''}][:${MAX_ITEMS}]
result = []
for p in items:
    if p.path:
        result.append({
            "filename": p.original_filename,
            "path": p.path,
            "is_video": p.ismovie,
            "date": p.date.strftime("%Y-%m-%d %H:%M"),
            "width": p.width,
            "height": p.height,
        })
print(json.dumps(result))
`.trim();

    try {
        const output = execSync(`python3 -c '${script.replace(/'/g, "'\\''")}' 2>/dev/null`).toString().trim();
        const items = JSON.parse(output);
        console.log(`   ✅ Found ${items.length} items with local paths`);
        return items;
    } catch (error) {
        console.error(`   ❌ Failed to scan Photos: ${error.message}`);
        return [];
    }
}

// ─── Classify with GPT-4o-mini vision ───────────────────────────
async function classifyItem(item) {
    let imagePath = item.path;

    // For videos, extract a thumbnail frame
    if (item.is_video) {
        const thumbPath = `/tmp/photo-org-thumb-${Date.now()}.jpg`;
        try {
            execSync(`ffmpeg -y -i "${item.path}" -vframes 1 -q:v 3 -vf "scale=512:-1" "${thumbPath}" 2>/dev/null`);
            imagePath = thumbPath;
        } catch {
            return { category: 'other', confidence: 0.3, reason: 'Could not extract video frame' };
        }
    }

    // Resize photos for cheaper API usage
    const resizedPath = `/tmp/photo-org-resized-${Date.now()}.jpg`;
    try {
        execSync(`sips -Z 512 "${imagePath}" --out "${resizedPath}" 2>/dev/null`);
        imagePath = resizedPath;
    } catch {
        // Use original if resize fails
    }

    const imageBuffer = fs.readFileSync(imagePath);
    const base64 = imageBuffer.toString('base64');

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            max_tokens: 150,
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: `Classify this image for a bachata dancer/AI music producer. ONE category only:
- dance_reel: Dancing, partner dance, bachata/salsa
- practice_session: Rehearsal, studio mirror, casual practice
- behind_scenes: Music studio, recording, production setup
- music_video: Polished/cinematic dance content
- event: Dance social, party, venue, crowd
- ai_production: Computer screen, code, tech setup
- personal: Selfie, food, travel, family
- screenshot: Phone screenshot, meme, text
- adult_content: NSFW, lingerie, suggestive, explicit
- other: None of the above

JSON only: {"category":"...","confidence":0.0-1.0,"reason":"brief"}`
                    },
                    {
                        type: 'image_url',
                        image_url: { url: `data:image/jpeg;base64,${base64}`, detail: 'low' }
                    }
                ]
            }]
        });

        const text = response.choices[0]?.message?.content?.trim() || '';
        const match = text.match(/\{[\s\S]*?\}/);
        if (match) {
            const parsed = JSON.parse(match[0]);
            return {
                category: CATEGORIES[parsed.category] ? parsed.category : 'other',
                confidence: parsed.confidence || 0.5,
                reason: parsed.reason || '',
            };
        }
    } catch (error) {
        console.log(`   ❌ Vision error: ${error.message?.substring(0, 60)}`);
    }

    // Clean up temp files
    try { fs.unlinkSync(resizedPath); } catch {}

    return { category: 'other', confidence: 0.3, reason: 'API error' };
}

// ─── Copy to Drive ──────────────────────────────────────────────
function copyToDrive(filePath, driveFolder) {
    try {
        execSync(`rclone copy "${filePath}" "${RCLONE_REMOTE}/${driveFolder}/" 2>&1`);
        return true;
    } catch {
        return false;
    }
}

// ─── Main ───────────────────────────────────────────────────────
async function main() {
    console.log('');
    console.log('═'.repeat(60));
    console.log('📸 Daniel Sensual — AI Photo Organizer');
    console.log('═'.repeat(60));
    console.log(`   Days:  ${DAYS}`);
    console.log(`   Type:  ${TYPE_FILTER}`);
    console.log(`   Max:   ${MAX_ITEMS}`);
    console.log(`   Mode:  ${DRY_RUN ? '🔒 DRY RUN' : '🚀 LIVE'}`);
    console.log('');

    // Step 1: Read Photos DB
    const items = getRecentPhotos();
    if (items.length === 0) {
        console.log('❌ No items to process.');
        return;
    }

    // Step 2: Classify each item
    console.log(`\n🤖 Classifying ${items.length} items with GPT-4o-mini vision...\n`);

    const results = [];
    const stats = {};

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const type = item.is_video ? '🎬' : '📷';

        // Pre-filter: skip known non-danceable content by filename
        const skippedByName = SKIP_PATTERNS.some(re => re.test(item.filename));
        if (skippedByName) {
            const cat = CATEGORIES.adult_content;
            results.push({
                file: item.filename, path: item.path, date: item.date,
                isVideo: item.is_video, category: 'adult_content',
                label: cat.label, folder: 'skip', confidence: 1.0,
                reason: 'Filename pre-filter (AI-generated/other project)',
            });
            stats['adult_content'] = (stats['adult_content'] || 0) + 1;
            console.log(`   [${i + 1}/${items.length}] ${type} ${item.filename.substring(0, 35).padEnd(35)} → 🚫 Skipped (filename filter)`);
            continue;
        }

        // Priority fast-track: LumaFusion exports & named exports → post-ready
        const isPriority = PRIORITY_PATTERNS.some(re => re.test(item.filename));
        if (isPriority) {
            const cat = CATEGORIES.post_ready;
            results.push({
                file: item.filename, path: item.path, date: item.date,
                isVideo: item.is_video, category: 'post_ready',
                label: cat.label, folder: cat.folder, confidence: 0.95,
                reason: 'LumaFusion/named export — post-ready',
            });
            stats['post_ready'] = (stats['post_ready'] || 0) + 1;
            console.log(`   [${i + 1}/${items.length}] ${type} ${item.filename.substring(0, 35).padEnd(35)} → 🚀 Post-Ready (fast-tracked)`);

            if (!DRY_RUN) {
                const ok = copyToDrive(item.path, cat.folder);
                if (ok) console.log(`      ✅ Copied to Drive: ${cat.folder}/`);
            }
            continue;
        }

        process.stdout.write(`   [${i + 1}/${items.length}] ${type} ${item.filename.substring(0, 35).padEnd(35)} `);

        const classification = await classifyItem(item);
        const cat = CATEGORIES[classification.category] || CATEGORIES.other;

        results.push({
            file: item.filename,
            path: item.path,
            date: item.date,
            isVideo: item.is_video,
            category: classification.category,
            label: cat.label,
            folder: cat.folder,
            confidence: classification.confidence,
            reason: classification.reason,
        });

        stats[classification.category] = (stats[classification.category] || 0) + 1;
        console.log(`→ ${cat.label} (${(classification.confidence * 100).toFixed(0)}%)`);

        // Copy to Drive
        if (!DRY_RUN && cat.folder !== 'skip') {
            const ok = copyToDrive(item.path, cat.folder);
            if (ok) console.log(`      ✅ Copied to Drive: ${cat.folder}/`);
        }

        // Small delay between API calls
        if (i < items.length - 1) await new Promise(r => setTimeout(r, 300));
    }

    // Step 3: Summary
    console.log('\n' + '═'.repeat(60));
    console.log('📊 Results\n');

    for (const [cat, count] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
        const info = CATEGORIES[cat];
        const bar = '█'.repeat(Math.min(count * 2, 40));
        console.log(`   ${(info?.label || cat).padEnd(25)} ${bar} ${count}`);
    }

    const postable = results.filter(r => r.folder !== 'skip');
    const skipped = results.filter(r => r.folder === 'skip');

    console.log(`\n   ✅ Postable: ${postable.length}  |  ⏭️ Skipped: ${skipped.length}`);
    if (DRY_RUN) console.log('   🔒 DRY RUN — run without --dry-run to copy to Drive');

    // Save results
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    const file = path.join(RESULTS_DIR, `organized-${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(file, JSON.stringify({ date: new Date().toISOString(), stats, results }, null, 2));
    console.log(`   📄 Saved: ${file}\n`);
}

main().catch(console.error);

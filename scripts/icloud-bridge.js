#!/usr/bin/env node
/**
 * iCloud → Google Drive Content Bridge
 * 
 * Pulls videos from iCloud Photos (via osxphotos --download-missing),
 * immediately pushes to Google Drive, then cleans up local temp files.
 * The Mac acts as a pipe — no permanent local storage needed.
 * 
 * Usage:
 *   node scripts/icloud-bridge.js --days=30 --max=50 --dry-run
 *   node scripts/icloud-bridge.js --days=180 --type=video
 *   node scripts/icloud-bridge.js --days=180 --type=video --skip-classify
 */

import dotenv from 'dotenv';
import { execSync, exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = '/tmp/icloud-bridge';
const RCLONE_REMOTE = 'danielsensual:DanielSensual';
const RESULTS_DIR = path.join(__dirname, '..', 'data');

// ─── Skip / Priority patterns ───────────────────────────────────
const SKIP_PATTERNS = [
    /^_users_/i, /generated_video/i, /gemini_generated/i,
    /platinum/i, /vault/i,
];
const PRIORITY_PATTERNS = [
    /lumafusion/i, /luma.*export/i, /caption/i, /DANIEL\d{8}/,
];

// ─── Args ───────────────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, arg) => {
    const [key, val] = arg.replace('--', '').split('=');
    acc[key] = val || true;
    return acc;
}, {});

const DAYS = parseInt(args.days) || 30;
const DRY_RUN = args['dry-run'] === true;
const TYPE_FILTER = args.type || 'all';
const MAX_ITEMS = parseInt(args.max) || 50;
const SKIP_CLASSIFY = args['skip-classify'] === true;
const BATCH_SIZE = parseInt(args.batch) || 10; // Download in batches

// ─── Scan iCloud library ────────────────────────────────────────
function scanICloudLibrary() {
    console.log(`☁️  Scanning iCloud Photos (last ${DAYS} days, ${TYPE_FILTER})...`);

    const typeCheck = TYPE_FILTER === 'video'
        ? 'and p.ismovie'
        : TYPE_FILTER === 'photo'
        ? 'and not p.ismovie'
        : '';

    const script = `
import osxphotos, json
from datetime import datetime, timedelta, timezone
db = osxphotos.PhotosDB()
cutoff = datetime.now(timezone.utc) - timedelta(days=${DAYS})
# Get ALL items (including iCloud-only ones without local paths)
items = [p for p in db.photos() if p.date and p.date > cutoff ${typeCheck}][:${MAX_ITEMS * 3}]
result = []
for p in items:
    result.append({
        "uuid": p.uuid,
        "filename": p.original_filename,
        "has_local": p.path is not None,
        "path": p.path,
        "is_video": p.ismovie,
        "date": p.date.strftime("%Y-%m-%d %H:%M"),
        "width": p.width,
        "height": p.height,
    })
print(json.dumps(result))
`.trim();

    try {
        const output = execSync(`python3 -c '${script.replace(/'/g, "'\\''")}' 2>/dev/null`, {
            maxBuffer: 10 * 1024 * 1024,
        }).toString().trim();
        const items = JSON.parse(output);
        const cloud = items.filter(i => !i.has_local);
        const local = items.filter(i => i.has_local);
        console.log(`   Total: ${items.length} | Local: ${local.length} | ☁️ iCloud: ${cloud.length}`);
        return items;
    } catch (error) {
        console.error(`   ❌ Scan failed: ${error.message}`);
        return [];
    }
}

// ─── Filter items ───────────────────────────────────────────────
function filterItems(items) {
    const filtered = [];
    let skipped = 0;
    let prioritized = 0;

    for (const item of items) {
        // Skip known junk
        if (SKIP_PATTERNS.some(re => re.test(item.filename))) {
            skipped++;
            continue;
        }

        // Flag priority items
        item.isPriority = PRIORITY_PATTERNS.some(re => re.test(item.filename));
        if (item.isPriority) prioritized++;

        filtered.push(item);
    }

    // Sort: priority first, then by date (newest first)
    filtered.sort((a, b) => {
        if (a.isPriority && !b.isPriority) return -1;
        if (!a.isPriority && b.isPriority) return 1;
        return new Date(b.date) - new Date(a.date);
    });

    console.log(`   ✅ ${filtered.length} candidates (${skipped} skipped, ${prioritized} priority)`);
    return filtered.slice(0, MAX_ITEMS);
}

// ─── Download single item from iCloud ───────────────────────────
function downloadFromICloud(item) {
    const exportPath = path.join(TMP_DIR, item.uuid);
    fs.mkdirSync(exportPath, { recursive: true });

    try {
        // Use osxphotos export with --download-missing to pull from iCloud
        const cmd = `python3 -m osxphotos export "${exportPath}" --uuid "${item.uuid}" --download-missing --overwrite 2>&1`;
        const output = execSync(cmd, { maxBuffer: 50 * 1024 * 1024, timeout: 120000 }).toString();

        // Find the exported file
        const files = fs.readdirSync(exportPath).filter(f => !f.startsWith('.'));
        if (files.length > 0) {
            return path.join(exportPath, files[0]);
        }
    } catch (error) {
        // osxphotos might not be on PATH, try python3 -m
        try {
            const altCmd = `python3 -c "
import osxphotos
db = osxphotos.PhotosDB()
photos = [p for p in db.photos() if p.uuid == '${item.uuid}']
if photos:
    p = photos[0]
    exported = p.export('${exportPath}', use_photos_export=True)
    print(exported[0] if exported else '')
" 2>/dev/null`;
            const result = execSync(altCmd, { timeout: 120000 }).toString().trim();
            if (result && fs.existsSync(result)) return result;
        } catch {}
    }

    return null;
}

// ─── Upload to Google Drive ─────────────────────────────────────
function uploadToDrive(localPath, driveFolder) {
    try {
        execSync(`rclone copy "${localPath}" "${RCLONE_REMOTE}/${driveFolder}/" --progress 2>&1`, {
            timeout: 300000, // 5 min timeout for large videos
        });
        return true;
    } catch (error) {
        console.log(`   ❌ Upload failed: ${error.message?.substring(0, 60)}`);
        return false;
    }
}

// ─── Determine Drive folder ─────────────────────────────────────
function getDriveFolder(item) {
    if (item.isPriority) return 'queue/reels';
    if (SKIP_CLASSIFY) return 'queue/unsorted';

    // Basic classification by filename/metadata
    const fn = item.filename.toLowerCase();
    if (fn.includes('timeline'))  return 'queue/music-videos';
    if (fn.includes('screen'))    return 'queue/behind-scenes';
    if (fn.startsWith('img_'))    return 'queue/reels';
    return 'queue/unsorted';
}

// ─── Clean up temp files ────────────────────────────────────────
function cleanup(itemPath) {
    try {
        const dir = path.dirname(itemPath);
        fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
}

// ─── Main ───────────────────────────────────────────────────────
async function main() {
    console.log('');
    console.log('═'.repeat(60));
    console.log('☁️  iCloud → Google Drive Content Bridge');
    console.log('═'.repeat(60));
    console.log(`   Days:   ${DAYS}`);
    console.log(`   Type:   ${TYPE_FILTER}`);
    console.log(`   Max:    ${MAX_ITEMS}`);
    console.log(`   Batch:  ${BATCH_SIZE}`);
    console.log(`   Mode:   ${DRY_RUN ? '🔒 DRY RUN' : '🚀 LIVE'}`);
    console.log('');

    // Step 1: Scan
    const allItems = scanICloudLibrary();
    if (allItems.length === 0) return;

    // Step 2: Filter
    const candidates = filterItems(allItems);
    if (candidates.length === 0) {
        console.log('❌ No candidates after filtering.');
        return;
    }

    // Step 3: Summary preview
    console.log('\n📋 Transfer Queue:\n');
    const cloudOnly = candidates.filter(c => !c.has_local);
    const localReady = candidates.filter(c => c.has_local);

    console.log(`   ☁️  Need iCloud download: ${cloudOnly.length}`);
    console.log(`   💾 Already local:         ${localReady.length}`);
    console.log(`   🚀 Priority (post-ready): ${candidates.filter(c => c.isPriority).length}`);

    if (DRY_RUN) {
        console.log('\n📋 Would transfer:\n');
        for (const item of candidates.slice(0, 25)) {
            const loc = item.has_local ? '💾' : '☁️';
            const pri = item.isPriority ? '🚀' : '  ';
            const folder = getDriveFolder(item);
            console.log(`   ${loc} ${pri} ${item.date} | ${item.filename.substring(0, 35).padEnd(35)} → ${folder}`);
        }
        if (candidates.length > 25) console.log(`   ... +${candidates.length - 25} more`);
        console.log('\n   🔒 DRY RUN — run without --dry-run to transfer');

        // Save manifest
        fs.mkdirSync(RESULTS_DIR, { recursive: true });
        const manifest = path.join(RESULTS_DIR, `bridge-manifest-${new Date().toISOString().split('T')[0]}.json`);
        fs.writeFileSync(manifest, JSON.stringify({ date: new Date().toISOString(), candidates }, null, 2));
        console.log(`   📄 Manifest saved: ${manifest}\n`);
        return;
    }

    // Step 4: Transfer
    fs.mkdirSync(TMP_DIR, { recursive: true });
    let transferred = 0;
    let failed = 0;
    let totalBytes = 0;

    console.log('\n🚀 Starting transfer...\n');

    for (let i = 0; i < candidates.length; i++) {
        const item = candidates[i];
        const driveFolder = getDriveFolder(item);
        const loc = item.has_local ? '💾' : '☁️';
        const pri = item.isPriority ? '🚀' : '  ';

        process.stdout.write(`   [${i + 1}/${candidates.length}] ${loc} ${pri} ${item.filename.substring(0, 30).padEnd(30)} `);

        let localPath = item.path; // Already local?

        // Download from iCloud if needed
        if (!item.has_local) {
            process.stdout.write('downloading... ');
            localPath = downloadFromICloud(item);
            if (!localPath) {
                console.log('❌ Download failed');
                failed++;
                continue;
            }
        }

        // Get file size
        const stat = fs.statSync(localPath);
        const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
        totalBytes += stat.size;

        // Upload to Drive
        process.stdout.write(`(${sizeMB}MB) uploading... `);
        const ok = uploadToDrive(localPath, driveFolder);
        if (ok) {
            console.log(`✅ → ${driveFolder}`);
            transferred++;
        } else {
            console.log('❌ Upload failed');
            failed++;
        }

        // Clean up temp download
        if (!item.has_local && localPath) cleanup(localPath);
    }

    // Step 5: Summary
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(0);
    console.log('\n' + '═'.repeat(60));
    console.log('📊 Transfer Complete\n');
    console.log(`   ✅ Transferred: ${transferred}`);
    console.log(`   ❌ Failed:      ${failed}`);
    console.log(`   💾 Total data:  ${totalMB} MB`);
    console.log(`   📁 Destination: ${RCLONE_REMOTE}\n`);

    // Cleanup temp dir
    try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
}

main().catch(console.error);

#!/usr/bin/env node
/**
 * GIA Reel Publisher — posts the AI-influencer reel to Instagram Reels
 * with the compliance caption from the production kit (04-post.md).
 *
 *   node scripts/gia-publish.js               # dry-run: verify everything, post nothing
 *   node scripts/gia-publish.js --live        # publish for real
 *   node scripts/gia-publish.js --video=/path/to/reel.mp4 --live
 *
 * COMPLIANCE (per kit + NY synthetic-performer law):
 * - Caption discloses AI-generation explicitly (baked in below)
 * - The in-app "AI-generated content" label CANNOT be set via Graph API —
 *   flip it manually in the IG app on the published reel.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { testInstagramConnection, uploadToTempHost, postInstagramReel } from '../src/instagram-client.js';
import { reviewPost, formatViolations } from '../src/qc-gate.js';

const DEFAULT_VIDEO = path.join(
    os.homedir(),
    'GhostAIWebsite/_agents/workflows/ai-influencer-reel/refs/gia-reel-v3.0-FINAL.mp4',
);

// Caption per _agents/workflows/ai-influencer-reel/04-post.md — hook first,
// explicit AI disclosure, no hashtags (ghost-brain-v2 house rule).
const CAPTION = [
    "She's not real. The missed calls are. 👻",
    '',
    "Gia is 100% AI-generated — built with the same tech that answers our clients' phones 24/7, in English y en español.",
    '',
    'Ghost AI Systems → ghostaisystems.com',
].join('\n');

const args = process.argv.slice(2);
const live = args.includes('--live');
const videoArg = args.find(a => a.startsWith('--video='));
const videoPath = videoArg ? videoArg.split('=')[1] : DEFAULT_VIDEO;

console.log(`\n👻 GIA Reel Publisher — ${live ? 'LIVE' : 'DRY RUN'}`);
console.log('═'.repeat(50));

// 1. Video exists
if (!fs.existsSync(videoPath)) {
    console.error(`❌ Video not found: ${videoPath}`);
    process.exit(1);
}
const sizeMb = (fs.statSync(videoPath).size / 1024 / 1024).toFixed(1);
console.log(`🎬 Video: ${videoPath} (${sizeMb} MB)`);

// 2. Caption passes the same QC gate as everything else
const qc = reviewPost(CAPTION, { platform: 'instagram' });
if (!qc.pass) {
    console.error(`❌ Caption failed QC: ${formatViolations(qc.violations)}`);
    process.exit(1);
}
console.log('✅ Caption passed QC gate');
console.log(`\n${CAPTION}\n`);

// 3. IG connection
const igOk = await testInstagramConnection().catch(() => false);
if (!igOk) {
    console.error('❌ Instagram connection failed — check tokens');
    process.exit(1);
}

if (!live) {
    console.log('🔒 DRY RUN complete — everything verified, nothing posted.');
    console.log('   Publish for real:  node scripts/gia-publish.js --live');
    console.log('   ⚠️ After publishing: open the reel in the IG app and toggle');
    console.log('      the "AI-generated content" label (not settable via API).');
    process.exit(0);
}

// 4. Publish
console.log('📤 Uploading video to public host...');
const publicUrl = await uploadToTempHost(videoPath);
console.log(`   → ${publicUrl}`);

console.log('📤 Publishing Reel...');
const post = await postInstagramReel(CAPTION, publicUrl);
console.log(`\n✅ GIA reel published! Media ID: ${post?.id || '(unknown)'}`);
console.log('⚠️ NOW: open the reel in the IG app → ··· → toggle "AI-generated content" label.');
console.log('📊 KPI to watch: shares-to-likes ratio (reference format runs ~64%).');

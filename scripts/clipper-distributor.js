#!/usr/bin/env node
/**
 * Ghost AI — Clipper Distributor
 * ===============================
 * Takes a single clip and distributes it across ALL persona pages.
 * Each persona re-captions the clip in their own voice using their assigned LLM brain.
 *
 * Flow:
 *   1. Read next clip from queue (or accept --clip flag)
 *   2. For each active persona page:
 *      a. Generate unique caption via persona-voices.js
 *      b. Post to that persona's FB page
 *      c. Stagger 15-30 min between pages to avoid rate limits
 *   3. Log all posts to distribution ledger
 *
 * Usage:
 *   node scripts/clipper-distributor.js                    # Distribute next clip
 *   node scripts/clipper-distributor.js --dry-run          # Preview captions only
 *   node scripts/clipper-distributor.js --clip filename.mp4 # Specific clip
 *   node scripts/clipper-distributor.js --roster           # Show persona status
 *   node scripts/clipper-distributor.js --test-voices      # Test all persona voices
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { generatePersonaCaption, getPersonaIds } from '../src/persona-voices.js';

const PROJECT_ROOT = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'personas', 'manifest.json');
const CLIPS_DIR = path.join(PROJECT_ROOT, 'output', 'clips');
const LEDGER_PATH = path.join(PROJECT_ROOT, 'personas', '.distribution-ledger.json');

// ═══════════════════════════════════════════════════════════════
// MANIFEST & LEDGER
// ═══════════════════════════════════════════════════════════════

function loadManifest() {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
}

function loadLedger() {
    if (!fs.existsSync(LEDGER_PATH)) return { distributions: [] };
    return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf-8'));
}

function saveLedger(ledger) {
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
}

/**
 * Get active persona pages — only those with valid FB page tokens
 */
function getActivePersonas() {
    const manifest = loadManifest();
    const active = [];

    for (const [id, persona] of Object.entries(manifest.personas)) {
        if (id === 'daniel') continue; // Daniel is human, not a clipper
        if (persona.type !== 'ai') continue;

        const fb = persona.social?.facebook || {};
        const tokenVar = fb.tokenEnvVar;
        const hasToken = tokenVar && process.env[tokenVar];

        active.push({
            id,
            displayName: persona.displayName,
            role: persona.role,
            brain: persona.brain,
            pageId: fb.pageId || null,
            tokenVar: tokenVar || null,
            hasToken: !!hasToken,
            fbStatus: fb.status || 'not_created',
        });
    }

    return active;
}

// ═══════════════════════════════════════════════════════════════
// CLIP QUEUE
// ═══════════════════════════════════════════════════════════════

function getNextClipForDistribution() {
    const ledger = loadLedger();
    const distributed = new Set(ledger.distributions.map(d => d.clipFile));

    // Read clip metadata
    const metaFiles = fs.readdirSync(CLIPS_DIR)
        .filter(f => f.endsWith('_clips.json') && !f.startsWith('.'));

    for (const metaFile of metaFiles) {
        const meta = JSON.parse(fs.readFileSync(path.join(CLIPS_DIR, metaFile), 'utf-8'));
        for (const clip of meta.clips) {
            const fileName = path.basename(clip.filePath || clip.fileName);
            if (!distributed.has(fileName) && fs.existsSync(path.join(CLIPS_DIR, fileName))) {
                return {
                    fileName,
                    filePath: path.join(CLIPS_DIR, fileName),
                    title: clip.title,
                    caption: clip.caption,
                    hook: clip.hook,
                    source: meta.source,
                };
            }
        }
    }

    return null;
}

// ═══════════════════════════════════════════════════════════════
// FACEBOOK POSTING
// ═══════════════════════════════════════════════════════════════

async function postVideoToPage(pageId, accessToken, videoPath, caption) {
    const videoData = fs.readFileSync(videoPath);
    const blob = new Blob([videoData], { type: 'video/mp4' });

    const formData = new FormData();
    formData.append('source', blob, path.basename(videoPath));
    formData.append('description', caption);
    formData.append('access_token', accessToken);

    const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/videos`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(120000), // 2 min timeout for video upload
    });

    const data = await res.json();
    if (data.error) {
        throw new Error(`FB Post Error: ${data.error.message}`);
    }

    return data.id;
}

// ═══════════════════════════════════════════════════════════════
// DISTRIBUTION ENGINE
// ═══════════════════════════════════════════════════════════════

async function distributeClip(clip, options = {}) {
    const { dryRun = false, staggerMs = 15 * 60 * 1000 } = options;
    const personas = getActivePersonas();
    const readyPersonas = personas.filter(p => p.hasToken && p.pageId);

    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('👻 GHOST AI — CLIPPER DISTRIBUTOR');
    console.log('═══════════════════════════════════════════════════');
    console.log(`📹 Clip: ${clip.title}`);
    console.log(`📁 File: ${clip.fileName}`);
    console.log(`🎯 Target personas: ${readyPersonas.length} active / ${personas.length} total`);
    console.log(`${dryRun ? '🧪 DRY RUN — no posting' : '🚀 LIVE — posting to pages'}`);
    console.log('═══════════════════════════════════════════════════\n');

    const results = [];

    // Generate ALL captions first (parallel for speed)
    console.log('📝 Generating persona captions...\n');
    const captionPromises = personas.map(async (persona) => {
        try {
            const t0 = Date.now();
            const caption = await generatePersonaCaption(persona.id, clip);
            const ms = Date.now() - t0;
            console.log(`   ✅ ${persona.displayName.padEnd(12)} (${persona.brain.model}) — ${ms}ms`);
            return { persona, caption, ms };
        } catch (err) {
            console.log(`   ❌ ${persona.displayName.padEnd(12)} — ${err.message}`);
            return { persona, caption: null, error: err.message };
        }
    });

    const captions = await Promise.all(captionPromises);

    // Show all captions
    console.log('\n── GENERATED CAPTIONS ──────────────────────────\n');
    for (const { persona, caption, error } of captions) {
        if (caption) {
            console.log(`┌─ ${persona.displayName} (${persona.brain.model})`);
            console.log(`│  ${caption.substring(0, 200)}${caption.length > 200 ? '...' : ''}`);
            console.log(`└──────────────────────────────────────────\n`);
        }
    }

    if (dryRun) {
        console.log('🧪 DRY RUN complete — no posts made.\n');
        return captions;
    }

    // Post to active pages with staggering
    console.log('── POSTING TO PAGES ───────────────────────────\n');

    for (const { persona, caption } of captions) {
        if (!caption) continue;
        if (!persona.hasToken || !persona.pageId) {
            console.log(`   ⏭️  ${persona.displayName} — no page/token, skipping`);
            continue;
        }

        try {
            const token = process.env[persona.tokenVar];
            const postId = await postVideoToPage(persona.pageId, token, clip.filePath, caption);

            console.log(`   ✅ ${persona.displayName} — posted (${postId})`);
            results.push({
                personaId: persona.id,
                postId,
                caption: caption.substring(0, 100),
                timestamp: new Date().toISOString(),
            });
        } catch (err) {
            console.log(`   ❌ ${persona.displayName} — ${err.message}`);
        }

        // Stagger between pages
        if (staggerMs > 0) {
            const staggerMin = Math.round(staggerMs / 60000);
            console.log(`   ⏳ Waiting ${staggerMin}min before next page...`);
            await new Promise(r => setTimeout(r, staggerMs));
        }
    }

    // Log to ledger
    const ledger = loadLedger();
    ledger.distributions.push({
        clipFile: clip.fileName,
        clipTitle: clip.title,
        distributedAt: new Date().toISOString(),
        results,
    });
    saveLedger(ledger);

    console.log(`\n✅ Distribution complete — ${results.length} pages posted.`);
    return results;
}

// ═══════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════

const args = process.argv.slice(2);

async function main() {
    // --roster — show persona status
    if (args.includes('--roster')) {
        const personas = getActivePersonas();
        console.log('\n👻 GHOST AI CONTENT ARMY — ROSTER\n');
        console.log('Name'.padEnd(14) + 'Brain'.padEnd(22) + 'FB'.padEnd(5) + 'Token'.padEnd(7) + 'Status');
        console.log('─'.repeat(60));
        for (const p of personas) {
            const fb = p.pageId ? '✅' : '❌';
            const tok = p.hasToken ? '✅' : '❌';
            console.log(
                `${p.displayName.padEnd(14)}${p.brain.model.padEnd(22)}${fb.padEnd(5)}${tok.padEnd(7)}${p.fbStatus}`
            );
        }
        console.log(`\n📊 ${personas.filter(p => p.hasToken && p.pageId).length}/${personas.length} ready for deployment\n`);
        return;
    }

    // --test-voices — test all persona voices on a sample clip
    if (args.includes('--test-voices')) {
        const testClip = {
            title: 'AI Voice Agents Are Replacing Call Centers',
            caption: 'Ghost AI Systems builds autonomous voice agents that handle customer calls 24/7.',
            source: { title: 'Ghost AI Demo' },
            hook: 'AI replacing humans in customer service',
        };

        console.log('\n🎤 Testing all persona voices...\n');
        for (const id of getPersonaIds()) {
            try {
                const t0 = Date.now();
                const caption = await generatePersonaCaption(id, testClip);
                console.log(`═══ ${id.toUpperCase()} (${Date.now() - t0}ms) ═══`);
                console.log(caption.substring(0, 250));
                console.log('');
            } catch (err) {
                console.log(`═══ ${id.toUpperCase()} ═══`);
                console.log(`❌ ${err.message}\n`);
            }
        }
        return;
    }

    // Main distribution flow
    let clip;

    if (args.includes('--clip')) {
        const clipFile = args[args.indexOf('--clip') + 1];
        if (!clipFile) {
            console.error('Usage: --clip <filename.mp4>');
            process.exit(1);
        }
        // Find the clip in metadata
        const metaFiles = fs.readdirSync(CLIPS_DIR)
            .filter(f => f.endsWith('_clips.json') && !f.startsWith('.'));

        for (const mf of metaFiles) {
            const meta = JSON.parse(fs.readFileSync(path.join(CLIPS_DIR, mf), 'utf-8'));
            for (const c of meta.clips) {
                const fn = path.basename(c.filePath || c.fileName);
                if (fn === clipFile || fn.includes(clipFile)) {
                    clip = {
                        fileName: fn,
                        filePath: path.join(CLIPS_DIR, fn),
                        title: c.title,
                        caption: c.caption,
                        hook: c.hook,
                        source: meta.source,
                    };
                    break;
                }
            }
            if (clip) break;
        }

        if (!clip) {
            console.error(`❌ Clip not found: ${clipFile}`);
            process.exit(1);
        }
    } else {
        clip = getNextClipForDistribution();
        if (!clip) {
            console.log('✅ No clips remaining in distribution queue.');
            return;
        }
    }

    const dryRun = args.includes('--dry-run');
    const staggerMs = args.includes('--no-stagger') ? 0 : 15 * 60 * 1000;

    await distributeClip(clip, { dryRun, staggerMs });
}

main().catch(err => {
    console.error(`\n💀 Fatal: ${err.message}`);
    process.exit(1);
});

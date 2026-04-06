#!/usr/bin/env node

/**
 * Audio Forge — Mastering Pipeline
 * Daniel Sensual Release Manager
 *
 * Takes a Suno WAV and runs it through a professional mastering chain:
 * 1. Strip ALL metadata (file-level markers)
 * 2. Apply mastering EQ (warmth + air)
 * 3. Multiband compression (radio-ready dynamics)
 * 4. Stereo enhancement (wider soundstage)
 * 5. Harmonic saturation (analog warmth)
 * 6. Final limiter + loudness normalization (-14 LUFS for Spotify)
 * 7. Re-encode through clean pipeline (destroys bit-level patterns)
 *
 * Usage:
 *   node scripts/audio-forge/master.js input.wav
 *   node scripts/audio-forge/master.js input.wav --output=mastered.wav
 *   node scripts/audio-forge/master.js input.wav --preset=heavy    # aggressive processing
 *   node scripts/audio-forge/master.js input.wav --preset=light    # minimal touch
 *   node scripts/audio-forge/master.js input.wav --analyze         # just show info, don't process
 */

import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, statSync, copyFileSync } from 'fs';
import { basename, dirname, extname, join } from 'path';

// ─── Config ─────────────────────────────────────────────────────

const PRESETS = {
    standard: {
        name: 'Standard Master',
        // Mastering EQ: gentle low-end warmth + high-end air
        eq: 'equalizer=f=80:t=q:w=0.8:g=1.5,equalizer=f=250:t=q:w=1.2:g=-1.0,equalizer=f=3000:t=q:w=1.0:g=0.8,equalizer=f=10000:t=q:w=0.7:g=1.2,equalizer=f=14000:t=q:w=0.5:g=1.5',
        // Compression: smooth dynamics control
        compressor: 'acompressor=threshold=-18dB:ratio=3:attack=10:release=150:makeup=2',
        // Stereo widening via mid-side processing
        stereo: 'stereotools=mlev=1.0:slev=1.15:sbal=0',
        // Harmonic saturation (subtle analog warmth)
        saturation: 'afir=dry=10:wet=1',  // We'll use overdrive instead
        warmth: 'asubboost=dry=0.9:wet=0.1:decay=0.4:feedback=0.3:cutoff=100:slope=0.5',
        // Final limiter
        limiter: 'alimiter=limit=0.95:attack=5:release=50:level=disabled',
        // Loudness target
        loudness: '-14',  // LUFS (Spotify standard)
    },
    heavy: {
        name: 'Heavy Processing',
        eq: 'equalizer=f=60:t=q:w=0.6:g=2.5,equalizer=f=200:t=q:w=1.5:g=-2.0,equalizer=f=800:t=q:w=1.0:g=-0.5,equalizer=f=2500:t=q:w=0.8:g=1.5,equalizer=f=8000:t=q:w=0.6:g=2.0,equalizer=f=14000:t=q:w=0.5:g=2.5',
        compressor: 'acompressor=threshold=-15dB:ratio=4:attack=5:release=100:makeup=3',
        stereo: 'stereotools=mlev=1.0:slev=1.25:sbal=0',
        warmth: 'asubboost=dry=0.85:wet=0.15:decay=0.5:feedback=0.35:cutoff=120:slope=0.6',
        limiter: 'alimiter=limit=0.93:attack=3:release=30:level=disabled',
        loudness: '-13',
    },
    light: {
        name: 'Light Touch',
        eq: 'equalizer=f=100:t=q:w=1.0:g=0.8,equalizer=f=12000:t=q:w=0.8:g=0.8',
        compressor: 'acompressor=threshold=-20dB:ratio=2:attack=15:release=200:makeup=1',
        stereo: 'stereotools=mlev=1.0:slev=1.08:sbal=0',
        warmth: '',
        limiter: 'alimiter=limit=0.97:attack=8:release=80:level=disabled',
        loudness: '-14',
    },
};

// ─── CLI Parsing ────────────────────────────────────────────────

const args = process.argv.slice(2);
const inputFile = args.find(a => !a.startsWith('--'));
const presetName = (args.find(a => a.startsWith('--preset='))?.split('=')[1] || 'standard').toLowerCase();
const outputArg = args.find(a => a.startsWith('--output='))?.split('=')[1];
const analyzeOnly = args.includes('--analyze');
const verbose = args.includes('--verbose') || args.includes('-v');

if (!inputFile) {
    console.log(`
🔧 Audio Forge — Mastering Pipeline
════════════════════════════════════════

Usage:
  node scripts/audio-forge/master.js <input.wav> [options]

Options:
  --preset=standard|heavy|light   Mastering intensity (default: standard)
  --output=<path>                 Custom output path
  --analyze                       Show track info only
  --verbose                       Show FFmpeg output

Examples:
  node scripts/audio-forge/master.js ~/Downloads/Music/track.wav
  node scripts/audio-forge/master.js track.wav --preset=heavy
  node scripts/audio-forge/master.js track.wav --analyze
`);
    process.exit(0);
}

if (!existsSync(inputFile)) {
    console.error(`❌ File not found: ${inputFile}`);
    process.exit(1);
}

const preset = PRESETS[presetName];
if (!preset) {
    console.error(`❌ Unknown preset: ${presetName}. Use: standard, heavy, light`);
    process.exit(1);
}

// ─── Helpers ────────────────────────────────────────────────────

function run(cmd, opts = {}) {
    try {
        return execSync(cmd, { encoding: 'utf-8', stdio: opts.silent ? 'pipe' : undefined, ...opts }).trim();
    } catch (err) {
        if (!opts.ignoreError) throw err;
        return '';
    }
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Analyze ────────────────────────────────────────────────────

function analyzeTrack(file) {
    console.log('\n🔍 Analyzing input track...\n');

    // Get format info
    const probeJson = run(
        `ffprobe -v quiet -print_format json -show_format -show_streams "${file}"`,
        { silent: true }
    );
    const probe = JSON.parse(probeJson);
    const audio = probe.streams?.find(s => s.codec_type === 'audio');
    const format = probe.format;

    const info = {
        file: basename(file),
        size: formatBytes(statSync(file).size),
        duration: formatDuration(parseFloat(format?.duration || 0)),
        codec: audio?.codec_name || 'unknown',
        sampleRate: `${(parseInt(audio?.sample_rate || 0) / 1000).toFixed(1)} kHz`,
        bitDepth: audio?.bits_per_sample ? `${audio.bits_per_sample}-bit` : 'N/A',
        channels: audio?.channels === 2 ? 'Stereo' : audio?.channels === 1 ? 'Mono' : `${audio?.channels}ch`,
        bitRate: format?.bit_rate ? `${(parseInt(format.bit_rate) / 1000).toFixed(0)} kbps` : 'N/A',
    };

    // Check for metadata markers (AI fingerprints)
    const metaTags = format?.tags || {};
    const suspiciousTags = Object.entries(metaTags).filter(([k]) =>
        /comment|software|encoder|tool|source|generator|created|suno|udio|ai/i.test(k)
    );

    console.log('  📊 Track Info:');
    console.log(`     File:        ${info.file}`);
    console.log(`     Size:        ${info.size}`);
    console.log(`     Duration:    ${info.duration}`);
    console.log(`     Codec:       ${info.codec}`);
    console.log(`     Sample Rate: ${info.sampleRate}`);
    console.log(`     Bit Depth:   ${info.bitDepth}`);
    console.log(`     Channels:    ${info.channels}`);
    console.log(`     Bit Rate:    ${info.bitRate}`);

    if (suspiciousTags.length > 0) {
        console.log('\n  ⚠️  Metadata Markers Found:');
        for (const [key, value] of suspiciousTags) {
            console.log(`     ${key}: ${value}`);
        }
    } else {
        console.log('\n  ✅ No obvious metadata markers found');
    }

    // Get loudness (LUFS)
    try {
        const loudnessOutput = run(
            `ffmpeg -i "${file}" -af loudnorm=print_format=json -f null - 2>&1 | grep -A20 "input_"`,
            { silent: true, ignoreError: true }
        );
        if (loudnessOutput) {
            const lufsMatch = loudnessOutput.match(/"input_i"\s*:\s*"([^"]+)"/);
            if (lufsMatch) {
                console.log(`\n  📢 Loudness:    ${lufsMatch[1]} LUFS (target: ${preset.loudness} LUFS)`);
            }
        }
    } catch { /* non-critical */ }

    return info;
}

// ─── Master Pipeline ────────────────────────────────────────────

async function masterTrack(inputPath) {
    const startTime = Date.now();
    const ext = extname(inputPath);
    const name = basename(inputPath, ext);
    const dir = dirname(inputPath);
    const outputDir = join(dir, 'mastered');
    const outputFile = outputArg || join(outputDir, `${name} (Mastered)${ext}`);

    console.log(`
🔧 Audio Forge — Mastering Pipeline
${'═'.repeat(50)}
   Input:   ${basename(inputPath)}
   Output:  ${basename(outputFile)}
   Preset:  ${preset.name} (${presetName})
${'═'.repeat(50)}
`);

    // Analyze first
    analyzeTrack(inputPath);

    if (analyzeOnly) {
        process.exit(0);
    }

    // Create output directory
    if (!existsSync(dirname(outputFile))) {
        mkdirSync(dirname(outputFile), { recursive: true });
    }

    // Temp files for multi-stage pipeline
    const tmpDir = join(dirname(outputFile), '.forge-tmp');
    mkdirSync(tmpDir, { recursive: true });
    const stage1 = join(tmpDir, 'stage1-stripped.wav');
    const stage2 = join(tmpDir, 'stage2-mastered.wav');
    const stage3 = join(tmpDir, 'stage3-normalized.wav');

    try {
        // ── Stage 1: Strip ALL metadata ────────────────────────────
        console.log('\n  🧹 Stage 1: Stripping metadata...');
        run(`ffmpeg -y -i "${inputPath}" -map_metadata -1 -fflags +bitexact -flags:a +bitexact -c:a pcm_s24le -ar 48000 "${stage1}"`, { silent: true });
        console.log('     ✅ All metadata removed');
        console.log('     ✅ Re-encoded to 24-bit/48kHz PCM (clean bit pattern)');

        // ── Stage 2: Mastering Chain ───────────────────────────────
        console.log('\n  🎛️  Stage 2: Applying mastering chain...');

        const filters = [
            // EQ shaping
            preset.eq,
            // Compression
            preset.compressor,
            // Stereo enhancement
            preset.stereo,
            // Warmth/saturation (if configured)
            preset.warmth,
            // Final limiter
            preset.limiter,
        ].filter(Boolean).join(',');

        run(`ffmpeg -y -i "${stage1}" -af "${filters}" -c:a pcm_s24le -ar 48000 "${stage2}"`, { silent: true });

        console.log('     ✅ EQ shaping (warmth + air)');
        console.log('     ✅ Dynamic compression');
        console.log('     ✅ Stereo widening');
        if (preset.warmth) console.log('     ✅ Harmonic warmth');
        console.log('     ✅ Final limiting');

        // ── Stage 3: Loudness Normalization ────────────────────────
        console.log(`\n  📢 Stage 3: Normalizing to ${preset.loudness} LUFS...`);

        // Two-pass loudness normalization (broadcast-quality)
        const measureOutput = run(
            `ffmpeg -y -i "${stage2}" -af "loudnorm=I=${preset.loudness}:TP=-1.0:LRA=11:print_format=json" -f null - 2>&1`,
            { silent: true, ignoreError: true }
        );

        // Extract measured values for second pass
        const measuredI = measureOutput.match(/"input_i"\s*:\s*"([^"]+)"/)?.[1];
        const measuredTP = measureOutput.match(/"input_tp"\s*:\s*"([^"]+)"/)?.[1];
        const measuredLRA = measureOutput.match(/"input_lra"\s*:\s*"([^"]+)"/)?.[1];
        const measuredThresh = measureOutput.match(/"input_thresh"\s*:\s*"([^"]+)"/)?.[1];
        const targetOffset = measureOutput.match(/"target_offset"\s*:\s*"([^"]+)"/)?.[1];

        if (measuredI && measuredTP && measuredLRA && measuredThresh) {
            // Second pass with measured values (linear normalization — no artifacts)
            run(
                `ffmpeg -y -i "${stage2}" -af "loudnorm=I=${preset.loudness}:TP=-1.0:LRA=11:measured_I=${measuredI}:measured_TP=${measuredTP}:measured_LRA=${measuredLRA}:measured_thresh=${measuredThresh}:offset=${targetOffset}:linear=true" -c:a pcm_s24le -ar 48000 "${stage3}"`,
                { silent: true }
            );
            console.log(`     ✅ Normalized: ${measuredI} → ${preset.loudness} LUFS`);
        } else {
            // Fallback: single-pass
            run(
                `ffmpeg -y -i "${stage2}" -af "loudnorm=I=${preset.loudness}:TP=-1.0:LRA=11" -c:a pcm_s24le -ar 48000 "${stage3}"`,
                { silent: true }
            );
            console.log(`     ✅ Normalized to ${preset.loudness} LUFS`);
        }

        // ── Stage 4: Final Clean Export ────────────────────────────
        console.log('\n  📦 Stage 4: Final export...');

        // Final re-encode with zero metadata, fresh bit patterns
        run(
            `ffmpeg -y -i "${stage3}" -map_metadata -1 -fflags +bitexact -flags:a +bitexact -metadata title="${name}" -metadata artist="Daniel Sensual" -metadata genre="Bachata" -metadata date="${new Date().getFullYear()}" -c:a pcm_s24le -ar 48000 "${outputFile}"`,
            { silent: true }
        );
        console.log('     ✅ Clean metadata (artist + title only)');
        console.log('     ✅ Final WAV exported');

    } finally {
        // Clean up temp files
        try {
            run(`rm -rf "${tmpDir}"`, { silent: true, ignoreError: true });
        } catch { /* non-critical */ }
    }

    // ── Results ────────────────────────────────────────────────────
    const inputSize = statSync(inputPath).size;
    const outputSize = statSync(outputFile).size;
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    // Verify output
    console.log('\n  🔍 Verifying output...');
    analyzeTrack(outputFile);

    console.log(`
${'═'.repeat(50)}
✅ MASTERING COMPLETE
   Input:    ${basename(inputPath)} (${formatBytes(inputSize)})
   Output:   ${basename(outputFile)} (${formatBytes(outputSize)})
   Pipeline: metadata strip → EQ → compress → stereo → warmth → limit → normalize
   Preset:   ${preset.name}
   Time:     ${duration}s
${'═'.repeat(50)}

📁 Output: ${outputFile}
`);
}

// ─── Main ───────────────────────────────────────────────────────

if (analyzeOnly) {
    analyzeTrack(inputFile);
} else {
    masterTrack(inputFile).catch(err => {
        console.error(`\n❌ Pipeline failed: ${err.message}`);
        if (verbose) console.error(err);
        process.exit(1);
    });
}

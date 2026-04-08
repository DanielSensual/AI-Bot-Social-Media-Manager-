/**
 * Assembly Engine — ffmpeg pipeline
 * 
 * Mutes all clip audio, concatenates via filter (not demuxer),
 * syncs external audio, scrubs AI metadata.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from 'fs';

/**
 * Assemble clips into final reel
 */
export function assembleReel(clips, audioPath, outputPath, options = {}) {
  const audioStart = options.audioStart || 0;
  const fps = options.fps || 30;
  const crf = options.crf || 18;
  const width = options.width || 1080;
  const height = options.height || 1920;
  const keyframeInterval = options.keyframeInterval || 30;
  const bpm = options.bpm || 127;
  const beatDuration = 60 / bpm; // seconds per beat

  console.log(`\n🔧 Assembling ${clips.length} clips...`);
  console.log(`  🎵 BPM: ${bpm} | Beat: ${beatDuration.toFixed(3)}s`);

  // Phase 1: Pre-normalize ALL clips to identical format
  // This is the key fix — identical codec, resolution, fps, pixel format, timebase
  console.log('  🔄 Pre-normalizing clips to identical format...');
  const normPaths = [];

  for (let i = 0; i < clips.length; i++) {
    const normPath = clips[i].path.replace('.mp4', '_norm.mp4');
    
    // Trim each clip to nearest beat boundary for BPM-aligned cuts
    const clipDur = parseFloat(
      execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${clips[i].path}"`, { encoding: 'utf-8' }).trim()
    );
    const beatAlignedDur = Math.floor(clipDur / beatDuration) * beatDuration;

    // Add 3-frame (0.1s) fade out at end of each clip for clean cut
    const fadeStart = Math.max(0, beatAlignedDur - 0.1);

    execSync(`ffmpeg -y -i "${clips[i].path}" -an \
      -vf "scale=${width}:${height}:flags=lanczos,fps=${fps},format=yuv420p,fade=t=out:st=${fadeStart}:d=0.1" \
      -t ${beatAlignedDur} \
      -c:v libx264 -preset fast -crf ${crf} -profile:v high -pix_fmt yuv420p \
      -g ${keyframeInterval} -keyint_min ${keyframeInterval} \
      -force_key_frames "expr:gte(t,n_forced*1)" \
      -video_track_timescale 30000 \
      "${normPath}" 2>/dev/null`, { stdio: 'pipe' });

    normPaths.push(normPath);
    console.log(`  ✅ Clip ${i + 1} normalized (${beatAlignedDur.toFixed(1)}s, ${Math.round(beatAlignedDur / beatDuration)} beats)`);
  }

  // Phase 2: Concat with demuxer (safe with identical inputs)
  const concatList = normPaths.map(p => `file '${p}'`).join('\n');
  const concatFile = clips[0].path.replace('.mp4', '_concat.txt');
  writeFileSync(concatFile, concatList);

  // Audio input as overlay
  const audioIdx = 0;
  const cmd = `ffmpeg -y \
  -f concat -safe 0 -i "${concatFile}" \
  -ss ${audioStart} -i "${audioPath}" \
  -map 0:v -map 1:a \
  -map_metadata -1 \
  -c:v copy \
  -c:a aac -b:a 256k -ar 44100 \
  -metadata title="Bachata Sensual - Daniel Sensual" \
  -metadata artist="Daniel Sensual" \
  -metadata album="Bachata Sensual" \
  -metadata comment="© 2026 Daniel Sensual. All rights reserved." \
  -shortest -movflags +faststart \
  "${outputPath}" 2>&1 | tail -5`;

  console.log('  📹 Rendering final assembly...');
  execSync(cmd, { stdio: 'pipe' });
  console.log('  ✅ Render complete');

  // Cleanup normalized intermediates
  for (const p of normPaths) {
    try { execSync(`rm -f "${p}"`); } catch {}
  }
  try { execSync(`rm -f "${concatFile}"`); } catch {}

  return outputPath;
}

/**
 * Scrub AI metadata from the output file
 */
export function scrubMetadata(filePath) {
  console.log('  🧹 Scrubbing AI metadata...');

  // Binary-level replacement
  const platform = process.platform;
  if (platform === 'darwin') {
    execSync(`LC_ALL=C sed -i '' 's/xai/aaa/g; s/xAI/aAa/g; s/grok/aaaa/g; s/Grok/Aaaa/g; s/veo/aaa/g; s/Veo/Aaa/g' "${filePath}"`);
  } else {
    execSync(`LC_ALL=C sed -i 's/xai/aaa/g; s/xAI/aAa/g; s/grok/aaaa/g; s/Grok/Aaaa/g; s/veo/aaa/g; s/Veo/Aaa/g' "${filePath}"`);
  }

  // Verify
  try {
    const traces = execSync(`strings "${filePath}" | grep -ic "grok\\|xai\\|veo" || echo 0`, { encoding: 'utf-8' }).trim();
    console.log(`  🔒 AI traces remaining: ${traces}`);
    return parseInt(traces) || 0;
  } catch {
    return 0;
  }
}

/**
 * Verify the output file
 */
export function verifyOutput(filePath) {
  console.log('  ✅ Verifying output...');

  const dur = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
    { encoding: 'utf-8' }
  ).trim();

  const res = execSync(
    `ffprobe -v error -show_entries stream=width,height -of csv=p=0 "${filePath}" | head -1`,
    { encoding: 'utf-8' }
  ).trim();

  const size = execSync(`ls -lh "${filePath}" | awk '{print $5}'`, { encoding: 'utf-8' }).trim();

  // Validate playability
  try {
    execSync(`ffprobe -v error "${filePath}"`, { stdio: 'pipe' });
  } catch {
    throw new Error('Output file is corrupt');
  }

  return {
    duration: parseFloat(dur),
    resolution: res,
    size,
    valid: true,
  };
}

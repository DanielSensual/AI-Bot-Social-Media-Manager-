#!/usr/bin/env node
/**
 * Ghost AI Creative Director — Shot Board CLI
 * 
 * ghostai-shotboard create "brief"     → Generate shot board
 * ghostai-shotboard render board.json  → Full pipeline
 * ghostai-shotboard qa clips/          → QA analysis only
 */

import { program } from 'commander';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve, basename } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

// Load .env
const envPath = resolve(import.meta.dirname, '../../.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

import { generateShotBoard } from './agents/director.js';
import { analyzeClip, batchQA } from './agents/qa-vision.js';
import { generateImage, generateVideo } from './providers/index.js';
import { uploadToCatbox } from './providers/grok.js';
import { assembleReel, scrubMetadata, verifyOutput } from './pipeline/assembler.js';

program
  .name('ghostai-shotboard')
  .description('Ghost AI Creative Director — Autonomous reel production')
  .version('1.0.0');

// ─── CREATE ─────────────────────────────────────────────────────────────────
program
  .command('create <brief>')
  .description('Generate a shot board from a creative brief')
  .option('-n, --shots <num>', 'Number of shots', '4')
  .option('-d, --duration <sec>', 'Target duration in seconds', '45')
  .option('-o, --output <path>', 'Output path for shot board JSON')
  .action(async (brief, opts) => {
    console.log('\n🎬 Ghost AI Creative Director');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Brief: "${brief}"`);
    console.log(`Shots: ${opts.shots} | Duration: ${opts.duration}s\n`);

    try {
      const shotBoard = await generateShotBoard(brief, {
        numShots: parseInt(opts.shots),
        targetDuration: parseInt(opts.duration),
      });

      const outPath = opts.output || `shotboard_${Date.now()}.json`;
      writeFileSync(outPath, JSON.stringify(shotBoard, null, 2));
      console.log(`\n✅ Shot board saved: ${outPath}`);
      console.log(`\nShots planned:`);
      for (const shot of shotBoard.shots) {
        console.log(`  ${shot.order}. [${shot.type}] ${shot.location} — ${shot.camera_movement} (${shot.duration}s)`);
      }
      console.log(`\nNarrative: ${shotBoard.project.narrative}`);
      console.log(`\nNext: ghostai-shotboard render ${outPath} --audio <track.wav>`);
    } catch (err) {
      console.error(`❌ Error: ${err.message}`);
      process.exit(1);
    }
  });

// ─── RENDER ─────────────────────────────────────────────────────────────────
program
  .command('render <shotboard>')
  .description('Full pipeline: generate images → video → QA → assemble')
  .requiredOption('--audio <path>', 'Audio track path')
  .option('--audio-start <sec>', 'Audio start time in seconds', '0')
  .option('--skip-qa', 'Skip QA vision analysis')
  .option('--provider <name>', 'Force specific provider (grok/gemini/fal/replicate)')
  .option('-o, --output <path>', 'Output path for final reel')
  .action(async (shotboardPath, opts) => {
    console.log('\n🎬 Ghost AI Creative Director — Full Render');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const boardRaw = readFileSync(shotboardPath, 'utf-8');
    const board = JSON.parse(boardRaw);
    const audioPath = resolve(opts.audio);

    if (!existsSync(audioPath)) {
      console.error(`❌ Audio file not found: ${audioPath}`);
      process.exit(1);
    }

    const workDir = join(homedir(), 'Downloads', `shotboard_${Date.now()}`);
    mkdirSync(workDir, { recursive: true });

    console.log(`Project: ${board.project.title}`);
    console.log(`Shots: ${board.shots.length}`);
    console.log(`Audio: ${basename(audioPath)} @ ${opts.audioStart}s`);
    console.log(`Work dir: ${workDir}\n`);

    const clips = [];

    for (const shot of board.shots) {
      console.log(`\n━━━ Shot ${shot.order}: ${shot.type} | ${shot.location} ━━━`);

      // Step 1: Generate hero image
      console.log('  Phase 1: Image generation');
      let imageResult;
      try {
        imageResult = await generateImage(shot.prompt);
      } catch (err) {
        console.log(`  ❌ All image providers failed for shot ${shot.id}: ${err.message}`);
        continue;
      }

      // Save image locally
      const imagePath = join(workDir, `shot_${shot.id}_hero.png`);
      if (imageResult.type === 'url') {
        execSync(`curl -sL -o "${imagePath}" "${imageResult.url}"`);
      } else if (imageResult.type === 'b64') {
        writeFileSync(imagePath, Buffer.from(imageResult.b64, 'base64'));
      }

      // Upload to Catbox for public URL
      let publicUrl;
      try {
        publicUrl = await uploadToCatbox(imagePath);
      } catch (err) {
        console.log(`  ❌ Catbox upload failed: ${err.message}`);
        continue;
      }

      // Step 2: Generate video from image
      console.log('  Phase 2: Video generation (image-to-video)');
      let videoResult;
      try {
        videoResult = await generateVideo(publicUrl, shot.prompt, {
          duration: shot.duration,
          aspectRatio: '9:16',
        });
      } catch (err) {
        console.log(`  ❌ All video providers failed for shot ${shot.id}: ${err.message}`);
        continue;
      }

      // Download clip
      const clipPath = join(workDir, `shot_${shot.id}_clip.mp4`);
      execSync(`curl -sL -o "${clipPath}" "${videoResult.url}"`);

      shot.status = 'generated';
      shot.provider = `${imageResult.provider}+${videoResult.provider}`;
      clips.push({ path: clipPath, shot });

      console.log(`  ✅ Shot ${shot.id} generated (${imageResult.provider} → ${videoResult.provider})`);
    }

    if (clips.length === 0) {
      console.error('\n❌ No clips generated. Check API keys and connectivity.');
      process.exit(1);
    }

    // Step 3: QA Vision Analysis
    if (!opts.skipQa && process.env.OPENAI_API_KEY) {
      console.log('\n\n━━━ QA Vision Analysis ━━━');
      const qaResults = await batchQA(clips, board);

      const failed = qaResults.filter(r => !r.pass);
      if (failed.length > 0) {
        console.log(`\n⚠️  ${failed.length} clips failed QA. Proceeding with passing clips only.`);
        // Filter to only passing clips
        const passingIds = new Set(qaResults.filter(r => r.pass).map(r => r.shotId));
        const filteredClips = clips.filter(c => passingIds.has(c.shot.id));
        clips.length = 0;
        clips.push(...filteredClips);
      }
    } else if (!process.env.OPENAI_API_KEY) {
      console.log('\n⏭️  Skipping QA (no OPENAI_API_KEY)');
    }

    // Step 4: Assemble final reel
    console.log('\n\n━━━ Assembly ━━━');
    const outputPath = opts.output || join(
      homedir(), 'Downloads',
      `DanielSensual_Reel_${new Date().toISOString().slice(0, 10)}.mp4`
    );

    assembleReel(clips, audioPath, outputPath, {
      audioStart: parseInt(opts.audioStart),
      fps: board.assembly.fps,
      crf: board.assembly.crf,
    });

    // Step 5: Scrub + verify
    scrubMetadata(outputPath);
    const info = verifyOutput(outputPath);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📹 Output:     ${outputPath}`);
    console.log(`⏱  Duration:   ${info.duration}s`);
    console.log(`📐 Resolution: ${info.resolution}`);
    console.log(`💾 Size:       ${info.size}`);
    console.log(`🎬 Clips:      ${clips.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n🎉 Reel ready!');

    // Auto-open on macOS
    try { execSync(`open "${outputPath}"`); } catch {}

    // Save updated board with statuses
    writeFileSync(shotboardPath, JSON.stringify(board, null, 2));
  });

// ─── QA ─────────────────────────────────────────────────────────────────────
program
  .command('qa <clip>')
  .description('Run QA vision analysis on a clip')
  .option('-d, --description <text>', 'Shot description for context')
  .action(async (clipPath, opts) => {
    console.log('\n👁️  QA Vision Analysis');
    const desc = opts.description || 'DJ girl at a party, neon lights, bachata';
    const result = await analyzeClip(resolve(clipPath), desc);
    console.log(JSON.stringify(result, null, 2));
  });

program.parse();

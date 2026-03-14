#!/usr/bin/env node
/**
 * Voice Generation CLI
 *
 * Usage:
 *   node scripts/generate-voice.js "Your text here"
 *   node scripts/generate-voice.js "Text" --emotion excited
 *   node scripts/generate-voice.js "Text" --voice ghostai --format wav
 *   node scripts/generate-voice.js --clone ./my-voice.wav "Text to speak"
 *   node scripts/generate-voice.js --list-emotions
 */

import dotenv from 'dotenv';
import path from 'path';
import { generateVoiceover, generateEmotionalVoiceover, cloneAndSpeak } from '../src/voice-client.js';

dotenv.config();

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
🎙️  FishAudio Voice Generator
═══════════════════════════════

Usage:
  node scripts/generate-voice.js "Your text here"
  node scripts/generate-voice.js "Text" --emotion excited
  node scripts/generate-voice.js "Text" --voice ghostai --format wav
  node scripts/generate-voice.js --clone ./sample.wav "Text to speak"

Options:
  --emotion <type>    Add emotion: confident, excited, dramatic, chill, serious, hype, whisper
  --voice <name|id>   Voice preset name or FishAudio reference ID
  --format <fmt>      Output format: mp3 (default), wav, opus, pcm
  --output <path>     Custom output file path
  --clone <file>      Clone voice from audio sample (zero-shot)

Emotion markers in text:
  You can also use inline markers: "(excited) Wow! (calm) That was amazing."

Available emotions: (happy), (sad), (angry), (excited), (calm), (shouting), (whispering), (soft tone), (laughing), (sighing)
`);
    process.exit(0);
}

// Parse arguments
let text = '';
let emotion = null;
let voice = 'ghostai';
let format = 'mp3';
let output = null;
let cloneSample = null;

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--emotion' || arg === '-e') { emotion = args[++i]; continue; }
    if (arg === '--voice' || arg === '-v') { voice = args[++i]; continue; }
    if (arg === '--format' || arg === '-f') { format = args[++i]; continue; }
    if (arg === '--output' || arg === '-o') { output = args[++i]; continue; }
    if (arg === '--clone' || arg === '-c') { cloneSample = args[++i]; continue; }
    if (!arg.startsWith('-')) {
        text = text ? `${text} ${arg}` : arg;
    }
}

if (!text) {
    console.error('❌ No text provided');
    process.exit(1);
}

async function main() {
    console.log('');
    console.log('🎙️  FishAudio Voice Generator');
    console.log('─'.repeat(40));
    console.log(`📝 Text: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);
    console.log(`🗣️  Voice: ${voice}`);
    if (emotion) console.log(`😊 Emotion: ${emotion}`);
    if (cloneSample) console.log(`🎤 Clone from: ${cloneSample}`);
    console.log(`📦 Format: ${format}`);
    console.log('');

    let audioPath;

    if (cloneSample) {
        audioPath = await cloneAndSpeak(text, cloneSample, '', { format, outputPath: output });
    } else if (emotion) {
        audioPath = await generateEmotionalVoiceover(text, emotion, { voice, format, outputPath: output });
    } else {
        audioPath = await generateVoiceover(text, { voice, format, outputPath: output });
    }

    console.log('');
    console.log(`🎉 Done! Audio file: ${audioPath}`);
    console.log(`   Play with: open "${audioPath}"`);
}

main().catch(err => {
    console.error(`❌ ${err.message}`);
    process.exit(1);
});

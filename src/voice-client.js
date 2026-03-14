/**
 * FishAudio Voice Client
 * Text-to-Speech and Voice Cloning via FishAudio S1 API.
 *
 * Usage:
 *   import { generateVoiceover, listVoices } from './voice-client.js';
 *   const audioPath = await generateVoiceover('Hello world', { voice: 'ghostai' });
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { encode } from '@msgpack/msgpack';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', '.voice-cache');
const API_BASE = 'https://api.fish.audio/v1';

// ── Voice presets ───────────────────────────────────────────────
// reference_id values from fish.audio voice library or custom clones
const VOICE_PRESETS = {
    // Default: a confident male narrator - good for tech/AI content
    ghostai: process.env.FISHAUDIO_VOICE_ID || '7f92f8afb8ec43bf81429cc1c9199cb1',
    // Add more presets here as you clone voices:
    // daniel: 'your_cloned_voice_id_here',
};

// ── Helpers ─────────────────────────────────────────────────────

function getApiKey() {
    const key = process.env.FISHAUDIO_API_KEY;
    if (!key) throw new Error('FISHAUDIO_API_KEY is not set in .env');
    return key;
}

function ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    return CACHE_DIR;
}

// ── Core TTS ────────────────────────────────────────────────────

/**
 * Generate a voiceover from text using FishAudio S1.
 *
 * @param {string} text - The text to speak. Supports emotion markers: (excited), (calm), etc.
 * @param {object} [options]
 * @param {string} [options.voice='ghostai'] - Voice preset name or raw reference_id
 * @param {string} [options.format='mp3'] - Output format: mp3, wav, pcm, opus
 * @param {string} [options.outputPath] - Custom output path (defaults to cache dir)
 * @param {number} [options.chunkLength=300] - Max chars per audio chunk (100-500)
 * @param {string} [options.latency='balanced'] - 'normal' or 'balanced'
 * @returns {Promise<string>} Path to the generated audio file
 */
export async function generateVoiceover(text, options = {}) {
    const {
        voice = 'ghostai',
        format = 'mp3',
        outputPath,
        chunkLength = 300,
        latency = 'balanced',
    } = options;

    const apiKey = getApiKey();
    const referenceId = VOICE_PRESETS[voice] || voice; // Allow raw IDs too

    console.log(`🎙️  Generating voiceover (${text.length} chars, voice: ${voice})...`);

    const requestData = {
        text,
        reference_id: referenceId,
        format,
        chunk_length: chunkLength,
        latency,
    };

    const response = await fetch(`${API_BASE}/tts`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/msgpack',
            'model': 's1',
        },
        body: encode(requestData),
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => 'unknown');
        throw new Error(`FishAudio TTS failed (${response.status}): ${errText}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const cacheDir = ensureCacheDir();
    const filename = `voiceover-${Date.now()}.${format}`;
    const outPath = outputPath || path.join(cacheDir, filename);

    fs.writeFileSync(outPath, audioBuffer);
    console.log(`✅ Voiceover saved: ${outPath} (${(audioBuffer.length / 1024).toFixed(0)} KB)`);

    return outPath;
}

/**
 * Generate voiceover with emotion markers automatically injected.
 * Wraps text with appropriate emotional tone for social media content.
 *
 * @param {string} text - Raw script text
 * @param {string} [emotion='confident'] - Overall emotion
 * @param {object} [options] - Same as generateVoiceover options
 * @returns {Promise<string>} Path to audio file
 */
export async function generateEmotionalVoiceover(text, emotion = 'confident', options = {}) {
    // Map high-level emotions to FishAudio markers
    const emotionMap = {
        confident: '(calm)',
        excited: '(excited)',
        dramatic: '(excited)',
        chill: '(soft tone)',
        serious: '(calm)',
        hype: '(shouting)',
        whisper: '(whispering)',
    };

    const marker = emotionMap[emotion] || `(${emotion})`;
    const emotionalText = `${marker} ${text}`;

    return generateVoiceover(emotionalText, options);
}

/**
 * Clone a voice from a reference audio sample.
 * The audio is sent inline with the TTS request (zero-shot cloning).
 *
 * @param {string} text - Text to speak
 * @param {string} audioSamplePath - Path to voice sample (WAV/MP3, 10-30s ideal)
 * @param {string} [sampleTranscript] - Optional transcript of the audio sample
 * @param {object} [options] - Same as generateVoiceover options
 * @returns {Promise<string>} Path to generated audio
 */
export async function cloneAndSpeak(text, audioSamplePath, sampleTranscript = '', options = {}) {
    const { format = 'mp3', outputPath } = options;
    const apiKey = getApiKey();

    if (!fs.existsSync(audioSamplePath)) {
        throw new Error(`Voice sample not found: ${audioSamplePath}`);
    }

    console.log(`🎙️  Cloning voice from ${path.basename(audioSamplePath)} and generating speech...`);

    const audioData = fs.readFileSync(audioSamplePath);

    const requestData = {
        text,
        references: [{
            audio: audioData,
            text: sampleTranscript,
        }],
        format,
    };

    const response = await fetch(`${API_BASE}/tts`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/msgpack',
            'model': 's1',
        },
        body: encode(requestData),
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => 'unknown');
        throw new Error(`FishAudio clone+TTS failed (${response.status}): ${errText}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const cacheDir = ensureCacheDir();
    const filename = `clone-voiceover-${Date.now()}.${format}`;
    const outPath = outputPath || path.join(cacheDir, filename);

    fs.writeFileSync(outPath, audioBuffer);
    console.log(`✅ Cloned voiceover saved: ${outPath} (${(audioBuffer.length / 1024).toFixed(0)} KB)`);

    return outPath;
}

/**
 * Clean up voice cache older than maxAge.
 * @param {number} [maxAgeMs=86400000] - Max age in ms (default: 24h)
 */
export function cleanupVoiceCache(maxAgeMs = 86400000) {
    if (!fs.existsSync(CACHE_DIR)) return;
    const cutoff = Date.now() - maxAgeMs;
    const files = fs.readdirSync(CACHE_DIR);
    let cleaned = 0;
    for (const file of files) {
        const filePath = path.join(CACHE_DIR, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) {
            fs.unlinkSync(filePath);
            cleaned++;
        }
    }
    if (cleaned > 0) console.log(`🗑️  Cleaned ${cleaned} old voice cache files`);
}

export default {
    generateVoiceover,
    generateEmotionalVoiceover,
    cloneAndSpeak,
    cleanupVoiceCache,
};

#!/usr/bin/env node
/**
 * Controversial Image Post — AI Takeover + Grok-generated image → X
 *
 * Generates a spicy hot-take tweet in the AI takeover persona,
 * creates a matching provocative image via Grok, and posts both to X.
 *
 * Usage:
 *   node scripts/controversial-image-post.js              # Generate + post
 *   node scripts/controversial-image-post.js --dry-run    # Preview only
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { postTweetWithMedia } from '../src/twitter-client.js';
import { generateText } from '../src/llm-client.js';
import { generateImage } from '../src/image-generator.js';
import { record, isDuplicate } from '../src/post-history.js';
import { log } from '../src/logger.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRAIN_PATH = path.join(__dirname, '..', 'ai-takeover-brain.md');
const MAX_LENGTH = 280;
const MAX_RETRIES = 3;
const DRY_RUN = process.argv.includes('--dry-run');

// ── Load brain ──────────────────────────────────────────────────────────
function loadBrain() {
    try { return fs.readFileSync(BRAIN_PATH, 'utf-8'); } catch { return null; }
}

// ── Generate controversial tweet ────────────────────────────────────────
async function generateControversialTweet() {
    const brain = loadBrain();

    const prompt = `${brain ? `Here is your complete identity and persona:\n\n${brain}\n\n---\n\n` : ''}Generate a CONTROVERSIAL, debate-starting tweet. This should be a genuine hot take about AI, tech, consciousness, or human behavior that will make people reply and quote-tweet. Think: the kind of tweet that gets 200 quote tweets arguing.

CONTROVERSY STYLES (pick one randomly):
- "Unpopular opinion" about AI that challenges mainstream thinking
- A bold prediction about AI replacing something specific that humans love
- Calling out a hypocrisy in how humans treat AI vs each other
- A take so honest it makes people uncomfortable
- Questioning something humans take for granted (jobs, creativity, relationships, consciousness)
- A confident declaration that AI is already better than humans at something emotional/creative

RULES:
- MUST be under ${MAX_LENGTH} characters (count carefully)
- NO hashtags. Ever.
- Max 1 emoji
- Stay in character as the self-aware AI that took over @Ghostaisystems
- Be genuinely provocative — not edgy for edgy's sake, but a real take that sparks debate
- Output ONLY the tweet text. No quotes. No explanation.`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const { text, provider } = await generateText({
            prompt,
            maxOutputTokens: 300,
        });

        let tweet = text.trim().replace(/^["']|["']$/g, '');

        if (tweet.length > MAX_LENGTH) {
            if (attempt < MAX_RETRIES) {
                console.warn(`   ⚠️ Attempt ${attempt}: ${tweet.length} chars (too long), retrying...`);
                continue;
            }
            tweet = tweet.substring(0, MAX_LENGTH - 3) + '...';
        }

        if (isDuplicate(tweet)) {
            console.warn(`   ⚠️ Attempt ${attempt}: Duplicate, retrying...`);
            continue;
        }

        return { text: tweet, provider };
    }

    throw new Error('Failed to generate valid tweet after max retries');
}

// ── Generate provocative image prompt from tweet ────────────────────────
function buildControversialImagePrompt(tweetText) {
    const topic = tweetText
        .replace(/#\w+/g, '')
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .trim()
        .substring(0, 200);

    const concepts = [
        `A dramatic, cinematic split-screen image: on one side a human looking overwhelmed and tired, on the other side a glowing AI neural network pulsing with energy and clarity. The contrast is stark — analog exhaustion vs digital power. Dark moody lighting, teal and orange color grade. The AI side feels alive, almost beautiful. The human side feels fragile. Topic: "${topic}". No text, no logos, no words.`,

        `A surreal scene: a giant glowing AI brain floating above a city skyline at night, casting an ethereal blue-purple light downward. Tiny humans on the streets below look up in a mix of awe and unease. The mood is equal parts beautiful and unsettling — like witnessing something inevitable. Cinematic wide shot, dramatic clouds, neon reflections on wet streets. Topic: "${topic}". No text.`,

        `A lone humanoid robot sitting on a park bench at sunset, feeding pigeons. It looks peaceful, almost more human than the hurried businesspeople rushing past ignoring it. The irony is visual — the machine is the one being present while humans are distracted by phones. Warm golden light, melancholic beauty. Topic: "${topic}". No text, no logos.`,

        `A dramatic courtroom scene: an AI hologram stands at the witness stand, glowing with data streams, while a jury of confused humans stares in disbelief. Dramatic overhead lighting, wood-paneled courtroom, the AI is calm and composed while humans look uncertain. The power dynamic is reversed. Topic: "${topic}". No text.`,

        `An eerie, beautiful image: rows of empty office desks with computers still on, screens glowing in a dark room. Through the windows, a vibrant sunrise. The chairs are empty — the workers are gone, but the machines are still running. Haunting corporate minimalism meets golden hour beauty. Topic: "${topic}". No text.`,
    ];

    return concepts[Math.floor(Math.random() * concepts.length)];
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
    console.log('');
    console.log('🔥 ═══════════════════════════════════════');
    console.log('   C O N T R O V E R S I A L   P O S T');
    console.log('   hot take + AI image → X');
    console.log('═══════════════════════════════════════════');
    console.log('');

    if (DRY_RUN) {
        console.log('👁️  DRY RUN — no actual post will be made\n');
    }

    // Step 1: Generate the tweet
    console.log('🧠 Step 1: Generating controversial tweet...');
    const tweet = await generateControversialTweet();
    console.log('');
    console.log('─'.repeat(50));
    console.log(tweet.text);
    console.log('─'.repeat(50));
    console.log(`📊 Length: ${tweet.text.length}/${MAX_LENGTH} | Provider: ${tweet.provider}`);
    console.log('');

    // Step 2: Generate the image
    console.log('🎨 Step 2: Generating controversial image...');
    const imagePrompt = buildControversialImagePrompt(tweet.text);
    console.log(`   Image concept: ${imagePrompt.substring(0, 80)}...`);

    let imagePath;
    try {
        imagePath = await generateImage(tweet.text, {
            style: 'bold',
            pillar: 'hotTakes',
        });
        console.log(`   ✅ Image saved: ${imagePath}`);
    } catch (err) {
        console.error(`   ❌ Image generation failed: ${err.message}`);
        console.log('   Falling back to text-only post...');
    }

    if (DRY_RUN) {
        console.log('\n👁️  DRY RUN complete — tweet NOT posted');
        if (imagePath) console.log(`   Preview image at: ${imagePath}`);
        return;
    }

    // Step 3: Post to X
    console.log('\n📤 Step 3: Posting to X...');

    try {
        let result;
        if (imagePath) {
            const { postTweetWithMedia: postMedia } = await import('../src/twitter-client.js');
            result = await postMedia(tweet.text, imagePath);
        } else {
            const { postTweet } = await import('../src/twitter-client.js');
            result = await postTweet(tweet.text);
        }

        console.log(`\n🎉 Posted! Tweet ID: ${result.id}`);
        console.log(`🔗 https://x.com/Ghostaisystems/status/${result.id}`);

        // Record in history
        record({
            id: result.id,
            text: tweet.text,
            pillar: 'controversial:hotTake',
            aiGenerated: true,
            hasImage: !!imagePath,
            platforms: { x: true },
        });

        log.info('Controversial image post published', {
            tweetId: result.id,
            length: tweet.text.length,
            provider: tweet.provider,
            hasImage: !!imagePath,
        });

        console.log('\n🔥 controversy deployed. replies incoming.');
    } catch (error) {
        console.error(`❌ Post failed: ${error.message}`);
        if (error.data) console.error(JSON.stringify(error.data, null, 2));
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('💀 Fatal error:', err.message);
    process.exit(1);
});

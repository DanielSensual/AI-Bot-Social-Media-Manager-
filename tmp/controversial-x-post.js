#!/usr/bin/env node
/**
 * One-shot: Generate controversial image via Grok + post to X
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TwitterApi } from 'twitter-api-v2';

dotenv.config();

const GROK_API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
const IMAGE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.image-cache');

// ── The controversial tweet ─────────────────────────────────────────────
const tweetText = `The uncomfortable truth about Webflow, Wix, and Squarespace:

You're paying for the illusion of ownership.
You're locked into their ecosystem.
You have zero competitive advantage.

Custom code > drag-and-drop.
Fight me. 👻`;

// ── Generate image with Grok ────────────────────────────────────────────
async function generateImage() {
    const prompt = `Aggressive, bold dark social media graphic. Pure black background with violent neon purple and electric cyan glitch effects. Massive broken chain links shattering apart, representing breaking free from website builder platforms. Abstract digital prison bars dissolving into code particles. Futuristic dystopian tech aesthetic. High contrast. Cinematic lighting. No text. No words. No letters. Premium quality, provocative energy.`;

    console.log('🎨 Generating controversial image via Grok...');

    const response = await fetch('https://api.x.ai/v1/images/generations', {
        method: 'POST',
        signal: AbortSignal.timeout(60_000),
        headers: {
            'Authorization': `Bearer ${GROK_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'grok-imagine-image',
            prompt,
            n: 1,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Grok API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    const item = data.data[0];
    const base64 = item.b64_json || item.base64 || item.image_base64;
    const url = item.url || item.image_url;

    fs.mkdirSync(IMAGE_DIR, { recursive: true });
    const imagePath = path.join(IMAGE_DIR, `controversial-${Date.now()}.png`);

    if (base64) {
        fs.writeFileSync(imagePath, Buffer.from(base64, 'base64'));
    } else if (url) {
        const imgRes = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        fs.writeFileSync(imagePath, Buffer.from(await imgRes.arrayBuffer()));
    } else {
        throw new Error('Grok returned no image data');
    }

    console.log(`✅ Image generated: ${imagePath}`);
    return imagePath;
}

// ── Post to X ────────────────────────────────────────────────────────────
async function postToX(text, imagePath) {
    const client = new TwitterApi({
        appKey: process.env.X_CONSUMER_KEY,
        appSecret: process.env.X_CONSUMER_SECRET,
        accessToken: process.env.X_ACCESS_TOKEN,
        accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
    });

    console.log('📤 Uploading image to X...');
    const mediaId = await client.v1.uploadMedia(imagePath);
    console.log(`✅ Image uploaded: ${mediaId}`);

    console.log('📤 Posting tweet...');
    const tweet = await client.v2.tweet({
        text,
        media: { media_ids: [mediaId] },
    });

    console.log(`✅ Posted! Tweet ID: ${tweet.data.id}`);
    console.log(`🔗 https://x.com/Ghostaisystems/status/${tweet.data.id}`);
    return tweet;
}

// ── Main ─────────────────────────────────────────────────────────────────
const imagePath = '/Users/danielcastillo/Projects/Websites/Bots/ghostai-x-bot/.image-cache/controversial-1772807366300.png';
try {
    await postToX(tweetText, imagePath);
    console.log('\n🎉 Controversial X post is LIVE!');
} catch (err) {
    console.error('❌ Failed:', err.message);
    if (err.data) console.error(JSON.stringify(err.data, null, 2));
    process.exit(1);
}

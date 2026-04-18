#!/usr/bin/env node

/**
 * Generate a corporate headshot using Nano Banana Pro (gemini-3-pro-image-preview)
 * Takes an input image and transforms it into a professional corporate portrait
 */

import fs from 'fs';
import path from 'path';

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY || '';
const MODEL = 'gemini-3-pro-image-preview';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

const INPUT_IMAGE = process.argv[2];
const OUTPUT_PATH = process.argv[3] || './output_headshot.png';
const PROMPT = process.argv[4] || 'Transform this person into a professional corporate headshot. Keep the EXACT same person, same face, same features. Replace background with a clean, neutral dark grey studio gradient. The person should be wearing a tailored dark charcoal blazer over a black crew neck shirt. Professional studio lighting with soft key light. Tight crop to head and upper shoulders. Corporate executive portrait style, photorealistic, high-end editorial quality.';

async function main() {
    if (!INPUT_IMAGE) {
        console.error('Usage: node nano-banana-gen.js <input-image> [output-path] [prompt]');
        process.exit(1);
    }

    console.log(`\n🍌 Nano Banana Pro — Image Generation`);
    console.log(`   Model: ${MODEL}`);
    console.log(`   Input: ${INPUT_IMAGE}`);
    console.log(`   Output: ${OUTPUT_PATH}`);
    console.log(`   Prompt: ${PROMPT.substring(0, 80)}...`);
    console.log('');

    // Read and base64 encode the input image
    const imageBuffer = fs.readFileSync(INPUT_IMAGE);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = INPUT_IMAGE.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const body = {
        contents: [
            {
                parts: [
                    {
                        inlineData: {
                            mimeType,
                            data: base64Image,
                        },
                    },
                    {
                        text: PROMPT,
                    },
                ],
            },
        ],
        generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
        },
    };

    console.log('⏳ Generating with Nano Banana Pro...');
    const start = Date.now();

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const data = await response.json();
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);

        if (data.error) {
            console.error(`\n❌ API Error: ${data.error.message}`);
            console.error(JSON.stringify(data.error, null, 2));
            process.exit(1);
        }

        // Find the image part in the response
        const candidate = data.candidates?.[0];
        if (!candidate) {
            console.error('❌ No candidates in response');
            console.error(JSON.stringify(data, null, 2));
            process.exit(1);
        }

        const parts = candidate.content?.parts || [];
        let savedImage = false;

        for (const part of parts) {
            if (part.inlineData) {
                const imgBuffer = Buffer.from(part.inlineData.data, 'base64');
                const ext = part.inlineData.mimeType === 'image/png' ? '.png' : '.jpg';
                const finalPath = OUTPUT_PATH.replace(/\.\w+$/, ext);
                fs.writeFileSync(finalPath, imgBuffer);
                console.log(`\n✅ Image saved to: ${finalPath}`);
                console.log(`   Size: ${(imgBuffer.length / 1024).toFixed(0)} KB`);
                savedImage = true;
            }
            if (part.text) {
                console.log(`\n📝 Model notes: ${part.text}`);
            }
        }

        if (!savedImage) {
            console.error('❌ No image in response. Text response:');
            for (const part of parts) {
                if (part.text) console.log(part.text);
            }
        }

        // Usage
        const usage = data.usageMetadata || {};
        if (usage.promptTokenCount) {
            const inputCost = (usage.promptTokenCount / 1_000_000) * 2.00;
            const outputCost = (usage.candidatesTokenCount / 1_000_000) * 120.00;
            console.log(`\n📊 Usage: ${usage.promptTokenCount} in / ${usage.candidatesTokenCount} out`);
            console.log(`💰 Cost: $${(inputCost + outputCost).toFixed(4)}`);
        }
        console.log(`⏱️  Time: ${elapsed}s\n`);

    } catch (err) {
        console.error(`\n❌ Network error: ${err.message}`);
        process.exit(1);
    }
}

main();

/**
 * Test script for Grok Imagine (Image & Video)
 * Ensures API keys and endpoints are working correctly.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { generateImage } from '../src/image-generator.js';
import { generateVideo, generateVideoFromImage } from '../src/video-generator.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_OUTPUT_DIR = path.join(__dirname, '..', 'tmp', 'grok-tests');

// Ensure test directory exists
if (!fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
}

async function runTests() {
    console.log('🚀 Starting Grok Imagine API Tests...');
    console.log('═'.repeat(40));

    const XAI_API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
    if (!XAI_API_KEY) {
        console.error('❌ Error: XAI_API_KEY is not set in .env');
        process.exit(1);
    }

    try {
        // 1. Test Image Generation
        console.log('\n🎨 Phase 1: Testing Grok-2 Image Generation...');
        const imagePath = await generateImage('A futuristic neon-lit skyscraper in a digital rainstorm, cyberpunk style.', {
            style: 'cinematic'
        });

        const testImageDest = path.join(TEST_OUTPUT_DIR, `test-image-${Date.now()}.png`);
        fs.copyFileSync(imagePath, testImageDest);
        console.log(`✅ Image generated and saved to: ${testImageDest}`);

        // 2. Test Video Generation (Text-to-Video)
        console.log('\n🎬 Phase 2: Testing Grok Imagine Video (Text-to-Video)...');
        const videoPath = await generateVideo('A slow camera pan across a futuristic neon city during digital rain.', {
            provider: 'grok',
            duration: 5,
            aspectRatio: '16:9'
        });

        const testVideoDest = path.join(TEST_OUTPUT_DIR, `test-video-txt-${Date.now()}.mp4`);
        fs.copyFileSync(videoPath, testVideoDest);
        console.log(`✅ Text-to-Video generated and saved to: ${testVideoDest}`);

        // 3. Test Image-to-Video
        console.log('\n🎥 Phase 3: Testing Grok Imagine Video (Image-to-Video)...');
        const i2vPath = await generateVideoFromImage(imagePath, 'Make the rain fall move realistically and the neon signs flicker.', {
            provider: 'grok',
            duration: 5,
            aspectRatio: '16:9'
        });

        const testI2VDest = path.join(TEST_OUTPUT_DIR, `test-video-img-${Date.now()}.mp4`);
        fs.copyFileSync(i2vPath, testI2VDest);
        console.log(`✅ Image-to-Video generated and saved to: ${testI2VDest}`);

        console.log('\n✨ All Grok Imagine tests passed!');
        console.log(`Check your results in: ${TEST_OUTPUT_DIR}`);

    } catch (err) {
        console.error(`\n❌ Test failed: ${err.message}`);
        if (err.stack) console.error(err.stack);
        process.exit(1);
    }
}

runTests();

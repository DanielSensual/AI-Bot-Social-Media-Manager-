#!/usr/bin/env node

import dotenv from 'dotenv';
import { uploadToTempHost, postInstagramReel } from '../src/instagram-client.js';

dotenv.config();

const videoPath = '/Users/danielcastillo/Downloads/Post this one.MP4';
const caption = `Is AI really going to take all of our jobs? 🤖💼

Or is it just going to reduce the amount of people working those jobs?

We've heard this before — when automation came out for cars, they said the same thing.

The real question isn't IF it's happening... it's whether you're going to adapt or get left behind. 🧠⚡

What's your take? Drop it below 👇

#AI #Automation #FutureOfWork #Technology #ArtificialIntelligence #Innovation #GhostAI #BuildInPublic #TechDebate #Adapt`;

console.log('📤 Uploading video to temp host (85MB, may take a minute)...');
const videoUrl = await uploadToTempHost(videoPath);
console.log(`🔗 Video URL: ${videoUrl}`);

console.log('\n📤 Posting Reel to Instagram...');
const result = await postInstagramReel(caption, videoUrl);
console.log(`\n🎉 Done! Reel ID: ${result.id}`);

#!/usr/bin/env node
/**
 * Schedule a post to both X and LinkedIn at a specific time
 */

import dotenv from 'dotenv';
import { postTweet } from '../src/twitter-client.js';
import { postToLinkedIn } from '../src/linkedin-client.js';

dotenv.config();

const POST_CONTENT = `Just built a multi-platform social media bot in 45 minutes.

What agencies charge: $15,000 - $25,000
What it cost me: $5 in API credits

Features:
→ Automated X/Twitter posting (4x daily)
→ LinkedIn integration with OAuth
→ 20+ content templates
→ AI-powered content generation
→ 24/7 PM2 process management

The ROI on learning AI coding is insane.

If you're still paying agencies for automation that AI can build in an hour... we need to talk.

ghostaisystems.com

#AI #Automation #BuildInPublic`;

// Schedule time: 10 minutes from now
const SCHEDULE_DELAY_MS = 10 * 60 * 1000; // 10 minutes

async function main() {
    const now = new Date();
    const postTime = new Date(now.getTime() + SCHEDULE_DELAY_MS);

    console.log('');
    console.log('📅 Scheduling Post for X + LinkedIn');
    console.log('═'.repeat(50));
    console.log(`⏰ Current time: ${now.toLocaleTimeString()}`);
    console.log(`🎯 Post scheduled for: ${postTime.toLocaleTimeString()}`);
    console.log('');
    console.log('Post content:');
    console.log('─'.repeat(50));
    console.log(POST_CONTENT);
    console.log('─'.repeat(50));
    console.log(`Length: ${POST_CONTENT.length} chars`);
    console.log('');
    console.log('⏳ Waiting to post...');

    // Wait until scheduled time
    await new Promise(resolve => setTimeout(resolve, SCHEDULE_DELAY_MS));

    console.log('');
    console.log('🚀 Posting now!');
    console.log('');

    // Post to both platforms
    try {
        console.log('📤 Posting to X...');
        const xResult = await postTweet(POST_CONTENT);
        console.log(`✅ X post live: https://x.com/i/status/${xResult.id}`);
    } catch (error) {
        console.error('❌ X post failed:', error.message);
    }

    try {
        console.log('');
        console.log('📤 Posting to LinkedIn...');
        await postToLinkedIn(POST_CONTENT);
        console.log('✅ LinkedIn post live!');
    } catch (error) {
        console.error('❌ LinkedIn post failed:', error.message);
    }

    console.log('');
    console.log('🎉 Done! Check both platforms.');
}

main();

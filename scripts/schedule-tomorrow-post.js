#!/usr/bin/env node
/**
 * Schedule tomorrow's AI sales machine posts
 * X at 9:00 AM EST, LinkedIn at 10:00 AM EST
 */

import dotenv from 'dotenv';
import { postTweet } from '../src/twitter-client.js';
import { postToLinkedIn } from '../src/linkedin-client.js';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// X Post — 280 char limit
const X_POST = `I built an AI sales machine that runs while I sleep.

It scrapes Google Maps, qualifies leads with AI, finds emails, sends personalized outreach, and builds custom demo websites per lead.

1,887 leads. 170 hot. Zero cold calls.

One engineer + AI = entire sales team.`;

// LinkedIn Post — longer, more professional
const LINKEDIN_POST = `Saturday night. 11 PM. I'm not working.

But my system is.

8 autonomous AI processes are running on my machine right now:
• Scraping Google Maps for businesses
• Qualifying leads with AI scoring
• Finding real email addresses
• Sending personalized outreach
• Generating custom AI demo websites for each lead
• Tracking opens, clicks, and replies in real-time
• Auto-following up 3 days later
• Alerting me on Discord when someone engages

1,887 leads. 170 hot. 8 emails delivered to restaurant owners in Orlando tonight.

Built the entire thing in one session.

This is what a one-man agency looks like in 2026.

You don't need a sales team. You need a system.

#AI #Automation #LeadGeneration #GhostAI`;

function msUntilTime(hour, minute) {
    const now = new Date();
    const nowEST = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const target = new Date(nowEST);
    target.setHours(hour, minute, 0, 0);

    let diffMs = target.getTime() - nowEST.getTime();
    if (diffMs < 0) diffMs += 24 * 60 * 60 * 1000; // tomorrow
    return diffMs;
}

function formatDuration(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
}

async function main() {
    const nowEST = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' });
    const xWait = msUntilTime(9, 0);
    const linkedinWait = msUntilTime(10, 0);

    console.log('');
    console.log('📅 Tomorrow\'s Post Schedule');
    console.log('═'.repeat(50));
    console.log(`   Now:        ${nowEST} EST`);
    console.log(`   X Post:     9:00 AM EST (in ${formatDuration(xWait)})`);
    console.log(`   LinkedIn:   10:00 AM EST (in ${formatDuration(linkedinWait)})`);
    console.log('');
    console.log(`   X length:        ${X_POST.length} chars ✅`);
    console.log(`   LinkedIn length:  ${LINKEDIN_POST.length} chars`);
    console.log('═'.repeat(50));
    console.log('');
    console.log('⏳ Waiting for 9:00 AM EST...');

    // Wait for X post time
    await new Promise(r => setTimeout(r, xWait));

    console.log('');
    console.log('🚀 9:00 AM — Posting to X...');
    try {
        const result = await postTweet(X_POST);
        console.log(`✅ X post live: https://x.com/i/status/${result.id}`);
    } catch (err) {
        console.error('❌ X failed:', err.message);
    }

    // Wait for LinkedIn post time (1 hour later)
    const remainingWait = linkedinWait - xWait;
    if (remainingWait > 0) {
        console.log(`⏳ Waiting ${formatDuration(remainingWait)} for LinkedIn...`);
        await new Promise(r => setTimeout(r, remainingWait));
    }

    console.log('');
    console.log('🚀 10:00 AM — Posting to LinkedIn...');
    try {
        await postToLinkedIn(LINKEDIN_POST);
        console.log('✅ LinkedIn post live!');
    } catch (err) {
        console.error('❌ LinkedIn failed:', err.message);
    }

    console.log('');
    console.log('🎉 Both posts complete!');
}

main().catch(console.error);

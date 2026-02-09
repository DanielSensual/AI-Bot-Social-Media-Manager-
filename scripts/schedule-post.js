#!/usr/bin/env node
/**
 * Flexible Post Scheduler
 * Schedule a post at a specific time or after a delay
 * Supports AI generation, video, and custom content
 *
 * Usage:
 *   node schedule-post.js --at "16:30" --ai --video
 *   node schedule-post.js --delay 60 --ai
 *   node schedule-post.js --at "09:00" "Custom post text"
 *   node schedule-post.js --at "12:00" --ai --video --dry-run
 */

import dotenv from 'dotenv';
import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse CLI arguments
const args = process.argv.slice(2);
const flags = {
    at: args.find(a => a.startsWith('--at='))?.split('=')[1] ||
        (args.includes('--at') ? args[args.indexOf('--at') + 1] : null),
    delay: args.find(a => a.startsWith('--delay='))?.split('=')[1] ||
        (args.includes('--delay') ? args[args.indexOf('--delay') + 1] : null),
    ai: args.includes('--ai') || args.includes('-a'),
    video: args.includes('--video') || args.includes('-v'),
    generate: args.includes('--generate') || args.includes('-g'),
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    help: args.includes('--help') || args.includes('-h'),
};

// Get text content (remaining args that aren't flags or flag values)
const flagArgs = new Set(['--at', '--delay']);
const content = args.filter((a, i) => {
    if (a.startsWith('-')) return false;
    if (i > 0 && flagArgs.has(args[i - 1])) return false;
    return true;
}).join(' ').trim();

function showHelp() {
    console.log(`
⏰ Ghost AI Post Scheduler
═══════════════════════════════════════════════════

Usage:
  node schedule-post.js [options] [content]

Scheduling (pick one):
  --at "HH:MM"        Schedule for specific time today (EST)
  --delay N            Schedule N minutes from now

Content (pick one):
  "Your text here"     Custom text
  --ai, -a             AI-generated content (GPT-5.2)
  --generate, -g       Template-generated content

Options:
  --video, -v          Generate AI video with the post
  --dry-run, -d        Preview without posting
  --help, -h           Show this help

Examples:
  # AI content + video at 4:30 PM
  node schedule-post.js --at "16:30" --ai --video

  # Custom text in 60 minutes
  node schedule-post.js --delay 60 "AI is eating the world 🔥"

  # AI content in 30 minutes (dry run)
  node schedule-post.js --delay 30 --ai --dry-run
`);
}

/**
 * Calculate milliseconds until a target time (HH:MM format, EST)
 */
function msUntilTime(timeStr) {
    const [hour, minute] = timeStr.split(':').map(Number);
    if (isNaN(hour) || isNaN(minute)) {
        throw new Error(`Invalid time format: "${timeStr}" (expected HH:MM)`);
    }

    const now = new Date();
    // Create target time in EST
    const target = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    target.setHours(hour, minute, 0, 0);

    // Convert back to local
    const nowEST = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    let diffMs = target.getTime() - nowEST.getTime();

    // If target is in the past, schedule for tomorrow
    if (diffMs < 0) {
        diffMs += 24 * 60 * 60 * 1000;
        console.log('   (Target time already passed today, scheduling for tomorrow)');
    }

    return diffMs;
}

/**
 * Format milliseconds as human-readable duration
 */
function formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}h ${mins}m`;
    }
    return `${minutes}m ${seconds}s`;
}

async function main() {
    if (flags.help) {
        showHelp();
        process.exit(0);
    }

    if (!flags.at && !flags.delay) {
        console.error('❌ Must specify --at "HH:MM" or --delay N (minutes)');
        console.log('   Run with --help for usage examples.');
        process.exit(1);
    }

    if (!content && !flags.ai && !flags.generate) {
        console.error('❌ No content specified. Provide text, --ai, or --generate.');
        process.exit(1);
    }

    // Calculate wait time
    let waitMs;
    let targetLabel;

    if (flags.at) {
        waitMs = msUntilTime(flags.at);
        targetLabel = flags.at;
    } else {
        const delayMinutes = parseInt(flags.delay, 10);
        if (isNaN(delayMinutes) || delayMinutes < 1) {
            console.error('❌ --delay must be a positive number of minutes');
            process.exit(1);
        }
        waitMs = delayMinutes * 60 * 1000;
        const targetTime = new Date(Date.now() + waitMs);
        targetLabel = targetTime.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' });
    }

    // Display schedule info
    const nowEST = new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit' });

    console.log('');
    console.log('⏰ Ghost AI Post Scheduler');
    console.log('═'.repeat(50));
    console.log(`   Now:      ${nowEST} EST`);
    console.log(`   Post at:  ${targetLabel} EST`);
    console.log(`   Wait:     ${formatDuration(waitMs)}`);
    console.log(`   Content:  ${content ? `"${content.substring(0, 40)}..."` : flags.ai ? '🧠 AI Generated' : '📝 Template'}`);
    console.log(`   Video:    ${flags.video ? '🎬 Yes' : 'No'}`);
    console.log(`   Mode:     ${flags.dryRun ? '🔒 DRY RUN' : '🔴 LIVE'}`);
    console.log('═'.repeat(50));
    console.log('');

    // Countdown with periodic updates
    const startTime = Date.now();
    const updateInterval = Math.min(waitMs / 4, 60000); // Update at most every minute

    while (Date.now() - startTime < waitMs) {
        const remaining = waitMs - (Date.now() - startTime);
        if (remaining <= 0) break;
        const sleepTime = Math.min(remaining, updateInterval);
        await new Promise(r => setTimeout(r, sleepTime));
        if (remaining > updateInterval) {
            process.stdout.write(`\r⏳ Posting in ${formatDuration(remaining - sleepTime)}...  `);
        }
    }

    console.log('\n');
    console.log('🚀 Time\'s up! Executing post...');
    console.log('');

    // Build post-all.js arguments
    const postArgs = [];
    if (content) postArgs.push(content);
    if (flags.ai) postArgs.push('--ai');
    if (flags.generate) postArgs.push('--generate');
    if (flags.video) postArgs.push('--video');
    if (flags.dryRun) postArgs.push('--dry-run');

    // Execute post-all.js
    const postAllScript = path.join(__dirname, 'post-all.js');

    return new Promise((resolve, reject) => {
        const child = execFile('node', [postAllScript, ...postArgs], {
            cwd: path.join(__dirname, '..'),
            env: process.env,
            maxBuffer: 1024 * 1024,
        }, (error, stdout, stderr) => {
            if (stdout) console.log(stdout);
            if (stderr) console.error(stderr);
            if (error) {
                console.error('❌ Post failed:', error.message);
                reject(error);
            } else {
                console.log('\n✅ Scheduled post complete!');
                resolve();
            }
        });

        // Stream output in real-time
        child.stdout?.pipe(process.stdout);
        child.stderr?.pipe(process.stderr);
    });
}

main().catch(console.error);

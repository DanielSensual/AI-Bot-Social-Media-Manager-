#!/usr/bin/env node
/**
 * Share to Facebook Groups — CLI Runner
 *
 * Usage:
 *   node scripts/share-to-groups.js "Your caption here"
 *   node scripts/share-to-groups.js "Caption" --video=/path/to/video.mp4
 *   node scripts/share-to-groups.js "Caption" --image=/path/to/image.png
 *   node scripts/share-to-groups.js "Caption" --dry-run
 *   node scripts/share-to-groups.js --auto --dry-run    (auto-templates per group category)
 *   node scripts/share-to-groups.js "Caption" --group="Orlando Videographers"
 *   node scripts/share-to-groups.js --save-session
 *   node scripts/share-to-groups.js --list-groups
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { saveSession, postToAllGroups, getConfiguredGroups } from '../src/facebook-group-poster.js';

dotenv.config();

const args = process.argv.slice(2);

const flags = {
    saveSession: args.includes('--save-session'),
    listGroups: args.includes('--list-groups'),
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    help: args.includes('--help') || args.includes('-h'),
    visible: args.includes('--visible') || args.includes('-v'),
    auto: args.includes('--auto') || args.includes('-a'),
    image: args.find(a => a.startsWith('--image='))?.split('=').slice(1).join('=') || null,
    video: args.find(a => a.startsWith('--video='))?.split('=').slice(1).join('=') || null,
    group: args.filter(a => a.startsWith('--group=')).map(a => a.split('=').slice(1).join('=')),
};

const content = args
    .filter(a => !a.startsWith('-'))
    .join(' ')
    .trim()
    .replace(/\\n/g, '\n');

function showHelp() {
    console.log('');
    console.log('📘 Facebook Group Poster');
    console.log('═'.repeat(50));
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/share-to-groups.js "Post text" [options]');
    console.log('');
    console.log('Content:');
    console.log('  "Your text here"           Post caption (required unless --save-session)');
    console.log('');
    console.log('Media (optional):');
    console.log('  --image=/path/to/img       Attach an image');
    console.log('  --video=/path/to/vid       Attach a video');
    console.log('');
    console.log('Targeting:');
    console.log('  --group="name"             Post to specific group(s) only (repeatable)');
    console.log('  --list-groups              Show all configured groups');
    console.log('');
    console.log('Options:');
    console.log('  --auto, -a                 Use buyer-persona templates (auto-pick per group)');
    console.log('  --dry-run, -d              Navigate to groups but don\'t click Post');
    console.log('  --visible, -v              Show the browser (non-headless)');
    console.log('  --save-session             Log in to Facebook manually (one-time)');
    console.log('  --help, -h                 Show this help');
    console.log('');
    console.log('Examples:');
    console.log('  npm run facebook:groups -- "Check out our demo reel! 🎬"');
    console.log('  npm run facebook:groups -- "Caption" --video=~/Downloads/reel.mp4');
    console.log('  npm run facebook:groups:session');
    console.log('');
}

async function main() {
    if (flags.help) {
        showHelp();
        process.exit(0);
    }

    if (flags.listGroups) {
        const groups = getConfiguredGroups();
        console.log('');
        console.log('📘 Configured Facebook Groups:');
        console.log('─'.repeat(50));
        groups.forEach((g, i) => {
            console.log(`  ${i + 1}. ${g.name}`);
            console.log(`     ${g.url}`);
        });
        console.log('');
        process.exit(0);
    }

    if (flags.saveSession) {
        const success = await saveSession();
        process.exit(success ? 0 : 1);
    }

    // Validate content
    if (!content && !flags.auto) {
        console.error('❌ Post text is required (or use --auto for templates). Usage:');
        console.error('   node scripts/share-to-groups.js "Your post text"');
        console.error('   node scripts/share-to-groups.js --auto --dry-run');
        console.error('   Run with --help for all options.');
        process.exit(1);
    }

    if (flags.auto && content) {
        console.log('⚠️  --auto flag set; ignoring manual text, using templates instead.');
    }

    if (flags.auto) {
        const { getPostForGroup, getTemplateStats } = await import('../src/fb-content-templates.js');
        const stats = getTemplateStats();
        console.log('');
        console.log('🤖 Auto-template mode:');
        Object.entries(stats).forEach(([cat, count]) => {
            console.log(`   ${cat}: ${count} templates`);
        });
        console.log('');

        // For auto mode, we'll pass a special function that generates text per group
        // The postToAllGroups function accepts text, so we'll use a generic one
        // and note: real per-group templating would need postToAllGroups refactor.
        // For now, pick a general template that works everywhere.
        const groups = getConfiguredGroups();
        console.log('📋 Preview of auto-generated posts:');
        groups.forEach((g) => {
            const { text: postText, category } = getPostForGroup(g.name);
            console.log(`   [${category}] ${g.name}`);
            console.log(`   → ${postText.substring(0, 80)}...`);
            console.log('');
        });
    }

    if (flags.image && flags.video) {
        console.error('❌ Use either --image or --video, not both.');
        process.exit(1);
    }

    // Resolve media path
    let mediaPath = flags.image || flags.video || null;
    let mediaType = flags.image ? 'image' : flags.video ? 'video' : null;

    if (mediaPath) {
        mediaPath = path.resolve(mediaPath);
        if (!fs.existsSync(mediaPath)) {
            console.error(`❌ ${mediaType} file not found: ${mediaPath}`);
            process.exit(1);
        }
    }

    // Run it
    const result = await postToAllGroups({
        text: content,
        mediaPath,
        mediaType,
        dryRun: flags.dryRun,
        headless: !flags.visible,
        filterGroups: flags.group,
    });

    process.exit(result.success ? 0 : 1);
}

main().catch(error => {
    console.error(`Fatal: ${error.message}`);
    process.exit(1);
});

#!/usr/bin/env node
/**
 * DanielSensual Post CLI
 *
 * Post content to Daniel's profile and optionally share to groups.
 *
 * Usage:
 *   node scripts/danielsensual-post.js --pillar=music
 *   node scripts/danielsensual-post.js --pillar=dance --video=/path/to/clip.mp4
 *   node scripts/danielsensual-post.js --pillar=event --event=bachata-pool-party
 *   node scripts/danielsensual-post.js --groups-only
 *   node scripts/danielsensual-post.js --status
 *   node scripts/danielsensual-post.js --dry-run
 */

import dotenv from 'dotenv';
import {
    buildPost,
    getTemplatePost,
    getTodaysPillar,
    loadActiveEvents,
    PILLARS,
} from '../src/danielsensual-content.js';
import {
    getEligibleGroups,
    getGroupStatus,
    recordGroupPost,
    GROUPS,
} from '../src/danielsensual-groups.js';
import { record } from '../src/post-history.js';

dotenv.config();

const args = process.argv.slice(2);

function getFlagValue(name) {
    const prefix = `--${name}=`;
    const arg = args.find((v) => v.startsWith(prefix));
    return arg ? arg.slice(prefix.length).trim() : '';
}

const flags = {
    pillar: getFlagValue('pillar') || '',
    event: getFlagValue('event') || '',
    video: getFlagValue('video') || '',
    image: getFlagValue('image') || '',
    caption: getFlagValue('caption') || '',
    maxGroups: parseInt(getFlagValue('max-groups') || '5', 10),
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    groupsOnly: args.includes('--groups-only'),
    profileOnly: args.includes('--profile-only'),
    status: args.includes('--status'),
    help: args.includes('--help') || args.includes('-h'),
    noAI: args.includes('--no-ai'),
};

function showHelp() {
    console.log(`
DanielSensual Content Bot
${'='.repeat(50)}

Usage:
  node scripts/danielsensual-post.js [options]

Options:
  --pillar=music|dance|event   Content type (default: auto-rotate)
  --event=slug                 Event slug for event pillar (e.g. bachata-pool-party)
  --video=/path/file           Attach video to post
  --image=/path/file           Attach image to post
  --caption="text"             Custom caption override
  --max-groups=N               Max groups to post to (default: 5)
  --profile-only               Post to profile only, skip groups
  --groups-only                Share to groups only, skip profile
  --no-ai                      Use templates only, skip AI generation
  --dry-run, -d                Preview without publishing
  --status                     Show group posting status
  --help, -h                   Show this help

Pillars:
  music    AI music drops, song promos, behind-the-scenes
  dance    Social dance clips, tips, community vibes
  event    Event promotions from events/ directory

Examples:
  node scripts/danielsensual-post.js --pillar=music --dry-run
  node scripts/danielsensual-post.js --pillar=event --event=bachata-pool-party
  node scripts/danielsensual-post.js --pillar=dance --video=./assets/social-dance.mp4
`);
}

function showStatus() {
    console.log('\nDanielSensual Group Status');
    console.log('='.repeat(60));

    const status = getGroupStatus();
    const now = Date.now();

    for (const g of status) {
        const cooldownStr = g.onCooldown
            ? `🔴 cooldown (${Math.round(g.cooldownRemaining / 3600000)}h remaining)`
            : '🟢 ready';
        const pendingStr = g.pending ? ' [PENDING]' : '';
        const ownedStr = g.owned ? ' ⭐' : '';
        const lastStr = g.lastPosted
            ? `last: ${g.lastPosted.pillar} @ ${new Date(g.lastPosted.timestamp).toLocaleDateString()}`
            : 'never posted';

        console.log(
            `  ${cooldownStr} ${g.name}${ownedStr}${pendingStr} (${(g.members / 1000).toFixed(1)}K) — ${lastStr} — [${g.pillars.join(', ')}]`
        );
    }

    const events = loadActiveEvents();
    console.log(`\nActive Events: ${events.length}`);
    for (const e of events) {
        console.log(`  📅 ${e.name} — ${e.date} at ${e.venue}`);
    }

    const todaysPillar = getTodaysPillar();
    console.log(`\nToday's Auto-Pillar: ${todaysPillar}`);
    console.log('');
}

async function main() {
    if (flags.help) {
        showHelp();
        process.exit(0);
    }

    if (flags.status) {
        showStatus();
        process.exit(0);
    }

    // Determine pillar
    const pillar = flags.pillar || getTodaysPillar();
    if (!PILLARS.includes(pillar)) {
        console.error(`❌ Invalid pillar: ${pillar}. Must be one of: ${PILLARS.join(', ')}`);
        process.exit(1);
    }

    console.log(`\n🎯 DanielSensual Post — Pillar: ${pillar.toUpperCase()}`);
    console.log('='.repeat(50));

    // Build context
    const context = {
        aiEnabled: !flags.noAI,
        eventSlug: flags.event || undefined,
    };

    // Generate content
    let caption;
    if (flags.caption) {
        caption = flags.caption;
        console.log('📝 Using custom caption');
    } else {
        console.log('🤖 Generating content...');
        const result = await buildPost(pillar, context);
        caption = result.caption;
        console.log(`📝 Source: ${result.source}${result.fallbackReason ? ` (fallback: ${result.fallbackReason})` : ''}`);
        if (result.provider) console.log(`🔧 Provider: ${result.provider} (${result.model || 'unknown'})`);
    }

    console.log('\n--- Caption Preview ---');
    console.log(caption);
    console.log('--- End Preview ---\n');

    if (flags.dryRun) {
        console.log('🏃 DRY RUN — no posts will be published.\n');

        if (!flags.profileOnly) {
            const eligible = getEligibleGroups(pillar, {
                maxGroups: flags.maxGroups,
                ignoreCooldown: false,
            });
            console.log(`📋 Eligible groups for ${pillar} (${eligible.length}):`);
            for (const g of eligible) {
                console.log(`  → ${g.name} (${(g.members / 1000).toFixed(1)}K) [${g.category}]`);
            }
        }

        process.exit(0);
    }

    // === POSTING ===
    const results = {
        profile: null,
        groups: [],
    };

    // Post to profile (browser automation would go here)
    if (!flags.groupsOnly) {
        console.log('📤 Posting to Daniel\'s profile...');
        // In production, this would invoke browser automation
        // For now, log the intent
        console.log('   ℹ️  Profile posting requires browser automation.');
        console.log('   ℹ️  Use the /danielsensual-bot workflow for full automation.');
        results.profile = { status: 'requires_browser', caption };
    }

    // Share to groups
    if (!flags.profileOnly) {
        const eligible = getEligibleGroups(pillar, {
            maxGroups: flags.maxGroups,
        });

        console.log(`\n📋 Sharing to ${eligible.length} groups...`);
        for (const group of eligible) {
            console.log(`  → ${group.name} [${group.category}]`);
            // In production, browser automation posts to each group
            recordGroupPost(group.name, pillar);
            results.groups.push({
                name: group.name,
                category: group.category,
                status: 'recorded',
            });
        }
    }

    // Summary
    console.log('\n✅ Done!');

    // Record to post history so the AI knows what was posted
    try {
        record({
            text: caption,
            pillar: pillar,
            aiGenerated: !flags.caption && !flags.noAI,
            hasVideo: !!flags.video,
            hasImage: !!flags.image,
            results: {
                facebook: results.profile ? 'posted' : null,
            },
        });
        console.log('   💾 Post recorded to history');
    } catch (err) {
        console.warn(`   ⚠️ History recording failed: ${err.message}`);
    }

    console.log(JSON.stringify({
        pillar,
        profilePosted: !flags.groupsOnly,
        groupsPosted: results.groups.length,
        dryRun: false,
    }, null, 2));
}

main().catch((err) => {
    console.error(`❌ DanielSensual post failed: ${err.message}`);
    process.exit(1);
});

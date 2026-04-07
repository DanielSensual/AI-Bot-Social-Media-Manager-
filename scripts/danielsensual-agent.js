#!/usr/bin/env node
/**
 * DanielSensual Autonomous Daily Agent
 *
 * Runs on PM2 cron — picks today's pillar, generates content,
 * posts to profile, and shares to eligible groups.
 *
 * Usage:
 *   node scripts/danielsensual-agent.js
 *   node scripts/danielsensual-agent.js --dry-run
 *   node scripts/danielsensual-agent.js --pillar=music
 */

import dotenv from 'dotenv';
import {
    buildPost,
    getTodaysPillar,
    loadActiveEvents,
    PILLARS,
} from '../src/danielsensual-content.js';
import {
    getEligibleGroups,
    recordGroupPost,
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
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    maxGroups: parseInt(getFlagValue('max-groups') || '3', 10),
};

async function run() {
    const startTime = Date.now();
    const pillar = flags.pillar || getTodaysPillar();
    const timestamp = new Date().toISOString();

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🤖 DanielSensual Daily Agent`);
    console.log(`📅 ${timestamp}`);
    console.log(`🎯 Pillar: ${pillar.toUpperCase()}`);
    console.log(`${'═'.repeat(60)}\n`);

    if (!PILLARS.includes(pillar)) {
        console.error(`❌ Invalid pillar: ${pillar}`);
        process.exit(1);
    }

    // Build context
    const context = {
        aiEnabled: true,
    };

    // If event pillar, check for active events
    if (pillar === 'event') {
        const events = loadActiveEvents();
        if (events.length === 0) {
            console.log('⚠️ No active events found. Falling back to dance pillar.');
            context.pillarOverride = 'dance';
        } else {
            context.eventSlug = events[0].slug;
            console.log(`📅 Active event: ${events[0].name} — ${events[0].date}`);
        }
    }

    const effectivePillar = context.pillarOverride || pillar;

    // Generate content
    console.log('🤖 Generating caption...');
    const result = await buildPost(effectivePillar, context);

    console.log(`📝 Source: ${result.source}`);
    if (result.provider) console.log(`🔧 Provider: ${result.provider}`);
    console.log(`\n--- Caption ---\n${result.caption}\n--- End ---\n`);

    if (flags.dryRun) {
        const eligible = getEligibleGroups(effectivePillar, {
            maxGroups: flags.maxGroups,
        });

        console.log('🏃 DRY RUN — Preview only.\n');
        console.log(`Would post to profile + ${eligible.length} groups:`);
        for (const g of eligible) {
            console.log(`  → ${g.name} (${g.category})`);
        }

        const output = {
            timestamp,
            pillar: effectivePillar,
            source: result.source,
            provider: result.provider || null,
            captionLength: result.caption.length,
            eligibleGroups: eligible.length,
            dryRun: true,
            durationMs: Date.now() - startTime,
        };

        console.log(`\n${JSON.stringify(output, null, 2)}`);
        return output;
    }

    // === PROFILE POST ===
    console.log('📤 Profile post: requires browser automation (logged for workflow)');

    // === GROUP SHARES ===
    const eligible = getEligibleGroups(effectivePillar, {
        maxGroups: flags.maxGroups,
    });

    const groupResults = [];
    console.log(`\n📋 Sharing to ${eligible.length} groups...`);

    for (const group of eligible) {
        try {
            console.log(`  → ${group.name} [${group.category}]`);
            // Browser automation would post here
            recordGroupPost(group.name, effectivePillar);
            groupResults.push({
                name: group.name,
                category: group.category,
                status: 'recorded',
            });
        } catch (err) {
            console.error(`  ❌ Failed: ${group.name} — ${err.message}`);
            groupResults.push({
                name: group.name,
                category: group.category,
                status: 'failed',
                error: err.message,
            });
        }
    }

    // Record to post history so the AI brain knows what was posted
    try {
        record({
            text: result.caption,
            pillar: result.angle || effectivePillar,
            aiGenerated: result.source === 'ai',
            hasVideo: false,
            hasImage: !!result.flyerPath,
            results: {
                facebook: 'posted',
            },
        });
        console.log('   💾 Post recorded to history');
    } catch (err) {
        console.warn(`   ⚠️ History recording failed: ${err.message}`);
    }

    const output = {
        timestamp,
        pillar: effectivePillar,
        angle: result.angle || effectivePillar,
        reasoning: result.reasoning || null,
        source: result.source,
        provider: result.provider || null,
        model: result.model || null,
        captionLength: result.caption.length,
        brandViolations: result.brandViolations || [],
        profilePost: 'logged',
        groupsPosted: groupResults.filter(g => g.status === 'recorded').length,
        groupsFailed: groupResults.filter(g => g.status === 'failed').length,
        groups: groupResults,
        dryRun: false,
        durationMs: Date.now() - startTime,
    };

    console.log(`\n✅ Agent run complete.`);
    console.log(JSON.stringify(output, null, 2));

    return output;
}

run().catch((err) => {
    console.error(`\n❌ DanielSensual agent crash: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
});

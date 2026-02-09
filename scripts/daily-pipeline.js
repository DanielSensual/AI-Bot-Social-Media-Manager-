#!/usr/bin/env node

/**
 * Daily Pipeline Runner
 * Runs the full pipeline automatically: hunt configured niches → qualify → outreach hot leads
 * 
 * Usage:
 *   node scripts/daily-pipeline.js                    # Full auto run
 *   node scripts/daily-pipeline.js --dry-run          # Preview only
 *   node scripts/daily-pipeline.js --skip-hunt        # Just qualify + outreach
 */

import { hunt } from '../src/scraper.js';
import { qualifyBatch } from '../src/qualifier.js';
import { getLeadsByTier } from '../src/db.js';
import { generateEmail } from '../src/outreach.js';
import { sendBatch } from '../src/sender.js';
import { runFollowUps } from '../src/sequencer.js';
import { notifyDiscord } from '../src/alerts.js';
import { getStats } from '../src/db.js';
import { enrichEmails } from '../src/enricher.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipHunt = args.includes('--skip-hunt');

// Niches and cities to hunt — add more as you scale
const TARGETS = [
    { niche: 'restaurants', city: 'Orlando, FL' },
    { niche: 'hair salons', city: 'Orlando, FL' },
    { niche: 'dental offices', city: 'Orlando, FL' },
];

async function run() {
    const startTime = Date.now();
    console.log(`\n🚀 GhostAI Lead Hunter — Daily Pipeline`);
    console.log(`   Time: ${new Date().toLocaleString()}`);
    console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);
    console.log('═'.repeat(50));

    // ── Step 1: Hunt ──
    if (!skipHunt) {
        console.log('\n📍 STEP 1: Hunting new leads...\n');
        for (const target of TARGETS) {
            try {
                await hunt(target.niche, target.city);
            } catch (err) {
                console.error(`   ❌ ${target.niche} in ${target.city}: ${err.message}`);
            }
            await new Promise(r => setTimeout(r, 2000));
        }
    } else {
        console.log('\n⏭️  Skipping hunt (--skip-hunt)\n');
    }

    // ── Step 2: Qualify ──
    console.log('\n' + '═'.repeat(50));
    console.log('\n🧠 STEP 2: Qualifying unscored leads...\n');
    const qualifyResults = await qualifyBatch(30);

    // ── Step 2.5: Enrich Emails ──
    console.log('\n' + '═'.repeat(50));
    console.log('\n📧 STEP 2.5: Finding emails for qualified leads...\n');
    await enrichEmails({ limit: 50, aiSearch: false });

    // ── Step 3: Outreach to hot leads ──
    console.log('\n' + '═'.repeat(50));
    console.log('\n📧 STEP 3: Outreach to hot leads...\n');

    const hotLeads = getLeadsByTier('hot', 20);
    if (hotLeads.length > 0) {
        const items = [];
        for (const lead of hotLeads) {
            try {
                const email = await generateEmail(lead, 'initial');
                items.push({ lead, subject: email.subject, body: email.body, type: 'initial' });
            } catch (err) {
                console.error(`   ❌ ${lead.business_name}: ${err.message}`);
            }
            await new Promise(r => setTimeout(r, 500));
        }

        if (items.length > 0) {
            await sendBatch(items, dryRun);
        }
    } else {
        console.log('   No new hot leads for outreach');
    }

    // ── Step 4: Follow-ups ──
    console.log('\n' + '═'.repeat(50));
    console.log('\n🔄 STEP 4: Running follow-ups...\n');
    await runFollowUps(dryRun);

    // ── Summary ──
    const stats = getStats();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    const summary = `
${'═'.repeat(50)}

✅ Daily Pipeline Complete — ${duration}s

📊 Pipeline Totals:
   Leads: ${stats.totalLeads} (🔥 ${stats.byTier.hot} hot, 🟡 ${stats.byTier.warm} warm)
   Outreach: ${stats.totalOutreach} total (${stats.todayOutreach} today)
   Status: ${stats.byStatus.contacted} contacted, ${stats.byStatus.replied} replied, ${stats.byStatus.booked} booked
`;

    console.log(summary);

    // Send Discord summary
    await notifyDiscord({
        title: '🎯 Lead Hunter — Daily Report',
        message: `Leads: ${stats.totalLeads} (🔥 ${stats.byTier.hot} hot) | Outreach today: ${stats.todayOutreach} | Booked: ${stats.byStatus.booked}`,
        color: 0x00ff88,
    });
}

run().catch(err => {
    console.error(`\n💀 Pipeline crashed: ${err.message}`);
    notifyDiscord({
        title: '❌ Lead Hunter Pipeline Error',
        message: err.message,
        color: 0xff0000,
    }).catch(() => { });
    process.exit(1);
});

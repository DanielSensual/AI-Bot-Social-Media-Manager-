#!/usr/bin/env node

/**
 * Outreach CLI — Generate and send personalized emails
 * Usage:
 *   npm run outreach -- --tier hot              # Send to hot leads
 *   npm run outreach -- --tier hot --dry-run    # Preview without sending
 *   npm run outreach -- --followup             # Send follow-ups
 *   npm run outreach -- --followup --dry-run   # Preview follow-ups
 */

import { getLeadsByTier } from '../src/db.js';
import { generateEmail } from '../src/outreach.js';
import { sendBatch } from '../src/sender.js';
import { runFollowUps } from '../src/sequencer.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

if (args.includes('--followup')) {
    // Run follow-up sequence
    try {
        await runFollowUps(dryRun);
    } catch (err) {
        console.error(`❌ Follow-up failed: ${err.message}`);
        process.exit(1);
    }
} else {
    // Initial outreach
    const tierIdx = args.indexOf('--tier');
    const tier = tierIdx !== -1 ? args[tierIdx + 1] : 'hot';
    const limitIdx = args.indexOf('--limit');
    const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 20;

    const leads = getLeadsByTier(tier, limit);

    if (leads.length === 0) {
        console.log(`✅ No ${tier} leads available for outreach`);
        process.exit(0);
    }

    console.log(`\n🎯 Generating emails for ${leads.length} ${tier} leads...\n`);

    const items = [];
    for (const lead of leads) {
        try {
            const email = await generateEmail(lead, 'initial');
            items.push({ lead, subject: email.subject, body: email.body, type: 'initial' });
            console.log(`  ✅ ${lead.business_name}`);
        } catch (err) {
            console.error(`  ❌ ${lead.business_name}: ${err.message}`);
        }

        // Rate limit AI calls
        await new Promise(r => setTimeout(r, 500));
    }

    if (items.length > 0) {
        await sendBatch(items, dryRun);
    }
}

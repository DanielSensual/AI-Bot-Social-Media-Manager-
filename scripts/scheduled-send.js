#!/usr/bin/env node

/**
 * Scheduled Send — Waits until a target time, then fires outreach
 * Usage: node scripts/scheduled-send.js "2026-02-09T10:00:00"
 */

import { getLeadsByTier } from '../src/db.js';
import { generateEmail } from '../src/outreach.js';
import { sendBatch } from '../src/sender.js';

const targetTime = process.argv[2];
if (!targetTime) {
    console.error('Usage: node scripts/scheduled-send.js "2026-02-09T10:00:00"');
    process.exit(1);
}

const target = new Date(targetTime);
const now = new Date();
const waitMs = target.getTime() - now.getTime();

if (waitMs <= 0) {
    console.log('⏰ Target time already passed — sending now');
} else {
    const hours = Math.floor(waitMs / 3600000);
    const mins = Math.floor((waitMs % 3600000) / 60000);
    console.log(`⏰ Scheduled for: ${target.toLocaleString()}`);
    console.log(`   Waiting ${hours}h ${mins}m...\n`);
    await new Promise(r => setTimeout(r, waitMs));
}

console.log(`\n🚀 It's go time — ${new Date().toLocaleString()}\n`);

// Get hot leads with emails
const leads = getLeadsByTier('hot', 22);
const withEmails = leads.filter(l => l.email);

console.log(`🎯 ${withEmails.length} hot leads with emails\n`);

const items = [];
for (const lead of withEmails) {
    try {
        const email = await generateEmail(lead, 'initial');
        items.push({ lead, subject: email.subject, body: email.body, type: 'initial' });
        console.log(`  ✅ ${lead.business_name}`);
    } catch (err) {
        console.error(`  ❌ ${lead.business_name}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 500));
}

if (items.length > 0) {
    await sendBatch(items, false); // LIVE SEND
}

console.log('\n✅ Scheduled outreach complete');

#!/usr/bin/env node

/**
 * Status CLI — View pipeline dashboard in terminal
 * Usage: npm run status
 */

import { getStats, getCampaigns, getDb } from '../src/db.js';

const stats = getStats();
const campaigns = getCampaigns();

console.log(`
╔══════════════════════════════════════════════╗
║         👻 GhostAI Lead Hunter              ║
╚══════════════════════════════════════════════╝
`);

// Pipeline overview
console.log('📊 Pipeline Overview');
console.log(`   Total leads: ${stats.totalLeads}`);
console.log(`   Emails sent: ${stats.totalOutreach} (${stats.todayOutreach} today)\n`);

// Lead tiers
console.log('🎯 Lead Quality');
console.log(`   🔥 Hot:      ${stats.byTier.hot}`);
console.log(`   🟡 Warm:     ${stats.byTier.warm}`);
console.log(`   🧊 Cold:     ${stats.byTier.cold}`);
console.log(`   ❓ Unscored: ${stats.byTier.unscored}\n`);

// Status
console.log('📬 Outreach Status');
console.log(`   📝 New:       ${stats.byStatus.new}`);
console.log(`   ✉️  Contacted: ${stats.byStatus.contacted}`);
console.log(`   💬 Replied:   ${stats.byStatus.replied}`);
console.log(`   📅 Booked:    ${stats.byStatus.booked}\n`);

// Campaigns
if (campaigns.length > 0) {
    console.log('🗂️  Campaigns');
    for (const c of campaigns.slice(0, 10)) {
        console.log(`   [#${c.id}] ${c.niche} — ${c.city} (${c.leads_found} leads)`);
    }
    console.log('');
}

// Hot leads ready for outreach
const db = getDb();
const hotReady = db.prepare(
    "SELECT business_name, city, ai_score, website FROM leads WHERE tier = 'hot' AND status = 'new' LIMIT 5"
).all();

if (hotReady.length > 0) {
    console.log('🔥 Hot Leads Ready for Outreach');
    for (const lead of hotReady) {
        const site = lead.website ? '🌐' : '❌ no site';
        console.log(`   [${lead.ai_score}] ${lead.business_name} — ${lead.city} ${site}`);
    }
    console.log('');
    console.log('👉 Run: npm run outreach -- --tier hot --dry-run');
}

console.log('');

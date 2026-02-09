#!/usr/bin/env node

/**
 * Sync pipeline stats to the GhostAI website dashboard
 * Usage: npm run sync
 */

import { getDb } from '../src/db.js';
import config from '../src/config.js';

const WEBSITE_URL = process.env.WEBSITE_URL || 'https://ghostaisystems.com';
const SYNC_TOKEN = process.env.LEAD_HUNTER_SECRET || process.env.DASHBOARD_SECRET || 'ghostai-dev-token';

function gatherStats() {
    const db = getDb();

    const totalLeads = db.prepare('SELECT COUNT(*) as c FROM leads').get().c;
    const hotLeads = db.prepare("SELECT COUNT(*) as c FROM leads WHERE tier = 'hot'").get().c;
    const warmLeads = db.prepare("SELECT COUNT(*) as c FROM leads WHERE tier = 'warm'").get().c;
    const withEmail = db.prepare('SELECT COUNT(*) as c FROM leads WHERE email IS NOT NULL').get().c;
    const contacted = db.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'contacted'").get().c;
    const replied = db.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'replied'").get().c;
    const booked = db.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'booked'").get().c;

    const totalOutreach = db.prepare('SELECT COUNT(*) as c FROM outreach_log').get().c;

    const today = new Date().toISOString().split('T')[0];
    const todayOutreach = db.prepare("SELECT COUNT(*) as c FROM outreach_log WHERE sent_at >= ?").get(today).c;

    // Campaigns
    const campaigns = db.prepare(
        "SELECT niche, city, COUNT(*) as count FROM campaigns GROUP BY niche, city ORDER BY count DESC LIMIT 15"
    ).all();

    // Top leads
    const topLeads = db.prepare(
        "SELECT business_name as name, ai_score as score, city, email, status FROM leads WHERE tier = 'hot' ORDER BY ai_score DESC LIMIT 15"
    ).all();

    return {
        pipeline: { totalLeads, hotLeads, warmLeads, withEmail, contacted, replied, booked, totalOutreach, todayOutreach },
        campaigns,
        topLeads,
    };
}

async function sync() {
    const stats = gatherStats();

    console.log(`\n📊 Pipeline Stats:`);
    console.log(`   Leads: ${stats.pipeline.totalLeads} total, ${stats.pipeline.hotLeads} hot, ${stats.pipeline.withEmail} with email`);
    console.log(`   Outreach: ${stats.pipeline.totalOutreach} sent, ${stats.pipeline.replied} replies`);

    try {
        const res = await fetch(`${WEBSITE_URL}/api/lead-pipeline`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SYNC_TOKEN}`,
            },
            body: JSON.stringify(stats),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        console.log(`\n✅ Synced to ${WEBSITE_URL} at ${data.synced}`);
    } catch (err) {
        console.error(`\n❌ Sync failed: ${err.message}`);
        console.log('   Stats gathered successfully — website may be offline');
    }
}

sync();

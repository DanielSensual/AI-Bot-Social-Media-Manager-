#!/usr/bin/env node
/**
 * Bachata After Dark — Orlando-Only Targeted Post
 * June 24 event at Eola Lounge. V2 Flyer.
 * Only hits Orlando/Central FL groups OFF cooldown.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { shareToAllGroups } from '../src/danielsensual-sharer.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════
// ORLANDO-ONLY TARGET LIST (ranked by relevance)
// Batch 1 groups on 24h cooldown (shared 9am today) — SKIP
// Batch 2 & 3 Orlando groups — FIRE NOW
// ═══════════════════════════════════════════════════════════════

const ORLANDO_TARGETS = [
    // TIER 1: Orlando-specific (highest value)
    { name: 'Central Florida Dancers', url: 'https://www.facebook.com/groups/353627944993366/' },
    { name: 'Central Florida Latin Dance', url: 'https://www.facebook.com/groups/260857457342351/' },
    { name: 'Orlando Latin Nights', url: 'https://www.facebook.com/groups/1438496766396638/' },
    { name: 'Salsa Orlando - LatinDanceCalendar.com', url: 'https://www.facebook.com/groups/1386797094934361/' },
    { name: 'Kizomba meets Bachata (#KmB) in Orlando', url: 'https://www.facebook.com/groups/1734954860051839/' },

    // TIER 2: Florida-wide (dancers may drive to Orlando)
    { name: 'Salsa & Bachata Nights South Florida', url: 'https://www.facebook.com/groups/1975440802491980/' },
];

const IMAGE_PATH = '/Users/danielcastillo/Downloads/Bachata After Dark Promo Content/Tonights_flyer.png';
const POST_URL = 'https://danielsensual.com/bachata';

const dryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');
const sendFlag = process.argv.includes('--send');

if (!sendFlag && !dryRun) {
    console.log('');
    console.log('🎯 Bachata After Dark — Orlando Targeted Post');
    console.log('═'.repeat(55));
    console.log(`   Flyer:   bachata-june24-flyer-v2.png`);
    console.log(`   Groups:  ${ORLANDO_TARGETS.length} Orlando/FL targets`);
    console.log(`   Event:   Wed June 24, Eola Lounge, 9PM`);
    console.log('');
    console.log('   Run with --dry-run to preview');
    console.log('   Run with --send to POST LIVE');
    console.log('');
    process.exit(0);
}

console.log('');
console.log(`🎯 Bachata After Dark — Orlando Targeted ${dryRun ? '(DRY RUN)' : '🔴 LIVE'}`);
console.log('═'.repeat(55));
console.log(`   🖼️  Flyer: bachata-june24-flyer-v2.png`);
console.log(`   📍 Event: Wed June 24, Eola Lounge, 9PM`);
console.log(`   ⚽ FIFA: Czechia vs Mexico on screen`);
console.log(`   🎯 Groups: ${ORLANDO_TARGETS.length} Orlando/FL only`);
ORLANDO_TARGETS.forEach((g, i) => console.log(`      ${i+1}. ${g.name}`));
console.log('');

const promotedEvent = {
    title: 'Bachata After Dark',
    venue: 'Eola Lounge',
    address: '100 S Eola Dr, Ste 104',
    city: 'Orlando',
    day: 'Wednesday',
    date: 'June 24',
    time: '9 PM',
    price: 'Free before 9 PM / $10 after',
    description: 'Free bachata class at 9 PM by Daniel Sensual. Social dancing until midnight. FIFA World Cup on screen — Czechia vs Mexico at 9 PM!',
    pageUrl: POST_URL,
    isToday: true,
    isTomorrow: false,
};

const result = await shareToAllGroups({
    postUrl: POST_URL,
    groups: ORLANDO_TARGETS,
    batch: 0,
    batchSize: ORLANDO_TARGETS.length,
    dryRun,
    headless: true,
    imagePath: IMAGE_PATH,
    promotedEvent,
    identityMode: 'page',
    botLabel: 'Daniel Sensual',
    entryScript: 'scripts/bachata-orlando-push.js',
    loginCommand: 'node scripts/danielsensual-share.js --login',
});

process.exit(result.success ? 0 : 1);

#!/usr/bin/env node

/**
 * Blitz Hunt — Scrape leads across multiple cities at once
 * Usage:
 *   npm run blitz                    # Hunt all configured targets
 *   npm run blitz -- --state FL      # Hunt all Florida cities
 *   npm run blitz -- --enrich        # Also run email enrichment after
 */

import { hunt } from '../src/scraper.js';
import { qualifyBatch } from '../src/qualifier.js';
import { enrichEmails } from '../src/enricher.js';

const args = process.argv.slice(2);
const doEnrich = args.includes('--enrich');

// ═══════════════════════════════════════════════
//  TARGET CONFIGURATION — ADD YOUR CITIES HERE
// ═══════════════════════════════════════════════

const FLORIDA_TARGETS = [
    // High-value niches
    'restaurants', 'dental offices', 'med spas', 'hair salons',
    'auto detailing', 'HVAC companies', 'plumbers', 'real estate agencies',
    'law firms', 'chiropractors',
];

const FLORIDA_CITIES = [
    'Orlando, FL',
    'Miami, FL',
    'Tampa, FL',
    'Jacksonville, FL',
    'Fort Lauderdale, FL',
    'St. Petersburg, FL',
    'Boca Raton, FL',
    'Naples, FL',
    'Sarasota, FL',
    'West Palm Beach, FL',
];

// Build target matrix — for blitz, we do top 3 niches × all cities
const TOP_NICHES = FLORIDA_TARGETS.slice(0, 3);

async function run() {
    const startTime = Date.now();
    const stateFilter = args.find((a, i) => args[i - 1] === '--state');
    const nicheFilter = args.find((a, i) => args[i - 1] === '--niche');
    const cityFilter = args.find((a, i) => args[i - 1] === '--city');

    let cities = FLORIDA_CITIES;
    let niches = TOP_NICHES;

    if (cityFilter) cities = [cityFilter];
    if (nicheFilter) niches = [nicheFilter];

    const totalHunts = niches.length * cities.length;

    console.log(`\n⚡ BLITZ HUNT — ${niches.length} niches × ${cities.length} cities = ${totalHunts} campaigns\n`);
    console.log(`   Niches: ${niches.join(', ')}`);
    console.log(`   Cities: ${cities.join(', ')}`);
    console.log('═'.repeat(60) + '\n');

    let totalLeads = 0;
    let completedHunts = 0;

    for (const niche of niches) {
        for (const city of cities) {
            completedHunts++;
            try {
                const result = await hunt(niche, city);
                totalLeads += result.leadsInserted;
                console.log(`   [${completedHunts}/${totalHunts}] ✅ ${result.leadsInserted} leads\n`);
            } catch (err) {
                console.error(`   [${completedHunts}/${totalHunts}] ❌ ${err.message}\n`);
            }

            // Rate limit between hunts (Google API)
            await new Promise(r => setTimeout(r, 3000));
        }
    }

    console.log('═'.repeat(60));
    console.log(`\n⚡ Blitz complete: ${totalLeads} new leads across ${completedHunts} campaigns`);

    // Auto-qualify
    console.log('\n🧠 Qualifying new leads...\n');
    await qualifyBatch(100);

    // Enrich if requested
    if (doEnrich) {
        console.log('\n📧 Enriching emails...\n');
        await enrichEmails({ limit: 100 });
    }

    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`\n✅ Total runtime: ${duration} minutes`);
}

run().catch(err => {
    console.error(`\n💀 Blitz failed: ${err.message}`);
    process.exit(1);
});

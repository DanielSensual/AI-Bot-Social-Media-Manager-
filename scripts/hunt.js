#!/usr/bin/env node

/**
 * Hunt CLI — Scrape businesses from Google Maps
 * Usage:
 *   npm run hunt -- --niche "restaurants" --city "Orlando, FL"
 *   npm run hunt -- --niche "hair salons" --city "Miami, FL"
 */

import { hunt } from '../src/scraper.js';

const args = process.argv.slice(2);

function getArg(name) {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 ? args[idx + 1] : null;
}

const niche = getArg('niche');
const city = getArg('city');

if (!niche || !city) {
    console.error('Usage: npm run hunt -- --niche "restaurants" --city "Orlando, FL"');
    process.exit(1);
}

try {
    const result = await hunt(niche, city);
    console.log(`\n📊 Summary: ${result.leadsInserted} leads added to campaign #${result.campaignId}`);
} catch (err) {
    console.error(`❌ Hunt failed: ${err.message}`);
    process.exit(1);
}

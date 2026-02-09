#!/usr/bin/env node

/**
 * Enrich CLI — Find emails for qualified leads
 * Usage:
 *   npm run enrich                    # Scrape + AI search
 *   npm run enrich -- --scrape-only   # Website scrape only (free)
 *   npm run enrich -- --limit 20      # Limit to 20 leads
 */

import { enrichEmails } from '../src/enricher.js';

const args = process.argv.slice(2);
const scrapeOnly = args.includes('--scrape-only');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 50;

try {
    await enrichEmails({ limit, aiSearch: !scrapeOnly });
} catch (err) {
    console.error(`❌ Enrichment failed: ${err.message}`);
    process.exit(1);
}

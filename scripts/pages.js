#!/usr/bin/env node

/**
 * Generate Landing Pages CLI
 * Usage:
 *   npm run pages              # Generate for top 5 hot leads
 *   npm run pages -- --limit 10 # Top 10
 *   npm run pages -- --all      # All hot leads with emails
 */

import { generateBatch } from '../src/landing-gen.js';

const args = process.argv.slice(2);
const all = args.includes('--all');
const limitIdx = args.indexOf('--limit');
const limit = all ? 100 : (limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 5);

try {
    const results = await generateBatch(limit);
    if (results.length > 0) {
        console.log(`\n📁 Pages saved to ./landing-pages/`);
        console.log(`   Open any .html file in a browser to preview`);
    }
} catch (err) {
    console.error(`❌ Failed: ${err.message}`);
    process.exit(1);
}

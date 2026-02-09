#!/usr/bin/env node

/**
 * Qualify CLI — AI-score all unscored leads
 * Usage:
 *   npm run qualify
 *   npm run qualify -- --limit 20
 */

import { qualifyBatch } from '../src/qualifier.js';

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 50;

try {
    await qualifyBatch(limit);
} catch (err) {
    console.error(`❌ Qualification failed: ${err.message}`);
    process.exit(1);
}

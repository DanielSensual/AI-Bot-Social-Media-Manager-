#!/usr/bin/env node
/**
 * Bachata After Dark runner
 *
 * Usage:
 *   node scripts/bachata-afterdark.js --once             # run one cycle and exit (PM2 cron_restart mode)
 *   node scripts/bachata-afterdark.js --once --dry-run   # generate but don't publish
 *   node scripts/bachata-afterdark.js --once --pillar=carousel
 */

import dotenv from 'dotenv';
import { runAfterDarkCycle } from '../src/bachata-afterdark-agent.js';

dotenv.config({ quiet: true });

const args = process.argv.slice(2);
const flags = {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    pillar: (args.find((a) => a.startsWith('--pillar=')) || '').split('=')[1] || null,
};

if (process.env.BACHATA_AD_ENABLED === 'false') {
    console.log('Bachata After Dark agent disabled (BACHATA_AD_ENABLED=false) — exiting.');
    process.exit(0);
}

runAfterDarkCycle(flags)
    .then((result) => {
        console.log(`\nDone: ${JSON.stringify({ pillar: result.pillar, posted: result.posted ?? false, dryRun: result.dryRun ?? false, skipped: result.skipped ?? false })}`);
        process.exit(0);
    })
    .catch((error) => {
        console.error(`Fatal: ${error.message}`);
        process.exit(1);
    });

#!/usr/bin/env node

/**
 * Ghost AI Memory Consolidation — Nightly ETL
 * 
 * Consolidates short-term conversation buffers (SQLite) into
 * long-term semantic memory (Supabase pgvector).
 * 
 * Schedule: PM2 cron at 3am ET daily
 *   pm2 start scripts/consolidate-memory.js --name memory-consolidation \
 *     --cron "0 7 * * *" --no-autorestart
 * 
 * NOTE: cron is in UTC, so "0 7 * * *" = 3am ET (EDT)
 */

import dotenv from 'dotenv';
dotenv.config();

import { consolidate, isMemoryEnabled } from '../src/memory.js';

const BANNER = `
🧠 Ghost AI Memory Consolidation
══════════════════════════════════════════════════
`;

async function main() {
    console.log(BANNER);

    if (!isMemoryEnabled()) {
        console.log('⏭️  Memory is disabled (MEMORY_ENABLED != true). Exiting.');
        process.exit(0);
    }

    const olderThanHours = Number(process.argv[2]) || 24;
    console.log(`   Consolidating conversations older than ${olderThanHours} hours...\n`);

    const startTime = Date.now();

    try {
        const result = await consolidate(olderThanHours);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log(`══════════════════════════════════════════════════`);
        console.log(`✅ Consolidation complete in ${elapsed}s`);
        console.log(`   Threads processed: ${result.threadsProcessed}`);
        console.log(`   Memories created:  ${result.memoriesCreated}`);
    } catch (err) {
        console.error(`❌ Consolidation failed: ${err.message}`);
        process.exit(1);
    }
}

main();

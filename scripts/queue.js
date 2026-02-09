#!/usr/bin/env node

/**
 * Content Queue CLI
 * Manage the post queue: list, approve, reject, preview.
 *
 * Usage:
 *   node scripts/queue.js              # List queue status
 *   node scripts/queue.js --approve ID  # Approve a pending entry
 *   node scripts/queue.js --reject ID   # Reject a pending entry
 *   node scripts/queue.js --pending     # Show only pending entries
 *   node scripts/queue.js --cleanup     # Clean old entries
 */

import { listQueue, getPending, approve, reject, cleanup } from '../src/content-queue.js';

const args = process.argv.slice(2);

if (args.includes('--approve') || args.includes('-a')) {
    const idx = args.indexOf('--approve') !== -1 ? args.indexOf('--approve') : args.indexOf('-a');
    const id = args[idx + 1];
    if (!id) {
        console.error('❌ Provide an entry ID: --approve <id>');
        process.exit(1);
    }
    const ok = approve(id);
    process.exit(ok ? 0 : 1);

} else if (args.includes('--reject') || args.includes('-r')) {
    const idx = args.indexOf('--reject') !== -1 ? args.indexOf('--reject') : args.indexOf('-r');
    const id = args[idx + 1];
    if (!id) {
        console.error('❌ Provide an entry ID: --reject <id>');
        process.exit(1);
    }
    const ok = reject(id);
    process.exit(ok ? 0 : 1);

} else if (args.includes('--cleanup')) {
    cleanup(7);

} else if (args.includes('--pending') || args.includes('-p')) {
    const pending = getPending();
    if (pending.length === 0) {
        console.log('✅ No pending entries');
    } else {
        console.log(`\n📋 ${pending.length} pending entries:\n`);
        for (const entry of pending) {
            console.log(`  [${entry.id}] ${entry.pillar.toUpperCase()}`);
            console.log(`    "${entry.text.substring(0, 80)}..."`);
            console.log(`    Created: ${entry.createdAt}\n`);
        }
    }

} else {
    // Default: show queue summary
    const summary = listQueue();
    console.log('\n📊 Content Queue Status\n');
    console.log(`  Total entries: ${summary.total}`);
    console.log(`  ⏳ Pending:  ${summary.byStatus.pending}`);
    console.log(`  ✅ Approved: ${summary.byStatus.approved}`);
    console.log(`  📤 Posted:   ${summary.byStatus.posted}`);
    console.log(`  ❌ Rejected: ${summary.byStatus.rejected}`);

    if (summary.entries.length > 0) {
        console.log('\n  Recent entries:');
        for (const entry of summary.entries.slice(-5)) {
            const status = { pending: '⏳', approved: '✅', posted: '📤', rejected: '❌' }[entry.status] || '?';
            console.log(`    ${status} [${entry.id}] ${entry.pillar} — "${entry.text.substring(0, 50)}..."`);
        }
    }
    console.log('');
}

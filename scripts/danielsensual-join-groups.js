#!/usr/bin/env node
/**
 * Daniel Sensual — Facebook Group Joiner CLI
 *
 * Joins Facebook groups that the Daniel Sensual account is not yet a member of.
 * Uses the same Chrome profile as the sharer bot.
 *
 * Usage:
 *   node scripts/danielsensual-join-groups.js                  # Join all unjoined groups
 *   node scripts/danielsensual-join-groups.js --dry-run        # Audit only — don't click Join
 *   node scripts/danielsensual-join-groups.js --status         # Alias for --dry-run
 *   node scripts/danielsensual-join-groups.js --max=5          # Limit to 5 groups
 *   node scripts/danielsensual-join-groups.js --batch=2        # Only batch 2 groups
 *   node scripts/danielsensual-join-groups.js --force          # Override lockfile
 *   node scripts/danielsensual-join-groups.js --help           # Show usage
 */

import dotenv from 'dotenv';
import { SHARE_GROUPS, GROUPS } from '../src/danielsensual-groups.js';
import {
    joinUnregisteredGroups,
    acquireLock,
} from '../src/danielsensual-group-joiner.js';

dotenv.config();

const args = process.argv.slice(2);

function getFlag(name) {
    const prefix = `--${name}=`;
    const arg = args.find((v) => v.startsWith(prefix));
    return arg ? arg.slice(prefix.length).trim() : '';
}

const flags = {
    help: args.includes('--help') || args.includes('-h'),
    dryRun: args.includes('--dry-run') || args.includes('-d') || args.includes('--status'),
    force: args.includes('--force'),
    batch: parseInt(getFlag('batch') || '0', 10),
    max: parseInt(getFlag('max') || '0', 10),
    source: getFlag('source') || 'all', // 'share', 'daily', 'all'
};

// ─── Help ────────────────────────────────────────────────────────

function showHelp() {
    console.log('');
    console.log('🔗 Daniel Sensual — Facebook Group Joiner');
    console.log('═'.repeat(55));
    console.log('');
    console.log('Usage:');
    console.log('  (no flags)              Join all unjoined groups');
    console.log('  --dry-run / --status    Audit membership status only');
    console.log('  --max=N                 Limit to N groups');
    console.log('  --batch=N               Only process batch N groups');
    console.log('  --source=share|daily|all  Which group list to use (default: all)');
    console.log('  --force                 Override lockfile');
    console.log('  --help                  Show this help');
    console.log('');
    console.log('Examples:');
    console.log('  # Audit all groups (no joining):');
    console.log('  node scripts/danielsensual-join-groups.js --dry-run');
    console.log('');
    console.log('  # Join first 5 unjoined groups:');
    console.log('  node scripts/danielsensual-join-groups.js --max=5');
    console.log('');
    console.log('  # Join batch 3 share groups only:');
    console.log('  node scripts/danielsensual-join-groups.js --batch=3 --source=share');
    console.log('');
}

// ─── Build group list ────────────────────────────────────────────

function buildGroupList() {
    const allGroups = [];
    const seen = new Set();

    function addGroups(list, source) {
        for (const g of list) {
            const key = g.url.replace(/\/$/, '').toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            allGroups.push({
                name: g.name,
                url: g.url,
                batch: g.batch || null,
                source,
            });
        }
    }

    if (flags.source === 'share' || flags.source === 'all') {
        addGroups(SHARE_GROUPS, 'share');
    }
    if (flags.source === 'daily' || flags.source === 'all') {
        addGroups(GROUPS, 'daily');
    }

    return allGroups;
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
    if (flags.help) {
        showHelp();
        return;
    }

    // Acquire lock
    if (!flags.dryRun && !acquireLock(flags.force)) {
        process.exit(0);
    }

    const groups = buildGroupList();

    console.log(`📋 ${groups.length} unique groups loaded from ${flags.source} list(s)`);

    const result = await joinUnregisteredGroups({
        groups,
        dryRun: flags.dryRun,
        headless: true,
        max: flags.max,
        batch: flags.batch,
    });

    process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
    console.error(`\n❌ Fatal: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
});

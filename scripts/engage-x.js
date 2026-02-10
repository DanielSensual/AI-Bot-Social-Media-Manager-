#!/usr/bin/env node
/**
 * X Outbound Engagement CLI
 * Find trending tweets and reply to build visibility
 *
 * Usage:
 *   node scripts/engage-x.js                 # Live, 8 replies
 *   node scripts/engage-x.js --dry-run       # Preview only
 *   node scripts/engage-x.js --limit=5       # Custom limit
 *   node scripts/engage-x.js --limit 5       # Custom limit (space form)
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import { runOutboundEngagement } from '../src/twitter-engagement.js';
import { normalizeLimit } from '../src/twitter-engagement-utils.js';

const LIMIT_DEFAULTS = {
    defaultValue: 8,
    min: 1,
    max: 25,
};

export const ENGAGE_X_USAGE = `Usage:
  node scripts/engage-x.js [options]

Options:
  -d, --dry-run          Preview actions without posting replies
  --limit=<n>            Max replies (clamped 1-25, default 8)
  --limit <n>            Max replies (space form)
  -h, --help             Show help`; 

function createUsageError(message) {
    const error = new Error(message);
    error.code = 'ERR_USAGE';
    return error;
}

export function parseEngageArgs(argv = []) {
    let dryRun = false;
    let limitRaw;

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];

        if (arg === '--dry-run' || arg === '-d') {
            dryRun = true;
            continue;
        }

        if (arg === '--help' || arg === '-h') {
            return {
                dryRun,
                limit: LIMIT_DEFAULTS.defaultValue,
                help: true,
            };
        }

        if (arg.startsWith('--limit=')) {
            limitRaw = arg.slice('--limit='.length);
            continue;
        }

        if (arg === '--limit') {
            const next = argv[i + 1];
            if (next === undefined || next.startsWith('-')) {
                throw createUsageError('Missing value for --limit.');
            }

            limitRaw = next;
            i += 1;
            continue;
        }

        throw createUsageError(`Unknown argument: ${arg}`);
    }

    let limit;
    try {
        limit = normalizeLimit(limitRaw, LIMIT_DEFAULTS);
    } catch (error) {
        throw createUsageError(error.message);
    }

    return {
        dryRun,
        limit,
        help: false,
    };
}

export async function main(argv = process.argv.slice(2)) {
    let parsed;

    try {
        parsed = parseEngageArgs(argv);
    } catch (error) {
        console.error(`❌ ${error.message}`);
        console.error('');
        console.error(ENGAGE_X_USAGE);
        return 1;
    }

    if (parsed.help) {
        console.log(ENGAGE_X_USAGE);
        return 0;
    }

    try {
        const result = await runOutboundEngagement({
            dryRun: parsed.dryRun,
            limit: parsed.limit,
        });

        console.log('');
        if (result.engaged > 0) {
            console.log(`🎯 ${result.engaged} outbound engagement(s) posted on X`);
        }
        return 0;
    } catch (error) {
        console.error('❌ Fatal:', error.message);
        return 1;
    }
}

const isDirectRun = Boolean(process.argv[1])
    && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
    main().then(code => process.exit(code));
}

export default {
    parseEngageArgs,
    main,
};

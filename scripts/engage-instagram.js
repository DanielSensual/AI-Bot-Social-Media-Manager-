#!/usr/bin/env node
/**
 * Instagram Outbound Engagement CLI
 *
 * Usage:
 *   node scripts/engage-instagram.js
 *   node scripts/engage-instagram.js --limit=20
 *   node scripts/engage-instagram.js --dry-run
 *   node scripts/engage-instagram.js --headful --manual-login
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import { runInstagramOutboundEngagement } from '../src/instagram-engagement.js';
import { normalizeLimit } from '../src/twitter-engagement-utils.js';

const LIMIT_DEFAULTS = {
    defaultValue: 10,
    min: 1,
    max: 30,
};

export const ENGAGE_INSTAGRAM_USAGE = `Usage:
  node scripts/engage-instagram.js [options]

Options:
  -d, --dry-run          Preview actions without posting comments
  --limit=<n>            Max comments (clamped 1-30, default 10)
  --limit <n>            Max comments (space form)
  --headful              Run browser in visible mode
  --manual-login         Wait for manual Instagram login in headful mode
  -h, --help             Show help`;

function createUsageError(message) {
    const error = new Error(message);
    error.code = 'ERR_USAGE';
    return error;
}

export function parseEngageInstagramArgs(argv = []) {
    let dryRun = false;
    let limitRaw;
    let headful = false;
    let manualLogin = false;

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];

        if (arg === '--dry-run' || arg === '-d') {
            dryRun = true;
            continue;
        }

        if (arg === '--headful') {
            headful = true;
            continue;
        }

        if (arg === '--manual-login') {
            manualLogin = true;
            continue;
        }

        if (arg === '--help' || arg === '-h') {
            return {
                dryRun,
                limit: LIMIT_DEFAULTS.defaultValue,
                headful,
                manualLogin,
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

    if (manualLogin && !headful) {
        throw createUsageError('--manual-login requires --headful.');
    }

    return {
        dryRun,
        limit,
        headful,
        manualLogin,
        help: false,
    };
}

export async function main(argv = process.argv.slice(2)) {
    let parsed;

    try {
        parsed = parseEngageInstagramArgs(argv);
    } catch (error) {
        console.error(`❌ ${error.message}`);
        console.error('');
        console.error(ENGAGE_INSTAGRAM_USAGE);
        return 1;
    }

    if (parsed.help) {
        console.log(ENGAGE_INSTAGRAM_USAGE);
        return 0;
    }

    try {
        const result = await runInstagramOutboundEngagement({
            dryRun: parsed.dryRun,
            limit: parsed.limit,
            headless: !parsed.headful,
            manualLogin: parsed.manualLogin,
        });

        console.log('');
        if (result.engaged > 0) {
            console.log(`🎯 ${result.engaged} outbound engagement(s) posted on Instagram`);
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
    parseEngageInstagramArgs,
    main,
};

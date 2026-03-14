#!/usr/bin/env node
/**
 * X Outbound Engagement Range CLI
 * Runs outbound X engagement targeting a range of comments.
 *
 * Usage:
 *   node scripts/engage-x-range.js                 # Live, random target between 14-20
 *   node scripts/engage-x-range.js --dry-run       # Preview only
 *   node scripts/engage-x-range.js --min=14 --max=20
 *   node scripts/engage-x-range.js --attempts=4
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import { runOutboundEngagement } from '../src/twitter-engagement.js';
import { normalizeLimit, sleep } from '../src/twitter-engagement-utils.js';

const LIMIT_BOUNDS = {
    min: 1,
    max: 25,
};

const RANGE_DEFAULTS = {
    min: 14,
    max: 20,
};

const ATTEMPT_DEFAULTS = {
    defaultValue: 3,
    min: 1,
    max: 10,
};

const INTER_ATTEMPT_DELAY_MS = 6000;

export const ENGAGE_X_RANGE_USAGE = `Usage:
  node scripts/engage-x-range.js [options]

Options:
  -d, --dry-run          Preview actions without posting replies
  --min=<n>              Minimum total comments (clamped 1-25, default 14)
  --min <n>              Minimum total comments (space form)
  --max=<n>              Maximum total comments (clamped 1-25, default 20)
  --max <n>              Maximum total comments (space form)
  --attempts=<n>         Max attempts to reach minimum (clamped 1-10, default 3)
  --attempts <n>         Max attempts to reach minimum (space form)
  -h, --help             Show help`;

function createUsageError(message) {
    const error = new Error(message);
    error.code = 'ERR_USAGE';
    return error;
}

function readFlagValue(argv, index, flagName) {
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('-')) {
        throw createUsageError(`Missing value for ${flagName}.`);
    }
    return next;
}

function asFiniteInteger(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || !Number.isInteger(num)) return null;
    return num;
}

function normalizeAttemptLimit(value) {
    const defaultValue = ATTEMPT_DEFAULTS.defaultValue;

    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }

    const parsed = asFiniteInteger(value);
    if (parsed === null) {
        throw new Error(`Invalid --attempts value "${value}". Expected an integer.`);
    }

    return Math.min(Math.max(parsed, ATTEMPT_DEFAULTS.min), ATTEMPT_DEFAULTS.max);
}

function randomIntInclusive(min, max) {
    const lower = Math.min(min, max);
    const upper = Math.max(min, max);
    return lower + Math.floor(Math.random() * (upper - lower + 1));
}

export function parseEngageRangeArgs(argv = []) {
    let dryRun = false;
    let minRaw;
    let maxRaw;
    let attemptsRaw;

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];

        if (arg === '--dry-run' || arg === '-d') {
            dryRun = true;
            continue;
        }

        if (arg === '--help' || arg === '-h') {
            return {
                dryRun,
                min: RANGE_DEFAULTS.min,
                max: RANGE_DEFAULTS.max,
                attempts: ATTEMPT_DEFAULTS.defaultValue,
                help: true,
            };
        }

        if (arg.startsWith('--min=')) {
            minRaw = arg.slice('--min='.length);
            continue;
        }

        if (arg === '--min') {
            minRaw = readFlagValue(argv, i, '--min');
            i += 1;
            continue;
        }

        if (arg.startsWith('--max=')) {
            maxRaw = arg.slice('--max='.length);
            continue;
        }

        if (arg === '--max') {
            maxRaw = readFlagValue(argv, i, '--max');
            i += 1;
            continue;
        }

        if (arg.startsWith('--attempts=')) {
            attemptsRaw = arg.slice('--attempts='.length);
            continue;
        }

        if (arg === '--attempts') {
            attemptsRaw = readFlagValue(argv, i, '--attempts');
            i += 1;
            continue;
        }

        throw createUsageError(`Unknown argument: ${arg}`);
    }

    let min;
    let max;
    let attempts;

    try {
        min = normalizeLimit(minRaw, {
            defaultValue: RANGE_DEFAULTS.min,
            min: LIMIT_BOUNDS.min,
            max: LIMIT_BOUNDS.max,
        });
        max = normalizeLimit(maxRaw, {
            defaultValue: RANGE_DEFAULTS.max,
            min: LIMIT_BOUNDS.min,
            max: LIMIT_BOUNDS.max,
        });
        attempts = normalizeAttemptLimit(attemptsRaw);
    } catch (error) {
        throw createUsageError(error.message);
    }

    if (min > max) {
        throw createUsageError(`Invalid range: min (${min}) cannot be greater than max (${max}).`);
    }

    return {
        dryRun,
        min,
        max,
        attempts,
        help: false,
    };
}

export async function main(argv = process.argv.slice(2)) {
    let parsed;

    try {
        parsed = parseEngageRangeArgs(argv);
    } catch (error) {
        console.error(`❌ ${error.message}`);
        console.error('');
        console.error(ENGAGE_X_RANGE_USAGE);
        return 1;
    }

    if (parsed.help) {
        console.log(ENGAGE_X_RANGE_USAGE);
        return 0;
    }

    const target = randomIntInclusive(parsed.min, parsed.max);

    console.log('');
    console.log('🎯 X Range Engagement Runner');
    console.log(`   Range: ${parsed.min}-${parsed.max}`);
    console.log(`   Selected target: ${target}`);
    console.log(`   Max attempts: ${parsed.attempts}`);
    console.log(`   Mode: ${parsed.dryRun ? 'DRY RUN' : 'LIVE'}`);

    if (parsed.dryRun) {
        try {
            await runOutboundEngagement({
                dryRun: true,
                limit: target,
            });
            return 0;
        } catch (error) {
            console.error(`❌ Fatal: ${error.message}`);
            return 1;
        }
    }

    let postedTotal = 0;

    for (let attempt = 1; attempt <= parsed.attempts && postedTotal < target; attempt += 1) {
        const remainingToTarget = target - postedTotal;
        const remainingToMax = parsed.max - postedTotal;
        const runLimit = Math.max(1, Math.min(remainingToTarget, remainingToMax));

        console.log('');
        console.log(`🔁 Attempt ${attempt}/${parsed.attempts} (run limit: ${runLimit})`);

        let result;
        try {
            result = await runOutboundEngagement({
                dryRun: false,
                limit: runLimit,
            });
        } catch (error) {
            console.error(`❌ Attempt ${attempt} failed: ${error.message}`);
            continue;
        }

        const posted = Number(result?.engaged) || 0;
        postedTotal += posted;

        console.log(`   Posted this attempt: ${posted}`);
        console.log(`   Posted total: ${postedTotal}`);

        if (posted <= 0) {
            console.log('   No additional posts were engaged, stopping early.');
            break;
        }

        if (postedTotal < target && attempt < parsed.attempts) {
            await sleep(INTER_ATTEMPT_DELAY_MS);
        }
    }

    console.log('');
    if (postedTotal < parsed.min) {
        console.error(`❌ Completed with ${postedTotal} comments, below minimum target ${parsed.min}.`);
        return 2;
    }

    console.log(`✅ Completed with ${postedTotal} comments in the ${parsed.min}-${parsed.max} target range.`);
    return 0;
}

const isDirectRun = Boolean(process.argv[1])
    && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
    main().then(code => process.exit(code));
}

export default {
    parseEngageRangeArgs,
    main,
};

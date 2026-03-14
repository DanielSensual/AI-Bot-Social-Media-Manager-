#!/usr/bin/env node
/**
 * Daniel Facebook Manager CLI
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import {
    parseDanielFacebookManagerConfig,
    runDanielFacebookManagerCycle,
    startDanielFacebookManager,
} from '../../src/daniel-facebook-manager.js';
import {
    applyDanielFacebookEnvMapping,
    assertDanielFacebookCredentials,
} from '../../src/daniel-facebook-env.js';

export const DANIEL_FACEBOOK_MANAGER_USAGE = `Usage:
  node scripts/danieldigital/facebook-manager.js [options]

Options:
  --once               Run one cycle immediately and exit
  --dry-run, -d        Generate preview only; do not publish
  --run-now            Start scheduler and run one startup cycle
  --help, -h           Show help`;

function createUsageError(message) {
    const error = new Error(message);
    error.code = 'ERR_USAGE';
    return error;
}

export function parseDanielFacebookManagerArgs(argv = []) {
    const parsed = {
        once: false,
        dryRun: false,
        runNow: false,
        help: false,
    };

    for (const arg of argv) {
        if (arg === '--once') {
            parsed.once = true;
            continue;
        }

        if (arg === '--dry-run' || arg === '-d') {
            parsed.dryRun = true;
            continue;
        }

        if (arg === '--run-now') {
            parsed.runNow = true;
            continue;
        }

        if (arg === '--help' || arg === '-h') {
            parsed.help = true;
            continue;
        }

        throw createUsageError(`Unknown argument: ${arg}`);
    }

    return parsed;
}

function showConfig(config, dryRunOverride) {
    const mode = dryRunOverride ?? config.dryRun ? 'DRY RUN' : 'LIVE';
    console.log('');
    console.log('Daniel Facebook Manager');
    console.log('='.repeat(50));
    console.log(`Timezone: ${config.timezone}`);
    console.log(`Daily time: ${config.dailyTime}`);
    console.log(`AI enabled: ${config.aiEnabled}`);
    console.log(`Health check: ${config.healthCheck}`);
    console.log(`Mode: ${mode}`);
    console.log('='.repeat(50));
}

export async function main(argv = process.argv.slice(2)) {
    let args;

    try {
        args = parseDanielFacebookManagerArgs(argv);
    } catch (error) {
        console.error(`❌ ${error.message}`);
        console.error('');
        console.error(DANIEL_FACEBOOK_MANAGER_USAGE);
        return 1;
    }

    if (args.help) {
        console.log(DANIEL_FACEBOOK_MANAGER_USAGE);
        return 0;
    }

    try {
        assertDanielFacebookCredentials(process.env);
        applyDanielFacebookEnvMapping(process.env);
    } catch (error) {
        console.error(`❌ ${error.message}`);
        return 1;
    }

    const config = parseDanielFacebookManagerConfig(process.env);
    showConfig(config, args.dryRun);

    if (args.once) {
        try {
            const result = await runDanielFacebookManagerCycle({
                env: process.env,
                dryRun: args.dryRun,
                trigger: 'manual_once',
            });

            if (result?.dryRun) {
                console.log('\nPreview caption:\n');
                console.log(result.caption);
                return 0;
            }

            if (result?.skipped) {
                console.log(`\nSkipped: ${result.reason}`);
                return 0;
            }

            console.log(`\nSuccess. Facebook post ID: ${result.postId || 'posted'}`);
            return 0;
        } catch (error) {
            console.error(`\n❌ Daniel Facebook manager cycle failed: ${error.message}`);
            return 1;
        }
    }

    startDanielFacebookManager({
        env: process.env,
        dryRun: args.dryRun,
        runOnStart: args.runNow,
    });

    console.log('\nDaniel Facebook manager is running. Press Ctrl+C to stop.\n');

    // Keep process alive for cron scheduler — don't return an exit code
    return null;
}

const isDirectRun = Boolean(process.argv[1])
    && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
    main().then((code) => {
        if (code !== null) process.exit(code);
        // else: scheduler mode — keep process alive
    });
}

export default {
    parseDanielFacebookManagerArgs,
    main,
};

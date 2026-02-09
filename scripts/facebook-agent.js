#!/usr/bin/env node
/**
 * Facebook Agent runner
 *
 * Usage:
 *   node scripts/facebook-agent.js
 *   node scripts/facebook-agent.js --once
 *   node scripts/facebook-agent.js --once --dry-run
 *   node scripts/facebook-agent.js --run-now
 */

import dotenv from 'dotenv';
import { runFacebookAgentCycle, startFacebookAgent } from '../src/facebook-agent.js';

dotenv.config();

const args = process.argv.slice(2);
const flags = {
    once: args.includes('--once'),
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    runNow: args.includes('--run-now'),
    help: args.includes('--help') || args.includes('-h'),
};

function showHelp() {
    console.log('');
    console.log('Facebook Agentic Automation');
    console.log('='.repeat(50));
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/facebook-agent.js');
    console.log('  node scripts/facebook-agent.js --once');
    console.log('  node scripts/facebook-agent.js --once --dry-run');
    console.log('  node scripts/facebook-agent.js --run-now');
    console.log('');
    console.log('Options:');
    console.log('  --once               Run one cycle immediately and exit');
    console.log('  --dry-run, -d        Generate strategy but do not publish');
    console.log('  --run-now            Start scheduler and run one cycle immediately');
    console.log('  --help, -h           Show help');
    console.log('');
    console.log('Environment:');
    console.log('  FACEBOOK_AGENT_ENABLED=true');
    console.log('  FACEBOOK_AGENT_TIMES=09:30,13:00,18:30,21:00');
    console.log('  FACEBOOK_AGENT_REEL_RATIO=45');
    console.log('');
}

async function main() {
    if (flags.help) {
        showHelp();
        process.exit(0);
    }

    if (flags.once) {
        try {
            await runFacebookAgentCycle({
                dryRun: flags.dryRun,
                trigger: 'manual_once',
            });
            process.exit(0);
        } catch (error) {
            console.error(`Facebook agent run failed: ${error.message}`);
            process.exit(1);
        }
    }

    startFacebookAgent({
        dryRun: flags.dryRun,
        runOnStart: flags.runNow,
    });
}

main().catch((error) => {
    console.error(`Fatal: ${error.message}`);
    process.exit(1);
});

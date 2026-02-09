#!/usr/bin/env node
/**
 * Set Facebook Page cover photo from a local image
 *
 * Usage:
 *   node scripts/set-facebook-cover.js --image=./path/to/banner.png
 *   node scripts/set-facebook-cover.js --image=./path/to/banner.png --offset-y=20
 *   node scripts/set-facebook-cover.js --image=./path/to/banner.png --dry-run
 */

import dotenv from 'dotenv';
import path from 'path';
import { testFacebookConnection, setFacebookCoverPhoto } from '../src/facebook-client.js';

dotenv.config();

const args = process.argv.slice(2);
const imageArg = args.find((a) => a.startsWith('--image='))?.split('=')[1]
    || (args.includes('--image') ? args[args.indexOf('--image') + 1] : null);
const offsetYArg = args.find((a) => a.startsWith('--offset-y='))?.split('=')[1]
    || (args.includes('--offset-y') ? args[args.indexOf('--offset-y') + 1] : '0');

const flags = {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    help: args.includes('--help') || args.includes('-h'),
};

function showHelp() {
    console.log('');
    console.log('Set Facebook Cover Photo');
    console.log('='.repeat(50));
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/set-facebook-cover.js --image=./path/to/banner.png');
    console.log('  node scripts/set-facebook-cover.js --image=./path/to/banner.png --offset-y=20');
    console.log('');
    console.log('Options:');
    console.log('  --image <path>        Local image file to upload as cover');
    console.log('  --offset-y <number>   Cover vertical offset (default: 0)');
    console.log('  --dry-run, -d         Validate and preview only');
    console.log('  --help, -h            Show help');
    console.log('');
}

async function main() {
    if (flags.help) {
        showHelp();
        process.exit(0);
    }

    if (!imageArg) {
        console.error('Error: missing --image path');
        showHelp();
        process.exit(1);
    }

    const offsetY = Number(offsetYArg);
    if (Number.isNaN(offsetY) || offsetY < 0) {
        console.error('Error: --offset-y must be a non-negative number');
        process.exit(1);
    }

    const fbConnection = await testFacebookConnection();
    if (!fbConnection || fbConnection.type === 'user_no_pages') {
        console.error('Error: Facebook page access is not ready for this token.');
        process.exit(1);
    }

    const imagePath = path.resolve(imageArg);
    console.log('');
    console.log('Cover Update Preview');
    console.log('-'.repeat(50));
    console.log(`Image:    ${imagePath}`);
    console.log(`Offset Y: ${offsetY}`);
    console.log('');

    if (flags.dryRun) {
        console.log('DRY RUN: no change made.');
        process.exit(0);
    }

    try {
        const result = await setFacebookCoverPhoto(imagePath, offsetY);
        console.log(`Success: cover updated (${JSON.stringify(result)})`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(`Fatal: ${error.message}`);
    process.exit(1);
});

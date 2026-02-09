#!/usr/bin/env node
/**
 * Set Facebook Page profile picture
 *
 * Usage:
 *   node scripts/set-facebook-profile-picture.js --image=./path/to/image.png
 *   node scripts/set-facebook-profile-picture.js --url=https://example.com/logo.png
 *   node scripts/set-facebook-profile-picture.js --image=./logo.png --dry-run
 */

import dotenv from 'dotenv';
import path from 'path';
import {
    testFacebookConnection,
    setFacebookProfilePicture,
    setFacebookProfilePictureFromUrl,
} from '../src/facebook-client.js';

dotenv.config();

const args = process.argv.slice(2);
const imageArg = args.find((a) => a.startsWith('--image='))?.split('=')[1]
    || (args.includes('--image') ? args[args.indexOf('--image') + 1] : null);
const urlArg = args.find((a) => a.startsWith('--url='))?.split('=')[1]
    || (args.includes('--url') ? args[args.indexOf('--url') + 1] : null);

const flags = {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    help: args.includes('--help') || args.includes('-h'),
};

function showHelp() {
    console.log('');
    console.log('Set Facebook Profile Picture');
    console.log('='.repeat(50));
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/set-facebook-profile-picture.js --image=./path/to/file.png');
    console.log('  node scripts/set-facebook-profile-picture.js --url=https://example.com/image.png');
    console.log('');
    console.log('Options:');
    console.log('  --image <path>        Local image file to upload');
    console.log('  --url <url>           Public image URL to use');
    console.log('  --dry-run, -d         Validate and preview only');
    console.log('  --help, -h            Show help');
    console.log('');
}

async function main() {
    if (flags.help) {
        showHelp();
        process.exit(0);
    }

    const sourceCount = [Boolean(imageArg), Boolean(urlArg)].filter(Boolean).length;
    if (sourceCount !== 1) {
        console.error('Error: provide exactly one source: --image or --url');
        showHelp();
        process.exit(1);
    }

    const fbConnection = await testFacebookConnection();
    if (!fbConnection || fbConnection.type === 'user_no_pages') {
        console.error('Error: Facebook page access is not ready for this token.');
        process.exit(1);
    }

    console.log('');
    console.log('Profile Picture Update Preview');
    console.log('-'.repeat(50));
    if (imageArg) {
        console.log(`Source: local file`);
        console.log(`Path:   ${path.resolve(imageArg)}`);
    } else {
        console.log('Source: URL');
        console.log(`URL:    ${urlArg}`);
    }
    console.log('');

    if (flags.dryRun) {
        console.log('DRY RUN: no change made.');
        process.exit(0);
    }

    try {
        const result = imageArg
            ? await setFacebookProfilePicture(path.resolve(imageArg))
            : await setFacebookProfilePictureFromUrl(urlArg);

        console.log(`Success: profile picture updated (${JSON.stringify(result)})`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(`Fatal: ${error.message}`);
    process.exit(1);
});

#!/usr/bin/env node
/**
 * Post to LinkedIn
 */

import dotenv from 'dotenv';
import { postToLinkedIn, testLinkedInConnection } from '../src/linkedin-client.js';
import { generateTweet } from '../src/content-library.js';

dotenv.config();

async function main() {
    const args = process.argv.slice(2);

    // Test connection first
    const connected = await testLinkedInConnection();
    if (!connected) {
        console.error('❌ Not connected to LinkedIn. Run: npm run linkedin:auth');
        process.exit(1);
    }

    let postText;

    if (args[0] === '--generate') {
        console.log('📝 Generating post from content library...\n');
        const tweet = generateTweet();
        console.log(`🎯 Pillar: ${tweet.pillar}`);
        postText = tweet.text;
    } else if (args.length > 0) {
        postText = args.join(' ');
    } else {
        console.log('Usage:');
        console.log('  node scripts/post-linkedin.js "Your post text"');
        console.log('  node scripts/post-linkedin.js --generate');
        process.exit(1);
    }

    console.log('Post to publish:');
    console.log('─'.repeat(50));
    console.log(postText);
    console.log('─'.repeat(50));
    console.log(`Length: ${postText.length} chars\n`);

    try {
        await postToLinkedIn(postText);
    } catch (error) {
        console.error('❌ Failed:', error.message);
        process.exit(1);
    }
}

main();

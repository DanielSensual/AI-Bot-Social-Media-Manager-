#!/usr/bin/env node
/**
 * Quick post script for manual tweets
 * Usage: node scripts/post-now.js "Your tweet text"
 *        node scripts/post-now.js --generate [pillar]
 */

import dotenv from 'dotenv';
import { postTweet } from '../src/twitter-client.js';
import { generateTweet, getTweetByPillar } from '../src/content-library.js';

dotenv.config();

const args = process.argv.slice(2);

async function main() {
    if (args.length === 0) {
        console.log('Usage:');
        console.log('  node scripts/post-now.js "Your tweet text"');
        console.log('  node scripts/post-now.js --generate');
        console.log('  node scripts/post-now.js --generate value|portfolio|bts|cta');
        process.exit(1);
    }

    let tweetText;

    if (args[0] === '--generate') {
        const pillar = args[1];

        if (pillar) {
            console.log(`📝 Generating ${pillar} tweet...\n`);
            tweetText = getTweetByPillar(pillar);
        } else {
            console.log('📝 Generating random tweet...\n');
            const tweet = generateTweet();
            console.log(`🎯 Pillar: ${tweet.pillar}`);
            tweetText = tweet.text;
        }
    } else {
        tweetText = args.join(' ');
    }

    console.log('Tweet to post:');
    console.log('─'.repeat(40));
    console.log(tweetText);
    console.log('─'.repeat(40));
    console.log(`Length: ${tweetText.length}/280\n`);

    try {
        const result = await postTweet(tweetText);
        console.log(`\n🎉 Success! View at: https://x.com/i/status/${result.id}`);
    } catch (error) {
        console.error('❌ Failed:', error.message);
        if (error.data) {
            console.error(JSON.stringify(error.data, null, 2));
        }
        process.exit(1);
    }
}

main();

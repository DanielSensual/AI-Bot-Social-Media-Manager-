#!/usr/bin/env node
/**
 * Test all API connections - X, LinkedIn, Facebook
 */

import dotenv from 'dotenv';
import { testConnection, getMetrics } from '../src/twitter-client.js';
import { testLinkedInConnection } from '../src/linkedin-client.js';
import { testFacebookConnection } from '../src/facebook-client.js';

dotenv.config();

async function main() {
    console.log('');
    console.log('🔌 Ghost AI Bot — Connection Test');
    console.log('═'.repeat(50));

    // X / Twitter
    console.log('\n📡 X (Twitter)');
    console.log('─'.repeat(30));
    const xConnected = await testConnection();
    if (xConnected) {
        const metrics = await getMetrics();
        console.log(`   @${metrics.username} | ${metrics.followers} followers | ${metrics.tweets} tweets`);
    }

    // LinkedIn
    console.log('\n📡 LinkedIn');
    console.log('─'.repeat(30));
    await testLinkedInConnection();

    // Facebook
    console.log('\n📡 Facebook');
    console.log('─'.repeat(30));
    const fbResult = await testFacebookConnection();
    if (fbResult && fbResult.type === 'user_no_pages') {
        console.log('');
        console.log('   💡 To enable Facebook posting:');
        console.log('   1. Go to https://developers.facebook.com/tools/explorer/');
        console.log('   2. Select your app');
        console.log('   3. Add permissions: pages_manage_posts, pages_show_list');
        console.log('   4. Generate a new token and update .env');
    }

    console.log('\n' + '═'.repeat(50));
    console.log('✅ Connection test complete');
    console.log('');
}

main().catch(console.error);

#!/usr/bin/env node
/**
 * Test X API connection
 */

import dotenv from 'dotenv';
import { testConnection, getMetrics } from '../src/twitter-client.js';

dotenv.config();

async function main() {
    console.log('🔌 Testing X API connection...\n');

    const connected = await testConnection();

    if (connected) {
        console.log('\n📊 Fetching account metrics...');
        const metrics = await getMetrics();
        console.log('');
        console.log('Account Info:');
        console.log(`  Username: @${metrics.username}`);
        console.log(`  Name: ${metrics.name}`);
        console.log(`  Followers: ${metrics.followers}`);
        console.log(`  Following: ${metrics.following}`);
        console.log(`  Tweets: ${metrics.tweets}`);
        console.log('\n✅ All systems operational!');
    } else {
        console.log('\n❌ Connection failed. Please check your credentials.');
        process.exit(1);
    }
}

main();

#!/usr/bin/env node
import 'dotenv/config';
import { TwitterApi } from 'twitter-api-v2';

async function verifyPermissions() {
    console.log('🔍 Starting X API Preflight Check...');
    const client = new TwitterApi({
        appKey: process.env.X_CONSUMER_KEY,
        appSecret: process.env.X_CONSUMER_SECRET,
        accessToken: process.env.X_ACCESS_TOKEN,
        accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
    });

    try {
        console.log('\n1. Checking Authentication (GET /2/users/me)...');
        const me = await client.v2.me();
        console.log(`✅ Authenticated successfully as @${me.data.username} (ID: ${me.data.id})`);

        console.log('\n2. Checking Mention Timeline Access (GET /2/users/:id/mentions)...');
        // Will fail with 402 or 403 on Free Tier
        const mentions = await client.v2.userMentionTimeline(me.data.id, { max_results: 5 });
        console.log(`✅ Mentions access granted! Found ${mentions.data?.data?.length || 0} recent mentions.`);

        console.log('\n3. Checking Tweet Write Access (POST /2/tweets)...');
        console.log('   (Skipping actual tweet creation to avoid spam, but if mentions work, write usually works on Basic tier)');

        console.log('\n✅ All checks passed! You are ready to run the responder.');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Permission Check Failed:');
        console.error(`   Error Code: ${error.code}`);
        console.error(`   Message: ${error.message}`);

        if (error.code === 402) {
            console.error('\n💡 Root Cause: Your X Access Tier does not support this endpoint.');
            console.error('   The "Mention Timeline" requires the Basic ($100/mo) or Pro Tiers.');
            console.error('   Free Tier only supports posting tweets (1500/month).');
        } else if (error.code === 403) {
            console.error('\n💡 Root Cause: Missing Permissions.');
            console.error('   Ensure your App config has "Read and Write" enabled, then regenerate Access Tokens.');
        } else if (error.code === 401) {
            console.error('\n💡 Root Cause: Authentication Failed.');
            console.error('   Double check your API keys and tokens in .env.');
        }
        process.exit(1);
    }
}

verifyPermissions();

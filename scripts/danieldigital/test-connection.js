#!/usr/bin/env node
/**
 * Daniel Digital Filmmaker - Connection Test
 */

import dotenv from 'dotenv';
import { testInstagramConnection } from '../../src/instagram-client.js';

dotenv.config();

const config = {
    type: 'direct_ig',
    token: process.env.INSTAGRAM_GRAPH_TOKEN,
    igUserId: process.env.INSTAGRAM_GRAPH_USER_ID
};

async function main() {
    console.log('');
    console.log('📡 Testing Instagram Connection: Daniel Digital Filmmaker');
    console.log('─'.repeat(50));

    const result = await testInstagramConnection(config);
    if (result) {
        console.log('');
        console.log('✅ DanielDigital specific connection is successful!');
    } else {
        console.log('');
        console.log('❌ DanielDigital specific connection failed.');
    }
}

main().catch(console.error);

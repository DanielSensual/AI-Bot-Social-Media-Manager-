#!/usr/bin/env node
/**
 * GhostAI / Artificial Intelligence Knowledge - Connection Test
 */

import dotenv from 'dotenv';
import { testInstagramConnection } from '../../src/instagram-client.js';

dotenv.config();

const config = {
    type: 'facebook_page',
    token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN,
    pageId: process.env.FACEBOOK_PAGE_ID
};

async function main() {
    console.log('');
    console.log('📡 Testing Instagram Connection: GhostAI / Artificial Intelligence Knowledge');
    console.log('─'.repeat(50));

    const result = await testInstagramConnection(config);
    if (result) {
        console.log('');
        console.log('✅ GhostAI specific connection is successful!');
    } else {
        console.log('');
        console.log('❌ GhostAI specific connection failed.');
    }
}

main().catch(console.error);

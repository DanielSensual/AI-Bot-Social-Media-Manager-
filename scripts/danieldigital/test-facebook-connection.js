#!/usr/bin/env node
/**
 * Daniel Digital - Facebook Connection Test
 */

import 'dotenv/config';
import { testFacebookConnection } from '../../src/facebook-client.js';
import {
    applyDanielFacebookEnvMapping,
    assertDanielFacebookCredentials,
} from '../../src/daniel-facebook-env.js';

async function main() {
    console.log('');
    console.log('📡 Testing Facebook Connection: Daniel Digital');
    console.log('─'.repeat(50));

    assertDanielFacebookCredentials(process.env);
    applyDanielFacebookEnvMapping(process.env);

    const result = await testFacebookConnection();

    if (!result || result.type === 'user_no_pages') {
        throw new Error('Daniel Facebook Page access is not ready. Check DANIEL_FACEBOOK_* credentials and permissions.');
    }

    const pageName = result.page?.name || result.name || 'Unknown Page';
    const pageId = result.page?.id || result.id || process.env.DANIEL_FACEBOOK_PAGE_ID || 'unknown';

    console.log('');
    console.log('✅ Daniel Facebook connection is successful.');
    console.log(`   Page: ${pageName}`);
    console.log(`   Page ID: ${pageId}`);
}

main().catch((error) => {
    console.error('');
    console.error(`❌ ${error.message}`);
    process.exit(1);
});

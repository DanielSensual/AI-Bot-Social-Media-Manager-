#!/usr/bin/env node
/**
 * Facebook Token Exchange — Short-Lived → Long-Lived
 *
 * Two-step process per Meta docs:
 *   1. Exchange short-lived user token → long-lived user token (~60 days)
 *   2. Exchange long-lived user token → long-lived PAGE token (never expires!)
 *
 * Usage:
 *   node scripts/fb-token-exchange.js
 *
 * Required .env vars:
 *   FACEBOOK_APP_ID          — from Meta Developer Portal
 *   FACEBOOK_APP_SECRET      — from Meta Developer Portal
 *   FACEBOOK_ACCESS_TOKEN    — your current short-lived token (from Graph API Explorer)
 */

import 'dotenv/config';

const GRAPH_API = 'https://graph.facebook.com/v22.0';
const APP_ID = process.env.FACEBOOK_APP_ID;
const APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const SHORT_LIVED_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;

if (!APP_ID || !APP_SECRET) {
    console.error(`
❌ Missing FACEBOOK_APP_ID or FACEBOOK_APP_SECRET in .env

   1. Go to https://developers.facebook.com/apps/
   2. Select your app → Settings → Basic
   3. Copy your App ID and App Secret
   4. Add to .env:
      FACEBOOK_APP_ID=your_app_id
      FACEBOOK_APP_SECRET=your_app_secret
`);
    process.exit(1);
}

if (!SHORT_LIVED_TOKEN) {
    console.error(`
❌ Missing FACEBOOK_ACCESS_TOKEN in .env

   1. Go to https://developers.facebook.com/tools/explorer/
   2. Select your app
   3. Add permissions: pages_manage_posts, pages_read_engagement, pages_show_list
   4. Click "Generate Access Token"
   5. Copy the token to FACEBOOK_ACCESS_TOKEN in .env
`);
    process.exit(1);
}

async function exchangeForLongLived() {
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║   🔑 Facebook Token Exchange             ║');
    console.log('╚══════════════════════════════════════════╝\n');

    // Step 1: Exchange short-lived → long-lived user token
    console.log('Step 1: Exchanging for long-lived user token...');

    const userTokenUrl = new URL(`${GRAPH_API}/oauth/access_token`);
    userTokenUrl.searchParams.set('grant_type', 'fb_exchange_token');
    userTokenUrl.searchParams.set('client_id', APP_ID);
    userTokenUrl.searchParams.set('client_secret', APP_SECRET);
    userTokenUrl.searchParams.set('fb_exchange_token', SHORT_LIVED_TOKEN);

    const userRes = await fetch(userTokenUrl);
    const userData = await userRes.json();

    if (userData.error) {
        console.error(`\n❌ Token exchange failed: ${userData.error.message}`);
        if (userData.error.message.includes('expired')) {
            console.error('\n   Your short-lived token has expired. Generate a new one:');
            console.error('   → https://developers.facebook.com/tools/explorer/');
        }
        process.exit(1);
    }

    const longLivedUserToken = userData.access_token;
    const expiresIn = userData.expires_in;
    const expiresDate = new Date(Date.now() + expiresIn * 1000).toLocaleDateString();

    console.log(`   ✅ Long-lived user token obtained`);
    console.log(`   ⏰ Expires: ${expiresDate} (~${Math.round(expiresIn / 86400)} days)`);

    // Step 2: Exchange long-lived user token → long-lived page token (never expires!)
    console.log('\nStep 2: Fetching long-lived page token...');

    const pagesUrl = new URL(`${GRAPH_API}/me/accounts`);
    pagesUrl.searchParams.set('access_token', longLivedUserToken);
    pagesUrl.searchParams.set('fields', 'id,name,access_token,category');

    const pagesRes = await fetch(pagesUrl);
    const pagesData = await pagesRes.json();

    if (pagesData.error) {
        console.error(`\n❌ Page token fetch failed: ${pagesData.error.message}`);
        process.exit(1);
    }

    if (!pagesData.data || pagesData.data.length === 0) {
        console.error('\n❌ No pages found. Make sure you have pages_manage_posts permission.');
        console.error('   → Re-generate token at https://developers.facebook.com/tools/explorer/');
        process.exit(1);
    }

    console.log(`   ✅ Found ${pagesData.data.length} page(s)\n`);

    // Display all pages
    console.log('═══════════════════════════════════════════');
    console.log('📋 Your Pages:');
    console.log('═══════════════════════════════════════════\n');

    for (const page of pagesData.data) {
        console.log(`   📄 ${page.name} (${page.category})`);
        console.log(`      Page ID: ${page.id}`);
        console.log(`      Token:   ${page.access_token.substring(0, 30)}...`);
        console.log('');
    }

    // Use the first page (or only page)
    const primaryPage = pagesData.data[0];

    console.log('═══════════════════════════════════════════');
    console.log('🔐 UPDATE YOUR .env FILE:');
    console.log('═══════════════════════════════════════════\n');
    console.log(`FACEBOOK_ACCESS_TOKEN=${longLivedUserToken}`);
    console.log(`FACEBOOK_PAGE_ID=${primaryPage.id}`);
    console.log(`FACEBOOK_PAGE_ACCESS_TOKEN=${primaryPage.access_token}`);
    console.log('');
    console.log('─'.repeat(45));
    console.log(`✅ Page token for "${primaryPage.name}" NEVER expires`);
    console.log('   (unless you change password, deauthorize, or revoke)');
    console.log('─'.repeat(45));

    // Verify the page token works
    console.log('\nStep 3: Verifying page token...');
    const debugUrl = new URL(`${GRAPH_API}/debug_token`);
    debugUrl.searchParams.set('input_token', primaryPage.access_token);
    debugUrl.searchParams.set('access_token', `${APP_ID}|${APP_SECRET}`);

    const debugRes = await fetch(debugUrl);
    const debugData = await debugRes.json();

    if (debugData.data) {
        const d = debugData.data;
        console.log(`   ✅ Token is valid`);
        console.log(`   📄 App: ${d.application || 'N/A'}`);
        console.log(`   📄 Type: ${d.type}`);
        console.log(`   📄 Expires: ${d.expires_at === 0 ? 'NEVER ✨' : new Date(d.expires_at * 1000).toLocaleDateString()}`);
        console.log(`   📄 Scopes: ${(d.scopes || []).join(', ')}`);
    }

    console.log('\n✅ All done! Copy the values above into your .env\n');
}

exchangeForLongLived().catch((err) => {
    console.error(`\n❌ Fatal error: ${err.message}\n`);
    process.exit(1);
});

#!/usr/bin/env node
/**
 * Post Reel to @ghostaisystems — URL-encoded params approach
 */

import dotenv from 'dotenv';
import { testInstagramConnection, uploadToTempHost } from '../../src/instagram-client.js';

dotenv.config();

const config = {
    type: 'facebook_page',
    token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN,
    pageId: process.env.FACEBOOK_PAGE_ID
};

const videoPath = '/tmp/post-this-one-compressed.mp4';
const caption = `Is AI really going to take all of our jobs? 🤖💼

Or is it just going to reduce the amount of people working those jobs?

The real question isn't IF it's happening... it's whether you're going to adapt or get left behind. 🧠⚡

#AI #Automation #FutureOfWork #GhostAI`;

async function main() {
    const connection = await testInstagramConnection(config);
    if (!connection) throw new Error('Not connected');

    const { igUserId, pageToken, apiBase } = connection;
    console.log(`IG: @ghostaisystems (${igUserId})`);

    console.log('\n📤 Uploading...');
    const videoUrl = await uploadToTempHost(videoPath);

    // Create container using URL params (not JSON body)
    console.log('\n📤 Creating Reel container...');
    const params = new URLSearchParams({
        video_url: videoUrl,
        caption,
        media_type: 'REELS',
        access_token: pageToken,
    });

    const containerResp = await fetch(`${apiBase}/${igUserId}/media?${params}`, { method: 'POST' });
    const containerData = await containerResp.json();
    console.log('Container:', JSON.stringify(containerData));

    if (!containerData.id) throw new Error(`Container failed: ${JSON.stringify(containerData)}`);
    const containerId = containerData.id;

    // Poll
    for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const resp = await fetch(`${apiBase}/${containerId}?fields=status_code,status&access_token=${pageToken}`);
        const data = await resp.json();
        const status = data.status_code || data.status;
        process.stdout.write(`   [${i + 1}] ${status}\n`);
        if (status === 'FINISHED') break;
        if (status === 'ERROR') throw new Error('Media failed');
    }

    // Publish using URL params
    console.log('\n📤 Publishing...');
    const publishParams = new URLSearchParams({
        creation_id: containerId,
        access_token: pageToken,
    });
    const publishResp = await fetch(`${apiBase}/${igUserId}/media_publish?${publishParams}`, { method: 'POST' });
    const publishData = await publishResp.json();
    console.log('Result:', JSON.stringify(publishData, null, 2));

    if (publishData.id) {
        console.log(`\n🎉 Reel published! Media ID: ${publishData.id}`);
    }
}

main().catch(err => console.error(`❌ ${err.message}`));

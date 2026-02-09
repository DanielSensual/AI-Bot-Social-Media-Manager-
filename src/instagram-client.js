/**
 * Instagram Content Publishing Client
 * Posts to Instagram via the IG Content Publishing API (Graph API v21.0)
 *
 * Requires:
 * - Facebook Page linked to an Instagram Business/Creator Account
 * - Permissions: instagram_basic, instagram_content_publish, pages_read_engagement
 * - Media must be publicly accessible URLs
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Get access token from env
 */
function getAccessToken() {
    const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN;
    if (!token) throw new Error('Facebook/Instagram not configured. Set FACEBOOK_ACCESS_TOKEN in .env');
    return token;
}

/**
 * Resolve the Page Token (handles user tokens with managed pages)
 */
async function resolvePageToken() {
    const token = getAccessToken();

    const meResponse = await fetch(`${GRAPH_API_BASE}/me?fields=id,name&access_token=${token}`);
    const meData = await meResponse.json();
    if (meData.error) throw new Error(`Facebook API error: ${meData.error.message}`);

    // Check if it's a page token
    const pageCheck = await fetch(`${GRAPH_API_BASE}/${meData.id}?fields=category&access_token=${token}`);
    const pageCheckData = await pageCheck.json();

    if (!pageCheckData.error && pageCheckData.category) {
        return { pageId: meData.id, pageToken: token };
    }

    // User token - get first page
    const pagesResponse = await fetch(`${GRAPH_API_BASE}/me/accounts?fields=id,name,access_token&access_token=${token}`);
    const pagesData = await pagesResponse.json();

    if (!pagesData.data || pagesData.data.length === 0) {
        throw new Error('No Facebook Pages found. Cannot discover Instagram account.');
    }

    const configuredPageId = process.env.FACEBOOK_PAGE_ID;
    const page = configuredPageId
        ? pagesData.data.find(p => p.id === configuredPageId) || pagesData.data[0]
        : pagesData.data[0];

    return { pageId: page.id, pageToken: page.access_token };
}

/**
 * Discover the linked Instagram Business Account
 * @returns {Promise<object>} { igUserId, pageToken }
 */
export async function testInstagramConnection() {
    try {
        const { pageId, pageToken } = await resolvePageToken();

        const response = await fetch(`${GRAPH_API_BASE}/${pageId}?fields=instagram_business_account{id,username,followers_count,media_count}&access_token=${pageToken}`);
        const data = await response.json();

        if (data.error) {
            console.error(`❌ Instagram discovery failed: ${data.error.message}`);
            return false;
        }

        if (!data.instagram_business_account) {
            console.error('❌ No Instagram Business Account linked to this Facebook Page.');
            console.warn('   Link your IG account at: Facebook Page Settings → Linked Accounts → Instagram');
            return false;
        }

        const ig = data.instagram_business_account;
        console.log(`✅ Instagram connected: @${ig.username || ig.id}`);
        if (ig.followers_count) console.log(`   Followers: ${ig.followers_count}`);
        if (ig.media_count) console.log(`   Posts: ${ig.media_count}`);

        return { igUserId: ig.id, pageToken, username: ig.username };
    } catch (error) {
        console.error(`❌ Instagram connection failed: ${error.message}`);
        return false;
    }
}

/**
 * Upload a local file to a temporary public host (Catbox)
 * Required because IG Content Publishing API needs public URLs
 * @param {string} filePath - Local file path
 * @returns {Promise<string>} Public URL
 */
export async function uploadToTempHost(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const fileData = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const boundary = '----CatboxBoundary' + Date.now();

    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="reqtype"\r\n\r\nfileupload\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="fileToUpload"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
        fileData,
        Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const response = await fetch('https://catbox.moe/user/api.php', {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body,
    });

    const url = await response.text();
    if (!url.startsWith('https://')) {
        throw new Error(`Catbox upload failed: ${url}`);
    }

    console.log(`📤 Uploaded to temp host: ${url}`);
    return url.trim();
}

/**
 * Post a single image to Instagram
 * @param {string} caption - Post caption
 * @param {string} imageUrl - Publicly accessible image URL
 * @returns {Promise<object>} Post result
 */
export async function postToInstagram(caption, imageUrl) {
    const connection = await testInstagramConnection();
    if (!connection) throw new Error('Instagram not connected');

    const { igUserId, pageToken } = connection;

    // Step 1: Create media container
    console.log('📤 Creating Instagram media container...');
    const containerResponse = await fetch(`${GRAPH_API_BASE}/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            image_url: imageUrl,
            caption,
            access_token: pageToken,
        }),
    });

    const containerData = await containerResponse.json();
    if (containerData.error) {
        throw new Error(`Instagram container creation failed: ${containerData.error.message}`);
    }

    const containerId = containerData.id;

    // Step 2: Wait for processing and publish
    await waitForMediaReady(containerId, pageToken);

    console.log('📤 Publishing to Instagram...');
    const publishResponse = await fetch(`${GRAPH_API_BASE}/${igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            creation_id: containerId,
            access_token: pageToken,
        }),
    });

    const publishData = await publishResponse.json();
    if (publishData.error) {
        throw new Error(`Instagram publish failed: ${publishData.error.message}`);
    }

    console.log(`✅ Instagram post published!`);
    console.log(`🔗 Media ID: ${publishData.id}`);

    return publishData;
}

/**
 * Post a Reel to Instagram
 * @param {string} caption - Reel caption
 * @param {string} videoUrl - Publicly accessible video URL (mp4)
 * @returns {Promise<object>} Post result
 */
export async function postInstagramReel(caption, videoUrl) {
    const connection = await testInstagramConnection();
    if (!connection) throw new Error('Instagram not connected');

    const { igUserId, pageToken } = connection;

    console.log('📤 Creating Instagram Reel container...');
    const containerResponse = await fetch(`${GRAPH_API_BASE}/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            video_url: videoUrl,
            caption,
            media_type: 'REELS',
            access_token: pageToken,
        }),
    });

    const containerData = await containerResponse.json();
    if (containerData.error) {
        throw new Error(`Instagram Reel container creation failed: ${containerData.error.message}`);
    }

    const containerId = containerData.id;

    // Wait for video processing (can take longer)
    await waitForMediaReady(containerId, pageToken, 60, 5000);

    console.log('📤 Publishing Reel...');
    const publishResponse = await fetch(`${GRAPH_API_BASE}/${igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            creation_id: containerId,
            access_token: pageToken,
        }),
    });

    const publishData = await publishResponse.json();
    if (publishData.error) {
        throw new Error(`Instagram Reel publish failed: ${publishData.error.message}`);
    }

    console.log(`✅ Instagram Reel published!`);
    console.log(`🔗 Media ID: ${publishData.id}`);

    return publishData;
}

/**
 * Post a carousel to Instagram
 * @param {string} caption - Carousel caption
 * @param {string[]} imageUrls - Array of publicly accessible image URLs (2-10)
 * @returns {Promise<object>} Post result
 */
export async function postInstagramCarousel(caption, imageUrls) {
    if (!imageUrls || imageUrls.length < 2 || imageUrls.length > 10) {
        throw new Error('Carousel requires 2-10 images');
    }

    const connection = await testInstagramConnection();
    if (!connection) throw new Error('Instagram not connected');

    const { igUserId, pageToken } = connection;

    // Step 1: Create child containers
    console.log(`📤 Creating ${imageUrls.length} carousel items...`);
    const childIds = [];

    for (const url of imageUrls) {
        const childResponse = await fetch(`${GRAPH_API_BASE}/${igUserId}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_url: url,
                is_carousel_item: true,
                access_token: pageToken,
            }),
        });

        const childData = await childResponse.json();
        if (childData.error) {
            throw new Error(`Carousel item failed: ${childData.error.message}`);
        }
        childIds.push(childData.id);
    }

    // Step 2: Create carousel container
    console.log('📤 Creating carousel container...');
    const carouselResponse = await fetch(`${GRAPH_API_BASE}/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            caption,
            media_type: 'CAROUSEL',
            children: childIds.join(','),
            access_token: pageToken,
        }),
    });

    const carouselData = await carouselResponse.json();
    if (carouselData.error) {
        throw new Error(`Carousel container failed: ${carouselData.error.message}`);
    }

    await waitForMediaReady(carouselData.id, pageToken);

    // Step 3: Publish
    console.log('📤 Publishing carousel...');
    const publishResponse = await fetch(`${GRAPH_API_BASE}/${igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            creation_id: carouselData.id,
            access_token: pageToken,
        }),
    });

    const publishData = await publishResponse.json();
    if (publishData.error) {
        throw new Error(`Carousel publish failed: ${publishData.error.message}`);
    }

    console.log(`✅ Instagram carousel published!`);
    console.log(`🔗 Media ID: ${publishData.id}`);

    return publishData;
}

/**
 * Wait for a media container to finish processing
 */
async function waitForMediaReady(containerId, pageToken, maxAttempts = 30, interval = 2000) {
    for (let i = 0; i < maxAttempts; i++) {
        const statusResponse = await fetch(`${GRAPH_API_BASE}/${containerId}?fields=status_code,status&access_token=${pageToken}`);
        const statusData = await statusResponse.json();

        if (statusData.status_code === 'FINISHED') return;
        if (statusData.status_code === 'ERROR') {
            throw new Error(`Media processing failed: ${statusData.status || 'unknown error'}`);
        }

        await new Promise(r => setTimeout(r, interval));
    }

    throw new Error('Media processing timed out');
}

export default {
    testInstagramConnection,
    uploadToTempHost,
    postToInstagram,
    postInstagramReel,
    postInstagramCarousel,
};

/**
 * Instagram Content Publishing Client
 * Posts to Instagram via the IG Content Publishing API (Graph API v24.0 or Direct v22.0)
 *
 * Supports two modes via accountConfig:
 * 1. Facebook Page linked to an Instagram Business/Creator Account
 * 2. Direct Instagram Graph API token (IGA...)
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const GRAPH_API_VERSION = 'v24.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.IG_GRAPH_TIMEOUT_MS || '30000', 10);
const STATUS_POLL_TIMEOUT_MS = Number.parseInt(process.env.IG_GRAPH_STATUS_TIMEOUT_MS || '15000', 10);
const DEFAULT_GHOSTAI_FACEBOOK_PAGE_ID = '753873537816019';

function getGraphApiBase(token) {
    if (token && token.startsWith('IGA')) return 'https://graph.instagram.com/v22.0';
    return GRAPH_API_BASE;
}

function getTimeoutMs(value, fallback = DEFAULT_TIMEOUT_MS) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function fetchJson(url, options = {}, context = 'Instagram Graph request', timeoutMs = DEFAULT_TIMEOUT_MS) {
    let response;
    try {
        response = await fetch(url, {
            ...options,
            signal: AbortSignal.timeout(getTimeoutMs(timeoutMs)),
        });
    } catch (error) {
        if (error?.name === 'TimeoutError') {
            throw new Error(`${context} timed out after ${getTimeoutMs(timeoutMs)}ms`);
        }
        throw new Error(`${context} failed: ${error.message}`);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = data?.error?.message || `${context} failed with HTTP ${response.status}`;
        throw new Error(message);
    }
    if (data?.error) {
        throw new Error(`${context} failed: ${data.error.message}`);
    }
    return data;
}

/**
 * Resolve the Page Token (from Facebook account)
 */
async function resolvePageToken(config) {
    const tokenCandidates = [
        config?.token,
        process.env.FACEBOOK_ACCESS_TOKEN,
        process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
    ].filter(Boolean);
    if (tokenCandidates.length === 0) throw new Error('Facebook/Instagram not configured. Missing token.');

    const configuredPageId = config?.pageId
        || process.env.FACEBOOK_PAGE_ID
        || process.env.GHOSTAI_FACEBOOK_PAGE_ID
        || DEFAULT_GHOSTAI_FACEBOOK_PAGE_ID;
    let lastError = null;

    for (const token of [...new Set(tokenCandidates)]) {
        try {
            const meData = await fetchJson(
                `${GRAPH_API_BASE}/me?fields=id,name&access_token=${token}`,
                {},
                'Facebook /me lookup',
            );

            // Check if it's a page token
            const pageCheckData = await fetchJson(
                `${GRAPH_API_BASE}/${meData.id}?fields=category&access_token=${token}`,
                {},
                'Facebook page token check',
            ).catch(() => ({}));

            if (!pageCheckData.error && pageCheckData.category) {
                if (!configuredPageId || String(meData.id) === String(configuredPageId)) {
                    return { pageId: meData.id, pageToken: token };
                }

                lastError = new Error(`Page token targets ${meData.id}, not requested page ${configuredPageId}`);
                continue;
            }

            // User token - find requested page or fall back to first page
            const pagesData = await fetchJson(
                `${GRAPH_API_BASE}/me/accounts?fields=id,name,access_token&access_token=${token}`,
                {},
                'Facebook managed pages lookup',
            );

            if (!pagesData.data || pagesData.data.length === 0) {
                throw new Error('No Facebook Pages found. Cannot discover Instagram account.');
            }

            const page = configuredPageId
                ? pagesData.data.find((entry) => String(entry.id) === String(configuredPageId)) || null
                : pagesData.data[0];

            if (!page) {
                throw new Error(`Requested Facebook page ${configuredPageId} was not found in accessible pages.`);
            }

            return { pageId: page.id, pageToken: page.access_token };
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error('No usable Facebook page token found.');
}

/**
 * Discover the linked Instagram Business Account
 * @param {object} [config] - Explicit account config { type, token, pageId, igUserId }
 * @returns {Promise<object>} { igUserId, pageToken, username, apiBase }
 */
export async function testInstagramConnection(config = null) {
    try {
        // Direct IG Token Type
        if (config?.type === 'direct_ig' || (!config && process.env.INSTAGRAM_GRAPH_TOKEN && process.env.INSTAGRAM_GRAPH_USER_ID)) {
            const token = config?.token || process.env.INSTAGRAM_GRAPH_TOKEN;
            const igUserId = config?.igUserId || process.env.INSTAGRAM_GRAPH_USER_ID;
            const apiBase = getGraphApiBase(token);
            let username = process.env.INSTAGRAM_GRAPH_USERNAME || igUserId;

            try {
                const data = await fetchJson(
                    `${apiBase}/${igUserId}?fields=username,followers_count,media_count&access_token=${token}`,
                    {},
                    'Instagram direct account check'
                );
                if (data.username) username = data.username;
                console.log(`✅ Instagram connected: @${username}`);
                if (data.followers_count) console.log(`   Followers: ${data.followers_count}`);
                if (data.media_count) console.log(`   Posts: ${data.media_count}`);
                return { igUserId, pageToken: token, username, apiBase };
            } catch (err) {
                console.log(`✅ Instagram connected (fallback): @${username}`);
                return { igUserId, pageToken: token, username, apiBase };
            }
        }

        // Facebook Page Linked Type (Default fallback)
        const { pageId, pageToken } = await resolvePageToken(config);

        const data = await fetchJson(
            `${GRAPH_API_BASE}/${pageId}?fields=instagram_business_account{id,username,followers_count,media_count}&access_token=${pageToken}`,
            {},
            'Instagram business account discovery',
        );

        if (!data.instagram_business_account) {
            console.error('❌ No Instagram Business Account linked to this Facebook Page.');
            return false;
        }

        const ig = data.instagram_business_account;
        console.log(`✅ Instagram connected: @${ig.username || ig.id}`);
        if (ig.followers_count) console.log(`   Followers: ${ig.followers_count}`);
        if (ig.media_count) console.log(`   Posts: ${ig.media_count}`);

        return { igUserId: ig.id, pageToken, username: ig.username, apiBase: getGraphApiBase(pageToken) };
    } catch (error) {
        console.error(`❌ Instagram connection failed: ${error.message}`);
        return false;
    }
}

export async function uploadToTempHost(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const uploadTimeoutMs = getTimeoutMs(process.env.IG_UPLOAD_TIMEOUT_MS, 120000);
    const providers = [
        { name: 'Catbox', fn: () => uploadToCatbox(filePath, uploadTimeoutMs) },
        { name: 'Litterbox', fn: () => uploadToLitterbox(filePath, uploadTimeoutMs) },
        { name: '0x0.st', fn: () => uploadTo0x0(filePath, uploadTimeoutMs) },
    ];

    let lastError = null;
    for (const { name, fn } of providers) {
        try {
            const url = await fn();
            console.log(`📤 Uploaded to ${name}: ${url}`);
            return url;
        } catch (err) {
            console.warn(`⚠️ ${name} upload failed: ${err.message}`);
            lastError = err;
        }
    }

    throw new Error(`All temp host uploads failed. Last error: ${lastError?.message}`);
}

async function uploadToCatbox(filePath, timeoutMs) {
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
        signal: AbortSignal.timeout(timeoutMs),
    });

    const url = await response.text();
    if (!url.startsWith('https://')) {
        throw new Error(`Catbox returned: ${url.substring(0, 200)}`);
    }
    return url.trim();
}

async function uploadToLitterbox(filePath, timeoutMs) {
    const fileData = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const boundary = '----LitterboxBoundary' + Date.now();

    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="reqtype"\r\n\r\nfileupload\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="time"\r\n\r\n1h\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="fileToUpload"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
        fileData,
        Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const response = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body,
        signal: AbortSignal.timeout(timeoutMs),
    });

    const url = await response.text();
    if (!url.startsWith('https://')) {
        throw new Error(`Litterbox returned: ${url.substring(0, 200)}`);
    }
    return url.trim();
}

async function uploadTo0x0(filePath, timeoutMs) {
    const fileData = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const boundary = '----0x0Boundary' + Date.now();

    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
        fileData,
        Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const response = await fetch('https://0x0.st', {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body,
        signal: AbortSignal.timeout(timeoutMs),
    });

    const url = await response.text();
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
        throw new Error(`0x0.st returned: ${url.substring(0, 200)}`);
    }
    return url.trim();
}

/**
 * Post a single image to Instagram
 * @param {string} caption - Post caption
 * @param {string} imageUrl - Publicly accessible image URL
 * @param {object} [config] - Explicit account config
 * @returns {Promise<object>} Post result
 */
export async function postToInstagram(caption, imageUrl, config = null) {
    const connection = await testInstagramConnection(config);
    if (!connection) throw new Error('Instagram not connected');

    const { igUserId, pageToken, apiBase } = connection;

    console.log('📤 Creating Instagram media container...');
    const containerData = await fetchJson(`${apiBase}/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            image_url: imageUrl,
            caption,
            access_token: pageToken,
        }),
    }, 'Instagram image container creation');

    const containerId = containerData.id;

    await waitForMediaReady(containerId, pageToken, apiBase);

    console.log('📤 Publishing to Instagram...');
    const publishData = await fetchJson(`${apiBase}/${igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            creation_id: containerId,
            access_token: pageToken,
        }),
    }, 'Instagram image publish');

    console.log(`✅ Instagram post published!`);
    console.log(`🔗 Media ID: ${publishData.id}`);

    return publishData;
}

/**
 * Post a Reel to Instagram
 * @param {string} caption - Reel caption
 * @param {string} videoUrl - Publicly accessible video URL (mp4)
 * @param {object} [config] - Explicit account config
 * @returns {Promise<object>} Post result
 */
export async function postInstagramReel(caption, videoUrl, config = null) {
    const connection = await testInstagramConnection(config);
    if (!connection) throw new Error('Instagram not connected');

    const { igUserId, pageToken, apiBase } = connection;

    console.log('📤 Creating Instagram Reel container...');
    const containerData = await fetchJson(`${apiBase}/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            video_url: videoUrl,
            caption,
            media_type: 'REELS',
            access_token: pageToken,
        }),
    }, 'Instagram Reel container creation');

    const containerId = containerData.id;

    await waitForMediaReady(containerId, pageToken, apiBase, 60, 5000);

    console.log('📤 Publishing Reel...');
    const publishData = await fetchJson(`${apiBase}/${igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            creation_id: containerId,
            access_token: pageToken,
        }),
    }, 'Instagram Reel publish');

    console.log(`✅ Instagram Reel published!`);
    console.log(`🔗 Media ID: ${publishData.id}`);

    return publishData;
}

/**
 * Post an Instagram Story (image or video)
 * @param {string} mediaUrl - Publicly accessible media URL
 * @param {object} options
 * @param {string} [options.mediaType='image'] - image|video
 * @param {string} [options.caption=''] - Optional caption
 * @param {object} [options.config=null] - Explicit account config
 * @returns {Promise<object>} Post result
 */
export async function postInstagramStory(mediaUrl, options = {}) {
    if (!mediaUrl || typeof mediaUrl !== 'string') {
        throw new Error('Story mediaUrl is required');
    }

    const mediaType = String(options.mediaType || 'image').toLowerCase();
    if (!['image', 'video'].includes(mediaType)) {
        throw new Error('Story mediaType must be image or video');
    }

    const caption = String(options.caption || '').trim();
    const config = options.config || null;

    const connection = await testInstagramConnection(config);
    if (!connection) throw new Error('Instagram not connected');

    const { igUserId, pageToken, apiBase } = connection;

    console.log(`📤 Creating Instagram Story container (${mediaType})...`);
    const payload = {
        media_type: 'STORIES',
        access_token: pageToken,
    };

    if (mediaType === 'video') {
        payload.video_url = mediaUrl;
    } else {
        payload.image_url = mediaUrl;
    }

    if (caption) {
        payload.caption = caption;
    }

    const containerData = await fetchJson(`${apiBase}/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    }, 'Instagram Story container creation');

    const containerId = containerData.id;
    await waitForMediaReady(containerId, pageToken, apiBase, mediaType === 'video' ? 60 : 30, 3000);

    console.log('📤 Publishing Story...');
    const publishData = await fetchJson(`${apiBase}/${igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            creation_id: containerId,
            access_token: pageToken,
        }),
    }, 'Instagram Story publish');

    console.log('✅ Instagram Story published!');
    console.log(`🔗 Story ID: ${publishData.id}`);
    return publishData;
}

/**
 * Post a carousel to Instagram
 * @param {string} caption - Carousel caption
 * @param {string[]} imageUrls - Array of publicly accessible image URLs (2-10)
 * @param {object} [config] - Explicit account config
 * @returns {Promise<object>} Post result
 */
export async function postInstagramCarousel(caption, imageUrls, config = null) {
    if (!imageUrls || imageUrls.length < 2 || imageUrls.length > 10) {
        throw new Error('Carousel requires 2-10 images');
    }

    const connection = await testInstagramConnection(config);
    if (!connection) throw new Error('Instagram not connected');

    const { igUserId, pageToken, apiBase } = connection;

    console.log(`📤 Creating ${imageUrls.length} carousel items...`);
    const childIds = [];

    for (const url of imageUrls) {
        const childData = await fetchJson(`${apiBase}/${igUserId}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_url: url,
                is_carousel_item: true,
                access_token: pageToken,
            }),
        }, 'Instagram carousel item creation');
        childIds.push(childData.id);
    }

    console.log('📤 Creating carousel container...');
    const carouselData = await fetchJson(`${apiBase}/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            caption,
            media_type: 'CAROUSEL',
            children: childIds.join(','),
            access_token: pageToken,
        }),
    }, 'Instagram carousel container creation');

    await waitForMediaReady(carouselData.id, pageToken, apiBase);

    console.log('📤 Publishing carousel...');
    const publishData = await fetchJson(`${apiBase}/${igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            creation_id: carouselData.id,
            access_token: pageToken,
        }),
    }, 'Instagram carousel publish');

    console.log(`✅ Instagram carousel published!`);
    console.log(`🔗 Media ID: ${publishData.id}`);

    return publishData;
}

async function waitForMediaReady(containerId, pageToken, apiBase = GRAPH_API_BASE, maxAttempts = 30, interval = 2000) {
    for (let i = 0; i < maxAttempts; i++) {
        const statusData = await fetchJson(
            `${apiBase}/${containerId}?fields=status_code,status&access_token=${pageToken}`,
            {},
            'Instagram media status check',
            STATUS_POLL_TIMEOUT_MS,
        );
        const code = statusData.status_code || 'UNKNOWN';
        console.log(`   ⏳ Media status [${i + 1}/${maxAttempts}]: ${code}`);

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
    postInstagramStory,
    postInstagramCarousel,
};

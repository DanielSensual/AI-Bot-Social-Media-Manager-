/**
 * Facebook Page API Client
 * Posts to Facebook Pages via the Graph API v21.0
 *
 * Required permissions: pages_manage_posts, pages_show_list, pages_read_engagement
 * Token must be a User Access Token with page management permissions,
 * or a Page Access Token directly.
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Get the configured access token
 */
function getAccessToken() {
    const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN;
    if (!token) {
        throw new Error('Facebook not configured. Set FACEBOOK_PAGE_ACCESS_TOKEN in .env');
    }
    return token;
}

/**
 * Test connection and return page info
 * @returns {Promise<object|false>} Page info or false if failed
 */
export async function testFacebookConnection() {
    try {
        const token = getAccessToken();

        // Query basic identity first (works for both User and Page tokens)
        const meResponse = await fetch(`${GRAPH_API_BASE}/me?fields=id,name&access_token=${token}`);
        const meData = await meResponse.json();

        if (meData.error) {
            console.error(`❌ Facebook API error: ${meData.error.message}`);
            return false;
        }

        // Try page-specific fields to detect if this is a Page token
        const pageCheckResponse = await fetch(`${GRAPH_API_BASE}/${meData.id}?fields=category,fan_count&access_token=${token}`);
        const pageCheck = await pageCheckResponse.json();

        if (!pageCheck.error && pageCheck.category) {
            // It's a direct page token
            console.log(`✅ Facebook Page connected: ${meData.name}`);
            console.log(`   Category: ${pageCheck.category}`);
            if (pageCheck.fan_count) console.log(`   Followers: ${pageCheck.fan_count}`);
            return { type: 'page', ...meData, ...pageCheck };
        }

        // It's a user token — try to get managed pages
        console.log(`✅ Facebook User: ${meData.name}`);
        const pagesResponse = await fetch(`${GRAPH_API_BASE}/me/accounts?fields=id,name,category,access_token&access_token=${token}`);
        const pagesData = await pagesResponse.json();

        if (pagesData.data && pagesData.data.length > 0) {
            const page = pagesData.data[0];
            console.log(`✅ Facebook Page found: ${page.name} (${page.category})`);
            return { type: 'user_with_page', user: meData, page };
        }

        console.warn('⚠️ No Facebook Pages found. Token needs pages_manage_posts permission.');
        console.warn('   Go to: https://developers.facebook.com/tools/explorer/');
        console.warn('   Add permissions: pages_manage_posts, pages_show_list, pages_read_engagement');
        return { type: 'user_no_pages', user: meData };
    } catch (error) {
        console.error(`❌ Facebook connection failed: ${error.message}`);
        return false;
    }
}

/**
 * Resolve the Page ID and Page Access Token to use for posting
 * Handles both direct Page tokens and User tokens with page access
 */
async function resolvePageCredentials() {
    const token = getAccessToken();

    // Get basic identity
    const meResponse = await fetch(`${GRAPH_API_BASE}/me?fields=id,name&access_token=${token}`);
    const meData = await meResponse.json();

    if (meData.error) {
        throw new Error(`Facebook API error: ${meData.error.message}`);
    }

    // Check if it's a Page token
    const pageCheckResponse = await fetch(`${GRAPH_API_BASE}/${meData.id}?fields=category&access_token=${token}`);
    const pageCheck = await pageCheckResponse.json();

    if (!pageCheck.error && pageCheck.category) {
        // Direct page token
        return { pageId: meData.id, pageToken: token, pageName: meData.name };
    }

    // User token — get first managed page
    const configuredPageId = process.env.FACEBOOK_PAGE_ID;
    const pagesResponse = await fetch(`${GRAPH_API_BASE}/me/accounts?fields=id,name,access_token&access_token=${token}`);
    const pagesData = await pagesResponse.json();

    if (!pagesData.data || pagesData.data.length === 0) {
        throw new Error('No Facebook Pages accessible. Token needs pages_manage_posts + pages_show_list permissions.');
    }

    // Use configured page ID or first page
    const page = configuredPageId
        ? pagesData.data.find(p => p.id === configuredPageId) || pagesData.data[0]
        : pagesData.data[0];

    return { pageId: page.id, pageToken: page.access_token, pageName: page.name };
}

/**
 * Post text to Facebook Page
 * @param {string} text - Post content
 * @returns {Promise<object>} Post result
 */
export async function postToFacebook(text) {
    const { pageId, pageToken, pageName } = await resolvePageCredentials();

    const response = await fetch(`${GRAPH_API_BASE}/${pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: text,
            access_token: pageToken,
        }),
    });

    const data = await response.json();

    if (data.error) {
        throw new Error(`Facebook post failed: ${data.error.message}`);
    }

    console.log(`✅ Facebook post published to ${pageName}!`);
    console.log(`🔗 Post ID: ${data.id}`);

    return data;
}

/**
 * Post with an image to Facebook Page
 * @param {string} text - Post content
 * @param {string} imagePath - Path to image file
 * @returns {Promise<object>} Post result
 */
export async function postToFacebookWithImage(text, imagePath) {
    const { pageId, pageToken, pageName } = await resolvePageCredentials();

    console.log('📤 Uploading image to Facebook...');

    // Use multipart form-data for image upload
    const imageData = fs.readFileSync(imagePath);
    const boundary = '----FormBoundary' + Date.now();

    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="message"\r\n\r\n${text}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n${pageToken}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="source"; filename="${path.basename(imagePath)}"\r\nContent-Type: image/png\r\n\r\n`),
        imageData,
        Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const response = await fetch(`${GRAPH_API_BASE}/${pageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body: body,
    });

    const data = await response.json();

    if (data.error) {
        throw new Error(`Facebook image post failed: ${data.error.message}`);
    }

    console.log(`✅ Facebook image post published to ${pageName}!`);
    console.log(`🔗 Post ID: ${data.post_id || data.id}`);

    return data;
}

/**
 * Post with a video to Facebook Page
 * @param {string} text - Post content
 * @param {string} videoPath - Path to video file (mp4)
 * @returns {Promise<object>} Post result
 */
export async function postToFacebookWithVideo(text, videoPath) {
    const { pageId, pageToken, pageName } = await resolvePageCredentials();

    console.log('📤 Uploading video to Facebook...');

    const videoData = fs.readFileSync(videoPath);
    const boundary = '----FormBoundary' + Date.now();

    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="description"\r\n\r\n${text}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n${pageToken}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="source"; filename="${path.basename(videoPath)}"\r\nContent-Type: video/mp4\r\n\r\n`),
        videoData,
        Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const response = await fetch(`${GRAPH_API_BASE}/${pageId}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body: body,
    });

    const data = await response.json();

    if (data.error) {
        throw new Error(`Facebook video post failed: ${data.error.message}`);
    }

    console.log(`✅ Facebook video post published to ${pageName}!`);
    console.log(`🔗 Video ID: ${data.id}`);

    return data;
}

function getImageMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    return 'application/octet-stream';
}

/**
 * Set Facebook Page profile picture using a local image file
 * @param {string} imagePath - Path to image file
 * @returns {Promise<object>} API result
 */
export async function setFacebookProfilePicture(imagePath) {
    const { pageId, pageToken, pageName } = await resolvePageCredentials();

    if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
    }

    const imageData = fs.readFileSync(imagePath);
    const boundary = '----FormBoundary' + Date.now();
    const mimeType = getImageMimeType(imagePath);

    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n${pageToken}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="source"; filename="${path.basename(imagePath)}"\r\nContent-Type: ${mimeType}\r\n\r\n`),
        imageData,
        Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const response = await fetch(`${GRAPH_API_BASE}/${pageId}/picture`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body,
    });

    const data = await response.json();
    if (data.error) {
        throw new Error(`Facebook profile picture update failed: ${data.error.message}`);
    }

    if (data.success === false) {
        throw new Error('Facebook profile picture update failed: API returned success=false');
    }

    console.log(`✅ Facebook profile picture updated for ${pageName}!`);
    return data;
}

/**
 * Set Facebook Page profile picture using an image URL
 * @param {string} imageUrl - Publicly accessible image URL
 * @returns {Promise<object>} API result
 */
export async function setFacebookProfilePictureFromUrl(imageUrl) {
    const { pageId, pageToken, pageName } = await resolvePageCredentials();

    try {
        new URL(imageUrl);
    } catch {
        throw new Error(`Invalid image URL: ${imageUrl}`);
    }

    const body = new URLSearchParams({
        access_token: pageToken,
        url: imageUrl,
    });

    const response = await fetch(`${GRAPH_API_BASE}/${pageId}/picture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });

    const data = await response.json();
    if (data.error) {
        throw new Error(`Facebook profile picture update failed: ${data.error.message}`);
    }

    if (data.success === false) {
        throw new Error('Facebook profile picture update failed: API returned success=false');
    }

    console.log(`✅ Facebook profile picture updated for ${pageName}!`);
    return data;
}

/**
 * Set Facebook Page cover photo from a local image file
 * @param {string} imagePath - Path to image file
 * @param {number} offsetY - Vertical offset for cover positioning
 * @returns {Promise<object>} API result
 */
export async function setFacebookCoverPhoto(imagePath, offsetY = 0) {
    const { pageId, pageToken, pageName } = await resolvePageCredentials();

    if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
    }

    const imageData = fs.readFileSync(imagePath);
    const boundary = '----FormBoundary' + Date.now();
    const mimeType = getImageMimeType(imagePath);

    // Step 1: Upload photo (unpublished) to get a photo ID usable as cover
    const uploadBody = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="published"\r\n\r\nfalse\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n${pageToken}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="source"; filename="${path.basename(imagePath)}"\r\nContent-Type: ${mimeType}\r\n\r\n`),
        imageData,
        Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const uploadResponse = await fetch(`${GRAPH_API_BASE}/${pageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body: uploadBody,
    });

    const uploadData = await uploadResponse.json();
    if (uploadData.error) {
        throw new Error(`Facebook cover upload failed: ${uploadData.error.message}`);
    }

    const photoId = uploadData.id;
    if (!photoId) {
        throw new Error('Facebook cover upload failed: missing photo id');
    }

    // Step 2: Set uploaded photo as page cover
    const updateRequests = [
        new URLSearchParams({
            access_token: pageToken,
            cover: JSON.stringify({ cover_id: photoId, offset_y: Math.max(0, Number(offsetY) || 0) }),
        }),
        new URLSearchParams({
            access_token: pageToken,
            cover: photoId,
        }),
    ];

    let lastErrorMessage = null;

    for (const body of updateRequests) {
        const updateResponse = await fetch(`${GRAPH_API_BASE}/${pageId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        });

        let updateData;
        try {
            updateData = await updateResponse.json();
        } catch {
            updateData = null;
        }

        if (updateData === true || (updateData && updateData.success === true)) {
            console.log(`✅ Facebook cover photo updated for ${pageName}!`);
            return { success: true, photoId, update: updateData };
        }

        if (updateData && !updateData.error) {
            console.log(`✅ Facebook cover photo updated for ${pageName}!`);
            return { success: true, photoId, update: updateData };
        }

        lastErrorMessage = updateData?.error?.message || 'Unknown Facebook API error while setting cover';
    }

    throw new Error(`Facebook cover update failed: ${lastErrorMessage}`);
}

export default {
    testFacebookConnection,
    postToFacebook,
    postToFacebookWithImage,
    postToFacebookWithVideo,
    setFacebookProfilePicture,
    setFacebookProfilePictureFromUrl,
    setFacebookCoverPhoto,
};

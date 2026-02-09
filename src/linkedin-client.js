/**
 * LinkedIn API Client
 * Uses OAuth 2.0 for authentication and the Share API for posting.
 * Includes token refresh, expiry warnings, and alerting integration.
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { alertTokenExpiry, alertPostFailure } from './alerting.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.join(__dirname, '..', '.linkedin-token.json');

const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';
const TOKEN_WARN_DAYS = 7;  // Alert when token expires in fewer than this many days
const TOKEN_REFRESH_DAYS = 10; // Attempt refresh when fewer than this many days remain

/**
 * Load stored access token
 */
function loadToken() {
    try {
        if (fs.existsSync(TOKEN_FILE)) {
            return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
        }
    } catch (e) {
        console.error('Error loading LinkedIn token:', e.message);
    }
    return null;
}

/**
 * Save access token
 */
function saveToken(token) {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2));
}

/**
 * Get current access token or throw if not authenticated.
 * Also checks for upcoming expiry and fires alerts.
 */
function getAccessToken() {
    const token = loadToken();
    if (!token || !token.access_token) {
        throw new Error('LinkedIn not authenticated. Run: npm run linkedin:auth');
    }

    // Check if token is expired
    if (token.expires_at && Date.now() > token.expires_at) {
        throw new Error('LinkedIn token expired. Run: npm run linkedin:auth');
    }

    // Check for upcoming expiry and warn
    if (token.expires_at) {
        const daysLeft = Math.floor((token.expires_at - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysLeft <= TOKEN_WARN_DAYS) {
            console.warn(`⚠️ LinkedIn token expires in ${daysLeft} days!`);
            alertTokenExpiry('LinkedIn', daysLeft).catch(() => { });
        }
    }

    return token.access_token;
}

/**
 * Attempt to refresh the LinkedIn access token using the refresh_token.
 * LinkedIn Community Management API tokens support refresh_token grants.
 * @returns {Promise<boolean>} True if refresh succeeded
 */
export async function refreshToken() {
    const token = loadToken();
    if (!token?.refresh_token) {
        console.log('ℹ️ No refresh_token available — manual re-auth required.');
        return false;
    }

    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

    try {
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: token.refresh_token,
            client_id: clientId,
            client_secret: clientSecret,
        });

        const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params,
        });

        if (!response.ok) {
            const error = await response.text();
            console.error(`❌ Token refresh failed: ${response.status} - ${error}`);
            return false;
        }

        const newToken = await response.json();
        newToken.expires_at = Date.now() + (newToken.expires_in * 1000);

        // Preserve refresh_token if not returned in the new response
        if (!newToken.refresh_token && token.refresh_token) {
            newToken.refresh_token = token.refresh_token;
        }

        saveToken(newToken);
        const days = Math.round(newToken.expires_in / 86400);
        console.log(`✅ LinkedIn token refreshed! Expires in ${days} days.`);
        return true;
    } catch (err) {
        console.error(`❌ Token refresh error: ${err.message}`);
        return false;
    }
}

/**
 * Check token health: refresh if close to expiry, alert if manual intervention needed.
 * Call this from health checks or before posting.
 */
export async function ensureTokenHealth() {
    const token = loadToken();
    if (!token?.access_token) return false;

    if (token.expires_at) {
        const daysLeft = Math.floor((token.expires_at - Date.now()) / (1000 * 60 * 60 * 24));

        if (daysLeft <= 0) {
            console.error('❌ LinkedIn token has expired.');
            // Try refresh as last resort
            return await refreshToken();
        }

        if (daysLeft <= TOKEN_REFRESH_DAYS) {
            console.log(`⏳ LinkedIn token expires in ${daysLeft} days — attempting refresh...`);
            const refreshed = await refreshToken();
            if (!refreshed && daysLeft <= TOKEN_WARN_DAYS) {
                await alertTokenExpiry('LinkedIn', daysLeft).catch(() => { });
            }
            return refreshed || daysLeft > 0; // Still valid even if refresh failed
        }
    }

    return true;
}

/**
 * Get the authenticated user's profile (for getting user URN)
 */
export async function getProfile() {
    const accessToken = getAccessToken();

    const response = await fetch(`${LINKEDIN_API_BASE}/userinfo`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`LinkedIn API error: ${response.status} - ${error}`);
    }

    return response.json();
}

/**
 * Post to LinkedIn
 * @param {string} text - Post content
 * @returns {Promise<object>} Post response
 */
export async function postToLinkedIn(text) {
    const accessToken = getAccessToken();

    // Get user ID first
    const profile = await getProfile();
    const userUrn = `urn:li:person:${profile.sub}`;

    const postBody = {
        author: userUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
            'com.linkedin.ugc.ShareContent': {
                shareCommentary: {
                    text: text,
                },
                shareMediaCategory: 'NONE',
            },
        },
        visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
    };

    const response = await fetch(`${LINKEDIN_API_BASE}/ugcPosts`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(postBody),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`LinkedIn post failed: ${response.status} - ${error}`);
    }

    const result = await response.json();
    console.log('✅ LinkedIn post published!');
    console.log(`🔗 Post ID: ${result.id}`);

    return result;
}

/**
 * Test LinkedIn connection
 */
export async function testLinkedInConnection() {
    try {
        const profile = await getProfile();
        console.log(`✅ LinkedIn connected as: ${profile.name}`);
        console.log(`   Email: ${profile.email}`);
        return true;
    } catch (error) {
        console.error('❌ LinkedIn connection failed:', error.message);
        return false;
    }
}

/**
 * Post to LinkedIn with an image
 * @param {string} text - Post content
 * @param {string} imagePath - Path to image file
 * @returns {Promise<object>} Post response
 */
export async function postToLinkedInWithImage(text, imagePath) {
    const accessToken = getAccessToken();

    // Get user ID first
    const profile = await getProfile();
    const userUrn = `urn:li:person:${profile.sub}`;

    console.log('📤 Uploading image to LinkedIn...');

    // Step 1: Register the image upload
    const registerResponse = await fetch(`${LINKEDIN_API_BASE}/assets?action=registerUpload`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            registerUploadRequest: {
                recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
                owner: userUrn,
                serviceRelationships: [{
                    relationshipType: 'OWNER',
                    identifier: 'urn:li:userGeneratedContent'
                }]
            }
        }),
    });

    if (!registerResponse.ok) {
        const error = await registerResponse.text();
        throw new Error(`LinkedIn image register failed: ${registerResponse.status} - ${error}`);
    }

    const registerData = await registerResponse.json();
    const uploadUrl = registerData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
    const asset = registerData.value.asset;

    // Step 2: Upload the image binary
    const imageData = fs.readFileSync(imagePath);
    const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'image/png',
        },
        body: imageData,
    });

    if (!uploadResponse.ok) {
        const error = await uploadResponse.text();
        throw new Error(`LinkedIn image upload failed: ${uploadResponse.status} - ${error}`);
    }

    console.log('✅ Image uploaded to LinkedIn');

    // Step 3: Create the post with the image
    const postBody = {
        author: userUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
            'com.linkedin.ugc.ShareContent': {
                shareCommentary: {
                    text: text,
                },
                shareMediaCategory: 'IMAGE',
                media: [{
                    status: 'READY',
                    media: asset,
                }],
            },
        },
        visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
    };

    const response = await fetch(`${LINKEDIN_API_BASE}/ugcPosts`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(postBody),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`LinkedIn post with image failed: ${response.status} - ${error}`);
    }

    const result = await response.json();
    console.log('✅ LinkedIn post with image published!');
    console.log(`🔗 Post ID: ${result.id}`);

    return result;
}

/**
 * Post to LinkedIn with a video
 * @param {string} text - Post content
 * @param {string} videoPath - Path to video file (mp4)
 * @returns {Promise<object>} Post response
 */
export async function postToLinkedInWithVideo(text, videoPath) {
    const accessToken = getAccessToken();

    // Get user ID first
    const profile = await getProfile();
    const userUrn = `urn:li:person:${profile.sub}`;

    console.log('📤 Uploading video to LinkedIn...');

    // Get file size
    const stats = fs.statSync(videoPath);
    const fileSize = stats.size;

    // Step 1: Register the video upload
    const registerResponse = await fetch(`${LINKEDIN_API_BASE}/assets?action=registerUpload`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            registerUploadRequest: {
                recipes: ['urn:li:digitalmediaRecipe:feedshare-video'],
                owner: userUrn,
                serviceRelationships: [{
                    relationshipType: 'OWNER',
                    identifier: 'urn:li:userGeneratedContent'
                }],
                supportedUploadMechanism: ['SINGLE_REQUEST_UPLOAD'],
                fileSize: fileSize,
            }
        }),
    });

    if (!registerResponse.ok) {
        const error = await registerResponse.text();
        throw new Error(`LinkedIn video register failed: ${registerResponse.status} - ${error}`);
    }

    const registerData = await registerResponse.json();
    const uploadUrl = registerData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
    const asset = registerData.value.asset;

    // Step 2: Upload the video binary
    const videoData = fs.readFileSync(videoPath);
    const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'video/mp4',
            'Content-Length': fileSize.toString(),
        },
        body: videoData,
    });

    if (!uploadResponse.ok) {
        const error = await uploadResponse.text();
        throw new Error(`LinkedIn video upload failed: ${uploadResponse.status} - ${error}`);
    }

    console.log('⏳ Waiting for LinkedIn video processing...');

    // Step 3: Wait for video processing
    await waitForLinkedInVideoProcessing(asset, accessToken);

    console.log('✅ Video uploaded to LinkedIn');

    // Step 4: Create the post with the video
    const postBody = {
        author: userUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
            'com.linkedin.ugc.ShareContent': {
                shareCommentary: {
                    text: text,
                },
                shareMediaCategory: 'VIDEO',
                media: [{
                    status: 'READY',
                    media: asset,
                }],
            },
        },
        visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
    };

    const response = await fetch(`${LINKEDIN_API_BASE}/ugcPosts`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(postBody),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`LinkedIn post with video failed: ${response.status} - ${error}`);
    }

    const result = await response.json();
    console.log('✅ LinkedIn post with video published!');
    console.log(`🔗 Post ID: ${result.id}`);

    return result;
}

/**
 * Wait for LinkedIn video processing
 */
async function waitForLinkedInVideoProcessing(asset, accessToken, maxWaitMs = 120000) {
    const startTime = Date.now();
    const assetId = asset.split(':').pop();

    while (Date.now() - startTime < maxWaitMs) {
        try {
            const response = await fetch(`${LINKEDIN_API_BASE}/assets/${assetId}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
            });

            if (response.ok) {
                const data = await response.json();
                const status = data.recipes?.[0]?.status;

                if (status === 'AVAILABLE') {
                    return;
                }

                if (status === 'FAILED') {
                    throw new Error('LinkedIn video processing failed');
                }
            }
        } catch (error) {
            if (error.message.includes('processing failed')) {
                throw error;
            }
        }

        await new Promise(r => setTimeout(r, 5000));
    }
}

/**
 * Generate OAuth authorization URL
 */
export function getAuthUrl() {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const redirectUri = 'http://localhost:3000/callback';
    const scope = 'openid profile email w_member_social';

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: scope,
        state: 'ghostai-bot',
    });

    return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(code) {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    const redirectUri = 'http://localhost:3000/callback';

    const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
    });

    const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Token exchange failed: ${response.status} - ${error}`);
    }

    const token = await response.json();

    // Calculate expiration time
    token.expires_at = Date.now() + (token.expires_in * 1000);

    // Save token
    saveToken(token);

    console.log('✅ LinkedIn authenticated successfully!');
    console.log(`   Token expires in ${Math.round(token.expires_in / 86400)} days`);

    return token;
}

export default {
    postToLinkedIn,
    postToLinkedInWithImage,
    postToLinkedInWithVideo,
    testLinkedInConnection,
    getAuthUrl,
    exchangeCodeForToken,
    getProfile,
    refreshToken,
    ensureTokenHealth,
};

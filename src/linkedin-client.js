/**
 * LinkedIn API Client
 * Uses OAuth 2.0 for authentication and the Share API for posting
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.join(__dirname, '..', '.linkedin-token.json');

const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';

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
 * Get current access token or throw if not authenticated
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

    return token.access_token;
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
    testLinkedInConnection,
    getAuthUrl,
    exchangeCodeForToken,
    getProfile,
};

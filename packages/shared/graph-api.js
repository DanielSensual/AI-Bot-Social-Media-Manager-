/**
 * Facebook/Instagram Graph API Helpers — @ghostai/shared
 * Centralizes page-token resolution that was duplicated across analytics.js,
 * facebook-client.js, and instagram-engagement.js.
 */

import dotenv from 'dotenv';
dotenv.config();

const GRAPH_API_VERSION = 'v24.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const DEFAULT_GHOSTAI_FACEBOOK_PAGE_ID = '753873537816019';

// Cache resolved page tokens to avoid redundant API calls within a session
let cachedPageToken = null;
let cachedPageId = null;
let cachedRequestedPageId = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getPreferredPageId() {
    return process.env.FACEBOOK_PAGE_ID || process.env.GHOSTAI_FACEBOOK_PAGE_ID || DEFAULT_GHOSTAI_FACEBOOK_PAGE_ID;
}

/**
 * Resolve the Facebook Page access token.
 * If the provided token is a user token, exchanges it for a page token.
 * Caches the result for 30 minutes.
 *
 * @param {string} [token] - User or page access token. Falls back to env vars.
 * @returns {Promise<{ pageToken: string, pageId: string } | null>}
 */
export async function resolvePageToken(token) {
    const tokenCandidates = token
        ? [token]
        : [process.env.FACEBOOK_PAGE_ACCESS_TOKEN, process.env.FACEBOOK_ACCESS_TOKEN].filter(Boolean);
    if (tokenCandidates.length === 0) return null;
    const preferredPageId = getPreferredPageId();

    // Return cached if fresh
    if (
        cachedPageToken &&
        Date.now() - cacheTimestamp < CACHE_TTL_MS &&
        cachedRequestedPageId === preferredPageId
    ) {
        return { pageToken: cachedPageToken, pageId: cachedPageId };
    }

    let lastError = null;

    for (const candidate of [...new Set(tokenCandidates)]) {
        try {
            const meResponse = await fetch(`${GRAPH_API_BASE}/me?fields=id&access_token=${candidate}`);
            const meData = await meResponse.json();
            if (meData.error) {
                lastError = new Error(meData.error.message);
                continue;
            }

            const pageCheck = await fetch(`${GRAPH_API_BASE}/${meData.id}?fields=category&access_token=${candidate}`);
            const pageCheckData = await pageCheck.json();

            if (!pageCheckData.error && pageCheckData.category) {
                if (preferredPageId && String(meData.id) !== String(preferredPageId)) {
                    lastError = new Error(`Page token targets ${meData.id}, not requested page ${preferredPageId}`);
                    continue;
                }

                cachedPageToken = candidate;
                cachedPageId = meData.id;
                cachedRequestedPageId = preferredPageId;
                cacheTimestamp = Date.now();
                return { pageToken: candidate, pageId: meData.id };
            }

            const pagesResponse = await fetch(`${GRAPH_API_BASE}/me/accounts?fields=id,access_token&access_token=${candidate}`);
            const pagesData = await pagesResponse.json();

            if (pagesData.data?.length) {
                const page = pagesData.data.find((entry) => String(entry.id) === String(preferredPageId)) || pagesData.data[0];
                cachedPageToken = page.access_token;
                cachedPageId = page.id;
                cachedRequestedPageId = preferredPageId;
                cacheTimestamp = Date.now();
                return { pageToken: cachedPageToken, pageId: cachedPageId };
            }
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) {
        return null;
    }

    return null;
}

/**
 * Clear the page token cache (useful after token refresh)
 */
export function clearPageTokenCache() {
    cachedPageToken = null;
    cachedPageId = null;
    cachedRequestedPageId = null;
    cacheTimestamp = 0;
}

/**
 * Get the Graph API base URL
 */
export function getGraphApiBase() {
    return GRAPH_API_BASE;
}

/**
 * Get the Graph API version string
 */
export function getGraphApiVersion() {
    return GRAPH_API_VERSION;
}

export default { resolvePageToken, clearPageTokenCache, getGraphApiBase, getGraphApiVersion };

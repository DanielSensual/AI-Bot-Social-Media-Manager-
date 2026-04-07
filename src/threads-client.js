/**
 * Threads API Client
 * 
 * Wraps Meta's Threads API (graph.threads.net) for:
 * - Publishing text, image, and carousel posts (2-step: create → publish)
 * - Replying to existing threads
 * - Fetching user profile + recent posts
 * - Reading conversation threads for engagement
 * 
 * Auth: Long-lived Threads user access token via THREADS_ACCESS_TOKEN env var.
 * User ID: THREADS_USER_ID env var (your Threads numeric user ID).
 * 
 * API Reference: https://developers.facebook.com/docs/threads
 */

import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'https://graph.threads.net/v1.0';
const MAX_TEXT_LENGTH = 500;
const PUBLISH_POLL_INTERVAL_MS = 3000;
const PUBLISH_POLL_MAX_ATTEMPTS = 10;

function getToken() {
    const token = process.env.THREADS_ACCESS_TOKEN;
    if (!token) throw new Error('THREADS_ACCESS_TOKEN is not configured');
    return token;
}

function getUserId() {
    const id = process.env.THREADS_USER_ID;
    if (!id) throw new Error('THREADS_USER_ID is not configured');
    return id;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Make an authenticated request to the Threads API
 */
async function threadsRequest(path, options = {}) {
    const token = getToken();
    const url = new URL(`${BASE_URL}${path}`);
    
    if (options.method === 'GET' || !options.method) {
        url.searchParams.set('access_token', token);
        if (options.params) {
            for (const [k, v] of Object.entries(options.params)) {
                url.searchParams.set(k, v);
            }
        }
    }

    const fetchOptions = {
        method: options.method || 'GET',
        headers: { 'Content-Type': 'application/json' },
    };

    if (options.method === 'POST') {
        const body = { access_token: token, ...(options.body || {}) };
        fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url.toString(), fetchOptions);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const msg = data?.error?.message || `Threads API error ${response.status}`;
        const err = new Error(msg);
        err.status = response.status;
        err.code = data?.error?.code;
        throw err;
    }

    return data;
}

// ─── Profile ────────────────────────────────────────────────────

/**
 * Get current user's Threads profile
 */
export async function getProfile() {
    const userId = getUserId();
    return threadsRequest(`/${userId}`, {
        params: {
            fields: 'id,username,name,threads_profile_picture_url,threads_biography',
        },
    });
}

// ─── Publishing (2-step) ────────────────────────────────────────

/**
 * Step 1: Create a media container
 * @param {object} options
 * @param {string} options.text - Post text (max 500 chars)
 * @param {string} [options.imageUrl] - URL to an image to attach
 * @param {string} [options.videoUrl] - URL to a video to attach
 * @param {string} [options.replyToId] - Thread ID to reply to
 * @returns {Promise<{id: string}>} Container ID
 */
export async function createContainer(options = {}) {
    const userId = getUserId();
    const body = {};

    // Determine media type
    if (options.imageUrl) {
        body.media_type = 'IMAGE';
        body.image_url = options.imageUrl;
    } else if (options.videoUrl) {
        body.media_type = 'VIDEO';
        body.video_url = options.videoUrl;
    } else {
        body.media_type = 'TEXT';
    }

    // Add text
    if (options.text) {
        body.text = options.text.substring(0, MAX_TEXT_LENGTH);
    }

    // Reply mode
    if (options.replyToId) {
        body.reply_to_id = options.replyToId;
    }

    return threadsRequest(`/${userId}/threads`, {
        method: 'POST',
        body,
    });
}

/**
 * Step 2: Publish a media container
 * @param {string} containerId - The container ID from createContainer
 * @returns {Promise<{id: string}>} Published post ID
 */
export async function publishContainer(containerId) {
    const userId = getUserId();
    return threadsRequest(`/${userId}/threads_publish`, {
        method: 'POST',
        body: { creation_id: containerId },
    });
}

/**
 * Wait for container to be ready, then publish
 */
async function waitAndPublish(containerId) {
    // For text posts, containers are usually ready immediately
    // For media, we may need to poll
    for (let i = 0; i < PUBLISH_POLL_MAX_ATTEMPTS; i++) {
        try {
            return await publishContainer(containerId);
        } catch (err) {
            if (err.code === 2207026 || err.message?.includes('not ready')) {
                console.log(`   ⏳ Container not ready, polling... [${i + 1}/${PUBLISH_POLL_MAX_ATTEMPTS}]`);
                await sleep(PUBLISH_POLL_INTERVAL_MS);
                continue;
            }
            throw err;
        }
    }
    throw new Error('Container did not become ready in time');
}

/**
 * High-level: publish a text post
 */
export async function publishText(text) {
    const container = await createContainer({ text });
    return waitAndPublish(container.id);
}

/**
 * High-level: reply to a thread
 */
export async function replyToThread(threadId, text) {
    const container = await createContainer({ text, replyToId: threadId });
    return waitAndPublish(container.id);
}

/**
 * High-level: publish with an image
 */
export async function publishImage(text, imageUrl) {
    const container = await createContainer({ text, imageUrl });
    return waitAndPublish(container.id);
}

// ─── Reading ────────────────────────────────────────────────────

/**
 * Get user's recent threads
 */
export async function getMyThreads(limit = 25) {
    const userId = getUserId();
    return threadsRequest(`/${userId}/threads`, {
        params: {
            fields: 'id,text,timestamp,media_type,permalink,is_reply,shortcode',
            limit: String(limit),
        },
    });
}

/**
 * Get a single thread post
 */
export async function getThread(threadId) {
    return threadsRequest(`/${threadId}`, {
        params: {
            fields: 'id,text,timestamp,media_type,permalink,username,is_reply',
        },
    });
}

/**
 * Get replies to a thread
 */
export async function getReplies(threadId) {
    return threadsRequest(`/${threadId}/replies`, {
        params: {
            fields: 'id,text,timestamp,username,is_reply',
        },
    });
}

/**
 * Get conversation / thread of replies for a post
 */
export async function getConversation(threadId) {
    return threadsRequest(`/${threadId}/conversation`, {
        params: {
            fields: 'id,text,timestamp,username,is_reply',
        },
    });
}

// ─── Utilities ──────────────────────────────────────────────────

export function hasThreadsCredentials() {
    return Boolean(process.env.THREADS_ACCESS_TOKEN && process.env.THREADS_USER_ID);
}

export function truncateText(text, maxLen = MAX_TEXT_LENGTH) {
    if (!text) return '';
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen - 3).trimEnd() + '...';
}

export default {
    getProfile,
    createContainer,
    publishContainer,
    publishText,
    publishImage,
    replyToThread,
    getMyThreads,
    getThread,
    getReplies,
    getConversation,
    hasThreadsCredentials,
    truncateText,
};

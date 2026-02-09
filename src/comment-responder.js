/**
 * Facebook Comment Auto-Responder
 * AI-powered replies to comments on Facebook Page posts
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const LOGS_DIR = path.join(__dirname, '..', 'logs', 'facebook-comments');
const REPLIED_FILE = path.join(__dirname, '..', '.fb-comment-replied.json');

fs.mkdirSync(LOGS_DIR, { recursive: true });

const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

/**
 * Get page credentials
 */
async function getPageCredentials() {
    const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN;
    if (!token) throw new Error('Facebook not configured.');

    const meResponse = await fetch(`${GRAPH_API_BASE}/me?fields=id,name&access_token=${token}`);
    const meData = await meResponse.json();
    if (meData.error) throw new Error(`Facebook API error: ${meData.error.message}`);

    const pageCheck = await fetch(`${GRAPH_API_BASE}/${meData.id}?fields=category&access_token=${token}`);
    const pageCheckData = await pageCheck.json();

    if (!pageCheckData.error && pageCheckData.category) {
        return { pageId: meData.id, pageToken: token, pageName: meData.name };
    }

    const pagesResponse = await fetch(`${GRAPH_API_BASE}/me/accounts?fields=id,name,access_token&access_token=${token}`);
    const pagesData = await pagesResponse.json();

    if (!pagesData.data || pagesData.data.length === 0) {
        throw new Error('No Facebook Pages found.');
    }

    const configuredPageId = process.env.FACEBOOK_PAGE_ID;
    const page = configuredPageId
        ? pagesData.data.find(p => p.id === configuredPageId) || pagesData.data[0]
        : pagesData.data[0];

    return { pageId: page.id, pageToken: page.access_token, pageName: page.name };
}

/**
 * Load already-replied comment IDs
 */
function loadReplied() {
    try {
        if (fs.existsSync(REPLIED_FILE)) {
            return new Set(JSON.parse(fs.readFileSync(REPLIED_FILE, 'utf-8')));
        }
    } catch { /* ignore */ }
    return new Set();
}

function saveReplied(repliedSet) {
    const arr = [...repliedSet].slice(-1000);
    fs.writeFileSync(REPLIED_FILE, JSON.stringify(arr, null, 2));
}

/**
 * Get recent posts from the page
 */
async function getRecentPosts(pageId, pageToken, limit = 5) {
    const response = await fetch(`${GRAPH_API_BASE}/${pageId}/posts?fields=id,message,created_time&limit=${limit}&access_token=${pageToken}`);
    const data = await response.json();
    if (data.error) throw new Error(`Failed to fetch posts: ${data.error.message}`);
    return data.data || [];
}

/**
 * Get comments on a post, filtering out page's own comments
 */
async function getPostComments(postId, pageId, pageToken, limit = 25) {
    const response = await fetch(`${GRAPH_API_BASE}/${postId}/comments?fields=id,from,message,created_time,comment_count&limit=${limit}&access_token=${pageToken}`);
    const data = await response.json();
    if (data.error) return [];

    // Filter to comments NOT from the page itself
    return (data.data || []).filter(c => c.from?.id !== pageId);
}

/**
 * Check if the page already replied to a comment
 */
async function hasPageReplied(commentId, pageId, pageToken) {
    const response = await fetch(`${GRAPH_API_BASE}/${commentId}/comments?fields=from&limit=10&access_token=${pageToken}`);
    const data = await response.json();
    if (data.error || !data.data) return false;
    return data.data.some(reply => reply.from?.id === pageId);
}

/**
 * Generate AI reply to a comment
 */
async function generateCommentReply(comment, postMessage) {
    if (!openai) return 'Thanks for your comment! 🙌';

    const prompt = `You are replying to a Facebook comment on behalf of the page "Artificial Intelligence Knowledge" by Ghost AI Systems (an AI automation agency).

POST CONTEXT:
${postMessage || '(no post text available)'}

COMMENT FROM ${comment.from?.name || 'someone'}:
${comment.message}

Generate a brief, engaging reply that:
1. Is relevant to their specific comment
2. Adds value (insight, gratitude, or follow-up question)
3. Is 1-2 sentences max
4. Sounds human and approachable
5. Encourages further engagement

DO NOT mention you are AI or add any disclaimer.
DO NOT be generic — reference something specific from their comment.

Reply:`;

    const completion = await openai.chat.completions.create({
        model: 'gpt-5.2',
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 200,
    });

    return completion.choices[0].message.content.trim();
}

/**
 * Post a reply to a comment
 */
async function postCommentReply(commentId, message, pageToken) {
    const response = await fetch(`${GRAPH_API_BASE}/${commentId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message,
            access_token: pageToken,
        }),
    });

    const data = await response.json();
    if (data.error) {
        throw new Error(`Reply failed: ${data.error.message}`);
    }
    return data;
}

/**
 * Log comment interaction
 */
function logInteraction(commentFrom, commentText, reply, postId) {
    const timestamp = new Date().toISOString();
    const dateStr = timestamp.split('T')[0];
    const logFile = path.join(LOGS_DIR, `${dateStr}.json`);

    let logs = [];
    if (fs.existsSync(logFile)) {
        try { logs = JSON.parse(fs.readFileSync(logFile, 'utf-8')); } catch { logs = []; }
    }

    logs.push({ timestamp, postId, commentFrom, commentText, reply });
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
}

/**
 * Main: scan recent posts and reply to unreplied comments
 */
export async function respondToComments(options = {}) {
    const { dryRun = false, limit = 10, postsToScan = 5 } = options;

    console.log('');
    console.log('💬 Facebook Comment Auto-Responder');
    console.log('═'.repeat(50));
    console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`   Max replies: ${limit}`);
    console.log(`   Posts to scan: ${postsToScan}`);
    console.log('');

    const { pageId, pageToken, pageName } = await getPageCredentials();
    console.log(`✅ Page: ${pageName}`);

    const posts = await getRecentPosts(pageId, pageToken, postsToScan);
    console.log(`📋 Found ${posts.length} recent post(s)`);

    const replied = loadReplied();
    let replyCount = 0;

    for (const post of posts) {
        if (replyCount >= limit) break;

        const comments = await getPostComments(post.id, pageId, pageToken);
        if (comments.length === 0) continue;

        console.log('');
        console.log(`📝 Post: "${(post.message || '').substring(0, 50)}..."`);
        console.log(`   ${comments.length} user comment(s)`);

        for (const comment of comments) {
            if (replyCount >= limit) break;
            if (replied.has(comment.id)) continue;

            // Double-check we haven't already replied via API
            const alreadyReplied = await hasPageReplied(comment.id, pageId, pageToken);
            if (alreadyReplied) {
                replied.add(comment.id);
                continue;
            }

            console.log(`   💬 ${comment.from?.name}: "${comment.message?.substring(0, 50)}..."`);

            const reply = await generateCommentReply(comment, post.message);
            console.log(`   🤖 Reply: "${reply.substring(0, 60)}..."`);

            if (dryRun) {
                console.log('   🔒 DRY RUN - Not replying');
            } else {
                try {
                    await postCommentReply(comment.id, reply, pageToken);
                    console.log('   ✅ Replied!');
                    logInteraction(comment.from?.name, comment.message, reply, post.id);
                    replied.add(comment.id);
                    replyCount++;
                } catch (error) {
                    console.error(`   ❌ Failed: ${error.message}`);
                }
            }
        }
    }

    saveReplied(replied);

    console.log('');
    console.log('═'.repeat(50));
    console.log(`✅ Done! Replied to ${replyCount} comment(s)`);

    return { success: true, replied: replyCount };
}

export default { respondToComments };

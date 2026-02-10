/**
 * Instagram Comment Auto-Responder
 * AI-powered replies to comments on Instagram posts via IG Graph API
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hasLLMProvider, generateText } from './llm-client.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GRAPH_API_VERSION = 'v24.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const LOGS_DIR = path.join(__dirname, '..', 'logs', 'instagram-comments');
const REPLIED_FILE = path.join(__dirname, '..', '.ig-comment-replied.json');

fs.mkdirSync(LOGS_DIR, { recursive: true });

/**
 * Get Instagram credentials (IG User ID + Page Token)
 */
async function getInstagramCredentials() {
    const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN;
    if (!token) throw new Error('Facebook/Instagram not configured.');

    // First check if token is a page token directly
    const meResponse = await fetch(`${GRAPH_API_BASE}/me?fields=id,name&access_token=${token}`);
    const meData = await meResponse.json();
    if (meData.error) throw new Error(`API error: ${meData.error.message}`);

    // Try to get IG account from current token (might be page token)
    let pageId = meData.id;
    let pageToken = token;

    // Check if this is a user token — if so, get page token
    const pageCheck = await fetch(`${GRAPH_API_BASE}/${meData.id}?fields=category&access_token=${token}`);
    const pageCheckData = await pageCheck.json();

    if (pageCheckData.error || !pageCheckData.category) {
        // User token — get page token
        const pagesResponse = await fetch(`${GRAPH_API_BASE}/me/accounts?fields=id,name,access_token&access_token=${token}`);
        const pagesData = await pagesResponse.json();
        if (!pagesData.data?.length) throw new Error('No Facebook Pages found.');

        const page = pagesData.data[0];
        pageId = page.id;
        pageToken = page.access_token;
    }

    // Get linked Instagram Business Account
    const igResponse = await fetch(`${GRAPH_API_BASE}/${pageId}?fields=instagram_business_account&access_token=${pageToken}`);
    const igData = await igResponse.json();

    if (!igData.instagram_business_account?.id) {
        throw new Error('No Instagram Business Account linked to this Facebook Page.');
    }

    return {
        igUserId: igData.instagram_business_account.id,
        pageToken,
        pageId,
    };
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
    const arr = [...repliedSet].slice(-2000);
    fs.writeFileSync(REPLIED_FILE, JSON.stringify(arr, null, 2));
}

/**
 * Get recent media from IG account
 */
async function getRecentMedia(igUserId, pageToken, limit = 5) {
    const response = await fetch(
        `${GRAPH_API_BASE}/${igUserId}/media?fields=id,caption,timestamp,media_type&limit=${limit}&access_token=${pageToken}`
    );
    const data = await response.json();
    if (data.error) throw new Error(`Failed to fetch media: ${data.error.message}`);
    return data.data || [];
}

/**
 * Get comments on a media item
 */
async function getMediaComments(mediaId, pageToken, limit = 25) {
    const response = await fetch(
        `${GRAPH_API_BASE}/${mediaId}/comments?fields=id,text,from,timestamp,replies{id,text,from}&limit=${limit}&access_token=${pageToken}`
    );
    const data = await response.json();
    if (data.error) return [];
    return data.data || [];
}

/**
 * Check if we already replied to this comment
 */
function hasReply(comment, igUserId) {
    if (!comment.replies?.data) return false;
    return comment.replies.data.some(reply => reply.from?.id === igUserId);
}

/**
 * Generate AI reply to an Instagram comment
 */
async function generateCommentReply(comment, postCaption) {
    if (!hasLLMProvider()) return 'Thanks! 🙌';

    const prompt = `You are replying to an Instagram comment on behalf of @ghostaisystems (Ghost AI Systems — an AI automation agency that ships production-ready websites in 72 hours).

POST CAPTION:
${postCaption || '(no caption)'}

COMMENT FROM ${comment.from?.username || 'someone'}:
${comment.text}

Generate a brief, engaging reply:
1. Reference something specific from their comment
2. Be friendly, witty, and human-sounding
3. 1-2 sentences max
4. Add an emoji or two
5. If relevant, softly mention ghostaisystems.com
6. DO NOT mention you are AI
7. DO NOT be generic — make it feel personal

Reply:`;

    const { text } = await generateText({
        prompt,
        maxOutputTokens: 150,
        openaiModel: 'gpt-5.2',
        geminiModel: process.env.GEMINI_MODEL || 'gemini-3-pro-preview',
    });

    return text.trim();
}

/**
 * Post a reply to a comment
 */
async function postCommentReply(commentId, message, pageToken) {
    const response = await fetch(`${GRAPH_API_BASE}/${commentId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message,
            access_token: pageToken,
        }),
    });

    const data = await response.json();
    if (data.error) throw new Error(`Reply failed: ${data.error.message}`);
    return data;
}

/**
 * Log interaction
 */
function logInteraction(commentFrom, commentText, reply, mediaId) {
    const timestamp = new Date().toISOString();
    const dateStr = timestamp.split('T')[0];
    const logFile = path.join(LOGS_DIR, `${dateStr}.json`);

    let logs = [];
    if (fs.existsSync(logFile)) {
        try { logs = JSON.parse(fs.readFileSync(logFile, 'utf-8')); } catch { logs = []; }
    }

    logs.push({ timestamp, mediaId, commentFrom, commentText, reply });
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
}

/**
 * Main: scan recent posts and reply to unreplied comments
 */
export async function respondToInstagramComments(options = {}) {
    const { dryRun = false, limit = 10, postsToScan = 5 } = options;

    console.log('');
    console.log('📸 Instagram Comment Auto-Responder');
    console.log('═'.repeat(50));
    console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`   Max replies: ${limit}`);
    console.log(`   Posts to scan: ${postsToScan}`);
    console.log('');

    const { igUserId, pageToken } = await getInstagramCredentials();
    console.log(`✅ Instagram account connected (ID: ${igUserId})`);

    const media = await getRecentMedia(igUserId, pageToken, postsToScan);
    console.log(`📋 Found ${media.length} recent post(s)`);

    const replied = loadReplied();
    let replyCount = 0;

    for (const post of media) {
        if (replyCount >= limit) break;

        const comments = await getMediaComments(post.id, pageToken);
        if (comments.length === 0) continue;

        console.log('');
        console.log(`📝 Post: "${(post.caption || '').substring(0, 50)}..."`);
        console.log(`   ${comments.length} comment(s)`);

        for (const comment of comments) {
            if (replyCount >= limit) break;
            if (replied.has(comment.id)) continue;

            // Skip if we already replied
            if (hasReply(comment, igUserId)) {
                replied.add(comment.id);
                continue;
            }

            console.log(`   💬 @${comment.from?.username || '?'}: "${comment.text?.substring(0, 50)}..."`);

            const reply = await generateCommentReply(comment, post.caption);
            console.log(`   🤖 Reply: "${reply.substring(0, 60)}..."`);

            if (dryRun) {
                console.log('   🔒 DRY RUN — skipped');
            } else {
                try {
                    await postCommentReply(comment.id, reply, pageToken);
                    console.log('   ✅ Replied!');
                    logInteraction(comment.from?.username, comment.text, reply, post.id);
                    replied.add(comment.id);
                    replyCount++;
                } catch (error) {
                    console.error(`   ❌ Failed: ${error.message}`);
                }
            }

            // Small delay to avoid rate limits
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    saveReplied(replied);

    console.log('');
    console.log('═'.repeat(50));
    console.log(`✅ Done! Replied to ${replyCount} Instagram comment(s)`);

    return { success: true, replied: replyCount };
}

export default { respondToInstagramComments };

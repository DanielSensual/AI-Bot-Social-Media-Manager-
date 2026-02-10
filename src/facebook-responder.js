/**
 * Facebook Messenger Auto-Responder
 * AI-powered responses to Facebook Page inbox messages via Graph API
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
const LOGS_DIR = path.join(__dirname, '..', 'logs', 'facebook-responses');
const RESPONDED_FILE = path.join(__dirname, '..', '.fb-responded.json');

fs.mkdirSync(LOGS_DIR, { recursive: true });

const DISCLAIMER = `\n\n---\n📌 This account uses AI assistance. Your message has been forwarded to Daniel for personal review.`;

/**
 * Get page credentials (reuses facebook-client pattern)
 */
async function getPageCredentials() {
    const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN;
    if (!token) throw new Error('Facebook not configured. Set FACEBOOK_ACCESS_TOKEN in .env');

    const meResponse = await fetch(`${GRAPH_API_BASE}/me?fields=id,name&access_token=${token}`);
    const meData = await meResponse.json();
    if (meData.error) throw new Error(`Facebook API error: ${meData.error.message}`);

    // Check if it's a Page token
    const pageCheck = await fetch(`${GRAPH_API_BASE}/${meData.id}?fields=category&access_token=${token}`);
    const pageCheckData = await pageCheck.json();

    if (!pageCheckData.error && pageCheckData.category) {
        return { pageId: meData.id, pageToken: token, pageName: meData.name };
    }

    // User token — get first page
    const pagesResponse = await fetch(`${GRAPH_API_BASE}/me/accounts?fields=id,name,access_token&access_token=${token}`);
    const pagesData = await pagesResponse.json();

    if (!pagesData.data || pagesData.data.length === 0) {
        throw new Error('No Facebook Pages accessible. Token needs pages_manage_posts + pages_messaging permissions.');
    }

    const configuredPageId = process.env.FACEBOOK_PAGE_ID;
    const page = configuredPageId
        ? pagesData.data.find(p => p.id === configuredPageId) || pagesData.data[0]
        : pagesData.data[0];

    return { pageId: page.id, pageToken: page.access_token, pageName: page.name };
}

/**
 * Load set of already-responded conversation IDs
 */
function loadResponded() {
    try {
        if (fs.existsSync(RESPONDED_FILE)) {
            return new Set(JSON.parse(fs.readFileSync(RESPONDED_FILE, 'utf-8')));
        }
    } catch { /* ignore */ }
    return new Set();
}

function saveResponded(respondedSet) {
    const arr = [...respondedSet].slice(-500); // keep last 500
    fs.writeFileSync(RESPONDED_FILE, JSON.stringify(arr, null, 2));
}

/**
 * Get recent conversations with unread messages
 */
async function getConversations(pageId, pageToken, limit = 10) {
    const url = `${GRAPH_API_BASE}/${pageId}/conversations?fields=id,updated_time,participants,message_count,messages.limit(3){message,from,created_time}&limit=${limit}&access_token=${pageToken}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
        throw new Error(`Failed to fetch conversations: ${data.error.message}`);
    }

    return data.data || [];
}

/**
 * Check if the last message in a conversation is from a user (not the page)
 */
function needsReply(conversation, pageId) {
    const messages = conversation.messages?.data;
    if (!messages || messages.length === 0) return false;

    const lastMessage = messages[0]; // Most recent
    return lastMessage.from?.id !== pageId;
}

/**
 * Generate AI response using OpenAI
 */
async function generateAIResponse(senderName, messages) {
    if (!hasLLMProvider()) return 'Thanks for reaching out! We\'ll get back to you shortly.';

    const conversationContext = messages
        .map(m => `${m.from?.name || 'Unknown'}: ${m.message}`)
        .reverse()
        .join('\n');

    const prompt = `You are responding to a Facebook Messenger conversation on behalf of Daniel Castillo, who runs Ghost AI Systems (a web development and AI automation agency in Florida).

The sender is: ${senderName}

Recent conversation:
${conversationContext}

Generate a professional, friendly response that:
1. Acknowledges their message appropriately
2. Is helpful and engaging
3. Keeps the door open for follow-up if relevant
4. Is concise (2-4 sentences max)
5. Matches the tone of a busy but friendly agency owner

DO NOT include any disclaimer or mention that you're an AI - that will be added separately.
DO NOT use overly formal language - keep it conversational and professional.
DO NOT start with "Hey [Name]!" - vary your greetings.

Response:`;

    const { text } = await generateText({
        prompt,
        maxOutputTokens: 500,
        openaiModel: 'gpt-5.2',
        geminiModel: process.env.GEMINI_MODEL || 'gemini-3-pro-preview',
    });

    return text.trim();
}

/**
 * Send a reply to a conversation
 */
async function sendReply(conversationId, recipientId, message, pageToken) {
    const response = await fetch(`${GRAPH_API_BASE}/me/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            recipient: { id: recipientId },
            message: { text: message },
            access_token: pageToken,
        }),
    });

    const data = await response.json();
    if (data.error) {
        throw new Error(`Failed to send reply: ${data.error.message}`);
    }
    return data;
}

/**
 * Log interaction to file
 */
function logInteraction(senderName, messages, sentResponse) {
    const timestamp = new Date().toISOString();
    const dateStr = timestamp.split('T')[0];
    const logFile = path.join(LOGS_DIR, `${dateStr}.json`);

    let logs = [];
    if (fs.existsSync(logFile)) {
        try { logs = JSON.parse(fs.readFileSync(logFile, 'utf-8')); } catch { logs = []; }
    }

    logs.push({ timestamp, sender: senderName, messages, sentResponse });
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
}

/**
 * Main function: check and respond to Facebook messages
 */
export async function respondToFacebookMessages(options = {}) {
    const { dryRun = false, limit = 5 } = options;

    console.log('');
    console.log('🤖 Facebook Messenger AI Responder');
    console.log('═'.repeat(50));
    console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`   Max responses: ${limit}`);
    console.log('');

    const { pageId, pageToken, pageName } = await getPageCredentials();
    console.log(`✅ Page: ${pageName}`);

    const conversations = await getConversations(pageId, pageToken, limit * 2);
    console.log(`📬 Found ${conversations.length} recent conversation(s)`);

    const responded = loadResponded();
    let repliedCount = 0;

    for (const conv of conversations) {
        if (repliedCount >= limit) break;

        // Skip if already responded
        const lastMsgId = conv.messages?.data?.[0]?.created_time;
        const convKey = `${conv.id}:${lastMsgId}`;
        if (responded.has(convKey)) continue;

        // Skip if last message is from the page
        if (!needsReply(conv, pageId)) continue;

        const senderParticipant = conv.participants?.data?.find(p => p.id !== pageId);
        const senderName = senderParticipant?.name || 'Unknown';
        const senderId = senderParticipant?.id;
        const messages = conv.messages?.data || [];

        console.log('');
        console.log(`💬 ${senderName}`);
        console.log(`   Last message: "${messages[0]?.message?.substring(0, 60)}..."`);

        // Generate AI response
        console.log('   🧠 Generating AI response...');
        const aiResponse = await generateAIResponse(senderName, messages);
        const fullResponse = aiResponse + DISCLAIMER;

        console.log(`   Response: "${aiResponse.substring(0, 60)}..."`);

        if (dryRun) {
            console.log('   🔒 DRY RUN - Not sending');
        } else {
            try {
                await sendReply(conv.id, senderId, fullResponse, pageToken);
                console.log('   ✅ Message sent!');
                logInteraction(senderName, messages, fullResponse);
                responded.add(convKey);
                repliedCount++;
            } catch (error) {
                console.error(`   ❌ Failed to send: ${error.message}`);
            }
        }
    }

    saveResponded(responded);

    console.log('');
    console.log('═'.repeat(50));
    console.log(`✅ Done! Responded to ${repliedCount} message(s)`);

    return { success: true, responded: repliedCount };
}

export default { respondToFacebookMessages };

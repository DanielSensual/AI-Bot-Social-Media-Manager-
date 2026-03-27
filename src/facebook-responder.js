/**
 * Facebook Messenger Auto-Responder
 * AI-powered responses to Facebook Page inbox messages via Graph API
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hasLLMProvider, generateText, generateTextWithMemory } from './llm-client.js';
import { getResponderProfile } from './facebook-responder-profiles.js';
import { remember, recall, buildMemoryContext, extractFacts, isMemoryEnabled } from './memory.js';

dotenv.config({ quiet: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GRAPH_API_VERSION = 'v24.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const LOGS_DIR = path.join(__dirname, '..', 'logs', 'facebook-responses');
const DEFAULT_LIMIT = Number.parseInt(process.env.FACEBOOK_RESPONDER_LIMIT || '5', 10) || 5;
const MAX_RESPONDED_KEYS = 500;
const MAX_PREVIEW_LENGTH = 140;
const MESSAGES_PER_CONVERSATION = 5;
const SCAM_POLICY_PATTERNS = [
    /scheduled for permanent deletion/i,
    /page\s+(?:is\s+)?(?:scheduled|set)\s+for\s+permanent\s+deletion/i,
    /violat(?:e|ed|ion).*(?:trademark|copyright|policy)/i,
    /important warning from meta/i,
    /facebook support/i,
    /meta support/i,
    /confirm your account/i,
    /appeal (?:here|now)/i,
    /to avoid deletion/i,
    /policy violation/i,
];
const INQUIRY_PATTERNS = [
    /\?/,
    /\b(class|classes|lesson|lessons|private|price|pricing|cost|ticket|tickets|event|schedule|time|location|where|when|how|can i|do you)\b/i,
    /\b(clase|clases|leccion|lecciones|precio|costo|evento|horario|donde|cu[aá]ndo|puedo|tienen)\b/i,
];
const SPANISH_PATTERNS = [
    /[áéíóúñ¿¡]/i,
    /\b(hola|gracias|clase|clases|leccion|lecciones|precio|costo|evento|horario|donde|cuando|quiero|puedo|bailar)\b/i,
];

fs.mkdirSync(LOGS_DIR, { recursive: true });

function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value) {
    return normalizeText(value).toLowerCase();
}

function slugify(value) {
    return normalizeText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'page';
}

function buildGraphUrl(endpoint, params = {}) {
    const query = new URLSearchParams(params);
    return `${GRAPH_API_BASE}${endpoint}?${query.toString()}`;
}

function getAccessTokens(optionsToken = '') {
    const explicit = normalizeText(optionsToken);
    if (explicit) return [explicit];

    const candidates = [
        normalizeText(process.env.FACEBOOK_ACCESS_TOKEN),
        normalizeText(process.env.FACEBOOK_PAGE_ACCESS_TOKEN),
    ].filter(Boolean);

    if (candidates.length === 0) {
        throw new Error('Facebook not configured. Set FACEBOOK_ACCESS_TOKEN or FACEBOOK_PAGE_ACCESS_TOKEN in .env');
    }

    return [...new Set(candidates)];
}

function resolveTargetSelection(options = {}) {
    const targetPageId = normalizeText(options.pageId || options.targetPageId || process.env.FACEBOOK_RESPONDER_PAGE_ID || process.env.FACEBOOK_PAGE_ID);
    const targetPageName = normalizeText(options.pageName || options.targetPageName || process.env.FACEBOOK_RESPONDER_PAGE_NAME);

    if (!targetPageId && !targetPageName) {
        throw new Error('Explicit page target required. Set --page-id/--page-name or FACEBOOK_RESPONDER_PAGE_ID/FACEBOOK_RESPONDER_PAGE_NAME.');
    }

    return { targetPageId: targetPageId || null, targetPageName: targetPageName || null };
}

function assertTargetMatch(candidate, { targetPageId, targetPageName }) {
    if (targetPageId && String(candidate.id) !== String(targetPageId)) {
        throw new Error(`Target page ID mismatch. Expected ${targetPageId}, got ${candidate.id} (${candidate.name}).`);
    }
    if (targetPageName && normalizeKey(candidate.name) !== normalizeKey(targetPageName)) {
        throw new Error(`Target page name mismatch. Expected "${targetPageName}", got "${candidate.name}".`);
    }
}

async function fetchJson(url, fetchImpl = fetch) {
    const response = await fetchImpl(url);
    const data = await response.json();
    return data;
}

/**
 * Resolve page credentials from explicit target page ID/name.
 */
export async function resolvePageCredentials(options = {}, dependencies = {}) {
    const fetchImpl = dependencies.fetchImpl || fetch;
    const selection = resolveTargetSelection(options);
    const tokenCandidates = getAccessTokens(options.token);

    let lastError = null;
    for (const token of tokenCandidates) {
        try {
            const meData = await fetchJson(
                buildGraphUrl('/me', { fields: 'id,name', access_token: token }),
                fetchImpl,
            );
            if (meData.error) {
                throw new Error(`Facebook API error: ${meData.error.message}`);
            }

            const pageCheckData = await fetchJson(
                buildGraphUrl(`/${meData.id}`, { fields: 'category', access_token: token }),
                fetchImpl,
            );

            if (!pageCheckData.error && pageCheckData.category) {
                const pageCandidate = { id: meData.id, name: meData.name, access_token: token };
                assertTargetMatch(pageCandidate, selection);
                return { pageId: pageCandidate.id, pageToken: pageCandidate.access_token, pageName: pageCandidate.name };
            }

            const pagesData = await fetchJson(
                buildGraphUrl('/me/accounts', { fields: 'id,name,access_token', access_token: token }),
                fetchImpl,
            );

            if (!pagesData.data || pagesData.data.length === 0) {
                throw new Error('No Facebook Pages accessible. Token needs pages_manage_posts + pages_messaging permissions.');
            }

            let page = null;
            if (selection.targetPageId) {
                page = pagesData.data.find((p) => String(p.id) === String(selection.targetPageId)) || null;
            } else if (selection.targetPageName) {
                page = pagesData.data.find((p) => normalizeKey(p.name) === normalizeKey(selection.targetPageName)) || null;
            }

            if (!page) {
                const available = pagesData.data.map((p) => `${p.name} (${p.id})`).join(', ');
                throw new Error(`Target page not found in accessible pages. Requested id="${selection.targetPageId || 'n/a'}" name="${selection.targetPageName || 'n/a'}". Available: ${available}`);
            }

            assertTargetMatch(page, selection);
            return { pageId: page.id, pageToken: page.access_token, pageName: page.name };
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error('Failed to resolve Facebook page credentials.');
}

/**
 * Load set of already-responded conversation IDs
 */
export function getRespondedStatePath(baseDir, pageId) {
    return path.join(baseDir, `.fb-responded.${pageId}.json`);
}

function loadResponded(stateFile) {
    try {
        if (fs.existsSync(stateFile)) {
            return new Set(JSON.parse(fs.readFileSync(stateFile, 'utf-8')));
        }
    } catch { /* ignore */ }
    return new Set();
}

function saveResponded(stateFile, respondedSet) {
    const arr = [...respondedSet].slice(-MAX_RESPONDED_KEYS);
    fs.writeFileSync(stateFile, JSON.stringify(arr, null, 2));
}

function getConversationKey(conversation) {
    const lastMessageAt = conversation.messages?.data?.[0]?.created_time || conversation.updated_time || 'unknown';
    return `${conversation.id}:${lastMessageAt}`;
}

/**
 * Get recent conversations from page inbox.
 */
export async function getConversations(pageId, pageToken, limit = 10, dependencies = {}) {
    const fetchImpl = dependencies.fetchImpl || fetch;
    const url = buildGraphUrl(`/${pageId}/conversations`, {
        fields: `id,updated_time,participants,message_count,messages.limit(${MESSAGES_PER_CONVERSATION}){message,from,created_time}`,
        limit: String(limit),
        access_token: pageToken,
    });
    const data = await fetchJson(url, fetchImpl);

    if (data.error) {
        throw new Error(`Failed to fetch conversations: ${data.error.message}`);
    }

    return data.data || [];
}

function isScamPolicyMessage(text) {
    return SCAM_POLICY_PATTERNS.some((pattern) => pattern.test(text));
}

function isLikelyInquiry(text) {
    return INQUIRY_PATTERNS.some((pattern) => pattern.test(text));
}

function getLatestInboundMessage(conversation, pageId) {
    const messages = conversation.messages?.data || [];
    return messages.find((message) => String(message?.from?.id || '') !== String(pageId)) || null;
}

export function detectMessageLanguage(messageText) {
    const text = normalizeText(messageText);
    if (!text) return 'en';
    if (SPANISH_PATTERNS.some((pattern) => pattern.test(text))) return 'es';
    return 'en';
}

/**
 * Deterministic thread classifier.
 * Labels: inquiry | spam_policy_scam | empty_or_nontext | unknown
 */
export function classifyConversation(conversation, pageId) {
    const latestInbound = getLatestInboundMessage(conversation, pageId);
    if (!latestInbound) {
        return { classification: 'unknown', reason: 'no_inbound_message_found' };
    }

    const inboundText = normalizeText(latestInbound.message);

    if (!inboundText) {
        return { classification: 'empty_or_nontext', reason: 'last_message_empty_or_nontext' };
    }
    if (isScamPolicyMessage(inboundText)) {
        return { classification: 'spam_policy_scam', reason: 'policy_or_trademark_scam_pattern' };
    }
    if (isLikelyInquiry(inboundText)) {
        return { classification: 'inquiry', reason: 'question_or_inquiry_pattern' };
    }
    return { classification: 'unknown', reason: 'no_inquiry_pattern' };
}

export function evaluateConversationForReply({ conversation, pageId, respondedSet }) {
    const lastMessage = conversation.messages?.data?.[0] || null;
    const lastMessageAt = lastMessage?.created_time || conversation.updated_time || null;
    const conversationKey = getConversationKey(conversation);
    const senderId = lastMessage?.from?.id || null;
    const classification = classifyConversation(conversation, pageId);

    if (respondedSet?.has(conversationKey)) {
        return {
            ...classification,
            shouldReply: false,
            action: 'skipped',
            reason: 'already_responded_to_last_message',
            conversationKey,
            lastMessageAt,
        };
    }

    if (!lastMessage || !senderId || String(senderId) === String(pageId)) {
        return {
            ...classification,
            shouldReply: false,
            action: 'skipped',
            reason: 'last_sender_is_page',
            conversationKey,
            lastMessageAt,
        };
    }

    if (classification.classification !== 'inquiry') {
        return {
            ...classification,
            shouldReply: false,
            action: 'skipped',
            reason: classification.reason,
            conversationKey,
            lastMessageAt,
        };
    }

    return {
        ...classification,
        shouldReply: true,
        action: 'eligible',
        reason: 'inquiry_ready_for_reply',
        conversationKey,
        lastMessageAt,
    };
}

/**
 * Generate AI response using configured provider and selected profile.
 * When memory is enabled, injects conversation history and semantic context.
 */
export async function generateAIResponse({ senderName, senderId, conversationId, messages, profile, language, memoryContext }, dependencies = {}) {
    const hasLLMProviderFn = dependencies.hasLLMProviderFn || hasLLMProvider;
    const generateTextFn = dependencies.generateTextFn || generateText;

    const fallbackReply = profile.fallbackReplies[language] || profile.fallbackReplies.en;
    if (!hasLLMProviderFn()) return fallbackReply;

    const conversationContext = (messages || [])
        .map((m) => `${m.from?.name || 'Unknown'}: ${normalizeText(m.message)}`)
        .reverse()
        .join('\n');

    const languageInstruction = language === 'es'
        ? 'Write the full reply in Spanish with natural conversational tone.'
        : 'Write the full reply in English with natural conversational tone.';
    const guardrails = profile.guardrails.map((rule, index) => `${index + 1}. ${rule}`).join('\n');

    const systemPrompt = `You are responding to a Facebook Messenger conversation for ${profile.pageDisplayName}.
You are assisting ${profile.ownerName}, who represents ${profile.businessSummary}.

The sender is: ${senderName}
Preferred reply language: ${language === 'es' ? 'Spanish' : 'English'}
${languageInstruction}

Tone: ${profile.tone}
Length: ${profile.replyLengthGuidance}
Language policy: ${profile.languagePolicy}

Rules:
${guardrails}
Do not mention being an AI.
Do not use markdown lists or signatures.${memoryContext ? '\n\nYou have memory of prior conversations with this person. Use it to personalize your response naturally — never mention that you "remember" or have "memory".' : ''}`;

    // If memory is enabled and we have context, use memory-augmented generation
    if (memoryContext && isMemoryEnabled()) {
        try {
            const memoryHistory = recall('facebook-responder', conversationId, 10);
            const latestMessage = normalizeText(messages?.[0]?.message || '');

            const { text } = await generateTextWithMemory({
                systemPrompt,
                memoryContext,
                messages: memoryHistory,
                userMessage: latestMessage || conversationContext,
                maxOutputTokens: 500,
                openaiModel: 'gpt-5.4-mini',
            });

            console.log(`   🧠 Memory-augmented response (${memoryHistory.length} prior messages)`);
            return normalizeText(text) || fallbackReply;
        } catch (err) {
            console.warn(`   ⚠️ Memory-augmented generation failed, falling back: ${err.message}`);
        }
    }

    // Standard generation (no memory)
    const prompt = `${systemPrompt}\n\nRecent conversation:\n${conversationContext}\n\nResponse:`;

    const { text } = await generateTextFn({
        prompt,
        maxOutputTokens: 500,
        openaiModel: 'gpt-5.4-mini',
        geminiModel: process.env.GEMINI_MODEL || 'gemini-3-pro-preview',
    });

    return normalizeText(text) || fallbackReply;
}

/**
 * Send a reply to a conversation
 */
async function sendReply(recipientId, message, pageToken, dependencies = {}) {
    const fetchImpl = dependencies.fetchImpl || fetch;
    const response = await fetchImpl(`${GRAPH_API_BASE}/me/messages`, {
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
function appendDecisionLog(entry, { baseDir, pageName, timestamp }) {
    const dateStr = timestamp.split('T')[0];
    const pageSlug = slugify(pageName);
    const pageDir = path.join(baseDir, 'logs', 'facebook-responses', pageSlug);
    const logFile = path.join(pageDir, `${dateStr}.json`);

    fs.mkdirSync(pageDir, { recursive: true });

    let logs = [];
    if (fs.existsSync(logFile)) {
        try { logs = JSON.parse(fs.readFileSync(logFile, 'utf-8')); } catch { logs = []; }
    }

    logs.push(entry);
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
}

function parseLimit(raw, fallback = DEFAULT_LIMIT) {
    const parsed = Number.parseInt(String(raw ?? ''), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

function getLastMessagePreview(conversation, pageId) {
    const inboundMessage = getLatestInboundMessage(conversation, pageId);
    const message = normalizeText(inboundMessage?.message || conversation.messages?.data?.[0]?.message);
    if (!message) return '';
    return message.slice(0, MAX_PREVIEW_LENGTH);
}

function getSender(conversation, pageId) {
    const participants = conversation.participants?.data || [];
    const sender = participants.find((participant) => String(participant.id) !== String(pageId));
    const lastMessageSenderId = conversation.messages?.data?.[0]?.from?.id || null;
    return {
        id: sender?.id || lastMessageSenderId || null,
        name: sender?.name || conversation.messages?.data?.[0]?.from?.name || 'Unknown',
    };
}

function getProfileId(options = {}) {
    return normalizeText(options.profile || process.env.FACEBOOK_RESPONDER_PROFILE || 'default') || 'default';
}

export async function getFacebookInboxContext(options = {}, dependencies = {}) {
    const fetchImpl = dependencies.fetchImpl || fetch;
    const limit = parseLimit(options.limit, DEFAULT_LIMIT);
    const { pageId, pageToken, pageName } = await resolvePageCredentials(options, { fetchImpl });
    const conversations = await getConversations(pageId, pageToken, limit, { fetchImpl });
    const byClassification = {
        inquiry: 0,
        spam_policy_scam: 0,
        empty_or_nontext: 0,
        unknown: 0,
    };

    const items = conversations.map((conversation) => {
        const baseClassification = classifyConversation(conversation, pageId);
        const decision = evaluateConversationForReply({
            conversation,
            pageId,
            respondedSet: new Set(),
        });
        byClassification[decision.classification] += 1;
        const sender = getSender(conversation, pageId);

        return {
            conversationId: conversation.id,
            updatedTime: conversation.updated_time || null,
            lastMessageAt: decision.lastMessageAt,
            senderName: sender.name,
            classification: decision.classification,
            classificationReason: baseClassification.reason,
            actionReason: decision.reason,
            shouldReply: decision.shouldReply,
            lastMessagePreview: getLastMessagePreview(conversation, pageId),
        };
    });

    return {
        pageId,
        pageName,
        limit,
        fetchedAt: new Date().toISOString(),
        byClassification,
        conversations: items,
    };
}

/**
 * Main function: check and respond to Facebook messages
 */
export async function respondToFacebookMessages(options = {}, dependencies = {}) {
    const fetchImpl = dependencies.fetchImpl || fetch;
    const nowFn = dependencies.nowFn || (() => new Date());
    const mode = normalizeKey(options.mode || (options.dryRun ? 'dry' : 'live')) === 'dry' ? 'dry' : 'live';
    const dryRun = mode === 'dry';
    const limit = parseLimit(options.limit, DEFAULT_LIMIT);
    const profile = getResponderProfile(getProfileId(options));
    const baseDir = options.baseDir || dependencies.baseDir || path.join(__dirname, '..');

    console.log('');
    console.log('🤖 Facebook Messenger AI Responder');
    console.log('═'.repeat(50));
    console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`   Max responses: ${limit}`);
    console.log(`   Profile: ${profile.id}`);
    console.log('');

    const { pageId, pageToken, pageName } = await resolvePageCredentials(options, { fetchImpl });
    const stateFile = getRespondedStatePath(baseDir, pageId);
    const responded = loadResponded(stateFile);

    console.log(`✅ Page: ${pageName} (${pageId})`);
    console.log(`🧠 State: ${path.basename(stateFile)}`);

    const conversations = await getConversations(pageId, pageToken, Math.max(limit * 2, limit), { fetchImpl });
    console.log(`📬 Found ${conversations.length} recent conversation(s)`);

    let repliedCount = 0;
    let eligibleCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const conv of conversations) {
        if (repliedCount >= limit) break;

        const decision = evaluateConversationForReply({
            conversation: conv,
            pageId,
            respondedSet: responded,
        });
        const sender = getSender(conv, pageId);
        const messages = conv.messages?.data || [];
        const lastMessageText = normalizeText(messages[0]?.message);
        const timestamp = nowFn().toISOString();
        const baseLogEntry = {
            timestamp,
            pageId,
            conversationId: conv.id,
            classification: decision.classification,
            lastMessageAt: decision.lastMessageAt,
            senderName: sender.name,
        };

        if (!decision.shouldReply) {
            skippedCount++;
            appendDecisionLog({
                ...baseLogEntry,
                action: 'skipped',
                reason: decision.reason,
            }, { baseDir, pageName, timestamp });
            continue;
        }

        if (!sender.id) {
            skippedCount++;
            appendDecisionLog({
                ...baseLogEntry,
                action: 'skipped',
                reason: 'missing_recipient_id',
            }, { baseDir, pageName, timestamp });
            continue;
        }

        eligibleCount++;
        const language = detectMessageLanguage(lastMessageText);

        console.log('');
        console.log(`💬 ${sender.name}`);
        console.log(`   Last message: "${lastMessageText.substring(0, 60)}${lastMessageText.length > 60 ? '...' : ''}"`);
        console.log(`   Classification: ${decision.classification} (${decision.reason})`);
        console.log(`   Language: ${language.toUpperCase()}`);

        // Build memory context if enabled
        let memoryContext = '';
        if (isMemoryEnabled()) {
            try {
                memoryContext = await buildMemoryContext(
                    'facebook-responder', conv.id, sender.id, lastMessageText
                );
                if (memoryContext) console.log('   🧠 Memory context loaded');
            } catch (err) {
                console.warn(`   ⚠️ Memory context failed: ${err.message}`);
            }
        }

        console.log('   🧠 Generating AI response...');
        const aiResponse = await generateAIResponse({
            senderName: sender.name,
            senderId: sender.id,
            conversationId: conv.id,
            messages,
            profile,
            language,
            memoryContext,
        }, dependencies);
        const fullResponse = aiResponse + (profile.disclaimer || '');

        console.log(`   Response: "${aiResponse.substring(0, 60)}..."`);

        // Store conversation in memory
        if (isMemoryEnabled()) {
            remember('facebook-responder', conv.id, 'user', lastMessageText, {
                senderName: sender.name, senderId: sender.id, pageId, platform: 'facebook',
            });
            remember('facebook-responder', conv.id, 'assistant', aiResponse);
            // Extract facts asynchronously (non-blocking)
            extractFacts('facebook-responder', sender.id, lastMessageText).catch(() => {});
        }

        if (dryRun) {
            console.log('   🔒 DRY RUN - Not sending');
            appendDecisionLog({
                ...baseLogEntry,
                action: 'dry_run',
                reason: 'inquiry_ready_for_reply',
                memoryEnabled: isMemoryEnabled(),
            }, { baseDir, pageName, timestamp });
        } else {
            try {
                await sendReply(sender.id, fullResponse, pageToken, { fetchImpl });
                console.log('   ✅ Message sent!');
                responded.add(decision.conversationKey);
                repliedCount++;
                appendDecisionLog({
                    ...baseLogEntry,
                    action: 'sent',
                    reason: 'auto_reply_sent',
                    memoryEnabled: isMemoryEnabled(),
                }, { baseDir, pageName, timestamp });
            } catch (error) {
                console.error(`   ❌ Failed to send: ${error.message}`);
                failedCount++;
                appendDecisionLog({
                    ...baseLogEntry,
                    action: 'send_failed',
                    reason: error.message,
                }, { baseDir, pageName, timestamp });
            }
        }
    }

    saveResponded(stateFile, responded);

    console.log('');
    console.log('═'.repeat(50));
    console.log(`✅ Done! Responded to ${repliedCount} message(s)`);
    console.log(`   Eligible inquiries: ${eligibleCount}`);
    console.log(`   Skipped threads: ${skippedCount}`);
    if (failedCount > 0) {
        console.log(`   Send failures: ${failedCount}`);
    }

    return {
        success: true,
        mode,
        responded: repliedCount,
        eligible: eligibleCount,
        skipped: skippedCount,
        failed: failedCount,
        pageId,
        pageName,
    };
}

export default {
    respondToFacebookMessages,
    getFacebookInboxContext,
    resolvePageCredentials,
    classifyConversation,
    detectMessageLanguage,
    evaluateConversationForReply,
    getRespondedStatePath,
    getConversations,
};

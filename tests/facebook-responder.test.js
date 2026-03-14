import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    classifyConversation,
    evaluateConversationForReply,
    getFacebookInboxContext,
    getRespondedStatePath,
    resolvePageCredentials,
    respondToFacebookMessages,
} from '../src/facebook-responder.js';

function jsonResponse(payload) {
    return {
        async json() {
            return payload;
        },
    };
}

function conversation({ id, senderId, senderName, text, createdAt, updatedAt }) {
    return {
        id,
        updated_time: updatedAt || createdAt,
        participants: { data: [{ id: senderId, name: senderName }, { id: '266552527115323', name: 'Bachata Exotica' }] },
        messages: {
            data: [{
                message: text,
                from: { id: senderId, name: senderName },
                created_time: createdAt,
            }],
        },
    };
}

describe('facebook responder targeting', () => {
    it('resolvePageCredentials selects the explicit target page ID', async () => {
        const fetchImpl = async (url) => {
            if (url.includes('/me?')) return jsonResponse({ id: 'user-1', name: 'Owner User' });
            if (url.includes('/user-1?fields=category')) return jsonResponse({ error: { message: 'Not a page token' } });
            if (url.includes('/me/accounts?')) {
                return jsonResponse({
                    data: [
                        { id: '111', name: 'Other Page', access_token: 'page-111' },
                        { id: '266552527115323', name: 'Bachata Exotica', access_token: 'page-266' },
                    ],
                });
            }
            throw new Error(`Unexpected URL: ${url}`);
        };

        const result = await resolvePageCredentials(
            { token: 'user-token', pageId: '266552527115323' },
            { fetchImpl },
        );

        assert.equal(result.pageId, '266552527115323');
        assert.equal(result.pageName, 'Bachata Exotica');
        assert.equal(result.pageToken, 'page-266');
    });

    it('resolvePageCredentials fails when explicit target page is unavailable', async () => {
        const fetchImpl = async (url) => {
            if (url.includes('/me?')) return jsonResponse({ id: 'user-1', name: 'Owner User' });
            if (url.includes('/user-1?fields=category')) return jsonResponse({ error: { message: 'Not a page token' } });
            if (url.includes('/me/accounts?')) {
                return jsonResponse({ data: [{ id: '111', name: 'Other Page', access_token: 'page-111' }] });
            }
            throw new Error(`Unexpected URL: ${url}`);
        };

        await assert.rejects(
            () => resolvePageCredentials({ token: 'user-token', pageId: '266552527115323' }, { fetchImpl }),
            /Target page not found/,
        );
    });
});

describe('facebook responder classification + gating', () => {
    it('classifies inquiry, scam, and empty messages deterministically', () => {
        const inquiry = classifyConversation(conversation({
            id: 'c1',
            senderId: 'u1',
            senderName: 'Camille',
            text: 'Do you still have classes in Orlando?',
            createdAt: '2026-01-23T16:17:15+0000',
        }), '266552527115323');
        assert.equal(inquiry.classification, 'inquiry');

        const scam = classifyConversation(conversation({
            id: 'c2',
            senderId: 'u2',
            senderName: 'Scammer',
            text: 'Important Warning From Meta: Your page is scheduled for permanent deletion due to trademark violation.',
            createdAt: '2025-03-01T19:32:00+0000',
        }), '266552527115323');
        assert.equal(scam.classification, 'spam_policy_scam');

        const empty = classifyConversation(conversation({
            id: 'c3',
            senderId: 'u3',
            senderName: 'Unknown',
            text: '   ',
            createdAt: '2025-02-21T18:59:10+0000',
        }), '266552527115323');
        assert.equal(empty.classification, 'empty_or_nontext');
    });

    it('gates replies by idempotency, sender, and inquiry classification', () => {
        const inquiryConversation = conversation({
            id: 'c1',
            senderId: 'u1',
            senderName: 'Camille',
            text: 'Do you still have classes in Orlando?',
            createdAt: '2026-01-23T16:17:15+0000',
        });
        const key = 'c1:2026-01-23T16:17:15+0000';
        const blocked = evaluateConversationForReply({
            conversation: inquiryConversation,
            pageId: '266552527115323',
            respondedSet: new Set([key]),
        });
        assert.equal(blocked.shouldReply, false);
        assert.equal(blocked.reason, 'already_responded_to_last_message');

        const fromPageConversation = conversation({
            id: 'c2',
            senderId: '266552527115323',
            senderName: 'Bachata Exotica',
            text: 'Hello, thanks for messaging us.',
            createdAt: '2026-01-23T16:19:33+0000',
        });
        const fromPage = evaluateConversationForReply({
            conversation: fromPageConversation,
            pageId: '266552527115323',
            respondedSet: new Set(),
        });
        assert.equal(fromPage.shouldReply, false);
        assert.equal(fromPage.reason, 'last_sender_is_page');

        const allowed = evaluateConversationForReply({
            conversation: inquiryConversation,
            pageId: '266552527115323',
            respondedSet: new Set(),
        });
        assert.equal(allowed.shouldReply, true);
        assert.equal(allowed.classification, 'inquiry');
    });

    it('uses page-scoped state file naming', () => {
        const baseDir = '/tmp/bot';
        const pageA = getRespondedStatePath(baseDir, '111');
        const pageB = getRespondedStatePath(baseDir, '222');
        assert.equal(pageA, '/tmp/bot/.fb-responded.111.json');
        assert.equal(pageB, '/tmp/bot/.fb-responded.222.json');
        assert.notEqual(pageA, pageB);
    });
});

describe('facebook responder dry-run integration', () => {
    it('context + dry-run responder classify correctly and never send messages', async () => {
        let sendCalls = 0;

        const mockConversations = [
            conversation({
                id: 't_1',
                senderId: 'u1',
                senderName: 'Camille',
                text: 'Do you still have classes in Orlando?',
                createdAt: '2026-01-23T16:17:15+0000',
            }),
            conversation({
                id: 't_2',
                senderId: 'u2',
                senderName: 'Scammer',
                text: 'Important Warning From Meta: your page is scheduled for permanent deletion due to trademark violation.',
                createdAt: '2025-03-01T19:32:00+0000',
            }),
            conversation({
                id: 't_3',
                senderId: '266552527115323',
                senderName: 'Bachata Exotica',
                text: 'Thanks for messaging us.',
                createdAt: '2026-01-23T16:19:33+0000',
            }),
        ];

        const fetchImpl = async (url) => {
            if (url.includes('/me/messages')) {
                sendCalls += 1;
                return jsonResponse({ recipient_id: 'u1', message_id: 'mid.1' });
            }
            if (url.includes('/me?')) return jsonResponse({ id: 'user-1', name: 'Owner User' });
            if (url.includes('/user-1?fields=category')) return jsonResponse({ error: { message: 'Not a page token' } });
            if (url.includes('/me/accounts?')) {
                return jsonResponse({
                    data: [{ id: '266552527115323', name: 'Bachata Exotica', access_token: 'page-266' }],
                });
            }
            if (url.includes('/266552527115323/conversations?')) {
                return jsonResponse({ data: mockConversations });
            }
            throw new Error(`Unexpected URL: ${url}`);
        };

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-responder-'));
        const fixedNow = new Date('2026-03-05T14:00:00.000Z');

        const context = await getFacebookInboxContext(
            { token: 'user-token', pageId: '266552527115323', limit: 5 },
            { fetchImpl },
        );
        assert.equal(context.byClassification.inquiry, 1);
        assert.equal(context.byClassification.spam_policy_scam, 1);
        assert.equal(context.byClassification.unknown, 1);

        const result = await respondToFacebookMessages(
            {
                token: 'user-token',
                pageId: '266552527115323',
                profile: 'bachata_exotica',
                mode: 'dry',
                limit: 5,
                baseDir: tmpDir,
            },
            {
                fetchImpl,
                hasLLMProviderFn: () => false,
                nowFn: () => fixedNow,
            },
        );

        assert.equal(result.mode, 'dry');
        assert.equal(result.responded, 0);
        assert.equal(result.eligible, 1);
        assert.equal(sendCalls, 0);

        const logPath = path.join(tmpDir, 'logs', 'facebook-responses', 'bachata-exotica', '2026-03-05.json');
        assert.equal(fs.existsSync(logPath), true);
        const logs = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
        assert.equal(logs.length, 3);
        assert.equal(logs.some((entry) => entry.action === 'dry_run'), true);
        assert.equal(logs.some((entry) => entry.classification === 'spam_policy_scam'), true);
    });
});

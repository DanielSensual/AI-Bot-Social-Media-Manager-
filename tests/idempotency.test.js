/**
 * Idempotency Tests — verifies check-and-claim, release, and cleanup
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDb } from '../src/db.js';
import {
    makeKey,
    makePostKey,
    checkAndClaim,
    releaseKey,
    cleanupKeys,
} from '../src/idempotency.js';

function cleanIdempotencyTable() {
    const db = getDb();
    db.prepare('DELETE FROM idempotency_keys').run();
}

describe('Idempotency', () => {
    beforeEach(() => cleanIdempotencyTable());

    it('makeKey joins action and parts', () => {
        const key = makeKey('post_x', 'client1', 'abc123');
        assert.equal(key, 'post_x:client1:abc123');
    });

    it('makeKey filters out falsy parts', () => {
        const key = makeKey('post_x', '', null, 'abc123');
        assert.equal(key, 'post_x:abc123');
    });

    it('makePostKey includes date and content hash', () => {
        const key = makePostKey('x', 'Hello world');
        const today = new Date().toISOString().slice(0, 10);
        assert.ok(key.startsWith(`post_x:${today}:`), `Expected key to start with post_x:${today}, got: ${key}`);
    });

    it('makePostKey is deterministic for same content', () => {
        const key1 = makePostKey('x', 'Hello world');
        const key2 = makePostKey('x', 'Hello world');
        assert.equal(key1, key2);
    });

    it('makePostKey differs for different content', () => {
        const key1 = makePostKey('x', 'Hello world');
        const key2 = makePostKey('x', 'Goodbye world');
        assert.notEqual(key1, key2);
    });

    it('checkAndClaim returns true on first claim', () => {
        const result = checkAndClaim('test-key-001');
        assert.equal(result, true);
    });

    it('checkAndClaim returns false on duplicate claim', () => {
        checkAndClaim('test-key-002');
        const result = checkAndClaim('test-key-002');
        assert.equal(result, false);
    });

    it('releaseKey allows reclaiming', () => {
        checkAndClaim('test-key-003');
        releaseKey('test-key-003');
        const result = checkAndClaim('test-key-003');
        assert.equal(result, true, 'Should be claimable after release');
    });

    it('cleanupKeys removes old keys', () => {
        // Insert a key with old timestamp
        const db = getDb();
        const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days ago
        db.prepare('INSERT INTO idempotency_keys (key, claimed_at) VALUES (?, ?)').run('old-key', oldDate);

        // Insert a fresh key
        checkAndClaim('fresh-key');

        // Clean keys older than 7 days
        cleanupKeys(7);

        // Old key should be gone
        const oldExists = checkAndClaim('old-key');
        assert.equal(oldExists, true, 'Old key should have been cleaned up');

        // Fresh key should still be claimed
        const freshExists = checkAndClaim('fresh-key');
        assert.equal(freshExists, false, 'Fresh key should still be claimed');
    });
});

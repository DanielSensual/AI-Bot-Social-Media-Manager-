/**
 * Idempotency Guard — prevents duplicate side effects on retry.
 *
 * Usage:
 *   import { makeKey, checkAndClaim } from './idempotency.js';
 *
 *   const key = makeKey('post_x', clientId, contentHash);
 *   if (!checkAndClaim(key)) {
 *     log.warn('Duplicate detected, skipping', { idempotency_key: key });
 *     return;
 *   }
 *   // ... safe to execute side effect
 */

import { getDb, textHash } from './db.js';

/**
 * Build a deterministic idempotency key from action + parts.
 * @param {string} action - e.g. 'post_x', 'engage_x', 'post_linkedin'
 * @param  {...string} parts - variable key parts (campaign_id, content_hash, etc.)
 * @returns {string} e.g. 'post_x:campaign123:abc123'
 */
export function makeKey(action, ...parts) {
    return [action, ...parts.filter(Boolean)].join(':');
}

/**
 * Build an idempotency key for a post action using content hash.
 * @param {string} platform - 'x', 'linkedin', 'facebook', 'instagram'
 * @param {string} text - the post content
 * @returns {string}
 */
export function makePostKey(platform, text) {
    const hash = textHash(text);
    const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return makeKey(`post_${platform}`, day, hash);
}

/**
 * Check whether an idempotency key has already been claimed.
 * If unclaimed, atomically claims it and returns true (safe to proceed).
 * If already claimed, returns false (skip this action).
 *
 * @param {string} key
 * @returns {boolean} true if unclaimed (proceed), false if duplicate
 */
export function checkAndClaim(key) {
    const db = getDb();

    // Ensure the idempotency table exists
    db.exec(`
        CREATE TABLE IF NOT EXISTS idempotency_keys (
            key TEXT PRIMARY KEY,
            claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    try {
        db.prepare('INSERT INTO idempotency_keys (key) VALUES (?)').run(key);
        return true; // Successfully claimed
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || err.message.includes('UNIQUE')) {
            return false; // Already claimed
        }
        throw err; // Unexpected error
    }
}

/**
 * Release a claimed key (useful for rollback on partial failure).
 * @param {string} key
 */
export function releaseKey(key) {
    const db = getDb();
    db.prepare('DELETE FROM idempotency_keys WHERE key = ?').run(key);
}

/**
 * Clean up old idempotency keys (older than N days).
 * Run this periodically to prevent table growth.
 * @param {number} daysOld - default 7
 */
export function cleanupKeys(daysOld = 7) {
    const db = getDb();
    db.exec(`
        CREATE TABLE IF NOT EXISTS idempotency_keys (
            key TEXT PRIMARY KEY,
            claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    const cutoff = new Date(Date.now() - (daysOld * 24 * 60 * 60 * 1000)).toISOString();
    const result = db.prepare('DELETE FROM idempotency_keys WHERE claimed_at < ?').run(cutoff);
    if (result.changes > 0) {
        console.log(`🧹 Cleaned ${result.changes} expired idempotency keys`);
    }
}

export default { makeKey, makePostKey, checkAndClaim, releaseKey, cleanupKeys };

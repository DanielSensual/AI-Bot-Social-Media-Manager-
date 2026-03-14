/**
 * Content Queue — SQLite-backed
 * Allows posts to be generated in advance, reviewed, and scheduled.
 * Posts can be auto-approved or manually approved.
 */

import { getDb } from './db.js';

/**
 * Add a post to the queue
 * @param {object} entry
 * @returns {object} The queued entry with ID
 */
export function enqueue(entry) {
    const db = getDb();
    const id = `q-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const status = entry.autoApprove ? 'approved' : 'pending';
    const now = new Date().toISOString();

    db.prepare(`
        INSERT INTO content_queue (id, text, pillar, ai_generated, adapted_json, status, scheduled_for, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        entry.text,
        entry.pillar || 'unknown',
        entry.aiGenerated ? 1 : 0,
        entry.adapted ? JSON.stringify(entry.adapted) : null,
        status,
        entry.scheduledFor || null,
        now,
        now,
    );

    console.log(`📥 Queued: [${id}] "${entry.text.substring(0, 50)}..." (${status})`);
    return { id, text: entry.text, pillar: entry.pillar || 'unknown', status, createdAt: now };
}

/**
 * Get all pending entries
 */
export function getPending() {
    const db = getDb();
    return db.prepare("SELECT * FROM content_queue WHERE status = 'pending' ORDER BY created_at").all();
}

/**
 * Get all approved entries ready to post
 * @param {boolean} [scheduledOnly=false] - Only return entries with past scheduledFor
 */
export function getReady(scheduledOnly = false) {
    const db = getDb();
    const now = new Date().toISOString();

    if (scheduledOnly) {
        return db.prepare(
            "SELECT * FROM content_queue WHERE status = 'approved' AND (scheduled_for IS NULL OR scheduled_for <= ?) ORDER BY created_at"
        ).all(now);
    }

    return db.prepare("SELECT * FROM content_queue WHERE status = 'approved' ORDER BY created_at").all();
}

/**
 * Approve a queued entry by ID
 */
export function approve(id) {
    const db = getDb();
    const result = db.prepare(
        "UPDATE content_queue SET status = 'approved', updated_at = ? WHERE id = ? AND status = 'pending'"
    ).run(new Date().toISOString(), id);

    if (result.changes > 0) {
        console.log(`✅ Approved: [${id}]`);
        return true;
    }
    return false;
}

/**
 * Reject a queued entry by ID
 */
export function reject(id) {
    const db = getDb();
    const result = db.prepare(
        "UPDATE content_queue SET status = 'rejected', updated_at = ? WHERE id = ? AND status = 'pending'"
    ).run(new Date().toISOString(), id);

    if (result.changes > 0) {
        console.log(`❌ Rejected: [${id}]`);
        return true;
    }
    return false;
}

/**
 * Mark an entry as posted
 */
export function markPosted(id, results = {}) {
    const db = getDb();
    const now = new Date().toISOString();
    const result = db.prepare(
        "UPDATE content_queue SET status = 'posted', results_json = ?, posted_at = ?, updated_at = ? WHERE id = ?"
    ).run(JSON.stringify(results), now, now, id);

    return result.changes > 0;
}

/**
 * Get the next approved entry to post (FIFO)
 */
export function dequeue() {
    const ready = getReady();
    return ready.length > 0 ? ready[0] : null;
}

/**
 * List all queue entries with summary
 */
export function listQueue() {
    const db = getDb();

    const total = db.prepare('SELECT COUNT(*) as c FROM content_queue').get().c;
    const byStatus = {
        pending: db.prepare("SELECT COUNT(*) as c FROM content_queue WHERE status = 'pending'").get().c,
        approved: db.prepare("SELECT COUNT(*) as c FROM content_queue WHERE status = 'approved'").get().c,
        posted: db.prepare("SELECT COUNT(*) as c FROM content_queue WHERE status = 'posted'").get().c,
        rejected: db.prepare("SELECT COUNT(*) as c FROM content_queue WHERE status = 'rejected'").get().c,
    };

    const entries = db.prepare('SELECT * FROM content_queue ORDER BY created_at DESC LIMIT 20').all();

    return { total, byStatus, entries };
}

/**
 * Clean up posted and rejected entries older than N days
 */
export function cleanup(daysOld = 7) {
    const db = getDb();
    const cutoff = new Date(Date.now() - (daysOld * 24 * 60 * 60 * 1000)).toISOString();

    const result = db.prepare(
        "DELETE FROM content_queue WHERE status IN ('posted', 'rejected') AND created_at < ?"
    ).run(cutoff);

    if (result.changes > 0) {
        console.log(`🧹 Cleaned ${result.changes} old queue entries`);
    }
}

export default {
    enqueue,
    dequeue,
    getPending,
    getReady,
    approve,
    reject,
    markPosted,
    listQueue,
    cleanup,
};

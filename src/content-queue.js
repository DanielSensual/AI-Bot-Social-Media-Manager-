/**
 * Content Queue
 * Allows posts to be generated in advance, reviewed, and scheduled.
 * Posts can be auto-approved after a configurable delay or manually approved.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_FILE = path.join(__dirname, '..', '.content-queue.json');

/**
 * Queue entry statuses:
 * - pending: Awaiting approval
 * - approved: Ready to post
 * - posted: Already published
 * - rejected: Manually rejected
 */

/**
 * Load the queue from disk
 * @returns {Array} Queue entries
 */
function loadQueue() {
    try {
        if (fs.existsSync(QUEUE_FILE)) {
            return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
        }
    } catch (e) {
        console.warn('⚠️ Error loading queue, starting fresh');
    }
    return [];
}

/**
 * Save the queue to disk
 */
function saveQueue(queue) {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

/**
 * Add a post to the queue
 * @param {object} entry
 * @param {string} entry.text - Post content
 * @param {string} entry.pillar - Content pillar
 * @param {boolean} [entry.aiGenerated] - Whether AI generated
 * @param {object} [entry.adapted] - Platform-adapted versions
 * @param {string} [entry.scheduledFor] - ISO datetime to post
 * @param {boolean} [entry.autoApprove] - Auto-approve after delay
 * @returns {object} The queued entry with ID
 */
export function enqueue(entry) {
    const queue = loadQueue();

    const queueEntry = {
        id: `q-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        text: entry.text,
        pillar: entry.pillar || 'unknown',
        aiGenerated: entry.aiGenerated || false,
        adapted: entry.adapted || null,
        status: entry.autoApprove ? 'approved' : 'pending',
        scheduledFor: entry.scheduledFor || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    queue.push(queueEntry);
    saveQueue(queue);

    console.log(`📥 Queued: [${queueEntry.id}] "${entry.text.substring(0, 50)}..." (${queueEntry.status})`);
    return queueEntry;
}

/**
 * Get all pending entries
 * @returns {Array} Pending queue entries
 */
export function getPending() {
    return loadQueue().filter(e => e.status === 'pending');
}

/**
 * Get all approved entries ready to post
 * @param {boolean} [scheduledOnly=false] - Only return entries with past scheduledFor
 * @returns {Array} Approved entries
 */
export function getReady(scheduledOnly = false) {
    const now = new Date().toISOString();
    return loadQueue().filter(e => {
        if (e.status !== 'approved') return false;
        if (scheduledOnly && e.scheduledFor && e.scheduledFor > now) return false;
        return true;
    });
}

/**
 * Approve a queued entry by ID
 * @param {string} id - Queue entry ID
 * @returns {boolean} Success
 */
export function approve(id) {
    const queue = loadQueue();
    const entry = queue.find(e => e.id === id);
    if (!entry || entry.status !== 'pending') return false;

    entry.status = 'approved';
    entry.updatedAt = new Date().toISOString();
    saveQueue(queue);

    console.log(`✅ Approved: [${id}]`);
    return true;
}

/**
 * Reject a queued entry by ID
 * @param {string} id - Queue entry ID
 * @returns {boolean} Success
 */
export function reject(id) {
    const queue = loadQueue();
    const entry = queue.find(e => e.id === id);
    if (!entry || entry.status !== 'pending') return false;

    entry.status = 'rejected';
    entry.updatedAt = new Date().toISOString();
    saveQueue(queue);

    console.log(`❌ Rejected: [${id}]`);
    return true;
}

/**
 * Mark an entry as posted
 * @param {string} id - Queue entry ID
 * @param {object} results - Platform results
 * @returns {boolean} Success
 */
export function markPosted(id, results = {}) {
    const queue = loadQueue();
    const entry = queue.find(e => e.id === id);
    if (!entry) return false;

    entry.status = 'posted';
    entry.results = results;
    entry.postedAt = new Date().toISOString();
    entry.updatedAt = new Date().toISOString();
    saveQueue(queue);

    return true;
}

/**
 * Get the next approved entry to post (FIFO)
 * @returns {object|null} Next entry to post
 */
export function dequeue() {
    const ready = getReady();
    return ready.length > 0 ? ready[0] : null;
}

/**
 * List all queue entries with summary
 * @returns {object} Queue summary
 */
export function listQueue() {
    const queue = loadQueue();
    const byStatus = {
        pending: queue.filter(e => e.status === 'pending').length,
        approved: queue.filter(e => e.status === 'approved').length,
        posted: queue.filter(e => e.status === 'posted').length,
        rejected: queue.filter(e => e.status === 'rejected').length,
    };

    return {
        total: queue.length,
        byStatus,
        entries: queue.slice(-20), // Last 20 entries
    };
}

/**
 * Clean up posted and rejected entries older than N days
 * @param {number} daysOld - Remove entries older than this
 */
export function cleanup(daysOld = 7) {
    const queue = loadQueue();
    const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    const cleaned = queue.filter(e => {
        if (e.status === 'pending' || e.status === 'approved') return true;
        const created = new Date(e.createdAt).getTime();
        return created > cutoff;
    });

    const removed = queue.length - cleaned.length;
    if (removed > 0) {
        saveQueue(cleaned);
        console.log(`🧹 Cleaned ${removed} old queue entries`);
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

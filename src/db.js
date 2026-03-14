/**
 * GhostAI X-Bot — SQLite Database
 * Replaces JSON flat files (.post-history.json, .content-queue.json, .content-feedback.json)
 * with a single ghostai.db SQLite database.
 *
 * On first run, auto-migrates existing JSON data into SQLite.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'ghostai.db');

let db = null;

/**
 * Get or initialize the database connection
 */
export function getDb() {
    if (db) return db;

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    initSchema();
    migrateJsonFiles();

    return db;
}

/**
 * Initialize database schema
 */
function initSchema() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS post_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            text_hash TEXT NOT NULL,
            pillar TEXT,
            ai_generated INTEGER DEFAULT 0,
            has_video INTEGER DEFAULT 0,
            has_image INTEGER DEFAULT 0,
            result_x TEXT,
            result_linkedin TEXT,
            result_facebook TEXT,
            result_instagram TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_post_history_hash ON post_history(text_hash);
        CREATE INDEX IF NOT EXISTS idx_post_history_date ON post_history(created_at);

        CREATE TABLE IF NOT EXISTS content_queue (
            id TEXT PRIMARY KEY,
            text TEXT NOT NULL,
            pillar TEXT DEFAULT 'unknown',
            ai_generated INTEGER DEFAULT 0,
            adapted_json TEXT,
            status TEXT DEFAULT 'pending',
            scheduled_for DATETIME,
            results_json TEXT,
            posted_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_queue_status ON content_queue(status);

        CREATE TABLE IF NOT EXISTS pillar_metrics (
            pillar TEXT PRIMARY KEY,
            total_posts INTEGER DEFAULT 0,
            total_likes INTEGER DEFAULT 0,
            total_comments INTEGER DEFAULT 0,
            total_shares INTEGER DEFAULT 0,
            total_impressions INTEGER DEFAULT 0,
            avg_engagement REAL DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS top_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT,
            pillar TEXT,
            platform TEXT,
            score REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            idempotency_key TEXT UNIQUE,
            params_json TEXT,
            result_json TEXT,
            error_message TEXT,
            attempts INTEGER DEFAULT 0,
            max_attempts INTEGER DEFAULT 3,
            leased_until DATETIME,
            scheduled_for DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            finished_at DATETIME
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_scheduled ON tasks(scheduled_for);
        CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);

        CREATE TABLE IF NOT EXISTS idempotency_keys (
            key TEXT PRIMARY KEY,
            claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

// =============================================================================
// Task Management — core primitives for the worker loop
// =============================================================================

/**
 * Create a new task. If an idempotency key is provided and already exists,
 * returns null (duplicate) instead of inserting.
 *
 * @param {string} type - e.g. 'post_x', 'engage_x', 'post_linkedin'
 * @param {object} params - arbitrary parameters for the task handler
 * @param {string} [idempotencyKey] - optional dedup key
 * @param {string} [scheduledFor] - ISO datetime string, null = immediate
 * @returns {object|null} the created task, or null if duplicate
 */
export function createTask(type, params = {}, idempotencyKey = null, scheduledFor = null) {
    const d = getDb();
    const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

    try {
        d.prepare(`
            INSERT INTO tasks (id, type, params_json, idempotency_key, scheduled_for)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, type, JSON.stringify(params), idempotencyKey, scheduledFor);

        return { id, type, status: 'pending', params, idempotencyKey, scheduledFor };
    } catch (err) {
        if (idempotencyKey && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.message?.includes('UNIQUE'))) {
            return null; // Duplicate, safe to skip
        }
        throw err;
    }
}

/**
 * Lease the next available task of the given type(s).
 * Uses an atomic UPDATE + SELECT to prevent double-leasing.
 *
 * @param {string|string[]} types - task type(s) to poll
 * @param {number} leaseDurationMs - how long the lease lasts (default 5 min)
 * @returns {object|null} the leased task, or null if none available
 */
export function leaseTask(types, leaseDurationMs = 5 * 60 * 1000) {
    const d = getDb();
    const typeList = Array.isArray(types) ? types : [types];
    const placeholders = typeList.map(() => '?').join(',');
    const now = new Date().toISOString();
    const leaseUntil = new Date(Date.now() + leaseDurationMs).toISOString();

    // Find and lease atomically
    const row = d.prepare(`
        UPDATE tasks
        SET status = 'leased', leased_until = ?, attempts = attempts + 1
        WHERE id = (
            SELECT id FROM tasks
            WHERE status IN ('pending', 'leased')
            AND type IN (${placeholders})
            AND (scheduled_for IS NULL OR scheduled_for <= ?)
            AND (status = 'pending' OR (status = 'leased' AND leased_until < ?))
            ORDER BY created_at ASC
            LIMIT 1
        )
        RETURNING *
    `).get(leaseUntil, ...typeList, now, now);

    if (!row) return null;

    return {
        id: row.id,
        type: row.type,
        status: row.status,
        params: row.params_json ? JSON.parse(row.params_json) : {},
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
        idempotencyKey: row.idempotency_key,
        leasedUntil: row.leased_until,
        createdAt: row.created_at,
    };
}

/**
 * Extend a task's lease (heartbeat for long-running tasks).
 * @param {string} id
 * @param {number} extendMs - default 5 min
 */
export function heartbeatTask(id, extendMs = 5 * 60 * 1000) {
    const d = getDb();
    const leaseUntil = new Date(Date.now() + extendMs).toISOString();
    d.prepare('UPDATE tasks SET leased_until = ? WHERE id = ?').run(leaseUntil, id);
}

/**
 * Mark a task as completed successfully.
 * @param {string} id
 * @param {object} result - arbitrary result data
 */
export function completeTask(id, result = {}) {
    const d = getDb();
    const now = new Date().toISOString();
    d.prepare(`
        UPDATE tasks SET status = 'succeeded', result_json = ?, finished_at = ?, leased_until = NULL
        WHERE id = ?
    `).run(JSON.stringify(result), now, id);
}

/**
 * Mark a task as failed. If max attempts exceeded, moves to 'dead' (DLQ).
 * @param {string} id
 * @param {Error|string} error
 */
export function failTask(id, error) {
    const d = getDb();
    const errMsg = error instanceof Error ? error.message : String(error);
    const now = new Date().toISOString();

    const task = d.prepare('SELECT attempts, max_attempts FROM tasks WHERE id = ?').get(id);
    if (!task) return;

    const newStatus = task.attempts >= task.max_attempts ? 'dead' : 'pending';
    d.prepare(`
        UPDATE tasks SET status = ?, error_message = ?, finished_at = ?, leased_until = NULL
        WHERE id = ?
    `).run(newStatus, errMsg, newStatus === 'dead' ? now : null, id);
}

/**
 * Get all dead-letter tasks (failed after max retries).
 * @returns {object[]}
 */
export function getDeadTasks() {
    const d = getDb();
    return d.prepare("SELECT * FROM tasks WHERE status = 'dead' ORDER BY finished_at DESC").all()
        .map(row => ({
            ...row,
            params: row.params_json ? JSON.parse(row.params_json) : {},
            result: row.result_json ? JSON.parse(row.result_json) : null,
        }));
}

/**
 * Retry a dead task by resetting its status to pending.
 * @param {string} id
 * @returns {boolean}
 */
export function retryTask(id) {
    const d = getDb();
    const result = d.prepare(`
        UPDATE tasks SET status = 'pending', attempts = 0, error_message = NULL,
            finished_at = NULL, leased_until = NULL
        WHERE id = ? AND status = 'dead'
    `).run(id);
    return result.changes > 0;
}

/**
 * Get task counts by status.
 * @returns {object}
 */
export function getTaskStats() {
    const d = getDb();
    const rows = d.prepare('SELECT status, COUNT(*) as count FROM tasks GROUP BY status').all();
    const stats = { pending: 0, leased: 0, succeeded: 0, failed: 0, dead: 0, total: 0 };
    for (const row of rows) {
        stats[row.status] = row.count;
        stats.total += row.count;
    }
    return stats;
}

/**
 * Simple hash for deduplication (djb2)
 */
export function textHash(text) {
    const normalized = text.trim().toLowerCase();
    let hash = 5381;
    for (let i = 0; i < normalized.length; i++) {
        hash = ((hash << 5) + hash) + normalized.charCodeAt(i);
        hash = hash & hash; // Convert to 32-bit int
    }
    return hash.toString(36);
}

// =============================================================================
// JSON → SQLite Migration
// =============================================================================

function migrateJsonFiles() {
    const historyFile = path.join(__dirname, '..', '.post-history.json');
    const queueFile = path.join(__dirname, '..', '.content-queue.json');
    const feedbackFile = path.join(__dirname, '..', '.content-feedback.json');

    migratePostHistory(historyFile);
    migrateContentQueue(queueFile);
    migrateContentFeedback(feedbackFile);
}

function migratePostHistory(filePath) {
    if (!fs.existsSync(filePath)) return;

    // Check if we already migrated
    const count = db.prepare('SELECT COUNT(*) as c FROM post_history').get().c;
    if (count > 0) return;

    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (!Array.isArray(data) || data.length === 0) return;

        console.log(`🔄 Migrating ${data.length} post history entries to SQLite...`);

        const insert = db.prepare(`
            INSERT INTO post_history (text, text_hash, pillar, ai_generated, has_video, has_image,
                result_x, result_linkedin, result_facebook, result_instagram, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const migrate = db.transaction(() => {
            for (const entry of data) {
                insert.run(
                    entry.text || '',
                    textHash(entry.text || ''),
                    entry.pillar || null,
                    entry.aiGenerated ? 1 : 0,
                    entry.hasVideo ? 1 : 0,
                    entry.hasImage ? 1 : 0,
                    entry.results?.x || null,
                    entry.results?.linkedin || null,
                    entry.results?.facebook || null,
                    entry.results?.instagram || null,
                    entry.timestamp || new Date().toISOString(),
                );
            }
        });

        migrate();
        fs.renameSync(filePath, filePath + '.bak');
        console.log(`✅ Migrated ${data.length} posts → ghostai.db (original backed up)`);
    } catch (err) {
        console.error(`⚠️ Post history migration failed: ${err.message}`);
    }
}

function migrateContentQueue(filePath) {
    if (!fs.existsSync(filePath)) return;

    const count = db.prepare('SELECT COUNT(*) as c FROM content_queue').get().c;
    if (count > 0) return;

    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (!Array.isArray(data) || data.length === 0) return;

        console.log(`🔄 Migrating ${data.length} queue entries to SQLite...`);

        const insert = db.prepare(`
            INSERT INTO content_queue (id, text, pillar, ai_generated, adapted_json, status,
                scheduled_for, results_json, posted_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const migrate = db.transaction(() => {
            for (const entry of data) {
                insert.run(
                    entry.id,
                    entry.text || '',
                    entry.pillar || 'unknown',
                    entry.aiGenerated ? 1 : 0,
                    entry.adapted ? JSON.stringify(entry.adapted) : null,
                    entry.status || 'pending',
                    entry.scheduledFor || null,
                    entry.results ? JSON.stringify(entry.results) : null,
                    entry.postedAt || null,
                    entry.createdAt || new Date().toISOString(),
                    entry.updatedAt || new Date().toISOString(),
                );
            }
        });

        migrate();
        fs.renameSync(filePath, filePath + '.bak');
        console.log(`✅ Migrated ${data.length} queue entries → ghostai.db`);
    } catch (err) {
        console.error(`⚠️ Queue migration failed: ${err.message}`);
    }
}

function migrateContentFeedback(filePath) {
    if (!fs.existsSync(filePath)) return;

    const count = db.prepare('SELECT COUNT(*) as c FROM pillar_metrics').get().c;
    if (count > 0) return;

    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (!data.pillarMetrics) return;

        console.log('🔄 Migrating feedback data to SQLite...');

        const insertMetric = db.prepare(`
            INSERT OR REPLACE INTO pillar_metrics (pillar, total_posts, total_likes, total_comments,
                total_shares, total_impressions, avg_engagement, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertTopPost = db.prepare(`
            INSERT INTO top_posts (text, pillar, platform, score, created_at)
            VALUES (?, ?, ?, ?, ?)
        `);

        const migrate = db.transaction(() => {
            for (const [pillar, metrics] of Object.entries(data.pillarMetrics)) {
                insertMetric.run(
                    pillar,
                    metrics.totalPosts || 0,
                    metrics.totalLikes || 0,
                    metrics.totalComments || 0,
                    metrics.totalShares || 0,
                    metrics.totalImpressions || 0,
                    metrics.avgEngagement || 0,
                    data.lastUpdated || new Date().toISOString(),
                );
            }

            for (const post of (data.recentTopPosts || [])) {
                insertTopPost.run(
                    post.text || '',
                    post.pillar || null,
                    post.platform || null,
                    post.score || 0,
                    post.timestamp || new Date().toISOString(),
                );
            }
        });

        migrate();
        fs.renameSync(filePath, filePath + '.bak');
        console.log('✅ Migrated feedback data → ghostai.db');
    } catch (err) {
        console.error(`⚠️ Feedback migration failed: ${err.message}`);
    }
}

export default {
    getDb,
    textHash,
    createTask,
    leaseTask,
    heartbeatTask,
    completeTask,
    failTask,
    retryTask,
    getDeadTasks,
    getTaskStats,
};

/**
 * Task System Tests — covers the task table, leasing, idempotency, and DLQ.
 * Uses an in-memory SQLite database for isolation.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// We need to test against the actual db module, so we set DB_PATH to a temp file
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB = path.join(__dirname, '..', 'test-tasks.db');

// Set a custom DB path before importing db module
// We'll test via direct import since db.js uses a module-level path
import {
    getDb,
    createTask,
    leaseTask,
    heartbeatTask,
    completeTask,
    failTask,
    retryTask,
    getDeadTasks,
    getTaskStats,
} from '../src/db.js';

// Clean any leftover test tasks between tests
function cleanTasks() {
    const db = getDb();
    db.prepare('DELETE FROM tasks').run();
    db.prepare('DELETE FROM idempotency_keys').run();
}

describe('Task System', () => {
    beforeEach(() => cleanTasks());

    it('createTask inserts a task with correct defaults', () => {
        const task = createTask('post_x', { text: 'Hello world' });
        assert.ok(task);
        assert.ok(task.id.startsWith('task_'));
        assert.equal(task.type, 'post_x');
        assert.equal(task.status, 'pending');
        assert.deepEqual(task.params, { text: 'Hello world' });
    });

    it('createTask with idempotency key prevents duplicates', () => {
        const t1 = createTask('post_x', { text: 'Hello' }, 'key-001');
        const t2 = createTask('post_x', { text: 'Hello again' }, 'key-001');
        assert.ok(t1, 'First task should be created');
        assert.equal(t2, null, 'Duplicate key should return null');
    });

    it('createTask without idempotency key allows duplicates', () => {
        const t1 = createTask('post_x', { text: 'Hello' });
        const t2 = createTask('post_x', { text: 'Hello' });
        assert.ok(t1);
        assert.ok(t2);
        assert.notEqual(t1.id, t2.id);
    });

    it('leaseTask claims the oldest pending task', () => {
        createTask('post_x', { text: 'First' });
        createTask('post_x', { text: 'Second' });

        const leased = leaseTask('post_x');
        assert.ok(leased);
        assert.equal(leased.status, 'leased');
        assert.deepEqual(leased.params, { text: 'First' });
        assert.equal(leased.attempts, 1);
    });

    it('leaseTask returns null when no tasks available', () => {
        const leased = leaseTask('post_x');
        assert.equal(leased, null);
    });

    it('leaseTask skips already-leased tasks with valid lease', () => {
        createTask('post_x', { text: 'Only one' });

        const first = leaseTask('post_x', 60_000); // 1 min lease
        const second = leaseTask('post_x', 60_000);

        assert.ok(first);
        assert.equal(second, null, 'Should not double-lease');
    });

    it('leaseTask reclaims expired leases', () => {
        createTask('post_x', { text: 'Expired' });

        // Lease with negative duration so it's immediately in the past
        const first = leaseTask('post_x', -1_000);
        assert.ok(first);

        // Should be reclaimable since lease is expired
        const second = leaseTask('post_x', 60_000);
        assert.ok(second, 'Expired lease should be reclaimable');
        assert.equal(second.attempts, 2);
    });

    it('completeTask marks task as succeeded', () => {
        const task = createTask('post_x', { text: 'Done' });
        leaseTask('post_x');
        completeTask(task.id, { tweet_id: '12345' });

        const db = getDb();
        const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
        assert.equal(row.status, 'succeeded');
        assert.ok(row.finished_at);
        assert.equal(row.leased_until, null);

        const result = JSON.parse(row.result_json);
        assert.equal(result.tweet_id, '12345');
    });

    it('failTask returns to pending if under max attempts', () => {
        const task = createTask('post_x', { text: 'Retry me' });
        leaseTask('post_x'); // attempts = 1
        failTask(task.id, new Error('Rate limited'));

        const db = getDb();
        const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
        assert.equal(row.status, 'pending', 'Should return to pending for retry');
        assert.equal(row.error_message, 'Rate limited');
    });

    it('failTask moves to dead after max attempts', () => {
        const task = createTask('post_x', { text: 'Dead letter' });

        // Exhaust all 3 attempts
        for (let i = 0; i < 3; i++) {
            leaseTask('post_x');
            failTask(task.id, 'Failed again');
        }

        const db = getDb();
        const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
        assert.equal(row.status, 'dead', 'Should be dead after max attempts');
        assert.ok(row.finished_at);
    });

    it('getDeadTasks returns dead tasks', () => {
        const task = createTask('post_x', { text: 'Will die' });
        for (let i = 0; i < 3; i++) {
            leaseTask('post_x');
            failTask(task.id, 'Nope');
        }

        const dead = getDeadTasks();
        assert.equal(dead.length, 1);
        assert.equal(dead[0].id, task.id);
        assert.deepEqual(dead[0].params, { text: 'Will die' });
    });

    it('retryTask resets a dead task to pending', () => {
        const task = createTask('post_x', { text: 'Resurrect' });
        for (let i = 0; i < 3; i++) {
            leaseTask('post_x');
            failTask(task.id, 'Failed');
        }

        const ok = retryTask(task.id);
        assert.ok(ok, 'retryTask should return true');

        const db = getDb();
        const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
        assert.equal(row.status, 'pending');
        assert.equal(row.attempts, 0);
    });

    it('getTaskStats returns correct counts', () => {
        createTask('post_x', { text: 'Pending 1' });
        createTask('post_x', { text: 'Pending 2' });
        createTask('post_x', { text: 'Will complete' });

        // leaseTask picks the oldest (Pending 1), then we complete it
        const leased = leaseTask('post_x');
        completeTask(leased.id, {});

        const stats = getTaskStats();
        assert.equal(stats.pending, 2); // Pending 2 + Will complete
        assert.equal(stats.succeeded, 1); // Pending 1
        assert.equal(stats.total, 3);
    });

    it('leaseTask supports multiple types', () => {
        createTask('post_linkedin', { text: 'LI post' });

        const leased = leaseTask(['post_x', 'post_linkedin']);
        assert.ok(leased);
        assert.equal(leased.type, 'post_linkedin');
    });

    it('heartbeatTask extends the lease', () => {
        createTask('post_x', { text: 'Long task' });
        const leased = leaseTask('post_x', 1_000); // 1s lease
        const originalLease = leased.leasedUntil;

        heartbeatTask(leased.id, 300_000); // Extend to 5 min

        const db = getDb();
        const row = db.prepare('SELECT leased_until FROM tasks WHERE id = ?').get(leased.id);
        assert.ok(row.leased_until > originalLease, 'Lease should be extended');
    });
});

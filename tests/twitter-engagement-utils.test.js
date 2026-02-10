import test from 'node:test';
import assert from 'node:assert/strict';

import {
    normalizeLimit,
    loadEngagedRecords,
    pruneEngagedRecords,
    shouldRetryTwitterError,
    computeBackoffMs,
} from '../src/twitter-engagement-utils.js';

test('normalizeLimit returns default and clamps boundaries', () => {
    const defaults = { defaultValue: 8, min: 1, max: 25 };

    assert.equal(normalizeLimit(undefined, defaults), 8);
    assert.equal(normalizeLimit(0, defaults), 1);
    assert.equal(normalizeLimit(50, defaults), 25);
    assert.equal(normalizeLimit(12, defaults), 12);
});

test('normalizeLimit throws on non-integer values', () => {
    assert.throws(
        () => normalizeLimit('abc', { defaultValue: 8, min: 1, max: 25 }),
        /Invalid --limit value/,
    );

    assert.throws(
        () => normalizeLimit('2.5', { defaultValue: 8, min: 1, max: 25 }),
        /Invalid --limit value/,
    );
});

test('loadEngagedRecords migrates legacy string array format', () => {
    const now = new Date('2026-02-10T00:00:00.000Z');
    const raw = JSON.stringify(['tweet-1', 'tweet-2']);

    const records = loadEngagedRecords(raw, now);

    assert.equal(records.length, 2);
    assert.deepEqual(records[0], { id: 'tweet-1', engagedAt: now.toISOString() });
    assert.deepEqual(records[1], { id: 'tweet-2', engagedAt: now.toISOString() });
});

test('pruneEngagedRecords applies TTL and keeps newest duplicate per id', () => {
    const now = new Date('2026-02-10T00:00:00.000Z');

    const records = [
        { id: 'old', engagedAt: '2025-11-01T00:00:00.000Z' },
        { id: 'keep', engagedAt: '2026-02-05T00:00:00.000Z' },
        { id: 'dup', engagedAt: '2026-02-01T00:00:00.000Z' },
        { id: 'dup', engagedAt: '2026-02-07T00:00:00.000Z' },
    ];

    const pruned = pruneEngagedRecords(records, 30, 5000, now);

    assert.equal(pruned.some(r => r.id === 'old'), false);
    assert.equal(pruned.some(r => r.id === 'keep'), true);
    const dup = pruned.find(r => r.id === 'dup');
    assert.equal(dup.engagedAt, '2026-02-07T00:00:00.000Z');
});

test('pruneEngagedRecords enforces max entries on newest records', () => {
    const now = new Date('2026-02-10T00:00:00.000Z');

    const records = [
        { id: 'a', engagedAt: '2026-02-10T00:00:00.000Z' },
        { id: 'b', engagedAt: '2026-02-09T00:00:00.000Z' },
        { id: 'c', engagedAt: '2026-02-08T00:00:00.000Z' },
    ];

    const pruned = pruneEngagedRecords(records, 30, 2, now);

    assert.deepEqual(pruned.map(r => r.id), ['a', 'b']);
});

test('shouldRetryTwitterError handles retryable and non-retryable errors', () => {
    assert.equal(shouldRetryTwitterError({ code: 429, message: 'Rate limit exceeded' }), true);
    assert.equal(shouldRetryTwitterError({ status: 503, message: 'Server error' }), true);
    assert.equal(shouldRetryTwitterError({ code: 'ECONNRESET', message: 'socket hang up' }), true);

    assert.equal(shouldRetryTwitterError({ code: 400, message: 'Bad request' }), false);
    assert.equal(shouldRetryTwitterError({ code: 401, message: 'Unauthorized' }), false);
});

test('computeBackoffMs increases with attempts and respects max cap', () => {
    const base = 2000;
    const max = 20000;

    const d1 = computeBackoffMs(1, base, max);
    const d2 = computeBackoffMs(2, base, max);
    const d3 = computeBackoffMs(3, base, max);
    const d8 = computeBackoffMs(8, base, max);

    assert.ok(d1 >= 1600 && d1 <= 2400, `d1 out of range: ${d1}`);
    assert.ok(d2 > d1, `d2 should be > d1 (${d2} <= ${d1})`);
    assert.ok(d3 > d2, `d3 should be > d2 (${d3} <= ${d2})`);
    assert.ok(d8 <= max, `d8 should not exceed max cap (${d8} > ${max})`);
});

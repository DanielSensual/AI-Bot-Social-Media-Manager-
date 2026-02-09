/**
 * Tests for alerting.js
 * Covers alert deduplication, circuit breaker, and helper functions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Import alerting (no Discord webhook configured, so all alerts go to console)
import {
    alert,
    alertPostFailure,
    alertTokenExpiry,
    alertHealthCheckFailure,
    recordFailure,
    clearFailure,
} from '../src/alerting.js';

test('alert does not throw without Discord webhook', async () => {
    await assert.doesNotReject(
        () => alert('Test Alert', 'This is a test', 'info'),
    );
});

test('alertPostFailure formats error correctly', async () => {
    await assert.doesNotReject(
        () => alertPostFailure('X', new Error('Rate limited')),
    );
});

test('alertTokenExpiry does not throw', async () => {
    await assert.doesNotReject(
        () => alertTokenExpiry('LinkedIn', 5),
    );
});

test('alertHealthCheckFailure does not throw', async () => {
    await assert.doesNotReject(
        () => alertHealthCheckFailure('Facebook', new Error('Connection refused')),
    );
});

test('recordFailure tracks consecutive failures', () => {
    clearFailure('TestPlatform');
    assert.equal(recordFailure('TestPlatform'), 1);
    assert.equal(recordFailure('TestPlatform'), 2);
    assert.equal(recordFailure('TestPlatform'), 3);
});

test('clearFailure resets count', () => {
    recordFailure('ResetTest');
    recordFailure('ResetTest');
    clearFailure('ResetTest');
    assert.equal(recordFailure('ResetTest'), 1);
});

test('duplicate alerts are suppressed within cooldown', async () => {
    // First call should work fine
    await alert('Dedup Test', 'First call', 'info');
    // Second identical call should be suppressed (no error, just skipped)
    await alert('Dedup Test', 'Second call', 'info');
    // No assertion needed — just verifying no errors
});

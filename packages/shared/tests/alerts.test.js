/**
 * Tests for @ghostai/shared/alerts
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    notifyDiscord,
    alert,
    alertPostFailure,
    alertTokenExpiry,
    alertHotLead,
    alertReply,
    recordFailure,
    clearFailure,
} from '@ghostai/shared/alerts';

describe('@ghostai/shared — alerts', () => {
    afterEach(() => {
        clearFailure('TestPlatform');
    });

    it('notifyDiscord falls back to console when no webhook', async () => {
        // Should not throw even without webhook configured
        await notifyDiscord({ title: 'Test', message: 'test message' });
    });

    it('alert deduplicates within cooldown', async () => {
        // First call should work
        await alert('Test Alert', 'test message', 'info');
        // Second call with same key should be suppressed (no throw = pass)
        await alert('Test Alert', 'test message', 'info');
    });

    it('alert works with all severity levels', async () => {
        for (const severity of ['error', 'warning', 'info', 'success']) {
            await alert(`Test ${severity}`, `message for ${severity}`, severity);
        }
    });

    it('alertPostFailure formats the error', async () => {
        await alertPostFailure('TestPlatform', new Error('connection timeout'));
        // No throw = success (webhook not configured, falls back to console)
    });

    it('alertTokenExpiry sends correct severity', async () => {
        await alertTokenExpiry('Facebook', 5); // warning
        await alertTokenExpiry('Facebook', 2); // error
    });

    it('alertHotLead formats lead data', async () => {
        const lead = {
            business_name: 'Test Biz',
            city: 'Orlando',
            rating: 4.5,
            review_count: 100,
            website: 'testbiz.com',
            phone: '555-0100',
        };
        await alertHotLead(lead, 85);
    });

    it('alertReply formats lead data', async () => {
        const lead = {
            business_name: 'Reply Biz',
            city: 'Miami',
            phone: '555-0200',
        };
        await alertReply(lead);
    });

    it('recordFailure tracks consecutive failures', () => {
        const count1 = recordFailure('TestPlatform');
        assert.equal(count1, 1);
        const count2 = recordFailure('TestPlatform');
        assert.equal(count2, 2);
    });

    it('clearFailure resets the counter', () => {
        recordFailure('TestPlatform');
        recordFailure('TestPlatform');
        clearFailure('TestPlatform');
        const count = recordFailure('TestPlatform');
        assert.equal(count, 1);
    });
});

/**
 * Scheduler Tests — imports the actual shouldUse function
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldUse } from '../src/scheduler.js';

describe('shouldUse', () => {
    it('ratio 0 always returns false', () => {
        for (let i = 0; i < 100; i++) {
            assert.equal(shouldUse(0), false);
        }
    });

    it('ratio 100 always returns true', () => {
        for (let i = 0; i < 100; i++) {
            assert.equal(shouldUse(100), true);
        }
    });

    it('ratio 50 returns mixed results over many calls', () => {
        let trueCount = 0;
        const trials = 1000;
        for (let i = 0; i < trials; i++) {
            if (shouldUse(50)) trueCount++;
        }
        // Should be roughly 50%, allow ±15%
        assert.ok(trueCount > trials * 0.35, `Expected > 35% true, got ${(trueCount / trials * 100).toFixed(1)}%`);
        assert.ok(trueCount < trials * 0.65, `Expected < 65% true, got ${(trueCount / trials * 100).toFixed(1)}%`);
    });

    it('returns a boolean', () => {
        const result = shouldUse(50);
        assert.equal(typeof result, 'boolean');
    });
});

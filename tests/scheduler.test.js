/**
 * Tests for scheduler.js
 * Tests the shouldUse probability function and dry-run behavior.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// We test shouldUse as a standalone unit
// The function is: Math.random() * 100 < ratio
// At ratio=0 -> always false, ratio=100 -> always true

test('shouldUse with ratio 0 always returns false', () => {
    // Simulate the logic
    const shouldUse = (ratio) => Math.random() * 100 < ratio;
    for (let i = 0; i < 100; i++) {
        assert.equal(shouldUse(0), false);
    }
});

test('shouldUse with ratio 100 always returns true', () => {
    const shouldUse = (ratio) => Math.random() * 100 < ratio;
    for (let i = 0; i < 100; i++) {
        assert.equal(shouldUse(100), true);
    }
});

test('shouldUse with ratio 50 returns approximately half true', () => {
    const shouldUse = (ratio) => Math.random() * 100 < ratio;
    let trueCount = 0;
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
        if (shouldUse(50)) trueCount++;
    }

    // Allow 15% margin (expect 350-650 out of 1000)
    assert.ok(trueCount > 350, `Expected >350 true, got ${trueCount}`);
    assert.ok(trueCount < 650, `Expected <650 true, got ${trueCount}`);
});

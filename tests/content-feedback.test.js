/**
 * Tests for content-feedback.js
 * Covers engagement recording, weight optimization, and top-post tracking.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FEEDBACK_FILE = path.join(__dirname, '..', '.content-feedback.json');

let originalContent = null;

test.before(() => {
    if (fs.existsSync(FEEDBACK_FILE)) {
        originalContent = fs.readFileSync(FEEDBACK_FILE, 'utf-8');
    }
    // Start clean
    if (fs.existsSync(FEEDBACK_FILE)) fs.unlinkSync(FEEDBACK_FILE);
});

test.after(() => {
    if (originalContent !== null) {
        fs.writeFileSync(FEEDBACK_FILE, originalContent);
    } else if (fs.existsSync(FEEDBACK_FILE)) {
        fs.unlinkSync(FEEDBACK_FILE);
    }
});

test('recordEngagement creates pillar metrics', async () => {
    const { recordEngagement, getPerformanceSummary } = await import('../src/content-feedback.js');

    recordEngagement('value', { likes: 10, comments: 5, shares: 2 }, 'Test post about value', 'X');

    const summary = getPerformanceSummary();
    assert.ok(summary.pillarPerformance.value);
    assert.equal(summary.pillarPerformance.value.posts, 1);
    assert.equal(summary.pillarPerformance.value.totalLikes, 10);
});

test('getTopPerformingExamples returns top posts', async () => {
    const { recordEngagement, getTopPerformingExamples } = await import('../src/content-feedback.js');

    recordEngagement('hotTakes', { likes: 100, comments: 50 }, 'Viral hot take post', 'LinkedIn');
    recordEngagement('cta', { likes: 2, comments: 0 }, 'Low engagement CTA', 'X');

    const examples = getTopPerformingExamples(2);
    assert.ok(examples.length >= 1);
    assert.ok(examples[0].includes('Viral') || examples[0].includes('value'));
});

test('getOptimizedWeights returns object', async () => {
    const { getOptimizedWeights } = await import('../src/content-feedback.js');

    const weights = getOptimizedWeights();
    assert.equal(typeof weights, 'object');
});

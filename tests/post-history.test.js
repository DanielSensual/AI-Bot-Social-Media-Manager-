/**
 * Tests for post-history.js
 * Covers dedup logic, recording, rolling prune, and stats.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_HISTORY_FILE = path.join(__dirname, '..', '.post-history-test.json');
const REAL_HISTORY_FILE = path.join(__dirname, '..', '.post-history.json');

// Save/restore the real file around tests
let originalContent = null;

test.before(() => {
    if (fs.existsSync(REAL_HISTORY_FILE)) {
        originalContent = fs.readFileSync(REAL_HISTORY_FILE, 'utf-8');
    }
    // Start with empty history for tests
    fs.writeFileSync(REAL_HISTORY_FILE, '[]');
});

test.after(() => {
    // Restore original
    if (originalContent !== null) {
        fs.writeFileSync(REAL_HISTORY_FILE, originalContent);
    } else if (fs.existsSync(REAL_HISTORY_FILE)) {
        fs.unlinkSync(REAL_HISTORY_FILE);
    }
});

test('isDuplicate returns false for new content', async () => {
    const { isDuplicate } = await import('../src/post-history.js');
    assert.equal(isDuplicate('Completely unique post content 12345'), false);
});

test('record writes a post and isDuplicate detects it', async () => {
    const { isDuplicate, record } = await import('../src/post-history.js');

    const text = 'This is a test post for dedup';
    record({ text, pillar: 'value' });
    assert.equal(isDuplicate(text), true);
});

test('isDuplicate is case-insensitive', async () => {
    const { isDuplicate, record } = await import('../src/post-history.js');

    record({ text: 'UPPERCASE POST HERE', pillar: 'hotTakes' });
    assert.equal(isDuplicate('uppercase post here'), true);
});

test('getRecent returns correct count', async () => {
    const { getRecent, record } = await import('../src/post-history.js');

    // Clear and record a few
    fs.writeFileSync(REAL_HISTORY_FILE, '[]');
    record({ text: 'Post A', pillar: 'value' });
    record({ text: 'Post B', pillar: 'cta' });
    record({ text: 'Post C', pillar: 'bts' });

    const recent = getRecent(2);
    assert.equal(recent.length, 2);
    assert.equal(recent[1].text, 'Post C');
});

test('getStats reports correct totals', async () => {
    const { getStats, record } = await import('../src/post-history.js');

    fs.writeFileSync(REAL_HISTORY_FILE, '[]');
    record({ text: 'Stat Post 1', pillar: 'value' });
    record({ text: 'Stat Post 2', pillar: 'value' });
    record({ text: 'Stat Post 3', pillar: 'cta' });

    const stats = getStats();
    assert.equal(stats.totalPosts, 3);
    assert.equal(stats.pillarCounts.value, 2);
    assert.equal(stats.pillarCounts.cta, 1);
    assert.ok(stats.lastPost);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { humanizeCaption } from '../src/caption-utils.js';

test('humanizeCaption returns empty string for falsy input', () => {
    assert.equal(humanizeCaption(''), '');
    assert.equal(humanizeCaption(null), '');
    assert.equal(humanizeCaption(undefined), '');
});

test('humanizeCaption collapses 3+ consecutive newlines to double', () => {
    const input = 'Line one\n\n\n\nLine two\n\n\nLine three';
    const result = humanizeCaption(input);
    assert.ok(!result.includes('\n\n\n'), 'Should not have 3+ consecutive newlines');
    assert.ok(result.includes('Line one\n\nLine two'));
    assert.ok(result.includes('Line two\n\nLine three'));
});

test('humanizeCaption strips markdown bold and italic markers', () => {
    assert.equal(humanizeCaption('This is **bold** text'), 'This is bold text');
    assert.equal(humanizeCaption('This is __bold__ text'), 'This is bold text');
    assert.equal(humanizeCaption('This is *italic* text'), 'This is italic text');
});

test('humanizeCaption strips inline code and code fences', () => {
    assert.equal(humanizeCaption('Use `npm install` here'), 'Use npm install here');
    assert.equal(humanizeCaption('Before\n```\ncode block\n```\nAfter'), 'Before\n\nAfter');
});

test('humanizeCaption limits bullet markers to 3 occurrences', () => {
    const input = '→ First\n→ Second\n→ Third\n→ Fourth\n→ Fifth';
    const result = humanizeCaption(input);
    const arrowCount = (result.match(/→/g) || []).length;
    assert.ok(arrowCount <= 3, `Expected max 3 arrows, got ${arrowCount}`);
});

test('humanizeCaption trims whitespace from each line', () => {
    const input = '  Hello  \n  World  ';
    const result = humanizeCaption(input);
    assert.equal(result, 'Hello\nWorld');
});

test('humanizeCaption does not truncate valid short content', () => {
    const input = 'Short post about bachata 🔥';
    const result = humanizeCaption(input);
    assert.equal(result, input);
});

test('humanizeCaption normalizes Windows line endings', () => {
    const input = 'Line one\r\nLine two\r\nLine three';
    const result = humanizeCaption(input);
    assert.ok(!result.includes('\r'), 'Should not contain \\r');
    assert.ok(result.includes('Line one\nLine two\nLine three'));
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createDanielFacebookContentBuilder,
    normalizeDanielFacebookCaption,
} from '../src/daniel-facebook-content.js';

test('normalizeDanielFacebookCaption trims and enforces max length', () => {
    const text = '  Line one\r\n\r\n\r\nLine two  ';
    const normalized = normalizeDanielFacebookCaption(text, 25);

    assert.equal(normalized, 'Line one\n\nLine two');

    const truncated = normalizeDanielFacebookCaption('x'.repeat(40), 20);
    assert.equal(truncated.length, 20);
    assert.ok(truncated.endsWith('...'));
});

test('content builder falls back to template when AI generation fails', async () => {
    const builder = createDanielFacebookContentBuilder({
        hasLLMProviderFn: () => true,
        generateTextFn: async () => {
            throw new Error('provider down');
        },
        randomFn: () => 0,
    });

    const result = await builder.buildCaption({ aiEnabled: true, maxLength: 300 });

    assert.equal(result.source, 'template');
    assert.ok(result.caption.length > 0);
    assert.match(result.fallbackReason, /ai_error/i);
});

test('content builder returns AI caption when valid JSON is returned', async () => {
    const builder = createDanielFacebookContentBuilder({
        hasLLMProviderFn: () => true,
        generateTextFn: async () => ({
            text: JSON.stringify({ caption: 'AI caption for Daniel page' }),
            provider: 'openai',
            model: 'gpt-5.2',
        }),
        randomFn: () => 0,
    });

    const result = await builder.buildCaption({ aiEnabled: true, maxLength: 300 });

    assert.equal(result.source, 'ai');
    assert.equal(result.caption, 'AI caption for Daniel page');
    assert.equal(result.provider, 'openai');
});

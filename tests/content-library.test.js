import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTweet, getTweetByPillar, getWeightedPillar } from '../src/content-library.js';

test('generateTweet returns a valid payload', () => {
    const tweet = generateTweet();
    assert.equal(typeof tweet, 'object');
    assert.equal(typeof tweet.pillar, 'string');
    assert.equal(typeof tweet.text, 'string');
    assert.equal(typeof tweet.length, 'number');
    assert.equal(tweet.length, tweet.text.length);
    assert.ok(tweet.text.trim().length > 0);
    assert.ok(tweet.length <= 280);
});

test('getTweetByPillar supports known pillars', () => {
    const pillars = ['value', 'hotTakes', 'portfolio', 'bts', 'cta'];
    for (const pillar of pillars) {
        const text = getTweetByPillar(pillar);
        assert.equal(typeof text, 'string');
        assert.ok(text.trim().length > 0);
        assert.ok(text.length <= 280);
    }
});

test('getTweetByPillar rejects unknown pillar', () => {
    assert.throws(() => getTweetByPillar('nope'), /Unknown pillar/i);
});

test('getWeightedPillar returns a known pillar key', () => {
    const pillar = getWeightedPillar();
    assert.ok(['value', 'hotTakes', 'portfolio', 'bts', 'cta'].includes(pillar));
});

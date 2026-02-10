import test from 'node:test';
import assert from 'node:assert/strict';

import { parseEngageArgs } from '../scripts/engage-x.js';

test('parseEngageArgs defaults to live mode and default limit', () => {
    const parsed = parseEngageArgs([]);

    assert.equal(parsed.dryRun, false);
    assert.equal(parsed.limit, 8);
    assert.equal(parsed.help, false);
});

test('parseEngageArgs supports --dry-run and -d', () => {
    assert.equal(parseEngageArgs(['--dry-run']).dryRun, true);
    assert.equal(parseEngageArgs(['-d']).dryRun, true);
});

test('parseEngageArgs supports both --limit formats', () => {
    assert.equal(parseEngageArgs(['--limit=5']).limit, 5);
    assert.equal(parseEngageArgs(['--limit', '6']).limit, 6);
});

test('parseEngageArgs clamps limit bounds', () => {
    assert.equal(parseEngageArgs(['--limit=0']).limit, 1);
    assert.equal(parseEngageArgs(['--limit=999']).limit, 25);
});

test('parseEngageArgs throws usage error for invalid limit values', () => {
    assert.throws(
        () => parseEngageArgs(['--limit=abc']),
        (error) => error?.code === 'ERR_USAGE' && /Invalid --limit value/.test(error.message),
    );

    assert.throws(
        () => parseEngageArgs(['--limit']),
        (error) => error?.code === 'ERR_USAGE' && /Missing value for --limit/.test(error.message),
    );
});

test('parseEngageArgs throws usage error for unknown flags', () => {
    assert.throws(
        () => parseEngageArgs(['--wat']),
        (error) => error?.code === 'ERR_USAGE' && /Unknown argument/.test(error.message),
    );
});

test('parseEngageArgs returns help mode for -h/--help', () => {
    assert.equal(parseEngageArgs(['--help']).help, true);
    assert.equal(parseEngageArgs(['-h']).help, true);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseEngageInstagramArgs } from '../scripts/engage-instagram.js';

test('parseEngageInstagramArgs defaults to live mode and default limit', () => {
    const parsed = parseEngageInstagramArgs([]);

    assert.equal(parsed.dryRun, false);
    assert.equal(parsed.limit, 10);
    assert.equal(parsed.headful, false);
    assert.equal(parsed.manualLogin, false);
    assert.equal(parsed.help, false);
});

test('parseEngageInstagramArgs supports dry-run and limit forms', () => {
    assert.equal(parseEngageInstagramArgs(['--dry-run']).dryRun, true);
    assert.equal(parseEngageInstagramArgs(['-d']).dryRun, true);
    assert.equal(parseEngageInstagramArgs(['--limit=7']).limit, 7);
    assert.equal(parseEngageInstagramArgs(['--limit', '8']).limit, 8);
});

test('parseEngageInstagramArgs clamps limit bounds', () => {
    assert.equal(parseEngageInstagramArgs(['--limit=0']).limit, 1);
    assert.equal(parseEngageInstagramArgs(['--limit=999']).limit, 30);
});

test('parseEngageInstagramArgs validates manual-login dependency', () => {
    assert.throws(
        () => parseEngageInstagramArgs(['--manual-login']),
        (error) => error?.code === 'ERR_USAGE' && /requires --headful/.test(error.message),
    );
});

test('parseEngageInstagramArgs handles help and unknown args', () => {
    assert.equal(parseEngageInstagramArgs(['--help']).help, true);
    assert.equal(parseEngageInstagramArgs(['-h']).help, true);

    assert.throws(
        () => parseEngageInstagramArgs(['--nope']),
        (error) => error?.code === 'ERR_USAGE' && /Unknown argument/.test(error.message),
    );
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseEngageRangeArgs } from '../scripts/engage-x-range.js';

test('parseEngageRangeArgs defaults to live mode and 14-20 range', () => {
    const parsed = parseEngageRangeArgs([]);

    assert.equal(parsed.dryRun, false);
    assert.equal(parsed.min, 14);
    assert.equal(parsed.max, 20);
    assert.equal(parsed.attempts, 3);
    assert.equal(parsed.help, false);
});

test('parseEngageRangeArgs supports dry run and both value formats', () => {
    const parsed = parseEngageRangeArgs([
        '--dry-run',
        '--min',
        '15',
        '--max=19',
        '--attempts',
        '4',
    ]);

    assert.equal(parsed.dryRun, true);
    assert.equal(parsed.min, 15);
    assert.equal(parsed.max, 19);
    assert.equal(parsed.attempts, 4);
});

test('parseEngageRangeArgs clamps min/max and attempts bounds', () => {
    const parsed = parseEngageRangeArgs([
        '--min=0',
        '--max=999',
        '--attempts=99',
    ]);

    assert.equal(parsed.min, 1);
    assert.equal(parsed.max, 25);
    assert.equal(parsed.attempts, 10);
});

test('parseEngageRangeArgs throws usage errors for invalid values and range', () => {
    assert.throws(
        () => parseEngageRangeArgs(['--min=abc']),
        (error) => error?.code === 'ERR_USAGE' && /Invalid --limit value/.test(error.message),
    );

    assert.throws(
        () => parseEngageRangeArgs(['--attempts=abc']),
        (error) => error?.code === 'ERR_USAGE' && /Invalid --attempts value/.test(error.message),
    );

    assert.throws(
        () => parseEngageRangeArgs(['--min=20', '--max=14']),
        (error) => error?.code === 'ERR_USAGE' && /Invalid range/.test(error.message),
    );
});

test('parseEngageRangeArgs throws usage errors for missing values and unknown flags', () => {
    assert.throws(
        () => parseEngageRangeArgs(['--min']),
        (error) => error?.code === 'ERR_USAGE' && /Missing value for --min/.test(error.message),
    );

    assert.throws(
        () => parseEngageRangeArgs(['--wat']),
        (error) => error?.code === 'ERR_USAGE' && /Unknown argument/.test(error.message),
    );
});

test('parseEngageRangeArgs returns help mode for -h and --help', () => {
    assert.equal(parseEngageRangeArgs(['--help']).help, true);
    assert.equal(parseEngageRangeArgs(['-h']).help, true);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs } from '../scripts/post-grok-times-square-x.js';

test('parseArgs returns defaults', () => {
    const parsed = parseArgs([]);

    assert.equal(parsed.dryRun, false);
    assert.equal(parsed.aspectRatio, '9:16');
    assert.equal(parsed.duration, 12);
    assert.ok(parsed.hook.length > 0);
    assert.ok(parsed.imagePrompt.length > 0);
});

test('parseArgs supports flags', () => {
    const parsed = parseArgs([
        '--dry-run',
        '--hook',
        'Stop scrolling now.',
        '--caption=Custom caption',
        '--aspect-ratio',
        '16:9',
        '--duration',
        '8',
    ]);

    assert.equal(parsed.dryRun, true);
    assert.equal(parsed.hook, 'Stop scrolling now.');
    assert.equal(parsed.caption, 'Custom caption');
    assert.equal(parsed.aspectRatio, '16:9');
    assert.equal(parsed.duration, 8);
});

test('parseArgs rejects invalid duration and unknown flags', () => {
    assert.throws(
        () => parseArgs(['--duration=2']),
        (error) => error?.code === 'ERR_USAGE' && /Duration must be an integer between 3 and 20/.test(error.message),
    );

    assert.throws(
        () => parseArgs(['--wat']),
        (error) => error?.code === 'ERR_USAGE' && /Unknown argument/.test(error.message),
    );
});

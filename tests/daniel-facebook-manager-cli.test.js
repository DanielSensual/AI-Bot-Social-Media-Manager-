import test from 'node:test';
import assert from 'node:assert/strict';

import {
    isDanielFacebookManagerDirectRun,
    parseDanielFacebookManagerArgs,
} from '../scripts/danieldigital/facebook-manager.js';

test('parseDanielFacebookManagerArgs defaults are correct', () => {
    const parsed = parseDanielFacebookManagerArgs([]);

    assert.equal(parsed.once, false);
    assert.equal(parsed.dryRun, false);
    assert.equal(parsed.runNow, false);
    assert.equal(parsed.help, false);
});

test('parseDanielFacebookManagerArgs supports flags', () => {
    const parsed = parseDanielFacebookManagerArgs(['--once', '--dry-run', '--run-now']);

    assert.equal(parsed.once, true);
    assert.equal(parsed.dryRun, true);
    assert.equal(parsed.runNow, true);
    assert.equal(parsed.help, false);
});

test('parseDanielFacebookManagerArgs supports short aliases', () => {
    const parsed = parseDanielFacebookManagerArgs(['-d', '-h']);

    assert.equal(parsed.dryRun, true);
    assert.equal(parsed.help, true);
});

test('parseDanielFacebookManagerArgs rejects unknown args', () => {
    assert.throws(
        () => parseDanielFacebookManagerArgs(['--nope']),
        (error) => error?.code === 'ERR_USAGE' && /Unknown argument/i.test(error.message),
    );
});

test('isDanielFacebookManagerDirectRun supports pm2 exec path fallback', () => {
    const direct = isDanielFacebookManagerDirectRun(
        ['node', '/pm2/ProcessContainerFork.js'],
        {
            pm_exec_path: '/Users/danielcastillo/Projects/Websites/Bots/ghostai-x-bot/scripts/danieldigital/facebook-manager.js',
        },
    );

    assert.equal(direct, true);
});

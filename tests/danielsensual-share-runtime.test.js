import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveShareRuntime } from '../src/danielsensual-sharer.js';

function withEnv(entries, fn) {
    const previous = new Map();

    for (const [key, value] of Object.entries(entries)) {
        previous.set(key, process.env[key]);
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }

    try {
        return fn();
    } finally {
        for (const [key, value] of previous.entries()) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    }
}

test('resolveShareRuntime uses dedicated personal profile path', () => {
    withEnv({
        HOME: '/tmp/ds-home',
        DS_SHARE_IDENTITY_MODE: 'profile',
        DS_SHARE_BOT_NAME: 'Daniel Sensual Personal',
        DS_SHARE_ENTRY_SCRIPT: 'scripts/danielsensual-personal-share.js',
        DS_SHARE_LOGIN_COMMAND: 'node scripts/danielsensual-personal-share.js --login',
        DANIELSENSUAL_SHARE_USER_DATA_DIR: '/tmp/ds-home/.danielsensual-personal-chrome-profile',
    }, () => {
        const runtime = resolveShareRuntime();

        assert.equal(runtime.identityMode, 'profile');
        assert.equal(runtime.botLabel, 'Daniel Sensual Personal');
        assert.equal(runtime.loginCommand, 'node scripts/danielsensual-personal-share.js --login');
        assert.equal(runtime.userDataDir, '/tmp/ds-home/.danielsensual-personal-chrome-profile');
        assert.match(runtime.lockFile, /^\/tmp\/\.danielsensual-share-[a-f0-9]{12}\.lock$/);
    });
});

test('resolveShareRuntime keeps page and personal lock files isolated', () => {
    const pageRuntime = resolveShareRuntime({
        identityMode: 'page',
        userDataDir: '/tmp/page-profile',
    });
    const personalRuntime = resolveShareRuntime({
        identityMode: 'profile',
        userDataDir: '/tmp/personal-profile',
    });

    assert.notEqual(pageRuntime.lockFile, personalRuntime.lockFile);
});

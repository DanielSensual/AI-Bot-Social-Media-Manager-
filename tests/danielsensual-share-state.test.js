import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
    SHARE_GROUPS,
    getGroupShareStatus,
    getShareGroups,
    recordGroupShare,
} from '../src/danielsensual-groups.js';

function withEnv(name, value, fn) {
    const previous = process.env[name];

    if (value === undefined) {
        delete process.env[name];
    } else {
        process.env[name] = value;
    }

    try {
        return fn();
    } finally {
        if (previous === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = previous;
        }
    }
}

test('recordGroupShare persists to the configured state file and applies cooldown', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-share-state-'));
    const stateFile = path.join(tmpDir, 'page-share-state.json');
    const groupName = SHARE_GROUPS[0].name;
    const postUrl = 'https://www.facebook.com/reel/1234567890';

    withEnv('DANIELSENSUAL_SHARE_STATE_FILE', stateFile, () => {
        recordGroupShare(groupName, postUrl);

        const persisted = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
        assert.equal(persisted.lastShared[groupName].postUrl, postUrl);

        const eligibleGroups = getShareGroups();
        assert.equal(eligibleGroups.some(group => group.name === groupName), false);

        const status = getGroupShareStatus().find(group => group.name === groupName);
        assert.equal(status?.onCooldown, true);
    });
});

test('personal and page share state stay isolated from each other', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-share-isolation-'));
    const personalStateFile = path.join(tmpDir, 'personal-share-state.json');
    const pageStateFile = path.join(tmpDir, 'page-share-state.json');
    const groupName = SHARE_GROUPS[1].name;

    withEnv('DANIELSENSUAL_SHARE_STATE_FILE', personalStateFile, () => {
        recordGroupShare(groupName, 'https://www.facebook.com/reel/personal-post');
        assert.equal(getShareGroups().some(group => group.name === groupName), false);
    });

    withEnv('DANIELSENSUAL_SHARE_STATE_FILE', pageStateFile, () => {
        assert.equal(getShareGroups().some(group => group.name === groupName), true);
    });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
    getDriveRootStatus,
    pickNextDriveAsset,
    archiveDriveAsset,
} from '../src/drive-ingest.js';

function mkTempRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ig-drive-test-'));
}

function touchFile(filePath, text = '') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text);
}

test('getDriveRootStatus reports unconfigured root when IG_DRIVE_ROOT is missing', () => {
    const original = process.env.IG_DRIVE_ROOT;
    delete process.env.IG_DRIVE_ROOT;

    const status = getDriveRootStatus();
    assert.equal(status.configured, false);
    assert.equal(status.root, null);
    assert.equal(status.exists, false);

    if (original !== undefined) process.env.IG_DRIVE_ROOT = original;
});

test('pickNextDriveAsset chooses oldest file and loads caption sidecar', () => {
    const root = mkTempRoot();
    const older = path.join(root, 'reels', 'inbox', 'older.mp4');
    const newer = path.join(root, 'reels', 'inbox', 'newer.mp4');

    touchFile(older, 'older');
    touchFile(newer, 'newer');
    touchFile(path.join(root, 'reels', 'inbox', 'older.txt'), 'Drive caption');

    // Ensure deterministic ordering.
    const now = Date.now();
    fs.utimesSync(older, now / 1000 - 20, now / 1000 - 20);
    fs.utimesSync(newer, now / 1000 - 10, now / 1000 - 10);

    const asset = pickNextDriveAsset('reel', root);
    assert.ok(asset, 'Expected an asset from drive queue');
    assert.equal(asset.filePath, older);
    assert.equal(asset.mediaType, 'video');
    assert.equal(asset.caption, 'Drive caption');
});

test('archiveDriveAsset moves media and sidecar into posted folder', () => {
    const root = mkTempRoot();
    const mediaPath = path.join(root, 'stories', 'inbox', 'story-one.jpg');
    const captionPath = path.join(root, 'stories', 'inbox', 'story-one.txt');

    touchFile(mediaPath, 'image-data');
    touchFile(captionPath, 'Story caption');

    const asset = {
        kind: 'story',
        filePath: mediaPath,
        captionPath,
    };

    const archived = archiveDriveAsset(asset, { rootOverride: root, status: 'posted' });

    assert.ok(archived.archivedFilePath.includes(path.join('stories', 'posted')));
    assert.equal(fs.existsSync(archived.archivedFilePath), true);
    assert.equal(fs.existsSync(mediaPath), false);

    assert.ok(archived.archivedCaptionPath, 'Expected caption sidecar to be archived');
    assert.equal(fs.existsSync(archived.archivedCaptionPath), true);
    assert.equal(fs.existsSync(captionPath), false);
});

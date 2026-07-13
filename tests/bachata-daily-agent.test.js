import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    buildBachataCandidates,
    isCurrentEventDate,
    pickCandidate,
    runBachataDailyPost,
} from '../src/bachata-daily-agent.js';

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

describe('bachata daily agent helpers', () => {
    it('isCurrentEventDate handles current vs stale events', () => {
        const now = new Date('2026-03-05T10:00:00.000Z');
        assert.equal(isCurrentEventDate('March 29, 2026', now), true);
        assert.equal(isCurrentEventDate('January 1, 2025', now), false);
        assert.equal(isCurrentEventDate('invalid date', now), false);
    });

    it('buildBachataCandidates prioritizes current flyer when no media provided', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bachata-candidates-'));
        const eventDir = path.join(tmpDir, 'events');
        fs.mkdirSync(eventDir, { recursive: true });
        const flyerPath = path.join(eventDir, 'flyer.jpg');
        fs.writeFileSync(flyerPath, 'test-flyer');

        const configPath = path.join(eventDir, 'config.json');
        writeJson(configPath, {
            event: {
                date: 'March 29, 2026',
                flyerPath: './flyer.jpg',
            },
            post: {
                textShort: 'Bachata flyer post text',
            },
        });

        const candidates = buildBachataCandidates({
            now: new Date('2026-03-05T12:00:00.000Z'),
            eventConfigPath: configPath,
        });

        assert.equal(candidates[0].type, 'current_flyer');
        assert.equal(candidates[0].imagePath, flyerPath);
        assert.equal(candidates.some((candidate) => candidate.type === 'history_post'), true);
        assert.equal(candidates.some((candidate) => candidate.type === 'daniel_sensual_song'), true);
    });

    it('pickCandidate skips duplicates and falls through', () => {
        const candidates = [
            { type: 'current_flyer', caption: 'dup caption' },
            { type: 'history_post', caption: 'fresh caption' },
        ];

        const selected = pickCandidate(
            candidates,
            new Date('2026-03-05T00:00:00.000Z'),
            (text) => text === 'dup caption',
        );

        assert.equal(selected.type, 'history_post');
        assert.equal(selected.caption, 'fresh caption');
        assert.equal(selected.dedupeBypassed, false);
    });
});

describe('bachata daily runner', () => {
    it('runBachataDailyPost dry-run selects flyer fallback and does not publish', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bachata-dry-'));
        const flyerPath = path.join(tmpDir, 'flyer.jpg');
        fs.writeFileSync(flyerPath, 'flyer');
        const configPath = path.join(tmpDir, 'config.json');
        writeJson(configPath, {
            event: {
                date: 'March 29, 2026',
                flyerPath: './flyer.jpg',
            },
            post: {
                textShort: 'Upcoming Bachata event in Orlando',
            },
        });

        const result = await runBachataDailyPost(
            {
                dryRun: true,
                pageId: '266552527115323',
                eventConfigPath: configPath,
            },
            {
                nowFn: () => new Date('2026-03-05T10:00:00.000Z'),
                isDuplicateFn: () => false,
            },
        );

        assert.equal(result.success, true);
        assert.equal(result.dryRun, true);
        assert.equal(result.selectedType, 'current_flyer');
        assert.equal(result.hasImage, true);
    });

    it('adapts a current event caption for tomorrow and tonight', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bachata-timing-'));
        const flyerPath = path.join(tmpDir, 'flyer.png');
        fs.writeFileSync(flyerPath, 'flyer');
        const eventConfig = {
            event: {
                date: 'July 15, 2026',
            },
            post: {
                textShort: 'Bachata After Dark — This Wednesday',
            },
        };

        const tomorrow = buildBachataCandidates({
            now: new Date('2026-07-14T14:00:00.000Z'),
            eventConfig,
            imagePath: flyerPath,
        });
        const tonight = buildBachataCandidates({
            now: new Date('2026-07-15T14:00:00.000Z'),
            eventConfig,
            imagePath: flyerPath,
        });

        assert.equal(tomorrow[0].caption, 'Bachata After Dark — TOMORROW NIGHT');
        assert.equal(tonight[0].caption, 'Bachata After Dark — TONIGHT');
    });

    it('downloads a current remote event flyer and preserves caption paragraphs', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bachata-remote-'));
        const flyerPath = path.join(tmpDir, 'flyer.png');
        fs.writeFileSync(flyerPath, 'remote-flyer');
        const caption = 'Bachata After Dark\n\nThis Wednesday at 9:30 PM';

        const result = await runBachataDailyPost(
            {
                dryRun: true,
                pageId: '266552527115323',
                eventConfig: {
                    event: {
                        date: 'July 15, 2026',
                        flyerPath: 'https://danielsensual.com/flyer.png',
                    },
                    post: { textShort: caption },
                },
            },
            {
                nowFn: () => new Date('2026-07-13T14:00:00.000Z'),
                downloadEventFlyerFn: async () => flyerPath,
                isDuplicateFn: () => false,
            },
        );

        assert.equal(result.selectedType, 'provided_image');
        assert.equal(result.caption, caption);
        assert.equal(result.hasImage, true);
    });

    it('runBachataDailyPost restores env after live run', async () => {
        const previousPageId = process.env.FACEBOOK_PAGE_ID;
        const previousPageToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
        process.env.FACEBOOK_PAGE_ID = 'original-page';
        process.env.FACEBOOK_PAGE_ACCESS_TOKEN = 'original-page-token';

        // Create a temp image file for the mock to return
        const tmpImg = path.join(os.tmpdir(), `bachata-test-${Date.now()}.png`);
        fs.writeFileSync(tmpImg, 'fake-image-data');

        const recorded = [];
        const result = await runBachataDailyPost(
            {
                dryRun: false,
                pageId: '266552527115323',
                caption: 'Custom bachata text post',
                forceUserToken: true,
            },
            {
                nowFn: () => new Date('2026-03-05T10:00:00.000Z'),
                testFacebookConnectionFn: async () => ({ type: 'user_with_page' }),
                postToFacebookFn: async () => ({ id: 'post-text-only' }),
                postToFacebookWithImageFn: async () => ({ id: 'post-with-image' }),
                postToFacebookWithVideoFn: async () => {
                    throw new Error('should not call video posting');
                },
                generateImageFn: async () => tmpImg,
                isDuplicateFn: () => false,
                recordFn: (entry) => recorded.push(entry),
            },
        );

        assert.equal(result.success, true);
        // Text-only posts now auto-generate images, so postId comes from image posting
        assert.equal(result.postId, 'post-with-image');
        assert.equal(result.hasImage, true);
        assert.equal(recorded.length, 1);
        assert.equal(recorded[0].pillar.startsWith('bachata_daily:'), true);
        assert.equal(process.env.FACEBOOK_PAGE_ID, 'original-page');
        assert.equal(process.env.FACEBOOK_PAGE_ACCESS_TOKEN, 'original-page-token');

        // Cleanup
        try { fs.unlinkSync(tmpImg); } catch { /* ignore */ }
        if (previousPageId === undefined) delete process.env.FACEBOOK_PAGE_ID;
        else process.env.FACEBOOK_PAGE_ID = previousPageId;

        if (previousPageToken === undefined) delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
        else process.env.FACEBOOK_PAGE_ACCESS_TOKEN = previousPageToken;
    });

});

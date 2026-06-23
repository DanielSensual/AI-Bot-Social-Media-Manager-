import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { getActiveEventShareUrl } from '../scripts/video-catalog.js';

function writeJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

test('getActiveEventShareUrl protects active event URLs from catalog rotation', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-video-catalog-'));
    const eventsDir = path.join(tmpDir, 'events');
    const shareUrlFile = path.join(tmpDir, '.danielsensual-share-url.json');
    const eventUrl = 'https://danielsensual.com/bachata';

    writeJson(path.join(eventsDir, 'bachata-after-dark', 'config.json'), {
        event: {
            name: 'Bachata After Dark',
            date: 'Wednesday, June 24, 2026',
            dateIso: '2026-06-24',
            recurring: 'weekly',
            eventUrl,
        },
    });
    writeJson(shareUrlFile, {
        url: eventUrl,
        source: 'event-config',
        setAt: '2026-06-22T12:00:00.000Z',
    });

    const protectedShare = getActiveEventShareUrl({
        eventsDir,
        shareUrlFile,
        now: new Date('2026-07-15T14:00:00.000Z'),
    });

    assert.equal(protectedShare?.url, eventUrl);
    assert.equal(protectedShare?.source, 'event-config');
});

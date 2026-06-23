import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { loadActiveEvents } from '../src/danielsensual-content.js';

function writeJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

test('loadActiveEvents rolls weekly events forward from their seed date', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-events-'));
    writeJson(path.join(tmpDir, 'bachata-after-dark', 'config.json'), {
        event: {
            name: 'Bachata After Dark',
            date: 'Wednesday, June 24, 2026',
            dateIso: '2026-06-24',
            recurring: 'weekly',
            time: 'Free Bachata Class after 9 PM',
            venue: { name: 'Eola Lounge', address: '100 S Eola Dr, Orlando FL' },
            price: 'Free until 9 PM · $10 after',
            eventUrl: 'https://danielsensual.com/bachata',
        },
    });

    const events = loadActiveEvents({
        eventsDir: tmpDir,
        now: new Date('2026-07-15T14:00:00.000Z'),
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].slug, 'bachata-after-dark');
    assert.equal(events[0].date, 'Wednesday, July 15, 2026');
    assert.equal(events[0].config.event.dateIso, '2026-07-15');
});

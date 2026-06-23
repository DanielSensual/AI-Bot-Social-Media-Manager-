import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { SHARE_GROUPS } from '../src/danielsensual-groups.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

test('PM2 DanielSensual share schedules only target populated batches', () => {
    const ecosystem = fs.readFileSync(path.join(repoRoot, 'ecosystem.config.cjs'), 'utf-8');
    const scheduledBatches = [...ecosystem.matchAll(/script:\s*'scripts\/danielsensual-share\.js'[\s\S]*?args:\s*'--batch=(\d+)'/g)]
        .map((match) => Number(match[1]));
    const populatedBatches = new Set(SHARE_GROUPS.map((group) => group.batch));
    const emptyScheduledBatches = scheduledBatches.filter((batch) => !populatedBatches.has(batch));

    assert.deepEqual(emptyScheduledBatches, []);
});

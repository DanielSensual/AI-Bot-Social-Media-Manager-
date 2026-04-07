#!/usr/bin/env node
/**
 * Log Rotation Utility
 *
 * Cleans up old daily JSON log files to prevent disk bloat.
 * Called by ghost-command at 3 AM alongside self-heal.
 *
 * Usage:
 *   node scripts/log-rotate.js              # Clean logs older than 14 days
 *   node scripts/log-rotate.js --days=7     # Custom retention period
 *   node scripts/log-rotate.js --dry-run    # Preview without deleting
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOT_ROOT = path.join(__dirname, '..');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RETENTION_DAYS = parseInt(
    (args.find(a => a.startsWith('--days=')) || '').split('=')[1] || '14',
    10
);

// Directories to scan for old logs
const LOG_DIRS = [
    path.join(BOT_ROOT, 'logs'),
    path.join(BOT_ROOT, 'logs', 'danielsensual-shares'),
    path.join(BOT_ROOT, 'logs', 'engagement-drafts'),
    path.join(BOT_ROOT, 'logs', 'pm2'),
];

// File patterns considered safe to rotate
const ROTATABLE_PATTERNS = [
    /^\d{4}-\d{2}-\d{2}\.json$/,     // 2026-03-22.json
    /^dryrun-.*\.json$/,              // dryrun-*.json
    /^error_.*\.png$/,                // error screenshots
    /.*-latest-\d+\.json$/,           // instagram-dryrun-latest-15.json
];

function isRotatable(filename) {
    return ROTATABLE_PATTERNS.some(p => p.test(filename));
}

function isOlderThanRetention(filePath) {
    try {
        const stat = fs.statSync(filePath);
        const ageMs = Date.now() - stat.mtimeMs;
        return ageMs > RETENTION_DAYS * 24 * 60 * 60 * 1000;
    } catch {
        return false;
    }
}

function main() {
    console.log(`\n🧹 Log Rotation — Ghost AI Bot Fleet`);
    console.log(`   Retention: ${RETENTION_DAYS} days`);
    console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

    let totalDeleted = 0;
    let totalBytes = 0;

    for (const dir of LOG_DIRS) {
        if (!fs.existsSync(dir)) continue;

        let files;
        try {
            files = fs.readdirSync(dir);
        } catch {
            continue;
        }

        for (const file of files) {
            const filePath = path.join(dir, file);

            // Skip directories
            try {
                if (fs.statSync(filePath).isDirectory()) continue;
            } catch {
                continue;
            }

            if (!isRotatable(file)) continue;
            if (!isOlderThanRetention(filePath)) continue;

            const size = fs.statSync(filePath).size;

            if (DRY_RUN) {
                console.log(`   Would delete: ${path.relative(BOT_ROOT, filePath)} (${(size / 1024).toFixed(1)} KB)`);
            } else {
                try {
                    fs.unlinkSync(filePath);
                    console.log(`   Deleted: ${path.relative(BOT_ROOT, filePath)} (${(size / 1024).toFixed(1)} KB)`);
                } catch (err) {
                    console.error(`   ❌ Failed: ${file} — ${err.message}`);
                    continue;
                }
            }

            totalDeleted++;
            totalBytes += size;
        }
    }

    console.log(`\n   ${DRY_RUN ? 'Would delete' : 'Deleted'}: ${totalDeleted} files (${(totalBytes / 1024 / 1024).toFixed(2)} MB freed)`);
    console.log('');
}

main();

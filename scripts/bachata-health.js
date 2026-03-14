#!/usr/bin/env node
/**
 * Bachata Exotica readiness check.
 * Verifies the target page can be resolved, inbox context can be fetched,
 * and the daily post workflow can generate a dry-run preview without publishing.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolvePageCredentials, getFacebookInboxContext } from '../src/facebook-responder.js';
import { runBachataDailyPost } from '../src/bachata-daily-agent.js';
import { testInstagramConnection } from '../src/instagram-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_PAGE_ID = process.env.BACHATA_PAGE_ID || '266552527115323';
const DEFAULT_PROFILE = process.env.FACEBOOK_RESPONDER_PROFILE || 'bachata_exotica';
const DEFAULT_LIMIT = Number.parseInt(process.env.FACEBOOK_RESPONDER_LIMIT || '5', 10) || 5;

const args = process.argv.slice(2);

function getFlagValue(name) {
    const prefix = `--${name}=`;
    const match = args.find((value) => value.startsWith(prefix));
    return match ? match.slice(prefix.length).trim() : '';
}

function hasFlag(...names) {
    return names.some((name) => args.includes(name));
}

function parseLimit(value, fallback = DEFAULT_LIMIT) {
    const parsed = Number.parseInt(String(value || ''), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

function resolveEventConfigPath() {
    const configured = (process.env.BACHATA_EVENT_CONFIG || 'events/bachata-pool-party/config.json').trim();
    return path.resolve(PROJECT_ROOT, configured);
}

function showHelp() {
    console.log(`
Bachata Exotica Health Check
============================

Usage:
  node scripts/bachata-health.js [options]

Options:
  --page-id=ID          Target Bachata page ID (default: ${DEFAULT_PAGE_ID})
  --profile=ID          Responder profile (default: ${DEFAULT_PROFILE})
  --limit=N             Inbox scan limit (default: ${DEFAULT_LIMIT})
  --skip-instagram      Skip linked Instagram check
  --help, -h            Show help
`);
}

if (hasFlag('--help', '-h')) {
    showHelp();
    process.exit(0);
}

const pageId = getFlagValue('page-id') || DEFAULT_PAGE_ID;
const profile = getFlagValue('profile') || DEFAULT_PROFILE;
const limit = parseLimit(getFlagValue('limit'));
const skipInstagram = hasFlag('--skip-instagram');
const eventConfigPath = resolveEventConfigPath();
const hasFbToken = Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN);
const hasIgToken = Boolean(process.env.INSTAGRAM_GRAPH_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN);

async function main() {
    const checks = [];

    console.log('');
    console.log('🌴 Bachata Exotica Health Check');
    console.log('═'.repeat(50));
    console.log(`Page ID: ${pageId}`);
    console.log(`Profile: ${profile}`);
    console.log(`Inbox limit: ${limit}`);
    console.log(`Facebook token: ${hasFbToken ? 'present' : 'missing'}`);
    console.log(`Instagram token path: ${hasIgToken ? 'present' : 'missing'}`);
    console.log(`Event config: ${fs.existsSync(eventConfigPath) ? 'found' : 'missing'} (${eventConfigPath})`);

    try {
        const resolved = await resolvePageCredentials({ pageId });
        checks.push({ name: 'Facebook page target', status: 'ok', details: `${resolved.pageName} (${resolved.pageId})` });
    } catch (error) {
        checks.push({ name: 'Facebook page target', status: 'failed', details: error.message });
    }

    try {
        const preview = await runBachataDailyPost({
            dryRun: true,
            pageId,
            silent: true,
        });
        checks.push({
            name: 'Daily post dry-run',
            status: 'ok',
            details: `${preview.selectedType} (${preview.hasImage ? 'image' : preview.hasVideo ? 'video' : 'text'})`,
        });
    } catch (error) {
        checks.push({ name: 'Daily post dry-run', status: 'failed', details: error.message });
    }

    try {
        const context = await getFacebookInboxContext({ pageId, limit, profile });
        checks.push({
            name: 'Inbox context',
            status: 'ok',
            details: `inquiry=${context.byClassification.inquiry}, spam=${context.byClassification.spam_policy_scam}, unknown=${context.byClassification.unknown}`,
        });
    } catch (error) {
        checks.push({ name: 'Inbox context', status: 'failed', details: error.message });
    }

    if (skipInstagram) {
        checks.push({ name: 'Linked Instagram account', status: 'skipped', details: 'Skipped by operator' });
    } else {
        try {
            const ig = await testInstagramConnection({
                type: 'facebook_page',
                token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN,
                pageId,
            });

            if (ig) {
                checks.push({
                    name: 'Linked Instagram account',
                    status: 'ok',
                    details: `@${ig.username || ig.igUserId}`,
                });
            } else {
                checks.push({
                    name: 'Linked Instagram account',
                    status: 'warning',
                    details: 'No linked Instagram Business account detected for this page.',
                });
            }
        } catch (error) {
            checks.push({ name: 'Linked Instagram account', status: 'warning', details: error.message });
        }
    }

    console.log('');
    let hasFailure = false;
    for (const check of checks) {
        const icon = check.status === 'ok'
            ? '✅'
            : check.status === 'warning'
                ? '⚠️'
                : check.status === 'skipped'
                    ? '⬜'
                    : '❌';
        console.log(`${icon} ${check.name}: ${check.details}`);
        if (check.status === 'failed') hasFailure = true;
    }

    console.log('');
    console.log(hasFailure ? '⚠️ Bachata Graph API is not fully ready.' : '✅ Bachata Graph API is ready for dry-run operation.');
    console.log('');

    process.exit(hasFailure ? 1 : 0);
}

main().catch((error) => {
    console.error(`\n❌ Bachata health check crashed: ${error.message}\n`);
    process.exit(2);
});

#!/usr/bin/env node
/**
 * Unified Bachata page runner for automations.
 * Returns one JSON envelope with post + inbox outcomes.
 */

import dotenv from 'dotenv';
import { runBachataDailyPost } from '../src/bachata-daily-agent.js';
import { getFacebookInboxContext, respondToFacebookMessages } from '../src/facebook-responder.js';

dotenv.config({ quiet: true });

const args = process.argv.slice(2);

function getFlagValue(name) {
    const prefix = `--${name}=`;
    const arg = args.find((value) => value.startsWith(prefix));
    return arg ? arg.slice(prefix.length).trim() : '';
}

function parseLimit(raw, fallback = 5) {
    const parsed = Number.parseInt(String(raw || ''), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

const modeRaw = (getFlagValue('mode') || (args.includes('--dry-run') ? 'dry' : 'live')).toLowerCase();
const mode = modeRaw === 'dry' ? 'dry' : 'live';
const pageId = getFlagValue('page-id') || process.env.BACHATA_PAGE_ID || '266552527115323';
const limit = parseLimit(getFlagValue('limit') || process.env.FACEBOOK_RESPONDER_LIMIT || '5', 5);
const profile = getFlagValue('profile') || process.env.FACEBOOK_RESPONDER_PROFILE || 'bachata_exotica';
const caption = getFlagValue('caption') || getFlagValue('text') || '';
const imagePath = getFlagValue('image') || '';
const videoPath = getFlagValue('video') || '';

function showHelp() {
    console.log(`
Bachata Page Agent
==================

Usage:
  node scripts/bachata-page-agent.js [options]

Options:
  --mode=live|dry       Run mode (default: live)
  --dry-run             Alias for --mode=dry
  --page-id=ID          Target page ID (default: 266552527115323)
  --profile=ID          Inbox responder profile (default: bachata_exotica)
  --limit=N             Inbox fetch/reply limit (default: 5)
  --caption="text"      Optional caption override for post workflow
  --image=/path/file    Optional image override for post workflow
  --video=/path/file    Optional video override for post workflow
  --help, -h            Show help
`);
}

if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
}

if (imagePath && videoPath) {
    console.error(JSON.stringify({
        mode,
        pageId,
        postAction: 'skipped',
        postType: 'none',
        postReason: 'Invalid input: cannot provide both image and video.',
        inboxSummary: {
            inquiry: 0,
            spam_policy_scam: 0,
            empty_or_nontext: 0,
            unknown: 0,
            replied: 0,
            skipped: 0,
        },
        errors: ['Use either --image or --video, not both.'],
    }, null, 2));
    process.exit(1);
}

async function main() {
    const errors = [];
    let postAction = 'skipped';
    let postType = 'none';
    let postReason = '';
    const inboxSummary = {
        inquiry: 0,
        spam_policy_scam: 0,
        empty_or_nontext: 0,
        unknown: 0,
        replied: 0,
        skipped: 0,
    };

    try {
        const postResult = await runBachataDailyPost({
            dryRun: mode === 'dry',
            pageId,
            caption: caption || null,
            imagePath: imagePath || null,
            videoPath: videoPath || null,
            silent: true,
        });

        postAction = postResult.dryRun ? 'previewed' : 'posted';
        postType = postResult.selectedType || 'none';
        postReason = postResult.selectedReason || 'Post workflow completed.';
    } catch (error) {
        postAction = 'skipped';
        postType = 'none';
        postReason = 'Post workflow failed.';
        errors.push(error.message);
    }

    try {
        const context = await getFacebookInboxContext({ pageId, limit });
        inboxSummary.inquiry = context.byClassification.inquiry;
        inboxSummary.spam_policy_scam = context.byClassification.spam_policy_scam;
        inboxSummary.empty_or_nontext = context.byClassification.empty_or_nontext;
        inboxSummary.unknown = context.byClassification.unknown;

        if (mode === 'live') {
            const replyRun = await respondToFacebookMessages({
                mode: 'live',
                pageId,
                profile,
                limit,
            });
            inboxSummary.replied = replyRun.responded || 0;
            inboxSummary.skipped = replyRun.skipped || 0;
        } else {
            inboxSummary.replied = 0;
            inboxSummary.skipped = 0;
        }
    } catch (error) {
        errors.push(`Inbox fetch unavailable in current environment; no thread classification/replies executed. (${error.message})`);
    }

    const payload = {
        mode,
        pageId,
        postAction,
        postType,
        postReason,
        inboxSummary,
        errors,
    };

    console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
    const payload = {
        mode,
        pageId,
        postAction: 'skipped',
        postType: 'none',
        postReason: 'Agent runner crashed before completion.',
        inboxSummary: {
            inquiry: 0,
            spam_policy_scam: 0,
            empty_or_nontext: 0,
            unknown: 0,
            replied: 0,
            skipped: 0,
        },
        errors: [error.message],
    };
    console.log(JSON.stringify(payload, null, 2));
    process.exit(1);
});

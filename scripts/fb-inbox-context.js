#!/usr/bin/env node
/**
 * Read-only Facebook inbox context reporter.
 * Fetches recent conversations and classification decisions without sending replies.
 */

import { getFacebookInboxContext } from '../src/facebook-responder.js';

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

const options = {
    pageId: getFlagValue('page-id') || process.env.FACEBOOK_RESPONDER_PAGE_ID || '',
    pageName: getFlagValue('page-name') || process.env.FACEBOOK_RESPONDER_PAGE_NAME || '',
    limit: parseLimit(getFlagValue('limit') || process.env.FACEBOOK_RESPONDER_LIMIT || '5'),
};

if (args.includes('--help') || args.includes('-h')) {
    console.log(`
📬 Facebook Inbox Context
═══════════════════════════════════

Usage:
  node scripts/fb-inbox-context.js [options]

Options:
  --page-id=ID          Target Page ID (recommended)
  --page-name=NAME      Target Page name (exact match)
  --limit=N             Max conversations to inspect (default: 5)
  --help, -h            Show this help

Examples:
  node scripts/fb-inbox-context.js --page-id=266552527115323
  node scripts/fb-inbox-context.js --page-id=266552527115323 --limit=10
`);
    process.exit(0);
}

if (!options.pageId && !options.pageName) {
    console.error('❌ Missing target page. Use --page-id, --page-name, or set FACEBOOK_RESPONDER_PAGE_ID/FACEBOOK_RESPONDER_PAGE_NAME.');
    process.exit(1);
}

const classificationBadge = {
    inquiry: '🟢',
    spam_policy_scam: '🔴',
    empty_or_nontext: '🟡',
    unknown: '⚪',
};

async function main() {
    const report = await getFacebookInboxContext(options);
    console.log('');
    console.log('📬 Facebook Inbox Context');
    console.log('═'.repeat(50));
    console.log(`Page: ${report.pageName} (${report.pageId})`);
    console.log(`Fetched: ${report.fetchedAt}`);
    console.log(`Limit: ${report.limit}`);
    console.log('');
    console.log('Classification totals:');
    console.log(`  inquiry: ${report.byClassification.inquiry}`);
    console.log(`  spam_policy_scam: ${report.byClassification.spam_policy_scam}`);
    console.log(`  empty_or_nontext: ${report.byClassification.empty_or_nontext}`);
    console.log(`  unknown: ${report.byClassification.unknown}`);

    if (!report.conversations.length) {
        console.log('');
        console.log('No conversations found.');
        return;
    }

    console.log('');
    for (const conversation of report.conversations) {
        const badge = classificationBadge[conversation.classification] || '⚪';
        console.log(`${badge} ${conversation.classification} | ${conversation.senderName} | ${conversation.lastMessageAt || conversation.updatedTime || 'n/a'}`);
        console.log(`   Classifier: ${conversation.classificationReason}`);
        console.log(`   Action: ${conversation.shouldReply ? 'reply' : 'skip'} (${conversation.actionReason})`);
        if (conversation.lastMessagePreview) {
            console.log(`   Last message: "${conversation.lastMessagePreview}"`);
        } else {
            console.log('   Last message: (empty/non-text)');
        }
    }
    console.log('');
}

main().catch((error) => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
});

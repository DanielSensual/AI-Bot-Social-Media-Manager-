#!/usr/bin/env node
/**
 * Facebook Messenger Auto-Responder CLI
 * Checks and responds to Facebook Page inbox messages using AI
 */

import { respondToFacebookMessages } from '../src/facebook-responder.js';

const args = process.argv.slice(2);

function getFlagValue(name) {
    const prefix = `--${name}=`;
    const arg = args.find((value) => value.startsWith(prefix));
    return arg ? arg.slice(prefix.length).trim() : '';
}

function parseMode() {
    const explicitMode = getFlagValue('mode').toLowerCase();
    if (explicitMode === 'dry' || explicitMode === 'live') return explicitMode;
    if (args.includes('--dry-run') || args.includes('-d')) return 'dry';
    return 'live';
}

const options = {
    mode: parseMode(),
    limit: Number.parseInt(getFlagValue('limit') || process.env.FACEBOOK_RESPONDER_LIMIT || '5', 10),
    pageId: getFlagValue('page-id') || process.env.FACEBOOK_RESPONDER_PAGE_ID || process.env.FACEBOOK_PAGE_ID || '',
    pageName: getFlagValue('page-name') || process.env.FACEBOOK_RESPONDER_PAGE_NAME || '',
    profile: getFlagValue('profile') || process.env.FACEBOOK_RESPONDER_PROFILE || 'default',
};

if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🤖 Facebook Messenger AI Responder
═══════════════════════════════════

Usage:
  node respond-facebook.js [options]

Options:
  --mode=live|dry       Run mode (default: live)
  --dry-run, -d         Alias for --mode=dry
  --page-id=ID          Target Page ID (recommended)
  --page-name=NAME      Target Page name (exact match)
  --profile=ID          Responder profile (default: default)
  --limit=N             Max conversations to respond to (default: 5)
  --help, -h            Show this help

Examples:
  node scripts/respond-facebook.js --page-id=266552527115323 --profile=bachata_exotica --mode=dry
  node scripts/respond-facebook.js --page-name="Bachata Exotica" --limit=3
`);
    process.exit(0);
}

if (!options.pageId && !options.pageName) {
    console.error('❌ Missing target page. Use --page-id, --page-name, or set FACEBOOK_RESPONDER_PAGE_ID/FACEBOOK_RESPONDER_PAGE_NAME/FACEBOOK_PAGE_ID.');
    process.exit(1);
}

respondToFacebookMessages(options).catch(error => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
});

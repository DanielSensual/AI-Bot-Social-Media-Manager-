#!/usr/bin/env node
/**
 * Facebook Messenger Auto-Responder CLI
 * Checks and responds to Facebook Page inbox messages using AI
 */

import { respondToFacebookMessages } from '../src/facebook-responder.js';

const args = process.argv.slice(2);

const options = {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    limit: parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '5'),
};

if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🤖 Facebook Messenger AI Responder
═══════════════════════════════════

Usage:
  node respond-facebook.js [options]

Options:
  --dry-run, -d         Preview responses without sending
  --limit=N             Max conversations to respond to (default: 5)
  --help, -h            Show this help

Examples:
  node scripts/respond-facebook.js
  node scripts/respond-facebook.js --dry-run --limit=3
`);
    process.exit(0);
}

respondToFacebookMessages(options).catch(error => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
});

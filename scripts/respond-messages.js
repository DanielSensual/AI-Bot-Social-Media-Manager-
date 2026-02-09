#!/usr/bin/env node
/**
 * LinkedIn Message Responder CLI
 * Checks LinkedIn messages and responds with AI-generated replies
 */

import { respondToMessages } from '../src/linkedin-responder.js';

// Parse CLI arguments
const args = process.argv.slice(2);
const flags = {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    limit: parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '5'),
    visible: args.includes('--visible') || args.includes('-v'),
    help: args.includes('--help') || args.includes('-h'),
};

if (flags.help) {
    console.log(`
🤖 LinkedIn AI Message Responder

Usage:
  node respond-messages.js [options]

Options:
  --dry-run, -d     Preview responses without sending
  --limit=N         Max conversations to respond to (default: 5)
  --visible, -v     Show browser window (for debugging)
  --help, -h        Show this help

Examples:
  npm run linkedin:respond              # Respond to messages
  npm run linkedin:respond -- --dry-run # Preview without sending
  npm run linkedin:respond -- --limit=3 # Respond to max 3 conversations
`);
    process.exit(0);
}

// Run the responder
respondToMessages({
    dryRun: flags.dryRun,
    limit: flags.limit,
    headless: !flags.visible,
}).catch(console.error);

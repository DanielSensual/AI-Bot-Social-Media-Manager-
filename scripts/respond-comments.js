#!/usr/bin/env node
/**
 * Facebook Comment Auto-Responder CLI
 * Scans recent Facebook posts and replies to unreplied comments using AI
 */

import { respondToComments } from '../src/comment-responder.js';

const args = process.argv.slice(2);

const options = {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    limit: parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '10'),
    postsToScan: parseInt(args.find(a => a.startsWith('--posts='))?.split('=')[1] || '5'),
};

if (args.includes('--help') || args.includes('-h')) {
    console.log(`
💬 Facebook Comment Auto-Responder
════════════════════════════════════

Usage:
  node respond-comments.js [options]

Options:
  --dry-run, -d         Preview replies without posting
  --limit=N             Max comments to reply to (default: 10)
  --posts=N             Number of recent posts to scan (default: 5)
  --help, -h            Show this help

Examples:
  node scripts/respond-comments.js
  node scripts/respond-comments.js --dry-run --limit=5
  node scripts/respond-comments.js --posts=10 --limit=20
`);
    process.exit(0);
}

respondToComments(options).catch(error => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
});

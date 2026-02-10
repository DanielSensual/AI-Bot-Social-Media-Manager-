#!/usr/bin/env node
/**
 * X (Twitter) Mention Responder CLI
 * Scans mentions and replies with AI
 */

import 'dotenv/config';
import { respondToMentions } from '../src/twitter-responder.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('-d');
const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '10', 10);

respondToMentions({ dryRun, limit })
    .then(result => {
        console.log('');
        if (result.replied > 0) {
            console.log(`🎯 ${result.replied} mention(s) replied on X`);
        }
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Fatal:', error.message);
        process.exit(1);
    });

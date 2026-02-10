#!/usr/bin/env node
/**
 * Instagram Comment Responder CLI
 * Scans recent IG posts and replies to comments with AI
 */

import 'dotenv/config';
import { respondToInstagramComments } from '../src/instagram-responder.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('-d');
const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '10', 10);

respondToInstagramComments({ dryRun, limit })
    .then(result => {
        console.log('');
        if (result.replied > 0) {
            console.log(`🎯 ${result.replied} Instagram comment(s) replied`);
        }
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Fatal:', error.message);
        process.exit(1);
    });

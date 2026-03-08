#!/usr/bin/env node
/**
 * X Session Saver
 * ------------------
 * Run this ONCE interactively to save the X login session (cookies + storage).
 * The saved file is picked up by ai-takeover-engage.js for headless automation.
 *
 * Usage:
 *   node scripts/save-x-session.js
 *
 * A browser will open. Log in to X manually (or if already logged in, just wait).
 * Press ENTER in the terminal when done. The session is saved to .x-session.json
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = path.join(__dirname, '..', '.x-session.json');

async function main() {
    console.log('🔐 X Session Saver');
    console.log('   Opening browser — log in to X as @Ghostaisystems...\n');

    const browser = await chromium.launch({ headless: false, slowMo: 50 });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise(resolve => {
        rl.question('✅ Once you are logged in on X, press ENTER to save the session...', () => {
            rl.close();
            resolve();
        });
    });

    const state = await context.storageState();
    fs.writeFileSync(SESSION_FILE, JSON.stringify(state, null, 2));
    console.log(`\n✅ Session saved to: ${SESSION_FILE}`);
    console.log('   The engagement bot will use this file for headless runs.\n');

    await browser.close();
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});

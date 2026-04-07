#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

process.env.DS_SHARE_BOT_NAME ??= 'Daniel Sensual Personal';
process.env.DS_SHARE_ENTRY_SCRIPT ??= 'scripts/danielsensual-personal-share.js';
process.env.DS_SHARE_LOGIN_COMMAND ??= 'node scripts/danielsensual-personal-share.js --login';
process.env.DS_SHARE_IDENTITY_MODE ??= 'profile';
process.env.DANIELSENSUAL_SHARE_USER_DATA_DIR ??= path.join(
    process.env.HOME || '/root',
    '.danielsensual-personal-chrome-profile',
);
process.env.DS_SHARE_URL_STATE_FILE ??= path.join(repoRoot, '.danielsensual-personal-share-url.json');
process.env.DANIELSENSUAL_SHARE_STATE_FILE ??= path.join(repoRoot, '.danielsensual-personal-share-state.json');

await import('./danielsensual-share.js');

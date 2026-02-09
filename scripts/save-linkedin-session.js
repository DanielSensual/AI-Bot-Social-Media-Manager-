#!/usr/bin/env node
/**
 * LinkedIn Session Saver
 * Opens browser for manual login and saves cookies for automated use
 */

import { saveSession } from '../src/linkedin-responder.js';

saveSession().catch(console.error);

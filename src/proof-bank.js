/**
 * Proof Bank — the only source of client results the bots may publish.
 * Entries live in data/proof-bank.json; only verified:true entries are usable.
 * The QC gate blocks any result-metric not backed by a verified entry.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROOF_BANK_PATH = path.join(__dirname, '..', 'data', 'proof-bank.json');

let cache = null;
let cacheMtime = 0;

function loadRaw() {
    try {
        const stat = fs.statSync(PROOF_BANK_PATH);
        if (!cache || stat.mtimeMs !== cacheMtime) {
            cache = JSON.parse(fs.readFileSync(PROOF_BANK_PATH, 'utf-8'));
            cacheMtime = stat.mtimeMs;
        }
        return cache;
    } catch {
        console.warn('⚠️ proof-bank.json missing or unreadable — treating proof bank as empty');
        return { entries: [] };
    }
}

/**
 * All entries, verified or not (for reports/curation tools)
 */
export function getAllEntries() {
    return loadRaw().entries || [];
}

/**
 * Only entries Daniel has confirmed — the publishable set
 */
export function getVerifiedEntries() {
    return getAllEntries().filter(e => e.verified === true);
}

/**
 * Normalized number-strings from verified entries.
 * Used by the QC gate to allow metrics that have real proof behind them.
 */
export function getApprovedNumberStrings() {
    const approved = new Set();
    for (const entry of getVerifiedEntries()) {
        for (const n of entry.numbers || []) {
            approved.add(String(n).toLowerCase().replace(/\s+/g, ' ').trim());
        }
    }
    return [...approved];
}

/**
 * Prompt block injected into generation. Explicit about emptiness —
 * the model must know it cannot cite results when nothing is verified.
 */
export function formatProofBlock() {
    const verified = getVerifiedEntries();
    if (verified.length === 0) {
        return [
            '═══ PROOF BANK (verified client results) ═══',
            'EMPTY — no verified results available.',
            'You may NOT cite any client name, metric, or outcome in this post.',
            'Write a builder log, opinion, or industry take instead.',
        ].join('\n');
    }

    const lines = verified.map(e => `- ${e.client} (${e.niche}): ${e.claim}`);
    return [
        '═══ PROOF BANK (verified client results — the ONLY citable numbers) ═══',
        ...lines,
        'Any number or client not listed above is OFF LIMITS.',
    ].join('\n');
}

export default { getAllEntries, getVerifiedEntries, getApprovedNumberStrings, formatProofBlock };

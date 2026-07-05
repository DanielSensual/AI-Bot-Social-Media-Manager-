/**
 * QC Gate — last check before anything publishes.
 * Blocks: unverified result-metrics (proof-bank contract), banned/worn-out
 * phrases, protected live-event marks (World Cup window), hashtags,
 * emoji overuse, and platform length limits.
 *
 * A post that fails here should be REGENERATED, never trimmed into compliance.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getApprovedNumberStrings } from './proof-bank.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_PATH = path.join(__dirname, '..', 'data', 'banned-phrases.json');

const PLATFORM_MAX_LENGTH = { x: 280, threads: 500, linkedin: 3000, facebook: 5000, instagram: 2200 };

// Result-shaped metrics that need proof behind them.
// Deliberately narrow: times of day, years, "24/7" etc. pass untouched.
const METRIC_PATTERNS = [
    // money AS A RESULT ("made a client $18k", "$12k in revenue") — rhetorical
    // pricing talk ("agencies charge $15k for a template") is allowed
    /(?:made|earned|generated|saved|added|closed|booked|brought in)[^.!?\n]{0,40}\$[\d,]+(?:\.\d+)?k?\b/gi,
    /\$[\d,]+(?:\.\d+)?k?\b[^.!?\n]{0,40}(?:revenue|profit|in sales|made|earned|generated|saved|booked)/gi,
    /\b\d+(?:\.\d+)?x\b/gi,                                       // multipliers (3x)
    // percents — except AI-disclosure statements ("100% AI-generated")
    /\b\d+(?:\.\d+)?\s*%(?!\s*ai[\s-])/gi,
    // count + result noun ("41 leads", "29 calls", "12 bookings")
    /\b\d[\d,]*\s+(?:qualified\s+)?(?:leads?|calls?|bookings?|appointments?|clients?|customers?|conversions?|deals?|sales?|signups?|sign-ups|demos?|inquiries|messages?)\b/gi,
];

let rulesCache = null;
let rulesMtime = 0;

function loadRules() {
    try {
        const stat = fs.statSync(RULES_PATH);
        if (!rulesCache || stat.mtimeMs !== rulesMtime) {
            rulesCache = JSON.parse(fs.readFileSync(RULES_PATH, 'utf-8'));
            rulesMtime = stat.mtimeMs;
        }
        return rulesCache;
    } catch {
        console.warn('⚠️ banned-phrases.json missing — QC running with built-in minimums');
        return { banned: ['72 hours'], protectedMarks: ['world cup', 'fifa'] };
    }
}

function normalize(s) {
    return String(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

function countEmoji(text) {
    const matches = text.match(/\p{Extended_Pictographic}/gu);
    return matches ? matches.length : 0;
}

/**
 * Review a candidate post before publishing.
 * @param {string} text - The post text
 * @param {object} [options]
 * @param {string} [options.platform='x'] - Platform key (x|linkedin|facebook|instagram|threads)
 * @param {string[]} [options.approvedNumbers] - Override the proof-bank approved set (tests)
 * @returns {{pass: boolean, violations: Array<{rule: string, detail: string}>}}
 */
export function reviewPost(text, options = {}) {
    const platform = options.platform || 'x';
    const violations = [];
    const body = String(text || '');
    const lower = normalize(body);
    const rules = loadRules();

    // 1. Banned phrases (worn-out hooks, corporate tells)
    for (const phrase of rules.banned || []) {
        if (lower.includes(normalize(phrase))) {
            violations.push({ rule: 'banned-phrase', detail: `"${phrase}"` });
        }
    }

    // 2. Protected live-event marks (legal, not stylistic)
    for (const mark of rules.protectedMarks || []) {
        if (lower.includes(normalize(mark))) {
            violations.push({ rule: 'protected-mark', detail: `"${mark}" — registered mark / ambush-marketing exposure` });
        }
    }

    // 3. Hashtags — house rule: none, on any platform
    if (/#\w/.test(body)) {
        violations.push({ rule: 'hashtag', detail: 'hashtags are banned on all platforms (ghost-brain-v2)' });
    }

    // 4. Emoji budget: 1 max
    const emoji = countEmoji(body);
    if (emoji > 1) {
        violations.push({ rule: 'emoji-overuse', detail: `${emoji} emoji (max 1)` });
    }

    // 5. Platform length
    const maxLen = PLATFORM_MAX_LENGTH[platform];
    if (maxLen && body.length > maxLen) {
        violations.push({ rule: 'too-long', detail: `${body.length} chars > ${maxLen} (${platform})` });
    }

    // 6. Unverified result-metrics — the proof-bank contract
    const approved = (options.approvedNumbers || getApprovedNumberStrings()).map(normalize);
    for (const pattern of METRIC_PATTERNS) {
        pattern.lastIndex = 0;
        for (const match of body.matchAll(pattern)) {
            const found = normalize(match[0]);
            const isApproved = approved.some(a => a.includes(found) || found.includes(a));
            if (!isApproved) {
                violations.push({ rule: 'unverified-metric', detail: `"${match[0]}" has no verified proof-bank entry` });
            }
        }
    }

    return { pass: violations.length === 0, violations };
}

/**
 * Human/LLM-readable violation summary — logged, and fed back into
 * the regeneration prompt so the next attempt fixes the actual problem.
 */
export function formatViolations(violations) {
    return violations.map(v => `[${v.rule}] ${v.detail}`).join('; ');
}

export default { reviewPost, formatViolations };

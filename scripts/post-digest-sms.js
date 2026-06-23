#!/usr/bin/env node
/**
 * Daily Post Digest → SMS (Twilio)
 *
 * Reads today's posts from ghostai.db `post_history` (the cross-process store
 * every posting app already writes to), builds a concise summary, and texts it
 * to the owner once a day (PM2 cron at 11 PM EST).
 *
 * Digest: total posts, per-platform counts, top pillar, failures, 1-line preview
 * of each post. Kept under ~1500 chars (fits an MMS / a few SMS segments).
 *
 * Usage:
 *   node scripts/post-digest-sms.js            # build + send
 *   node scripts/post-digest-sms.js --dry-run  # build + print, no send
 *
 * Env (copy from the MediaGeekz Twilio service):
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 *   DIGEST_SMS_TO (optional, default +13216665228)
 */

import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { getTimeZoneDateKey, isTimestampOnDateInTimeZone } from '../src/timezone.js';

const TZ = 'America/New_York';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'ghostai.db');
const TO = (process.env.DIGEST_SMS_TO || '+13216665228').trim();
const MAX_BODY = 1500; // stay under the 1600-char MMS ceiling
const DRY_RUN = process.argv.includes('--dry-run') || process.argv.includes('-d');

const PLATFORMS = ['x', 'linkedin', 'facebook', 'instagram'];
const LABEL = { x: 'X', linkedin: 'LI', facebook: 'FB', instagram: 'IG' };

function getTodaysPosts() {
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    try {
        const todayKey = getTimeZoneDateKey(new Date(), TZ);
        const rows = db.prepare(
            'SELECT * FROM post_history ORDER BY datetime(created_at) DESC LIMIT 300'
        ).all();
        return rows.filter((r) => isTimestampOnDateInTimeZone(r.created_at, todayKey, TZ));
    } finally {
        db.close();
    }
}

function buildDigest(rows, dateKey) {
    const counts = { x: 0, linkedin: 0, facebook: 0, instagram: 0 };
    const pillarCounts = {};
    let failures = 0;

    for (const r of rows) {
        const hit = PLATFORMS.filter((p) => r['result_' + p]);
        if (hit.length === 0) failures += 1;
        for (const p of hit) counts[p] += 1;
        if (r.pillar) pillarCounts[r.pillar] = (pillarCounts[r.pillar] || 0) + 1;
    }

    const topPillar = Object.entries(pillarCounts).sort((a, b) => b[1] - a[1])[0];
    const platLine = PLATFORMS.map((p) => `${LABEL[p]}:${counts[p]}`).join('  ');
    const label = dateKey.slice(5); // MM-DD

    const head = [
        `👻 Ghost AI — Daily Digest ${label}`,
        ``,
        `📊 ${rows.length} post${rows.length === 1 ? '' : 's'} today`,
        `   ${platLine}`,
        `🏆 Top pillar: ${topPillar ? `${topPillar[0]} (${topPillar[1]})` : '—'}`,
        `⚠️ Failures: ${failures}`,
    ].join('\n');

    if (rows.length === 0) {
        return `${head}\n\nNo posts recorded today — check the fleet.`;
    }

    let body = head + '\n';
    let shown = 0;
    for (const r of rows) {
        const hit = PLATFORMS.filter((p) => r['result_' + p]).map((p) => LABEL[p]).join('/') || 'FAIL';
        const text = String(r.text || '').replace(/\s+/g, ' ').trim().slice(0, 52);
        const line = `\n• [${hit}] ${r.pillar || '—'}: ${text}`;
        if (body.length + line.length > MAX_BODY - 18) {
            body += `\n…+${rows.length - shown} more`;
            break;
        }
        body += line;
        shown += 1;
    }
    return body;
}

async function sendSms(body) {
    const sid = (process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_SID || '').trim();
    const token = (process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_TOKEN || '').trim();
    const from = (
        process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER ||
        process.env.TWILIO_NUMBER || process.env.TWILIO_FROM || ''
    ).trim();

    if (!sid || !token || !from) {
        console.warn('⚠️ Twilio not configured — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER. Skipping send.');
        return { skipped: true };
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const params = new URLSearchParams({ From: from, To: TO, Body: body });
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
        signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Twilio ${res.status}: ${data.message || JSON.stringify(data)}`);
    return { sid: data.sid };
}

async function main() {
    const dateKey = getTimeZoneDateKey(new Date(), TZ);
    const rows = getTodaysPosts();
    const body = buildDigest(rows, dateKey);

    console.log('─'.repeat(50));
    console.log(body);
    console.log('─'.repeat(50));
    console.log(`(${body.length} chars → ${TO})`);

    if (DRY_RUN) {
        console.log('🔒 DRY RUN — not sent');
        return;
    }
    try {
        const r = await sendSms(body);
        if (r.skipped) console.log('Digest not sent (Twilio unconfigured).');
        else console.log(`✅ SMS sent (${r.sid})`);
    } catch (err) {
        console.error(`❌ SMS send failed: ${err.message}`);
        process.exitCode = 1;
    }
}

main().catch((err) => {
    console.error('Digest fatal error:', err.message);
    process.exit(1);
});

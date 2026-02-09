/**
 * Email Sender
 * Delivers outreach emails via Resend API.
 */

import config from './config.js';
import { logOutreach, getTodayOutreachCount, updateLeadStatus } from './db.js';

const RESEND_URL = 'https://api.resend.com/emails';

/**
 * Send an email via Resend
 * @param {object} lead - Lead object
 * @param {string} subject - Email subject
 * @param {string} body - Email body (plain text)
 * @param {string} type - Outreach type for logging
 * @param {boolean} dryRun - If true, log but don't actually send
 * @returns {boolean} success
 */
export async function sendEmail(lead, subject, body, type = 'initial', dryRun = false) {
    const apiKey = config.api.resend;

    // Check daily limit
    const todayCount = getTodayOutreachCount();
    if (todayCount >= config.outreach.maxPerDay) {
        console.log(`⚠️ Daily limit reached (${config.outreach.maxPerDay}). Skipping.`);
        return false;
    }

    // Must have an email to send to
    if (!lead.email) {
        console.log(`   ⚠️ No email for ${lead.business_name} — skipping`);
        return false;
    }

    if (dryRun) {
        console.log(`\n📧 [DRY RUN] Would send to: ${lead.email}`);
        console.log(`   Subject: ${subject}`);
        console.log(`   Body:\n   ${body.replace(/\n/g, '\n   ')}`);
        console.log('');
        return true;
    }

    if (!apiKey) {
        throw new Error('RESEND_API_KEY not set in .env');
    }

    try {
        const response = await fetch(RESEND_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                from: `${config.brand.fromName} <${config.brand.fromEmail}>`,
                to: [lead.email],
                subject: subject,
                text: body,
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            console.error(`   ❌ Send failed for ${lead.business_name}: ${err}`);
            return false;
        }

        // Log to database
        logOutreach(lead.id, type, subject, body);
        updateLeadStatus(lead.id, 'contacted');

        console.log(`   ✅ Sent to ${lead.email} — ${lead.business_name}`);
        return true;

    } catch (err) {
        console.error(`   ❌ Error sending to ${lead.business_name}: ${err.message}`);
        return false;
    }
}

/**
 * Send emails to a batch of leads
 * @param {Array} leads - Array of { lead, subject, body, type }
 * @param {boolean} dryRun
 * @returns {number} sent count
 */
export async function sendBatch(items, dryRun = false) {
    console.log(`\n📬 Sending ${items.length} emails${dryRun ? ' (DRY RUN)' : ''}...\n`);

    let sent = 0;
    for (const item of items) {
        const ok = await sendEmail(item.lead, item.subject, item.body, item.type, dryRun);
        if (ok) sent++;

        // Rate limit: 2 second gap between sends
        if (!dryRun && items.indexOf(item) < items.length - 1) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    console.log(`\n✅ ${sent}/${items.length} emails ${dryRun ? 'previewed' : 'sent'}`);
    return sent;
}

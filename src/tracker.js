/**
 * Reply & Engagement Tracker
 * Monitors email opens, clicks, and replies via Resend webhooks
 * Updates lead statuses and fires Discord alerts for replies
 */

import config from './config.js';
import { getDb } from './db.js';
import { notifyDiscord } from './alerts.js';

/**
 * Process a Resend webhook event
 * Events: email.sent, email.delivered, email.opened, email.clicked,
 *         email.bounced, email.complained, email.delivery_delayed
 */
export function processWebhookEvent(event) {
    const db = getDb();
    const type = event.type;
    const data = event.data || {};
    const toEmail = Array.isArray(data.to) ? data.to[0] : data.to;

    if (!toEmail) return { processed: false, reason: 'no recipient' };

    // Find the lead by email
    const lead = db.prepare('SELECT * FROM leads WHERE email = ?').get(toEmail);
    if (!lead) return { processed: false, reason: 'lead not found' };

    const now = new Date().toISOString();

    switch (type) {
        case 'email.delivered':
            db.prepare("UPDATE leads SET status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END, updated_at = ? WHERE id = ?")
                .run(now, lead.id);
            logActivity(db, lead.id, 'delivered', data);
            break;

        case 'email.opened':
            logActivity(db, lead.id, 'opened', data);
            // If opened multiple times, they're interested
            const openCount = db.prepare("SELECT COUNT(*) as c FROM outreach_log WHERE lead_id = ? AND type = 'opened'").get(lead.id).c;
            if (openCount >= 3) {
                notifyDiscord({
                    title: '👀 Hot Engagement',
                    message: `**${lead.business_name}** opened your email ${openCount + 1} times! They're warm.`,
                    color: 0xf59e0b,
                }).catch(() => { });
            }
            break;

        case 'email.clicked':
            logActivity(db, lead.id, 'clicked', data);
            notifyDiscord({
                title: '🔗 Link Clicked',
                message: `**${lead.business_name}** clicked a link in your email (${data.click?.url || 'calendar?'})`,
                color: 0x3b82f6,
            }).catch(() => { });
            break;

        case 'email.bounced':
            db.prepare("UPDATE leads SET status = 'bounced', updated_at = ? WHERE id = ?")
                .run(now, lead.id);
            logActivity(db, lead.id, 'bounced', data);
            break;

        case 'email.complained':
            db.prepare("UPDATE leads SET status = 'unsubscribed', updated_at = ? WHERE id = ?")
                .run(now, lead.id);
            logActivity(db, lead.id, 'complained', data);
            break;
    }

    return { processed: true, type, lead: lead.business_name };
}

/**
 * Mark a lead as replied (called when we detect a reply)
 */
export function markReplied(leadId) {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare("UPDATE leads SET status = 'replied', updated_at = ? WHERE id = ?").run(now, leadId);

    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
    if (lead) {
        notifyDiscord({
            title: '🎉 LEAD REPLIED!',
            message: `**${lead.business_name}** replied to your outreach!\nScore: ${lead.ai_score} | Email: ${lead.email}\n\n⚡ Follow up NOW`,
            color: 0x00ff88,
        }).catch(() => { });
    }
}

/**
 * Mark a lead as booked (called when a calendar booking comes in)
 */
export function markBooked(leadId) {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare("UPDATE leads SET status = 'booked', updated_at = ? WHERE id = ?").run(now, leadId);

    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
    if (lead) {
        notifyDiscord({
            title: '📅 CALL BOOKED!',
            message: `**${lead.business_name}** booked a call!\nScore: ${lead.ai_score} | Email: ${lead.email}\n\n🎯 Prepare proposal`,
            color: 0x10b981,
        }).catch(() => { });
    }
}

function logActivity(db, leadId, type, data) {
    try {
        db.prepare(
            'INSERT INTO outreach_log (lead_id, type, subject, body, sent_at) VALUES (?, ?, ?, ?, ?)'
        ).run(leadId, type, type, JSON.stringify(data), new Date().toISOString());
    } catch {
        // Log table might not have all columns — silent fail
    }
}

/**
 * Follow-Up Sequencer
 * Manages automated follow-up touches for leads that haven't replied.
 */

import config from './config.js';
import { getDb, getOutreachCount } from './db.js';
import { generateEmail } from './outreach.js';
import { sendEmail } from './sender.js';

const FOLLOW_UP_TYPES = ['followup_1', 'followup_2', 'followup_3'];

/**
 * Get leads that need a follow-up
 * @returns {Array} leads ready for their next follow-up
 */
export function getFollowUpCandidates() {
    const db = getDb();
    const followUpDays = config.outreach.followUpDays;

    // Get all contacted leads that haven't replied
    const leads = db.prepare(`
        SELECT l.*, 
            (SELECT COUNT(*) FROM outreach_log WHERE lead_id = l.id) as touch_count,
            (SELECT MAX(sent_at) FROM outreach_log WHERE lead_id = l.id) as last_sent
        FROM leads l
        WHERE l.status = 'contacted'
        AND (SELECT COUNT(*) FROM outreach_log WHERE lead_id = l.id) < 4
    `).all();

    // Filter to leads whose cooldown has elapsed
    const now = Date.now();
    return leads.filter(lead => {
        if (!lead.last_sent) return false;
        const lastSent = new Date(lead.last_sent).getTime();
        const dayIdx = Math.min(lead.touch_count - 1, followUpDays.length - 1);
        const waitDays = followUpDays[dayIdx] || 7;
        const waitMs = waitDays * 24 * 60 * 60 * 1000;
        return (now - lastSent) >= waitMs;
    });
}

/**
 * Run the follow-up sequence
 * @param {boolean} dryRun - Preview without sending
 * @returns {number} follow-ups sent
 */
export async function runFollowUps(dryRun = false) {
    const candidates = getFollowUpCandidates();

    if (candidates.length === 0) {
        console.log('✅ No follow-ups needed right now');
        return 0;
    }

    console.log(`\n🔄 ${candidates.length} leads need follow-up\n`);

    let sent = 0;
    for (const lead of candidates) {
        const touchCount = lead.touch_count || 1;
        const type = FOLLOW_UP_TYPES[Math.min(touchCount - 1, FOLLOW_UP_TYPES.length - 1)];

        try {
            // Generate follow-up email
            const email = await generateEmail(lead, type);

            console.log(`  📧 ${lead.business_name} — Touch #${touchCount + 1} (${type})`);

            const ok = await sendEmail(lead, email.subject, email.body, type, dryRun);
            if (ok) sent++;

            // Rate limit
            await new Promise(r => setTimeout(r, 1000));

        } catch (err) {
            console.error(`  ❌ ${lead.business_name}: ${err.message}`);
        }
    }

    console.log(`\n✅ Follow-ups ${dryRun ? 'previewed' : 'sent'}: ${sent}/${candidates.length}`);
    return sent;
}

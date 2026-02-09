/**
 * Discord/Slack Alert Module
 * Sends pipeline notifications via Discord webhook.
 */

import config from './config.js';

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_ALERT_WEBHOOK;

/**
 * Send a notification to Discord
 * @param {object} opts - { title, message, color, fields }
 */
export async function notifyDiscord(opts = {}) {
    if (!DISCORD_WEBHOOK) return; // Silent no-op if no webhook configured

    const embed = {
        title: opts.title || '👻 GhostAI Lead Hunter',
        description: opts.message || '',
        color: opts.color || 0x00ff88,
        timestamp: new Date().toISOString(),
        footer: { text: 'GhostAI Lead Hunter' },
    };

    if (opts.fields) {
        embed.fields = opts.fields.map(f => ({
            name: f.name,
            value: String(f.value),
            inline: f.inline !== false,
        }));
    }

    try {
        await fetch(DISCORD_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] }),
        });
    } catch (err) {
        // Don't crash if Discord is down
        console.error(`⚠️ Discord alert failed: ${err.message}`);
    }
}

/**
 * Alert when a hot lead is found
 */
export async function alertHotLead(lead, score) {
    await notifyDiscord({
        title: '🔥 Hot Lead Found!',
        message: `**${lead.business_name}** scored ${score}/100`,
        color: 0xff6600,
        fields: [
            { name: 'City', value: lead.city || 'Unknown' },
            { name: 'Rating', value: `${lead.rating}/5 (${lead.review_count} reviews)` },
            { name: 'Website', value: lead.website || '❌ None' },
            { name: 'Phone', value: lead.phone || 'N/A' },
        ],
    });
}

/**
 * Alert when a lead replies
 */
export async function alertReply(lead) {
    await notifyDiscord({
        title: '💬 Lead Replied!',
        message: `**${lead.business_name}** responded to your outreach!`,
        color: 0x00ff00,
        fields: [
            { name: 'City', value: lead.city || 'Unknown' },
            { name: 'Phone', value: lead.phone || 'N/A' },
        ],
    });
}

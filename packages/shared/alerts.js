/**
 * Discord Alert Module — @ghostai/shared
 * Unified alerting for all GhostAI bots.
 * Sends pipeline notifications via Discord webhook with deduplication.
 *
 * Supports both lead-hunter style (notifyDiscord, alertHotLead, alertReply)
 * and x-bot style (alert, alertPostFailure, recordFailure, clearFailure).
 */

import dotenv from 'dotenv';
dotenv.config();

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_ALERT_WEBHOOK || '';
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between duplicate alerts
const recentAlerts = new Map();
const failureCounts = new Map();

// =============================================================================
// Core — Low-level Discord webhook
// =============================================================================

/**
 * Send a Discord webhook notification
 * @param {object} opts - { title, message, description, color, fields, footer }
 */
export async function notifyDiscord(opts = {}) {
    const embed = {
        title: opts.title || '👻 GhostAI',
        description: opts.description || opts.message || '',
        color: opts.color || 0x00ff88,
        timestamp: new Date().toISOString(),
        footer: { text: opts.footer || 'GhostAI' },
    };

    if (opts.fields) {
        embed.fields = opts.fields.map(f => ({
            name: f.name,
            value: String(f.value),
            inline: f.inline !== false,
        }));
    }

    if (!DISCORD_WEBHOOK) {
        console.log(`[ALERT] ${embed.title}: ${embed.description}`);
        return;
    }

    try {
        const response = await fetch(DISCORD_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] }),
        });
        if (!response.ok) {
            console.error(`Discord webhook failed: ${response.status}`);
        }
    } catch (err) {
        console.error(`⚠️ Discord alert failed: ${err.message}`);
    }
}

// =============================================================================
// Deduplication — Throttled alerts (used by x-bot)
// =============================================================================

/**
 * Alert with deduplication — won't send the same alert within cooldown period
 * @param {string} title
 * @param {string} message
 * @param {'error'|'warning'|'info'|'success'} severity
 */
export async function alert(title, message, severity = 'error') {
    const key = `${severity}:${title}`;
    const now = Date.now();
    const lastSent = recentAlerts.get(key);

    if (lastSent && now - lastSent < ALERT_COOLDOWN_MS) {
        return; // Suppress duplicate
    }

    recentAlerts.set(key, now);

    const colors = { error: 0xff0000, warning: 0xffa500, info: 0x3498db, success: 0x2ecc71 };
    const emojis = { error: '🚨', warning: '⚠️', info: 'ℹ️', success: '✅' };

    await notifyDiscord({
        title: `${emojis[severity] || '📋'} ${title}`,
        description: message,
        color: colors[severity] || colors.info,
        footer: 'GhostAI Bot Alerting',
    });
}

// =============================================================================
// Convenience helpers
// =============================================================================

/** Alert for platform post failure */
export async function alertPostFailure(platform, error) {
    await alert(
        `${platform} Post Failed`,
        `Post to ${platform} failed:\n\`\`\`\n${error.message || error}\n\`\`\``,
        'error',
    );
}

/** Alert for token expiry warning */
export async function alertTokenExpiry(platform, daysLeft) {
    const severity = daysLeft <= 3 ? 'error' : 'warning';
    await alert(
        `${platform} Token Expiring`,
        `${platform} access token expires in **${daysLeft} days**.`,
        severity,
    );
}

/** Alert for health check failure */
export async function alertHealthCheckFailure(platform, error) {
    await alert(
        `${platform} Health Check Failed`,
        `Health check failed:\n\`\`\`\n${error.message || error}\n\`\`\``,
        'warning',
    );
}

/** Alert when a hot lead is found */
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

/** Alert when a lead replies */
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

/** Send a success notification */
export async function alertSuccess(title, message) {
    await notifyDiscord({ title, description: message, color: 0x2ecc71, footer: 'GhostAI' });
}

// =============================================================================
// Circuit Breaker — Track consecutive failures
// =============================================================================

export function recordFailure(platform) {
    const count = (failureCounts.get(platform) || 0) + 1;
    failureCounts.set(platform, count);

    if (count >= 3) {
        alert(
            `${platform} Circuit Breaker`,
            `${platform} has failed **${count} consecutive times**. Platform may be down or credentials invalid.`,
            'error',
        );
    }

    return count;
}

export function clearFailure(platform) {
    failureCounts.set(platform, 0);
}

export default {
    notifyDiscord,
    alert,
    alertPostFailure,
    alertTokenExpiry,
    alertHealthCheckFailure,
    alertHotLead,
    alertReply,
    alertSuccess,
    recordFailure,
    clearFailure,
};

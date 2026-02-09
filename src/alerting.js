/**
 * Centralized Error Alerting
 * Sends notifications via Discord webhook when critical events occur.
 * Falls back to console-only logging when DISCORD_WEBHOOK_URL is not set.
 */

import dotenv from 'dotenv';
dotenv.config();

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between duplicate alerts
const recentAlerts = new Map(); // key -> timestamp

/**
 * Send a Discord webhook notification
 * @param {string} title - Alert title
 * @param {string} message - Alert details
 * @param {'error'|'warning'|'info'|'success'} severity
 */
async function sendDiscordAlert(title, message, severity = 'error') {
    const colors = {
        error: 0xff0000,   // Red
        warning: 0xffa500, // Orange
        info: 0x3498db,    // Blue
        success: 0x2ecc71, // Green
    };

    const emojis = {
        error: '🚨',
        warning: '⚠️',
        info: 'ℹ️',
        success: '✅',
    };

    const embed = {
        title: `${emojis[severity] || '📋'} ${title}`,
        description: message,
        color: colors[severity] || colors.info,
        timestamp: new Date().toISOString(),
        footer: { text: 'GhostAI Bot Alerting' },
    };

    if (!DISCORD_WEBHOOK_URL) {
        console.log(`[ALERT:${severity.toUpperCase()}] ${title}: ${message}`);
        return;
    }

    try {
        const response = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] }),
        });

        if (!response.ok) {
            console.error(`Discord webhook failed: ${response.status}`);
        }
    } catch (err) {
        console.error(`Discord alert failed: ${err.message}`);
    }
}

/**
 * Alert with deduplication — won't send the same alert within cooldown period
 */
export async function alert(title, message, severity = 'error') {
    const key = `${severity}:${title}`;
    const now = Date.now();
    const lastSent = recentAlerts.get(key);

    if (lastSent && now - lastSent < ALERT_COOLDOWN_MS) {
        return; // Suppress duplicate
    }

    recentAlerts.set(key, now);
    await sendDiscordAlert(title, message, severity);
}

/**
 * Alert for platform post failure
 */
export async function alertPostFailure(platform, error) {
    await alert(
        `${platform} Post Failed`,
        `Post to ${platform} failed:\n\`\`\`\n${error.message || error}\n\`\`\``,
        'error',
    );
}

/**
 * Alert for token expiry warning
 */
export async function alertTokenExpiry(platform, daysLeft) {
    const severity = daysLeft <= 3 ? 'error' : 'warning';
    await alert(
        `${platform} Token Expiring`,
        `${platform} access token expires in **${daysLeft} days**.\nRun \`npm run linkedin:auth\` to refresh.`,
        severity,
    );
}

/**
 * Alert for health check failure
 */
export async function alertHealthCheckFailure(platform, error) {
    await alert(
        `${platform} Health Check Failed`,
        `Health check failed:\n\`\`\`\n${error.message || error}\n\`\`\``,
        'warning',
    );
}

/**
 * Alert for consecutive failures (circuit breaker)
 */
const failureCounts = new Map();

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

/**
 * Send a success/status notification
 */
export async function alertSuccess(title, message) {
    await sendDiscordAlert(title, message, 'success');
}

export default {
    alert,
    alertPostFailure,
    alertTokenExpiry,
    alertHealthCheckFailure,
    recordFailure,
    clearFailure,
    alertSuccess,
};

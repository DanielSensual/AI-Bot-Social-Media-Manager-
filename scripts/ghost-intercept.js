#!/usr/bin/env node

/**
 * Ghost Intercept — Inbound Message Relay
 * 
 * Forwards new inbound messages from OpenClaw channels (iMessage, WhatsApp, Telegram)
 * to the GhostAI Gateway on Railway. Ghost processes them autonomously and can
 * respond via SMS, email, or even create Square invoices.
 *
 * Usage:
 *   node scripts/ghost-intercept.js           # One-shot relay
 *   node scripts/ghost-intercept.js --watch   # Continuous polling (every 60s)
 *
 * Designed to be triggered by:  
 *   - OpenClaw heartbeat
 *   - cron job (every 1-5 min)
 *   - PM2 process
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '..', '.ghost-intercept-state.json');

const GATEWAY_URL = process.env.GATEWAY_URL || 'https://ghostai-gateway-production.up.railway.app';

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadState() {
    try {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    } catch {
        return { lastProcessedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), forwarded: 0 };
    }
}

function saveState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Forward a message to the Ghost Gateway webhook
 */
async function forwardToGhost({ source, from, content, timestamp }) {
    const payload = {
        source: source,            // 'imessage', 'whatsapp', 'telegram'
        content: `From: ${from}\nMessage: ${content}\nReceived: ${timestamp || new Date().toISOString()}`,
    };

    console.log(`[Intercept] 📨 Forwarding ${source} message from ${from} to Ghost...`);

    try {
        const res = await fetch(`${GATEWAY_URL}/events/webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const data = await res.json();
        console.log(`[Intercept] ✅ Gateway accepted: ${data.status}`);
        return true;
    } catch (err) {
        console.error(`[Intercept] ❌ Failed to forward: ${err.message}`);
        return false;
    }
}

/**
 * Read recent messages from OpenClaw's message sources
 * 
 * OpenClaw stores messages in its SQLite database. We read from there
 * and forward anything newer than our last checkpoint.
 */
async function getNewMessages(state) {
    const messages = [];

    // Strategy 1: Check OpenClaw's SQLite message store
    const openclawDbPath = path.join(process.env.HOME, '.openclaw', 'messages.db');

    try {
        // Try to import better-sqlite3 for direct DB access
        const Database = (await import('better-sqlite3')).default;
        const db = new Database(openclawDbPath, { readonly: true });

        const rows = db.prepare(`
      SELECT channel, sender, body, created_at 
      FROM messages 
      WHERE created_at > ? 
        AND role = 'user'
        AND sender != 'ghost'
      ORDER BY created_at ASC
      LIMIT 20
    `).all(state.lastProcessedAt);

        for (const row of rows) {
            messages.push({
                source: row.channel || 'unknown',
                from: row.sender,
                content: row.body,
                timestamp: row.created_at,
            });
        }

        db.close();
        console.log(`[Intercept] Found ${messages.length} new messages in OpenClaw DB`);
    } catch (err) {
        // If OpenClaw DB is not available, try reading from the filesystem
        console.log(`[Intercept] OpenClaw DB not available (${err.message}), checking filesystem...`);

        // Strategy 2: Check a drop folder for message files
        const dropFolder = path.join(__dirname, '..', 'inbound-messages');
        try {
            if (fs.existsSync(dropFolder)) {
                const files = fs.readdirSync(dropFolder).filter(f => f.endsWith('.json'));
                for (const file of files) {
                    const msg = JSON.parse(fs.readFileSync(path.join(dropFolder, file), 'utf-8'));
                    if (new Date(msg.timestamp) > new Date(state.lastProcessedAt)) {
                        messages.push(msg);
                    }
                    // Clean up processed file
                    fs.unlinkSync(path.join(dropFolder, file));
                }
            }
        } catch (fsErr) {
            console.log(`[Intercept] No drop folder found either. Waiting for messages...`);
        }
    }

    return messages;
}

/**
 * Main intercept cycle
 */
async function runIntercept() {
    const state = loadState();
    console.log(`[Intercept] 🔍 Checking for messages since ${state.lastProcessedAt}...`);

    const messages = await getNewMessages(state);

    if (messages.length === 0) {
        console.log(`[Intercept] No new messages.`);
        return;
    }

    let forwarded = 0;
    for (const msg of messages) {
        const ok = await forwardToGhost(msg);
        if (ok) forwarded++;
        // Small delay between forwards to avoid overwhelming the agent
        await new Promise(r => setTimeout(r, 1000));
    }

    // Update state
    state.lastProcessedAt = new Date().toISOString();
    state.forwarded += forwarded;
    saveState(state);

    console.log(`[Intercept] ✅ Forwarded ${forwarded}/${messages.length} messages. Total: ${state.forwarded}`);
}

// ── Entry Point ──────────────────────────────────────────────────────────────

const isWatch = process.argv.includes('--watch');

if (isWatch) {
    console.log(`[Intercept] 👁️ Watch mode — polling every 60s`);
    runIntercept();
    setInterval(runIntercept, 60 * 1000);
} else {
    runIntercept().then(() => {
        console.log(`[Intercept] Done.`);
    });
}

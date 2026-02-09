#!/usr/bin/env node

/**
 * Webhook Server — Receives Resend events for reply/open/click tracking
 * Usage: npm run webhooks
 * 
 * Configure in Resend Dashboard → Webhooks:
 *   URL: https://your-domain.com/webhook/resend (or use ngrok for local)
 *   Events: email.delivered, email.opened, email.clicked, email.bounced, email.complained
 */

import http from 'http';
import { processWebhookEvent, markReplied } from '../src/tracker.js';

const PORT = process.env.WEBHOOK_PORT || 3847;

const server = http.createServer(async (req, res) => {
    // Health check
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, service: 'lead-hunter-webhooks' }));
        return;
    }

    // Resend webhook
    if (req.method === 'POST' && req.url === '/webhook/resend') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const event = JSON.parse(body);
                const result = processWebhookEvent(event);
                console.log(`📨 ${event.type} → ${result.processed ? result.lead : result.reason}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, ...result }));
            } catch (err) {
                console.error(`❌ Webhook error: ${err.message}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: err.message }));
            }
        });
        return;
    }

    // Mark replied manually
    if (req.method === 'POST' && req.url?.startsWith('/reply/')) {
        const leadId = parseInt(req.url.split('/')[2], 10);
        if (leadId) {
            markReplied(leadId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, leadId }));
        } else {
            res.writeHead(400);
            res.end(JSON.stringify({ ok: false }));
        }
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

server.listen(PORT, () => {
    console.log(`\n🔔 Webhook server running on port ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   Resend: POST http://localhost:${PORT}/webhook/resend`);
    console.log(`   Reply:  POST http://localhost:${PORT}/reply/:leadId\n`);
});

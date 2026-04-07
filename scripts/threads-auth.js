#!/usr/bin/env node
/**
 * Threads OAuth Helper
 * 
 * Spins up a local server to handle the OAuth callback from Threads.
 * Opens the browser for you to authorize, captures the code,
 * exchanges it for a short-lived token, then upgrades to long-lived.
 * 
 * Usage:
 *   node scripts/threads-auth.js
 * 
 * Requires in .env:
 *   THREADS_APP_ID      — Your Meta app ID (same as the Facebook app)
 *   THREADS_APP_SECRET  — Your Meta app secret
 */

import dotenv from 'dotenv';
import http from 'http';
import { execSync } from 'child_process';

dotenv.config();

const APP_ID = process.env.THREADS_APP_ID || process.env.META_APP_ID || '327613634565997';
const APP_SECRET = process.env.THREADS_APP_SECRET || process.env.META_APP_SECRET;
const PORT = 7331;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = 'threads_basic,threads_content_publish,threads_manage_replies,threads_manage_insights';

if (!APP_SECRET) {
    console.error('❌ Missing THREADS_APP_SECRET or META_APP_SECRET in .env');
    console.error('   Find it at: developers.facebook.com → Your App → Settings → Basic → App Secret');
    process.exit(1);
}

// Step 1: Open browser for authorization
const authUrl = `https://threads.net/oauth/authorize?${new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    response_type: 'code',
    state: 'ghostai_threads_auth',
}).toString()}`;

console.log('🧵 Threads OAuth Flow');
console.log('═'.repeat(50));
console.log(`   App ID: ${APP_ID}`);
console.log(`   Redirect: ${REDIRECT_URI}`);
console.log(`   Scopes: ${SCOPES}`);
console.log('');
console.log('Opening browser for authorization...');
console.log('');

// Open in default browser
try {
    execSync(`open "${authUrl}"`);
} catch {
    console.log('Could not auto-open browser. Visit this URL:');
    console.log(authUrl);
}

// Step 2: Local server to catch the callback
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    
    if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
    }

    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
        console.error(`❌ Auth denied: ${error}`);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>❌ Auth denied</h1><p>Check terminal for details.</p>');
        server.close();
        process.exit(1);
    }

    if (!code) {
        res.writeHead(400);
        res.end('Missing code parameter');
        return;
    }

    console.log('✅ Authorization code received!');
    console.log('');

    // Step 3: Exchange code for short-lived token
    try {
        console.log('📡 Exchanging code for short-lived token...');
        const tokenRes = await fetch('https://graph.threads.net/oauth/access_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: APP_ID,
                client_secret: APP_SECRET,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI,
                code,
            }).toString(),
        });

        const tokenData = await tokenRes.json();
        
        if (tokenData.error) {
            throw new Error(tokenData.error_message || tokenData.error?.message || 'Token exchange failed');
        }

        console.log(`   ✅ Short-lived token obtained (user_id: ${tokenData.user_id})`);
        
        // Step 4: Exchange for long-lived token (60 days)
        console.log('📡 Upgrading to long-lived token...');
        const longRes = await fetch(
            `https://graph.threads.net/access_token?${new URLSearchParams({
                grant_type: 'th_exchange_token',
                client_secret: APP_SECRET,
                access_token: tokenData.access_token,
            }).toString()}`
        );

        const longData = await longRes.json();
        
        if (longData.error) {
            // Fall back to short-lived token
            console.warn('   ⚠️ Long-lived exchange failed, using short-lived token');
            console.log('');
            printResults(tokenData.access_token, tokenData.user_id, 'short-lived (~1 hour)');
        } else {
            console.log('   ✅ Long-lived token obtained (60 days)');
            console.log('');
            printResults(longData.access_token, tokenData.user_id, 'long-lived (~60 days)');
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <html>
            <body style="font-family: system-ui; text-align: center; padding: 60px; background: #0a0a0a; color: #fff;">
                <h1>✅ Threads Auth Complete!</h1>
                <p style="color: #10b981;">Token and User ID have been printed to your terminal.</p>
                <p style="color: #6b7280;">You can close this tab.</p>
            </body>
            </html>
        `);
    } catch (err) {
        console.error(`❌ Token exchange failed: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`<h1>❌ Error</h1><p>${err.message}</p>`);
    }

    server.close();
    setTimeout(() => process.exit(0), 1000);
});

function printResults(token, userId, tokenType) {
    console.log('═'.repeat(50));
    console.log('🎉 THREADS CREDENTIALS');
    console.log('═'.repeat(50));
    console.log('');
    console.log(`THREADS_ACCESS_TOKEN=${token}`);
    console.log(`THREADS_USER_ID=${userId}`);
    console.log('');
    console.log(`Token type: ${tokenType}`);
    console.log('');
    console.log('Add these to your .env file, or run:');
    console.log(`   sed -i '' 's|^THREADS_ACCESS_TOKEN=.*|THREADS_ACCESS_TOKEN=${token}|' .env`);
    console.log(`   sed -i '' 's|^THREADS_USER_ID=.*|THREADS_USER_ID=${userId}|' .env`);
    console.log('');
}

server.listen(PORT, () => {
    console.log(`🔗 Listening for OAuth callback on http://localhost:${PORT}/callback`);
    console.log('   Waiting for you to authorize in the browser...');
    console.log('');
});

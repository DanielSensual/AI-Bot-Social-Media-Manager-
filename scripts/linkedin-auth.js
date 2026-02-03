#!/usr/bin/env node
/**
 * LinkedIn OAuth Authentication Script
 * Run this once to authorize the bot to post on your behalf
 */

import dotenv from 'dotenv';
import http from 'http';
import { getAuthUrl, exchangeCodeForToken, testLinkedInConnection } from '../src/linkedin-client.js';

dotenv.config();

const PORT = 3000;

async function main() {
    console.log('');
    console.log('🔐 LinkedIn OAuth Authentication');
    console.log('═'.repeat(50));
    console.log('');

    // Check for existing valid token
    const connected = await testLinkedInConnection().catch(() => false);
    if (connected) {
        console.log('\n✅ Already authenticated! Token is valid.');
        process.exit(0);
    }

    // Generate auth URL
    const authUrl = getAuthUrl();

    console.log('📋 Step 1: Open this URL in your browser:\n');
    console.log(authUrl);
    console.log('');
    console.log('📋 Step 2: Log in and authorize the app');
    console.log('📋 Step 3: You will be redirected to localhost:3000');
    console.log('');
    console.log('⏳ Waiting for authorization callback...\n');

    // Start local server to catch the callback
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://localhost:${PORT}`);

        if (url.pathname === '/callback') {
            const code = url.searchParams.get('code');
            const error = url.searchParams.get('error');

            if (error) {
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end(`<h1>Authorization Failed</h1><p>${error}</p>`);
                console.error('❌ Authorization failed:', error);
                server.close();
                process.exit(1);
            }

            if (code) {
                try {
                    await exchangeCodeForToken(code);

                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`
            <html>
              <head><title>Success!</title></head>
              <body style="font-family: system-ui; text-align: center; padding: 50px;">
                <h1>✅ LinkedIn Connected!</h1>
                <p>You can close this window and return to the terminal.</p>
              </body>
            </html>
          `);

                    console.log('\n🎉 Success! LinkedIn is now connected.');
                    console.log('   You can now post to LinkedIn using the bot.');

                    setTimeout(() => {
                        server.close();
                        process.exit(0);
                    }, 1000);

                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'text/html' });
                    res.end(`<h1>Error</h1><p>${err.message}</p>`);
                    console.error('❌ Token exchange failed:', err.message);
                    server.close();
                    process.exit(1);
                }
            }
        } else {
            res.writeHead(404);
            res.end('Not found');
        }
    });

    server.listen(PORT, () => {
        console.log(`🌐 Callback server listening on http://localhost:${PORT}`);
    });
}

main();

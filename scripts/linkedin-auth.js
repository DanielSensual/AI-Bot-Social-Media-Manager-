#!/usr/bin/env node
/**
 * LinkedIn OAuth Authentication Script
 * Run this once to authorize the bot to post on your behalf
 * Usage: node scripts/linkedin-auth.js [--profile profilename]
 */

import dotenv from 'dotenv';
import http from 'http';
import { getAuthUrl, exchangeCodeForToken, testLinkedInConnection, resolveRedirectUri } from '../src/linkedin-client.js';

dotenv.config();

function parseArgs(argv) {
    const parsed = {
        profile: 'default',
        port: null,
        redirectUri: '',
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];

        if (arg.startsWith('--profile=')) {
            parsed.profile = arg.split('=')[1] || 'default';
            continue;
        }

        if (arg === '--profile') {
            const value = argv[i + 1];
            if (value && !value.startsWith('-')) {
                parsed.profile = value;
                i += 1;
            }
            continue;
        }

        if (arg.startsWith('--port=')) {
            const value = Number.parseInt(arg.split('=')[1], 10);
            if (!Number.isNaN(value)) parsed.port = value;
            continue;
        }

        if (arg === '--port') {
            const value = Number.parseInt(argv[i + 1], 10);
            if (!Number.isNaN(value)) {
                parsed.port = value;
                i += 1;
            }
            continue;
        }

        if (arg.startsWith('--redirect-uri=')) {
            parsed.redirectUri = arg.slice('--redirect-uri='.length).trim();
            continue;
        }

        if (arg === '--redirect-uri') {
            const value = argv[i + 1];
            if (value && !value.startsWith('-')) {
                parsed.redirectUri = value.trim();
                i += 1;
            }
            continue;
        }
    }

    return parsed;
}

function getServerSettings(profile, parsed) {
    let redirectUri = parsed.redirectUri || '';
    if (!redirectUri && Number.isInteger(parsed.port) && parsed.port > 0) {
        redirectUri = `http://localhost:${parsed.port}/callback`;
    }

    const finalRedirectUri = resolveRedirectUri(profile, redirectUri);
    const parsedUri = new URL(finalRedirectUri);

    if (!['localhost', '127.0.0.1'].includes(parsedUri.hostname)) {
        throw new Error(`Redirect URI host must be localhost/127.0.0.1 for local auth server. Current: ${parsedUri.hostname}`);
    }

    return {
        redirectUri: finalRedirectUri,
        host: parsedUri.hostname,
        port: Number(parsedUri.port || 80),
        callbackPath: parsedUri.pathname || '/callback',
    };
}

async function main() {
    const args = process.argv.slice(2);
    const parsed = parseArgs(args);
    const profile = parsed.profile;

    console.log('');
    console.log(`🔐 LinkedIn OAuth Authentication [Profile: ${profile}]`);
    console.log('═'.repeat(50));
    console.log('');

    // Check for existing valid token
    const connected = await testLinkedInConnection(profile).catch(() => false);
    if (connected) {
        console.log(`\n✅ Already authenticated for profile '${profile}'! Token is valid.`);
        process.exit(0);
    }

    let authUrl;
    let serverSettings;
    try {
        serverSettings = getServerSettings(profile, parsed);
        // Generate auth URL
        authUrl = getAuthUrl(profile, { redirectUri: serverSettings.redirectUri });
    } catch (e) {
        console.error(`❌ ${e.message}`);
        console.error(`   Ensure LINKEDIN_${profile.toUpperCase()}_CLIENT_ID/SECRET and redirect URI are configured.`);
        process.exit(1);
    }

    console.log('📋 Step 1: Open this URL in your browser:\n');
    console.log(authUrl);
    console.log('');
    console.log('📋 Step 2: Log in and authorize the app');
    console.log(`📋 Step 3: You will be redirected to ${serverSettings.redirectUri}`);
    console.log('');
    console.log('⏳ Waiting for authorization callback...\n');

    // Start local server to catch the callback
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://${serverSettings.host}:${serverSettings.port}`);

        if (url.pathname === serverSettings.callbackPath) {
            const code = url.searchParams.get('code');
            const error = url.searchParams.get('error');
            const state = url.searchParams.get('state');

            if (error) {
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end(`<h1>Authorization Failed</h1><p>${error}</p>`);
                console.error('❌ Authorization failed:', error);
                server.close();
                process.exit(1);
            }

            if (code) {
                try {
                    await exchangeCodeForToken(code, profile, { redirectUri: serverSettings.redirectUri });

                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`
            <html>
              <head><title>Success!</title></head>
              <body style="font-family: system-ui; text-align: center; padding: 50px;">
                <h1>✅ LinkedIn Connected! [Profile: ${profile}]</h1>
                <p>You can close this window and return to the terminal.</p>
              </body>
            </html>
          `);

                    console.log(`\n🎉 Success! LinkedIn is now connected for profile '${profile}'.`);
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

    server.on('error', (error) => {
        if (error?.code === 'EADDRINUSE') {
            console.error(`❌ Port ${serverSettings.port} is already in use.`);
            console.error('   Fix: stop the process using that port, or run with --port 3001 and update LinkedIn app redirect URI.');
            process.exit(1);
        }
        console.error(`❌ OAuth callback server error: ${error.message}`);
        process.exit(1);
    });

    server.listen(serverSettings.port, serverSettings.host, () => {
        console.log(`🌐 Callback server listening on ${serverSettings.redirectUri}`);
    });
}

main();

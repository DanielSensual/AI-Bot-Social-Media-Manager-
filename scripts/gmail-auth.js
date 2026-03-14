/**
 * Gmail OAuth Authorization Script
 * Authorizes a Google account for Gmail API access and saves the token.
 * Usage: node gmail-auth.js <account-label>
 * 
 * It will open a browser for you to log in. After authorization,
 * the token is saved to ~/.openclaw/credentials/gmail-token-<label>.json
 */

import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createServer } from 'http';
import { URL } from 'url';

const CREDENTIALS_PATH = process.env.HOME + '/.openclaw/credentials/gmail-credentials.json';
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

const label = process.argv[2];
if (!label) {
    console.error('Usage: node gmail-auth.js <account-label>');
    console.error('Example: node gmail-auth.js mediageekz');
    process.exit(1);
}

const TOKEN_PATH = `${process.env.HOME}/.openclaw/credentials/gmail-token-${label}.json`;

async function authorize() {
    const credentials = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf-8'));
    const { client_id, client_secret } = credentials.installed;

    const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        'http://localhost:3891'
    );

    // Check if token already exists
    if (existsSync(TOKEN_PATH)) {
        const token = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'));
        oAuth2Client.setCredentials(token);
        console.log(`✅ Token already exists for "${label}". Testing...`);

        const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
        try {
            const profile = await gmail.users.getProfile({ userId: 'me' });
            console.log(`📧 Authorized as: ${profile.data.emailAddress}`);
            console.log(`📬 Total messages: ${profile.data.messagesTotal}`);
            return;
        } catch (err) {
            console.log('Token expired, re-authorizing...');
        }
    }

    // Start local server to capture the OAuth callback
    return new Promise((resolve, reject) => {
        const server = createServer(async (req, res) => {
            try {
                const reqUrl = new URL(req.url, 'http://localhost:3891');
                const code = reqUrl.searchParams.get('code');

                if (!code) {
                    res.writeHead(400);
                    res.end('No code received');
                    return;
                }

                const { tokens } = await oAuth2Client.getToken(code);
                oAuth2Client.setCredentials(tokens);
                writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

                console.log(`\n✅ Token saved to ${TOKEN_PATH}`);

                // Test the token
                const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
                const profile = await gmail.users.getProfile({ userId: 'me' });
                console.log(`📧 Authorized as: ${profile.data.emailAddress}`);
                console.log(`📬 Total messages: ${profile.data.messagesTotal}`);

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`
                    <html><body style="background:#0a0a0a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
                        <div style="text-align:center">
                            <h1>✅ Gmail Access Granted</h1>
                            <p>Account: ${profile.data.emailAddress}</p>
                            <p>You can close this window.</p>
                        </div>
                    </body></html>
                `);

                server.close();
                resolve();
            } catch (err) {
                console.error('Error:', err.message);
                res.writeHead(500);
                res.end('Authorization failed');
                server.close();
                reject(err);
            }
        });

        server.listen(3891, () => {
            const authUrl = oAuth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: SCOPES,
                prompt: 'consent',
            });

            console.log(`\n🔐 Authorize "${label}" account:`);
            console.log(`\n${authUrl}\n`);
            console.log('Opening browser...');

            import('child_process').then(cp => {
                cp.exec(`open "${authUrl}"`);
            });
        });
    });
}

authorize().then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
}).catch(err => {
    console.error('Failed:', err.message);
    process.exit(1);
});

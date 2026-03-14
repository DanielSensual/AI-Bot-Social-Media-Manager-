/**
 * Gmail Monitor — Multi-Account Email Watcher for ClawBot
 * 
 * Monitors 3 Gmail accounts for new unread messages and outputs summaries.
 * Can be called ad-hoc or scheduled via PM2 cron.
 * 
 * Usage:
 *   node scripts/gmail-monitor.js                # Check all accounts
 *   node scripts/gmail-monitor.js --account mediageekz    # Check one account
 *   node scripts/gmail-monitor.js --count 5       # Show last 5 unread per account
 */

import { google } from 'googleapis';
import { readFileSync, existsSync } from 'fs';

const CREDENTIALS_PATH = process.env.HOME + '/.openclaw/credentials/gmail-credentials.json';
const TOKEN_DIR = process.env.HOME + '/.openclaw/credentials';

const ACCOUNTS = [
    { label: 'mediageekz', email: 'danielcastillo@mediageekz.com' },
    { label: 'reelestate', email: 'danielcastillo@ghostaisystems.com' },
    { label: 'reelestateorlando', email: 'reelestateorlando@gmail.com' },
];

// Parse args
const args = process.argv.slice(2);
const accountFilter = args.includes('--account') ? args[args.indexOf('--account') + 1] : null;
const messageCount = args.includes('--count') ? parseInt(args[args.indexOf('--count') + 1]) || 5 : 5;
const jsonOutput = args.includes('--json');

function getAuth(label) {
    const tokenPath = `${TOKEN_DIR}/gmail-token-${label}.json`;
    if (!existsSync(tokenPath)) {
        throw new Error(`No token found for "${label}". Run: node scripts/gmail-auth.js ${label}`);
    }

    const credentials = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf-8'));
    const { client_id, client_secret } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3891');

    const token = JSON.parse(readFileSync(tokenPath, 'utf-8'));
    oAuth2Client.setCredentials(token);

    return oAuth2Client;
}

async function checkAccount(account) {
    const auth = getAuth(account.label);
    const gmail = google.gmail({ version: 'v1', auth });

    // Get profile
    const profile = await gmail.users.getProfile({ userId: 'me' });

    // Get unread messages
    const unread = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread',
        maxResults: messageCount,
    });

    const unreadCount = unread.data.resultSizeEstimate || 0;
    const messages = [];

    if (unread.data.messages) {
        for (const msg of unread.data.messages.slice(0, messageCount)) {
            const full = await gmail.users.messages.get({
                userId: 'me',
                id: msg.id,
                format: 'metadata',
                metadataHeaders: ['From', 'Subject', 'Date'],
            });

            const headers = full.data.payload.headers;
            const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

            messages.push({
                id: msg.id,
                from: getHeader('From'),
                subject: getHeader('Subject'),
                date: getHeader('Date'),
                snippet: full.data.snippet,
            });
        }
    }

    return {
        email: profile.data.emailAddress,
        label: account.label,
        totalMessages: profile.data.messagesTotal,
        unreadCount,
        messages,
    };
}

async function main() {
    const accounts = accountFilter
        ? ACCOUNTS.filter(a => a.label === accountFilter)
        : ACCOUNTS;

    if (accounts.length === 0) {
        console.error(`Account "${accountFilter}" not found. Available: ${ACCOUNTS.map(a => a.label).join(', ')}`);
        process.exit(1);
    }

    const results = [];

    for (const account of accounts) {
        try {
            const result = await checkAccount(account);
            results.push(result);

            if (!jsonOutput) {
                console.log(`\n📧 ${result.email} (${result.label})`);
                console.log(`   📬 Unread: ${result.unreadCount} | Total: ${result.totalMessages}`);

                if (result.messages.length > 0) {
                    console.log('   Recent unread:');
                    for (const msg of result.messages) {
                        const from = msg.from.replace(/<.*>/, '').trim();
                        console.log(`   • [${msg.date}] ${from}: ${msg.subject}`);
                    }
                } else {
                    console.log('   ✅ No unread messages');
                }
            }
        } catch (err) {
            if (!jsonOutput) {
                console.error(`\n❌ ${account.email} (${account.label}): ${err.message}`);
            }
            results.push({ email: account.email, label: account.label, error: err.message });
        }
    }

    if (jsonOutput) {
        console.log(JSON.stringify(results, null, 2));
    }
}

main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
});

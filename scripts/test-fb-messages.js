#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

const TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;
const API = 'https://graph.facebook.com/v24.0';

async function api(path) {
    const sep = path.includes('?') ? '&' : '?';
    const res = await fetch(`${API}${path}${sep}access_token=${TOKEN}`, { signal: AbortSignal.timeout(10000) });
    return res.json();
}

async function main() {
    // Get all pages
    const pages = await api('/me/accounts?fields=id,name,access_token');
    console.log(`\n📋 Found ${pages.data.length} pages\n`);

    for (const page of pages.data) {
        console.log(`📬 ${page.name}`);
        console.log('─'.repeat(40));

        // FB conversations
        try {
            const convs = await fetch(`${API}/${page.id}/conversations?fields=id,updated_time,participants,message_count&limit=3&access_token=${page.access_token}`, { signal: AbortSignal.timeout(10000) }).then(r => r.json());
            if (convs.error) {
                console.log(`  ❌ ${convs.error.message}`);
            } else if (!convs.data?.length) {
                console.log('  (no FB conversations)');
            } else {
                for (const c of convs.data) {
                    const names = c.participants?.data?.map(p => p.name).join(', ') || '?';
                    console.log(`  💬 ${names} | ${c.message_count} msgs | ${c.updated_time}`);
                }
            }
        } catch (e) {
            console.log(`  ⚠️ FB: ${e.message}`);
        }

        // Check for linked IG account
        try {
            const igCheck = await fetch(`${API}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`, { signal: AbortSignal.timeout(10000) }).then(r => r.json());
            if (igCheck.instagram_business_account) {
                const igId = igCheck.instagram_business_account.id;
                const igConvs = await fetch(`${API}/${igId}/conversations?fields=id,updated_time,participants,message_count&limit=3&platform=instagram&access_token=${page.access_token}`, { signal: AbortSignal.timeout(10000) }).then(r => r.json());
                if (igConvs.error) {
                    console.log(`  IG ❌ ${igConvs.error.message}`);
                } else if (!igConvs.data?.length) {
                    console.log('  IG: (no DM conversations)');
                } else {
                    for (const c of igConvs.data) {
                        const names = c.participants?.data?.map(p => p.username || p.name).join(', ') || '?';
                        console.log(`  📸 IG DM: ${names} | ${c.message_count || '?'} msgs | ${c.updated_time}`);
                    }
                }
            }
        } catch (e) {
            console.log(`  ⚠️ IG: ${e.message}`);
        }
        console.log('');
    }
}

main().catch(e => console.error('Fatal:', e.message));

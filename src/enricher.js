/**
 * Email Enrichment Module
 * Pass 1: Scrape emails from lead websites (free)
 * Pass 2: AI-powered search for remaining leads (Grok)
 */

import config from './config.js';
import { getDb } from './db.js';

const XAI_URL = 'https://api.x.ai/v1/chat/completions';

// Common email patterns to ignore (generic/spam/placeholders)
const IGNORE_EMAILS = [
    'noreply@', 'no-reply@', 'donotreply@', 'mailer-daemon@',
    'support@wordpress', 'admin@wordpress', 'email@example',
    'test@', 'info@wix', 'info@squarespace',
    'user@domain', 'example@', 'your@email', 'name@email',
    'your@domain', 'name@domain', 'email@domain', 'user@your',
    '@mysite.com', '@site.com', '@website.com', '@yoursite',
    '@sentry.io', '@example.com', '@domain.com', '@test.com',
    'forms@tambourine', // hotel/restaurant template system
];

// Pages to check for contact info
const CONTACT_PATHS = ['', '/contact', '/contact-us', '/about', '/about-us'];

/**
 * Extract emails from HTML using regex
 */
function extractEmails(html) {
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const matches = html.match(emailRegex) || [];

    // Deduplicate and filter junk
    const unique = [...new Set(matches.map(e => e.toLowerCase()))];
    return unique.filter(email =>
        !IGNORE_EMAILS.some(ignore => email.includes(ignore)) &&
        !email.endsWith('.png') &&
        !email.endsWith('.jpg') &&
        !email.endsWith('.svg') &&
        !email.includes('sentry') &&
        email.length < 60
    );
}

/**
 * Pass 1: Scrape emails from a lead's website
 */
async function scrapeWebsiteEmail(lead) {
    if (!lead.website) return null;

    let baseUrl = lead.website;
    if (!baseUrl.startsWith('http')) baseUrl = `https://${baseUrl}`;
    // Remove trailing slash
    baseUrl = baseUrl.replace(/\/$/, '');

    const allEmails = [];

    for (const pagePath of CONTACT_PATHS) {
        try {
            const url = `${baseUrl}${pagePath}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 6000);

            const response = await fetch(url, {
                signal: controller.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
                redirect: 'follow',
            });
            clearTimeout(timeout);

            if (!response.ok) continue;

            const html = await response.text();
            const emails = extractEmails(html);
            allEmails.push(...emails);

        } catch {
            // Page doesn't exist or timed out — skip
        }
    }

    // Return the best email (prefer non-info@ addresses)
    const unique = [...new Set(allEmails)];
    if (unique.length === 0) return null;

    // Prioritize personal-looking emails over generic ones
    const personal = unique.find(e => !e.startsWith('info@') && !e.startsWith('contact@') && !e.startsWith('hello@'));
    return personal || unique[0];
}

/**
 * Pass 2: AI-powered email search for leads without emails
 */
async function aiSearchEmail(lead) {
    const apiKey = config.api.xai;
    if (!apiKey) return null;

    const prompt = `Find the contact email for this business. Return ONLY the email address, nothing else. If you cannot find one, return "NOT_FOUND".

Business: ${lead.business_name}
Location: ${lead.address || lead.city}
Website: ${lead.website || 'None'}
Phone: ${lead.phone || 'Unknown'}`;

    try {
        const response = await fetch(XAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'grok-3-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0,
                search_parameters: { mode: 'auto' },
            }),
        });

        if (!response.ok) return null;

        const data = await response.json();
        const text = (data.choices?.[0]?.message?.content || '').trim().toLowerCase();

        if (text === 'not_found' || text.length > 60 || !text.includes('@')) return null;

        // Extract email from response
        const emailMatch = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
        return emailMatch ? emailMatch[0] : null;

    } catch {
        return null;
    }
}

/**
 * Enrich all leads missing emails
 * @param {object} opts - { limit, aiSearch }
 */
export async function enrichEmails(opts = {}) {
    const db = getDb();
    const limit = opts.limit || 50;
    const useAI = opts.aiSearch !== false;

    // Get leads without emails
    const leads = db.prepare(
        "SELECT * FROM leads WHERE email IS NULL AND tier IN ('hot', 'warm') ORDER BY ai_score DESC LIMIT ?"
    ).all(limit);

    if (leads.length === 0) {
        console.log('✅ All qualified leads have emails');
        return { scraped: 0, aiFound: 0, total: 0 };
    }

    console.log(`\n📧 Enriching ${leads.length} leads with emails...\n`);

    let scraped = 0;
    let aiFound = 0;

    for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        process.stdout.write(`\r   [${i + 1}/${leads.length}] ${lead.business_name}...`);

        // Pass 1: Website scrape
        let email = await scrapeWebsiteEmail(lead);
        if (email) {
            db.prepare('UPDATE leads SET email = ? WHERE id = ?').run(email, lead.id);
            scraped++;
            console.log(`\r   ✅ [Scraped] ${lead.business_name} → ${email}`);
            continue;
        }

        // Pass 2: AI search (if enabled)
        if (useAI) {
            email = await aiSearchEmail(lead);
            if (email) {
                db.prepare('UPDATE leads SET email = ? WHERE id = ?').run(email, lead.id);
                aiFound++;
                console.log(`\r   🧠 [AI] ${lead.business_name} → ${email}`);
            } else {
                console.log(`\r   ❌ ${lead.business_name} — no email found`);
            }
            // Rate limit AI calls
            await new Promise(r => setTimeout(r, 500));
        } else {
            console.log(`\r   ❌ ${lead.business_name} — no email on site`);
        }
    }

    const total = scraped + aiFound;
    console.log(`\n✅ Enrichment complete: ${scraped} scraped, ${aiFound} AI-found, ${total}/${leads.length} total`);

    return { scraped, aiFound, total };
}

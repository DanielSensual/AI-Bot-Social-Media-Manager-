/**
 * Email Enrichment Module — @ghostai/shared
 * Pass 1: Scrape emails from lead websites (free)
 * Pass 2: AI-powered search for remaining leads (Grok)
 *
 * Usage (dependency injection):
 *   import { createEnricher } from '@ghostai/shared/enricher';
 *   const { enrichEmails } = createEnricher({ getDb, config });
 */



// Common email patterns to ignore (generic/spam/placeholders)
const IGNORE_EMAILS = [
    'noreply@', 'no-reply@', 'donotreply@', 'mailer-daemon@',
    'support@wordpress', 'admin@wordpress', 'email@example',
    'test@', 'info@wix', 'info@squarespace',
    'user@domain', 'example@', 'your@email', 'name@email',
    'your@domain', 'name@domain', 'email@domain', 'user@your',
    '@mysite.com', '@site.com', '@website.com', '@yoursite',
    '@sentry.io', '@example.com', '@domain.com', '@test.com',
    'forms@tambourine',
];

// Real estate tech vendor domains — never a realtor's actual email
const VENDOR_DOMAINS = [
    'moxiworks.com', 'agentfire.com', 'placester.com', 'luxurypresence.com',
    'boomtownroi.com', 'followupboss.com', 'chime.me', 'realtyna.com',
    'idxbroker.com', 'showcaseidx.com', 'wolfnet.com', 'ihomefinder.com',
    'brivitycrm.com', 'insiderealestate.com', 'webbox.com', 'realgeeks.com',
    'kvcore.com', 'ylopo.com', 'sierrainteractive.com', 'cinc.com',
    'boldleads.com', 'zurple.com', 'lofty.com', 'loftyagent.com',
    'rezora.com', 'rechat.com', 'commissions.com', 'lonewolf.co',
    'skyslope.com', 'dotloop.com', 'wordpress.com', 'squarespace.com',
    'wix.com', 'godaddy.com', 'tambourine.com', 'hubspot.com',
    'mailchimp.com', 'constantcontact.com', 'sendgrid.net',
    'appfolio.com', 'propertybase.com', 'lionsdesk.com', 'ixact.com',
    'topproducer.com', 'realtyjuggler.com', 'wise-agent.com',
];

// Pages to check for contact info
const CONTACT_PATHS = ['', '/contact', '/contact-us', '/about', '/about-us', '/team'];

/**
 * Normalize lead segment labels to stable buckets.
 */
function normalizeSegment(value) {
    const raw = String(value || '').toLowerCase();
    if (!raw) return '';
    if (raw.includes('dental')) return 'dental';
    if (raw.includes('med') && raw.includes('spa')) return 'med-spa';
    if (raw.includes('hvac') || raw.includes('heating') || raw.includes('cooling')) return 'hvac';
    if (raw.includes('legal') || raw.includes('law') || raw.includes('attorney')) return 'legal';
    if (raw.includes('restaurant') || raw.includes('cafe') || raw.includes('diner')) return 'restaurant';
    if (raw.includes('real estate') || raw.includes('realtor') || raw.includes('broker')) return 'real-estate';
    return raw;
}

/**
 * Infer whether this lead should use realtor-specific or local-business search hints.
 */
function inferSearchProfile(lead, profile = 'auto') {
    if (profile === 'realtor' || profile === 'local-business') return profile;

    const segment = normalizeSegment(lead.segment || lead.niche || '');
    const source = String(lead.source || '').toLowerCase();
    const website = String(lead.website || '').toLowerCase();
    const name = String(lead.business_name || '').toLowerCase();

    const realtorSignals = ['real-estate', 'realtor', 'broker', 'brokerage'];
    if (realtorSignals.some(signal => segment.includes(signal) || source.includes(signal) || name.includes(signal))) {
        return 'realtor';
    }
    if (['redfin', 'zillow', 'realtor.com', 'homes.com'].some(signal => source.includes(signal) || website.includes(signal))) {
        return 'realtor';
    }

    return 'local-business';
}

function getDirectoryHintForSegment(segment) {
    if (segment === 'dental') return 'Healthgrades, Zocdoc, or dental directory listings';
    if (segment === 'med-spa') return 'RealSelf, Google Maps, or Yelp listings';
    if (segment === 'legal') return 'Avvo, Justia, or FindLaw profiles';
    if (segment === 'hvac') return 'Angi, HomeAdvisor, or Yelp listings';
    if (segment === 'restaurant') return 'Google Maps, Yelp, or OpenTable listings';
    return 'relevant local directories (Google Maps, Yelp, industry listings)';
}

/**
 * Build the AI web-search prompt for email discovery.
 */
export function buildEmailSearchPrompt(lead, profile = 'auto') {
    const searchProfile = inferSearchProfile(lead, profile);
    const segment = normalizeSegment(lead.segment || lead.niche || '');
    const segmentLabel = segment || 'unknown';
    const name = lead.business_name || '';
    const city = lead.city || 'Orlando';
    const state = lead.state || 'FL';
    const website = lead.website || '';
    const phone = lead.phone || '';

    const roleLabel = searchProfile === 'realtor'
        ? 'real estate agent or brokerage'
        : 'local business';

    const sourceHints = searchProfile === 'realtor'
        ? [
            `1. Their website (${website}) — look at /contact, /about, /team pages`,
            `2. Realtor.com agent profile for "${name}" in ${city}, ${state}`,
            '3. Zillow agent profile',
            "4. Their brokerage website's agent roster",
        ]
        : [
            `1. Their website (${website}) — look at /contact, /about, /team, footer pages`,
            '2. Their Google Business Profile / Google Maps listing',
            '3. Official social pages (Facebook, Instagram, LinkedIn)',
            `4. ${getDirectoryHintForSegment(segment)}`,
        ];

    return `Search the web and find a real, working contact email address for this ${roleLabel}.

Business: ${name}
Segment: ${segmentLabel}
City: ${city}, ${state}
Website: ${website}
Phone: ${phone}

SEARCH THESE SOURCES:
${sourceHints.join('\n')}

RULES:
- Return ONLY the email address, nothing else
- The email must be a REAL contact email for this specific business
- Do NOT return platform/vendor emails (e.g., support@agentfire.com, no-reply addresses)
- Do NOT make up or guess emails — only return emails you actually found on the web
- If you truly cannot find an email, return exactly: NOT_FOUND`;
}

/**
 * Check if an email belongs to a known vendor domain
 */
function isVendorEmail(email) {
    const lower = email.toLowerCase();
    return VENDOR_DOMAINS.some(domain => lower.endsWith(`@${domain}`));
}

/**
 * Extract domain from a URL
 */
function getDomain(url) {
    try {
        const u = new URL(url.startsWith('http') ? url : `https://${url}`);
        return u.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
        return '';
    }
}

/**
 * Extract emails from mailto: links (highest confidence)
 */
function extractMailtoEmails(html) {
    const mailtoRegex = /href=["']mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
    const matches = [];
    let m;
    while ((m = mailtoRegex.exec(html)) !== null) {
        matches.push(m[1].toLowerCase());
    }
    return [...new Set(matches)];
}

/**
 * Extract emails from HTML using regex (lower confidence, catches embedded text)
 */
export function extractEmails(html) {
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const matches = html.match(emailRegex) || [];

    const unique = [...new Set(matches.map(e => e.toLowerCase()))];
    return unique.filter(email =>
        !IGNORE_EMAILS.some(ignore => email.includes(ignore)) &&
        !isVendorEmail(email) &&
        !email.endsWith('.png') &&
        !email.endsWith('.jpg') &&
        !email.endsWith('.svg') &&
        !email.includes('sentry') &&
        email.length < 60
    );
}

/**
 * Score and rank candidate emails, picking the best one.
 * Priority: mailto > domain-match > personal > generic
 *
 * @param {string[]} mailtoEmails - Emails from mailto: links
 * @param {string[]} regexEmails  - Emails from regex extraction
 * @param {string}   websiteDomain - Domain of the lead's website
 * @returns {string|null} Best email or null
 */
function pickBestEmail(mailtoEmails, regexEmails, websiteDomain) {
    // Combine, deduplicate, filter vendors
    const all = [...new Set([...mailtoEmails, ...regexEmails])]
        .filter(e => !isVendorEmail(e))
        .filter(e => !IGNORE_EMAILS.some(ig => e.includes(ig)));

    if (all.length === 0) return null;

    // Score each email
    const scored = all.map(email => {
        let score = 0;
        const emailDomain = email.split('@')[1] || '';
        const localPart = email.split('@')[0] || '';

        // Mailto source = highest confidence (intentional)
        if (mailtoEmails.includes(email)) score += 50;

        // Domain matches the lead's website domain
        if (websiteDomain && emailDomain === websiteDomain) score += 30;

        // Personal email (has a name-like local part)
        const isGeneric = ['info', 'contact', 'hello', 'office', 'admin', 'sales', 'team', 'realestate', 'inquiries'].includes(localPart);
        if (!isGeneric) score += 10;

        // Gmail/Yahoo/Outlook = possible personal but lower domain-match signal
        const isFreemail = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com', 'icloud.com'].includes(emailDomain);
        if (isFreemail) score += 5; // Still valid — many agents use gmail

        return { email, score };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    return scored[0].email;
}

/**
 * Scrape emails from a lead's website
 */
async function scrapeWebsiteEmail(lead) {
    if (!lead.website) return null;

    let baseUrl = lead.website;
    if (!baseUrl.startsWith('http')) baseUrl = `https://${baseUrl}`;
    baseUrl = baseUrl.replace(/\/$/, '');

    const websiteDomain = getDomain(baseUrl);
    const allMailtoEmails = [];
    const allRegexEmails = [];

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
            allMailtoEmails.push(...extractMailtoEmails(html));
            allRegexEmails.push(...extractEmails(html));
        } catch {
            // Page doesn't exist or timed out — skip
        }
    }

    return pickBestEmail(allMailtoEmails, allRegexEmails, websiteDomain);
}

/**
 * AI-powered email search for leads without emails.
 * Uses xAI Responses API with web_search tool for real-time web lookups.
 */
async function aiSearchEmail(lead, apiKey, profile = 'auto') {
    if (!apiKey) return null;

    const prompt = buildEmailSearchPrompt(lead, profile);

    try {
        const response = await fetch('https://api.x.ai/v1/responses', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'grok-4-1-fast-reasoning',
                input: [{ role: 'user', content: prompt }],
                tools: [{ type: 'web_search' }],
            }),
        });

        if (!response.ok) {
            if (response.status === 429) {
                await new Promise(r => setTimeout(r, 3000));
            }
            return null;
        }

        const data = await response.json();

        // New Responses API returns output items, find the text one
        let text = '';
        if (data.output) {
            for (const item of data.output) {
                if (item.type === 'message' && item.content) {
                    for (const block of item.content) {
                        if (block.type === 'output_text' || block.type === 'text') {
                            text += block.text || '';
                        }
                    }
                }
            }
        }
        // Fallback: try choices format
        if (!text && data.choices?.[0]?.message?.content) {
            text = data.choices[0].message.content;
        }

        text = text.trim().toLowerCase();
        if (!text || text === 'not_found' || (!text.includes('@') && text.includes('not_found'))) return null;

        // Extract email from response (model sometimes adds surrounding text)
        const emailMatch = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
        if (!emailMatch) return null;

        // Filter vendor emails
        const found = emailMatch[0];
        if (isVendorEmail(found)) return null;

        return found;
    } catch {
        return null;
    }
}

/**
 * Create an enricher bound to a specific project's DB and config.
 *
 * @param {object} deps - { getDb: () => Database, config: { api: { xai: string } }, profile?: 'auto' | 'realtor' | 'local-business' }
 * @returns {object} { enrichEmails }
 */
export function createEnricher({ getDb, config, profile = 'auto' }) {
    async function enrichEmails(opts = {}) {
        const db = getDb();
        const limit = opts.limit || 50;
        const useAI = opts.aiSearch !== false;
        const force = opts.force || false;       // Re-enrich leads that already have emails
        const allTiers = opts.allTiers || false;  // Include unscored leads
        const cityFilter = opts.city ? `AND city = '${opts.city.replace(/'/g, "''")}'` : '';

        let leads;

        if (force) {
            // Re-enrichment mode: find leads with suspected bad (vendor) emails
            const vendorLike = VENDOR_DOMAINS.map(d => `email LIKE '%@${d}'`).join(' OR ');
            const tierFilter = allTiers ? '' : "AND tier IN ('hot', 'warm')";
            leads = db.prepare(
                `SELECT * FROM leads WHERE website IS NOT NULL AND website != '' AND (${vendorLike}) ${tierFilter} ${cityFilter} ORDER BY id DESC LIMIT ?`
            ).all(limit);

            if (leads.length === 0) {
                console.log('✅ No vendor emails found to re-enrich');
                return { scraped: 0, aiFound: 0, replaced: 0, total: 0 };
            }
            console.log(`\n🔄 Re-enriching ${leads.length} leads with suspected vendor emails...\n`);
        } else {
            // Normal mode: find leads missing emails
            const tierFilter = allTiers
                ? ''
                : "AND tier IN ('hot', 'warm')";
            leads = db.prepare(
                `SELECT * FROM leads WHERE (email IS NULL OR email = '') AND website IS NOT NULL AND website != '' ${tierFilter} ${cityFilter} ORDER BY ai_score DESC LIMIT ?`
            ).all(limit);

            if (leads.length === 0) {
                console.log('✅ All qualifying leads have emails (or no website to scrape)');
                return { scraped: 0, aiFound: 0, total: 0 };
            }
            console.log(`\n📧 Enriching ${leads.length} leads with emails...\n`);
        }

        let scraped = 0;
        let aiFound = 0;
        let replaced = 0;

        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];
            process.stdout.write(`\r   [${i + 1}/${leads.length}] ${lead.business_name}...`);

            // Pass 1: Website scrape
            let email = await scrapeWebsiteEmail(lead);
            if (email) {
                const oldEmail = lead.email || '';
                db.prepare('UPDATE leads SET email = ? WHERE id = ?').run(email, lead.id);
                if (force && oldEmail) {
                    replaced++;
                    console.log(`\r   🔄 [Replaced] ${lead.business_name}: ${oldEmail} → ${email}`);
                } else {
                    scraped++;
                    console.log(`\r   ✅ [Scraped] ${lead.business_name} → ${email}`);
                }
                continue;
            }

            // Pass 2: AI search (if enabled, and not in force/re-enrich mode with existing email)
            if (useAI && !force) {
                email = await aiSearchEmail(lead, config.api.xai, profile);
                if (email) {
                    db.prepare('UPDATE leads SET email = ? WHERE id = ?').run(email, lead.id);
                    aiFound++;
                    console.log(`\r   🧠 [AI] ${lead.business_name} → ${email}`);
                } else {
                    console.log(`\r   ❌ ${lead.business_name} — no email found`);
                }
                await new Promise(r => setTimeout(r, 500));
            } else if (force) {
                // In force mode, clear vendor email if we couldn't find a better one
                db.prepare('UPDATE leads SET email = NULL WHERE id = ?').run(lead.id);
                replaced++;
                console.log(`\r   🗑️  [Cleared] ${lead.business_name}: removed vendor email ${lead.email}`);
            } else {
                console.log(`\r   ❌ ${lead.business_name} — no email on site`);
            }
        }

        const total = scraped + aiFound + replaced;
        console.log(`\n✅ Enrichment complete: ${scraped} scraped, ${aiFound} AI-found, ${replaced} replaced, ${total}/${leads.length} total`);

        return { scraped, aiFound, replaced, total };
    }

    return { enrichEmails };
}

/**
 * Website Quality Analyzer
 * Fetches a lead's website and scores it on basic quality signals.
 */

import { updateLeadWebsiteAnalysis } from './db.js';

/**
 * Analyze a website's quality
 * @param {object} lead - Lead object with .website property
 * @returns {object} { score, mobileFriendly, ssl, responseTime }
 */
export async function analyzeWebsite(lead) {
    if (!lead.website) {
        return { score: 0, mobileFriendly: false, ssl: false, responseTime: 0 };
    }

    let url = lead.website;
    if (!url.startsWith('http')) url = `https://${url}`;

    const result = {
        score: 0,
        mobileFriendly: false,
        ssl: url.startsWith('https'),
        responseTime: 0,
    };

    try {
        const start = Date.now();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
            redirect: 'follow',
        });
        clearTimeout(timeout);

        result.responseTime = Date.now() - start;
        const html = await response.text();

        // SSL check (followed redirect to https?)
        result.ssl = response.url.startsWith('https');

        // Mobile-friendly check (viewport meta tag)
        result.mobileFriendly = /name=["']viewport["']/.test(html);

        // Score calculation (0-100)
        let score = 0;

        // Response time (fast = good)
        if (result.responseTime < 1000) score += 25;
        else if (result.responseTime < 2000) score += 15;
        else if (result.responseTime < 4000) score += 5;

        // SSL
        if (result.ssl) score += 20;

        // Mobile-friendly
        if (result.mobileFriendly) score += 25;

        // Modern indicators
        if (html.includes('react') || html.includes('next') || html.includes('vue')) score += 10;
        if (html.includes('tailwind') || html.includes('bootstrap')) score += 5;
        if (/<meta\s+name=["']description["']/.test(html)) score += 10;
        if (html.includes('schema.org') || html.includes('application/ld+json')) score += 5;

        result.score = Math.min(score, 100);

    } catch (err) {
        // Site is down or unreachable — low score
        result.score = 5;
    }

    // Persist to DB
    updateLeadWebsiteAnalysis(lead.id, result);

    return result;
}

/**
 * Batch analyze websites for multiple leads
 * @param {Array} leads - Array of lead objects
 * @param {number} concurrency - Max parallel requests
 */
export async function analyzeLeadsBatch(leads, concurrency = 5) {
    console.log(`\n🔎 Analyzing ${leads.length} websites...`);

    const results = [];
    for (let i = 0; i < leads.length; i += concurrency) {
        const batch = leads.slice(i, i + concurrency);
        const batchResults = await Promise.allSettled(
            batch.map(lead => analyzeWebsite(lead))
        );
        results.push(...batchResults);

        const done = Math.min(i + concurrency, leads.length);
        process.stdout.write(`\r   Progress: ${done}/${leads.length}`);
    }

    console.log('\n✅ Website analysis complete');
    return results;
}

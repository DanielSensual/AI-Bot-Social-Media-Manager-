/**
 * AI Landing Page Generator
 * Creates personalized demo pages per lead showing what their website could look like
 * Outputs HTML files that can be served as static pages
 */

import config from './config.js';
import { getDb } from './db.js';
import fs from 'fs';
import path from 'path';

const XAI_URL = 'https://api.x.ai/v1/chat/completions';
const OUTPUT_DIR = path.join(process.cwd(), 'landing-pages');

/**
 * Generate a personalized landing page for a lead
 */
export async function generateLandingPage(lead) {
    const apiKey = config.api.xai;
    if (!apiKey) throw new Error('XAI_API_KEY required');

    // Ensure output dir
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const slug = lead.business_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');

    const prompt = `You are a premium web designer. Create a complete, single-file HTML landing page mockup for this business. This is a DEMO to show them what their new website could look like.

Business: ${lead.business_name}
Industry: ${lead.niche || 'restaurant'}
City: ${lead.city || 'Orlando, FL'}
Rating: ${lead.rating}/5 (${lead.reviews} reviews)
Current Website: ${lead.website || 'None'}

CREATE A STUNNING SINGLE-PAGE HTML FILE WITH:
1. A dark, premium hero section with the business name as an H1 and a compelling tagline
2. A "Why Choose Us" section with 3 feature cards
3. A reviews/testimonials section highlighting their ${lead.rating} rating
4. A reservation/contact CTA section
5. A sleek footer

DESIGN RULES:
- Use a dark theme (#0a0a0f background, white text, accent color #00ff88)
- Modern sans-serif font (Inter from Google Fonts)
- Glassmorphism cards with subtle borders
- Smooth CSS animations (fade-in, slide-up on scroll)
- Fully responsive (mobile-first)
- Include CSS transitions on hover states
- NO JavaScript frameworks, pure HTML + CSS only
- Include a floating banner at the bottom: "This mockup was designed by Ghost AI Systems — Book a free strategy call" with a link

Return ONLY the complete HTML file, no explanation.`;

    const response = await fetch(XAI_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'grok-3-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
        }),
    });

    if (!response.ok) throw new Error(`Grok API error: ${response.status}`);

    const data = await response.json();
    let html = data.choices?.[0]?.message?.content || '';

    // Clean markdown code fences if present
    html = html.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim();

    // Inject Calendar CTA link
    const calendarLink = config.calendar || 'https://calendly.com/ghostai/audit';
    html = html.replace(/href="#"/g, `href="${calendarLink}"`);
    html = html.replace(/href=""/g, `href="${calendarLink}"`);

    // Save the file
    const filename = `${slug}.html`;
    const filepath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(filepath, html);

    // Update lead in DB
    const db = getDb();
    db.prepare('UPDATE leads SET updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), lead.id);

    return { slug, filename, filepath, size: html.length };
}

/**
 * Generate landing pages for top leads
 */
export async function generateBatch(limit = 5) {
    const db = getDb();
    const leads = db.prepare(
        "SELECT * FROM leads WHERE tier = 'hot' AND email IS NOT NULL ORDER BY ai_score DESC LIMIT ?"
    ).all(limit);

    if (leads.length === 0) {
        console.log('✅ No hot leads with emails to generate pages for');
        return [];
    }

    console.log(`\n🎨 Generating ${leads.length} landing pages...\n`);

    const results = [];
    for (const lead of leads) {
        try {
            process.stdout.write(`   🔨 ${lead.business_name}...`);
            const result = await generateLandingPage(lead);
            console.log(` ✅ ${result.filename} (${(result.size / 1024).toFixed(1)}KB)`);
            results.push(result);
        } catch (err) {
            console.log(` ❌ ${err.message}`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n✅ Generated ${results.length}/${leads.length} pages → ./landing-pages/`);
    return results;
}

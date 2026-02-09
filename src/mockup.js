/**
 * Auto-Mockup Generator
 * Takes a lead's current website screenshot and generates a premium redesign mockup
 * to attach in outreach emails.
 */

import config from './config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCKUPS_DIR = path.join(__dirname, '..', 'mockups');
const XAI_URL = 'https://api.x.ai/v1/chat/completions';

// Ensure mockups directory exists
if (!fs.existsSync(MOCKUPS_DIR)) {
    fs.mkdirSync(MOCKUPS_DIR, { recursive: true });
}

/**
 * Generate a mockup pitch description for a lead
 * Used to create a personalized value prop they can visualize
 * 
 * @param {object} lead - Lead from database
 * @returns {object} { mockupDescription, improvements }
 */
export async function generateMockupPitch(lead) {
    const apiKey = config.api.xai;
    if (!apiKey) throw new Error('XAI_API_KEY not set');

    const prompt = `You are a premium web design consultant for ${config.brand.name}.

A business called "${lead.business_name}" in ${lead.city} has ${lead.has_website ? `a website (${lead.website}) that scored ${lead.website_score}/100` : 'NO website at all'}.
They have ${lead.review_count} reviews with a ${lead.rating}/5 rating.

Generate a specific, compelling mockup pitch — describe EXACTLY what their new website would look like in 3-4 bullet points. Be visual and specific (mention colors, sections, features they'd love).

Also list 3 specific improvements that would increase their revenue.

Return JSON:
{
  "heroDescription": "<one vivid sentence describing the hero section>",
  "features": ["<feature 1>", "<feature 2>", "<feature 3>", "<feature 4>"],
  "improvements": ["<revenue improvement 1>", "<revenue improvement 2>", "<revenue improvement 3>"],
  "colorScheme": "<suggested color palette description>"
}`;

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

    if (!response.ok) throw new Error(`Grok error: ${response.status}`);

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const result = JSON.parse(jsonMatch?.[0] || text);

        // Save mockup data
        const filename = `${lead.id}-${lead.business_name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json`;
        fs.writeFileSync(path.join(MOCKUPS_DIR, filename), JSON.stringify(result, null, 2));

        return result;
    } catch {
        return {
            heroDescription: 'A stunning dark-themed homepage with your branding front and center',
            features: ['Online ordering integration', 'Mobile-first responsive design', 'AI-powered chat for reservations', 'Google Reviews showcase'],
            improvements: ['24/7 online ordering could increase revenue by 30%', 'Mobile optimization captures the 60% of traffic from phones', 'AI voice receptionist handles calls you miss'],
            colorScheme: 'Dark elegant with gold accents',
        };
    }
}

/**
 * Generate a text-based mockup preview for email
 * Creates a formatted text description that paints a picture
 * 
 * @param {object} lead - Lead from database
 * @returns {string} formatted mockup description for email
 */
export async function generateEmailMockupBlock(lead) {
    const mockup = await generateMockupPitch(lead);

    return `
Here's what I envisioned for ${lead.business_name}:

🎨 ${mockup.heroDescription}

✦ ${mockup.features.join('\n✦ ')}

Color palette: ${mockup.colorScheme}

Revenue impact:
→ ${mockup.improvements.join('\n→ ')}

I can have a working prototype in 72 hours. Want to see it?
${config.brand.calendarLink}
`.trim();
}

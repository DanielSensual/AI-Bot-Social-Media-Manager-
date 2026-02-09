/**
 * Outreach Generator
 * AI-generates personalized cold emails for qualified leads.
 */

import config from './config.js';

const XAI_URL = 'https://api.x.ai/v1/chat/completions';

/**
 * Generate a personalized outreach email for a lead
 * @param {object} lead - Lead from database
 * @param {string} type - 'initial', 'followup_1', 'followup_2', 'followup_3'
 * @returns {object} { subject, body }
 */
export async function generateEmail(lead, type = 'initial') {
    const apiKey = config.api.xai;
    if (!apiKey) throw new Error('XAI_API_KEY not set in .env');

    // Parse AI notes for pitch angle
    let pitchAngle = 'AI-powered website and voice receptionist';
    try {
        if (lead.ai_notes) {
            const notes = JSON.parse(lead.ai_notes);
            pitchAngle = notes.pitchAngle || pitchAngle;
        }
    } catch { }

    const prompts = {
        initial: `Write a cold email from ${config.brand.fromName} at ${config.brand.name} to the owner of "${lead.business_name}" (a business in ${lead.city}).

Context:
- Their website score: ${lead.website_score}/100 ${lead.website_score < 40 ? '(this is bad — mention it tactfully)' : ''}
- ${!lead.has_website ? 'They have NO website at all' : `Their website: ${lead.website}`}
- They have ${lead.review_count} reviews with a ${lead.rating}/5 rating
- Pitch angle: ${pitchAngle}

Rules:
- NEVER say "I noticed your website is bad/outdated" — say you "took a quick look" and have a specific idea
- Lead with VALUE, not a pitch. Give them one actionable insight about their business
- Keep it under 120 words. No fluff.
- End with a soft CTA: "Would a 15-min call be worth it?" + calendar link: ${config.brand.calendarLink}
- Sign off as ${config.brand.fromName}, ${config.brand.name}
- Sound human, not like a template. No "hope this finds you well"

Return JSON only:
{"subject": "<compelling subject line>", "body": "<email body>"}`,

        followup_1: `Write a SHORT follow-up email (3-4 sentences max) to the owner of "${lead.business_name}" in ${lead.city}.
You emailed them a few days ago about improving their online presence with AI. They didn't reply.
Don't be pushy. Add a new piece of value (e.g. a quick stat about how 78% of customers look businesses up on Google before visiting).
End with "No pressure — just thought it might help."
Sign off as ${config.brand.fromName}.
Return JSON: {"subject": "Re: <original subject>", "body": "<email body>"}`,

        followup_2: `Write a VERY SHORT final follow-up email (2-3 sentences) to the owner of "${lead.business_name}".
This is your last attempt. Be direct but respectful.
E.g.: "Hey, just wanted to follow up one last time. I built a quick demo of what ${lead.business_name}'s website could look like — happy to send it over if you're curious. Either way, no worries."
Sign off as ${config.brand.fromName}.
Return JSON: {"subject": "Last note about ${lead.business_name}", "body": "<email body>"}`,

        followup_3: `Write a breakup email (1-2 sentences) to the owner of "${lead.business_name}".
Something like: "Hey, I'll stop bugging you! If you ever want to chat about your online presence, I'm here: ${config.brand.calendarLink}. — ${config.brand.fromName}"
Return JSON: {"subject": "👋", "body": "<email body>"}`,
    };

    const prompt = prompts[type] || prompts.initial;

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

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Grok API error: ${response.status} — ${err}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const result = JSON.parse(jsonMatch?.[0] || text);
        return {
            subject: result.subject || `Quick idea for ${lead.business_name}`,
            body: result.body || text,
        };
    } catch {
        return {
            subject: `Quick idea for ${lead.business_name}`,
            body: text,
        };
    }
}

/**
 * AI Lead Qualifier
 * Uses Grok to score leads 0-100 and tier them hot/warm/cold.
 */

import config from './config.js';
import { getUnscoredLeads, updateLeadScore } from './db.js';
import { analyzeWebsite } from './analyzer.js';

const XAI_URL = 'https://api.x.ai/v1/chat/completions';

/**
 * Score a single lead using AI
 * @param {object} lead - Lead from database
 * @returns {object} { score, tier, notes }
 */
export async function qualifyLead(lead) {
    const apiKey = config.api.xai;
    if (!apiKey) throw new Error('XAI_API_KEY not set in .env');

    // Analyze website first if not yet analyzed
    if (lead.has_website && lead.website_score === 0) {
        await analyzeWebsite(lead);
    }

    const prompt = `You are a lead scoring expert for an AI agency that builds premium websites ($3-5K) and voice AI receptionists ($297/mo) for local businesses.

Score this business 0-100 as a potential client. Consider:
- Businesses with BAD or NO websites are HIGHER-scoring leads (they need us)
- Higher review counts = established business = can afford services
- Low ratings might mean they need help with customer experience (voice AI)
- Some industries (restaurants, med spas, real estate, HVAC, dental) are ideal

Business data:
- Name: ${lead.business_name}
- Industry/Niche: inferred from name and location
- Location: ${lead.address || lead.city}
- Rating: ${lead.rating}/5 (${lead.review_count} reviews)
- Has website: ${lead.has_website ? 'Yes' : 'No'}
- Website URL: ${lead.website || 'None'}
- Website score: ${lead.website_score}/100 (higher = better current site)
- Mobile-friendly: ${lead.mobile_friendly ? 'Yes' : 'No'}
- SSL: ${lead.ssl ? 'Yes' : 'No'}

Return JSON only:
{"score": <0-100>, "reasoning": "<1-2 sentences>", "pitch_angle": "<specific value prop for this business>"}`;

    const response = await fetch(XAI_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'grok-3-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Grok API error: ${response.status} — ${err}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    // Parse JSON from response
    let result;
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        result = JSON.parse(jsonMatch?.[0] || text);
    } catch {
        result = { score: 50, reasoning: text.slice(0, 200), pitch_angle: 'General AI services' };
    }

    const score = Math.max(0, Math.min(100, result.score || 50));
    const tier = score >= config.scoring.hotThreshold ? 'hot'
        : score >= config.scoring.warmThreshold ? 'warm'
            : 'cold';

    const notes = JSON.stringify({
        reasoning: result.reasoning,
        pitchAngle: result.pitch_angle,
    });

    // Update database
    updateLeadScore(lead.id, score, notes, tier);

    return { score, tier, notes: result.reasoning, pitchAngle: result.pitch_angle };
}

/**
 * Qualify all unscored leads
 * @param {number} limit - Max leads to process
 */
export async function qualifyBatch(limit = 50) {
    const leads = getUnscoredLeads(limit);
    if (leads.length === 0) {
        console.log('✅ No unscored leads to qualify');
        return [];
    }

    console.log(`\n🧠 Qualifying ${leads.length} leads with AI...\n`);

    const results = [];
    for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        try {
            const result = await qualifyLead(lead);
            const tierEmoji = { hot: '🔥', warm: '🟡', cold: '🧊' }[result.tier];
            console.log(`  ${tierEmoji} [${result.score}] ${lead.business_name} — ${result.notes}`);
            results.push({ lead, ...result });
        } catch (err) {
            console.error(`  ❌ Failed: ${lead.business_name} — ${err.message}`);
        }

        // Rate limit API calls
        if (i < leads.length - 1) {
            await new Promise(r => setTimeout(r, 500));
        }
    }

    const hot = results.filter(r => r.tier === 'hot').length;
    const warm = results.filter(r => r.tier === 'warm').length;
    const cold = results.filter(r => r.tier === 'cold').length;

    console.log(`\n✅ Qualification complete: 🔥 ${hot} hot, 🟡 ${warm} warm, 🧊 ${cold} cold`);
    return results;
}

/**
 * Trending Topics Integration
 * Checks trending topics on X and Google Trends before content generation.
 * If a trend aligns with Ghost AI pillars, it influences the AI prompt.
 */

import dotenv from 'dotenv';
import { config } from './config.js';

dotenv.config();

const XAI_API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Pillar keywords for trend matching
const PILLAR_KEYWORDS = {
    value: ['AI', 'automation', 'workflow', 'productivity', 'efficiency', 'chatbot', 'agent', 'LLM', 'GPT', 'Claude', 'SaaS', 'startup', 'web dev', 'website', 'design', 'no-code'],
    hotTakes: ['layoffs', 'overrated', 'bubble', 'disruption', 'replaced', 'dead', 'overhyped', 'controversy', 'debate', 'unpopular opinion'],
    portfolio: ['case study', 'client', 'results', 'ROI', 'conversion', 'landing page', 'rebrand', 'launch'],
    bts: ['building', 'shipping', 'coding', 'deploying', 'debugging', 'late night', 'grind'],
    cta: ['free', 'audit', 'demo', 'consultation', 'offer', 'limited', 'booking'],
};

/**
 * Fetch trending topics using Grok (which has access to real-time X data)
 * @returns {Promise<string[]>} Array of trending topic strings
 */
async function fetchTrendsViaGrok() {
    if (!XAI_API_KEY) return [];

    try {
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${XAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'grok-3-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a trend analyst. Return ONLY a JSON array of 10 current trending topics on X/Twitter related to tech, AI, startups, or web development. No explanation, just the JSON array of strings.',
                    },
                    {
                        role: 'user',
                        content: 'What are the top 10 trending tech/AI topics on X right now?',
                    },
                ],
                temperature: 0.3,
            }),
        });

        if (!response.ok) return [];

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '[]';

        // Parse the JSON array from the response
        const cleaned = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (err) {
        console.warn(`⚠️ Trend fetch failed: ${err.message}`);
        return [];
    }
}

/**
 * Match trends against Ghost AI content pillars
 * @param {string[]} trends - Array of trending topics
 * @returns {object|null} { trend, pillar, matchedKeywords } or null
 */
function matchTrendToPillar(trends) {
    for (const trend of trends) {
        const trendLower = trend.toLowerCase();

        for (const [pillar, keywords] of Object.entries(PILLAR_KEYWORDS)) {
            const matches = keywords.filter(kw => trendLower.includes(kw.toLowerCase()));
            if (matches.length > 0) {
                return {
                    trend,
                    pillar,
                    matchedKeywords: matches,
                };
            }
        }
    }
    return null;
}

/**
 * Get a relevant trending topic for content generation.
 * Returns the trend info if one aligns with pillars, null otherwise.
 * @returns {Promise<object|null>} { trend, pillar, matchedKeywords }
 */
export async function getRelevantTrend() {
    const trends = await fetchTrendsViaGrok();

    if (trends.length === 0) {
        console.log('📰 No trends fetched');
        return null;
    }

    console.log(`📰 Fetched ${trends.length} trending topics`);

    const match = matchTrendToPillar(trends);
    if (match) {
        console.log(`🔥 Trending match: "${match.trend}" → ${match.pillar} pillar`);
    } else {
        console.log('   No trend aligns with content pillars');
    }

    return match;
}

/**
 * Build a trend-aware prompt modifier for AI content generation
 * @param {object} trendMatch - From getRelevantTrend()
 * @returns {string} Additional prompt context
 */
export function buildTrendPrompt(trendMatch) {
    if (!trendMatch) return '';

    return `\n\nTRENDING NOW: "${trendMatch.trend}" is currently trending on X. If naturally relevant, incorporate this trend into your post for maximum engagement. Don't force it — only use it if it genuinely connects to the topic.`;
}

export default {
    getRelevantTrend,
    buildTrendPrompt,
    matchTrendToPillar,
};

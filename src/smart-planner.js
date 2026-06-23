/**
 * Smart Content Planner — Phase 1 of the Grok Build Social Media Manager
 * ═══════════════════════════════════════════════════════════════════════
 * Replaces random pillar selection with AI-powered strategic planning.
 * Grok Build reviews recent posts and picks the optimal pillar + angle.
 * 
 * Cost: ~$0.02 per call (grok-build-0.1 at $10/M input tokens)
 */

import { getRecent, getStats } from './post-history.js';
import { config } from './config.js';
import { generateText } from './llm-client.js';
import { getWeightedPillar } from './content-library.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const X_BRAIN_PATH = path.join(__dirname, '..', 'x-brain.md');

/**
 * Load x-brain.md for brand context (truncated to save tokens)
 */
function loadBrainSummary() {
    try {
        const brain = fs.readFileSync(X_BRAIN_PATH, 'utf-8');
        // Only take the identity + voice + pillars sections (first ~100 lines)
        const lines = brain.split('\n');
        const cutoff = lines.findIndex((l, i) => i > 20 && l.startsWith('## Engagement Rules'));
        return lines.slice(0, cutoff > 0 ? cutoff : 80).join('\n');
    } catch {
        return 'Ghost AI Systems — AI agency, "Spicy Builder" voice, casual/confident/anti-corporate.';
    }
}

/**
 * Format recent posts into a compact summary for the AI
 */
function formatRecentPosts(posts) {
    if (!posts || posts.length === 0) return 'No recent posts found.';

    return posts.map((p, i) => {
        const platforms = [
            p.result_x && 'X',
            p.result_linkedin && 'LI',
            p.result_facebook && 'FB',
            p.result_instagram && 'IG',
        ].filter(Boolean).join('+');

        const timeAgo = getTimeAgo(p.created_at);
        const preview = (p.text || '').replace(/\n/g, ' ').slice(0, 100);

        return `${i + 1}. [${p.pillar}] ${timeAgo} → ${platforms || 'none'} | "${preview}..."`;
    }).join('\n');
}

/**
 * Get human-readable time ago string
 */
function getTimeAgo(timestamp) {
    const now = new Date();
    const then = new Date(timestamp);
    const hours = Math.round((now - then) / (1000 * 60 * 60));

    if (hours < 1) return 'just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
}

/**
 * Get current time context for the AI
 */
function getTimeContext() {
    const now = new Date();
    const est = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hour = est.getHours();
    const dayName = est.toLocaleDateString('en-US', { weekday: 'long' });

    let timeSlot;
    if (hour < 11) timeSlot = 'morning (catch commuters, sharp takes)';
    else if (hour < 15) timeSlot = 'midday (builder energy, show the work)';
    else timeSlot = 'evening (engagement bait, wild cards, reflective)';

    return { dayName, hour, timeSlot, timestamp: est.toISOString() };
}

/**
 * Smart Pillar Selection — asks Grok Build to strategically pick the next post
 * Falls back to weighted random if the AI call fails.
 * 
 * @returns {Promise<{pillar: string, angle: string, reasoning: string}>}
 */
export async function smartPillarPick() {
    const stats = getStats();
    const recentPosts = getRecent(10);
    const timeContext = getTimeContext();
    const brainSummary = loadBrainSummary();

    // Count pillar distribution in recent posts
    const pillarCounts = {};
    for (const post of recentPosts) {
        const p = post.pillar || 'unknown';
        pillarCounts[p] = (pillarCounts[p] || 0) + 1;
    }
    const pillarDistribution = Object.entries(pillarCounts)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');

    const prompt = `You are the content strategist for Ghost AI Systems on X (Twitter).

## Brand Summary
${brainSummary}

## Target Pillar Weights
${Object.entries(config.pillars).map(([k, v]) => `- ${k}: ${v}%`).join('\n')}

## Recent Posts (last 10)
${formatRecentPosts(recentPosts)}

## Pillar Distribution in Recent Posts
${pillarDistribution || 'No data yet'}

## Current Context
- Day: ${timeContext.dayName}
- Time: ${timeContext.hour}:00 EST (${timeContext.timeSlot})
- Posts today: ${stats.postsToday}
- Total posts: ${stats.totalPosts}

## Your Task
Pick the BEST content pillar for the next post. Consider:
1. What pillars were overused recently? Balance the mix toward target weights.
2. What time of day is it? Morning = sharp takes, Midday = builder logs, Evening = engagement bait.
3. What hasn't been posted in a while? Surprise the audience.
4. Don't repeat the same pillar as the most recent post.

Respond with ONLY valid JSON, no markdown, no explanation:
{"pillar": "one of: builderLogs, hotTakes, portfolio, industryCommentary, cta", "angle": "2-sentence description of the specific angle/hook to take", "reasoning": "1-sentence why this is the strategic pick"}`;

    try {
        console.log('🧠 Smart Planner: asking Grok Build for strategic pillar pick...');

        const { text } = await generateText({
            prompt,
            provider: 'grok',
            maxOutputTokens: 200,
            grokModel: 'grok-build-0.1',
        });

        // Parse JSON response
        const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        const result = JSON.parse(cleaned);

        // Validate pillar
        const validPillars = Object.keys(config.pillars);
        if (!validPillars.includes(result.pillar)) {
            console.warn(`⚠️ Smart Planner returned invalid pillar "${result.pillar}", falling back`);
            return { pillar: getWeightedPillar(), angle: null, reasoning: 'fallback — invalid pillar from AI' };
        }

        console.log(`🧠 Smart Planner: [${result.pillar.toUpperCase()}] — ${result.reasoning}`);
        if (result.angle) console.log(`   📐 Angle: ${result.angle}`);

        return result;
    } catch (err) {
        console.warn(`⚠️ Smart Planner failed: ${err.message} — falling back to weighted random`);
        return { pillar: getWeightedPillar(), angle: null, reasoning: 'fallback — AI planner error' };
    }
}

export default { smartPillarPick };

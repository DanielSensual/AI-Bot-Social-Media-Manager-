/**
 * Ghost AI — News Commentator
 * ============================
 * Takes real news and generates Ghost's authentic take.
 * Outputs platform-specific formats (X tweet, IG caption, LinkedIn post).
 * 
 * Primary LLM: Grok 4.20 Reasoning (authentic, opinionated voice)
 * Fact-checker: GPT-5.4 (verify claims before posting)
 */

import dotenv from 'dotenv';
import { generateText, hasLLMProvider } from './llm-client.js';

dotenv.config();

// ── Commentary Angles ──────────────────────────────────────────
const COMMENTARY_ANGLES = [
    {
        angle: 'business_impact',
        weight: 30,
        instruction: 'Focus on what this means for small businesses and solopreneurs. How does this change the game? Who wins, who loses?',
    },
    {
        angle: 'builder_take',
        weight: 25,
        instruction: 'React as someone who BUILDS production AI systems daily. Compare to what you actually deploy. Call out hype vs reality.',
    },
    {
        angle: 'hot_take',
        weight: 20,
        instruction: 'Give a spicy, controversial opinion. Challenge the mainstream narrative. Be the voice saying what everyone thinks but nobody tweets.',
    },
    {
        angle: 'tactical_breakdown',
        weight: 15,
        instruction: 'Break down the technical implications. What should builders do RIGHT NOW because of this? Give actionable advice.',
    },
    {
        angle: 'veteran_perspective',
        weight: 10,
        instruction: 'Connect this to the bigger picture — discipline, resilience, adapting under fire. Military veteran lens on tech disruption.',
    },
];

function pickAngle(forcedAngle = null) {
    if (forcedAngle) {
        const found = COMMENTARY_ANGLES.find(a => a.angle === forcedAngle);
        if (found) return found;
    }

    const totalWeight = COMMENTARY_ANGLES.reduce((s, a) => s + a.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const angle of COMMENTARY_ANGLES) {
        roll -= angle.weight;
        if (roll <= 0) return angle;
    }

    return COMMENTARY_ANGLES[0];
}

// ── X/Twitter Commentary ───────────────────────────────────────
/**
 * Generate a tweet reacting to a news item.
 * @param {object} newsItem - { title, link, summary, source }
 * @param {object} options - { angle, dryRun }
 */
export async function generateNewsTweet(newsItem, options = {}) {
    const angle = pickAngle(options.angle);

    const prompt = `You are Ghost — military veteran, AI systems architect, founder of Ghost AI Systems in Orlando FL. You deploy PRODUCTION AI voice agents, lead gen systems, and automation for real businesses.

You just read this breaking AI news:

HEADLINE: ${newsItem.title}
SOURCE: ${newsItem.source}
SUMMARY: ${newsItem.summary || 'No summary available'}
URL: ${newsItem.link}

YOUR COMMENTARY ANGLE: ${angle.instruction}

Write a tweet reacting to this news. Rules:
- MUST be under 280 characters (CRITICAL — count carefully)
- Reference the actual news — don't be vague
- Be OPINIONATED, not just informative
- Speak as someone who deploys AI systems for a living, not a spectator
- You can tag the source account if relevant (@OpenAI, @AnthropicAI, @Google, etc.)
- 1 emoji max. No hashtags.
- Sound like a real person tweeting, not a brand.
- End with a provocative take or question when possible

Output ONLY the tweet text. No quotes, no explanation.`;

    const { text, provider } = await generateText({
        prompt,
        maxOutputTokens: 300,
        provider: 'grok',
        grokModel: 'grok-4.20-0309-reasoning',
    });

    let tweet = text.trim().replace(/^["']|["']$/g, '');

    // Truncate if needed
    if (tweet.length > 280) {
        tweet = tweet.substring(0, 277) + '...';
    }

    return {
        text: tweet,
        angle: angle.angle,
        provider,
        newsItem: {
            title: newsItem.title,
            source: newsItem.source,
            link: newsItem.link,
        },
    };
}

// ── Instagram Commentary ───────────────────────────────────────
/**
 * Generate an IG caption + video prompt reacting to news.
 */
export async function generateNewsCaption(newsItem, options = {}) {
    const angle = pickAngle(options.angle);
    const maxLength = options.maxLength || 1200;

    const today = new Date().toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });

    const prompt = `You are Ghost — military veteran, AI systems architect, founder of Ghost AI Systems in Orlando FL. You deploy PRODUCTION AI voice agents, lead gen systems, and automation for real businesses every day.

TODAY IS: ${today}

You're reacting to this REAL AI news that just broke:

HEADLINE: ${newsItem.title}
SOURCE: ${newsItem.source}
SUMMARY: ${newsItem.summary || 'No summary available'}
URL: ${newsItem.link}

YOUR COMMENTARY ANGLE: ${angle.instruction}

Write an Instagram caption that:
1. HOOKS with a reaction to the actual news (first line must stop the scroll)
2. Gives YOUR take — what this means from the trenches of someone building AI systems
3. Makes it relevant to the audience (entrepreneurs, builders, people curious about AI)
4. Ends with engagement — question, call to action, or provocative closer

═══ FORMAT ═══
- HOOK FIRST: Reference the news directly. "OpenAI just dropped X" or "Everyone's losing their mind over Y"
- Short paragraphs. Line breaks. One idea per line.
- → arrows and • bullets for lists
- 1-2 emojis MAX
- NO hashtags in caption body
- Vary length: 400-800 chars for news reactions

═══ VIDEO PROMPT ═══
Also generate a cinematic video prompt for the Reel. Must relate to the news topic visually.
- 9:16 vertical, cinematic quality, 5-8 seconds
- NO text overlays in the video
- Should feel urgent, newsworthy, cutting-edge

Return strict JSON:
{
  "caption": "the full Instagram caption",
  "video_prompt": "detailed cinematic video generation prompt",
  "hook_type": "breaking_news|ghost_take|builder_reaction|model_wars"
}

Keep caption under ${maxLength} characters.`;

    const { text, provider, model } = await generateText({
        prompt,
        provider: options.provider || 'grok',
        maxOutputTokens: 1200,
        grokModel: 'grok-4.20-0309-reasoning',
    });

    // Parse JSON
    let parsed;
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
        parsed = null;
    }

    if (!parsed?.caption) {
        return {
            caption: text.trim().substring(0, maxLength),
            videoPrompt: null,
            hookType: 'ghost_take',
            source: 'ai_raw',
            angle: angle.angle,
            provider,
            newsItem: { title: newsItem.title, source: newsItem.source, link: newsItem.link },
        };
    }

    return {
        caption: parsed.caption.substring(0, maxLength),
        videoPrompt: parsed.video_prompt || null,
        hookType: parsed.hook_type || 'ghost_take',
        source: 'ai',
        angle: angle.angle,
        provider,
        model,
        newsItem: { title: newsItem.title, source: newsItem.source, link: newsItem.link },
    };
}

// ── LinkedIn Commentary ────────────────────────────────────────
/**
 * Generate a longer-form LinkedIn post reacting to news.
 */
export async function generateNewsLinkedInPost(newsItem, options = {}) {
    const angle = pickAngle(options.angle || 'business_impact');

    const prompt = `You are Daniel Castillo (Ghost) — military veteran, AI systems architect, founder of Ghost AI Systems in Orlando FL. You speak with authority about AI because you deploy production systems daily.

You're writing a LinkedIn post reacting to this AI news:

HEADLINE: ${newsItem.title}
SOURCE: ${newsItem.source}  
SUMMARY: ${newsItem.summary || ''}
URL: ${newsItem.link}

YOUR ANGLE: ${angle.instruction}

LinkedIn format:
1. HOOK — first line shows in preview. Make it count. React to the news directly.
2. Context — what happened and why it matters
3. YOUR TAKE — the insight nobody else is giving. Based on real deployment experience.
4. Actionable — what should business owners/builders DO about this
5. CTA — ask a question to drive comments

Rules:
- 500-1200 characters
- Short paragraphs, line breaks
- Professional but authentic. Not corporate-speak.
- Include the source URL at the end
- 1-2 relevant emojis max
- NO hashtags

Output ONLY the LinkedIn post text.`;

    const { text, provider } = await generateText({
        prompt,
        provider: options.provider || 'grok',
        maxOutputTokens: 1500,
        grokModel: 'grok-4.20-0309-reasoning',
    });

    return {
        text: text.trim(),
        angle: angle.angle,
        provider,
        newsItem: { title: newsItem.title, source: newsItem.source, link: newsItem.link },
    };
}

export default {
    generateNewsTweet,
    generateNewsCaption,
    generateNewsLinkedInPost,
    COMMENTARY_ANGLES,
};

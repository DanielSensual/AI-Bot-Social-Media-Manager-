/**
 * Smart Content Adapter
 * AI-powered content rewriter that adapts a single piece of content
 * for each platform's optimal format, tone, and constraints.
 */

import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

const PLATFORM_RULES = {
    x: {
        name: 'X (Twitter)',
        maxChars: 280,
        tone: 'Punchy, direct, provocative. Short sentences. 1-2 hashtags max.',
        format: 'Single paragraph or very short bullet points. Must be under 280 characters.',
    },
    linkedin: {
        name: 'LinkedIn',
        maxChars: 1200,
        tone: 'Professional narrative. Thought leadership. Storytelling with business insight.',
        format: '500-1200 characters. Use line breaks for readability. No hashtags. Open with a strong hook.',
    },
    facebook: {
        name: 'Facebook',
        maxChars: 600,
        tone: 'Conversational, warm, community-oriented. Visual hook first line.',
        format: '200-600 characters. Short paragraphs. End with engagement CTA (question, poll, comment prompt). Minimal hashtags.',
    },
    instagram: {
        name: 'Instagram',
        maxChars: 2200,
        tone: 'Emoji-forward, casual but valuable. Hashtag-rich for discoverability.',
        format: '150-500 characters for main caption. Add 10-15 relevant hashtags at the end separated by line breaks. Use emojis to break up text.',
    },
};

/**
 * Adapt content for a single platform
 * @param {string} text - Original content
 * @param {string} platform - One of: x, linkedin, facebook, instagram
 * @returns {Promise<string>} Platform-adapted content
 */
export async function adaptContent(text, platform) {
    const rules = PLATFORM_RULES[platform];
    if (!rules) throw new Error(`Unknown platform: ${platform}`);

    if (!openai) {
        // Fallback: basic truncation if no AI available
        return text.length > rules.maxChars
            ? text.substring(0, rules.maxChars - 3) + '...'
            : text;
    }

    const prompt = `Rewrite the following content specifically for ${rules.name}.

ORIGINAL CONTENT:
${text}

PLATFORM RULES:
- Tone: ${rules.tone}
- Format: ${rules.format}
- Max characters: ${rules.maxChars}

IMPORTANT:
- Keep the core message and intent identical
- Do NOT add information that wasn't in the original
- Do NOT use markdown formatting
- Output ONLY the rewritten content, nothing else
- The brand is Ghost AI Systems (AI automation agency)

Rewritten content:`;

    const completion = await openai.chat.completions.create({
        model: 'gpt-5.2',
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 800,
    });

    const adapted = completion.choices?.[0]?.message?.content?.trim();
    if (!adapted) return text;

    // Enforce max chars for X
    if (platform === 'x' && adapted.length > 280) {
        return adapted.substring(0, 277) + '...';
    }

    return adapted;
}

/**
 * Adapt content for all platforms in a single efficient call
 * @param {string} text - Original content
 * @returns {Promise<object>} { x, linkedin, facebook, instagram }
 */
export async function adaptForAll(text) {
    if (!openai) {
        // Fallback: return original text for all platforms
        return {
            x: text.length > 280 ? text.substring(0, 277) + '...' : text,
            linkedin: text,
            facebook: text,
            instagram: text,
        };
    }

    const prompt = `You are a social media content strategist for Ghost AI Systems (an AI automation agency).

Rewrite the following content optimized for EACH platform. Return strict JSON only.

ORIGINAL CONTENT:
${text}

PLATFORM SPECIFICATIONS:
1. X (Twitter): ${PLATFORM_RULES.x.tone} ${PLATFORM_RULES.x.format}
2. LinkedIn: ${PLATFORM_RULES.linkedin.tone} ${PLATFORM_RULES.linkedin.format}
3. Facebook: ${PLATFORM_RULES.facebook.tone} ${PLATFORM_RULES.facebook.format}
4. Instagram: ${PLATFORM_RULES.instagram.tone} ${PLATFORM_RULES.instagram.format}

RULES:
- Keep the core message identical across all versions
- Do NOT add facts that weren't in the original
- Do NOT use markdown formatting
- X version MUST be under 280 characters

OUTPUT FORMAT (strict JSON):
{
  "x": "twitter version here",
  "linkedin": "linkedin version here",
  "facebook": "facebook version here",
  "instagram": "instagram version here"
}`;

    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-5.2',
            messages: [{ role: 'user', content: prompt }],
            max_completion_tokens: 2000,
        });

        const raw = completion.choices?.[0]?.message?.content?.trim() || '';
        let parsed;

        try {
            parsed = JSON.parse(raw);
        } catch {
            const blockMatch = raw.match(/\{[\s\S]*\}/);
            if (!blockMatch) throw new Error('Could not parse AI response');
            parsed = JSON.parse(blockMatch[0]);
        }

        // Enforce X length limit
        if (parsed.x && parsed.x.length > 280) {
            parsed.x = parsed.x.substring(0, 277) + '...';
        }

        return {
            x: parsed.x || text,
            linkedin: parsed.linkedin || text,
            facebook: parsed.facebook || text,
            instagram: parsed.instagram || text,
        };
    } catch (error) {
        console.warn(`⚠️ Content adaptation failed, using original: ${error.message}`);
        return {
            x: text.length > 280 ? text.substring(0, 277) + '...' : text,
            linkedin: text,
            facebook: text,
            instagram: text,
        };
    }
}

export default { adaptContent, adaptForAll };

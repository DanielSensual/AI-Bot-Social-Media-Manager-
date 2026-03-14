/**
 * Daniel Facebook caption builder.
 * AI-first with deterministic template fallback.
 */

import dotenv from 'dotenv';
import { generateText, hasLLMProvider } from './llm-client.js';

dotenv.config();

const DEFAULT_MAX_LENGTH = 1200;

const THEMES = [
    'creator systems',
    'ai workflows for business owners',
    'behind the scenes operator notes',
    'execution over hype',
    'real world automation lessons',
];

const TEMPLATE_CAPTIONS = [
    ({ theme }) => `AI is useful when it removes a real bottleneck.

Today I focused on ${theme}. The workflow is simple:
1) find the repeated task
2) define the handoff rules
3) automate only what can be measured

If you are building right now, start with one task and run it daily for 7 days.`,

    ({ theme }) => `Most teams are not blocked by ideas. They are blocked by execution rhythm.

I use a daily system for ${theme}:
- one clear objective
- one automatable step
- one metric to review by end of day

Consistency compounds faster than complexity.`,

    ({ theme }) => `Quick operator note:

The best automation decisions come from boring data, not shiny demos.

For ${theme}, I track:
- response time
- conversion movement
- failure reasons

If the numbers do not move, I simplify the workflow and ship again tomorrow.`,

    ({ theme }) => `If AI feels chaotic, reduce scope.

Pick one workflow tied to revenue, support, or content.
Build the smallest version first.
Then improve weekly.

That is how I approach ${theme} without wasting time on tool hopping.`,

    ({ theme }) => `Builder mindset for today:

No giant strategy deck.
No over-engineered stack.
Just one outcome and one deploy.

For ${theme}, simple systems win because they are easier to run every day.`,
];

function pick(array, randomFn = Math.random) {
    return array[Math.floor(randomFn() * array.length)];
}

function parseJsonObject(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return null;
        try {
            return JSON.parse(match[0]);
        } catch {
            return null;
        }
    }
}

export function normalizeDanielFacebookCaption(text, maxLength = DEFAULT_MAX_LENGTH) {
    const normalized = String(text || '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (!normalized) return '';
    if (!Number.isFinite(maxLength) || maxLength < 4) return normalized;
    if (normalized.length <= maxLength) return normalized;

    return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function buildPrompt({ theme, maxLength }) {
    return `You write daily Facebook posts for Daniel Castillo, a hands-on creator/operator.

Audience:
- founders
- creators
- local business owners
- people implementing AI practically

Theme for this post: ${theme}

Return strict JSON only:
{
  "caption": "post text"
}

Rules:
- Keep it practical and grounded.
- Personal brand voice: direct, calm, builder energy.
- No hashtags.
- No markdown.
- 3-8 short paragraphs or lines.
- Include at least one concrete tactical point.
- Keep total length under ${maxLength} characters.`;
}

export function createDanielFacebookContentBuilder(deps = {}) {
    const hasLLMProviderFn = deps.hasLLMProviderFn || hasLLMProvider;
    const generateTextFn = deps.generateTextFn || generateText;
    const randomFn = deps.randomFn || Math.random;

    function getTemplateCaption(options = {}) {
        const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
        const theme = options.theme || pick(THEMES, randomFn);
        const template = pick(TEMPLATE_CAPTIONS, randomFn);
        const caption = normalizeDanielFacebookCaption(template({ theme }), maxLength);

        return {
            caption,
            source: 'template',
            theme,
            provider: null,
            fallbackReason: null,
        };
    }

    async function buildCaption(options = {}) {
        const aiEnabled = options.aiEnabled !== false;
        const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
        const provider = options.provider || 'auto';
        const theme = options.theme || pick(THEMES, randomFn);

        if (aiEnabled && hasLLMProviderFn()) {
            try {
                const prompt = buildPrompt({ theme, maxLength });
                const { text, provider: usedProvider, model } = await generateTextFn({
                    prompt,
                    provider,
                    maxOutputTokens: 600,
                    openaiModel: 'gpt-5.2',
                    geminiModel: process.env.GEMINI_MODEL || 'gemini-3-pro-preview',
                });

                const parsed = parseJsonObject(text);
                const caption = normalizeDanielFacebookCaption(parsed?.caption, maxLength);

                if (caption) {
                    return {
                        caption,
                        source: 'ai',
                        theme,
                        provider: usedProvider || provider,
                        model: model || null,
                        fallbackReason: null,
                    };
                }

                const fallback = getTemplateCaption({ maxLength, theme });
                return {
                    ...fallback,
                    fallbackReason: 'ai_empty',
                };
            } catch (error) {
                const fallback = getTemplateCaption({ maxLength, theme });
                return {
                    ...fallback,
                    fallbackReason: `ai_error:${error.message}`,
                };
            }
        }

        const fallback = getTemplateCaption({ maxLength, theme });
        return {
            ...fallback,
            fallbackReason: aiEnabled ? 'ai_unavailable' : 'ai_disabled',
        };
    }

    return {
        buildCaption,
        getTemplateCaption,
    };
}

const defaultBuilder = createDanielFacebookContentBuilder();

export async function buildDanielFacebookCaption(options = {}) {
    return defaultBuilder.buildCaption(options);
}

export function getDanielFacebookTemplateCaption(options = {}) {
    return defaultBuilder.getTemplateCaption(options);
}

export default {
    createDanielFacebookContentBuilder,
    buildDanielFacebookCaption,
    getDanielFacebookTemplateCaption,
    normalizeDanielFacebookCaption,
};

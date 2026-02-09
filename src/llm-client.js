/**
 * Unified LLM client with OpenAI + Gemini + Grok support.
 * Provider order is controlled by AI_PROVIDER (auto|openai|gemini|grok).
 */

import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const openaiClient = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GROK_API_KEY = process.env.GROK_API_KEY || process.env.XAI_API_KEY || '';
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.2';
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-pro-preview';
const DEFAULT_GROK_MODEL = process.env.GROK_MODEL || 'grok-3';

function getProviderOrder(requestedProvider = 'auto') {
    const mode = (requestedProvider || process.env.AI_PROVIDER || 'auto').toLowerCase();

    if (mode === 'openai') return ['openai'];
    if (mode === 'gemini') return ['gemini'];
    if (mode === 'grok') return ['grok'];
    // Auto mode prefers Gemini first (user-requested default), then falls back to OpenAI.
    return ['gemini', 'openai', 'grok'];
}

async function callOpenAI({
    prompt,
    systemPrompt = '',
    openaiModel = DEFAULT_OPENAI_MODEL,
    maxOutputTokens = 800,
}) {
    if (!openaiClient) {
        throw new Error('OPENAI_API_KEY is not configured');
    }

    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const completion = await openaiClient.chat.completions.create({
        model: openaiModel,
        messages,
        max_completion_tokens: maxOutputTokens,
    });

    const text = completion.choices?.[0]?.message?.content?.trim();
    if (!text) {
        throw new Error('OpenAI returned empty content');
    }

    return {
        text,
        provider: 'openai',
        model: openaiModel,
    };
}

async function callGemini({
    prompt,
    systemPrompt = '',
    geminiModel = DEFAULT_GEMINI_MODEL,
    maxOutputTokens = 800,
}) {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    const body = {
        contents: [
            {
                role: 'user',
                parts: [{ text: prompt }],
            },
        ],
        generationConfig: {
            maxOutputTokens,
        },
    };

    if (systemPrompt) {
        body.system_instruction = {
            parts: [{ text: systemPrompt }],
        };
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const message = data?.error?.message || `Gemini API error ${response.status}`;
        throw new Error(message);
    }

    const text = data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || '')
        .join('')
        .trim();

    if (!text) {
        throw new Error('Gemini returned empty content');
    }

    return {
        text,
        provider: 'gemini',
        model: geminiModel,
    };
}

async function callGrok({
    prompt,
    systemPrompt = '',
    grokModel = DEFAULT_GROK_MODEL,
    maxOutputTokens = 800,
}) {
    if (!GROK_API_KEY) {
        throw new Error('GROK_API_KEY / XAI_API_KEY is not configured');
    }

    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GROK_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: grokModel,
            messages,
            max_tokens: maxOutputTokens,
        }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = data?.error?.message || `Grok API error ${response.status}`;
        throw new Error(message);
    }

    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
        throw new Error('Grok returned empty content');
    }

    return {
        text,
        provider: 'grok',
        model: grokModel,
    };
}

export function hasLLMProvider() {
    return Boolean(openaiClient || GEMINI_API_KEY || GROK_API_KEY);
}

/**
 * Generate text from configured provider(s).
 * Tries provider order until one succeeds.
 */
export async function generateText(options) {
    const {
        provider = 'auto',
    } = options || {};

    const order = getProviderOrder(provider);
    let lastError = null;

    for (const candidate of order) {
        try {
            if (candidate === 'openai') return await callOpenAI(options || {});
            if (candidate === 'gemini') return await callGemini(options || {});
            if (candidate === 'grok') return await callGrok(options || {});
        } catch (error) {
            lastError = error;
        }
    }

    throw new Error(`No AI provider succeeded: ${lastError?.message || 'Unknown error'}`);
}

export default { hasLLMProvider, generateText };

/**
 * Unified LLM client with OpenAI + Gemini support.
 * Provider order is controlled by AI_PROVIDER (auto|openai|gemini).
 */

import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const openaiClient = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

function getProviderOrder(requestedProvider = 'auto') {
    const mode = (requestedProvider || process.env.AI_PROVIDER || 'auto').toLowerCase();

    if (mode === 'openai') return ['openai'];
    if (mode === 'gemini') return ['gemini'];
    return ['openai', 'gemini'];
}

async function callOpenAI({
    prompt,
    systemPrompt = '',
    openaiModel = process.env.OPENAI_MODEL || 'gpt-5.2',
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
    geminiModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash',
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

export function hasLLMProvider() {
    return Boolean(openaiClient || GEMINI_API_KEY);
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
        } catch (error) {
            lastError = error;
        }
    }

    throw new Error(`No AI provider succeeded: ${lastError?.message || 'Unknown error'}`);
}

export default { hasLLMProvider, generateText };

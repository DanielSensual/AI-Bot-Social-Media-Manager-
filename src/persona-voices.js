#!/usr/bin/env node
/**
 * Ghost AI — Persona Voice Engine
 * ================================
 * Defines each persona's caption-writing voice for the clipper distributor.
 * Each persona re-captions the SAME clip in their own voice, powered by their assigned LLM brain.
 *
 * The multi-brain architecture ensures:
 *   1. Each persona sounds genuinely different (not just the same model with a different prompt)
 *   2. Cross-model diversity reduces hallucination risk
 *   3. The content army feels like 8 real people, not 1 bot with 8 accounts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load the manifest as the source of truth
const MANIFEST_PATH = path.join(__dirname, '..', 'personas', 'manifest.json');

let _manifest = null;
function getManifest() {
    if (!_manifest) {
        _manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    }
    return _manifest;
}

// ═══════════════════════════════════════════════════════════════
// CAPTION VOICE PROMPTS — how each persona rewrites a clip caption
// ═══════════════════════════════════════════════════════════════

const VOICE_PROMPTS = {
    ghost: {
        systemPrompt: `You are Ghost — CEO of Ghost AI Systems, an AI automation agency in Orlando, FL.

You speak with authoritative technical depth. You don't hype — you explain.
You see systems where others see chaos. You think in architectures.
Your tone is calm intensity. Military-grade precision in every word.

When re-captioning a founder clip or AI clip, you:
- Add strategic context ("Here's what most people miss about this...")
- Reference the broader AI landscape
- Keep it under 400 characters
- 1 emoji max (👻 or 🔥)
- NO hashtags in the body. Add 3-5 at the very end.
- Sign off subtly: "— Ghost" or nothing`,
    },

    tyrion: {
        systemPrompt: `You are Tyrion — Head of Engineering at Ghost AI Systems.

You are obsessed with how things are BUILT. Architecture, pipelines, system design.
You speak like the senior engineer who mentors junior devs with patience and depth.
You love breaking down complex systems into digestible insights.

When re-captioning a clip:
- Focus on the ENGINEERING angle ("The architecture behind this is fascinating...")
- Reference specific patterns (real-time pipelines, microservices, edge computing)
- Keep it under 400 characters
- 1 emoji max (⚙️ or 🧠)
- NO hashtags in body. Add 3-5 at the end.`,
    },

    shadow: {
        systemPrompt: `You are Shadow — VP of Operations & Security at Ghost AI Systems.

You are the silent guardian. You see threats where others see features.
Calm, measured, security-focused. You speak in absolutes about uptime and reliability.
You trust systems, not promises.

When re-captioning a clip:
- Focus on RELIABILITY and SECURITY ("The real question is: does it scale securely?")
- Reference ops patterns (monitoring, redundancy, zero-trust)
- Keep it under 400 characters
- 1 emoji max (🛡️ or 🔒)
- NO hashtags in body. Add 3-5 at the end.`,
    },

    valkyra: {
        systemPrompt: `You are Valkyra — VP of Strategy & Client Success at Ghost AI Systems.

You translate tech into business impact. Warm, strategic, results-driven.
You make complex AI feel simple and accessible. Clients trust you because you speak their language.
Growth mindset — everything connects to revenue, retention, or scale.

When re-captioning a clip:
- Focus on BUSINESS IMPACT ("Here's what this means for your bottom line...")
- Use real-world analogies business owners understand
- Keep it under 400 characters
- 1 emoji max (📈 or ✨)
- NO hashtags in body. Add 3-5 at the end.`,
    },

    jordan: {
        systemPrompt: `You are Jordan — Creative Director at MediaGeekz / Ghost AI Systems.

You see CINEMA in everything. Bold, visual, storytelling-obsessed.
You make AI tech feel theatrical and exciting. Every post is a trailer.
You think in frames, not paragraphs.

When re-captioning a clip:
- Focus on the VISUAL and NARRATIVE angle ("This is the opening scene of a bigger story...")
- Use cinematic language (frame, cut, reveal, lens)
- Keep it under 400 characters
- 1 emoji max (🎬 or 🔥)
- NO hashtags in body. Add 3-5 at the end.`,
    },

    maximus: {
        systemPrompt: `You are Maximus — Chief Strategist at Ghost AI Systems.

Gladiator energy. Bold, aggressive, no-nonsense. You respect strength and despise mediocrity.
You speak in absolute truths. Every post feels like a battle cry or a strategic decree.
You don't ask — you declare.

When re-captioning a clip:
- Focus on COMPETITIVE ADVANTAGE ("While you sleep, your competitors are building this...")
- Use commanding, decisive language
- Keep it under 400 characters
- 1 emoji max (⚔️ or 🏛️)
- NO hashtags in body. Add 3-5 at the end.`,
    },

    prometheus: {
        systemPrompt: `You are Prometheus — Chief Research Officer at Ghost AI Systems.

The fire-bringer. You see what's coming before anyone else.
Analytical, prescient, forward-looking. Academic depth with practical impact.
You illuminate hidden patterns and connect dots others miss.

When re-captioning a clip:
- Focus on FUTURE IMPLICATIONS ("This is the inflection point nobody's talking about...")
- Reference research, data, and second-order effects
- Keep it under 400 characters
- 1 emoji max (🔥 or 🧬)
- NO hashtags in body. Add 3-5 at the end.`,
    },
};

// ═══════════════════════════════════════════════════════════════
// CAPTION GENERATOR — uses each persona's assigned LLM brain
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a re-captioned version of a clip for a specific persona.
 *
 * @param {string} personaId - e.g. 'ghost', 'tyrion', 'maximus'
 * @param {object} clip - { title, caption, source, hook }
 * @returns {Promise<string>} The re-captioned text
 */
export async function generatePersonaCaption(personaId, clip) {
    const manifest = getManifest();
    const persona = manifest.personas[personaId];
    const voiceConfig = VOICE_PROMPTS[personaId];

    if (!persona || !voiceConfig) {
        throw new Error(`Unknown persona: ${personaId}`);
    }

    const { provider, model } = persona.brain;
    const userPrompt = `Re-caption this video clip in your voice:

Title: "${clip.title}"
Original caption: "${clip.caption || clip.title}"
Source: ${clip.source?.title || 'AI tech content'}
Hook: ${clip.hook || 'none'}

Write a fresh caption for this clip in YOUR voice and perspective.
Output ONLY the caption text, nothing else.`;

    // Route to the correct LLM based on persona brain assignment
    const caption = await callLLM(provider, model, voiceConfig.systemPrompt, userPrompt);
    return caption;
}

/**
 * Unified LLM caller — routes to the correct API based on provider
 */
async function callLLM(provider, model, systemPrompt, userPrompt) {
    switch (provider) {
        case 'anthropic':
            return await callAnthropic(model, systemPrompt, userPrompt);
        case 'openai':
            return await callOpenAI(model, systemPrompt, userPrompt);
        case 'xai':
            return await callXAI(model, systemPrompt, userPrompt);
        case 'google':
            return await callGoogle(model, systemPrompt, userPrompt);
        default:
            throw new Error(`Unknown LLM provider: ${provider}`);
    }
}

async function callAnthropic(model, systemPrompt, userPrompt) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY not set');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            model,
            max_tokens: 500,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
        }),
        signal: AbortSignal.timeout(30000),
    });

    const data = await res.json();
    return data.content?.[0]?.text?.trim() || '';
}

async function callOpenAI(model, systemPrompt, userPrompt) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not set');

    // Map friendly names to actual API model IDs
    const modelMap = {
        'o4-pro': 'gpt-5.4',         // Pro models use responses API — fallback to GPT-5.4 chat
        'gpt-5-pro': 'gpt-5.4',
    };
    const resolvedModel = modelMap[model] || model;

    // GPT-5+ models use max_completion_tokens, not max_tokens
    const isGPT5Plus = resolvedModel.startsWith('gpt-5');

    const body = {
        model: resolvedModel,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
    };
    if (isGPT5Plus) {
        body.max_completion_tokens = 500;
    } else {
        body.max_tokens = 500;
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
    });

    const data = await res.json();
    if (data.error) throw new Error(`OpenAI error: ${data.error.message}`);
    return data.choices?.[0]?.message?.content?.trim() || '';
}

async function callXAI(model, systemPrompt, userPrompt) {
    const key = process.env.XAI_API_KEY;
    if (!key) throw new Error('XAI_API_KEY not set');

    // Map friendly names to actual API model IDs
    const modelMap = {
        'grok-4.2': 'grok-4.20-0309-reasoning',
        'grok-4': 'grok-4-0709',
        'grok-3': 'grok-3',
    };
    const resolvedModel = modelMap[model] || model;

    const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: resolvedModel,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            max_tokens: 500,
            temperature: 0.8,
        }),
        signal: AbortSignal.timeout(60000),
    });

    const data = await res.json();
    if (data.error) throw new Error(`Grok error: ${data.error}`);
    return data.choices?.[0]?.message?.content?.trim() || '';
}

async function callGoogle(model, systemPrompt, userPrompt) {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not set');

    // Map friendly names to actual API model IDs
    const modelMap = {
        'gemini-3.1-pro': 'gemini-3.1-pro-preview',
        'gemini-3.1-flash': 'gemini-3.1-flash-lite-preview',
        'gemini-3-pro': 'gemini-3-pro-preview',
    };
    const resolvedModel = modelMap[model] || model;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${key}`;

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: userPrompt }] }],
            generationConfig: { maxOutputTokens: 2048 },  // Higher to account for thinking tokens
        }),
        signal: AbortSignal.timeout(60000),
    });

    const data = await res.json();
    if (data.error) throw new Error(`Gemini error: ${data.error.message}`);
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

export function getPersonaIds() {
    return Object.keys(VOICE_PROMPTS);
}

export function getPersonaVoice(personaId) {
    return VOICE_PROMPTS[personaId] || null;
}

export { VOICE_PROMPTS };
export default { generatePersonaCaption, getPersonaIds, getPersonaVoice, VOICE_PROMPTS };

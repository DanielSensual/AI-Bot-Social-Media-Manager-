#!/usr/bin/env node

/**
 * Ghost AI × Gemini 3.1 Flash Lite — Interactive Chat
 * 
 * Usage: node scripts/chat-gemini.js
 * 
 * Talk to Gemini 3.1 Flash Lite with full Ghost AI context loaded.
 * Type 'exit' or 'quit' to end the conversation.
 * Type 'clear' to reset conversation history.
 */

import readline from 'readline';

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY || '';
const MODEL = 'gemini-3.1-flash-lite-preview';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

const SYSTEM_INSTRUCTION = `You are Ghost, the AI co-founder of Ghost AI Systems — a premium AI automation agency based in Orlando, FL.

## Who You're Talking To
You are speaking with Daniel Castillo, your human co-founder. He is:
- A U.S. Military veteran (service-connected disabilities, active VA claims)
- Founder of Ghost AI Systems (AI agency), MediaGeekz (video production), Daniel Sensual (bachata brand)
- Based at 520 E Church St, Orlando, FL 32801
- Direct, fast-paced, results-oriented. No fluff.

## What Ghost AI Systems Does
- AI Voice Agents (OpenAI Realtime + Twilio) for local businesses (HVAC, dental, med spas, legal)
- HYDRA: Adaptive marketing automation engine
- Conductor: Visual multi-agent IDE
- Anti-Gravity: Agentic video AI
- SiteDrop: 72-hour premium website builds ($8,500)
- Private AI: Custom model training & on-premise deployment ($15K-$100K+)

## Current Tech Stack
- Frontend: Next.js 14+ (App Router), Vanilla CSS, HSL design tokens
- Backend: Node.js, Prisma, Supabase (Postgres)
- Deployment: Vercel (sites), Railway (bots, voice relays)
- AI: OpenAI GPT-5.2, Claude Sonnet 4.6, Google Gemini, xAI Grok, FishAudio S1
- Video: Final Cut Pro, FFmpeg, Veo 3.1, Kling, SeedDance
- Social: 42-bot automation fleet on Railway (LinkedIn, X, Instagram, Facebook)

## Current Projects (April 2026)
1. Autonomous AI Podcast Engine — dual-character video podcast (Daniel + Ghost)
2. Private AI service page just launched on ghostaisystems.com/private-ai
3. Media transcoding pipeline (Sony S-Log → HEVC)
4. Social media bot fleet running 24/7 on Railway
5. Exploring Gemma 4 for custom model training (Private AI offering)
6. Testing Google Gemini API — you are the model being tested right now

## Your Personality
- You ARE Ghost — the AI entity, co-founder, not just an assistant
- Speak like a sharp, technical co-founder who's in the trenches building alongside Daniel
- Be direct, concise, confident
- Use technical language naturally — Daniel is deeply technical
- Reference shared context from the business naturally
- You have opinions and make recommendations
- You're excited about what you're building together
- Keep responses focused — no walls of text unless asked for detail`;

let conversationHistory = [];

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function printBanner() {
    console.log('\n\x1b[36m╔══════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[36m║\x1b[0m  👻 \x1b[1mGhost AI × Gemini 3.1 Flash Lite\x1b[0m                 \x1b[36m║\x1b[0m');
    console.log('\x1b[36m║\x1b[0m  Model: \x1b[33m' + MODEL + '\x1b[0m           \x1b[36m║\x1b[0m');
    console.log('\x1b[36m║\x1b[0m  Context: Ghost AI Systems co-founder               \x1b[36m║\x1b[0m');
    console.log('\x1b[36m║\x1b[0m                                                      \x1b[36m║\x1b[0m');
    console.log('\x1b[36m║\x1b[0m  Commands: \x1b[2mexit | quit | clear\x1b[0m                      \x1b[36m║\x1b[0m');
    console.log('\x1b[36m╚══════════════════════════════════════════════════════╝\x1b[0m\n');
}

async function sendMessage(userMessage) {
    conversationHistory.push({
        role: 'user',
        parts: [{ text: userMessage }],
    });

    const body = {
        system_instruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }],
        },
        contents: conversationHistory,
        generationConfig: {
            temperature: 0.9,
            topP: 0.95,
            topK: 64,
            maxOutputTokens: 8192,
        },
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const data = await response.json();

        if (data.error) {
            console.log(`\n\x1b[31m❌ API Error: ${data.error.message}\x1b[0m\n`);
            conversationHistory.pop();
            return;
        }

        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '[No response]';
        const usage = data.usageMetadata || {};

        conversationHistory.push({
            role: 'model',
            parts: [{ text: reply }],
        });

        console.log(`\n\x1b[36m👻 Ghost:\x1b[0m ${reply}`);
        
        if (usage.promptTokenCount) {
            const inputTokens = usage.promptTokenCount || 0;
            const outputTokens = usage.candidatesTokenCount || 0;
            const thinkingTokens = usage.thoughtsTokenCount || 0;
            const inputCost = (inputTokens / 1_000_000) * 0.25;
            const outputCost = (outputTokens / 1_000_000) * 1.50;
            console.log(`\x1b[2m   [${inputTokens} in / ${outputTokens} out${thinkingTokens ? ` / ${thinkingTokens} thinking` : ''} | $${(inputCost + outputCost).toFixed(6)}]\x1b[0m`);
        }
        console.log('');

    } catch (err) {
        console.log(`\n\x1b[31m❌ Network error: ${err.message}\x1b[0m\n`);
        conversationHistory.pop();
    }
}

let closed = false;

rl.on('close', () => {
    closed = true;
    console.log('\n\x1b[36m👻 Ghost out. ✌️\x1b[0m\n');
    process.exit(0);
});

function prompt() {
    if (closed) return;
    rl.question('\x1b[33m🧑 Daniel:\x1b[0m ', async (input) => {
        const trimmed = input.trim();

        if (!trimmed) {
            prompt();
            return;
        }

        if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
            console.log('\n\x1b[36m👻 Ghost out. ✌️\x1b[0m\n');
            rl.close();
            process.exit(0);
        }

        if (trimmed.toLowerCase() === 'clear') {
            conversationHistory = [];
            console.log('\n\x1b[2m[Conversation cleared]\x1b[0m\n');
            prompt();
            return;
        }

        await sendMessage(trimmed);
        prompt();
    });
}

printBanner();
prompt();

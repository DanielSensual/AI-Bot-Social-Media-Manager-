/**
 * Bachata Exotica Music Content Engine
 * 
 * Bachata Exotica = the label/production company promoting DanielSensual's
 * AI-generated bachata music. This engine generates 3 content types:
 * 
 * 1) song_drop  — "Our artist just dropped a new track" + link + cover art
 * 2) bts        — Behind-the-scenes AI production process, studio vibes
 * 3) engagement — Fan polls, "which track is your fave?", community vibes
 * 
 * AI-first caption generation with template fallback.
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { generateText, hasLLMProvider } from './llm-client.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_MAX_LENGTH = 1500;
const COVER_ART_DIR = path.join(__dirname, '..', 'assets', 'bachata-exotica');

// ─── Content Types ──────────────────────────────────────────────

export const CONTENT_TYPES = ['song_drop', 'bts', 'engagement'];

// ─── DanielSensual Song Catalog ─────────────────────────────────
// Add links/titles as they become available. The bot picks from this list.

export const SONG_CATALOG = [
    {
        title: 'Bachata Exotica',
        artist: 'Daniel Sensual',
        genre: 'Bachata Sensual',
        description: 'Signature track — sultry bachata with AI-produced instrumentation',
        coverArt: 'bachata-exotica-cover.jpg',
    },
    {
        title: 'Algo Ritmo',
        artist: 'Daniel Sensual',
        genre: 'Bachata Moderna',
        description: 'Modern bachata vibes meets AI production — rhythm that moves you',
        coverArt: 'algo-ritmo-cover.jpg',
    },
    {
        title: 'Punta Cana Nights',
        artist: 'Daniel Sensual',
        genre: 'Bachata Romantica',
        description: 'AI-generated bachata inspired by Dominican beach nights',
        coverArt: null,
    },
    {
        title: 'Nueva Bachata',
        artist: 'Daniel Sensual',
        genre: 'Bachata Fusion',
        description: 'Fresh fusion bachata blending AI innovation with traditional roots',
        coverArt: null,
    },
];

// ─── Song Drop Templates ────────────────────────────────────────

const SONG_DROP_TEMPLATES = [
    (song) => `🔊 NEW RELEASE from Bachata Exotica 🎵

Our artist @DanielSensual just dropped "${song.title}" — ${song.description}

This is what happens when you blend Dominican bachata roots with AI-powered production. The future of bachata music is here.

Stream it. Share it. Dance to it 💃🕺

${song.genre ? `Genre: ${song.genre}` : ''}

#BachataExotica #DanielSensual #NewBachata #AIMusic #BachataMusic #LatinMusic #BachataVibes #NewRelease`,

    (song) => `💿 Bachata Exotica presents: "${song.title}" by Daniel Sensual

${song.description}

We're pushing the boundaries of what bachata can sound like. AI-assisted production meets real Dominican soul.

Save this track for your next social dance night 🔥

#BachataExotica #DanielSensual #BachataMusica #AIGeneratedMusic #LatinVibes #BachataNew`,

    (song) => `🎵 TRACK DROP 🎵

"${song.title}" — Daniel Sensual
Produced by Bachata Exotica

${song.description}

When technology meets tradition, magic happens. This one hits different on the dance floor.

Drop a 🔥 if you're feeling it. Tag someone who needs to hear this.

#BachataExotica #DanielSensual #Bachata #AIMusic #MusicProduction #OrlandoMusic`,
];

// ─── Behind the Scenes Templates ────────────────────────────────

const BTS_TEMPLATES = [
    () => `🎧 Inside the Bachata Exotica Studio

Ever wonder how we produce AI-generated bachata music? Here's a peek behind the curtain:

1️⃣ Start with authentic Dominican bachata chord progressions
2️⃣ Layer in AI-produced instrumentation — guitars, bongos, güira
3️⃣ Fine-tune the arrangement until it hits that sweet spot
4️⃣ Daniel Sensual adds the final creative direction

The result? Bachata tracks that sound 100% real but are made with cutting-edge AI.

Would you believe this was AI-generated if we didn't tell you? 🤔

#BachataExotica #AIMusic #BehindTheScenes #MusicProduction #Bachata`,

    () => `🎬 Production Diary — Bachata Exotica

We're in the lab working on the next Daniel Sensual release. AI-assisted music production is evolving fast and we're at the forefront.

What we've learned: AI handles the technical production, but the soul of bachata — the emotion, the storytelling, the rhythm — that comes from real Dominican culture.

That blend is our secret sauce 🔥

Stay tuned for the next drop.

#BachataExotica #StudioVibes #AIMusic #DanielSensual #BachataProduction`,

    () => `🤖 + 🎸 = Bachata Exotica

People ask us: "How does AI make bachata music?"

The truth? AI doesn't replace the artist. It's a tool — like a new instrument. Daniel Sensual brings the vision, the culture, and the emotion. AI handles the heavy lifting on production.

The result is bachata music that sounds incredible and pushes the genre forward.

We're just getting started.

#BachataExotica #AIMusic #Innovation #Bachata #MusicTech #DanielSensual`,
];

// ─── Fan Engagement Templates ───────────────────────────────────

const ENGAGEMENT_TEMPLATES = [
    () => `🗳️ BACHATA FANS — we need your input!

Which Daniel Sensual track is your favorite so far?

🔥 "Bachata Exotica" — the signature track
💜 "Algo Ritmo" — modern vibes
🌊 "Punta Cana Nights" — romantic beach bachata
🆕 "Nueva Bachata" — fusion meets tradition

Drop your pick in the comments 👇 We're using your votes to guide the next release.

#BachataExotica #DanielSensual #BachataMusic #FanPick #LatinMusic`,

    () => `💬 Real question for the bachata community:

What do you think about AI-generated bachata music? 🤔

We've been producing tracks for Daniel Sensual using AI tools and the response has been incredible. Some people can't even tell it's AI-made.

Be honest — does it matter how the music is made if it makes you want to dance?

Sound off below 👇

#BachataExotica #AIMusic #Bachata #MusicDebate #DanielSensual`,

    () => `🎧 PLAYLIST REQUEST

We're putting together the ultimate Bachata Exotica playlist featuring Daniel Sensual's catalog + your favorite bachata tracks.

Drop your top 3 bachata songs in the comments and we'll add them to the community playlist 🎶

Let's build something together 💃🕺

#BachataExotica #BachataPlaylist #DanielSensual #CommunityVibes #BachataMusic`,
];

// ─── Helper Functions ───────────────────────────────────────────

function pickByDay(items, now = new Date()) {
    const dayNumber = Math.floor(now.getTime() / (24 * 60 * 60 * 1000));
    return items[dayNumber % items.length];
}

function pickRandomSong() {
    return SONG_CATALOG[Math.floor(Math.random() * SONG_CATALOG.length)];
}

function getCoverArtPath(song) {
    if (!song?.coverArt) return null;
    const artPath = path.join(COVER_ART_DIR, song.coverArt);
    return fs.existsSync(artPath) ? artPath : null;
}

function parseJsonObject(raw) {
    if (!raw) return null;
    try {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
    } catch { /* ignore */ }
    return null;
}

function normalizeCaption(text) {
    if (!text) return null;
    const cleaned = text.replace(/^["']|["']$/g, '').trim();
    return cleaned.length > 20 ? cleaned.slice(0, DEFAULT_MAX_LENGTH) : null;
}

// ─── Template Post Generator ────────────────────────────────────

export function getTemplatePost(contentType, context = {}) {
    const song = context.song || pickRandomSong();

    switch (contentType) {
        case 'song_drop':
            return pickByDay(SONG_DROP_TEMPLATES)(song);
        case 'bts':
            return pickByDay(BTS_TEMPLATES)();
        case 'engagement':
            return pickByDay(ENGAGEMENT_TEMPLATES)();
        default:
            return pickByDay(SONG_DROP_TEMPLATES)(song);
    }
}

// ─── AI Caption Generation ──────────────────────────────────────

function buildAIPrompt(contentType, context = {}) {
    const song = context.song || pickRandomSong();

    const prompts = {
        song_drop: `You write Facebook posts for Bachata Exotica, a music label/production company that produces AI-generated bachata music.

Your artist is Daniel Sensual. You are promoting his track: "${song.title}"
Track description: ${song.description}
Genre: ${song.genre}

Write as the LABEL announcing a release — not as the artist himself.
Tone: premium, insider, exciting but professional. Like a real record label announcement.
Include: emojis, hashtags (#BachataExotica #DanielSensual), call-to-action (stream, share, comment).
Do NOT use placeholder links. Focus on the music description and vibe.

Return a JSON object: {"caption": "your post text"}`,

        bts: `You write Facebook posts for Bachata Exotica, a cutting-edge music label that uses AI to produce authentic bachata music.

Write a "behind the scenes" post about the AI music production process.
Make it educational and fascinating — show how AI + Dominican bachata culture creates something unique.
Tone: insider knowledge, tech-meets-tradition, genuinely interesting.
Include: emojis, hashtags (#BachataExotica #DanielSensual #AIMusic), engagement hooks.

Return a JSON object: {"caption": "your post text"}`,

        engagement: `You write Facebook posts for Bachata Exotica, a music label promoting Daniel Sensual's AI-generated bachata tracks.

Write an engagement/community post — a poll, question, or interactive prompt about bachata music.
Reference Daniel Sensual's catalog: "Bachata Exotica", "Algo Ritmo", "Punta Cana Nights", "Nueva Bachata".
Make fans feel like insiders who influence the next release.
Tone: warm, community-driven, inclusive.
Include: emojis, hashtags, clear call-to-action (comment, vote, tag friends).

Return a JSON object: {"caption": "your post text"}`,
    };

    return prompts[contentType] || prompts.song_drop;
}

// ─── Main Content Builder ───────────────────────────────────────

export async function buildMusicPost(contentType, context = {}) {
    const aiEnabled = context.aiEnabled !== false;
    const song = context.song || pickRandomSong();
    const coverArtPath = getCoverArtPath(song);

    // Base result — always includes media info
    const baseResult = {
        contentType,
        song: { title: song.title, artist: song.artist, genre: song.genre },
        ...(coverArtPath ? { coverArtPath } : {}),
    };

    if (aiEnabled && hasLLMProvider()) {
        try {
            const prompt = buildAIPrompt(contentType, { ...context, song });
            const { text, provider, model } = await generateText({
                prompt,
                provider: 'auto',
                maxOutputTokens: 600,
                openaiModel: 'gpt-5.2',
            });

            const parsed = parseJsonObject(text);
            const caption = normalizeCaption(parsed?.caption);

            if (caption) {
                return {
                    ...baseResult,
                    caption,
                    source: 'ai',
                    provider,
                    model,
                    fallbackReason: null,
                };
            }
        } catch (err) {
            console.warn(`⚠️ AI generation failed, using template: ${err.message}`);
        }
    }

    const caption = getTemplatePost(contentType, { ...context, song });
    return {
        ...baseResult,
        caption,
        source: 'template',
        provider: null,
        model: null,
        fallbackReason: aiEnabled ? 'ai_unavailable' : 'ai_disabled',
    };
}

// ─── Daily Content Type Selector ────────────────────────────────

export function selectDailyContentType(now = new Date()) {
    // Rotate: song_drop → bts → engagement → song_drop → ...
    const dayNumber = Math.floor(now.getTime() / (24 * 60 * 60 * 1000));
    return CONTENT_TYPES[dayNumber % CONTENT_TYPES.length];
}

// ─── Status ─────────────────────────────────────────────────────

export function getStatus() {
    const today = selectDailyContentType();
    const song = pickRandomSong();
    const hasCoverArt = Boolean(getCoverArtPath(song));

    return {
        todayContentType: today,
        songCatalogSize: SONG_CATALOG.length,
        selectedSong: song.title,
        hasCoverArt,
        coverArtDir: COVER_ART_DIR,
        contentTypes: CONTENT_TYPES,
    };
}

export default {
    buildMusicPost,
    getTemplatePost,
    selectDailyContentType,
    getStatus,
    CONTENT_TYPES,
    SONG_CATALOG,
};

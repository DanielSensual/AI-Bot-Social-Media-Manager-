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
 * 
 * Updated 2026-04-06: Full 20-song catalog from DistroKid releases.
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
const POST_TRACKER_PATH = path.join(__dirname, '..', 'data', 'bachata-exotica-tracker.json');
const BRAIN_PATH = path.join(__dirname, '..', 'bachata-brain.md');

// Load brain file once at startup
let BRAIN_CONTEXT = '';
try {
    if (fs.existsSync(BRAIN_PATH)) {
        BRAIN_CONTEXT = fs.readFileSync(BRAIN_PATH, 'utf-8');
        console.log(`🧠 [bachata-content] Loaded brain file (${(BRAIN_CONTEXT.length / 1024).toFixed(1)}KB)`);
    }
} catch { /* brain file optional */ }

// ─── Content Types ──────────────────────────────────────────────

export const CONTENT_TYPES = ['song_drop', 'bts', 'engagement'];

// ─── DanielSensual Song Catalog — Full DistroKid Releases ───────
// 20 released singles (album: "Bachata Sensual" by Daniel Sensual)
// Listed in release order. Each gets rotated so no song repeats until
// all 20 have been featured.

export const SONG_CATALOG = [
    {
        title: 'Bachata Sensual',
        artist: 'Daniel Sensual',
        genre: 'Bachata Sensual',
        description: 'The title track — pure sensuality, smooth guitar riffs, and Dominican soul. The heartbeat of the album.',
        coverArt: null,
        streamLinks: {},
    },
    {
        title: 'Bad Gyal',
        artist: 'Daniel Sensual',
        genre: 'Bachata Urbana',
        description: 'Urban bachata heat — reggaeton-tinged beats collide with traditional guitar for a dancefloor weapon.',
        coverArt: null,
        streamLinks: {},
    },
    {
        title: 'El Uber (Remix)',
        artist: 'Daniel Sensual',
        genre: 'Bachata Moderna',
        description: 'The remix that flips the original — heavier bass, sharper drops. Built for the club.',
        coverArt: null,
        streamLinks: {},
    },
    {
        title: 'Alta Tension',
        artist: 'Daniel Sensual',
        genre: 'Bachata Sensual',
        description: 'High tension, higher chemistry. A track that builds slow and explodes on the chorus.',
        coverArt: null,
        streamLinks: {},
    },
    {
        title: 'Noche Prestada',
        artist: 'Daniel Sensual',
        genre: 'Bachata Romantica',
        description: 'A borrowed night, a stolen dance. Romantic bachata at its finest — guitars crying over moonlit drums.',
        coverArt: null,
        streamLinks: {},
    },
    {
        title: 'El Uber',
        artist: 'Daniel Sensual',
        genre: 'Bachata Moderna',
        description: 'The original ride-or-die anthem. Modern bachata storytelling about late-night connections.',
        coverArt: null,
        streamLinks: {},
    },
    {
        title: 'El Error',
        artist: 'Daniel Sensual',
        genre: 'Bachata Romantica',
        description: 'The mistake that felt right. Raw emotion poured over acoustic bachata — heartbreak never sounded this good.',
        coverArt: null,
        streamLinks: {},
    },
    {
        title: 'Sensacion Del Cuerpo',
        artist: 'Daniel Sensual',
        genre: 'Bachata Sensual',
        description: 'Body sensation — the kind of track that moves you before you decide to move. Pure groove.',
        coverArt: null,
        streamLinks: {},
    },
    {
        title: 'Luces Apagadas',
        artist: 'Daniel Sensual',
        genre: 'Bachata Sensual',
        description: 'Lights off, music on. Intimate bachata designed for close dances and whispered lyrics.',
        coverArt: null,
        streamLinks: {},
    },
    {
        title: 'Navidades',
        artist: 'Daniel Sensual',
        genre: 'Bachata Navideña',
        description: 'Holiday bachata — festive energy meets Dominican rhythm. Christmas on the dance floor.',
        coverArt: null,
        streamLinks: {},
    },
    {
        title: 'Check in with you',
        artist: 'Daniel Sensual',
        genre: 'Bachata Moderna',
        description: 'Modern love language in bachata form. Checking in, staying connected, keeping the flame alive.',
        coverArt: null,
        streamLinks: {},
    },
    {
        title: 'Mirame',
        artist: 'Daniel Sensual',
        genre: 'Bachata Sensual',
        description: '"Look at me" — commanding presence on a silky bachata beat. Eyes locked, bodies moving.',
        coverArt: null,
        streamLinks: {},
    },
    {
        title: 'Bailar Contigo',
        artist: 'Daniel Sensual',
        genre: 'Bachata Romantica',
        description: 'Dancing with you is all that matters. A love letter wrapped in bongo rhythms and guitar.',
        coverArt: null,
        streamLinks: {},
    },
    {
        title: 'Read Receipts',
        artist: 'Daniel Sensual',
        genre: 'Bachata Moderna',
        description: 'Digital-age heartbreak bachata — seen at 2AM, no reply. The pain of modern romance.',
        coverArt: null,
        streamLinks: {},
    },
    {
        title: 'Barcelona',
        artist: 'Daniel Sensual',
        genre: 'Bachata Fusion',
        description: 'European nights meet Dominican soul. Flamenco-tinged bachata inspired by Spanish summer.',
        coverArt: null,
        streamLinks: {},
    },
    {
        title: 'Bajo Tu Lluvia',
        artist: 'Daniel Sensual',
        genre: 'Bachata Romantica',
        description: 'Under your rain — dancing in the storm, soaked in emotion. Cinematic bachata romance.',
        coverArt: null,
        streamLinks: {},
    },
    {
        title: 'No Me Digas',
        artist: 'Daniel Sensual',
        genre: 'Bachata Sensual',
        description: '"Don\'t tell me" — defiant and seductive. The tension between desire and resistance.',
        coverArt: null,
        streamLinks: {},
    },
    {
        title: 'Escape',
        artist: 'Daniel Sensual',
        genre: 'Bachata Moderna',
        description: 'Running away together — tropical escape energy. The getaway track of the album.',
        coverArt: null,
        streamLinks: {},
    },
    {
        title: 'Atlantis',
        artist: 'Daniel Sensual',
        genre: 'Bachata Fusion',
        description: 'Deep, mythical, otherworldly. Bachata that feels like sinking into an underwater paradise.',
        coverArt: null,
        streamLinks: {},
    },
    {
        title: 'D&D',
        artist: 'Daniel Sensual',
        genre: 'Bachata Sensual',
        description: 'Unreleased heat — the vault track. Danger and desire collide on a hypnotic bachata beat.',
        coverArt: null,
        streamLinks: {},
        unreleased: true,
    },
];

// ─── Post Tracker — prevents repeating the same song ────────────

function loadTracker() {
    try {
        if (fs.existsSync(POST_TRACKER_PATH)) {
            return JSON.parse(fs.readFileSync(POST_TRACKER_PATH, 'utf-8'));
        }
    } catch { /* fresh start */ }
    return { lastPostedIndex: -1, postedSongs: [], lastReset: new Date().toISOString() };
}

function saveTracker(tracker) {
    const dir = path.dirname(POST_TRACKER_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(POST_TRACKER_PATH, JSON.stringify(tracker, null, 2));
}

/**
 * Pick the next song in rotation. Cycles through all released songs
 * before repeating any. Skips unreleased tracks.
 */
function pickNextSong() {
    const releasedSongs = SONG_CATALOG.filter(s => !s.unreleased);
    const tracker = loadTracker();

    // If we've cycled through all songs, reset
    if (tracker.postedSongs.length >= releasedSongs.length) {
        tracker.postedSongs = [];
        tracker.lastReset = new Date().toISOString();
        console.log('🔄 [bachata-content] Full catalog rotation complete — resetting tracker');
    }

    // Find next unposted song
    const unposted = releasedSongs.filter(s => !tracker.postedSongs.includes(s.title));

    // Pick a deterministic-but-varied song based on day number
    const dayNumber = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
    const song = unposted[dayNumber % unposted.length];

    // Record it
    tracker.postedSongs.push(song.title);
    tracker.lastPostedIndex = releasedSongs.indexOf(song);
    saveTracker(tracker);

    return song;
}

function getCoverArtPath(song) {
    if (!song?.coverArt) return null;
    const artPath = path.join(COVER_ART_DIR, song.coverArt);
    return fs.existsSync(artPath) ? artPath : null;
}

// ─── Song Drop Templates ────────────────────────────────────────
// 8 templates = enough variety to not repeat for weeks

const SONG_DROP_TEMPLATES = [
    (song) => `🔊 NEW RELEASE from Bachata Exotica 🎵

Our artist @DanielSensual just dropped "${song.title}" — ${song.description}

This is what happens when you blend Dominican bachata roots with cutting-edge AI production. The future of bachata music is here.

Stream it. Share it. Dance to it 💃🕺

Genre: ${song.genre}

#BachataExotica #DanielSensual #BachataSensual #NewBachata #AIMusic #LatinMusic`,

    (song) => `💿 Bachata Exotica presents: "${song.title}" by Daniel Sensual

${song.description}

We're pushing the boundaries of what bachata can sound like. AI-assisted production meets real Dominican soul.

Save this track for your next social dance night 🔥

#BachataExotica #DanielSensual #BachataMusica #AIGeneratedMusic #LatinVibes`,

    (song) => `🎵 TRACK SPOTLIGHT 🎵

"${song.title}" — Daniel Sensual
Produced by Bachata Exotica

${song.description}

When technology meets tradition, magic happens. This one hits different on the dance floor.

Drop a 🔥 if you're feeling it. Tag someone who needs to hear this.

#BachataExotica #DanielSensual #Bachata #AIMusic #OrlandoMusic`,

    (song) => `🎶 From the vault to your speakers — "${song.title}" is live NOW.

Daniel Sensual delivers ${song.genre.toLowerCase()} at its finest. ${song.description}

This is the sound of 2026 bachata. Are you ready?

Link in bio 🔗 | Available on all platforms

#BachataExotica #DanielSensual #NewMusic #BachataVibes #StreamNow`,

    (song) => `🌹 "${song.title}" — the track the dance community is talking about.

${song.description}

Daniel Sensual and Bachata Exotica continue to prove that AI-produced music can move souls, not just algorithms.

What do you think? Comment your honest reaction 👇

#DanielSensual #BachataExotica #Bachata2026 #AIMusic #DanceMusic`,

    (song) => `🚨 FRESH DROP 🚨

"${song.title}" just landed on all streaming platforms.

Daniel Sensual brings the heat with ${song.genre.toLowerCase()} vibes that refuse to let you stand still. ${song.description}

Share with your dance partner 💃🕺

#BachataExotica #DanielSensual #NewRelease #BachataMusic #LatinHits`,

    (song) => `✨ Every track tells a story. This one? "${song.title}"

${song.description}

Bachata Exotica doesn't just produce music — we craft experiences. Daniel Sensual's artistry meets AI innovation.

Which Daniel Sensual track is your go-to? 🎵

#BachataExotica #DanielSensual #BachataStory #AIMusic #MusicLovers`,

    (song) => `🎤 Bachata Exotica Label Drop

Artist: Daniel Sensual
Track: "${song.title}"
Genre: ${song.genre}
Status: OUT NOW 🔥

${song.description}

The Bachata Sensual album keeps growing. 20 tracks. Zero skips.

Stream the full catalog — link in bio.

#BachataExotica #DanielSensual #BachataSensualAlbum #NoSkips #AIBachata`,
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

We're 20 tracks deep into the Bachata Sensual album and the AI production pipeline is sharper than ever.

What we've learned: AI handles the technical production, but the soul of bachata — the emotion, the storytelling, the rhythm — that comes from real Dominican culture.

That blend is our secret sauce 🔥

Next phase? Music videos. Stay tuned.

#BachataExotica #StudioVibes #AIMusic #DanielSensual #BachataSensual`,

    () => `🤖 + 🎸 = Bachata Exotica

People ask us: "How does AI make bachata music?"

The truth? AI doesn't replace the artist. It's a tool — like a new instrument. Daniel Sensual brings the vision, the culture, and the emotion. AI handles the heavy lifting on production.

20 released tracks later, we're proving the model works.

#BachataExotica #AIMusic #Innovation #Bachata #MusicTech #DanielSensual`,

    () => `📊 By the numbers — Bachata Exotica in 2026:

🎵 20 tracks released
🎤 1 artist: Daniel Sensual
🤖 100% AI-assisted production
💃 Thousands of dancers worldwide
🔥 0 skips on the album

This isn't a gimmick. This is the new standard for independent bachata.

#BachataExotica #DanielSensual #IndieMusic #AIMusic #BachataStats`,

    () => `🎙️ From idea to release in 48 hours.

That's the Bachata Exotica advantage. While traditional studios take weeks to produce one track, our AI pipeline lets Daniel Sensual go from concept to mastered single in two days.

Quality doesn't have to mean slow. Innovation doesn't have to mean soulless.

We prove both, every release.

#BachataExotica #MusicProduction #AIMusic #DanielSensual #FastAndFire`,
];

// ─── Fan Engagement Templates ───────────────────────────────────

const ENGAGEMENT_TEMPLATES = [
    () => `🗳️ BACHATA FANS — we need your input!

The "Bachata Sensual" album now has 20 tracks. Which one is YOUR favorite?

🔥 "Bachata Sensual" — the title track
💜 "Bad Gyal" — urban heat
🌊 "Noche Prestada" — romantic vibes
🎸 "Barcelona" — flamenco fusion
🌙 "Luces Apagadas" — intimate energy
💔 "El Error" — heartbreak anthem

Drop your pick in the comments 👇

#BachataExotica #DanielSensual #BachataMusic #FanPick #LatinMusic`,

    () => `💬 Real question for the bachata community:

We've released 20 tracks using AI-assisted production. Some people can't even tell it's AI-made.

Be honest — does it matter how the music is made if it makes you want to dance?

Sound off below 👇

#BachataExotica #AIMusic #Bachata #MusicDebate #DanielSensual`,

    () => `🎧 BUILD THE PLAYLIST

We're putting together the ultimate Daniel Sensual playlist. Here's the full catalog:

Bachata Sensual • Bad Gyal • El Uber (Remix) • Alta Tension • Noche Prestada • El Uber • El Error • Sensacion Del Cuerpo • Luces Apagadas • Navidades • Check in with you • Mirame • Bailar Contigo • Read Receipts • Barcelona • Bajo Tu Lluvia • No Me Digas • Escape • Atlantis

Pick your TOP 3 in the comments 🎶

#BachataExotica #DanielSensual #BachataPlaylist #CommunityVibes`,

    () => `🔥 HOT TAKE TIME

Rank these Daniel Sensual tracks from 🔥 to 🔥🔥🔥🔥🔥:

• Bachata Sensual
• El Error
• Barcelona
• Luces Apagadas
• Bad Gyal

No wrong answers. Just vibes. Drop your ranking 👇

#DanielSensual #BachataExotica #BachataRanking #LatinMusic`,

    () => `💃 Which Daniel Sensual track do you want to see as a MUSIC VIDEO?

We're planning the next visual. Your vote matters:

A) "Bachata Sensual" — the signature
B) "Barcelona" — cinematic potential
C) "Noche Prestada" — pure romance
D) "Bad Gyal" — urban energy

Comment your letter! Most votes wins 🎬

#BachataExotica #DanielSensual #MusicVideo #FanChoice #BachataVibes`,

    () => `❓ TRIVIA TIME

How many tracks has Daniel Sensual released on the "Bachata Sensual" album so far?

A) 10
B) 15
C) 20
D) 25

First person to get it right gets a shoutout in our next post! 🏆

#BachataExotica #DanielSensual #BachataTrivia #MusicQuiz`,
];

// ─── Helper Functions ───────────────────────────────────────────

function pickByDay(items, now = new Date()) {
    const dayNumber = Math.floor(now.getTime() / (24 * 60 * 60 * 1000));
    return items[dayNumber % items.length];
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

// ─── Full song list as readable string (for AI prompts) ─────────
function getSongListForPrompt() {
    return SONG_CATALOG
        .filter(s => !s.unreleased)
        .map((s, i) => `${i + 1}. "${s.title}" (${s.genre}) — ${s.description}`)
        .join('\n');
}

// ─── Template Post Generator ────────────────────────────────────

export function getTemplatePost(contentType, context = {}) {
    const song = context.song || pickNextSong();

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
    const song = context.song || pickNextSong();
    const songList = getSongListForPrompt();

    const prompts = {
        song_drop: `You write Facebook posts for Bachata Exotica, a music label/production company that produces AI-generated bachata music.

Your artist is Daniel Sensual. His album "Bachata Sensual" has 20 released tracks.

TODAY you are promoting: "${song.title}"
Track description: ${song.description}
Genre: ${song.genre}

Full catalog for reference (do NOT list all of them, just know they exist):
${songList}

Write as the LABEL announcing/promoting this specific track — not as the artist himself.
Tone: premium, insider, exciting but professional. Like a real record label post.
Include: emojis, hashtags (#BachataExotica #DanielSensual), call-to-action (stream, share, comment).
Do NOT use placeholder links. Focus on the music description and vibe.
IMPORTANT: Be CREATIVE and UNIQUE. Do not reuse generic phrases like "the future of bachata is here."

Return a JSON object: {"caption": "your post text"}`,

        bts: `You write Facebook posts for Bachata Exotica, a cutting-edge music label that uses AI to produce authentic bachata music.

The artist is Daniel Sensual. The album "Bachata Sensual" now has 20 tracks across multiple sub-genres:
${songList}

Write a "behind the scenes" post about the AI music production process.
Make it educational and fascinating — show how AI + Dominican bachata culture creates something unique.
Reference SPECIFIC tracks from the catalog to make it feel current and real.
Tone: insider knowledge, tech-meets-tradition, genuinely interesting.
Include: emojis, hashtags (#BachataExotica #DanielSensual #AIMusic), engagement hooks.
IMPORTANT: Each post should feel FRESH and DIFFERENT. Vary your angle — one time talk about the guitar production, another time about vocal processing, another about genre fusion.

Return a JSON object: {"caption": "your post text"}`,

        engagement: `You write Facebook posts for Bachata Exotica, a music label promoting Daniel Sensual's AI-generated bachata tracks.

Full catalog (20 tracks):
${songList}

Write an engagement/community post — a poll, question, ranking challenge, or interactive prompt about the music.
Reference SPECIFIC songs from the list above (pick 4-6 relevant ones, vary your selection).
Make fans feel like insiders who influence the next release.
Tone: warm, community-driven, inclusive, fun.
Include: emojis, hashtags, clear call-to-action (comment, vote, tag friends).
IMPORTANT: Be CREATIVE. Don't just ask "what's your favorite?" every time. Try ranking challenges, "this or that" battles, scenario questions, trivia, etc.

Return a JSON object: {"caption": "your post text"}`,
    };

    return prompts[contentType] || prompts.song_drop;
}

// ─── Main Content Builder ───────────────────────────────────────

export async function buildMusicPost(contentType, context = {}) {
    const aiEnabled = context.aiEnabled !== false;
    const song = context.song || pickNextSong();
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
                systemPrompt: BRAIN_CONTEXT,
                provider: 'auto',
                maxOutputTokens: 2000, // extra headroom for thinking tokens
                openaiModel: 'gpt-5.4-thinking',
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
    const tracker = loadTracker();
    const releasedSongs = SONG_CATALOG.filter(s => !s.unreleased);
    const unposted = releasedSongs.filter(s => !tracker.postedSongs.includes(s.title));

    return {
        todayContentType: today,
        songCatalogSize: releasedSongs.length,
        songsPostedThisCycle: tracker.postedSongs.length,
        songsRemainingThisCycle: unposted.length,
        nextSong: unposted[0]?.title || '(cycle complete — will reset)',
        lastReset: tracker.lastReset,
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

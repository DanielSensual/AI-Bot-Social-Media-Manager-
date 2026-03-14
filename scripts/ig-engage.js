#!/usr/bin/env node
/**
 * Post comments on @danieldigitalfilmmaker timeline + publish a Reel
 * Uses AbortSignal.timeout to prevent hangs.
 */
import 'dotenv/config';

const TOKEN = process.env.INSTAGRAM_GRAPH_TOKEN;
const USER_ID = process.env.INSTAGRAM_GRAPH_USER_ID;

// Detect token type
const isFbToken = TOKEN && TOKEN.startsWith('EAA');
const API = isFbToken ? 'https://graph.facebook.com/v24.0' : 'https://graph.instagram.com/v22.0';

async function api(url, opts = {}, label = '') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
        const fetchUrl = new URL(url);
        // Ensure access_token is always present
        if (!fetchUrl.searchParams.has('access_token')) {
            fetchUrl.searchParams.set('access_token', TOKEN);
        }

        const res = await fetch(fetchUrl.toString(), { ...opts, signal: controller.signal });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        console.log(`  ✅ ${label}: ${JSON.stringify(data).slice(0, 120)}`);
        return data;
    } catch (e) {
        if (e.name === 'AbortError') console.error(`  ❌ ${label}: TIMEOUT (20s)`);
        else console.error(`  ❌ ${label}: ${e.message}`);
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

// ── Comments ──
const comments = [
    // Post 2: COMICA mic (Nov 2025)
    { postId: '18099270967766128', msg: 'Audio really is the unsung hero. People notice bad sound before bad picture every time 🎤' },
    // Post 3: Fav RE lens (Oct 2024)
    { postId: '17900947601983685', msg: 'This lens changed the game for real estate work honestly 🏠🔥' },
    // Post 4: 😅 (Aug 2024)  
    { postId: '17847305319285693', msg: 'The life of a creator hits different 😂🎬' },
    // Post 5: 14mm Sony GM (Jul 2024)
    { postId: '18000268346419180', msg: 'Still one of the best investments for real estate walkthroughs. Lightweight and sharp 🤩' },
    // Post 6: 3-cam BTS (Jun 2024)
    { postId: '18010835021440522', msg: 'Rim lights make such a huge difference in production value. Love this setup 💯' },
    // Post 7: Beach wedding (May 2024)
    { postId: '18075536275489785', msg: 'Beach weddings are beautiful but running through sand with gear is a workout 😂🌊' },
    // Post 8: Drone compilation (May 2024)
    { postId: '17989877903647630', msg: 'Golden hour really makes everything hit different 🔥 some of these shots are wild' },
    // Post 9: BTS with Vinny (May 2024)
    { postId: '17866069833129581', msg: 'Working with people who bring energy to set makes all the difference 🤝' },
    // Post 10: Avata 2 unbox (May 2024)
    { postId: '17913466946945853', msg: 'FPV gives you shots nothing else can. The Avata 2 is so fun to fly 🚁' },
];

// ── Reel Post ──
const REEL_URL = 'https://files.catbox.moe/1exzfp.mov';
const REEL_CAPTION = `My top 3 AI video models right now 🤖🎬

1️⃣ Veo 3.1 on Gemini Ultra — the high-res output is top notch. Follows prompts really well and consistently gives me the best results.

2️⃣ Sora 2 Pro — still a strong second. Great quality and reliable.

3️⃣ Grok Imagine — solid third option that keeps getting better.

AI video is evolving fast. What's your go-to model? Drop it below 👇

#AIVideo #Filmmaking #ContentCreator #Videography #AI #VEO #Sora #Grok #Filmmaker #VideoProduction #TechCreator`;

async function main() {
    console.log('🚀 Starting @danieldigitalfilmmaker engagement run\n');
    console.log(`Token: ${TOKEN ? TOKEN.slice(0, 12) + '...' : 'MISSING!'}`);
    console.log(`User ID: ${USER_ID}\n`);

    if (!TOKEN || !USER_ID) {
        console.error('❌ Missing INSTAGRAM_GRAPH_TOKEN or INSTAGRAM_GRAPH_USER_ID in .env');
        process.exit(1);
    }

    /*
    // ── 1. Post Comments ──
    console.log('💬 Posting comments on timeline...\n');
    let posted = 0;
    for (const { postId, msg } of comments) {
        const params = new URLSearchParams({ message: msg, access_token: TOKEN });
        const result = await api(`${API}/${postId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        }, `Comment on ${postId}`);
        if (result) posted++;
        // Small delay between comments to avoid rate limits
        await new Promise(r => setTimeout(r, 2000));
    }
    console.log(`\n📊 Comments: ${posted}/${comments.length} posted\n`);
    */
    // ── 2. Publish Reel ──
    console.log('🎬 Creating Reel container...\n');
    const containerParams = new URLSearchParams({
        media_type: 'REELS',
        video_url: REEL_URL,
        caption: REEL_CAPTION,
        access_token: TOKEN,
    });

    const container = await api(`${API}/${USER_ID}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: containerParams.toString(),
    }, 'Reel container');

    if (!container?.id) {
        console.error('❌ Failed to create Reel container. Stopping.');
        return;
    }

    // Poll for processing
    console.log('\n⏳ Waiting for Instagram to process video...');
    const containerId = container.id;
    let ready = false;
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const status = await api(
            `${API}/${containerId}?fields=status_code,status&access_token=${TOKEN}`,
            {}, `Poll ${i + 1}/30`
        );
        if (status?.status_code === 'FINISHED') { ready = true; break; }
        if (status?.status_code === 'ERROR') {
            console.error('❌ Video processing failed:', status.status);
            return;
        }
    }

    if (!ready) {
        console.error('❌ Video still processing after 2.5 minutes. Try publishing manually.');
        console.log(`   Container ID: ${containerId}`);
        return;
    }

    // Publish
    console.log('\n📤 Publishing Reel...');
    const publishParams = new URLSearchParams({
        creation_id: containerId,
        access_token: TOKEN,
    });
    await api(`${API}/${USER_ID}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: publishParams.toString(),
    }, 'Reel publish');

    console.log('\n🎉 Done!');
}

main().catch(e => console.error('Fatal:', e));

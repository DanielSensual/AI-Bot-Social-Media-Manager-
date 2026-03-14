#!/usr/bin/env node
/**
 * Post comments on @danieldigitalfilmmaker timeline
 * Refactored to use the new Instagram direct token logic
 */
import 'dotenv/config';

const TOKEN = process.env.INSTAGRAM_GRAPH_TOKEN;
const USER_ID = process.env.INSTAGRAM_GRAPH_USER_ID;

// Use the explicit direct API URL since this assumes IGA* Direct Tokens
const API = 'https://graph.instagram.com/v22.0';

async function api(url, opts = {}, label = '') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
        const fetchUrl = new URL(url);
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

const comments = [
    // Post 1: Perfect shot
    { postId: '18102141352666621', msg: 'Dedication to the craft! 🤝🎥 Sometimes you gotta do whatever it takes for that perfect angle.' },
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
    // Post 11: So many video shoots
    { postId: '18046545679641715', msg: 'The grind never stops! Beautiful work as always 🔥👏' },
    // Post 12: Chicago Mavic 3
    { postId: '18345574816099548', msg: 'Chicago looks absolutely stunning from that Mavic 3 Cine! Great shot 🌆🚁' },
    // Post 13: Orlando filming
    { postId: '17901384518952104', msg: 'Another day, another amazing shoot! The Mavic 3 Cine is a beast 💯' },
    // Post 14: Barcelona Mini 3
    { postId: '18130291885321964', msg: 'The Mini 3 packs such a huge punch for its size. Barcelona looks incredible from up there 🇪🇸🚁' },
    // Post 15: Orlando BTS
    { postId: '18034730023764067', msg: 'Love seeing the BTS! The setup looks super clean 🔥🎥' }
];

async function main() {
    console.log('🚀 Starting @danieldigitalfilmmaker engagement run\n');
    console.log(`Token: ${TOKEN ? TOKEN.slice(0, 12) + '...' : 'MISSING!'}`);
    console.log(`User ID: ${USER_ID}\n`);

    if (!TOKEN || !USER_ID) {
        console.error('❌ Missing INSTAGRAM_GRAPH_TOKEN or INSTAGRAM_GRAPH_USER_ID in .env');
        process.exit(1);
    }

    // ── Post Comments ──
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
    console.log('🎉 Done!');
}

main().catch(e => console.error('Fatal:', e));

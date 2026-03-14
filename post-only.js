import 'dotenv/config';
import igClient from './src/instagram-client.js';

async function main() {
    const caption = `Diving into the world of AI video models today! My top pick is VO 3.1 on Gemini Ultra—25K credits, high-res output, and unmatched prompt accuracy. Sora 2 Pro comes in strong at second, with Grock Imagine rounding out my top 3. What’s your go-to AI tool for video? 🎥✨ #Filmmaking #Videography #AIVideo #VideoEditing #ContentCreation #TechForCreatives`;

    // Using the uguu URL for the Main profile 1080p re-encode
    const videoUrl = 'https://n.uguu.se/flWmMEus.mp4';
    console.log(`🔗 Direct URL: ${videoUrl}\n`);

    console.log('📤 Posting Reel to @danieldigitalfilmmaker...');
    const config = {
        type: 'direct_ig',
        token: process.env.INSTAGRAM_GRAPH_TOKEN,
        igUserId: process.env.INSTAGRAM_GRAPH_USER_ID
    };

    const publishResult = await igClient.postInstagramReel(caption, videoUrl, config);
    console.log('✅ Reel Published!', publishResult);
}

main().catch(console.error);

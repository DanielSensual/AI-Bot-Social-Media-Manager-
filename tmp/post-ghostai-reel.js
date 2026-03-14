import dotenv from 'dotenv';
import { postInstagramReel, uploadToTempHost, testInstagramConnection } from '../src/instagram-client.js';
import { generateVideo, cleanupCache } from '../src/video-generator.js';

dotenv.config();

const config = {
  type: 'facebook_page',
  token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN,
  pageId: process.env.FACEBOOK_PAGE_ID,
};

const caption = `OpenClaw is live — the ops layer that connects your AI tools, channels, and automations. Orchestrate agents, post everywhere, and monitor everything in one console. Build faster. Ship smarter. 👻\n\n#OpenClaw #AI #Automation #AgenticAI #GhostAISystems`;

const videoPrompt = `Cinematic vertical 9:16 reel. A sleek dark command center with holographic UI panels and glowing AI nodes connected by light trails, abstract automation flows, neon cyan and magenta accents, crisp lighting, high-contrast, smooth camera push-ins and parallax, futuristic but tasteful, no logos, no text.`;

async function main() {
  const ok = await testInstagramConnection(config);
  if (!ok) process.exit(1);

  cleanupCache();
  const videoPath = await generateVideo(videoPrompt, { aspectRatio: '9:16', duration: 8, provider: 'grok' });
  const videoUrl = await uploadToTempHost(videoPath);
  const result = await postInstagramReel(caption, videoUrl, config);
  console.log(result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

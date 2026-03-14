import { postToLinkedInWithImage } from '../src/linkedin-client.js';

const caption = `Nano Banana 2 just closed the gap on text‑in‑image quality.

This update isn’t just sharper type — it’s instruction following, text localization, and visual fidelity finally looking production‑ready for real marketing assets.

If you’re still doing mockups manually, you’re already behind.

#AI #GenerativeAI #Design #Marketing #GhostAI`;

await postToLinkedInWithImage(caption, './tmp/nano-banana-linkedin-v2.jpg');

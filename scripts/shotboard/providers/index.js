/**
 * Ghost AI Creative Director — Multi-Provider Cascade
 * 
 * Provides failover logic across 4 API providers for both
 * image generation and video generation.
 */

import { generateImageGrok, generateVideoGrok, pollVideoGrok } from './grok.js';
import { generateImageGemini, generateVideoVeo } from './gemini.js';
import { generateImageFal, generateVideoFal } from './fal.js';
import { generateImageReplicate, generateVideoReplicate } from './replicate.js';

const IMAGE_PROVIDERS = [
  { name: 'grok', fn: generateImageGrok, key: 'XAI_API_KEY' },
  { name: 'gemini', fn: generateImageGemini, key: 'GOOGLE_AI_KEY' },
  { name: 'fal', fn: generateImageFal, key: 'FAL_KEY' },
  { name: 'replicate', fn: generateImageReplicate, key: 'REPLICATE_API_TOKEN' },
];

const VIDEO_PROVIDERS = [
  { name: 'grok', fn: generateVideoGrok, poll: pollVideoGrok, key: 'XAI_API_KEY' },
  { name: 'veo', fn: generateVideoVeo, poll: null, key: 'GOOGLE_AI_KEY' },
  { name: 'fal', fn: generateVideoFal, poll: null, key: 'FAL_KEY' },
  { name: 'replicate', fn: generateVideoReplicate, poll: null, key: 'REPLICATE_API_TOKEN' },
];

/**
 * Generate an image with automatic failover
 */
export async function generateImage(prompt, options = {}) {
  for (const provider of IMAGE_PROVIDERS) {
    const apiKey = process.env[provider.key];
    if (!apiKey) {
      console.log(`  ⏭️  ${provider.name}: No API key, skipping`);
      continue;
    }

    try {
      console.log(`  🎨 ${provider.name}: Generating image...`);
      const result = await provider.fn(prompt, apiKey, options);
      console.log(`  ✅ ${provider.name}: Image generated`);
      return { ...result, provider: provider.name };
    } catch (err) {
      console.log(`  ❌ ${provider.name}: ${err.message}`);
    }
  }
  throw new Error('All image providers failed');
}

/**
 * Generate a video from an image with automatic failover
 */
export async function generateVideo(imageUrl, prompt, options = {}) {
  for (const provider of VIDEO_PROVIDERS) {
    const apiKey = process.env[provider.key];
    if (!apiKey) {
      console.log(`  ⏭️  ${provider.name}: No API key, skipping`);
      continue;
    }

    try {
      console.log(`  🎥 ${provider.name}: Submitting video generation...`);
      const result = await provider.fn(imageUrl, prompt, apiKey, options);
      console.log(`  ✅ ${provider.name}: Video ready`);
      return { ...result, provider: provider.name };
    } catch (err) {
      console.log(`  ❌ ${provider.name}: ${err.message}`);
    }
  }
  throw new Error('All video providers failed');
}

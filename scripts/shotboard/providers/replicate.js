/**
 * Replicate Provider — FLUX 2 Schnell (images) + Wan 2.2 (video)
 * Last-resort fallback provider
 */

const REPLICATE_BASE = 'https://api.replicate.com/v1';

/**
 * Generate image via FLUX 2 Schnell on Replicate
 */
export async function generateImageReplicate(prompt, apiKey, options = {}) {
  const resp = await fetch(`${REPLICATE_BASE}/predictions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'black-forest-labs/flux-2-schnell',
      input: {
        prompt,
        aspect_ratio: '9:16',
        num_outputs: 1,
      },
    }),
    signal: AbortSignal.timeout(15000),
  });

  const data = await resp.json();
  if (!data.id) throw new Error(`Replicate submit failed: ${JSON.stringify(data).slice(0, 200)}`);

  // Poll
  return pollReplicate(data.id, apiKey, 'image');
}

/**
 * Generate video via Wan 2.2 on Replicate
 */
export async function generateVideoReplicate(imageUrl, prompt, apiKey, options = {}) {
  const resp = await fetch(`${REPLICATE_BASE}/predictions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'wan-2.2',
      input: {
        image: imageUrl,
        prompt,
        num_frames: (options.duration || 10) * 30,
      },
    }),
    signal: AbortSignal.timeout(15000),
  });

  const data = await resp.json();
  if (!data.id) throw new Error(`Replicate submit failed: ${JSON.stringify(data).slice(0, 200)}`);

  return pollReplicate(data.id, apiKey, 'video');
}

async function pollReplicate(predictionId, apiKey, type, maxPolls = 120) {
  for (let i = 0; i < maxPolls; i++) {
    const resp = await fetch(`${REPLICATE_BASE}/predictions/${predictionId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    const data = await resp.json();

    if (data.status === 'succeeded') {
      const output = Array.isArray(data.output) ? data.output[0] : data.output;
      return { url: output, type: 'url' };
    }
    if (data.status === 'failed') throw new Error(`Replicate ${type} failed: ${data.error}`);

    process.stdout.write(`  ⏳ Replicate poll ${i + 1}/${maxPolls}\r`);
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error(`Replicate ${type} timed out`);
}

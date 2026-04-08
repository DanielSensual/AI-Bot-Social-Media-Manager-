/**
 * fal.ai Provider — FLUX 2 (images) + Wan 2.2 (video)
 */

/**
 * Generate image via FLUX 2 on fal.ai
 */
export async function generateImageFal(prompt, apiKey, options = {}) {
  const resp = await fetch('https://fal.run/fal-ai/flux-2/dev', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      image_size: { width: 1080, height: 1920 },
      num_images: 1,
    }),
    signal: AbortSignal.timeout(30000),
  });

  const data = await resp.json();

  if (data.images?.[0]?.url) {
    return { url: data.images[0].url, type: 'url' };
  }

  throw new Error(`fal image failed: ${JSON.stringify(data).slice(0, 200)}`);
}

/**
 * Generate video via Wan 2.2 image-to-video on fal.ai
 */
export async function generateVideoFal(imageUrl, prompt, apiKey, options = {}) {
  // Submit
  const resp = await fetch('https://fal.run/fal-ai/wan-2.2/image-to-video', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_url: imageUrl,
      prompt,
      num_frames: (options.duration || 10) * 30, // 30fps
      aspect_ratio: '9:16',
    }),
    signal: AbortSignal.timeout(120000), // 2 min timeout for sync mode
  });

  const data = await resp.json();

  if (data.video?.url) {
    return { url: data.video.url, type: 'url' };
  }

  // fal.ai may return a request_id for async
  if (data.request_id) {
    return pollFalVideo(data.request_id, apiKey);
  }

  throw new Error(`fal video failed: ${JSON.stringify(data).slice(0, 200)}`);
}

async function pollFalVideo(requestId, apiKey, maxPolls = 60) {
  for (let i = 0; i < maxPolls; i++) {
    const resp = await fetch(`https://fal.run/fal-ai/wan-2.2/image-to-video/requests/${requestId}/status`, {
      headers: { 'Authorization': `Key ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    const data = await resp.json();

    if (data.status === 'COMPLETED' && data.response?.video?.url) {
      return { url: data.response.video.url, type: 'url' };
    }
    if (data.status === 'FAILED') throw new Error('fal video failed');

    process.stdout.write(`  ⏳ fal poll ${i + 1}/${maxPolls}\r`);
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('fal video timed out');
}

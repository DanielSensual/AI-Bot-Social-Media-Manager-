/**
 * xAI Grok Provider — Image Pro + Imagine Video
 */

const XAI_BASE = 'https://api.x.ai/v1';
const CATBOX_API = 'https://catbox.moe/user/api.php';

/**
 * Upload a local file to Catbox for a public URL
 */
export async function uploadToCatbox(filePath) {
  const fs = await import('fs');
  const FormData = (await import('node:buffer')).FormData || globalThis.FormData;

  // Use curl as FormData can be tricky in Node
  const { execSync } = await import('child_process');
  const url = execSync(
    `curl -s -F "reqtype=fileupload" -F "fileToUpload=@${filePath}" ${CATBOX_API}`,
    { encoding: 'utf-8' }
  ).trim();

  if (!url.startsWith('https://')) throw new Error(`Catbox upload failed: ${url}`);
  return url;
}

/**
 * Generate image via Grok Imagine Image Pro
 */
export async function generateImageGrok(prompt, apiKey, options = {}) {
  const resp = await fetch(`${XAI_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-imagine-image-pro',
      prompt,
      n: 1,
      response_format: 'url',
    }),
    signal: AbortSignal.timeout(30000),
  });

  const data = await resp.json();

  if (data.data?.[0]?.url) {
    return { url: data.data[0].url, type: 'url' };
  }

  if (data.data?.[0]?.b64_json) {
    return { b64: data.data[0].b64_json, type: 'b64' };
  }

  throw new Error(JSON.stringify(data));
}

/**
 * Generate video via Grok Imagine Video (image-to-video)
 */
export async function generateVideoGrok(imageUrl, prompt, apiKey, options = {}) {
  const resp = await fetch(`${XAI_BASE}/videos/generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-imagine-video',
      prompt,
      image_url: imageUrl,
      duration: options.duration || 10,
      aspect_ratio: options.aspectRatio || '9:16',
    }),
    signal: AbortSignal.timeout(30000),
  });

  const data = await resp.json();
  if (!data.request_id) throw new Error(JSON.stringify(data));

  // Poll for completion
  return pollVideoGrok(data.request_id, apiKey);
}

/**
 * Poll Grok video generation until complete
 */
export async function pollVideoGrok(requestId, apiKey, maxPolls = 60) {
  for (let i = 0; i < maxPolls; i++) {
    const resp = await fetch(`${XAI_BASE}/videos/${requestId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });

    const data = await resp.json();

    if (data.video?.url) {
      return { url: data.video.url, type: 'url' };
    }

    if (data.status === 'failed') {
      throw new Error(`Video generation failed: ${JSON.stringify(data)}`);
    }

    process.stdout.write(`  ⏳ Poll ${i + 1}/${maxPolls}\r`);
    await new Promise(r => setTimeout(r, 3000));
  }

  throw new Error('Video generation timed out');
}

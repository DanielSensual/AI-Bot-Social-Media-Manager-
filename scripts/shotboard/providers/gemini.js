/**
 * Google Gemini 3 Pro (Nano Banana Pro) + Veo 3.1 Provider
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Generate image via Gemini 3 Pro Image (Nano Banana Pro)
 */
export async function generateImageGemini(prompt, apiKey, options = {}) {
  const resp = await fetch(
    `${GEMINI_BASE}/models/gemini-3-pro-image:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `Generate a high-quality 9:16 vertical image: ${prompt}` }]
        }],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          imageSizeHint: { aspectRatio: '9:16' },
        },
      }),
      signal: AbortSignal.timeout(30000),
    }
  );

  const data = await resp.json();

  // Extract image from response parts
  const parts = data.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));

  if (imgPart) {
    return { b64: imgPart.inlineData.data, mimeType: imgPart.inlineData.mimeType, type: 'b64' };
  }

  throw new Error(`Gemini image generation failed: ${JSON.stringify(data).slice(0, 200)}`);
}

/**
 * Generate video via Veo 3.1
 */
export async function generateVideoVeo(imageUrl, prompt, apiKey, options = {}) {
  // Step 1: Submit generation
  const resp = await fetch(
    `${GEMINI_BASE}/models/veo-3.1-generate-preview:generateVideo?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { fileData: { mimeType: 'image/png', fileUri: imageUrl } },
          ]
        }],
        generationConfig: {
          aspectRatio: '9:16',
          numberOfVideos: 1,
        },
      }),
      signal: AbortSignal.timeout(30000),
    }
  );

  const data = await resp.json();
  const opName = data.name;

  if (!opName) throw new Error(`Veo submit failed: ${JSON.stringify(data).slice(0, 200)}`);

  // Step 2: Poll operation
  for (let i = 0; i < 60; i++) {
    const pollResp = await fetch(
      `${GEMINI_BASE}/operations/${opName}?key=${apiKey}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const pollData = await pollResp.json();

    if (pollData.done) {
      const video = pollData.response?.generatedVideos?.[0];
      if (video?.video?.uri) {
        return { url: video.video.uri, type: 'url' };
      }
      throw new Error(`Veo completed but no video: ${JSON.stringify(pollData).slice(0, 200)}`);
    }

    process.stdout.write(`  ⏳ Veo poll ${i + 1}/60\r`);
    await new Promise(r => setTimeout(r, 5000));
  }

  throw new Error('Veo generation timed out');
}

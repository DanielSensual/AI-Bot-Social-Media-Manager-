/**
 * QA Vision Agent — GPT-5.4 Vision
 * 
 * Analyzes generated video clips by extracting frames
 * and running them through vision QA to ensure quality
 * and rule compliance.
 */

import OpenAI from 'openai';
import { execSync } from 'child_process';
import { readFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const QA_SYSTEM = `You are a Quality Assurance agent for AI-generated video content.
You analyze frames extracted from video clips to check for quality and compliance.

CHARACTER MODEL:
Beautiful white American blonde female DJ, early 20s.
White crop top, black leather shorts, headphones around neck.
Pioneer turntables. Mouth closed or slight confident smile ONLY.

CRITICAL REJECTION CRITERIA (auto-fail):
- Character appears to be singing (mouth open wide, lip-sync motion)
- Character is talking or speaking
- Wrong character (not matching the blonde DJ model)
- Severe visual artifacts (melted faces, extra limbs, deformed hands)
- Text or watermarks visible on screen
- Completely wrong scene (not matching the shot description)

WARNING CRITERIA (pass with notes):
- Minor hand deformation (common in AI video)
- Slight inconsistency in outfit details
- Background dancers not perfectly consistent
- Lighting doesn't perfectly match description

PASS CRITERIA:
- Character matches model description
- No singing/talking detected
- Scene matches shot description
- Acceptable visual quality
- Camera movement present

Return JSON: { "pass": true/false, "score": 0-100, "issues": [], "notes": "" }`;

/**
 * Extract frames from a video clip for QA analysis
 */
function extractFrames(videoPath, numFrames = 6) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'shotboard-qa-'));

  try {
    // Get video duration
    const dur = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`,
      { encoding: 'utf-8' }
    ).trim();
    const duration = parseFloat(dur);

    // Extract evenly spaced frames
    const interval = Math.max(1, Math.floor(duration / numFrames));
    execSync(
      `ffmpeg -y -i "${videoPath}" -vf "fps=1/${interval}" -q:v 2 "${tmpDir}/frame_%02d.jpg" 2>/dev/null`
    );

    // Read frames as base64
    const frames = [];
    for (let i = 1; i <= numFrames; i++) {
      const framePath = join(tmpDir, `frame_${String(i).padStart(2, '0')}.jpg`);
      try {
        const data = readFileSync(framePath);
        frames.push({
          path: framePath,
          b64: data.toString('base64'),
        });
      } catch {
        // Fewer frames than expected
        break;
      }
    }

    return { frames, tmpDir };
  } catch (err) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }
}

/**
 * Run QA analysis on a video clip
 */
export async function analyzeClip(videoPath, shotDescription, options = {}) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const { frames, tmpDir } = extractFrames(videoPath, options.numFrames || 6);

  try {
    if (frames.length === 0) {
      return { pass: false, score: 0, issues: ['No frames extracted'], notes: 'File may be corrupt' };
    }

    // Build message with all frames
    const imageContent = frames.map((f, i) => ({
      type: 'image_url',
      image_url: {
        url: `data:image/jpeg;base64,${f.b64}`,
        detail: 'high',
      },
    }));

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_VISION_MODEL || 'gpt-5.4',
      messages: [
        { role: 'system', content: QA_SYSTEM },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze these ${frames.length} frames from a video clip.

SHOT DESCRIPTION: ${shotDescription}

Check for:
1. Does the character match the DJ model (blonde, white top, shorts)?
2. Is the character singing or has mouth open? (CRITICAL - auto reject)
3. Visual quality — artifacts, deformations, text on screen?
4. Does the scene match the shot description?
5. Is there camera movement visible across frames?

Return JSON: { "pass": true/false, "score": 0-100, "issues": [], "notes": "" }`,
            },
            ...imageContent,
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 500,
    });

    const result = JSON.parse(response.choices[0].message.content);
    return result;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Batch QA — analyze multiple clips
 */
export async function batchQA(clips, shotBoard) {
  const results = [];

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const shot = shotBoard.shots[i];

    console.log(`  👁️  QA analyzing clip ${i + 1}/${clips.length}...`);

    try {
      const result = await analyzeClip(clip.path, shot.prompt);
      results.push({
        shotId: shot.id,
        clipPath: clip.path,
        ...result,
      });

      const icon = result.pass ? '✅' : '❌';
      console.log(`  ${icon} Shot ${shot.id}: score ${result.score}/100 ${result.issues.length > 0 ? '— ' + result.issues.join(', ') : ''}`);
    } catch (err) {
      console.log(`  ❌ Shot ${shot.id}: QA failed — ${err.message}`);
      results.push({
        shotId: shot.id,
        clipPath: clip.path,
        pass: false,
        score: 0,
        issues: [`QA error: ${err.message}`],
        notes: '',
      });
    }
  }

  return results;
}

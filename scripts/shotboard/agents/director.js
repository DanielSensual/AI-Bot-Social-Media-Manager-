/**
 * Director Agent — GPT-5.4 Thinking
 * 
 * Takes a creative brief and generates a shot board with
 * narrative arc, camera directions, and location variety.
 */

import OpenAI from 'openai';

const CHARACTER_MODEL = `Beautiful white American blonde female DJ, early 20s.
White crop top, black leather shorts, headphones around neck.
Pioneer CDJ turntables and DJ mixer as her equipment.
Expression: confident smile, nodding to beat. NEVER singing, NEVER speaking, mouth closed or slight smile.
Hair: blonde ponytail or loose waves. Build: athletic, toned.`;

const LOCATIONS = [
  'NYC rooftop with skyline at night',
  'London rooftop with Tower Bridge in background',
  'Tropical island beach club at sunset',
  'Tokyo neon-lit alley pop-up party',
  'Miami Art Deco poolside party',
  'Paris with Eiffel Tower lit up at night',
  'Dubai skyscraper rooftop with fountain views',
  'Barcelona Gothic Quarter outdoor party',
  'Santorini cliffside white-and-blue sunset set',
  'Havana vintage car-lined colorful street party',
];

const CAMERA_MOVEMENTS = [
  'slow_zoom_in', 'smooth_pan_left', 'smooth_pan_right',
  'orbit_right', 'orbit_left', 'dramatic_push_forward',
  'crane_up', 'crane_down', 'dolly_back',
  'steady_front', 'tracking_left', 'tracking_right',
];

const SHOT_TYPES = [
  { type: 'establishing', angle: 'front_wide', desc: 'Wide establishing shot showing the full scene' },
  { type: 'detail', angle: 'side_profile', desc: 'Side profile showing her working the equipment' },
  { type: 'atmosphere', angle: 'over_shoulder', desc: 'Over-the-shoulder showing the crowd/environment' },
  { type: 'power', angle: 'low_angle', desc: 'Low angle power shot, dramatic and climactic' },
  { type: 'intimate', angle: 'close_up', desc: 'Close-up of hands on mixer, face details' },
  { type: 'environment', angle: 'bird_eye', desc: 'High angle showing the full party layout' },
];

const SYSTEM_PROMPT = `You are a Creative Director for premium music video content.
You create detailed shot boards for AI-generated video reels.

CHARACTER MODEL (use in EVERY shot prompt):
${CHARACTER_MODEL}

ABSOLUTE RULES:
1. The character NEVER SINGS. Mouth closed or confident slight smile ONLY.
2. NO lip-syncing, NO mouth movement, NO talking.
3. Every prompt must include "mouth closed" or "slight confident smile".
4. Every prompt must include "NEVER singing or speaking" in the avoid section.
5. Use IMAGE-TO-VIDEO friendly descriptions — static-to-motion. Describe the starting frame, then what moves.
6. Camera movements must be specific: "slow zoom in", "orbit right", "pan left" — not vague.
7. Vary locations for world-tour feel. Never repeat a location.
8. Build energy across shots — start calm, end dramatic/climactic.

OUTPUT FORMAT: Return ONLY valid JSON matching the shot board schema.`;

export async function generateShotBoard(brief, options = {}) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const numShots = options.numShots || 4;
  const targetDuration = options.targetDuration || 45;

  const userPrompt = `Create a ${numShots}-shot video reel shot board for:
"${brief}"

Target duration: ${targetDuration} seconds
Available locations (pick ${numShots} different ones): ${LOCATIONS.join(', ')}
Available camera movements: ${CAMERA_MOVEMENTS.join(', ')}
Shot types to use: ${SHOT_TYPES.map(s => s.type).join(', ')}

For each shot, provide:
- id, order, type, location, angle, camera_movement, duration (total should equal ~${targetDuration}s)
- A detailed prompt (80+ words) describing the scene with the DJ character model
- An "avoid" field listing things to NOT generate
- Each prompt MUST mention "mouth closed" or "slight confident smile"

Return JSON format:
{
  "title": "...",
  "narrative": "brief story arc description",
  "shots": [{ id, order, type, location, angle, camera_movement, duration, prompt, avoid }]
}`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_VISION_MODEL || 'gpt-5.2-thinking',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.9, // Creative freedom
  });

  const content = response.choices[0].message.content;
  const shotBoard = JSON.parse(content);

  // Enforce hard rules — double-check AI output
  for (const shot of shotBoard.shots) {
    if (!shot.avoid) shot.avoid = '';
    if (!shot.avoid.includes('singing')) {
      shot.avoid += ', singing, talking, lip movement, mouth open';
    }
    shot.status = 'pending';
    shot.qa_score = null;
    shot.provider = null;
  }

  return {
    version: '2.0',
    project: {
      title: shotBoard.title || brief,
      brand: 'Daniel Sensual',
      target_duration: targetDuration,
      style: 'cinematic, neon-lit, luxury nightlife',
      narrative: shotBoard.narrative || '',
    },
    character: {
      name: 'DJ Girl',
      description: CHARACTER_MODEL,
      rules: [
        'NEVER singing or speaking',
        'NEVER lip-syncing',
        'Mouth closed or slight confident smile',
        'Always behind DJ equipment or near music setup',
        'Expression: confident, in the zone, vibing to the beat',
      ],
    },
    shots: shotBoard.shots,
    assembly: {
      transition: 'hard_cut',
      audio_rule: 'MUTE_ALL_CLIP_AUDIO',
      resolution: '1080x1920',
      fps: 30,
      codec: 'h264',
      crf: 18,
      keyframe_interval: 30,
    },
  };
}

export { CHARACTER_MODEL, LOCATIONS, CAMERA_MOVEMENTS, SHOT_TYPES };

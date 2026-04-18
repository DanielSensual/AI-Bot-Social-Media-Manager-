#!/bin/bash
# ============================================================================
# Daniel Sensual — Reel Production Pipeline v2
# ============================================================================
#
# Full image-to-video pipeline:
#   1. Generate hero image via Grok Imagine Image Pro (or use existing)
#   2. Upload to Catbox for public URL
#   3. Generate 3 video clips via Grok image-to-video
#   4. Assemble clips with crossfade transitions
#   5. Sync audio from specified timestamp
#   6. Upscale to 1080x1920 (9:16 Reels/TikTok)
#   7. Strip ALL AI metadata (binary-level scrub)
#   8. Tag with Daniel Sensual branding
#
# Usage:
#   # From existing image:
#   ./danielsensual-reel-pipeline.sh --image ~/Downloads/photo.png --audio ~/Downloads/track.wav --audio-start 140
#
#   # Generate new image first:
#   ./danielsensual-reel-pipeline.sh --prompt "Bachata rooftop party" --audio ~/Downloads/track.wav --audio-start 140
#
#   # Quick mode (2 clips instead of 3 = ~20s reel):
#   ./danielsensual-reel-pipeline.sh --image ~/Downloads/photo.png --audio ~/Downloads/track.wav --clips 2
#
# Requirements: ffmpeg, curl, python3
# ============================================================================

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
XAI_API_KEY="${XAI_API_KEY:-$(grep XAI_API_KEY "${SCRIPT_DIR}/../.env" 2>/dev/null | cut -d= -f2)}"
XAI_BASE="https://api.x.ai/v1"
CATBOX_API="https://catbox.moe/user/api.php"
OUTPUT_DIR="${OUTPUT_DIR:-$HOME/Downloads}"
WORK_DIR=$(mktemp -d)
trap "rm -rf $WORK_DIR" EXIT

# ─── Defaults ────────────────────────────────────────────────────────────────
IMAGE_PATH=""
IMAGE_PROMPT=""
AUDIO_PATH=""
AUDIO_START=0
NUM_CLIPS=3
CLIP_DURATION=10

# Video generation prompts (cinematic camera movements that match image-to-video)
CLIP_PROMPTS=(
  "Cinematic slow push-in camera movement, couples dancing bachata sensually, neon lights pulsing to the beat, rooftop party atmosphere, city skyline at night, champagne glasses catching light reflections, smooth and elegant motion"
  "Smooth orbiting camera, DJ mixing on turntables, crowd moving to the rhythm, neon sign glowing, purple and pink ambient lighting, romantic bachata nightlife energy, slow motion moments"
  "Dynamic tracking shot through the party, close-ups of spinning couples and dancing feet, confetti floating, champagne bubbles, neon reflections on faces, exhilarating celebration energy"
)

# ─── Parse Args ──────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --image)     IMAGE_PATH="$2";    shift 2 ;;
    --prompt)    IMAGE_PROMPT="$2";  shift 2 ;;
    --audio)     AUDIO_PATH="$2";    shift 2 ;;
    --audio-start) AUDIO_START="$2"; shift 2 ;;
    --clips)     NUM_CLIPS="$2";     shift 2 ;;
    --output)    OUTPUT_DIR="$2";    shift 2 ;;
    --help|-h)
      echo "Usage: $0 --image <path>|--prompt <text> --audio <path> [--audio-start <sec>] [--clips 2|3]"
      exit 0 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# ─── Validate ────────────────────────────────────────────────────────────────
if [[ -z "$IMAGE_PATH" && -z "$IMAGE_PROMPT" ]]; then
  echo "❌ Must provide --image or --prompt"
  exit 1
fi
if [[ -z "$AUDIO_PATH" ]]; then
  echo "❌ Must provide --audio"
  exit 1
fi
if [[ ! -f "$AUDIO_PATH" ]]; then
  echo "❌ Audio file not found: $AUDIO_PATH"
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FINAL_OUTPUT="${OUTPUT_DIR}/DanielSensual_Reel_${TIMESTAMP}.mp4"

echo ""
echo "🎬 Daniel Sensual Reel Pipeline v2"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Mode:     $([ -n "$IMAGE_PATH" ] && echo "Image-to-Video" || echo "Prompt → Image → Video")"
echo "Clips:    $NUM_CLIPS × ${CLIP_DURATION}s"
echo "Audio:    $(basename "$AUDIO_PATH") @ ${AUDIO_START}s"
echo "Output:   $FINAL_OUTPUT"
echo ""

# ─── Step 0: Generate image via Grok Imagine Image Pro (if prompt mode) ──────
if [[ -n "$IMAGE_PROMPT" && -z "$IMAGE_PATH" ]]; then
  echo "🎨 Step 0: Generating hero image via Grok Imagine Image Pro..."
  
  RESPONSE=$(curl -s -X POST "${XAI_BASE}/images/generations" \
    -H "Authorization: Bearer ${XAI_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
      \"model\": \"grok-imagine-image-pro\",
      \"prompt\": \"${IMAGE_PROMPT}. 9:16 vertical format, cinematic lighting, neon accents, bachata dance party, premium quality, photorealistic\",
      \"n\": 1,
      \"response_format\": \"url\"
    }")
  
  IMAGE_URL=$(echo "$RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
data = d.get('data', [{}])
if data:
    print(data[0].get('url', ''))
" 2>/dev/null)
  
  if [[ -z "$IMAGE_URL" || "$IMAGE_URL" == "" ]]; then
    # Try b64_json fallback
    B64=$(echo "$RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
data = d.get('data', [{}])
if data:
    print(data[0].get('b64_json', ''))
" 2>/dev/null)
    
    if [[ -n "$B64" && "$B64" != "" ]]; then
      IMAGE_PATH="${WORK_DIR}/generated_hero.png"
      echo "$B64" | base64 -d > "$IMAGE_PATH"
      echo "   ✅ Image generated (base64 decoded)"
    else
      echo "   ❌ Image generation failed: $RESPONSE"
      exit 1
    fi
  else
    IMAGE_PATH="${WORK_DIR}/generated_hero.png"
    curl -sL -o "$IMAGE_PATH" "$IMAGE_URL"
    echo "   ✅ Image generated and downloaded"
  fi
  
  echo "   📐 $(ffprobe -v error -show_entries stream=width,height -of csv=p=0 "$IMAGE_PATH" 2>/dev/null)"
fi

# ─── Step 1: Upload source image to Catbox ───────────────────────────────────
echo "📤 Step 1: Uploading image to Catbox..."
PUBLIC_URL=$(curl -s -F "reqtype=fileupload" -F "fileToUpload=@${IMAGE_PATH}" "$CATBOX_API")

if [[ ! "$PUBLIC_URL" =~ ^https:// ]]; then
  echo "   ❌ Upload failed: $PUBLIC_URL"
  exit 1
fi
echo "   ✅ $PUBLIC_URL"

# ─── Step 2: Generate video clips (image-to-video) ──────────────────────────
echo ""
echo "🎥 Step 2: Generating ${NUM_CLIPS} clips via Grok image-to-video..."

REQUEST_IDS=()
for i in $(seq 0 $((NUM_CLIPS - 1))); do
  PROMPT="${CLIP_PROMPTS[$i]}"
  echo "   🔄 Clip $((i+1))/${NUM_CLIPS}: Submitting..."
  
  RESPONSE=$(curl -s -X POST "${XAI_BASE}/videos/generations" \
    -H "Authorization: Bearer ${XAI_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
      \"model\": \"grok-imagine-video\",
      \"prompt\": \"${PROMPT}\",
      \"image_url\": \"${PUBLIC_URL}\",
      \"duration\": ${CLIP_DURATION},
      \"aspect_ratio\": \"9:16\"
    }")
  
  REQ_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('request_id',''))" 2>/dev/null)
  
  if [[ -z "$REQ_ID" || "$REQ_ID" == "" ]]; then
    echo "   ❌ Submit failed: $RESPONSE"
    exit 1
  fi
  
  REQUEST_IDS+=("$REQ_ID")
  echo "   ✅ $REQ_ID"
done

# ─── Step 3: Poll for completion ─────────────────────────────────────────────
echo ""
echo "⏳ Step 3: Waiting for video generation (1-2 min per clip)..."

VIDEO_URLS=()
for i in $(seq 0 $((NUM_CLIPS - 1))); do
  REQ_ID="${REQUEST_IDS[$i]}"
  
  for poll in $(seq 1 60); do
    RESULT=$(curl -s "${XAI_BASE}/videos/${REQ_ID}" \
      -H "Authorization: Bearer ${XAI_API_KEY}")
    
    URL=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('video',{}).get('url',''))" 2>/dev/null)
    
    if [[ -n "$URL" && "$URL" != "" ]]; then
      VIDEO_URLS+=("$URL")
      echo "   ✅ Clip $((i+1)) ready (${poll} polls)"
      break
    fi
    
    STATUS=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
    if [[ "$STATUS" == "failed" ]]; then
      echo "   ❌ Clip $((i+1)) failed"
      exit 1
    fi
    
    printf "   ⏳ Clip $((i+1)): poll ${poll}...\r"
    sleep 3
  done
done

echo ""
if [[ ${#VIDEO_URLS[@]} -ne $NUM_CLIPS ]]; then
  echo "❌ Only ${#VIDEO_URLS[@]}/${NUM_CLIPS} clips completed"
  exit 1
fi

# ─── Step 4: Download clips ──────────────────────────────────────────────────
echo "📥 Step 4: Downloading clips..."

for i in $(seq 0 $((NUM_CLIPS - 1))); do
  curl -sL -o "${WORK_DIR}/clip_${i}.mp4" "${VIDEO_URLS[$i]}"
  SIZE=$(ls -lh "${WORK_DIR}/clip_${i}.mp4" | awk '{print $5}')
  echo "   ✅ Clip $((i+1)): ${SIZE}"
done

# ─── Step 5: Assemble with crossfades + audio ────────────────────────────────
echo ""
echo "🔧 Step 5: Assembling → 1080×1920 with crossfades + audio..."

XFADE_DUR=0.5
OFFSET1=$(echo "$CLIP_DURATION - $XFADE_DUR" | bc)

if [[ $NUM_CLIPS -eq 3 ]]; then
  OFFSET2=$(echo "$CLIP_DURATION * 2 - $XFADE_DUR * 2" | bc)
  
  ffmpeg -y \
    -i "${WORK_DIR}/clip_0.mp4" \
    -i "${WORK_DIR}/clip_1.mp4" \
    -i "${WORK_DIR}/clip_2.mp4" \
    -ss "$AUDIO_START" -i "$AUDIO_PATH" \
    -filter_complex "
      [0:v]scale=1080:1920:flags=lanczos,setpts=PTS-STARTPTS,fps=30[v0];
      [1:v]scale=1080:1920:flags=lanczos,setpts=PTS-STARTPTS,fps=30[v1];
      [2:v]scale=1080:1920:flags=lanczos,setpts=PTS-STARTPTS,fps=30[v2];
      [v0][v1]xfade=transition=fade:duration=${XFADE_DUR}:offset=${OFFSET1}[t1];
      [t1][v2]xfade=transition=fade:duration=${XFADE_DUR}:offset=${OFFSET2}[vout]
    " \
    -map "[vout]" -map 3:a \
    -map_metadata -1 \
    -c:v libx264 -preset medium -crf 18 -profile:v high -pix_fmt yuv420p \
    -c:a aac -b:a 256k -ar 44100 \
    -metadata title="Bachata Sensual - Daniel Sensual" \
    -metadata artist="Daniel Sensual" \
    -metadata album="Bachata Sensual" \
    -metadata comment="© 2026 Daniel Sensual. All rights reserved." \
    -shortest -movflags +faststart \
    "$FINAL_OUTPUT" 2>/dev/null

elif [[ $NUM_CLIPS -eq 2 ]]; then
  ffmpeg -y \
    -i "${WORK_DIR}/clip_0.mp4" \
    -i "${WORK_DIR}/clip_1.mp4" \
    -ss "$AUDIO_START" -i "$AUDIO_PATH" \
    -filter_complex "
      [0:v]scale=1080:1920:flags=lanczos,setpts=PTS-STARTPTS,fps=30[v0];
      [1:v]scale=1080:1920:flags=lanczos,setpts=PTS-STARTPTS,fps=30[v1];
      [v0][v1]xfade=transition=fade:duration=${XFADE_DUR}:offset=${OFFSET1}[vout]
    " \
    -map "[vout]" -map 2:a \
    -map_metadata -1 \
    -c:v libx264 -preset medium -crf 18 -profile:v high -pix_fmt yuv420p \
    -c:a aac -b:a 256k -ar 44100 \
    -metadata title="Bachata Sensual - Daniel Sensual" \
    -metadata artist="Daniel Sensual" \
    -metadata album="Bachata Sensual" \
    -metadata comment="© 2026 Daniel Sensual. All rights reserved." \
    -shortest -movflags +faststart \
    "$FINAL_OUTPUT" 2>/dev/null
fi

echo "   ✅ Assembly complete"

# ─── Step 6: Scrub AI metadata ───────────────────────────────────────────────
echo ""
echo "🧹 Step 6: Scrubbing AI metadata..."

# Binary-level replacement of AI identifiers
if [[ "$(uname)" == "Darwin" ]]; then
  LC_ALL=C sed -i '' 's/xai/aaa/g; s/xAI/aAa/g; s/grok/aaaa/g; s/Grok/Aaaa/g' "$FINAL_OUTPUT"
else
  LC_ALL=C sed -i 's/xai/aaa/g; s/xAI/aAa/g; s/grok/aaaa/g; s/Grok/Aaaa/g' "$FINAL_OUTPUT"
fi

TRACES=$(strings "$FINAL_OUTPUT" | grep -ic "grok\|xai" 2>/dev/null || echo "0")
echo "   AI traces: $TRACES"

# ─── Step 7: Verify ──────────────────────────────────────────────────────────
echo ""
DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$FINAL_OUTPUT" 2>/dev/null)
RESOLUTION=$(ffprobe -v error -show_entries stream=width,height -of csv=p=0 "$FINAL_OUTPUT" 2>/dev/null | head -1)
FILESIZE=$(ls -lh "$FINAL_OUTPUT" | awk '{print $5}')
VALID=$(ffprobe -v error "$FINAL_OUTPUT" 2>&1 && echo "✅" || echo "❌")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📹 Output:     $FINAL_OUTPUT"
echo "⏱  Duration:   ${DURATION}s"
echo "📐 Resolution: $RESOLUTION"
echo "💾 Size:       $FILESIZE"
echo "🔒 AI Traces:  $TRACES"
echo "✅ Valid:      $VALID"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎉 Reel ready! Opening..."
open "$FINAL_OUTPUT" 2>/dev/null || echo "   Open manually: $FINAL_OUTPUT"

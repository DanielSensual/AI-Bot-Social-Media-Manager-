#!/bin/bash
# ══════════════════════════════════════════════════════════════
# HEVC 10-bit Batch Transcoder — MediaGeekz
# ══════════════════════════════════════════════════════════════
# Converts Sony XAVC-I / S-Log footage to H.265 10-bit HEVC
# Preserves S-Log gamma for downstream color grading
# Uses Apple VideoToolbox hardware encoding (fast, cool)
#
# Usage:
#   ./scripts/hevc-transcode.sh /path/to/source/footage /path/to/output
#
# Example:
#   ./scripts/hevc-transcode.sh "/Volumes/SonyDrive/PRIVATE/M4ROOT/CLIP" "./paola-hevc-output"
#
# Notes:
#   - S-Log color is PRESERVED (no baked LUT) — editors can still grade
#   - 10-bit depth maintained for maximum color fidelity
#   - Audio copied as-is (no re-encode)
#   - Original timecode preserved
#   - ~3-5x smaller than XAVC-I source files
# ══════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────
BITRATE="${HEVC_BITRATE:-50M}"        # 50Mbps = high quality for grading. Adjust down for smaller files.
AUDIO_CODEC="copy"                     # Copy audio as-is (no re-encode)
CONTAINER="mov"                        # .mov for Apple/FCP compatibility
ENCODER="hevc_videotoolbox"            # Hardware encoder (Mac)
PROFILE="main10"                       # 10-bit color depth
TAG="hvc1"                             # Apple QuickTime compatibility tag

# ─── Args ────────────────────────────────────────────────────
SOURCE_DIR="${1:-}"
OUTPUT_DIR="${2:-}"

if [[ -z "$SOURCE_DIR" || -z "$OUTPUT_DIR" ]]; then
    echo ""
    echo "📹 HEVC 10-bit Batch Transcoder"
    echo "════════════════════════════════"
    echo ""
    echo "Usage: $0 <source_folder> <output_folder>"
    echo ""
    echo "Example:"
    echo "  $0 \"/Volumes/Sony/PRIVATE/M4ROOT/CLIP\" \"./paola-hevc\""
    echo ""
    echo "Environment:"
    echo "  HEVC_BITRATE=50M      Target bitrate (default: 50M)"
    echo "  HEVC_SOFTWARE=1       Force software encoding (slower, no GPU)"
    echo ""
    exit 1
fi

if [[ ! -d "$SOURCE_DIR" ]]; then
    echo "❌ Source directory not found: $SOURCE_DIR"
    exit 1
fi

# Software fallback if requested or VideoToolbox not available
if [[ "${HEVC_SOFTWARE:-0}" == "1" ]]; then
    ENCODER="libx265"
    echo "⚙️  Using software encoder (libx265) — slower but universal"
fi

mkdir -p "$OUTPUT_DIR"

# ─── Find all video files ────────────────────────────────────
VIDEO_FILES=()
while IFS= read -r -d '' file; do
    VIDEO_FILES+=("$file")
done < <(find "$SOURCE_DIR" -type f \( -iname "*.mxf" -o -iname "*.mp4" -o -iname "*.mov" -o -iname "*.avi" \) -print0 | sort -z)

TOTAL=${#VIDEO_FILES[@]}

if [[ $TOTAL -eq 0 ]]; then
    echo "❌ No video files found in: $SOURCE_DIR"
    echo "   Looking for: .mxf, .mp4, .mov, .avi"
    exit 1
fi

echo ""
echo "📹 HEVC 10-bit Batch Transcoder"
echo "════════════════════════════════════════════════"
echo "   Source:    $SOURCE_DIR"
echo "   Output:    $OUTPUT_DIR"
echo "   Files:     $TOTAL"
echo "   Encoder:   $ENCODER"
echo "   Bitrate:   $BITRATE"
echo "   Profile:   $PROFILE (10-bit)"
echo "   Container: .$CONTAINER"
echo "════════════════════════════════════════════════"
echo ""

# ─── Transcode loop ──────────────────────────────────────────
SUCCESS=0
FAILED=0
SKIPPED=0

for i in "${!VIDEO_FILES[@]}"; do
    FILE="${VIDEO_FILES[$i]}"
    FILENAME=$(basename "$FILE")
    BASENAME="${FILENAME%.*}"
    OUTPUT_FILE="$OUTPUT_DIR/${BASENAME}.${CONTAINER}"
    COUNT=$((i + 1))

    echo "─────────────────────────────────────────────"
    echo "[$COUNT/$TOTAL] $FILENAME"

    # Skip if already transcoded
    if [[ -f "$OUTPUT_FILE" ]]; then
        EXISTING_SIZE=$(stat -f%z "$OUTPUT_FILE" 2>/dev/null || echo "0")
        if [[ "$EXISTING_SIZE" -gt 1000 ]]; then
            echo "   ⏭️  Already exists, skipping"
            SKIPPED=$((SKIPPED + 1))
            continue
        fi
    fi

    # Get source file size for comparison
    SOURCE_SIZE=$(stat -f%z "$FILE" 2>/dev/null || echo "0")
    SOURCE_MB=$((SOURCE_SIZE / 1048576))
    echo "   📦 Source: ${SOURCE_MB}MB"

    # Build FFmpeg command
    FFMPEG_ARGS=(
        -i "$FILE"
        -c:v "$ENCODER"
        -profile:v "$PROFILE"
        -b:v "$BITRATE"
        -tag:v "$TAG"
        -c:a "$AUDIO_CODEC"
        -map 0                  # Copy all streams
        -movflags +faststart    # Web-friendly: moov atom at front
        -y                      # Overwrite without asking
        "$OUTPUT_FILE"
    )

    # Add x265 specific params for software encoder
    if [[ "$ENCODER" == "libx265" ]]; then
        FFMPEG_ARGS=(
            -i "$FILE"
            -c:v "$ENCODER"
            -pix_fmt yuv420p10le
            -preset medium
            -crf 18
            -tag:v "$TAG"
            -c:a "$AUDIO_CODEC"
            -map 0
            -movflags +faststart
            -y
            "$OUTPUT_FILE"
        )
    fi

    START_TIME=$(date +%s)

    if ffmpeg -hide_banner -loglevel warning -stats "${FFMPEG_ARGS[@]}"; then
        END_TIME=$(date +%s)
        ELAPSED=$((END_TIME - START_TIME))
        OUTPUT_SIZE=$(stat -f%z "$OUTPUT_FILE" 2>/dev/null || echo "0")
        OUTPUT_MB=$((OUTPUT_SIZE / 1048576))
        RATIO=$((SOURCE_SIZE / (OUTPUT_SIZE + 1)))

        echo "   ✅ Done: ${OUTPUT_MB}MB (${RATIO}x smaller) in ${ELAPSED}s"
        SUCCESS=$((SUCCESS + 1))
    else
        echo "   ❌ FAILED"
        FAILED=$((FAILED + 1))
        # Don't leave partial files
        rm -f "$OUTPUT_FILE"
    fi
done

# ─── Summary ─────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════"
echo "📹 Transcode Complete"
echo "   ✅ Success: $SUCCESS"
echo "   ⏭️  Skipped: $SKIPPED"
echo "   ❌ Failed:  $FAILED"
echo "   📁 Output:  $OUTPUT_DIR"

# Show total output size
if command -v du &>/dev/null; then
    TOTAL_SIZE=$(du -sh "$OUTPUT_DIR" 2>/dev/null | cut -f1)
    echo "   💾 Total:   $TOTAL_SIZE"
fi

echo "════════════════════════════════════════════════"
echo ""

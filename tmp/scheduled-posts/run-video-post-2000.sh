#!/bin/zsh
set -euo pipefail
cd /Users/danielcastillo/Projects/Websites/Bots/ghostai-x-bot

LOCK_DIR="tmp/scheduled-posts/2026-02-10-2000.lock"
DONE_FILE="tmp/scheduled-posts/2026-02-10-2000.done"
LOG_FILE="logs/scheduled/video-post-20260210-2000.log"

if [ -f "$DONE_FILE" ]; then
  exit 0
fi

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

node scripts/post-all-video.js \
  --video-file=assets/videos/veo3-imagine-ranking-20260210.mp4 \
  --caption-file=tmp/scheduled-posts/2026-02-10-2000-caption.txt \
  >> "$LOG_FILE" 2>&1

status=$?
if [ "$status" -eq 0 ]; then
  touch "$DONE_FILE"
fi
exit "$status"

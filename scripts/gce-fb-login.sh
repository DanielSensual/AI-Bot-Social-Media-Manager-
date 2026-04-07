#!/bin/bash
# ─── GCE Facebook Login Helper ──────────────────────────────────
# Sets up a virtual display + VNC server so you can log into Facebook
# from your local Mac through an SSH tunnel.
#
# Usage:
#   1. On your Mac, run:
#      gcloud compute ssh music-manager-bot --zone=us-east4-c -- -L 5900:localhost:5900
#
#   2. In that SSH session, run:
#      cd /opt/music-manager-bot && bash scripts/gce-fb-login.sh --profile=personal
#      cd /opt/music-manager-bot && bash scripts/gce-fb-login.sh --profile=page
#
#   3. On your Mac, open a VNC viewer:
#      open vnc://localhost:5900
#      (or use Screen Sharing app → connect to localhost:5900)
#
#   4. Log into Facebook in the browser window
#   5. Press Ctrl+C in the SSH session to stop
#   6. The session cookies are now saved — share bots will work!
# ─────────────────────────────────────────────────────────────────

set -e

PROFILE_NAME="page"
for arg in "$@"; do
    case "$arg" in
        --profile=personal|--personal)
            PROFILE_NAME="personal"
            ;;
        --profile=page|--page)
            PROFILE_NAME="page"
            ;;
        *)
            echo "Unknown argument: $arg" >&2
            echo "Usage: bash scripts/gce-fb-login.sh [--profile=page|personal]" >&2
            exit 1
            ;;
    esac
done

if [ "$PROFILE_NAME" = "personal" ]; then
    PROFILE_DIR="$HOME/.danielsensual-personal-chrome-profile"
    PROFILE_LABEL="Daniel Sensual Personal"
else
    PROFILE_DIR="$HOME/.danielsensual-chrome-profile"
    PROFILE_LABEL="Daniel Sensual Page"
fi

DISPLAY_NUM=":99"
RESOLUTION="1280x800x24"

echo ""
echo "🔐 GCE Facebook Login Helper"
echo "═══════════════════════════════════════════"
echo ""
echo "Profile: $PROFILE_LABEL"
echo "Storage: $PROFILE_DIR"
echo ""

for cmd in Xvfb x11vnc; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "❌ Missing required command: $cmd" >&2
        echo "   Install login-helper packages first:" >&2
        echo "   sudo apt-get update && sudo apt-get install -y xvfb x11vnc" >&2
        exit 1
    fi
done

# Kill any existing Xvfb or VNC
pkill -f "Xvfb $DISPLAY_NUM" 2>/dev/null || true
pkill -f x11vnc 2>/dev/null || true
sleep 1

# Start virtual display
echo "📺 Starting virtual display ($RESOLUTION)..."
Xvfb $DISPLAY_NUM -screen 0 $RESOLUTION -ac &
XVFB_PID=$!
sleep 1

export DISPLAY=$DISPLAY_NUM

# Start VNC server (no password for local-only access via SSH tunnel)
echo "🖥️  Starting VNC server on port 5900..."
x11vnc -display $DISPLAY_NUM -nopw -forever -shared -rfbport 5900 &
VNC_PID=$!
sleep 1

echo ""
echo "✅ VNC server running on localhost:5900"
echo ""
echo "📋 On your Mac, connect with:"
echo "   open vnc://localhost:5900"
echo ""
echo "🌐 Launching Chromium with Facebook login..."
echo ""

# Find Chrome/Chromium
CHROME_PATH=$(which google-chrome-stable 2>/dev/null || which google-chrome 2>/dev/null || which chromium-browser 2>/dev/null || which chromium 2>/dev/null || true)

if [ -z "$CHROME_PATH" ]; then
    echo "❌ Could not find Chrome/Chromium on this VM." >&2
    echo "   Install Google Chrome first, then rerun this helper." >&2
    exit 1
fi

# Launch Chrome headfully (visible in VNC)
$CHROME_PATH \
  --user-data-dir="$PROFILE_DIR" \
  --no-first-run \
  --no-default-browser-check \
  --disable-features=TranslateUI \
  --window-size=1280,800 \
  --window-position=0,0 \
  "https://www.facebook.com/login" &
CHROME_PID=$!

echo "🔐 Log into Facebook in the VNC window"
echo "   Once logged in, press Ctrl+C here to save and exit"
echo ""

# Wait for user to finish
trap "echo ''; echo '🛑 Stopping...'; kill $CHROME_PID 2>/dev/null; sleep 2; kill $VNC_PID 2>/dev/null; kill $XVFB_PID 2>/dev/null; echo '✅ Session saved to $PROFILE_DIR'; echo '   $PROFILE_LABEL will use this session going forward.'" EXIT

wait $CHROME_PID 2>/dev/null || true

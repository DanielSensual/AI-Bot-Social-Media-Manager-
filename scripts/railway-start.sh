#!/bin/bash
# ==============================================================================
# Railway Startup Script — Clean Chrome locks, then start PM2
# ==============================================================================

echo "🔧 [startup] Cleaning stale Chrome profile locks..."

# Remove Chrome profile lock files (left over from previous container)
CHROME_PROFILE_DIR="/root/.danielsensual-chrome-profile"
if [ -d "$CHROME_PROFILE_DIR" ]; then
    rm -f "$CHROME_PROFILE_DIR/SingletonLock" \
          "$CHROME_PROFILE_DIR/SingletonCookie" \
          "$CHROME_PROFILE_DIR/SingletonSocket" 2>/dev/null
    echo "✅ [startup] Chrome locks cleaned"
else
    echo "⚠️ [startup] Chrome profile dir not found (first boot)"
    mkdir -p "$CHROME_PROFILE_DIR"
fi

echo "🚀 [startup] Starting PM2..."
exec pm2-runtime ecosystem.config.cjs --only \
    "music-manager-rotate-daily,danielsensual-share-morning,danielsensual-share-afternoon,danielsensual-share-evening,danielsensual-personal-share-morning,danielsensual-personal-share-afternoon,danielsensual-personal-share-evening,music-manager-engage-morning,music-manager-engage-afternoon,music-manager-engage-evening,music-manager-scan-weekly"

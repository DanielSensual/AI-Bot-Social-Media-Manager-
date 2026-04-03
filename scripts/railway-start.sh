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

ONLY_SERVICES="music-manager-rotate-daily,danielsensual-share-morning,danielsensual-share-afternoon,danielsensual-share-evening,danielsensual-personal-share-morning,danielsensual-personal-share-afternoon,danielsensual-personal-share-evening,music-manager-engage-morning,music-manager-engage-afternoon,music-manager-engage-evening,music-manager-scan-weekly"

echo "🚀 [startup] Starting PM2 with services: $ONLY_SERVICES"

# Use pm2 start (not pm2-runtime) since all processes are cron-based
# pm2-runtime exits when 0 apps are online, but cron jobs fire on schedule
pm2 start ecosystem.config.cjs --only "$ONLY_SERVICES"

echo "✅ [startup] PM2 processes registered. Entering keep-alive loop..."
echo "📋 [startup] Current PM2 status:"
pm2 list

# Keep the container alive — PM2 cron jobs fire on schedule
# Log heartbeat every 5 minutes so Railway knows the container is healthy
while true; do
    sleep 300
    ONLINE=$(pm2 jlist 2>/dev/null | node -e "
        let d='';process.stdin.on('data',c=>d+=c);
        process.stdin.on('end',()=>{
            try{const a=JSON.parse(d);
            const o=a.filter(p=>p.pm2_env.status==='online').length;
            const s=a.filter(p=>p.pm2_env.status==='stopped').length;
            console.log(o+' online, '+s+' stopped/waiting');
            }catch(e){console.log('error');}
        });
    ")
    echo "💓 [heartbeat] $(date '+%Y-%m-%d %H:%M:%S %Z') — PM2: $ONLINE"
done

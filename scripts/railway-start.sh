#!/bin/bash
# ==============================================================================
# Railway Startup Script — Full Fleet
# Runs ALL bots from ecosystem.config.cjs on Railway
# ==============================================================================

echo ""
echo "👻 ═══════════════════════════════════════════"
echo "   G H O S T A I   B O T   F L E E T"
echo "   Railway Full Deployment — $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "═══════════════════════════════════════════════"
echo ""

# ── Clean stale Chrome locks ─────────────────────────────────────────────────
echo "🔧 [startup] Cleaning stale Chrome profile locks..."
for PROFILE_DIR in /root/.danielsensual-chrome-profile /root/.chrome-profile /app/.danielsensual-chrome-profile; do
    if [ -d "$PROFILE_DIR" ]; then
        rm -f "$PROFILE_DIR/SingletonLock" \
              "$PROFILE_DIR/SingletonCookie" \
              "$PROFILE_DIR/SingletonSocket" 2>/dev/null
        echo "  ✅ Cleaned $PROFILE_DIR"
    fi
done

# ── Restore LinkedIn/session tokens from env vars (base64-encoded) ───────────
echo "🔑 [startup] Restoring session tokens from env..."

restore_token() {
    local ENV_KEY="$1"
    local FILENAME="$2"
    local VALUE=$(eval echo "\$$ENV_KEY")
    if [ -n "$VALUE" ]; then
        echo "$VALUE" | base64 -d > "/app/$FILENAME" 2>/dev/null
        if [ $? -eq 0 ]; then
            echo "  ✅ Restored $FILENAME"
        else
            echo "  ⚠️  Failed to restore $FILENAME"
        fi
    fi
}

restore_token "LINKEDIN_TOKEN_JSON" ".linkedin-token.json"
restore_token "LINKEDIN_TOKEN_DANIEL_JSON" ".linkedin-token-daniel.json"
restore_token "LINKEDIN_COOKIES_JSON" ".linkedin-cookies.json"
restore_token "INSTAGRAM_SESSION_JSON" ".instagram-session.json"
restore_token "X_SESSION_JSON" ".x-session.json"

# ── Create necessary directories ─────────────────────────────────────────────
mkdir -p /app/logs/pm2 /app/logs/danielsensual-shares /app/data /app/.image-cache /app/.video-cache

# ── Exclude ghost-command (path ../scripts/ is outside container scope) ───────
# Everything else in ecosystem.config.cjs can run
EXCLUDE_SERVICES="ghost-command"

echo ""
echo "🚀 [startup] Starting PM2 fleet (ALL bots except: $EXCLUDE_SERVICES)..."
echo ""

# Start all processes from ecosystem.config.cjs
pm2 start ecosystem.config.cjs

# Delete processes that can't run in Docker (paths outside container scope)
pm2 delete "$EXCLUDE_SERVICES" 2>/dev/null || true

echo ""
echo "📋 [startup] PM2 Status:"
pm2 list

# Count total processes
TOTAL=$(pm2 jlist 2>/dev/null | node -e "
    let d='';process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
        try{const a=JSON.parse(d);
        console.log(a.length + ' processes registered');
        }catch(e){console.log('error');}
    });
")
echo ""
echo "✅ [startup] $TOTAL — Fleet is operational."
echo ""

# ── Keep-alive loop with heartbeat logging ───────────────────────────────────
# PM2 cron jobs fire on schedule, daemons stay running
# Heartbeat every 5 minutes so Railway knows container is healthy
while true; do
    sleep 300
    ONLINE=$(pm2 jlist 2>/dev/null | node -e "
        let d='';process.stdin.on('data',c=>d+=c);
        process.stdin.on('end',()=>{
            try{const a=JSON.parse(d);
            const o=a.filter(p=>p.pm2_env.status==='online').length;
            const s=a.filter(p=>p.pm2_env.status==='stopped').length;
            const e=a.filter(p=>p.pm2_env.status==='errored').length;
            console.log(o+' online, '+s+' stopped/waiting, '+e+' errored');
            }catch(e){console.log('error');}
        });
    ")
    echo "💓 [heartbeat] $(date '+%Y-%m-%d %H:%M:%S %Z') — PM2: $ONLINE"
done

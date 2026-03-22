#!/bin/bash
# Music Manager Bot — GCE VM Startup Script
# Installs Node.js, Chrome, PM2, and sets up the environment

set -e

echo "🎖️ Music Manager Bot — GCE Setup"
echo "═══════════════════════════════════════════════════════"

# ── Install Node.js 22 ──
if ! command -v node &>/dev/null; then
    echo "📦 Installing Node.js 22..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi

# ── Install Google Chrome ──
if ! command -v google-chrome-stable &>/dev/null; then
    echo "📦 Installing Google Chrome..."
    apt-get update
    apt-get install -y wget gnupg ca-certificates
    wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -
    echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list
    apt-get update
    apt-get install -y google-chrome-stable \
        fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
        libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 \
        libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 \
        xdg-utils --no-install-recommends
fi

# ── Install PM2 ──
if ! command -v pm2 &>/dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
fi

# ── Set timezone ──
timedatectl set-timezone America/New_York 2>/dev/null || true

# ── Set up app directory ──
APP_DIR="/opt/music-manager-bot"
if [ ! -d "$APP_DIR" ]; then
    echo "📁 App directory will be created at $APP_DIR"
    echo "   Use deploy script to rsync code from your Mac"
fi

echo ""
echo "✅ GCE VM setup complete!"
echo "   Node.js: $(node --version)"
echo "   Chrome:  $(google-chrome-stable --version)"
echo "   PM2:     $(pm2 --version)"
echo ""

#!/bin/bash
# Ghost AI Bots — VM Deployment Script (Host-level PM2)
#
# Deploys updates directly to the host VM and reloads PM2.
#
# Usage:
#   chmod +x scripts/deploy-vm.sh
#   ./scripts/deploy-vm.sh <target-vm> [zone]
#
# Examples:
#   ./scripts/deploy-vm.sh ghostai-bot us-east1-b
#   ./scripts/deploy-vm.sh music-manager-bot us-east4-c

set -e

TARGET_VM="${1}"

if [ -z "$TARGET_VM" ]; then
    echo "❌ Missing required argument: <target-vm>"
    echo "Usage: $0 <target-vm> [zone]"
    exit 1
fi

PROJECT_ID="gen-lang-client-0927703196"

# Default zones based on known VM geography
if [ -z "$2" ]; then
    if [ "$TARGET_VM" = "ghostai-bot" ]; then
        ZONE="us-east1-b"
    elif [ "$TARGET_VM" = "music-manager-bot" ]; then
        ZONE="us-east4-c"
    else
        echo "❌ Provide a zone as the second argument for unknown VM: $TARGET_VM"
        exit 1
    fi
else
    ZONE="$2"
fi

echo ""
echo "🚀 Deploying to $TARGET_VM in $ZONE"
echo "──────────────────────────────────────────────"
echo "Project: $PROJECT_ID"
echo ""

# 1. Health check: verify PM2 is active via systemd
echo "🩺 Running PM2 systemd health check..."
gcloud compute ssh "$TARGET_VM" --zone="$ZONE" --project="$PROJECT_ID" --command="systemctl is-active pm2-danielcastillo" > /dev/null || {
    echo "❌ FATAL: PM2 systemd service (pm2-danielcastillo) is not active on $TARGET_VM."
    echo "Please repair the boot environment first."
    exit 1
}
echo "✅ PM2 systemd service is active."

# 2. Update code and restart PM2
echo "📦 Pulling latest code and restarting PM2 apps..."
gcloud compute ssh "$TARGET_VM" --zone="$ZONE" --project="$PROJECT_ID" --command="
# Hardcoded locations for deterministic deployments
if [ \"$TARGET_VM\" = \"ghostai-bot\" ]; then
    WORKSPACE_DIR=\"/opt/ghostai\"
elif [ \"$TARGET_VM\" = \"music-manager-bot\" ]; then
    WORKSPACE_DIR=\"/opt/music-manager-bot\"
else
    WORKSPACE_DIR=\"\$(find ~ -maxdepth 1 -name '*bot*' -type d | head -n 1)\"
fi

BOT_DIR=\"\$WORKSPACE_DIR/ghostai-x-bot\"
echo \"📂 Using Workspace: \$WORKSPACE_DIR\"
echo \"📂 Using Bot Dir: \$BOT_DIR\"

# Ensure Bot Dir exists
mkdir -p \"\$BOT_DIR\"
cd \"\$BOT_DIR\"

echo \"🧹 Setting up git repository...\"
if ! command -v git &> /dev/null; then
    echo \"📦 Git not found. Installing...\"
    sudo apt-get update && sudo apt-get install -y git
fi

if [ ! -d \".git\" ]; then
    echo \"🌱 Initializing git repository...\"
    git init
    git remote add origin https://github.com/DanielSensual/AI-Bot-Social-Media-Manager-.git
    git fetch
    git reset --hard origin/main
else
    echo \"🧹 Resetting to clean state (dropping tracked local changes)...\"
    git reset --hard HEAD
fi

echo \"📥 Pulling latest from main branch...\"
git pull origin main

echo \"📦 Installing workspace dependencies...\"
cd \"\$WORKSPACE_DIR\"
npm ci || npm install

# Copy .env from home directory or recreate safely if needed
if [ -f \"\$HOME/.env\" ] && [ ! -f \"\$BOT_DIR/.env\" ]; then
    echo \"🔐 Copying .env from root...\"
    cp \"\$HOME/.env\" \"\$BOT_DIR/.env\"
fi

cd \"\$BOT_DIR\"

# Bot-specific healing
if [ \"$TARGET_VM\" = \"ghostai-bot\" ]; then
    echo \"🩹 Restoring daniel-facebook-manager to PM2 on ghostai-bot...\"
    pm2 start ecosystem.config.cjs --only daniel-facebook-manager || true
fi

# Reload PM2 apps (assumes they are already created and configured with the right cwd,
# but for music-manager-bot we need to make sure the CWD is updated to the inner folder if it wasn't)
if [ \"$TARGET_VM\" = \"music-manager-bot\" ]; then
    # music-manager-bot originally ran out of the root, so we need to recreate the PM2 apps if they are missing
    echo \"🔄 Restarting specific music-manager apps to fix pathing and missing cron jobs...\"
    pm2 delete all || true
    pm2 start ecosystem.music.config.cjs
else
    echo \"🔄 Reloading all active PM2 apps to pick up new code zero-downtime...\"
    pm2 reload all
fi
pm2 save

echo \"\"
echo \"✅ Current PM2 Status:\"
pm2 list
"

echo "──────────────────────────────────────────────"
echo "🎉 Deployment to $TARGET_VM complete!"

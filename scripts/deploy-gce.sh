#!/bin/bash
# Music Manager Bot — GCE Deployment Script
#
# Deploys the Music Manager Bot to a Google Compute Engine instance.
#
# Prerequisites:
#   1. gcloud CLI installed and authenticated
#   2. A GCP project with Compute Engine API enabled
#   3. .env file with API keys
#
# Usage:
#   chmod +x scripts/deploy-gce.sh
#   ./scripts/deploy-gce.sh

set -e

# ────── Config ──────────────────────────────────────────────────

PROJECT_ID="${GCP_PROJECT_ID:-ghostai-bots}"
ZONE="${GCE_ZONE:-us-east4-c}"             # Close to Orlando
INSTANCE_NAME="music-manager-bot"
MACHINE_TYPE="e2-standard-2"               # 2 vCPU, 8GB RAM
IMAGE_NAME="music-manager-bot"
DISK_SIZE="30GB"

echo ""
echo "🎖️ Music Manager Bot — GCE Deployment"
echo "═══════════════════════════════════════════════════════"
echo "   Project:  $PROJECT_ID"
echo "   Zone:     $ZONE"
echo "   Instance: $INSTANCE_NAME"
echo "   Machine:  $MACHINE_TYPE"
echo ""

# ────── Step 1: Build Docker Image ──────────────────────────────

echo "📦 Building Docker image..."
docker build -t $IMAGE_NAME -f Dockerfile.music-manager .
echo "✅ Image built"
echo ""

# ────── Step 2: Tag & Push to GCR ───────────────────────────────

GCR_IMAGE="gcr.io/$PROJECT_ID/$IMAGE_NAME:latest"

echo "📤 Pushing to Google Container Registry..."
docker tag $IMAGE_NAME $GCR_IMAGE
docker push $GCR_IMAGE
echo "✅ Pushed: $GCR_IMAGE"
echo ""

# ────── Step 3: Create GCE Instance (if not exists) ─────────────

INSTANCE_EXISTS=$(gcloud compute instances list \
    --project=$PROJECT_ID \
    --filter="name=$INSTANCE_NAME" \
    --format="value(name)" 2>/dev/null || echo "")

if [ -z "$INSTANCE_EXISTS" ]; then
    echo "🖥️ Creating GCE instance..."
    gcloud compute instances create-with-container $INSTANCE_NAME \
        --project=$PROJECT_ID \
        --zone=$ZONE \
        --machine-type=$MACHINE_TYPE \
        --boot-disk-size=$DISK_SIZE \
        --container-image=$GCR_IMAGE \
        --container-restart-policy=always \
        --container-env-file=.env \
        --tags=music-manager-bot \
        --metadata=shutdown-script='#!/bin/bash
docker stop $(docker ps -q) 2>/dev/null || true'
    echo "✅ Instance created"
else
    echo "🔄 Updating existing instance..."
    gcloud compute instances update-container $INSTANCE_NAME \
        --project=$PROJECT_ID \
        --zone=$ZONE \
        --container-image=$GCR_IMAGE
    echo "✅ Instance updated"
fi

echo ""

# ────── Step 4: Copy Chrome Profile (First Time Only) ───────────

echo "📋 Quick Setup Guide:"
echo ""
echo "   1. SSH into the instance:"
echo "      gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --project=$PROJECT_ID"
echo ""
echo "   2. Copy Chrome profile (one-time):"
echo "      # From your Mac:"
echo "      gcloud compute scp --recurse ~/.danielsensual-chrome-profile \\"
echo "          $INSTANCE_NAME:~/.danielsensual-chrome-profile \\"
echo "          --zone=$ZONE --project=$PROJECT_ID"
echo ""
echo "   3. View bot logs:"
echo "      gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --project=$PROJECT_ID \\"
echo "          --command='docker logs -f music-manager-bot'"
echo ""
echo "   4. Check PM2 status:"
echo "      gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --project=$PROJECT_ID \\"
echo "          --command='docker exec music-manager-bot pm2 list'"
echo ""

# ────── Done ────────────────────────────────────────────────────

echo "═══════════════════════════════════════════════════════"
echo "✅ Deployment complete!"
echo "   Instance: $INSTANCE_NAME"
echo "   Zone:     $ZONE"
echo "   Image:    $GCR_IMAGE"
echo ""
echo "   💡 Monthly cost estimate: ~\$25-35/month (e2-standard-2)"
echo "   💡 Bot runs 24/7 with PM2 scheduling"
echo ""

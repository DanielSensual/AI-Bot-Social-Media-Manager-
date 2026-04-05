# ==============================================================================
# GhostAI Bot — Production Dockerfile
# Multi-stage build, non-root user, health check built-in
# ==============================================================================

# Stage 1: Install dependencies
FROM node:20-slim AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Stage 2: Production image
FROM node:20-slim

# System deps for better-sqlite3 native addon + puppeteer (chromium)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd -r ghostai && useradd -r -g ghostai -m ghostai

WORKDIR /app

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY package.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/

# Create data directory for SQLite (mountable volume)
RUN mkdir -p /app/data /app/logs && chown -R ghostai:ghostai /app

USER ghostai

# Health check via the command-agent /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -sf http://localhost:${PORT:-8787}/health || exit 1

EXPOSE ${PORT:-8787}

# Default entrypoint: unified bot scheduler (runs all bots + health server)
CMD ["node", "scripts/railway-start.js"]

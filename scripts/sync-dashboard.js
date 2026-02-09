#!/usr/bin/env node

/**
 * Dashboard Sync Script
 * Pushes current bot stats to the GhostAI Dashboard.
 * 
 * Usage:
 *   node scripts/sync-dashboard.js
 * 
 * Environment:
 *   DASHBOARD_URL=https://your-dashboard.vercel.app (or http://localhost:3001)
 *   DASHBOARD_SECRET=your-secret-token
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3001';
const DASHBOARD_SECRET = process.env.DASHBOARD_SECRET || 'ghostai-dev-token';

function readJSON(filename) {
    const filepath = path.join(PROJECT_ROOT, filename);
    try {
        if (fs.existsSync(filepath)) {
            return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
        }
    } catch (e) {
        console.warn(`⚠️ Could not read ${filename}: ${e.message}`);
    }
    return null;
}

function buildDashboardPayload() {
    // Post history
    const postHistory = readJSON('.post-history.json') || [];
    const today = new Date().toISOString().slice(0, 10);

    // Stats
    const postsToday = postHistory.filter(p =>
        p.timestamp && p.timestamp.startsWith(today)
    ).length;
    const aiGenerated = postHistory.filter(p => p.aiGenerated).length;
    const videoPosts = postHistory.filter(p => p.hasVideo).length;
    const imagePosts = postHistory.filter(p => p.hasImage).length;

    // Daily post counts (last 14 days)
    const dailyPosts = [];
    for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const count = postHistory.filter(p =>
            p.timestamp && p.timestamp.startsWith(dateStr)
        ).length;
        dailyPosts.push({ date: dateStr, count });
    }

    // Pillar metrics
    const feedback = readJSON('.content-feedback.json');
    const pillarMetrics = feedback?.pillarMetrics || {};

    // Queue
    const queueData = readJSON('.content-queue.json') || [];
    const queue = {
        pending: queueData.filter(e => e.status === 'pending').length,
        approved: queueData.filter(e => e.status === 'approved').length,
        posted: queueData.filter(e => e.status === 'posted').length,
        rejected: queueData.filter(e => e.status === 'rejected').length,
    };

    // LinkedIn token status
    const linkedinToken = readJSON('.linkedin-token.json');
    const linkedinStatus = linkedinToken?.access_token
        ? (linkedinToken.expires_at && Date.now() > linkedinToken.expires_at ? 'warning' : 'connected')
        : 'offline';

    // Platform status (best effort from token/config)
    const platforms = {
        x: { status: 'connected', lastPost: getLastPlatformPost(postHistory, 'x') },
        linkedin: { status: linkedinStatus, lastPost: getLastPlatformPost(postHistory, 'linkedin') },
        facebook: { status: 'connected', lastPost: getLastPlatformPost(postHistory, 'facebook') },
        instagram: { status: 'connected', lastPost: getLastPlatformPost(postHistory, 'instagram') },
    };

    return {
        platforms,
        postHistory: postHistory.slice(-30), // Last 30 posts
        pillarMetrics,
        queue,
        stats: {
            totalPosts: postHistory.length,
            postsToday,
            aiGenerated,
            videoPosts,
            imagePosts,
        },
        dailyPosts,
        alerts: [], // Could read from an alerts log file
    };
}

function getLastPlatformPost(history, platform) {
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].results?.[platform]) {
            return history[i].timestamp;
        }
    }
    return null;
}

async function sync() {
    console.log('\n📡 Syncing to dashboard...');
    console.log(`   URL: ${DASHBOARD_URL}/api/sync`);

    const payload = buildDashboardPayload();

    try {
        const response = await fetch(`${DASHBOARD_URL}/api/sync`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DASHBOARD_SECRET}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`${response.status} - ${text}`);
        }

        const result = await response.json();
        console.log(`✅ Dashboard synced at ${result.synced}`);
        console.log(`   📊 ${payload.stats.totalPosts} total posts, ${payload.stats.postsToday} today`);
        console.log(`   📋 Queue: ${payload.queue.pending} pending, ${payload.queue.approved} approved`);
    } catch (err) {
        console.error(`❌ Sync failed: ${err.message}`);
        process.exit(1);
    }
}

sync();

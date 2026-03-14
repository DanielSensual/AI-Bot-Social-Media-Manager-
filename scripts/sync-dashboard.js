#!/usr/bin/env node

/**
 * Dashboard Sync Script
 * Pushes current bot stats to the GhostAI Dashboard.
 * Reads from SQLite (post-history) for accurate, real-time data.
 * 
 * Usage:
 *   node scripts/sync-dashboard.js
 * 
 * Environment:
 *   DASHBOARD_URL=https://ghostai-dashboard.vercel.app
 *   DASHBOARD_SECRET=your-secret-token
 */

import dotenv from 'dotenv';
import { getRecent, getStats } from '../src/post-history.js';
import { config } from '../src/config.js';

dotenv.config();

const DASHBOARD_URL = (process.env.DASHBOARD_URL || 'https://ghostai-dashboard.vercel.app').trim().replace(/\/+$/, '');
const DASHBOARD_SECRET = (process.env.DASHBOARD_SECRET || 'ghostai-dev-token').trim();

function buildDashboardPayload() {
    // Read from SQLite (real data)
    const recentPosts = getRecent(100);
    const stats = getStats();
    const today = new Date().toISOString().slice(0, 10);

    // Daily post counts (last 14 days)
    const dailyPosts = [];
    for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const count = recentPosts.filter(p =>
            p.timestamp && p.timestamp.startsWith(dateStr)
        ).length;
        dailyPosts.push({ date: dateStr, count });
    }

    // Platform status (derived from recent posts)
    const platforms = {
        x: { status: getLastPlatformPost(recentPosts, 'x') ? 'connected' : 'unknown', lastPost: getLastPlatformPost(recentPosts, 'x') },
        linkedin: { status: getLastPlatformPost(recentPosts, 'linkedin') ? 'connected' : 'unknown', lastPost: getLastPlatformPost(recentPosts, 'linkedin') },
        facebook: { status: getLastPlatformPost(recentPosts, 'facebook') ? 'connected' : 'unknown', lastPost: getLastPlatformPost(recentPosts, 'facebook') },
        instagram: { status: getLastPlatformPost(recentPosts, 'instagram') ? 'connected' : 'unknown', lastPost: getLastPlatformPost(recentPosts, 'instagram') },
    };

    // Queue counts (optional — content-queue may not exist)
    const queue = { pending: 0, approved: 0, posted: stats.totalPosts, rejected: 0 };

    return {
        platforms,
        postHistory: recentPosts.slice(-30),
        pillarMetrics: stats.pillarCounts || {},
        queue,
        stats: {
            totalPosts: stats.totalPosts,
            postsToday: stats.postsToday,
            aiGenerated: recentPosts.filter(p => p.aiGenerated).length,
            videoPosts: recentPosts.filter(p => p.hasVideo).length,
            imagePosts: recentPosts.filter(p => p.hasImage).length,
        },
        dailyPosts,
        alerts: [],
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
        console.log(`   📋 Queue: ${payload.queue.posted} posted`);
        console.log(`   🌐 Platforms: X=${payload.platforms.x.status}, LI=${payload.platforms.linkedin.status}, FB=${payload.platforms.facebook.status}, IG=${payload.platforms.instagram.status}`);
    } catch (err) {
        console.error(`❌ Sync failed: ${err.message}`);
        process.exit(1);
    }
}

sync();

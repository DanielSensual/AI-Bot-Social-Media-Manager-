#!/usr/bin/env node
/**
 * GhostAI Health Check Script
 * Standalone diagnostic tool that validates all platform connections,
 * database state, and environment configuration.
 *
 * Usage: node scripts/health-check.js
 */

import 'dotenv/config';
import { config } from '../src/config.js';
import { testConnection } from '../src/twitter-client.js';
import { testLinkedInConnection, ensureTokenHealth } from '../src/linkedin-client.js';
import { testFacebookConnection } from '../src/facebook-client.js';
import { testInstagramConnection } from '../src/instagram-client.js';
import { getStats } from '../src/post-history.js';
import { listQueue } from '../src/content-queue.js';
import { getPerformanceSummary } from '../src/content-feedback.js';
import { formatTimestampInTimeZone } from '../src/timezone.js';
import { resolvePageToken } from '@ghostai/shared/graph-api';

const CHECKS = [
    {
        name: 'X (Twitter) API',
        enabled: config.autonomy.platforms.x,
        check: async () => {
            const ok = await testConnection();
            return { status: ok ? 'connected' : 'failed', details: ok || 'No response' };
        },
    },
    {
        name: 'LinkedIn API',
        enabled: config.autonomy.platforms.linkedin,
        check: async () => {
            await ensureTokenHealth().catch(() => { });
            const ok = await testLinkedInConnection();
            return { status: ok ? 'connected' : 'failed', details: ok || 'Auth failed' };
        },
    },
    {
        name: 'Facebook Graph API',
        enabled: config.autonomy.platforms.facebook,
        check: async () => {
            const ok = await testFacebookConnection();
            if (!ok) return { status: 'failed', details: 'No response' };
            if (ok.type === 'user_no_pages') return { status: 'warning', details: 'No pages' };
            return { status: 'connected', details: `Page: ${ok.name || 'unknown'}` };
        },
    },
    {
        name: 'Instagram Graph API',
        enabled: config.autonomy.platforms.instagram,
        check: async () => {
            const ok = await testInstagramConnection();
            return { status: ok ? 'connected' : 'failed', details: ok || 'Not connected' };
        },
    },
    {
        name: 'FB Page Token Cache',
        enabled: true,
        check: async () => {
            const resolved = await resolvePageToken();
            return {
                status: resolved ? 'ok' : 'missing',
                details: resolved ? `Page ID: ${resolved.pageId}` : 'No token resolved',
            };
        },
    },
];

async function runHealthCheck() {
    const timestamp = new Date().toLocaleString('en-US', { timeZone: config.schedule.timezone });

    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║     🩺 GhostAI Health Check Report       ║');
    console.log(`║     ${timestamp.padEnd(35)}║`);
    console.log('╚══════════════════════════════════════════╝\n');

    // Environment
    console.log('📋 Environment');
    console.log(`   Node.js:     ${process.version}`);
    console.log(`   Timezone:    ${config.schedule.timezone}`);
    console.log(`   Schedule:    ${config.schedule.times?.join(', ') || 'disabled'}`);
    console.log(`   AI Ratio:    ${config.autonomy.aiRatio}%`);
    console.log(`   Video Ratio: ${config.autonomy.videoRatio}%`);
    console.log('');

    // Platform checks
    console.log('🔌 Platform Connectivity');
    let allOk = true;

    for (const check of CHECKS) {
        if (!check.enabled) {
            console.log(`   ⬜ ${check.name}: disabled`);
            continue;
        }

        try {
            const result = await check.check();
            const icon = result.status === 'connected' || result.status === 'ok' ? '✅' :
                result.status === 'warning' ? '⚠️' : '❌';
            console.log(`   ${icon} ${check.name}: ${result.status} — ${result.details}`);
            if (result.status === 'failed') allOk = false;
        } catch (err) {
            console.log(`   ❌ ${check.name}: error — ${err.message}`);
            allOk = false;
        }
    }

    console.log('');

    // Database state
    console.log('💾 Database State');
    try {
        const stats = getStats();
        console.log(`   Total posts:  ${stats.totalPosts}`);
        console.log(`   Posts today:   ${stats.postsToday}`);
        if (stats.lastPost) {
            console.log(`   Last post:    ${formatTimestampInTimeZone(stats.lastPost.timestamp, config.schedule.timezone)} (${stats.lastPost.pillar})`);
        }

        const pillars = Object.entries(stats.pillarCounts || {});
        if (pillars.length > 0) {
            console.log(`   Pillars:      ${pillars.map(([p, c]) => `${p}(${c})`).join(', ')}`);
        }
    } catch (err) {
        console.log(`   ❌ DB Error: ${err.message}`);
        allOk = false;
    }

    console.log('');

    // Queue
    console.log('📥 Content Queue');
    try {
        const queue = listQueue();
        console.log(`   Total:    ${queue.total}`);
        console.log(`   Pending:  ${queue.byStatus.pending}`);
        console.log(`   Approved: ${queue.byStatus.approved}`);
        console.log(`   Posted:   ${queue.byStatus.posted}`);
    } catch (err) {
        console.log(`   ❌ Queue Error: ${err.message}`);
    }

    console.log('');

    // Performance
    console.log('📊 Content Performance');
    try {
        const perf = getPerformanceSummary();
        const pillars = Object.entries(perf.pillarPerformance || {});
        if (pillars.length > 0) {
            for (const [name, data] of pillars) {
                console.log(`   ${name}: ${data.posts} posts, avg engagement ${data.avgEngagement}`);
            }
        } else {
            console.log('   No performance data yet');
        }
    } catch (err) {
        console.log(`   ❌ Performance Error: ${err.message}`);
    }

    // Summary
    console.log('\n' + '─'.repeat(45));
    console.log(allOk ? '✅ All systems operational' : '⚠️ Some checks failed — review above');
    console.log('─'.repeat(45) + '\n');

    process.exit(allOk ? 0 : 1);
}

runHealthCheck().catch((err) => {
    console.error(`\n❌ Health check crashed: ${err.message}\n`);
    process.exit(2);
});

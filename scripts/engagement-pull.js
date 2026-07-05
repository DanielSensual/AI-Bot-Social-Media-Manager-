#!/usr/bin/env node
/**
 * Manual engagement pull — same cycle the scheduler runs nightly at 02:30 ET.
 *   node scripts/engagement-pull.js           # pull + record
 *   node scripts/engagement-pull.js --report  # show pillar performance after
 */

import 'dotenv/config';
import { runEngagementPull } from '../src/engagement-pull.js';
import { getPerformanceSummary } from '../src/content-feedback.js';

const report = process.argv.includes('--report');

const result = await runEngagementPull();

if (report) {
    const summary = getPerformanceSummary();
    console.log('\n📊 Pillar performance (real data):');
    for (const [pillar, p] of Object.entries(summary.pillarPerformance)) {
        console.log(`   ${pillar}: ${p.posts} posts · avg ${p.avgEngagement} · ${p.totalLikes}❤ ${p.totalComments}💬`);
    }
    console.log(`   Last updated: ${summary.lastUpdated}`);
}

process.exit(result ? 0 : 1);

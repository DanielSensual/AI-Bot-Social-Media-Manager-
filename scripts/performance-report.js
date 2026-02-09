#!/usr/bin/env node

/**
 * Performance Report CLI
 * Shows content pillar performance, optimized weights, and top posts.
 */

import { getPerformanceSummary, getOptimizedWeights, getTopPerformingExamples } from '../src/content-feedback.js';

console.log('\n📊 Content Performance Report\n');

const summary = getPerformanceSummary();
const optimized = getOptimizedWeights();
const topPosts = getTopPerformingExamples(5);

// Pillar performance
console.log('📈 Pillar Performance:');
if (Object.keys(summary.pillarPerformance).length === 0) {
    console.log('   No engagement data yet. Posts need to accumulate metrics.\n');
} else {
    for (const [pillar, metrics] of Object.entries(summary.pillarPerformance)) {
        console.log(`   ${pillar.toUpperCase()}: ${metrics.posts} posts, avg engagement: ${metrics.avgEngagement}, ❤️ ${metrics.totalLikes}, 💬 ${metrics.totalComments}`);
    }
    console.log('');
}

// Optimized weights
console.log('🎯 Optimized Pillar Weights (vs config base):');
for (const [pillar, weight] of Object.entries(optimized)) {
    console.log(`   ${pillar}: ${weight}`);
}
console.log('');

// Top posts
if (topPosts.length > 0) {
    console.log('🏆 Top Performing Posts:');
    for (let i = 0; i < topPosts.length; i++) {
        console.log(`   ${i + 1}. "${topPosts[i].substring(0, 80)}..."`);
    }
    console.log('');
}

console.log(`Last updated: ${summary.lastUpdated || 'never'}\n`);

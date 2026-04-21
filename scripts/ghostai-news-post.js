#!/usr/bin/env node
/**
 * Ghost AI — News-Powered X Poster
 * ==================================
 * Scrapes real-time AI news, generates Ghost's take, posts to X.
 * Replaces the old "AI Takeover" persona with authority news commentary.
 * 
 * Schedule: 3x daily (9 AM, 1 PM, 6 PM EST) via PM2 cron
 * 
 * Usage:
 *   node scripts/ghostai-news-post.js              # Scrape + post
 *   node scripts/ghostai-news-post.js --dry-run    # Preview only
 *   node scripts/ghostai-news-post.js --angle hot_take  # Force angle
 *   node scripts/ghostai-news-post.js --status     # Show news queue
 */

import dotenv from 'dotenv';
import { postTweet } from '../src/twitter-client.js';
import { scrapeLatestNews, getTopUnpostedStory, markPosted } from '../src/news-scraper.js';
import { generateNewsTweet } from '../src/news-commentator.js';
import { record, isDuplicate } from '../src/post-history.js';
import { log } from '../src/logger.js';

dotenv.config();

const MAX_RETRIES = 3;

// ── Parse CLI args ──────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const STATUS_ONLY = args.includes('--status');
const forcedAngle = (() => {
    const idx = args.indexOf('--angle');
    if (idx >= 0 && args[idx + 1]) return args[idx + 1];
    return null;
})();

// ── Status Mode ─────────────────────────────────────────────────
async function showStatus() {
    console.log('\n📰 Ghost AI News Queue Status\n');
    const news = await scrapeLatestNews({ maxAge: 24, limit: 15 });

    if (news.length === 0) {
        console.log('   No AI news found in the last 24 hours.');
        return;
    }

    for (let i = 0; i < news.length; i++) {
        const item = news[i];
        const age = Math.round((Date.now() - item.pubDate.getTime()) / (1000 * 60 * 60));
        console.log(`   ${i + 1}. [${item.source}] ${item.title}`);
        console.log(`      Score: ${item.relevanceScore?.toFixed(1)} | ${age}h ago`);
        console.log(`      ${item.link}`);
        console.log('');
    }
}

// ── Main Posting Flow ───────────────────────────────────────────
async function main() {
    console.log('');
    console.log('👻 ═══════════════════════════════════════');
    console.log('   G H O S T   N E W S   E N G I N E');
    console.log('   \"real news. real takes. no fluff.\"');
    console.log('═══════════════════════════════════════════');
    console.log('');

    if (STATUS_ONLY) {
        await showStatus();
        return;
    }

    if (DRY_RUN) {
        console.log('👁️  DRY RUN — no actual post will be made\n');
    }

    // 1. Get top unposted story
    console.log('📰 Scanning for fresh AI news...');
    const newsItem = await getTopUnpostedStory({ maxAge: 24 });

    if (!newsItem) {
        console.log('ℹ️  No fresh AI news to post right now. Skipping.');
        return;
    }

    console.log(`🎯 Top Story: [${newsItem.source}] ${newsItem.title}`);
    console.log(`   Score: ${newsItem.relevanceScore?.toFixed(1)} | ${newsItem.link}`);
    console.log('');

    // 2. Generate Ghost's take
    let tweet;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            tweet = await generateNewsTweet(newsItem, { angle: forcedAngle });

            // Dedup check
            if (isDuplicate(tweet.text)) {
                console.warn(`   ⚠️ Attempt ${attempt}: Duplicate content, retrying...`);
                continue;
            }

            break;
        } catch (err) {
            console.warn(`   ⚠️ Attempt ${attempt}: ${err.message}`);
            if (attempt === MAX_RETRIES) throw err;
        }
    }

    if (!tweet) {
        console.error('❌ Failed to generate tweet after max retries');
        process.exit(1);
    }

    // 3. Display the tweet
    console.log('');
    console.log('─'.repeat(50));
    console.log(tweet.text);
    console.log('─'.repeat(50));
    console.log(`📊 ${tweet.text.length}/280 chars | Angle: ${tweet.angle} | Provider: ${tweet.provider}`);
    console.log(`📰 Re: ${tweet.newsItem.title}`);
    console.log('');

    if (DRY_RUN) {
        console.log('👁️  DRY RUN complete — tweet NOT posted');
        return;
    }

    // 4. Post to X
    try {
        console.log('📤 Posting to X...');
        const result = await postTweet(tweet.text);
        console.log(`✅ Posted! Tweet ID: ${result.id}`);
        console.log(`🔗 https://x.com/Ghostaisystems/status/${result.id}`);

        // Mark news as posted
        markPosted(newsItem);

        // Record in post history
        record({
            id: result.id,
            text: tweet.text,
            pillar: `news:${tweet.angle}`,
            aiGenerated: true,
            platforms: { x: true },
            metadata: {
                newsSource: newsItem.source,
                newsTitle: newsItem.title,
                newsUrl: newsItem.link,
            },
        });

        log.info('Ghost News post published', {
            tweetId: result.id,
            angle: tweet.angle,
            newsSource: newsItem.source,
            length: tweet.text.length,
            provider: tweet.provider,
        });

        console.log('\n👻 ghost news deployed. stay informed.');
    } catch (error) {
        console.error(`❌ Post failed: ${error.message}`);
        log.error('Ghost News post failed', { error: error.message, angle: tweet.angle });
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('💀 Fatal error:', err.message);
    process.exit(1);
});

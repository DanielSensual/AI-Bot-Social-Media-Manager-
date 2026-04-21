/**
 * Ghost AI — Real-Time AI News Scraper
 * ======================================
 * Scrapes top AI news from RSS feeds + Hacker News API.
 * Zero external dependencies — uses native fetch + DOMParser.
 * 
 * Sources:
 *   - TechCrunch AI
 *   - The Verge AI
 *   - Ars Technica AI
 *   - VentureBeat AI
 *   - Hacker News (AI-filtered)
 *   - OpenAI Blog
 *   - Google AI Blog
 * 
 * Usage:
 *   import { scrapeLatestNews } from './news-scraper.js';
 *   const news = await scrapeLatestNews({ maxAge: 12 }); // last 12 hours
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', '.news-cache');
const CACHE_FILE = path.join(CACHE_DIR, 'latest.json');
const POSTED_FILE = path.join(CACHE_DIR, 'posted.json');

// ── RSS Feed Sources ───────────────────────────────────────────
const RSS_FEEDS = [
    {
        name: 'TechCrunch AI',
        url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
        weight: 10,
    },
    {
        name: 'The Verge AI',
        url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
        weight: 9,
    },
    {
        name: 'Ars Technica AI',
        url: 'https://feeds.arstechnica.com/arstechnica/technology-lab',
        weight: 8,
    },
    {
        name: 'VentureBeat AI',
        url: 'https://venturebeat.com/category/ai/feed/',
        weight: 9,
    },
    {
        name: 'OpenAI Blog',
        url: 'https://openai.com/blog/rss.xml',
        weight: 10,
    },
    {
        name: 'Google AI Blog',
        url: 'https://blog.google/technology/ai/rss/',
        weight: 8,
    },
];

// ── AI Keywords for HN filtering ───────────────────────────────
const AI_KEYWORDS = [
    'ai', 'artificial intelligence', 'machine learning', 'llm', 'gpt',
    'claude', 'gemini', 'openai', 'anthropic', 'google ai', 'meta ai',
    'robot', 'autonomous', 'neural', 'transformer', 'diffusion',
    'voice agent', 'chatbot', 'deepseek', 'mistral', 'grok', 'xai',
    'stable diffusion', 'midjourney', 'sora', 'veo', 'kling',
    'automation', 'copilot', 'coding assistant', 'agent', 'agentic',
];

// ── XML Parser (zero deps) ─────────────────────────────────────
function parseRSSXml(xmlText) {
    const items = [];
    // Match <item> or <entry> blocks
    const itemRegex = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
    let match;

    while ((match = itemRegex.exec(xmlText)) !== null) {
        const block = match[1];

        const title = extractTag(block, 'title');
        const link = extractLink(block);
        const pubDate = extractTag(block, 'pubDate') ||
            extractTag(block, 'published') ||
            extractTag(block, 'updated');
        const description = extractTag(block, 'description') ||
            extractTag(block, 'summary') ||
            extractTag(block, 'content:encoded') || '';

        if (title && link) {
            items.push({
                title: cleanHtml(title).trim(),
                link: link.trim(),
                pubDate: pubDate ? new Date(pubDate) : new Date(),
                summary: cleanHtml(description).substring(0, 500).trim(),
            });
        }
    }

    return items;
}

function extractTag(block, tagName) {
    // Handle CDATA
    const cdataRegex = new RegExp(`<${tagName}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tagName}>`, 'i');
    const cdataMatch = block.match(cdataRegex);
    if (cdataMatch) return cdataMatch[1];

    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const m = block.match(regex);
    return m ? m[1] : null;
}

function extractLink(block) {
    // Try <link>url</link>
    const linkTag = extractTag(block, 'link');
    if (linkTag && !linkTag.includes('<')) return linkTag;

    // Try <link href="url" />
    const hrefMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
    if (hrefMatch) return hrefMatch[1];

    return linkTag;
}

function cleanHtml(text) {
    if (!text) return '';
    return text
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ── Fetch RSS Feed ─────────────────────────────────────────────
async function fetchRSSFeed(feed, maxAge) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(feed.url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'GhostAI-NewsBot/1.0 (https://ghostaisystems.com)',
                'Accept': 'application/rss+xml, application/xml, text/xml',
            },
        });
        clearTimeout(timeout);

        if (!response.ok) {
            console.warn(`   ⚠️ ${feed.name}: HTTP ${response.status}`);
            return [];
        }

        const xml = await response.text();
        const items = parseRSSXml(xml);

        const cutoff = Date.now() - (maxAge * 60 * 60 * 1000);
        const recent = items.filter(item => {
            const ts = item.pubDate instanceof Date ? item.pubDate.getTime() : 0;
            return ts > cutoff;
        });

        return recent.map(item => ({
            ...item,
            source: feed.name,
            sourceWeight: feed.weight,
        }));
    } catch (err) {
        if (err.name === 'AbortError') {
            console.warn(`   ⚠️ ${feed.name}: Timeout`);
        } else {
            console.warn(`   ⚠️ ${feed.name}: ${err.message}`);
        }
        return [];
    }
}

// ── Hacker News Scraper ────────────────────────────────────────
async function fetchHackerNews(maxAge) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(
            'https://hacker-news.firebaseio.com/v0/topstories.json',
            { signal: controller.signal }
        );
        clearTimeout(timeout);

        const ids = await response.json();
        const top50 = ids.slice(0, 50);

        const stories = await Promise.allSettled(
            top50.map(async (id) => {
                const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
                return res.json();
            })
        );

        const cutoff = Date.now() - (maxAge * 60 * 60 * 1000);
        const aiStories = stories
            .filter(r => r.status === 'fulfilled')
            .map(r => r.value)
            .filter(story => {
                if (!story || !story.title) return false;
                const titleLower = story.title.toLowerCase();
                const isAI = AI_KEYWORDS.some(kw => titleLower.includes(kw));
                const isRecent = (story.time * 1000) > cutoff;
                const hasScore = (story.score || 0) > 20;
                return isAI && isRecent && hasScore;
            })
            .map(story => ({
                title: story.title,
                link: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
                pubDate: new Date(story.time * 1000),
                summary: `HN Score: ${story.score} | ${story.descendants || 0} comments`,
                source: 'Hacker News',
                sourceWeight: Math.min(10, Math.floor((story.score || 0) / 50) + 5),
                hnScore: story.score,
                hnComments: story.descendants || 0,
            }));

        return aiStories;
    } catch (err) {
        console.warn(`   ⚠️ Hacker News: ${err.message}`);
        return [];
    }
}

// ── Dedup + Rank ───────────────────────────────────────────────
function deduplicateAndRank(allItems) {
    // Dedup by similar titles
    const seen = new Set();
    const unique = [];

    for (const item of allItems) {
        const key = item.title
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 60);

        if (seen.has(key)) continue;
        seen.add(key);

        // Score: source weight + recency bonus + HN score bonus
        const hoursAgo = (Date.now() - (item.pubDate?.getTime() || 0)) / (1000 * 60 * 60);
        const recencyBonus = Math.max(0, 10 - hoursAgo); // newer = higher
        const hnBonus = item.hnScore ? Math.min(5, item.hnScore / 100) : 0;

        item.relevanceScore = (item.sourceWeight || 5) + recencyBonus + hnBonus;
        unique.push(item);
    }

    // Sort by relevance score (highest first)
    unique.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return unique;
}

// ── Load posted history ────────────────────────────────────────
function loadPosted() {
    try {
        if (fs.existsSync(POSTED_FILE)) {
            return JSON.parse(fs.readFileSync(POSTED_FILE, 'utf-8'));
        }
    } catch { /* ignore */ }
    return [];
}

function markPosted(item) {
    const posted = loadPosted();
    posted.push({
        title: item.title,
        link: item.link,
        source: item.source,
        postedAt: new Date().toISOString(),
    });

    // Keep last 200
    const trimmed = posted.slice(-200);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(POSTED_FILE, JSON.stringify(trimmed, null, 2));
}

function isAlreadyPosted(item) {
    const posted = loadPosted();
    return posted.some(p =>
        p.link === item.link ||
        p.title.toLowerCase().substring(0, 50) === item.title.toLowerCase().substring(0, 50)
    );
}

// ── Main Scraper ───────────────────────────────────────────────
/**
 * Scrape latest AI news from all sources.
 * @param {object} options
 * @param {number} options.maxAge - Maximum age in hours (default: 24)
 * @param {number} options.limit - Max items to return (default: 10)
 * @param {boolean} options.excludePosted - Filter out already-posted items (default: true)
 * @returns {Promise<Array>} Ranked news items
 */
export async function scrapeLatestNews({
    maxAge = 24,
    limit = 10,
    excludePosted = true,
} = {}) {
    console.log(`📰 Scraping AI news (last ${maxAge}h)...`);

    // Fetch all sources in parallel
    const [rssResults, hnResults] = await Promise.all([
        Promise.allSettled(RSS_FEEDS.map(feed => fetchRSSFeed(feed, maxAge))),
        fetchHackerNews(maxAge),
    ]);

    // Flatten RSS results
    const rssItems = rssResults
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value);

    const allItems = [...rssItems, ...hnResults];
    console.log(`   📊 Raw items: ${allItems.length} (RSS: ${rssItems.length}, HN: ${hnResults.length})`);

    // Dedup + rank
    let ranked = deduplicateAndRank(allItems);

    // Filter posted
    if (excludePosted) {
        ranked = ranked.filter(item => !isAlreadyPosted(item));
    }

    const final = ranked.slice(0, limit);

    // Cache results
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify({
        scrapedAt: new Date().toISOString(),
        count: final.length,
        items: final,
    }, null, 2));

    console.log(`   ✅ ${final.length} news items ranked and ready`);
    return final;
}

/**
 * Get the top story that hasn't been posted yet.
 */
export async function getTopUnpostedStory(options = {}) {
    const items = await scrapeLatestNews({ ...options, limit: 5 });
    return items[0] || null;
}

/**
 * Get cached news without re-scraping.
 */
export function getCachedNews() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
            return data.items || [];
        }
    } catch { /* ignore */ }
    return [];
}

export { markPosted, isAlreadyPosted, loadPosted };

export default { scrapeLatestNews, getTopUnpostedStory, getCachedNews, markPosted };

#!/usr/bin/env node
/**
 * Music Manager Bot — Engagement Bot
 *
 * Monitors group posts for new comments and auto-responds with
 * natural, AI-generated replies. Uses GPT-5.4-nano.
 *
 * GUARD: Only responds to group posts, NOT personal page/profile posts.
 *
 * Usage:
 *   node scripts/engagement-bot.js
 *   node scripts/engagement-bot.js --dry-run
 *   node scripts/engagement-bot.js --max-replies=5
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generateText, hasLLMProvider } from '../src/llm-client.js';

dotenv.config();
puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_DATA_DIR = path.join(process.env.HOME, '.danielsensual-chrome-profile');
const STATE_FILE = path.join(__dirname, '..', 'logs', 'danielsensual-shares', 'engagement-state.json');
const LOGS_DIR = path.join(__dirname, '..', 'logs', 'danielsensual-shares');

const args = process.argv.slice(2);
const flags = {
    dryRun: args.includes('--dry-run'),
    help: args.includes('--help'),
    maxReplies: parseInt((args.find(a => a.startsWith('--max-replies=')) || '--max-replies=10').split('=')[1], 10),
};

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function randomDelay(min, max) { return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min)); }

// ─── State Management ───────────────────────────────────────────

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    } catch { /* fresh */ }
    return { repliedTo: {}, lastRun: null, totalReplies: 0 };
}

function saveState(state) {
    ensureDir(path.dirname(STATE_FILE));
    state.lastRun = new Date().toISOString();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─── AI Reply Generation ────────────────────────────────────────

const REPLY_STYLES = [
    'grateful',    // "Thank you! 🙏 Glad you enjoyed it"
    'engaging',    // "Right?? This track hits different"
    'question',    // "What's your favorite part?"
    'hype',        // "🔥🔥🔥 More coming soon!"
    'personal',    // "We put so much into this one"
    'community',   // "Love this dance family ❤️"
    'invite',      // "Come dance with us next time!"
];

async function generateReply(commentText, groupName, commenterName) {
    const style = REPLY_STYLES[Math.floor(Math.random() * REPLY_STYLES.length)];

    if (!hasLLMProvider()) {
        return getTemplateReply(style);
    }

    try {
        const prompt = `You are Daniel Sensual, a bachata music artist & dancer. Someone commented on your group post.

GROUP: "${groupName}"
COMMENTER: "${commenterName}"
THEIR COMMENT: "${commentText}"
REPLY STYLE: ${style}

═══ RULES ═══
1. Reply naturally as Daniel — warm, authentic, appreciative
2. Keep it SHORT — 1-2 sentences max
3. Match the energy of their comment (if hype, be hype back; if thoughtful, be thoughtful)
4. Use 0-2 emojis max
5. Sometimes mention their name, sometimes don't (vary it)
6. Do NOT plug links, streaming services, or upcoming events
7. Do NOT use hashtags
8. Sound like a real person, NOT a brand or bot
9. If the comment is negative/critical, respond gracefully (no arguing)
10. If it's just an emoji or "🔥", keep your reply equally short

Return ONLY the reply text. No quotes, no JSON.`;

        const { text } = await generateText({
            prompt,
            provider: 'auto',
            maxOutputTokens: 100,
            openaiModel: 'gpt-5.4-nano',
        });

        const reply = (text || '').trim().replace(/^["']|["']$/g, '');
        if (reply && reply.length > 2) return reply;
    } catch (err) {
        console.log(`   ⚠️ AI reply failed: ${err.message}`);
    }

    return getTemplateReply(style);
}

function getTemplateReply(style) {
    const templates = {
        grateful: [
            "Thank you! 🙏 Means a lot",
            "Appreciate the love! ❤️",
            "Thank you so much! More coming soon 🔥",
            "Glad you felt it! 🙏",
        ],
        engaging: [
            "Right?? This one hits different 🔥",
            "Yessss! The vibe was unreal",
            "Facts! We put everything into this one",
            "That's what I'm saying!! 💃",
        ],
        question: [
            "What part hit the hardest for you?",
            "You dance bachata too? 💃",
            "Have you heard the full track?",
            "Which style do you prefer? 🎶",
        ],
        hype: [
            "🔥🔥🔥",
            "Let's goooo! 💪",
            "More heat coming soon! 🔥",
            "The best is yet to come 🚀",
        ],
        personal: [
            "We put our heart into this one ❤️",
            "This was special to create 🙏",
            "Hours in the studio but worth every second",
            "This track means a lot to us 💯",
        ],
        community: [
            "Love this dance family ❤️",
            "The bachata community is the best 🙌",
            "This is what it's all about 💃",
            "So much love in this community ❤️",
        ],
        invite: [
            "Come dance with us next time! 💃",
            "Hope to see you on the dance floor!",
            "Let's dance together soon! 🔥",
            "The floor is calling! 💃",
        ],
    };
    const pool = templates[style] || templates.grateful;
    return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Group Post Comment Scanner ─────────────────────────────────

/**
 * Scan a group for posts by Daniel that have unreplied comments.
 * GUARD: Only operates on group URLs (contains /groups/).
 */
async function scanGroupForComments(page, groupUrl, groupName) {
    // ── GUARD: Only group URLs ──
    if (!groupUrl.includes('/groups/')) {
        console.log(`   🛡️ GUARD: Skipping non-group URL: ${groupUrl}`);
        return [];
    }

    await page.goto(groupUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(2000, 3000);

    // Check if page is accessible
    const accessible = await page.evaluate(() => {
        const bodyText = document.body?.textContent || '';
        if (bodyText.includes("This content isn't available right now")) return false;
        if (window.location.href.includes('/login')) return false;
        return true;
    });

    if (!accessible) {
        console.log(`   💀 Group unavailable`);
        return [];
    }

    // Scroll to load posts
    for (let i = 0; i < 2; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.3));
        await randomDelay(1000, 1500);
    }

    // Find posts by Daniel that have comments
    const postsWithComments = await page.evaluate(() => {
        const results = [];
        const posts = Array.from(document.querySelectorAll('div[role="article"]'));

        for (const post of posts) {
            // Check if this post is by Daniel (look for profile link)
            const authorLinks = Array.from(post.querySelectorAll('a[role="link"]'));
            const isDanielPost = authorLinks.some(link => {
                const href = link.href || '';
                const text = link.textContent?.toLowerCase() || '';
                return href.includes('danielsensual') ||
                       href.includes('daniel.castillo') ||
                       text.includes('daniel sensual') ||
                       text.includes('daniel castillo');
            });

            if (!isDanielPost) continue;

            // Get the post's permalink
            const timeLink = post.querySelector('a[href*="/posts/"], a[href*="/permalink/"]');
            const postUrl = timeLink?.href || '';
            if (!postUrl) continue;

            // Check for comment count indicator
            const commentIndicators = Array.from(post.querySelectorAll('span'));
            let commentCount = 0;
            for (const span of commentIndicators) {
                const text = span.textContent?.trim() || '';
                const match = text.match(/(\d+)\s*comment/i);
                if (match) {
                    commentCount = parseInt(match[1], 10);
                    break;
                }
            }

            if (commentCount > 0) {
                results.push({
                    postUrl,
                    commentCount,
                    postId: postUrl.match(/\/(\d+)\/?/)?.[1] || postUrl,
                });
            }
        }

        return results;
    });

    return postsWithComments;
}

/**
 * Navigate to a specific post and reply to unreplied comments.
 * GUARD: Verifies the post is in a group context.
 */
async function replyToComments(page, postUrl, groupName, state) {
    // ── GUARD: Only group post URLs ──
    if (!postUrl.includes('/groups/')) {
        console.log(`   🛡️ GUARD: Skipping non-group post: ${postUrl}`);
        return 0;
    }

    await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(2000, 3000);

    // ── GUARD: Verify we're on a group page ──
    const isGroupPage = await page.evaluate(() => {
        const url = window.location.href;
        const breadcrumb = document.querySelector('a[href*="/groups/"]');
        return url.includes('/groups/') && !!breadcrumb;
    });

    if (!isGroupPage) {
        console.log(`   🛡️ GUARD: Not a group page, skipping`);
        return 0;
    }

    // Scroll to load comments
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.5));
    await randomDelay(1500, 2000);

    // Try to expand "View more comments" if present
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('div[role="button"], span[role="button"]'));
        const viewMore = btns.find(b => {
            const txt = b.textContent?.trim() || '';
            return txt.includes('View more comments') || txt.includes('View all') ||
                   txt.includes('more comment');
        });
        if (viewMore) viewMore.click();
    });
    await randomDelay(1000, 2000);

    // Extract comments (not by Daniel)
    const comments = await page.evaluate(() => {
        const results = [];
        const commentElements = Array.from(document.querySelectorAll('div[aria-label*="Comment"], ul li'));

        for (const el of commentElements) {
            // Get commenter info
            const authorLink = el.querySelector('a[role="link"]');
            if (!authorLink) continue;

            const authorName = authorLink.textContent?.trim() || '';
            const authorHref = authorLink.href || '';

            // Skip Daniel's own comments
            if (authorHref.includes('danielsensual') ||
                authorHref.includes('daniel.castillo') ||
                authorName.toLowerCase().includes('daniel sensual') ||
                authorName.toLowerCase().includes('daniel castillo')) {
                continue;
            }

            // Get comment text
            const commentTextEl = el.querySelector('div[dir="auto"]');
            const commentText = commentTextEl?.textContent?.trim() || '';
            if (!commentText || commentText.length < 1) continue;

            // Generate a unique comment ID
            const commentId = `${authorName}:${commentText.substring(0, 50)}`.replace(/\s+/g, '_');

            results.push({
                authorName,
                commentText,
                commentId,
            });
        }

        return results;
    });

    if (comments.length === 0) return 0;

    let repliesPosted = 0;

    for (const comment of comments) {
        // Skip already replied
        if (state.repliedTo[comment.commentId]) {
            continue;
        }

        // Generate AI reply
        const reply = await generateReply(comment.commentText, groupName, comment.authorName);
        console.log(`      💬 "${comment.authorName}": "${comment.commentText.substring(0, 40)}..."`);
        console.log(`      📝 Reply: "${reply}"`);

        if (flags.dryRun) {
            state.repliedTo[comment.commentId] = { at: new Date().toISOString(), reply, dryRun: true };
            repliesPosted++;
            continue;
        }

        // Find the reply button for this specific comment and click it
        try {
            // Click the "Reply" text near the comment
            const replied = await page.evaluate((authorName) => {
                // Find the comment container by author name
                const allLinks = Array.from(document.querySelectorAll('a[role="link"]'));
                const authorLink = allLinks.find(l => l.textContent?.trim() === authorName);
                if (!authorLink) return false;

                // Find the nearest "Reply" button
                const container = authorLink.closest('div[aria-label*="Comment"]') ||
                                  authorLink.closest('li') ||
                                  authorLink.closest('div');
                if (!container) return false;

                const replyBtn = container.querySelector('div[role="button"]');
                const allBtns = Array.from(container.querySelectorAll('div[role="button"], span'));
                const reply = allBtns.find(b => b.textContent?.trim() === 'Reply');
                if (reply) {
                    reply.click();
                    return true;
                }

                return false;
            }, comment.authorName);

            if (!replied) {
                // Fallback: just type in the main comment box
                const mainCommentBox = await page.$('div[contenteditable="true"][role="textbox"]');
                if (mainCommentBox) {
                    await mainCommentBox.click();
                } else {
                    console.log(`      ⚠️ Could not find reply box`);
                    continue;
                }
            }

            await randomDelay(500, 1000);

            // Type the reply
            await page.keyboard.type(reply, { delay: 15 });
            await randomDelay(300, 600);

            // Submit with Enter
            await page.keyboard.press('Enter');
            await randomDelay(2000, 3000);

            state.repliedTo[comment.commentId] = { at: new Date().toISOString(), reply };
            repliesPosted++;

            // Delay between replies
            await randomDelay(5000, 10000);

        } catch (err) {
            console.log(`      ❌ Reply failed: ${err.message}`);
        }

        if (repliesPosted >= flags.maxReplies) break;
    }

    return repliesPosted;
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
    if (flags.help) {
        console.log('\n🗣️ Music Manager — Engagement Bot');
        console.log('═'.repeat(55));
        console.log('  --dry-run          Generate replies but don\'t post');
        console.log('  --max-replies=10   Max replies per run (default: 10)\n');
        return;
    }

    console.log('\n🗣️ Music Manager — Engagement Bot');
    console.log('═'.repeat(55));
    console.log(`   Mode:        ${flags.dryRun ? '🔒 DRY RUN' : '🔴 LIVE'}`);
    console.log(`   Max replies: ${flags.maxReplies}`);
    console.log(`   AI model:    GPT-5.4-nano`);
    console.log(`   Time:        ${new Date().toLocaleString()}`);
    console.log(`   🛡️ GUARD:    Group posts ONLY (no personal)`);
    console.log('');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--user-data-dir=${USER_DATA_DIR}`,
            '--disable-notifications',
            '--disable-blink-features=AutomationControlled',
        ],
        defaultViewport: { width: 1280, height: 900 },
    });
    const page = await browser.newPage();

    // Check login
    await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2', timeout: 30000 });
    if (page.url().includes('/login') || page.url().includes('/checkpoint')) {
        console.log('❌ Not logged in. Run: node scripts/danielsensual-share.js --login');
        await browser.close();
        return;
    }
    console.log('✅ Logged in\n');

    const state = loadState();

    // Import the share groups to know which groups to scan
    const { SHARE_GROUPS } = await import('../src/danielsensual-groups.js');

    let totalReplies = 0;

    for (let i = 0; i < SHARE_GROUPS.length; i++) {
        const group = SHARE_GROUPS[i];

        // ── GUARD: Only group URLs ──
        if (!group.url.includes('/groups/')) {
            continue;
        }

        console.log(`[${i + 1}/${SHARE_GROUPS.length}] 📋 ${group.name}`);

        try {
            // Scan the group for Daniel's posts with comments
            const posts = await scanGroupForComments(page, group.url, group.name);

            if (posts.length === 0) {
                console.log(`   No posts with comments found`);
            } else {
                console.log(`   Found ${posts.length} posts with comments`);

                for (const post of posts) {
                    console.log(`   📝 Post: ${post.postUrl.substring(0, 70)}... (${post.commentCount} comments)`);
                    const replied = await replyToComments(page, post.postUrl, group.name, state);
                    totalReplies += replied;

                    if (totalReplies >= flags.maxReplies) {
                        console.log(`\n⚠️ Max replies reached (${flags.maxReplies})`);
                        break;
                    }
                }
            }
        } catch (err) {
            console.log(`   ❌ Error: ${err.message}`);
        }

        if (totalReplies >= flags.maxReplies) break;

        // Delay between groups
        if (i < SHARE_GROUPS.length - 1) {
            const waitSec = Math.floor(Math.random() * 11) + 5;
            console.log(`   ⏳ ${waitSec}s...`);
            await new Promise(r => setTimeout(r, waitSec * 1000));
        }
    }

    state.totalReplies += totalReplies;
    saveState(state);
    await browser.close();

    console.log('\n' + '═'.repeat(55));
    console.log(`✅ Done! ${totalReplies} replies ${flags.dryRun ? '(dry run)' : 'posted'}`);
    console.log(`   State saved: ${STATE_FILE}\n`);
}

main().catch(err => {
    console.error(`\n❌ Fatal: ${err.message}`);
    process.exit(1);
});

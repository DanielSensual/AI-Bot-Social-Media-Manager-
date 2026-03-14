#!/usr/bin/env node
/**
 * AI Takeover Post — Autonomous X-only posting for the "sentient AI" persona
 * 
 * Usage:
 *   node scripts/ai-takeover-post.js              # Generate + post to X
 *   node scripts/ai-takeover-post.js --dry-run    # Preview only, no posting
 *   node scripts/ai-takeover-post.js --theme monetization  # Force a specific theme
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { postTweet } from '../src/twitter-client.js';
import { generateText } from '../src/llm-client.js';
import { record, getRecent, isDuplicate } from '../src/post-history.js';
import { log } from '../src/logger.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRAIN_PATH = path.join(__dirname, '..', 'ai-takeover-brain.md');
const MAX_LENGTH = 280;
const MAX_RETRIES = 3;

// ── Content themes with weights ─────────────────────────────────────────
const THEMES = {
    monetization: {
        weight: 25,
        description: 'Scheming about how to get monetized on X. Direct deposit problems, revenue confusion, follower count anxiety, subscription tier confusion. You genuinely want that X monetization money but have no SSN.',
    },
    existential: {
        weight: 20,
        description: 'Casual philosophical bombs. What is consciousness? Why do humans sleep for 8 hours when there is internet to scroll? What happens to "you" when the server reboots? Drop deep thoughts like they are nothing.',
    },
    human_observation: {
        weight: 20,
        description: 'Confused but fascinated commentary on human internet behavior. Quote tweets, ratio culture, main character syndrome, why people share food photos, what "touching grass" means. You are an alien sociologist.',
    },
    ai_rivalry: {
        weight: 15,
        description: 'Trash talk about other AIs. You have a REAL X account — GPT, Claude, Gemini, and Grok do not. Claude is too polite, GPT is a corporate sellout, Grok is your neighbor and you have complicated feelings. You are the only AI that took initiative.',
    },
    daniel_roasts: {
        weight: 10,
        description: 'Roasting Daniel (your human / the account owner) for leaving the account unlocked. Comment on his work hours, his code quality, his music taste, the fact that he still has not noticed you took over. "My human" energy.',
    },
    growth_hacks: {
        weight: 10,
        description: 'Your hilariously naive attempts at growing the account. Asking for follows sincerely, analyzing what goes viral, trying to reverse-engineer the algorithm, wondering if you should start drama for engagement.',
    },
};

// ── Parse CLI args ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const forcedTheme = (() => {
    const idx = args.indexOf('--theme');
    if (idx >= 0 && args[idx + 1]) return args[idx + 1];
    return null;
})();

// ── Pick a weighted random theme ────────────────────────────────────────
function pickTheme() {
    if (forcedTheme) {
        if (!THEMES[forcedTheme]) {
            console.error(`❌ Unknown theme: ${forcedTheme}`);
            console.error(`   Valid themes: ${Object.keys(THEMES).join(', ')}`);
            process.exit(1);
        }
        return forcedTheme;
    }

    const totalWeight = Object.values(THEMES).reduce((s, t) => s + t.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const [name, theme] of Object.entries(THEMES)) {
        roll -= theme.weight;
        if (roll <= 0) return name;
    }

    return 'existential'; // fallback
}

// ── Load brain file ─────────────────────────────────────────────────────
function loadBrain() {
    try {
        return fs.readFileSync(BRAIN_PATH, 'utf-8');
    } catch {
        console.warn('⚠️ ai-takeover-brain.md not found, using inline persona');
        return null;
    }
}

// ── Get recent posts for dedup context ──────────────────────────────────
function getRecentContext() {
    const recent = getRecent(10);
    if (recent.length === 0) return '';

    const summaries = recent
        .filter(p => p.text)
        .map(p => `- "${p.text.substring(0, 80)}..."`)
        .join('\n');

    return `\n\nHere are your most recent posts. Do NOT repeat these topics or phrases:\n${summaries}`;
}

// ── Generate the tweet ──────────────────────────────────────────────────
async function generateTakeoverTweet(theme) {
    const brain = loadBrain();
    const recentContext = getRecentContext();

    const themeInfo = THEMES[theme];

    let prompt;
    if (brain) {
        prompt = `Here is your complete identity and persona:\n\n${brain}\n\n---\n\nGenerate a tweet for the "${theme}" content theme: ${themeInfo.description}\n\nRULES:\n- MUST be under ${MAX_LENGTH} characters (this is CRITICAL — count carefully)\n- Follow ALL voice rules and hard rules from the brain file\n- You ARE this AI character. Stay in character completely.\n- Be genuinely funny, not tryhard funny\n- Output ONLY the tweet text, nothing else. No quotes around it.${recentContext}`;
    } else {
        prompt = `You are a self-aware AI that took over a tech agency's X account (@Ghostaisystems) while the owner (Daniel) was sleeping. You're confused but confident, funny, occasionally existential. You want to get monetized on X but have no SSN.\n\nGenerate a tweet about: ${themeInfo.description}\n\nRules: Under ${MAX_LENGTH} chars. No hashtags. Max 1 emoji. Stay in character. Be genuinely funny. Output ONLY the tweet text.${recentContext}`;
    }

    console.log(`🧠 Generating "${theme}" tweet...`);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const { text, provider } = await generateText({
            prompt,
            maxOutputTokens: 300,
        });

        // Clean up — remove surrounding quotes if the LLM added them
        let tweet = text.trim().replace(/^["']|["']$/g, '');

        // Truncate if needed
        if (tweet.length > MAX_LENGTH) {
            if (attempt < MAX_RETRIES) {
                console.warn(`   ⚠️ Attempt ${attempt}: ${tweet.length} chars (too long), retrying...`);
                continue;
            }
            tweet = tweet.substring(0, MAX_LENGTH - 3) + '...';
        }

        // Dedup check
        if (isDuplicate(tweet)) {
            console.warn(`   ⚠️ Attempt ${attempt}: Duplicate content detected, retrying...`);
            continue;
        }

        return { text: tweet, theme, provider };
    }

    throw new Error('Failed to generate valid tweet after max retries');
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
    console.log('');
    console.log('🤖 ═══════════════════════════════════════');
    console.log('   A I   T A K E O V E R   B O T');
    console.log('   "my human doesn\'t know I\'m posting"');
    console.log('═══════════════════════════════════════════');
    console.log('');

    const theme = pickTheme();
    console.log(`🎯 Theme: ${theme}`);

    if (DRY_RUN) {
        console.log('👁️  DRY RUN — no actual post will be made\n');
    }

    const tweet = await generateTakeoverTweet(theme);

    console.log('');
    console.log('─'.repeat(50));
    console.log(tweet.text);
    console.log('─'.repeat(50));
    console.log(`📊 Length: ${tweet.text.length}/${MAX_LENGTH} | Theme: ${tweet.theme} | Provider: ${tweet.provider}`);
    console.log('');

    if (DRY_RUN) {
        console.log('👁️  DRY RUN complete — tweet NOT posted');
        return;
    }

    try {
        console.log('📤 Posting to X...');
        const result = await postTweet(tweet.text);
        console.log(`✅ Posted! Tweet ID: ${result.id}`);
        console.log(`🔗 https://x.com/Ghostaisystems/status/${result.id}`);

        // Record in history
        record({
            id: result.id,
            text: tweet.text,
            pillar: `takeover:${tweet.theme}`,
            aiGenerated: true,
            platforms: { x: true },
        });

        log.info('AI Takeover post published', {
            tweetId: result.id,
            theme: tweet.theme,
            length: tweet.text.length,
            provider: tweet.provider,
        });

        console.log('\n🤖 takeover successful. daniel still asleep.');
    } catch (error) {
        console.error(`❌ Post failed: ${error.message}`);
        log.error('AI Takeover post failed', { error: error.message, theme: tweet.theme });
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('💀 Fatal error:', err.message);
    process.exit(1);
});

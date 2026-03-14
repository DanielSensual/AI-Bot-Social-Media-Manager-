#!/usr/bin/env node
/**
 * Quick post script for manual tweets
 * Usage: node scripts/post-now.js "Your tweet text"
 *        node scripts/post-now.js --generate [pillar]
 *        node scripts/post-now.js --generate --provider=grok [pillar]
 *        node scripts/post-now.js --template [pillar]
 */

import dotenv from 'dotenv';
import { postTweet } from '../src/twitter-client.js';
import { generateTweet, generateAITweet, getTweetByPillar } from '../src/content-library.js';

dotenv.config();

const VALID_PILLARS = ['value', 'hotTakes', 'portfolio', 'bts', 'cta'];
const VALID_PROVIDERS = ['auto', 'openai', 'gemini', 'grok'];

function parseArgs(argv) {
    let mode = 'manual';
    let pillar = null;
    let provider = 'auto';
    let manualText = '';

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === '--generate') {
            mode = 'ai';
            continue;
        }

        if (arg === '--template') {
            mode = 'template';
            continue;
        }

        if (arg.startsWith('--provider=')) {
            provider = arg.split('=')[1].toLowerCase();
            if (!VALID_PROVIDERS.includes(provider)) {
                console.error(`❌ Unknown provider: ${provider}`);
                console.error(`   Valid providers: ${VALID_PROVIDERS.join(', ')}`);
                process.exit(1);
            }
            continue;
        }

        if (arg === '--provider') {
            const next = argv[i + 1];
            if (!next || next.startsWith('-')) {
                console.error('❌ Missing value for --provider');
                process.exit(1);
            }
            provider = next.toLowerCase();
            if (!VALID_PROVIDERS.includes(provider)) {
                console.error(`❌ Unknown provider: ${provider}`);
                console.error(`   Valid providers: ${VALID_PROVIDERS.join(', ')}`);
                process.exit(1);
            }
            i += 1;
            continue;
        }

        // Check if it's a pillar name (only valid after --generate or --template)
        if ((mode === 'ai' || mode === 'template') && VALID_PILLARS.includes(arg)) {
            pillar = arg;
            continue;
        }

        // Otherwise it's manual text
        if (mode === 'manual') {
            manualText = argv.slice(i).join(' ');
            break;
        }
    }

    return { mode, pillar, provider, manualText };
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage:');
        console.log('  node scripts/post-now.js "Your tweet text"');
        console.log('  node scripts/post-now.js --generate                    # AI-generated (auto provider)');
        console.log('  node scripts/post-now.js --generate --provider=grok    # AI via Grok');
        console.log('  node scripts/post-now.js --generate --provider=gemini  # AI via Gemini');
        console.log('  node scripts/post-now.js --generate value              # AI, specific pillar');
        console.log('  node scripts/post-now.js --template                    # Old template-based');
        console.log('  node scripts/post-now.js --template cta                # Template, specific pillar');
        process.exit(1);
    }

    const { mode, pillar, provider, manualText } = parseArgs(args);
    let tweetText;

    if (mode === 'ai') {
        const pillarLabel = pillar || 'random';
        const providerLabel = provider === 'auto' ? 'auto (OpenAI → Grok → Gemini)' : provider;
        console.log(`🧠 AI-generating ${pillarLabel} tweet via ${providerLabel}...\n`);

        const tweet = await generateAITweet({
            pillar: pillar || undefined,
            provider,
        });

        console.log(`🎯 Pillar: ${tweet.pillar}`);
        console.log(`🤖 Provider: ${provider}`);
        tweetText = tweet.text;
    } else if (mode === 'template') {
        if (pillar) {
            console.log(`📝 Generating ${pillar} tweet from templates...\n`);
            tweetText = getTweetByPillar(pillar);
        } else {
            console.log('📝 Generating random tweet from templates...\n');
            const tweet = generateTweet();
            console.log(`🎯 Pillar: ${tweet.pillar}`);
            tweetText = tweet.text;
        }
    } else {
        tweetText = manualText;
    }

    console.log('Tweet to post:');
    console.log('─'.repeat(40));
    console.log(tweetText);
    console.log('─'.repeat(40));
    console.log(`Length: ${tweetText.length}/280\n`);

    try {
        const result = await postTweet(tweetText);
        console.log(`\n🎉 Success! View at: https://x.com/i/status/${result.id}`);
    } catch (error) {
        console.error('❌ Failed:', error.message);
        if (error.data) {
            console.error(JSON.stringify(error.data, null, 2));
        }
        process.exit(1);
    }
}

main();

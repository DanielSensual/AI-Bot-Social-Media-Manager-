#!/usr/bin/env node
/**
 * Unified Dual-Post Script - Posts to X and LinkedIn simultaneously
 * Supports text-only, image posts, and AI-generated video posts
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { postTweet, postTweetWithMedia, postTweetWithVideo } from '../src/twitter-client.js';
import { postToLinkedIn, postToLinkedInWithImage, postToLinkedInWithVideo, testLinkedInConnection } from '../src/linkedin-client.js';
import { generateTweet } from '../src/content-library.js';
import { generateVideo, cleanupCache } from '../src/video-generator.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse CLI arguments
const args = process.argv.slice(2);
const flags = {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    xOnly: args.includes('--x-only'),
    linkedinOnly: args.includes('--linkedin-only'),
    image: args.find(a => a.startsWith('--image='))?.split('=')[1],
    video: args.includes('--video') || args.includes('-v'),
    videoPrompt: args.find(a => a.startsWith('--video-prompt='))?.split('=')[1],
    generate: args.includes('--generate') || args.includes('-g'),
    help: args.includes('--help') || args.includes('-h'),
};

// Get text content (remaining args that aren't flags)
let content = args.filter(a => !a.startsWith('-')).join(' ').trim();

function showHelp() {
    console.log(`
🎬 Ghost AI Unified Post - With Video Generation!
═══════════════════════════════════════════════════

Usage:
  node post-all.js [content] [options]

Options:
  --generate, -g          Generate AI content automatically
  --video, -v             Generate AI video from content/prompt
  --video-prompt="..."    Custom prompt for video generation
  --image=/path/to/file   Attach an image to the post
  --dry-run, -d           Preview without posting
  --x-only                Post only to X (Twitter)
  --linkedin-only         Post only to LinkedIn
  --help, -h              Show this help

Examples:
  # Text post to both platforms
  node post-all.js "AI is revolutionizing marketing!"

  # Generate text + AI video
  node post-all.js --generate --video

  # Custom text with generated video
  node post-all.js "The future is here 🚀" --video

  # Custom video prompt (different from post text)
  node post-all.js "AI agents are amazing" --video-prompt="futuristic robot working on computer"

  # With image attachment
  node post-all.js "Check this out!" --image=./assets/demo.png

  # Dry run to preview
  node post-all.js --generate --video --dry-run
`);
}

async function main() {
    if (flags.help) {
        showHelp();
        process.exit(0);
    }

    console.log('');
    console.log('🚀 Ghost AI Unified Post');
    console.log('═'.repeat(50));
    console.log('');

    // Generate content if not provided
    if (!content) {
        if (flags.generate) {
            const generated = generateTweet();
            content = generated.text;
            console.log(`📝 Generated ${generated.pillar.toUpperCase()} content`);
        } else {
            console.error('❌ No content provided. Use --generate or provide text.');
            console.log('   Run with --help for usage examples.');
            process.exit(1);
        }
    }

    // Validate - can't use both image and video
    if (flags.image && flags.video) {
        console.error('❌ Cannot use both --image and --video. Choose one.');
        process.exit(1);
    }

    // Validate image if provided
    let imagePath = null;
    if (flags.image) {
        imagePath = path.resolve(flags.image);
        if (!fs.existsSync(imagePath)) {
            console.error(`❌ Image not found: ${imagePath}`);
            process.exit(1);
        }
        console.log(`🖼️  Image: ${path.basename(imagePath)}`);
    }

    // Generate video if requested
    let videoPath = null;
    if (flags.video) {
        const videoPrompt = flags.videoPrompt || content;
        console.log(`🎬 Video Mode: Will generate AI video`);
        console.log(`   Video prompt: "${videoPrompt.substring(0, 50)}..."`);
    }

    // Display content preview
    console.log('');
    console.log('Content:');
    console.log('─'.repeat(50));
    console.log(content);
    console.log('─'.repeat(50));
    console.log(`Length: ${content.length}/280 (X) | No limit (LinkedIn)`);
    if (flags.video) {
        console.log(`Media: 🎬 AI-Generated Video`);
    } else if (imagePath) {
        console.log(`Media: 🖼️ Image`);
    }
    console.log('');

    if (flags.dryRun) {
        console.log('🔒 DRY RUN - No posts will be made');
        console.log('');
        console.log('Would post to:');
        if (!flags.linkedinOnly) console.log('  ✓ X (Twitter)');
        if (!flags.xOnly) console.log('  ✓ LinkedIn');
        if (flags.video) console.log('  ✓ With AI-generated video');
        if (imagePath) console.log(`  ✓ With image: ${path.basename(imagePath)}`);
        process.exit(0);
    }

    // Generate video if needed (before posting)
    if (flags.video) {
        const videoPrompt = flags.videoPrompt || content;
        console.log('');
        console.log('═'.repeat(50));
        console.log('🎬 AI VIDEO GENERATION');
        console.log('═'.repeat(50));

        try {
            // Clean up old cached videos
            cleanupCache();

            videoPath = await generateVideo(videoPrompt, {
                aspectRatio: '16:9',
                duration: 5,
            });
        } catch (error) {
            console.error(`\n❌ Video generation failed: ${error.message}`);
            console.log('   Falling back to text-only post...');
        }
    }

    const results = {
        x: null,
        linkedin: null,
    };

    console.log('');
    console.log('═'.repeat(50));
    console.log('📤 POSTING');
    console.log('═'.repeat(50));

    // Post to X
    if (!flags.linkedinOnly) {
        try {
            console.log('\n📤 Posting to X...');
            if (videoPath) {
                results.x = await postTweetWithVideo(content, videoPath);
            } else if (imagePath) {
                results.x = await postTweetWithMedia(content, imagePath);
            } else {
                results.x = await postTweet(content);
            }
        } catch (error) {
            console.error(`❌ X failed: ${error.message}`);
        }
    }

    // Post to LinkedIn
    if (!flags.xOnly) {
        try {
            // Verify LinkedIn connection first
            const connected = await testLinkedInConnection().catch(() => false);
            if (!connected) {
                console.error('❌ LinkedIn not authenticated. Run: npm run linkedin:auth');
            } else {
                console.log('\n📤 Posting to LinkedIn...');
                if (videoPath) {
                    results.linkedin = await postToLinkedInWithVideo(content, videoPath);
                } else if (imagePath) {
                    results.linkedin = await postToLinkedInWithImage(content, imagePath);
                } else {
                    results.linkedin = await postToLinkedIn(content);
                }
            }
        } catch (error) {
            console.error(`❌ LinkedIn failed: ${error.message}`);
        }
    }

    // Summary
    console.log('');
    console.log('═'.repeat(50));
    console.log('📊 RESULTS');
    console.log('═'.repeat(50));

    if (results.x) {
        console.log(`  ✅ X: https://x.com/i/status/${results.x.id}`);
    } else if (!flags.linkedinOnly) {
        console.log('  ❌ X: Failed');
    }

    if (results.linkedin) {
        console.log(`  ✅ LinkedIn: Posted successfully`);
    } else if (!flags.xOnly) {
        console.log('  ❌ LinkedIn: Failed or skipped');
    }

    if (videoPath) {
        console.log(`  🎬 Video: ${path.basename(videoPath)}`);
    }

    console.log('');
}

main().catch(console.error);

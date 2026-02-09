#!/usr/bin/env node
/**
 * Unified Trident Post Script - Posts to X, LinkedIn, and Facebook simultaneously
 * Supports text-only, image posts, and AI-generated video posts
 * Optional smart content adaptation per platform
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { postTweet, postTweetWithMedia, postTweetWithVideo } from '../src/twitter-client.js';
import { postToLinkedIn, postToLinkedInWithImage, postToLinkedInWithVideo, testLinkedInConnection } from '../src/linkedin-client.js';
import { postToFacebook, postToFacebookWithImage, postToFacebookWithVideo, testFacebookConnection } from '../src/facebook-client.js';
import { generateTweet, generateAITweet } from '../src/content-library.js';
import { generateVideo, cleanupCache } from '../src/video-generator.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse CLI arguments
const args = process.argv.slice(2);
const flags = {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    xOnly: args.includes('--x-only'),
    linkedinOnly: args.includes('--linkedin-only'),
    facebookOnly: args.includes('--facebook-only'),
    noFacebook: args.includes('--no-facebook'),
    noLinkedin: args.includes('--no-linkedin'),
    noX: args.includes('--no-x'),
    adapt: args.includes('--adapt'),
    image: args.find(a => a.startsWith('--image='))?.split('=')[1],
    video: args.includes('--video') || args.includes('-v'),
    videoPrompt: args.find(a => a.startsWith('--video-prompt='))?.split('=')[1],
    generate: args.includes('--generate') || args.includes('-g'),
    ai: args.includes('--ai') || args.includes('-a'), // GPT-5.2 thinking mode
    help: args.includes('--help') || args.includes('-h'),
};

// Get text content (remaining args that aren't flags)
let content = args.filter(a => !a.startsWith('-')).join(' ').trim();

function showHelp() {
    console.log(`
🔱 Ghost AI Trident Post — X + LinkedIn + Facebook
═══════════════════════════════════════════════════

Usage:
  node post-all.js [content] [options]

Content:
  --generate, -g          Generate content from templates
  --ai, -a                Generate AI content using GPT-5.2 thinking 🧠

Media:
  --video, -v             Generate AI video from content/prompt
  --video-prompt="..."    Custom prompt for video generation
  --image=/path/to/file   Attach an image to the post

Platform filters:
  --x-only                Post only to X (Twitter)
  --linkedin-only         Post only to LinkedIn
  --facebook-only         Post only to Facebook
  --no-x                  Skip X
  --no-linkedin           Skip LinkedIn
  --no-facebook           Skip Facebook

Other:
  --adapt                 Smart-adapt content per platform (AI)
  --dry-run, -d           Preview without posting
  --help, -h              Show this help

Examples:
  # Triple-post to all platforms
  node post-all.js --ai

  # AI content + AI video to all
  node post-all.js --ai --video

  # Post only to Facebook
  node post-all.js "Check this out!" --facebook-only

  # Adapt content per platform
  node post-all.js --ai --adapt

  # Dry run to preview
  node post-all.js --ai --video --dry-run
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
        if (flags.ai) {
            // Use GPT-5.2 thinking for AI generation
            const generated = await generateAITweet({ controversial: true });
            content = generated.text;
            console.log(`🧠 AI Generated ${generated.pillar.toUpperCase()} content (GPT-5.2-thinking)`);
        } else if (flags.generate) {
            // Use template-based generation
            const generated = generateTweet();
            content = generated.text;
            console.log(`📝 Template Generated ${generated.pillar.toUpperCase()} content`);
        } else {
            console.error('❌ No content provided. Use --ai, --generate, or provide text.');
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

    // Determine active platforms
    const postToX = flags.xOnly || flags.facebookOnly || flags.linkedinOnly
        ? flags.xOnly
        : !flags.noX;
    const postToLI = flags.xOnly || flags.facebookOnly || flags.linkedinOnly
        ? flags.linkedinOnly
        : !flags.noLinkedin;
    const postToFB = flags.xOnly || flags.facebookOnly || flags.linkedinOnly
        ? flags.facebookOnly
        : !flags.noFacebook;

    if (flags.dryRun) {
        console.log('🔒 DRY RUN - No posts will be made');
        console.log('');
        console.log('Would post to:');
        if (postToX) console.log('  ✓ X (Twitter)');
        if (postToLI) console.log('  ✓ LinkedIn');
        if (postToFB) console.log('  ✓ Facebook');
        if (flags.video) console.log('  ✓ With AI-generated video');
        if (imagePath) console.log(`  ✓ With image: ${path.basename(imagePath)}`);
        if (flags.adapt) console.log('  ✓ Smart content adaptation');
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
        facebook: null,
    };

    console.log('');
    console.log('═'.repeat(50));
    console.log('🔱 TRIDENT POSTING');
    console.log('═'.repeat(50));

    // Post to X
    if (postToX) {
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
    if (postToLI) {
        try {
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

    // Post to Facebook
    if (postToFB) {
        try {
            const fbConnected = await testFacebookConnection().catch(() => false);
            if (!fbConnected || fbConnected.type === 'user_no_pages') {
                console.error('❌ Facebook page access not ready. Check token permissions.');
            } else {
                console.log('\n📤 Posting to Facebook...');
                if (videoPath) {
                    results.facebook = await postToFacebookWithVideo(content, videoPath);
                } else if (imagePath) {
                    results.facebook = await postToFacebookWithImage(content, imagePath);
                } else {
                    results.facebook = await postToFacebook(content);
                }
            }
        } catch (error) {
            console.error(`❌ Facebook failed: ${error.message}`);
        }
    }

    // Summary
    console.log('');
    console.log('═'.repeat(50));
    console.log('🔱 TRIDENT RESULTS');
    console.log('═'.repeat(50));

    if (results.x) {
        console.log(`  ✅ X: https://x.com/i/status/${results.x.id}`);
    } else if (postToX) {
        console.log('  ❌ X: Failed');
    }

    if (results.linkedin) {
        console.log(`  ✅ LinkedIn: Posted successfully`);
    } else if (postToLI) {
        console.log('  ❌ LinkedIn: Failed or skipped');
    }

    if (results.facebook) {
        console.log(`  ✅ Facebook: Post ID ${results.facebook.post_id || results.facebook.id}`);
    } else if (postToFB) {
        console.log('  ❌ Facebook: Failed or skipped');
    }

    if (videoPath) {
        console.log(`  🎬 Video: ${path.basename(videoPath)}`);
    }

    console.log('');
}

main().catch(console.error);

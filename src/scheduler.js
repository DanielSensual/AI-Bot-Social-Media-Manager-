/**
 * Autonomous Scheduler v2.0
 * Multi-platform (X + LinkedIn + Facebook) with AI content generation and video support
 */

import cron from 'node-cron';
import { config } from './config.js';
import { postTweet, postTweetWithMedia, postTweetWithVideo, testConnection } from './twitter-client.js';
import { postToLinkedIn, postToLinkedInWithImage, postToLinkedInWithVideo, testLinkedInConnection, ensureTokenHealth } from './linkedin-client.js';
import { postToFacebook, postToFacebookWithImage, postToFacebookWithVideo, testFacebookConnection } from './facebook-client.js';
import { postToInstagram, postInstagramReel, testInstagramConnection, uploadToTempHost } from './instagram-client.js';
import { generateTweet, generateAITweet } from './content-library.js';
import { adaptForAll } from './content-adapter.js';
import { generateVideo, cleanupCache } from './video-generator.js';
import { generateImage, cleanupImageCache } from './image-generator.js';
import { isDuplicate, record } from './post-history.js';
import { alertPostFailure, alertHealthCheckFailure, recordFailure, clearFailure } from './alerting.js';
import { getTopPerformingExamples } from './content-feedback.js';

/**
 * Decide whether to use a feature based on configured ratio (0-100)
 */
export function shouldUse(ratio) {
    return Math.random() * 100 < ratio;
}

/**
 * Autonomous post — generates content, optionally creates video,
 * and posts to all active platforms
 */
async function autonomousPost() {
    const isDryRun = process.env.DRY_RUN === 'true';
    const { autonomy } = config;
    const timestamp = new Date().toLocaleString('en-US', { timeZone: config.schedule.timezone });

    console.log(`\n${'═'.repeat(50)}`);
    console.log(`⏰ [${timestamp}] Autonomous post triggered`);
    console.log('═'.repeat(50));

    // Health check if enabled
    if (autonomy.healthCheck) {
        console.log('\n🩺 Running health checks...');
        if (autonomy.platforms.x) {
            const xOk = await testConnection().catch(() => false);
            if (!xOk) {
                console.warn('   ⚠️ X API health check failed — will attempt post anyway');
                alertHealthCheckFailure('X', new Error('Connection test failed')).catch(() => { });
            }
        }
        if (autonomy.platforms.linkedin) {
            // Check token health + refresh if needed
            await ensureTokenHealth().catch(() => { });
            const liOk = await testLinkedInConnection().catch(() => false);
            if (!liOk) {
                console.warn('   ⚠️ LinkedIn health check failed — will skip LinkedIn');
                alertHealthCheckFailure('LinkedIn', new Error('Connection test failed')).catch(() => { });
            }
        }
        if (autonomy.platforms.facebook) {
            const fbOk = await testFacebookConnection().catch(() => false);
            if (!fbOk) {
                console.warn('   ⚠️ Facebook health check failed — will skip Facebook');
                alertHealthCheckFailure('Facebook', new Error('Connection test failed')).catch(() => { });
            }
        }
        if (autonomy.platforms.instagram) {
            const igOk = await testInstagramConnection().catch(() => false);
            if (!igOk) {
                console.warn('   ⚠️ Instagram health check failed — will skip Instagram');
                alertHealthCheckFailure('Instagram', new Error('Connection test failed')).catch(() => { });
            }
        }
    }

    // Decide content strategy
    const useAI = shouldUse(autonomy.aiRatio);
    const useVideo = shouldUse(autonomy.videoRatio);

    console.log(`\n📋 Strategy: ${useAI ? '🧠 AI' : '📝 Template'} | ${useVideo ? '🎬 Video' : '📄 Text-only'}`);

    // Generate content (with dedup retry)
    let content;
    let attempts = 0;
    const maxAttempts = 5;

    do {
        try {
            if (useAI) {
                content = await generateAITweet({ controversial: true });
                console.log(`🧠 AI Generated [${content.pillar.toUpperCase()}] content`);
            } else {
                content = generateTweet();
                console.log(`📝 Template Generated [${content.pillar.toUpperCase()}] content`);
            }
        } catch (error) {
            console.error(`❌ AI generation failed, falling back to template: ${error.message}`);
            content = generateTweet();
        }
        attempts++;
    } while (isDuplicate(content.text) && attempts < maxAttempts);

    if (isDuplicate(content.text)) {
        console.warn('⚠️ Could not generate unique content after 5 attempts, posting anyway');
    }

    console.log(`\n${content.text}\n`);
    console.log(`📊 Length: ${content.length}/280 | Pillar: ${content.pillar}`);

    if (isDryRun) {
        console.log('\n🔒 DRY RUN — No posts made');
        const platforms = [
            autonomy.platforms.x && 'X',
            autonomy.platforms.linkedin && 'LinkedIn',
            autonomy.platforms.facebook && 'Facebook',
            autonomy.platforms.instagram && 'Instagram',
        ].filter(Boolean).join(' + ');
        console.log(`   Would post to: ${platforms}`);
        if (useVideo) console.log('   Would generate AI video');
        if (autonomy.contentAdapt) console.log('   Would adapt content per platform');
        return;
    }

    // Generate video if decided
    let videoPath = null;
    let imagePath = null;

    if (useVideo) {
        try {
            console.log('\n🎬 Generating AI video...');
            cleanupCache();
            videoPath = await generateVideo(content.text, {
                aspectRatio: '16:9',
                duration: 5,
            });
        } catch (error) {
            console.error(`❌ Video generation failed: ${error.message}`);
            console.log('   Falling back to image generation...');
        }
    }

    // Generate image if no video (ensures Instagram always has media)
    if (!videoPath) {
        try {
            console.log('\n🎨 Generating branded image...');
            cleanupImageCache();
            imagePath = await generateImage(content.text, { style: 'bold', pillar: content.pillar });
        } catch (error) {
            console.warn(`⚠️ Image generation failed: ${error.message}`);
            console.log('   Proceeding with text-only post');
        }
    }

    const results = { x: null, linkedin: null, facebook: null, instagram: null };

    // Smart content adaptation
    let adapted = null;
    if (autonomy.contentAdapt) {
        try {
            console.log('\n🎯 Adapting content per platform...');
            adapted = await adaptForAll(content.text);
            console.log('   ✅ Content adapted for all platforms');
        } catch (error) {
            console.warn(`   ⚠️ Adaptation failed, using original: ${error.message}`);
        }
    }

    const getText = (platform) => adapted?.[platform] || content.text;

    // ═══════════════════════════════════════════════════════════════════════════
    // Platform Adapters — single source of truth for all platform posting logic
    // ═══════════════════════════════════════════════════════════════════════════
    const PLATFORM_ADAPTERS = [
        {
            key: 'x',
            name: 'X',
            enabled: autonomy.platforms.x,
            postText: (text) => postTweet(text),
            postImage: (text, img) => postTweetWithMedia(text, img),
            postVideo: (text, vid) => postTweetWithVideo(text, vid),
        },
        {
            key: 'linkedin',
            name: 'LinkedIn',
            enabled: autonomy.platforms.linkedin,
            preCheck: async () => {
                const ok = await testLinkedInConnection().catch(() => false);
                if (!ok) console.warn('   ⚠️ LinkedIn not authenticated, skipping');
                return ok;
            },
            postText: (text) => postToLinkedIn(text),
            postImage: (text, img) => postToLinkedInWithImage(text, img),
            postVideo: (text, vid) => postToLinkedInWithVideo(text, vid),
        },
        {
            key: 'facebook',
            name: 'Facebook',
            enabled: autonomy.platforms.facebook,
            preCheck: async () => {
                const result = await testFacebookConnection().catch(() => false);
                if (!result || result.type === 'user_no_pages') {
                    console.warn('   ⚠️ Facebook not ready (no page access), skipping');
                    return false;
                }
                return true;
            },
            postText: (text) => postToFacebook(text),
            postImage: (text, img) => postToFacebookWithImage(text, img),
            postVideo: (text, vid) => postToFacebookWithVideo(text, vid),
        },
        {
            key: 'instagram',
            name: 'Instagram',
            enabled: autonomy.platforms.instagram,
            requiresMedia: true,
            preCheck: async () => {
                const ok = await testInstagramConnection().catch(() => false);
                if (!ok) console.warn('   ⚠️ Instagram not connected, skipping');
                return ok;
            },
            postText: null, // IG requires media
            postImage: async (text, img) => {
                const publicUrl = await uploadToTempHost(img);
                return postToInstagram(text, publicUrl);
            },
            postVideo: async (text, vid) => {
                const publicUrl = await uploadToTempHost(vid);
                return postInstagramReel(text, publicUrl);
            },
        },
    ];

    // Unified posting loop
    for (const adapter of PLATFORM_ADAPTERS) {
        if (!adapter.enabled) continue;

        try {
            // Run platform-specific pre-check (auth, page access, etc.)
            if (adapter.preCheck) {
                const ready = await adapter.preCheck();
                if (!ready) continue;
            }

            console.log(`\n📤 Posting to ${adapter.name}...`);
            const platformText = getText(adapter.key);

            // Skip text-only if platform requires media
            if (!videoPath && !imagePath && adapter.requiresMedia) {
                console.log(`   ⚠️ ${adapter.name} requires media — skipping text-only post`);
                continue;
            }

            if (videoPath && adapter.postVideo) {
                results[adapter.key] = await adapter.postVideo(platformText, videoPath);
            } else if (imagePath && adapter.postImage) {
                results[adapter.key] = await adapter.postImage(platformText, imagePath);
            } else if (adapter.postText) {
                results[adapter.key] = await adapter.postText(platformText);
            }

            clearFailure(adapter.name);
        } catch (error) {
            console.error(`❌ ${adapter.name} post failed: ${error.message}`);
            recordFailure(adapter.name);
            alertPostFailure(adapter.name, error).catch(() => { });
        }
    }

    // Record to persistent history
    record({
        text: content.text,
        pillar: content.pillar,
        aiGenerated: useAI,
        hasVideo: !!videoPath,
        hasImage: !!imagePath,
        results: {
            x: results.x ? `https://x.com/i/status/${results.x.id}` : null,
            linkedin: results.linkedin ? 'posted' : null,
            facebook: results.facebook ? 'posted' : null,
            instagram: results.instagram ? 'posted' : null,
        },
    });

    // Summary
    console.log(`\n${'─'.repeat(50)}`);
    console.log('📊 Post Results:');
    if (results.x) console.log(`  ✅ X: https://x.com/i/status/${results.x.id}`);
    else if (autonomy.platforms.x) console.log('  ❌ X: Failed');
    if (results.linkedin) console.log('  ✅ LinkedIn: Posted');
    else if (autonomy.platforms.linkedin) console.log('  ❌ LinkedIn: Failed or skipped');
    if (results.facebook) console.log('  ✅ Facebook: Posted');
    else if (autonomy.platforms.facebook) console.log('  ❌ Facebook: Failed or skipped');
    if (results.instagram) console.log(`  ✅ Instagram: ${results.instagram.id}`);
    else if (autonomy.platforms.instagram) console.log('  ❌ Instagram: Failed or skipped');
    if (videoPath) console.log(`  🎬 Video: Yes`);
    if (imagePath) console.log(`  🎨 Image: Yes`);
    if (adapted) console.log('  🎯 Content: Adapted per platform');
    console.log('─'.repeat(50));
}

/**
 * Start the autonomous scheduler
 */
export function startScheduler() {
    if (!config.schedule.enabled) {
        console.log('⚠️ Scheduler is disabled in config');
        return;
    }

    const { times, timezone } = config.schedule;
    const { autonomy } = config;

    console.log('🚀 Starting Ghost AI Autonomous Scheduler v2.0');
    console.log(`⏰ Timezone: ${timezone}`);
    console.log(`📅 Posting at: ${times.join(', ')}`);
    console.log(`🧠 AI ratio: ${autonomy.aiRatio}%`);
    console.log(`🎬 Video ratio: ${autonomy.videoRatio}%`);
    console.log(`📡 Platforms: ${[autonomy.platforms.x && 'X', autonomy.platforms.linkedin && 'LinkedIn', autonomy.platforms.facebook && 'Facebook', autonomy.platforms.instagram && 'Instagram'].filter(Boolean).join(' + ')}`);
    if (autonomy.contentAdapt) console.log('🎯 Content adaptation: ON');
    console.log('');

    // Create cron jobs for each scheduled time
    times.forEach((time) => {
        const [hour, minute] = time.split(':');
        const cronExpression = `${minute} ${hour} * * *`;

        cron.schedule(cronExpression, autonomousPost, {
            timezone,
        });

        console.log(`  ✓ Scheduled: ${time} (${cronExpression})`);
    });

    console.log('\n👻 Autonomous bot is running. Press Ctrl+C to stop.\n');
}

/**
 * Post immediately (manual trigger) — now supports AI + video
 */
export async function postNow(customText = null) {
    if (customText) {
        console.log('📤 Posting custom tweet...');
        return postTweet(customText);
    }

    // Use full autonomous flow for manual trigger too
    return autonomousPost();
}

export default { startScheduler, postNow };

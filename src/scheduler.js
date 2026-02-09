/**
 * Autonomous Scheduler v2.0
 * Multi-platform (X + LinkedIn + Facebook) with AI content generation and video support
 */

import cron from 'node-cron';
import { config } from './config.js';
import { postTweet, postTweetWithVideo, testConnection } from './twitter-client.js';
import { postToLinkedIn, postToLinkedInWithVideo, testLinkedInConnection } from './linkedin-client.js';
import { postToFacebook, postToFacebookWithVideo, testFacebookConnection } from './facebook-client.js';
import { postToInstagram, postInstagramReel, testInstagramConnection, uploadToTempHost } from './instagram-client.js';
import { generateTweet, generateAITweet } from './content-library.js';
import { adaptForAll } from './content-adapter.js';
import { generateVideo, cleanupCache } from './video-generator.js';
import { isDuplicate, record } from './post-history.js';

/**
 * Decide whether to use a feature based on configured ratio (0-100)
 */
function shouldUse(ratio) {
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
            if (!xOk) console.warn('   ⚠️ X API health check failed — will attempt post anyway');
        }
        if (autonomy.platforms.linkedin) {
            const liOk = await testLinkedInConnection().catch(() => false);
            if (!liOk) console.warn('   ⚠️ LinkedIn health check failed — will skip LinkedIn');
        }
        if (autonomy.platforms.facebook) {
            const fbOk = await testFacebookConnection().catch(() => false);
            if (!fbOk) console.warn('   ⚠️ Facebook health check failed — will skip Facebook');
        }
        if (autonomy.platforms.instagram) {
            const igOk = await testInstagramConnection().catch(() => false);
            if (!igOk) console.warn('   ⚠️ Instagram health check failed — will skip Instagram');
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
            console.log('   Falling back to text-only post');
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

    // Post to X
    if (autonomy.platforms.x) {
        try {
            console.log('\n📤 Posting to X...');
            if (videoPath) {
                results.x = await postTweetWithVideo(getText('x'), videoPath);
            } else {
                results.x = await postTweet(getText('x'));
            }
        } catch (error) {
            console.error(`❌ X post failed: ${error.message}`);
        }
    }

    // Post to LinkedIn
    if (autonomy.platforms.linkedin) {
        try {
            const connected = await testLinkedInConnection().catch(() => false);
            if (connected) {
                console.log('\n📤 Posting to LinkedIn...');
                if (videoPath) {
                    results.linkedin = await postToLinkedInWithVideo(getText('linkedin'), videoPath);
                } else {
                    results.linkedin = await postToLinkedIn(getText('linkedin'));
                }
            } else {
                console.warn('   ⚠️ LinkedIn not authenticated, skipping');
            }
        } catch (error) {
            console.error(`❌ LinkedIn post failed: ${error.message}`);
        }
    }

    // Post to Facebook
    if (autonomy.platforms.facebook) {
        try {
            const fbConnected = await testFacebookConnection().catch(() => false);
            if (fbConnected && fbConnected.type !== 'user_no_pages') {
                console.log('\n📤 Posting to Facebook...');
                if (videoPath) {
                    results.facebook = await postToFacebookWithVideo(getText('facebook'), videoPath);
                } else {
                    results.facebook = await postToFacebook(getText('facebook'));
                }
            } else {
                console.warn('   ⚠️ Facebook not ready (no page access), skipping');
            }
        } catch (error) {
            console.error(`❌ Facebook post failed: ${error.message}`);
        }
    }

    // Post to Instagram
    if (autonomy.platforms.instagram) {
        try {
            const igConnected = await testInstagramConnection().catch(() => false);
            if (igConnected) {
                console.log('\n📤 Posting to Instagram...');
                if (videoPath) {
                    // Upload video to temp host for IG
                    const publicVideoUrl = await uploadToTempHost(videoPath);
                    results.instagram = await postInstagramReel(getText('instagram'), publicVideoUrl);
                } else {
                    console.log('   ⚠️ Instagram requires media — skipping text-only post');
                }
            } else {
                console.warn('   ⚠️ Instagram not connected, skipping');
            }
        } catch (error) {
            console.error(`❌ Instagram post failed: ${error.message}`);
        }
    }

    // Record to persistent history
    record({
        text: content.text,
        pillar: content.pillar,
        aiGenerated: useAI,
        hasVideo: !!videoPath,
        results: {
            x: results.x ? `https://x.com/i/status/${results.x.id}` : null,
            linkedin: results.linkedin ? 'posted' : null,
            facebook: results.facebook ? 'posted' : null,
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

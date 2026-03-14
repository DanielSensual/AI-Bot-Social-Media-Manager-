#!/usr/bin/env node
/**
 * Bachata Exotica Music Post CLI
 * 
 * Post music content to the Bachata Exotica Facebook page as a label
 * promoting Daniel Sensual's AI-generated bachata music.
 * NOW ACTUALLY PUBLISHES via Graph API + auto-generates cover art.
 *
 * Usage:
 *   node scripts/bachataexotica-music-post.js                    # auto-select content type
 *   node scripts/bachataexotica-music-post.js --dry-run          # preview without posting
 *   node scripts/bachataexotica-music-post.js --type=song_drop   # force content type
 *   node scripts/bachataexotica-music-post.js --type=bts         # behind the scenes
 *   node scripts/bachataexotica-music-post.js --type=engagement  # fan engagement
 *   node scripts/bachataexotica-music-post.js --status           # show current status
 *   node scripts/bachataexotica-music-post.js --cover-art=PATH   # attach cover art
 */

import dotenv from 'dotenv';
import {
    buildMusicPost,
    selectDailyContentType,
    getStatus,
    CONTENT_TYPES,
} from '../src/bachataexotica-music-content.js';
import { getGroupsForContentType, getGroupsSummary } from '../src/bachataexotica-music-groups.js';
import {
    testFacebookConnection,
    postToFacebook,
    postToFacebookWithImage,
} from '../src/facebook-client.js';
import { generateImage, cleanupImageCache } from '../src/image-generator.js';
import { isDuplicate, record } from '../src/post-history.js';

dotenv.config();

const args = process.argv.slice(2);

function getFlagValue(name) {
    const prefix = `--${name}=`;
    const arg = args.find((value) => value.startsWith(prefix));
    return arg ? arg.slice(prefix.length).trim() : '';
}

const DEFAULT_PAGE_ID = process.env.BACHATA_PAGE_ID || '266552527115323';

const flags = {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    help: args.includes('--help') || args.includes('-h'),
    status: args.includes('--status') || args.includes('-s'),
    noAi: args.includes('--no-ai'),
    noImage: args.includes('--no-image'),
    groups: args.includes('--groups'),
    type: getFlagValue('type') || '',
    coverArt: getFlagValue('cover-art') || '',
    songUrl: getFlagValue('song-url') || '',
    pageId: getFlagValue('page-id') || DEFAULT_PAGE_ID,
};

function showHelp() {
    console.log(`
\u{1F3B5} Bachata Exotica Music Post
${'\u2550'.repeat(58)}

Bachata Exotica = the label promoting Daniel Sensual's music.
Posts as the production company, not as the artist.

Usage:
  node scripts/bachataexotica-music-post.js [options]

Options:
  --type=TYPE           Content type: song_drop | bts | engagement
  --cover-art=PATH      Attach cover art image
  --song-url=URL        Include a song streaming link
  --page-id=ID          Target page ID (default: ${DEFAULT_PAGE_ID})
  --no-ai               Use template captions (skip AI)
  --no-image            Skip AI image generation
  --groups              Show target groups for the content type
  --dry-run, -d         Preview the post, do not publish
  --status, -s          Show current content status
  --help, -h            Show this help

Content Type Rotation (daily):
  Day 1 \u2192 song_drop    (new release announcement)
  Day 2 \u2192 bts          (behind the scenes production)
  Day 3 \u2192 engagement   (fan polls, community vibes)
`);
}

function showStatus() {
    const status = getStatus();
    console.log(`
\u{1F3B5} Bachata Exotica Music Bot Status
${'\u2550'.repeat(58)}

Today's content type:  ${status.todayContentType}
Song catalog size:     ${status.songCatalogSize} tracks
Selected song:         ${status.selectedSong}
Has cover art:         ${status.hasCoverArt ? '\u2705 Yes' : '\u274C No'}
Cover art directory:   ${status.coverArtDir}
Content types:         ${status.contentTypes.join(', ')}
${'\u2500'.repeat(58)}
`);

    console.log('Target Groups:');
    const groups = getGroupsSummary();
    for (const g of groups) {
        console.log(`  \u2022 ${g.name} (${g.members}) [${g.categories}]`);
    }
    console.log('');
}

async function main() {
    if (flags.help) {
        showHelp();
        process.exit(0);
    }

    if (flags.status) {
        showStatus();
        process.exit(0);
    }

    // Select content type
    const contentType = flags.type && CONTENT_TYPES.includes(flags.type)
        ? flags.type
        : selectDailyContentType();

    console.log('');
    console.log('\u{1F3B5} Bachata Exotica Music Post');
    console.log('\u2550'.repeat(58));
    console.log(`Content Type: ${contentType}`);
    console.log(`Page ID: ${flags.pageId}`);
    console.log(`Mode: ${flags.dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`AI Captions: ${flags.noAi ? 'DISABLED' : 'ENABLED'}`);
    console.log('\u2500'.repeat(58));

    // Build the post
    const result = await buildMusicPost(contentType, {
        aiEnabled: !flags.noAi,
    });

    console.log('');
    console.log(`Source: ${result.source} ${result.provider ? `(${result.provider}/${result.model})` : ''}`);
    console.log(`Song: ${result.song.title} by ${result.song.artist}`);
    if (result.coverArtPath) {
        console.log(`Cover Art: ${result.coverArtPath}`);
    }
    console.log('\u2500'.repeat(58));
    console.log(result.caption);
    console.log('\u2550'.repeat(58));

    // Show target groups if requested
    if (flags.groups) {
        console.log('');
        console.log('Target Groups for this content type:');
        const groups = getGroupsForContentType(contentType);
        for (const g of groups) {
            console.log(`  \u2022 ${g.name} (${g.members}) \u2014 ${g.notes}`);
        }
        console.log('');
    }

    // Check deduplication
    if (isDuplicate(result.caption)) {
        console.log('');
        console.log('\u26A0\uFE0F Caption is a duplicate of a recent post. Adding timestamp tag.');
        result.caption = `${result.caption}\n\n#BachataExotica ${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    }

    if (flags.dryRun) {
        console.log('');
        console.log('DRY RUN complete. No post was published.');
        process.exit(0);
    }

    // ═══ PUBLISH via Graph API ═══════════════════════════════

    const previousPageId = process.env.FACEBOOK_PAGE_ID;
    const previousPageToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

    try {
        // Target the Bachata Exotica page
        process.env.FACEBOOK_PAGE_ID = flags.pageId;
        process.env.FACEBOOK_PAGE_ACCESS_TOKEN = '';

        const connection = await testFacebookConnection();
        if (!connection || connection.type === 'user_no_pages') {
            throw new Error('Facebook connection failed for Bachata Exotica page.');
        }

        // Resolve image: cover art > AI-generated > none
        let imagePath = result.coverArtPath || (flags.coverArt || null);
        if (!imagePath && !flags.noImage) {
            try {
                const imageStyle = contentType === 'bts' ? 'bachata_music' : 'bachata';
                console.log(`\n\u{1F3A8} Generating AI image (${imageStyle} style)...`);
                imagePath = await generateImage(result.caption, { style: imageStyle });
                console.log(`\u2705 Image generated: ${imagePath}`);
            } catch (imgErr) {
                console.warn(`\u26A0\uFE0F Image generation failed, posting text-only: ${imgErr.message}`);
            }
        }

        let postResult;
        if (imagePath) {
            postResult = await postToFacebookWithImage(result.caption, imagePath);
        } else {
            postResult = await postToFacebook(result.caption);
        }

        const postId = postResult?.post_id || postResult?.id || 'posted';

        // Record in post history
        record({
            text: result.caption,
            pillar: `bachata_music:${contentType}`,
            aiGenerated: result.source === 'ai',
            hasVideo: false,
            hasImage: Boolean(imagePath),
            results: {
                facebook: postId,
            },
        });

        // Clean up old cached images
        try { cleanupImageCache(); } catch { /* ignore */ }

        console.log('');
        console.log(`\u2705 Posted successfully to Bachata Exotica page!`);
        console.log(`Post ID: ${postId}`);
        console.log(`Content Type: ${contentType}`);
        console.log(`Song: ${result.song.title}`);
        if (imagePath) console.log(`Image: ${imagePath}`);

    } catch (err) {
        console.error(`\n\u274C Publish failed: ${err.message}`);
        process.exit(1);
    } finally {
        if (previousPageId === undefined) delete process.env.FACEBOOK_PAGE_ID;
        else process.env.FACEBOOK_PAGE_ID = previousPageId;

        if (previousPageToken === undefined) delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
        else process.env.FACEBOOK_PAGE_ACCESS_TOKEN = previousPageToken;
    }
}

main().catch((error) => {
    console.error(`\u274C Bachata Exotica music post failed: ${error.message}`);
    process.exit(1);
});

#!/usr/bin/env node
/**
 * Bachata Exotica Music Post CLI
 * 
 * Post music content to the Bachata Exotica Facebook page as a label
 * promoting Daniel Sensual's AI-generated bachata music.
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

dotenv.config();

const args = process.argv.slice(2);

function getFlagValue(name) {
    const prefix = `--${name}=`;
    const arg = args.find((value) => value.startsWith(prefix));
    return arg ? arg.slice(prefix.length).trim() : '';
}

const flags = {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    help: args.includes('--help') || args.includes('-h'),
    status: args.includes('--status') || args.includes('-s'),
    noAi: args.includes('--no-ai'),
    groups: args.includes('--groups'),
    type: getFlagValue('type') || '',
    coverArt: getFlagValue('cover-art') || '',
    songUrl: getFlagValue('song-url') || '',
};

function showHelp() {
    console.log(`
🎵 Bachata Exotica Music Post
${'═'.repeat(58)}

Bachata Exotica = the label promoting Daniel Sensual's music.
Posts as the production company, not as the artist.

Usage:
  node scripts/bachataexotica-music-post.js [options]

Options:
  --type=TYPE           Content type: song_drop | bts | engagement
  --cover-art=PATH      Attach cover art image
  --song-url=URL        Include a song streaming link
  --no-ai               Use template captions (skip AI)
  --groups              Show target groups for the content type
  --dry-run, -d         Preview the post, do not publish
  --status, -s          Show current content status
  --help, -h            Show this help

Content Type Rotation (daily):
  Day 1 → song_drop    (new release announcement)
  Day 2 → bts          (behind the scenes production)
  Day 3 → engagement   (fan polls, community vibes)
`);
}

function showStatus() {
    const status = getStatus();
    console.log(`
🎵 Bachata Exotica Music Bot Status
${'═'.repeat(58)}

Today's content type:  ${status.todayContentType}
Song catalog size:     ${status.songCatalogSize} tracks
Selected song:         ${status.selectedSong}
Has cover art:         ${status.hasCoverArt ? '✅ Yes' : '❌ No'}
Cover art directory:   ${status.coverArtDir}
Content types:         ${status.contentTypes.join(', ')}
${'─'.repeat(58)}
`);

    console.log('Target Groups:');
    const groups = getGroupsSummary();
    for (const g of groups) {
        console.log(`  • ${g.name} (${g.members}) [${g.categories}]`);
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
    console.log('🎵 Bachata Exotica Music Post');
    console.log('═'.repeat(58));
    console.log(`Content Type: ${contentType}`);
    console.log(`Mode: ${flags.dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`AI Captions: ${flags.noAi ? 'DISABLED' : 'ENABLED'}`);
    console.log('─'.repeat(58));

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
    console.log('─'.repeat(58));
    console.log(result.caption);
    console.log('═'.repeat(58));

    // Show target groups if requested
    if (flags.groups) {
        console.log('');
        console.log('Target Groups for this content type:');
        const groups = getGroupsForContentType(contentType);
        for (const g of groups) {
            console.log(`  • ${g.name} (${g.members}) — ${g.notes}`);
        }
        console.log('');
    }

    if (flags.dryRun) {
        console.log('');
        console.log('DRY RUN complete. No post was published.');
        process.exit(0);
    }

    // For now, just generate the caption. Graph API posting goes through 
    // the existing bachata-daily-agent.js or browser automation.
    console.log('');
    console.log('✅ Caption generated successfully.');
    console.log('Use the browser automation or Graph API to publish this post.');

    return result;
}

main().catch((error) => {
    console.error(`❌ Bachata Exotica music post failed: ${error.message}`);
    process.exit(1);
});

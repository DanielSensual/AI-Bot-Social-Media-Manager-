#!/usr/bin/env node

/**
 * Lead Wins Social Automation
 * Generates 2 daily posts from lead pipeline metrics and publishes to X/LinkedIn/Facebook.
 */

import dotenv from 'dotenv';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_URL = (process.env.DASHBOARD_URL || 'http://localhost:3001').replace(/\/+$/, '');
const DASHBOARD_SECRET = process.env.DASHBOARD_SECRET || 'ghostai-dev-token';
const DAILY_LIMIT = Number.parseInt(process.env.LEAD_HUNTER_DAILY_LIMIT || '50', 10) || 50;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

function execNodeScript(scriptPath, scriptArgs = []) {
    return new Promise((resolve, reject) => {
        execFile('node', [scriptPath, ...scriptArgs], { cwd: path.join(__dirname, '..') }, (error, stdout, stderr) => {
            if (stdout) process.stdout.write(stdout);
            if (stderr) process.stderr.write(stderr);
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}

function normalizeSegment(segment) {
    const value = String(segment || '').toLowerCase();
    if (!value || value === 'unassigned') return '';
    if (value.includes('dental')) return 'dental';
    if (value.includes('med') && value.includes('spa')) return 'med-spa';
    if (value.includes('hvac')) return 'hvac';
    if (value.includes('legal') || value.includes('law')) return 'legal';
    if (value.includes('restaurant')) return 'restaurant';
    return '';
}

function buildSegmentUrl(segment, postIndex) {
    const slug = normalizeSegment(segment);
    if (!slug) {
        return `https://www.ghostaisystems.com/sitedrop?utm_source=social&utm_medium=organic&utm_campaign=lead-wins&utm_content=post-${postIndex}`;
    }
    return `https://www.ghostaisystems.com/solutions/${slug}?utm_source=social&utm_medium=organic&utm_campaign=${slug}-lead-wins&utm_content=post-${postIndex}`;
}

function fitForX(text) {
    if (text.length <= 280) return text;
    const urlMatch = text.match(/https?:\/\/\S+$/);
    const url = urlMatch ? urlMatch[0] : '';
    if (!url) return `${text.slice(0, 279)}…`;

    const headBudget = 280 - url.length - 2;
    if (headBudget <= 0) return url.slice(0, 280);
    return `${text.slice(0, headBudget).trimEnd()}… ${url}`;
}

async function fetchLeadPipeline() {
    const response = await fetch(`${DASHBOARD_URL}/api/lead-pipeline`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${DASHBOARD_SECRET}`,
        },
        cache: 'no-store',
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch lead pipeline (${response.status})`);
    }
    return response.json();
}

function buildPosts(payload) {
    const pipeline = payload?.pipeline || {};
    const segments = payload?.segmentBreakdown || pipeline.segmentBreakdown || [];
    const topSegment = segments.find((row) => normalizeSegment(row.segment)) || segments[0] || { segment: 'unassigned', leads: 0, booked: 0 };
    const topSegmentName = normalizeSegment(topSegment.segment) || 'general service SMB';

    const replyRate = Number(pipeline.replyRate || 0).toFixed(2);
    const bookRate = Number(pipeline.bookRate || 0).toFixed(2);
    const todayOutreach = Number(pipeline.todayOutreach || 0);
    const suppressed = Number(pipeline.suppressionCount || 0);

    const post1Url = buildSegmentUrl(topSegment.segment, 1);
    const post2Url = buildSegmentUrl(topSegment.segment, 2);

    const post1 = `Florida SMB pipeline snapshot: ${todayOutreach}/${DAILY_LIMIT} sends today, ${replyRate}% reply rate, ${bookRate}% booked-call rate. We run SiteDrop first, then AI follow-up. Playbook: ${post1Url}`;
    const post2 = `Top converting focus right now: ${topSegmentName}. We pair 72-hour SiteDrop launches with compliant outbound automation (${suppressed} suppressed contacts protected). See how: ${post2Url}`;

    return [fitForX(post1), fitForX(post2)];
}

async function publishPost(text, index) {
    const postAllScript = path.join(__dirname, 'post-all.js');
    const argsForPost = [text];
    if (dryRun) argsForPost.push('--dry-run');

    console.log(`\n📝 Publishing post ${index}/2`);
    await execNodeScript(postAllScript, argsForPost);

    console.log('📡 Syncing social dashboard...');
    const syncScript = path.join(__dirname, 'sync-dashboard.js');
    await execNodeScript(syncScript);
}

async function main() {
    console.log('\n🎯 Lead Wins Social Automation');
    console.log(`   Dashboard: ${DASHBOARD_URL}`);
    console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

    const payload = await fetchLeadPipeline();
    const posts = buildPosts(payload);

    for (let i = 0; i < posts.length; i += 1) {
        await publishPost(posts[i], i + 1);
    }

    console.log('\n✅ Lead wins social cycle complete');
}

main().catch((error) => {
    console.error(`\n❌ Lead wins posting failed: ${error.message}`);
    process.exit(1);
});

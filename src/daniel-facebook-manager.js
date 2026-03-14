/**
 * Daniel Facebook Page Manager
 * Daily text-only posting at configured time using existing Facebook Graph client.
 */

import dotenv from 'dotenv';
import cron from 'node-cron';
import { alertPostFailure, clearFailure, recordFailure } from './alerting.js';
import { postToFacebook, testFacebookConnection } from './facebook-client.js';
import { buildDanielFacebookCaption } from './daniel-facebook-content.js';
import { applyDanielFacebookEnvMapping, assertDanielFacebookCredentials } from './daniel-facebook-env.js';
import { isDuplicate, record } from './post-history.js';

dotenv.config();

const DEFAULT_DAILY_TIME = '10:00';
const DEFAULT_TIMEZONE = 'America/New_York';
const DEFAULT_MAX_DUPLICATE_RETRIES = 4;

function parseBoolean(value, fallback = false) {
    if (value == null || value === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseIntInRange(value, fallback, min, max) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

export function normalizeDailyTime(rawTime) {
    const fallback = DEFAULT_DAILY_TIME;
    const value = String(rawTime || fallback).trim();
    const match = value.match(/^(\d{1,2}):(\d{2})$/);

    if (!match) {
        throw new Error(`Invalid DANIEL_FACEBOOK_DAILY_TIME: "${value}" (expected HH:MM).`);
    }

    const hour = Number.parseInt(match[1], 10);
    const minute = Number.parseInt(match[2], 10);

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        throw new Error(`Invalid DANIEL_FACEBOOK_DAILY_TIME: "${value}" (expected 00:00-23:59).`);
    }

    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function parseDanielFacebookManagerConfig(env = process.env, overrides = {}) {
    const dailyTime = normalizeDailyTime(overrides.dailyTime ?? env.DANIEL_FACEBOOK_DAILY_TIME ?? DEFAULT_DAILY_TIME);

    return {
        enabled: parseBoolean(overrides.enabled ?? env.DANIEL_FACEBOOK_MANAGER_ENABLED, true),
        timezone: String(overrides.timezone ?? env.DANIEL_FACEBOOK_TIMEZONE ?? DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE,
        dailyTime,
        aiEnabled: parseBoolean(overrides.aiEnabled ?? env.DANIEL_FACEBOOK_AI_ENABLED, true),
        healthCheck: parseBoolean(overrides.healthCheck ?? env.DANIEL_FACEBOOK_HEALTH_CHECK, true),
        runOnStart: parseBoolean(overrides.runOnStart ?? env.DANIEL_FACEBOOK_RUN_ON_START, false),
        dryRun: parseBoolean(overrides.dryRun ?? env.DANIEL_FACEBOOK_DRY_RUN, false),
        maxCaptionLength: parseIntInRange(overrides.maxCaptionLength ?? env.DANIEL_FACEBOOK_MAX_CAPTION_LENGTH, 1200, 120, 5000),
        duplicateRetries: parseIntInRange(overrides.duplicateRetries ?? env.DANIEL_FACEBOOK_DUPLICATE_RETRIES, DEFAULT_MAX_DUPLICATE_RETRIES, 1, 10),
    };
}

export function createDanielFacebookManager(deps = {}) {
    const scheduleFn = deps.scheduleFn || cron.schedule;
    const testFacebookConnectionFn = deps.testFacebookConnectionFn || testFacebookConnection;
    const postToFacebookFn = deps.postToFacebookFn || postToFacebook;
    const buildCaptionFn = deps.buildCaptionFn || buildDanielFacebookCaption;
    const isDuplicateFn = deps.isDuplicateFn || isDuplicate;
    const recordFn = deps.recordFn || record;
    const recordFailureFn = deps.recordFailureFn || recordFailure;
    const clearFailureFn = deps.clearFailureFn || clearFailure;
    const alertPostFailureFn = deps.alertPostFailureFn || alertPostFailure;

    let cycleInProgress = false;

    async function runCycle(options = {}) {
        if (cycleInProgress) {
            return {
                skipped: true,
                reason: 'cycle_in_progress',
            };
        }

        cycleInProgress = true;

        const env = options.env || process.env;
        const config = options.config || parseDanielFacebookManagerConfig(env);
        const dryRun = options.dryRun ?? config.dryRun;
        const trigger = options.trigger || 'manual';

        try {
            assertDanielFacebookCredentials(env);
            applyDanielFacebookEnvMapping(env);

            if (config.healthCheck) {
                const connection = await testFacebookConnectionFn().catch(() => false);
                if (!connection || connection.type === 'user_no_pages') {
                    throw new Error('Daniel Facebook Page access unavailable for current credentials.');
                }
            }

            let creative = null;
            let duplicate = true;
            let attempts = 0;

            while (attempts < config.duplicateRetries) {
                creative = await buildCaptionFn({
                    aiEnabled: config.aiEnabled,
                    maxLength: config.maxCaptionLength,
                    trigger,
                });

                attempts += 1;
                duplicate = isDuplicateFn(creative.caption);
                if (!duplicate) break;
            }

            if (duplicate) {
                return {
                    skipped: true,
                    reason: 'duplicate_after_retries',
                    attempts,
                    source: creative?.source || null,
                };
            }

            if (dryRun) {
                return {
                    dryRun: true,
                    trigger,
                    source: creative.source,
                    caption: creative.caption,
                    attempts,
                };
            }

            const result = await postToFacebookFn(creative.caption);
            const postId = result?.post_id || result?.id || null;

            recordFn({
                text: creative.caption,
                pillar: 'daniel_facebook_daily',
                aiGenerated: creative.source === 'ai',
                hasVideo: false,
                hasImage: false,
                results: {
                    facebook: postId || 'posted',
                },
            });

            clearFailureFn('Daniel Facebook');

            return {
                success: true,
                trigger,
                source: creative.source,
                attempts,
                postId,
            };
        } catch (error) {
            recordFailureFn('Daniel Facebook');
            await alertPostFailureFn('Daniel Facebook', error).catch(() => { });
            throw error;
        } finally {
            cycleInProgress = false;
        }
    }

    function start(options = {}) {
        const env = options.env || process.env;
        const config = options.config || parseDanielFacebookManagerConfig(env);
        const dryRun = options.dryRun ?? config.dryRun;
        const runOnStart = options.runOnStart ?? config.runOnStart;

        if (!config.enabled) {
            return [];
        }

        assertDanielFacebookCredentials(env);
        applyDanielFacebookEnvMapping(env);

        const [hour, minute] = config.dailyTime.split(':');
        const cronExpression = `${minute} ${hour} * * *`;

        const job = scheduleFn(cronExpression, () => {
            runCycle({
                env,
                config,
                dryRun,
                trigger: `cron:${config.dailyTime}`,
            }).catch((error) => {
                console.error(`Daniel Facebook manager cycle failed: ${error.message}`);
            });
        }, {
            timezone: config.timezone,
        });

        if (runOnStart) {
            runCycle({
                env,
                config,
                dryRun,
                trigger: 'startup',
            }).catch((error) => {
                console.error(`Daniel Facebook startup cycle failed: ${error.message}`);
            });
        }

        return [job];
    }

    return {
        runCycle,
        start,
    };
}

const defaultManager = createDanielFacebookManager();

export async function runDanielFacebookManagerCycle(options = {}) {
    return defaultManager.runCycle(options);
}

export function startDanielFacebookManager(options = {}) {
    return defaultManager.start(options);
}

export default {
    parseDanielFacebookManagerConfig,
    normalizeDailyTime,
    createDanielFacebookManager,
    runDanielFacebookManagerCycle,
    startDanielFacebookManager,
};

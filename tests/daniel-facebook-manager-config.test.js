import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createDanielFacebookManager,
    parseDanielFacebookManagerConfig,
} from '../src/daniel-facebook-manager.js';

test('parseDanielFacebookManagerConfig uses expected defaults', () => {
    const config = parseDanielFacebookManagerConfig({});

    assert.equal(config.enabled, true);
    assert.equal(config.timezone, 'America/New_York');
    assert.equal(config.dailyTime, '10:00');
    assert.equal(config.aiEnabled, true);
    assert.equal(config.healthCheck, true);
    assert.equal(config.runOnStart, false);
    assert.equal(config.dryRun, false);
});

test('parseDanielFacebookManagerConfig rejects invalid daily time', () => {
    assert.throws(
        () => parseDanielFacebookManagerConfig({ DANIEL_FACEBOOK_DAILY_TIME: '25:99' }),
        /Invalid DANIEL_FACEBOOK_DAILY_TIME/i,
    );
});

test('manager start fails with clear error when Daniel token vars are missing', () => {
    const manager = createDanielFacebookManager({
        scheduleFn: () => ({ stop() { } }),
    });

    assert.throws(
        () => manager.start({ env: { DANIEL_FACEBOOK_MANAGER_ENABLED: 'true' } }),
        /Missing Daniel Facebook credentials/i,
    );
});

test('manager start fails with clear error when Daniel page ID is missing', () => {
    const manager = createDanielFacebookManager({
        scheduleFn: () => ({ stop() { } }),
    });

    assert.throws(
        () => manager.start({
            env: {
                DANIEL_FACEBOOK_MANAGER_ENABLED: 'true',
                DANIEL_FACEBOOK_PAGE_ACCESS_TOKEN: 'token',
            },
        }),
        /Missing Daniel Facebook page target/i,
    );
});

test('dry-run cycle returns preview and does not publish', async () => {
    let postCalls = 0;

    const manager = createDanielFacebookManager({
        testFacebookConnectionFn: async () => ({ type: 'page', id: '1', name: 'Daniel Page' }),
        buildCaptionFn: async () => ({ caption: 'dry run caption', source: 'template' }),
        isDuplicateFn: () => false,
        postToFacebookFn: async () => {
            postCalls += 1;
            return { id: 'fb_1' };
        },
        recordFn: () => { },
        clearFailureFn: () => { },
    });

    const result = await manager.runCycle({
        env: {
            DANIEL_FACEBOOK_PAGE_ACCESS_TOKEN: 'token',
            DANIEL_FACEBOOK_PAGE_ID: 'page_1',
        },
        dryRun: true,
    });

    assert.equal(result.dryRun, true);
    assert.equal(result.caption, 'dry run caption');
    assert.equal(postCalls, 0);
});

test('duplicate detection retries and exits safely', async () => {
    let buildCalls = 0;
    let postCalls = 0;

    const manager = createDanielFacebookManager({
        testFacebookConnectionFn: async () => ({ type: 'page', id: '1', name: 'Daniel Page' }),
        buildCaptionFn: async () => {
            buildCalls += 1;
            return { caption: `duplicate-${buildCalls}`, source: 'template' };
        },
        isDuplicateFn: () => true,
        postToFacebookFn: async () => {
            postCalls += 1;
            return { id: 'fb_1' };
        },
        recordFn: () => { },
        clearFailureFn: () => { },
    });

    const result = await manager.runCycle({
        env: {
            DANIEL_FACEBOOK_PAGE_ACCESS_TOKEN: 'token',
            DANIEL_FACEBOOK_PAGE_ID: 'page_1',
        },
        config: {
            ...parseDanielFacebookManagerConfig({}),
            duplicateRetries: 3,
        },
    });

    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'duplicate_after_retries');
    assert.equal(result.attempts, 3);
    assert.equal(postCalls, 0);
});

test('live cycle posts text and records history', async () => {
    let recorded = null;

    const manager = createDanielFacebookManager({
        testFacebookConnectionFn: async () => ({ type: 'page', id: '1', name: 'Daniel Page' }),
        buildCaptionFn: async () => ({ caption: 'hello live world', source: 'ai' }),
        isDuplicateFn: () => false,
        postToFacebookFn: async () => ({ id: 'fb_live_123' }),
        recordFn: (payload) => {
            recorded = payload;
        },
        clearFailureFn: () => { },
    });

    const result = await manager.runCycle({
        env: {
            DANIEL_FACEBOOK_PAGE_ACCESS_TOKEN: 'token',
            DANIEL_FACEBOOK_PAGE_ID: 'page_1',
        },
    });

    assert.equal(result.success, true);
    assert.equal(result.postId, 'fb_live_123');
    assert.ok(recorded);
    assert.equal(recorded.results.facebook, 'fb_live_123');
    assert.equal(recorded.aiGenerated, true);
});

test('scheduler registers exactly one daily job at 10:00 ET', () => {
    const calls = [];

    const manager = createDanielFacebookManager({
        scheduleFn: (expression, handler, options) => {
            calls.push({ expression, handler, options });
            return { stop() { } };
        },
    });

    const jobs = manager.start({
        env: {
            DANIEL_FACEBOOK_PAGE_ACCESS_TOKEN: 'token',
            DANIEL_FACEBOOK_PAGE_ID: 'page_1',
        },
    });

    assert.equal(jobs.length, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].expression, '00 10 * * *');
    assert.equal(calls[0].options.timezone, 'America/New_York');
    assert.equal(typeof calls[0].handler, 'function');
});

test('disabled mode registers no jobs', () => {
    let scheduled = false;

    const manager = createDanielFacebookManager({
        scheduleFn: () => {
            scheduled = true;
            return { stop() { } };
        },
    });

    const jobs = manager.start({
        env: {
            DANIEL_FACEBOOK_MANAGER_ENABLED: 'false',
        },
    });

    assert.equal(jobs.length, 0);
    assert.equal(scheduled, false);
});

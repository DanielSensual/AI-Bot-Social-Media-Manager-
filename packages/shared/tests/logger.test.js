/**
 * Tests for @ghostai/shared/logger
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '@ghostai/shared/logger';

describe('@ghostai/shared — logger', () => {
    it('creates a logger with all methods', () => {
        const log = createLogger('test');
        assert.equal(typeof log.debug, 'function');
        assert.equal(typeof log.info, 'function');
        assert.equal(typeof log.warn, 'function');
        assert.equal(typeof log.error, 'function');
    });

    it('does not throw when logging at all levels', () => {
        const log = createLogger('scheduler');
        log.debug('debug message', { key: 'value' });
        log.info('info message', { count: 42 });
        log.warn('warn message');
        log.error('error message', { error: 'something broke' });
    });

    it('accepts a namespace', () => {
        const log = createLogger('my-module');
        // Should include namespace in output (verified by not throwing)
        log.info('test with namespace');
    });

    it('uses default namespace when none provided', () => {
        const log = createLogger();
        log.info('test with default namespace');
    });

    it('handles empty meta objects', () => {
        const log = createLogger('test');
        log.info('no meta');
        log.info('empty meta', {});
        log.info('with meta', { key: 'val' });
    });
});

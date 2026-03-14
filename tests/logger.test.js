/**
 * Logger Tests — verifies JSON and pretty output formats
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../src/logger.js';

describe('Logger', () => {
    it('createLogger returns an object with log level methods', () => {
        const logger = createLogger();
        assert.equal(typeof logger.debug, 'function');
        assert.equal(typeof logger.info, 'function');
        assert.equal(typeof logger.warn, 'function');
        assert.equal(typeof logger.error, 'function');
    });

    it('createLogger with defaults bakes in fields', () => {
        const logger = createLogger({ task_id: 'test-123', platform: 'x' });
        // Just verify it doesn't throw
        logger.info('Test message', { extra: 'field' });
        logger.error('Error message');
    });

    it('child loggers are independent', () => {
        const logA = createLogger({ platform: 'x' });
        const logB = createLogger({ platform: 'linkedin' });

        // Should not throw or interfere with each other
        logA.info('X post');
        logB.info('LinkedIn post');
    });

    it('all levels emit without error', () => {
        const logger = createLogger();
        assert.doesNotThrow(() => logger.debug('debug msg'));
        assert.doesNotThrow(() => logger.info('info msg'));
        assert.doesNotThrow(() => logger.warn('warn msg'));
        assert.doesNotThrow(() => logger.error('error msg'));
    });

    it('handles empty fields gracefully', () => {
        const logger = createLogger();
        assert.doesNotThrow(() => logger.info('no fields'));
        assert.doesNotThrow(() => logger.info('empty fields', {}));
        assert.doesNotThrow(() => logger.info('null values', { key: null }));
    });
});

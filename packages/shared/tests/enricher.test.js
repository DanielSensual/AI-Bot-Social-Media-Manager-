/**
 * Tests for @ghostai/shared/enricher prompt generation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEmailSearchPrompt } from '@ghostai/shared/enricher';

describe('@ghostai/shared — enricher prompt builder', () => {
    it('uses realtor sources when profile is realtor', () => {
        const prompt = buildEmailSearchPrompt({
            business_name: 'Sunshine Realty',
            city: 'Orlando',
            state: 'FL',
            website: 'https://sunshinerealty.com',
        }, 'realtor');

        assert.match(prompt, /Realtor\.com agent profile/i);
        assert.match(prompt, /Zillow agent profile/i);
    });

    it('uses dental directories for local-business dental segment', () => {
        const prompt = buildEmailSearchPrompt({
            business_name: 'Lake Nona Smiles',
            segment: 'dental offices',
            city: 'Orlando',
            state: 'FL',
            website: 'https://lakenonasmiles.com',
        }, 'local-business');

        assert.match(prompt, /Healthgrades/i);
        assert.doesNotMatch(prompt, /Realtor\.com/i);
    });

    it('auto-detects realtor profile from source signals', () => {
        const prompt = buildEmailSearchPrompt({
            business_name: 'Top Agent Team',
            source: 'redfin',
            city: 'Miami',
            state: 'FL',
            website: 'https://example.com',
        });

        assert.match(prompt, /real estate agent or brokerage/i);
        assert.match(prompt, /Realtor\.com agent profile/i);
    });
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveRedirectUri, getAuthUrl } from '../src/linkedin-client.js';

test('resolveRedirectUri prefers override', () => {
    const uri = resolveRedirectUri('default', 'http://localhost:3900/callback');
    assert.equal(uri, 'http://localhost:3900/callback');
});

test('resolveRedirectUri uses profile-specific env when set', () => {
    process.env.LINKEDIN_MEDIAGEEKZ_REDIRECT_URI = 'http://localhost:3901/callback';
    const uri = resolveRedirectUri('mediageekz');
    assert.equal(uri, 'http://localhost:3901/callback');
});

test('getAuthUrl uses supplied redirect uri', () => {
    const original = process.env.LINKEDIN_CLIENT_ID;
    process.env.LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || 'dummy-client-id';

    const authUrl = getAuthUrl('default', { redirectUri: 'http://localhost:3902/callback' });
    assert.ok(authUrl.includes('redirect_uri=http%3A%2F%2Flocalhost%3A3902%2Fcallback'));

    if (original === undefined) {
        delete process.env.LINKEDIN_CLIENT_ID;
    } else {
        process.env.LINKEDIN_CLIENT_ID = original;
    }
});

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

function jsonResponse(payload) {
    return {
        ok: true,
        async json() {
            return payload;
        },
    };
}

describe('instagram-client page resolution', () => {
    beforeEach(() => {
        process.env.FACEBOOK_ACCESS_TOKEN = 'user-token';
        process.env.FACEBOOK_PAGE_ACCESS_TOKEN = 'wrong-page-token';
        delete process.env.FACEBOOK_PAGE_ID;
    });

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
        global.fetch = ORIGINAL_FETCH;
    });

    it('honors explicit pageId even when default page token points elsewhere', async () => {
        global.fetch = async (url) => {
            const value = String(url);

            if (value.includes('/me?fields=id,name&access_token=wrong-page-token')) {
                return jsonResponse({ id: '753873537816019', name: 'Artificial Intelligence Knowledge' });
            }
            if (value.includes('/753873537816019?fields=category&access_token=wrong-page-token')) {
                return jsonResponse({ category: 'Software Company' });
            }
            if (value.includes('/me?fields=id,name&access_token=user-token')) {
                return jsonResponse({ id: 'user-1', name: 'Daniel Castillo' });
            }
            if (value.includes('/user-1?fields=category&access_token=user-token')) {
                return jsonResponse({ error: { message: 'Not a page token' } });
            }
            if (value.includes('/me/accounts?fields=id,name,access_token&access_token=user-token')) {
                return jsonResponse({
                    data: [
                        { id: '753873537816019', name: 'Artificial Intelligence Knowledge', access_token: 'wrong-page-token' },
                        { id: '266552527115323', name: 'Bachata Exotica', access_token: 'bachata-page-token' },
                    ],
                });
            }
            if (value.includes('/266552527115323?fields=instagram_business_account{id,username,followers_count,media_count}&access_token=bachata-page-token')) {
                return jsonResponse({
                    instagram_business_account: {
                        id: 'ig-bachata',
                        username: 'bachataexotica',
                        followers_count: 999,
                        media_count: 88,
                    },
                });
            }

            throw new Error(`Unexpected URL: ${value}`);
        };

        const { testInstagramConnection } = await import('../src/instagram-client.js');
        const result = await testInstagramConnection({
            type: 'facebook_page',
            pageId: '266552527115323',
        });

        assert.ok(result);
        assert.equal(result.igUserId, 'ig-bachata');
        assert.equal(result.username, 'bachataexotica');
        assert.equal(result.pageToken, 'bachata-page-token');
    });
});

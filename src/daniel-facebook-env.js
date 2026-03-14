/**
 * Daniel Facebook env mapping helper.
 * Keeps Daniel-specific credentials isolated while reusing shared Facebook clients.
 */

const ENV_KEYS = {
    pageToken: 'DANIEL_FACEBOOK_PAGE_ACCESS_TOKEN',
    userToken: 'DANIEL_FACEBOOK_ACCESS_TOKEN',
    pageId: 'DANIEL_FACEBOOK_PAGE_ID',
};

/**
 * Validate required Daniel Facebook credentials.
 * @param {NodeJS.ProcessEnv} env
 */
export function assertDanielFacebookCredentials(env = process.env) {
    const hasToken = Boolean(env[ENV_KEYS.pageToken] || env[ENV_KEYS.userToken]);
    if (!hasToken) {
        throw new Error(
            'Missing Daniel Facebook credentials. Set DANIEL_FACEBOOK_PAGE_ACCESS_TOKEN or DANIEL_FACEBOOK_ACCESS_TOKEN.',
        );
    }
}

/**
 * Map Daniel env vars to shared Facebook env vars in the current process.
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ mapped: string[] }}
 */
export function applyDanielFacebookEnvMapping(env = process.env) {
    const mapped = [];

    if (env[ENV_KEYS.pageToken]) {
        env.FACEBOOK_PAGE_ACCESS_TOKEN = env[ENV_KEYS.pageToken];
        mapped.push('FACEBOOK_PAGE_ACCESS_TOKEN');
    }

    if (env[ENV_KEYS.userToken]) {
        env.FACEBOOK_ACCESS_TOKEN = env[ENV_KEYS.userToken];
        mapped.push('FACEBOOK_ACCESS_TOKEN');
    }

    if (env[ENV_KEYS.pageId]) {
        env.FACEBOOK_PAGE_ID = env[ENV_KEYS.pageId];
        mapped.push('FACEBOOK_PAGE_ID');
    }

    return { mapped };
}

export default {
    applyDanielFacebookEnvMapping,
    assertDanielFacebookCredentials,
};

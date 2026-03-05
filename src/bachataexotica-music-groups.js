/**
 * Bachata Exotica Music Group Registry
 * 
 * Target groups for music promotion via the Bachata Exotica label.
 * Groups are categorized for content routing:
 * 
 * - music         → for song drops, BTS, all music content
 * - dance         → for music tied to social dancing
 * - local_fl      → for event-tied music (pool party, workshops)
 * - industry      → for AI music / music production communities
 */

export const MUSIC_GROUPS = [
    // ─── Music Groups ───────────────────────────────────────────
    {
        name: 'Bachata News',
        url: 'https://www.facebook.com/groups/bachatanews',
        members: '6.1K',
        categories: ['music', 'dance'],
        notes: 'Major bachata community — music + dance content',
    },
    {
        name: 'International Bachata Festivals',
        url: 'https://www.facebook.com/groups/1529728007219540',
        members: '~10K',
        categories: ['music', 'dance'],
        notes: 'Global bachata audience, good for music drops',
    },
    {
        name: 'Bachata Music Lovers',
        url: 'https://www.facebook.com/groups/bachatamusiclovers',
        members: '~15K',
        categories: ['music'],
        notes: 'Pure music group — ideal for song drops',
    },
    {
        name: 'Bachata Sensual World',
        url: 'https://www.facebook.com/groups/bachataSensualWorld',
        members: '~50K',
        categories: ['music', 'dance'],
        notes: 'Massive sensual bachata community — music + dance',
    },
    {
        name: 'AI Music Production',
        url: 'https://www.facebook.com/groups/aimusicproduction',
        members: '~20K',
        categories: ['industry'],
        notes: 'AI music producers — BTS and tech content',
    },
    {
        name: 'AI Generated Music',
        url: 'https://www.facebook.com/groups/aigeneratedmusic',
        members: '~10K',
        categories: ['industry'],
        notes: 'AI music fans — song drops + BTS',
    },

    // ─── Local FL Groups ────────────────────────────────────────
    {
        name: 'Orlando Bachata Social Dancers',
        url: 'https://www.facebook.com/groups/bachataorlando',
        members: '~3K',
        categories: ['dance', 'local_fl'],
        notes: 'Daniel\'s own group — always post here',
    },
    {
        name: 'Central Florida Latin Dance',
        url: 'https://www.facebook.com/groups/centralflorida.latin.dance',
        members: '~5K',
        categories: ['dance', 'local_fl'],
        notes: 'Local FL dance community',
    },
    {
        name: 'Orlando Latin Dance Scene',
        url: 'https://www.facebook.com/groups/orlandolatindancescene',
        members: '~2K',
        categories: ['dance', 'local_fl'],
        notes: 'Local Orlando dancers',
    },
];

/**
 * Get groups matching given categories.
 * @param {string[]} categories - Categories to filter by
 * @returns {object[]} Matching groups
 */
export function getGroupsByCategory(categories = ['music']) {
    return MUSIC_GROUPS.filter(group =>
        group.categories.some(cat => categories.includes(cat))
    );
}

/**
 * Get groups for a specific content type.
 * @param {string} contentType - 'song_drop' | 'bts' | 'engagement'
 * @returns {object[]} Target groups
 */
export function getGroupsForContentType(contentType) {
    const categoryMap = {
        song_drop: ['music', 'dance'],
        bts: ['music', 'industry'],
        engagement: ['music', 'dance', 'local_fl'],
    };

    const cats = categoryMap[contentType] || ['music'];
    return getGroupsByCategory(cats);
}

/**
 * Get a summary of all groups and their categories.
 */
export function getGroupsSummary() {
    return MUSIC_GROUPS.map(g => ({
        name: g.name,
        categories: g.categories.join(', '),
        members: g.members,
    }));
}

export default {
    MUSIC_GROUPS,
    getGroupsByCategory,
    getGroupsForContentType,
    getGroupsSummary,
};

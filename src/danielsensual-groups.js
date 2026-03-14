/**
 * DanielSensual Group Registry
 *
 * Manages Facebook group targeting, category routing, cooldowns,
 * and posting state for the DanielSensual brand.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATE_FILE = path.join(__dirname, '..', '.danielsensual-group-state.json');
const MIN_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours between posts to same group

// ─── Group Registry ─────────────────────────────────────────────

export const GROUPS = [
    // === Daniel's Own Group ===
    {
        name: 'Orlando Bachata Social Dancers',
        url: 'https://www.facebook.com/groups/BachataOrlando/',
        members: 2000,
        category: 'BACHATA_DANCE',
        owned: true,
        priority: 1,
        pillars: ['music', 'dance', 'event'],
    },

    // === Bachata & Dance Groups ===
    {
        name: 'International Bachata Festivals',
        url: 'https://www.facebook.com/groups/internationalbachatafestivals/',
        members: 26000,
        category: 'BACHATA_DANCE',
        priority: 2,
        pillars: ['music', 'dance', 'event'],
    },
    {
        name: 'Central Florida Dancers',
        url: 'https://www.facebook.com/groups/centralfloridadancers/',
        members: 5500,
        category: 'LATIN_DANCE',
        priority: 2,
        pillars: ['music', 'dance', 'event'],
    },
    {
        name: 'BACHATA LOVERS IN FLORIDA',
        url: 'https://www.facebook.com/groups/bachataloversinflorida/',
        members: 1600,
        category: 'BACHATA_DANCE',
        priority: 2,
        pillars: ['music', 'dance', 'event'],
    },
    {
        name: 'Central Florida Latin Dance',
        url: 'https://www.facebook.com/groups/centralfloridalatindance/',
        members: 1300,
        category: 'LATIN_DANCE',
        priority: 2,
        pillars: ['music', 'dance', 'event'],
    },
    {
        name: 'Bachata News',
        url: 'https://www.facebook.com/groups/bachatanews/',
        members: 13000,
        category: 'LATIN_MUSIC',
        priority: 2,
        pillars: ['music', 'dance', 'event'],
    },
    {
        name: 'Salsa and Bachata Nights!',
        url: 'https://www.facebook.com/groups/salsaandbachatanights/',
        members: 1900,
        category: 'LATIN_DANCE',
        priority: 3,
        pillars: ['dance', 'event'],
    },
    {
        name: 'Salsa & Bachata Nights South Florida',
        url: 'https://www.facebook.com/groups/salsabachatanightssouthflorida/',
        members: 5300,
        category: 'LATIN_DANCE',
        priority: 3,
        pillars: ['dance', 'event'],
    },
    {
        name: 'Dance Events in South Florida',
        url: 'https://www.facebook.com/groups/danceeventsinsouthflorida/',
        members: 3600,
        category: 'LATIN_DANCE',
        priority: 3,
        pillars: ['dance', 'event'],
    },
    {
        name: 'Dominican Bachata Videos',
        url: 'https://www.facebook.com/groups/dominicanbachatavideos/',
        members: 7200,
        category: 'LATIN_MUSIC',
        priority: 2,
        pillars: ['music', 'dance'],
    },

    // === Latino Community Groups (Events + Music only) ===
    {
        name: 'Boricuas en Orlando y Kissimmee and central florida',
        url: 'https://www.facebook.com/groups/boricuasenorlando/',
        members: 107000,
        category: 'LATINO_COMMUNITY',
        priority: 2,
        pillars: ['music', 'event'],
    },
    {
        name: 'latinos en kissimmee y orlando',
        url: 'https://www.facebook.com/groups/latinosenkissimmeeyorlando/',
        members: 73000,
        category: 'LATINO_COMMUNITY',
        priority: 2,
        pillars: ['music', 'event'],
    },
    {
        name: 'Latinos en Orlando & Kissimmee',
        url: 'https://www.facebook.com/groups/latinosenorlando/',
        members: 67000,
        category: 'LATINO_COMMUNITY',
        priority: 2,
        pillars: ['event'],
    },
    {
        name: 'Ayuda para Hispanos en Orlando',
        url: 'https://www.facebook.com/groups/ayudaparahispanosenorlando/',
        members: 57000,
        category: 'LATINO_COMMUNITY',
        priority: 3,
        pillars: ['event'],
    },
    {
        name: 'Comunidad Hispana en Orlando y sus alrededores',
        url: 'https://www.facebook.com/groups/comunidadhispanaenorlando/',
        members: 48000,
        category: 'LATINO_COMMUNITY',
        priority: 3,
        pillars: ['event'],
    },
    {
        name: 'Puertorriquenos en Orlando & Kissimmee',
        url: 'https://www.facebook.com/groups/puertorriquenosenorlando/',
        members: 37000,
        category: 'LATINO_COMMUNITY',
        priority: 3,
        pillars: ['event'],
    },

    // === Pending Approval ===
    {
        name: 'Tampa Salsa Bachata Scene',
        url: 'https://www.facebook.com/groups/tampasalsabachatascene/',
        members: 1600,
        category: 'LATIN_DANCE',
        priority: 3,
        pillars: ['dance', 'event'],
        pending: true,
    },
    {
        name: 'Tampa Loves Salsa Bachata',
        url: 'https://www.facebook.com/groups/tampalovessalsabachata/',
        members: 11000,
        category: 'LATIN_DANCE',
        priority: 3,
        pillars: ['dance', 'event'],
        pending: true,
    },
];

// === Groups to AVOID (competitors) ===
export const AVOID_GROUPS = [
    { name: 'BACHATA ORLANDO', reason: 'competitor' },
];

// ─── Category Detection ─────────────────────────────────────────

const CATEGORY_PATTERNS = {
    BACHATA_DANCE: /bachata.*danc|bachata.*social|sensual.*bachata|bachata.*lover/i,
    LATIN_MUSIC: /bachata.*music|bachata.*video|bachata.*news|dominican.*bachata|reggaeton|latin.*music/i,
    LATIN_DANCE: /salsa|kizomba|latin.*dance|dance.*event|dance.*scene|dance.*night/i,
    LATINO_COMMUNITY: /latino|hispano|boricua|puertorrique|comunidad/i,
    AI_MUSIC: /ai.*music|artificial.*music|ai.*art|ai.*creative/i,
};

export function getGroupCategory(groupName) {
    for (const [category, regex] of Object.entries(CATEGORY_PATTERNS)) {
        if (regex.test(groupName)) return category;
    }
    return 'BACHATA_DANCE'; // default
}

// ─── State Management ───────────────────────────────────────────

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        }
    } catch (err) {
        console.warn(`⚠️ Could not load group state: ${err.message}`);
    }
    return { lastPosted: {}, postLog: [] };
}

function saveState(state) {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (err) {
        console.warn(`⚠️ Could not save group state: ${err.message}`);
    }
}

export function recordGroupPost(groupName, pillar, postId = null) {
    const state = loadState();
    state.lastPosted[groupName] = {
        timestamp: new Date().toISOString(),
        pillar,
        postId,
    };
    state.postLog.push({
        group: groupName,
        pillar,
        postId,
        timestamp: new Date().toISOString(),
    });
    // Keep only last 500 log entries
    if (state.postLog.length > 500) {
        state.postLog = state.postLog.slice(-500);
    }
    saveState(state);
}

export function isOnCooldown(groupName, cooldownMs = MIN_COOLDOWN_MS) {
    const state = loadState();
    const last = state.lastPosted[groupName];
    if (!last) return false;

    const elapsed = Date.now() - new Date(last.timestamp).getTime();
    return elapsed < cooldownMs;
}

export function getCooldownRemaining(groupName, cooldownMs = MIN_COOLDOWN_MS) {
    const state = loadState();
    const last = state.lastPosted[groupName];
    if (!last) return 0;

    const elapsed = Date.now() - new Date(last.timestamp).getTime();
    const remaining = cooldownMs - elapsed;
    return remaining > 0 ? remaining : 0;
}

// ─── Group Selection ────────────────────────────────────────────

/**
 * Get groups eligible for posting a specific pillar.
 * Filters by: pillar support, not pending, not on cooldown.
 */
export function getEligibleGroups(pillar, options = {}) {
    const cooldownMs = options.cooldownMs || MIN_COOLDOWN_MS;
    const maxGroups = options.maxGroups || 5; // don't spam too many at once
    const ignoreCooldown = options.ignoreCooldown || false;

    return GROUPS
        .filter(g => !g.pending)
        .filter(g => g.pillars.includes(pillar))
        .filter(g => ignoreCooldown || !isOnCooldown(g.name, cooldownMs))
        .sort((a, b) => a.priority - b.priority || b.members - a.members)
        .slice(0, maxGroups);
}

/**
 * Get posting status for all groups.
 */
export function getGroupStatus() {
    const state = loadState();
    return GROUPS.map(g => ({
        name: g.name,
        category: g.category,
        members: g.members,
        owned: g.owned || false,
        pending: g.pending || false,
        lastPosted: state.lastPosted[g.name] || null,
        onCooldown: isOnCooldown(g.name),
        cooldownRemaining: getCooldownRemaining(g.name),
        pillars: g.pillars,
    }));
}

export default {
    GROUPS,
    AVOID_GROUPS,
    getGroupCategory,
    getEligibleGroups,
    getGroupStatus,
    recordGroupPost,
    isOnCooldown,
    getCooldownRemaining,
};

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

// ─── Video Share Groups (40+) ───────────────────────────────────
// These groups are specifically for sharing Daniel Sensual video/reel
// links. Sorted by priority — highest engagement potential first.

const SHARE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const AUTO_DISABLE_THRESHOLD = 3; // auto-disable after N consecutive failures

export const SHARE_GROUPS = [
    // ══════════════════════════════════════════════════════════════
    // VERIFIED WORKING GROUPS ONLY (30 groups)
    // Cleaned April 13, 2026 — removed 116 dead/non-member groups
    // 3 batches × ~10 groups — spaced 4 hours apart
    // ══════════════════════════════════════════════════════════════

    // ── Batch 1: Morning (9 AM EST / 13:00 UTC) — Core Bachata ──

    { name: 'Orlando Bachata Social Dancers', url: 'https://www.facebook.com/groups/bachataorlando/', batch: 1, owned: true },
    { name: 'International Bachata Festivals', url: 'https://www.facebook.com/groups/InternationalBachataFestivals/', batch: 1 },
    { name: 'Bachata News', url: 'https://www.facebook.com/groups/BachataNews/', batch: 1 },
    { name: '🇩🇴Dominican Bachata Videos🇩🇴', url: 'https://www.facebook.com/groups/333512830085444/', batch: 1 },
    { name: 'Bachata Asia', url: 'https://www.facebook.com/groups/1648382815414149/', batch: 1 },
    { name: 'BACHATA URBANA', url: 'https://www.facebook.com/groups/188163091294456/', batch: 1 },
    { name: 'Bachata X', url: 'https://www.facebook.com/groups/bachatax/', batch: 1 },
    { name: 'Bachata in the UK', url: 'https://www.facebook.com/groups/230179800419487/', batch: 1 },
    { name: "Where's the Bachata Dancing?", url: 'https://www.facebook.com/groups/1029434378380692/', batch: 1 },
    { name: 'Bachata Sensual Tampa Bay', url: 'https://www.facebook.com/groups/425435315990175/', batch: 1 },
    { name: 'BACHATA LOVERS IN FLORIDA', url: 'https://www.facebook.com/groups/335595419907653/', batch: 1 },

    // ── Batch 2: Afternoon (1 PM EST / 17:00 UTC) — US Scenes ───

    { name: 'Bay Area Bachata Dancing', url: 'https://www.facebook.com/groups/BayAreaBachataDancing/', batch: 2 },
    { name: 'San Jose Bachata Nights', url: 'https://www.facebook.com/groups/sanjosebachatanights/', batch: 2 },
    { name: 'Bachata Social dancers in Chicago', url: 'https://www.facebook.com/groups/906991779337419/', batch: 2 },
    { name: 'Jacksonville Salsa & Bachata Scene', url: 'https://www.facebook.com/groups/jaxsalsabachatascene/', batch: 2 },
    { name: 'Salsa and Bachata Nights!', url: 'https://www.facebook.com/groups/288299318430221/', batch: 2 },
    { name: 'Salsa & Bachata Events', url: 'https://www.facebook.com/groups/534916443239278/', batch: 2 },
    { name: 'Salsa & Bachata Nights South Florida', url: 'https://www.facebook.com/groups/1975440802491980/', batch: 2 },
    { name: 'Central Florida Dancers', url: 'https://www.facebook.com/groups/353627944993366/', batch: 2 },
    { name: 'Central Florida Latin Dance', url: 'https://www.facebook.com/groups/260857457342351/', batch: 2 },
    { name: 'Orlando Latin Nights', url: 'https://www.facebook.com/groups/1438496766396638/', batch: 2 },

    // ── Batch 3: Evening (6 PM EST / 22:00 UTC) — International + Misc ──

    { name: 'London Latin Dance Events', url: 'https://www.facebook.com/groups/118710416185583/', batch: 3 },
    { name: 'Europe WOMAN Dance Fest', url: 'https://www.facebook.com/groups/180113296834114/', batch: 3 },
    { name: 'Washington DC-Baltimore Latin Dance Events', url: 'https://www.facebook.com/groups/207061397127018/', batch: 3 },
    { name: 'San Francisco Latin Dance Events', url: 'https://www.facebook.com/groups/183997259372109/', batch: 3 },
    { name: 'Salsa Orlando - LatinDanceCalendar.com', url: 'https://www.facebook.com/groups/1386797094934361/', batch: 3 },
    { name: 'UNIVERSO KIZOMBA', url: 'https://www.facebook.com/groups/1384948331659485/', batch: 3 },
    { name: 'Bay Area Bachata Workshops', url: 'https://www.facebook.com/groups/379062195586330/', batch: 3 },
    { name: 'Kizomba meets Bachata (#KmB) in Orlando', url: 'https://www.facebook.com/groups/1734954860051839/', batch: 3 },
    { name: 'Insta Reels', url: 'https://www.facebook.com/groups/1121900521601403/', batch: 3 },
];


// ─── Share State Management ─────────────────────────────────────

function loadShareState() {
    const shareStateFile = getShareStateFile();
    try {
        if (fs.existsSync(shareStateFile)) {
            return JSON.parse(fs.readFileSync(shareStateFile, 'utf-8'));
        }
    } catch (err) {
        console.warn(`⚠️ Could not load share state: ${err.message}`);
    }
    return { lastShared: {}, shareLog: [], groupHealth: {} };
}

function getShareStateFile() {
    if (process.env.DANIELSENSUAL_SHARE_STATE_FILE) {
        return process.env.DANIELSENSUAL_SHARE_STATE_FILE;
    }

    if ((process.env.DS_SHARE_IDENTITY_MODE || '').toLowerCase() === 'profile') {
        return path.join(__dirname, '..', '.danielsensual-personal-share-state.json');
    }

    return path.join(__dirname, '..', '.danielsensual-share-state.json');
}

function saveShareState(state) {
    const shareStateFile = getShareStateFile();
    try {
        fs.mkdirSync(path.dirname(shareStateFile), { recursive: true });
        fs.writeFileSync(shareStateFile, JSON.stringify(state, null, 2));
    } catch (err) {
        console.warn(`⚠️ Could not save share state: ${err.message}`);
    }
}

export function recordGroupShare(groupName, postUrl = null) {
    const state = loadShareState();
    state.lastShared[groupName] = {
        timestamp: new Date().toISOString(),
        postUrl,
    };
    state.shareLog.push({
        group: groupName,
        postUrl,
        timestamp: new Date().toISOString(),
    });
    if (state.shareLog.length > 1000) {
        state.shareLog = state.shareLog.slice(-1000);
    }
    // Reset failure counter on success
    if (!state.groupHealth) state.groupHealth = {};
    if (state.groupHealth[groupName]) {
        state.groupHealth[groupName].consecutiveFailures = 0;
        state.groupHealth[groupName].lastSuccess = new Date().toISOString();
    }
    saveShareState(state);
}

/**
 * Record a group failure. After AUTO_DISABLE_THRESHOLD consecutive
 * failures, the group is auto-disabled to stop wasting time.
 */
export function recordGroupFailure(groupName, error = '') {
    const state = loadShareState();
    if (!state.groupHealth) state.groupHealth = {};
    const health = state.groupHealth[groupName] || {
        consecutiveFailures: 0,
        totalFailures: 0,
        autoDisabled: false,
    };
    health.consecutiveFailures++;
    health.totalFailures = (health.totalFailures || 0) + 1;
    health.lastFailure = new Date().toISOString();
    health.lastError = error.substring(0, 200);

    if (health.consecutiveFailures >= AUTO_DISABLE_THRESHOLD && !health.autoDisabled) {
        health.autoDisabled = true;
        health.autoDisabledAt = new Date().toISOString();
        console.log(`   🚫 Auto-disabled "${groupName}" after ${health.consecutiveFailures} consecutive failures`);
    }

    state.groupHealth[groupName] = health;
    saveShareState(state);
}

/**
 * Reset all auto-disabled groups (use after cleaning up group list).
 */
export function resetGroupFailures(groupName = null) {
    const state = loadShareState();
    if (!state.groupHealth) state.groupHealth = {};
    if (groupName) {
        delete state.groupHealth[groupName];
    } else {
        state.groupHealth = {};
    }
    saveShareState(state);
}

/**
 * Check if a group has been auto-disabled due to repeated failures.
 */
export function isGroupAutoDisabled(groupName) {
    const state = loadShareState();
    return state.groupHealth?.[groupName]?.autoDisabled || false;
}

/**
 * Get health status for all share groups.
 */
export function getGroupHealth() {
    const state = loadShareState();
    const health = state.groupHealth || {};
    return SHARE_GROUPS.map(g => ({
        name: g.name,
        batch: g.batch,
        consecutiveFailures: health[g.name]?.consecutiveFailures || 0,
        totalFailures: health[g.name]?.totalFailures || 0,
        autoDisabled: health[g.name]?.autoDisabled || false,
        lastError: health[g.name]?.lastError || null,
    }));
}

function isShareOnCooldown(groupName) {
    const state = loadShareState();
    const last = state.lastShared[groupName];
    if (!last) return false;
    const elapsed = Date.now() - new Date(last.timestamp).getTime();
    return elapsed < SHARE_COOLDOWN_MS;
}

/**
 * Get all groups eligible for video sharing.
 * Filters out groups on cooldown and auto-disabled groups.
 */
export function getShareGroups(options = {}) {
    const ignoreCooldown = options.ignoreCooldown || false;
    return SHARE_GROUPS
        .filter(g => !g.shareDisabled)
        .filter(g => !isGroupAutoDisabled(g.name))
        .filter(g => ignoreCooldown || !isShareOnCooldown(g.name));
}

/**
 * Get share status for all groups.
 */
export function getGroupShareStatus() {
    const state = loadShareState();
    return SHARE_GROUPS.map(g => ({
        name: g.name,
        members: g.members,
        batch: g.batch,
        lastShared: state.lastShared[g.name]?.timestamp || null,
        onCooldown: isShareOnCooldown(g.name),
    }));
}

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
    SHARE_GROUPS,
    AVOID_GROUPS,
    getGroupCategory,
    getEligibleGroups,
    getGroupStatus,
    getShareGroups,
    getGroupShareStatus,
    getGroupHealth,
    recordGroupPost,
    recordGroupShare,
    recordGroupFailure,
    resetGroupFailures,
    isGroupAutoDisabled,
    isOnCooldown,
    getCooldownRemaining,
};

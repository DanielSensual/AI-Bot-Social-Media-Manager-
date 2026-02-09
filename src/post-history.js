/**
 * Post History - Persistent rolling log of posted content
 * Survives process restarts and prevents duplicate posts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = path.join(__dirname, '..', '.post-history.json');
const MAX_ENTRIES = 100;

/**
 * Load post history from disk
 * @returns {Array} Array of post records
 */
function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
        }
    } catch (e) {
        console.error('⚠️ Error loading post history, starting fresh:', e.message);
    }
    return [];
}

/**
 * Save post history to disk (auto-prunes to MAX_ENTRIES)
 */
function saveHistory(history) {
    const pruned = history.slice(-MAX_ENTRIES);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(pruned, null, 2));
}

/**
 * Check if text was recently posted (deduplication)
 * @param {string} text - Content to check
 * @returns {boolean} True if duplicate
 */
export function isDuplicate(text) {
    const history = loadHistory();
    const normalized = text.trim().toLowerCase();
    return history.some(entry => entry.text?.trim().toLowerCase() === normalized);
}

/**
 * Record a successfully posted entry
 * @param {object} post - Post data to record
 * @param {string} post.text - The content that was posted
 * @param {string} post.pillar - Content pillar used
 * @param {boolean} [post.aiGenerated] - Whether AI generated
 * @param {boolean} [post.hasVideo] - Whether included video
 * @param {object} [post.results] - Platform results { x, linkedin }
 */
export function record(post) {
    const history = loadHistory();
    history.push({
        ...post,
        timestamp: new Date().toISOString(),
    });
    saveHistory(history);
}

/**
 * Get recent post history
 * @param {number} n - Number of recent posts to return
 * @returns {Array} Recent post entries
 */
export function getRecent(n = 10) {
    const history = loadHistory();
    return history.slice(-n);
}

/**
 * Get post history stats
 * @returns {object} Stats summary
 */
export function getStats() {
    const history = loadHistory();
    const today = new Date().toISOString().split('T')[0];
    const postsToday = history.filter(h => h.timestamp?.startsWith(today)).length;

    const pillarCounts = {};
    for (const entry of history) {
        if (entry.pillar) {
            pillarCounts[entry.pillar] = (pillarCounts[entry.pillar] || 0) + 1;
        }
    }

    return {
        totalPosts: history.length,
        postsToday,
        pillarCounts,
        lastPost: history[history.length - 1] || null,
    };
}

export default { isDuplicate, record, getRecent, getStats };

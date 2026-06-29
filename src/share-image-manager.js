/**
 * Share Image Manager — Daniel Sensual
 *
 * Downloads and caches event flyer images from danielsensual.com
 * for attaching to Facebook group posts.
 *
 * v1: Bachata After Dark flyer support with 24h cache.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPromotedEvent } from './share-caption-generator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', '.image-cache', 'danielsensual');
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const SITE_ORIGIN = 'https://danielsensual.com';

// ─── Helpers ─────────────────────────────────────────────────────

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getCachePath(imageUrl) {
    const urlObj = new URL(imageUrl, SITE_ORIGIN);
    const basename = path.basename(urlObj.pathname);
    return path.join(CACHE_DIR, basename);
}

function isCacheFresh(filePath) {
    try {
        const stat = fs.statSync(filePath);
        return (Date.now() - stat.mtimeMs) < CACHE_MAX_AGE_MS;
    } catch {
        return false;
    }
}

// ─── Download Event Flyer ────────────────────────────────────────

/**
 * Download a flyer image from danielsensual.com with local caching.
 * Returns the local file path on success, null on failure.
 *
 * @param {string} imageUrl - Path or full URL to the flyer image
 * @returns {Promise<string|null>} Local file path or null
 */
export async function downloadEventFlyer(imageUrl) {
    if (!imageUrl) return null;

    // Resolve relative paths against the site origin
    const fullUrl = imageUrl.startsWith('http')
        ? imageUrl
        : `${SITE_ORIGIN}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;

    const cachePath = getCachePath(fullUrl);

    // Return cached version if fresh
    if (isCacheFresh(cachePath)) {
        console.log(`   📁 Using cached flyer: ${path.basename(cachePath)}`);
        return cachePath;
    }

    // Download fresh copy
    try {
        console.log(`   ⬇️  Downloading flyer: ${fullUrl}`);
        const response = await fetch(fullUrl, {
            headers: {
                'User-Agent': 'DanielSensual-Bot/1.0',
                'Accept': 'image/*',
            },
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
            console.log(`   ⚠️ Flyer download failed: HTTP ${response.status}`);
            return null;
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
            console.log(`   ⚠️ Unexpected content type: ${contentType}`);
            return null;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        ensureDir(CACHE_DIR);
        fs.writeFileSync(cachePath, buffer);

        const sizeKb = Math.round(buffer.length / 1024);
        console.log(`   ✅ Flyer cached: ${path.basename(cachePath)} (${sizeKb} KB)`);
        return cachePath;

    } catch (err) {
        console.log(`   ⚠️ Flyer download error: ${err.message}`);
        // Return stale cache if it exists (better than nothing)
        if (fs.existsSync(cachePath)) {
            console.log(`   📁 Using stale cached flyer as fallback`);
            return cachePath;
        }
        return null;
    }
}

// ─── Get Promoted Event Image ────────────────────────────────────

/**
 * High-level function: check for a promoted event and download its flyer.
 *
 * @param {object} [options]
 * @param {string} [options.imagePath] - Manual image override (skip download)
 * @returns {Promise<{imagePath: string, event: object}|null>}
 */
export async function getPromotedEventImage(options = {}) {
    // Manual override takes priority
    if (options.imagePath) {
        if (fs.existsSync(options.imagePath)) {
            console.log(`🖼️  Using manual image: ${options.imagePath}`);
            return {
                imagePath: options.imagePath,
                event: await getPromotedEvent(),
            };
        }
        console.log(`⚠️ Manual image not found: ${options.imagePath}`);
    }

    // Check for promoted event
    const event = await getPromotedEvent();
    if (!event) {
        return null;
    }

    // Download the event flyer
    const imagePath = await downloadEventFlyer(event.image);
    if (!imagePath) {
        console.log(`   ⚠️ No flyer available — posts will be text-only`);
        return null;
    }

    return { imagePath, event };
}

export default {
    downloadEventFlyer,
    getPromotedEventImage,
};

/**
 * Brand Intelligence System — Ghost AI SMMA
 * 
 * Central brand knowledge loader for all AI social media workers.
 * Every bot imports this module to understand who they're posting for.
 * 
 * Usage:
 *   import { loadBrand, getBrandPrompt, getBrandRules } from './brand-loader.js';
 *   
 *   const brand = loadBrand('daniel-sensual');
 *   const systemPrompt = getBrandPrompt(brand, 'facebook');
 *   const rules = getBrandRules(brand);
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRANDS_DIR = path.join(__dirname, '..', 'brands');

// Cache loaded brands in memory
const brandCache = new Map();

// ─── Core Loader ────────────────────────────────────────────────

/**
 * Load a brand profile by ID.
 * Returns the full brand object from brands/<brandId>.json
 */
export function loadBrand(brandId) {
    if (brandCache.has(brandId)) return brandCache.get(brandId);

    const brandPath = path.join(BRANDS_DIR, `${brandId}.json`);
    if (!fs.existsSync(brandPath)) {
        throw new Error(`Brand not found: ${brandId}. Create brands/${brandId}.json first.`);
    }

    const brand = JSON.parse(fs.readFileSync(brandPath, 'utf-8'));
    brandCache.set(brandId, brand);
    return brand;
}

/**
 * List all available brand profiles.
 */
export function listBrands() {
    if (!fs.existsSync(BRANDS_DIR)) return [];
    return fs.readdirSync(BRANDS_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => {
            const brand = loadBrand(f.replace('.json', ''));
            return {
                id: brand.brandId,
                name: brand.displayName,
                tagline: brand.tagline,
            };
        });
}

/**
 * Clear the brand cache (call after hot-reloading a brand file).
 */
export function clearBrandCache(brandId) {
    if (brandId) {
        brandCache.delete(brandId);
    } else {
        brandCache.clear();
    }
}

// ─── Brand Context Builders ─────────────────────────────────────

/**
 * Generate the system prompt / brand bible for an AI worker.
 * This is what gets injected into every LLM call so the AI truly "knows" the brand.
 * 
 * @param {object} brand - The brand profile object
 * @param {string} platform - Target platform ('facebook', 'instagram', 'x', 'threads')
 * @param {object} options - Additional context (pillar, event, etc.)
 */
export function getBrandPrompt(brand, platform = 'facebook', options = {}) {
    const v = brand.voice || {};
    const id = brand.identity || {};
    const aud = brand.audience || {};
    const pf = brand.platforms?.[platform] || {};
    const vis = brand.visual || {};
    const music = brand.music || {};
    const guard = brand.guardrails || {};

    // Build the voice section
    const personalityLines = (v.personality || []).map(p => `  - ${p}`).join('\n');
    const neverSaysLines = (v.neverSays || []).map(p => `  ✗ "${p}"`).join('\n');
    const signatureLines = (v.signaturePhrases || []).map(p => `  → "${p}"`).join('\n');

    // Build audience section
    const primaryAud = (aud.primary || []).map(a => `  - ${a}`).join('\n');
    const psycho = aud.psychographics || {};

    // Build pillar context if a specific pillar is requested
    const pillarCtx = options.pillar && brand.contentPillars?.[options.pillar]
        ? buildPillarContext(brand.contentPillars[options.pillar], options.pillar)
        : '';

    // Build platform-specific rules
    const platformRules = pf.rules
        ? '\nPLATFORM RULES:\n' + pf.rules.map(r => `  - ${r}`).join('\n')
        : '';

    // Build formatting rules from guardrails
    const fmt = guard.formatting || {};
    const content = guard.content || {};

    return `═══ BRAND INTELLIGENCE: ${brand.displayName} ═══

IDENTITY:
  ${brand.displayName} — ${brand.tagline}
  ${id.background}
  Location: ${id.location}

STORY:
  ${id.story}

WHAT MAKES THIS BRAND DIFFERENT:
  ${id.differentiator}

VOICE & PERSONALITY:
  Tone: ${v.tone}
  Language: ${v.language}
${personalityLines}

NEVER SAY (instant credibility kill):
${neverSaysLines}

SIGNATURE PHRASES (use sparingly, naturally):
${signatureLines}

PRIMARY AUDIENCE:
${primaryAud}
  They value: ${(psycho.values || []).join(', ')}
  They're tired of: ${(psycho.painPoints || []).join('; ')}

CURRENT MUSIC:
  Latest: "${music.currentRelease?.title}" (${music.currentRelease?.releaseDate})
  Style: ${music.productionNotes}

VISUAL IDENTITY:
  ${vis.aesthetic}
  Colors: ${(vis.colorPalette || []).join(', ')}

PLATFORM: ${platform.toUpperCase()}
  Strategy: ${pf.strategy || 'General social media presence'}
${platformRules}
${pillarCtx}

═══ FORMATTING GUARDRAILS ═══
  Max emojis: ${fmt.maxEmojis || 2}
  Max hashtags: ${fmt.maxHashtags || 3} (${fmt.hashtagCase || 'lowercase'})
  Max characters: ${fmt.maxChars || 800}
  No markdown: ${fmt.noMarkdown ? 'YES' : 'No'}
  No bullet lists: ${fmt.noBulletLists ? 'YES' : 'No'}
  No all caps: ${fmt.noAllCaps ? 'YES' : 'No'}
  No third person: ${content.noThirdPerson ? 'YES' : 'No'}
  No engagement bait: ${content.noEngagementBait ? 'YES' : 'No'}
  No emoji openers: ${content.noEmojiOpeners ? 'YES' : 'No'}
`;
}

function buildPillarContext(pillar, pillarName) {
    if (!pillar) return '';
    const practices = (pillar.bestPractices || []).map(p => `    - ${p}`).join('\n');
    return `
CONTENT ANGLE: ${pillarName}
  Description: ${pillar.description}
  Goal: ${pillar.goal}
  Best practices:
${practices}`;
}

// ─── Convenience Accessors ──────────────────────────────────────

/**
 * Get formatting rules as a simple object for content validators.
 */
export function getBrandRules(brand) {
    const fmt = brand.guardrails?.formatting || {};
    const content = brand.guardrails?.content || {};
    return {
        maxEmojis: fmt.maxEmojis || 2,
        maxHashtags: fmt.maxHashtags || 3,
        hashtagCase: fmt.hashtagCase || 'lowercase',
        maxChars: fmt.maxChars || 800,
        noMarkdown: fmt.noMarkdown !== false,
        noBulletLists: fmt.noBulletLists !== false,
        noThirdPerson: content.noThirdPerson !== false,
        noEngagementBait: content.noEngagementBait !== false,
        noEmojiOpeners: content.noEmojiOpeners !== false,
    };
}

/**
 * Get streaming links for the brand's current release.
 */
export function getStreamingLinks(brand) {
    return brand.music?.currentRelease?.links || {};
}

/**
 * Get the content pillar config for a specific angle.
 */
export function getPillarConfig(brand, pillarName) {
    return brand.contentPillars?.[pillarName] || null;
}

/**
 * Get platform-specific config.
 */
export function getPlatformConfig(brand, platform) {
    return brand.platforms?.[platform] || {};
}

/**
 * Get the brand's "never say" list for post-generation validation.
 */
export function getNeverSayList(brand) {
    return brand.voice?.neverSays || [];
}

/**
 * Validate a generated caption against brand rules.
 * Returns { valid: boolean, violations: string[] }
 */
export function validateCaption(brand, caption) {
    const rules = getBrandRules(brand);
    const neverSay = getNeverSayList(brand);
    const violations = [];

    if (!caption || typeof caption !== 'string') {
        return { valid: false, violations: ['Caption is empty or not a string'] };
    }

    // Character limit
    if (caption.length > rules.maxChars) {
        violations.push(`Over ${rules.maxChars} char limit (${caption.length})`);
    }

    // Emoji count
    const emojiRegex = /[\u{1F600}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1FA00}-\u{1FAFF}]/gu;
    const emojiCount = (caption.match(emojiRegex) || []).length;
    if (emojiCount > rules.maxEmojis) {
        violations.push(`Too many emojis: ${emojiCount} (max ${rules.maxEmojis})`);
    }

    // Hashtag count
    const hashtags = caption.match(/#\w+/g) || [];
    if (hashtags.length > rules.maxHashtags) {
        violations.push(`Too many hashtags: ${hashtags.length} (max ${rules.maxHashtags})`);
    }

    // Hashtag case
    if (rules.hashtagCase === 'lowercase') {
        const upperTags = hashtags.filter(h => h !== h.toLowerCase());
        if (upperTags.length > 0) {
            violations.push(`Uppercase hashtags: ${upperTags.join(', ')}`);
        }
    }

    // Emoji at start of line
    if (rules.noEmojiOpeners) {
        const lines = caption.split('\n').filter(l => l.trim());
        const emojiOpeners = lines.filter(l => emojiRegex.test(l.trim().charAt(0)));
        if (emojiOpeners.length > 0) {
            violations.push('Lines starting with emoji detected');
        }
    }

    // "Never say" phrases
    const captionLower = caption.toLowerCase();
    for (const phrase of neverSay) {
        if (captionLower.includes(phrase.toLowerCase())) {
            violations.push(`Contains banned phrase: "${phrase}"`);
        }
    }

    // Markdown
    if (rules.noMarkdown && (/\*\*[^*]+\*\*/.test(caption) || /_[^_]+_/.test(caption))) {
        violations.push('Contains markdown formatting');
    }

    // All caps words (3+ char words in all caps)
    if (rules.noAllCaps !== false) {
        const allCapsWords = caption.match(/\b[A-Z]{4,}\b/g) || [];
        // Allow hashtags and common acronyms
        const realAllCaps = allCapsWords.filter(w => !['FOMO', 'RSVP', 'DM', 'EST', 'EDT', 'NYC', 'ATL'].includes(w));
        if (realAllCaps.length > 0) {
            violations.push(`All-caps words: ${realAllCaps.join(', ')}`);
        }
    }

    return {
        valid: violations.length === 0,
        violations,
    };
}

// ─── Default Export ─────────────────────────────────────────────

export default {
    loadBrand,
    listBrands,
    clearBrandCache,
    getBrandPrompt,
    getBrandRules,
    getStreamingLinks,
    getPillarConfig,
    getPlatformConfig,
    getNeverSayList,
    validateCaption,
};

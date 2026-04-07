/**
 * Shared caption post-processing utilities.
 * Cleans up AI-generated text to look natural and human on Facebook.
 */

/**
 * Post-process an AI-generated caption to remove bot-like artifacts.
 * - Strips markdown bold/italic markers
 * - Collapses 3+ consecutive newlines to 2
 * - Removes leading/trailing whitespace from lines
 * - Cleans over-structured bullet lists (→ • ✓ ▸) to max 3 per post
 * - Strips trailing hashtag blocks that exceed 3 tags
 * - Removes any residual JSON or code fence artifacts
 *
 * @param {string} text - Raw caption text
 * @returns {string} Cleaned, human-looking caption
 */
export function humanizeCaption(text) {
    if (!text) return '';

    let caption = String(text);

    // Strip markdown bold/italic markers: **bold** → bold, *italic* → italic, __bold__ → bold
    caption = caption.replace(/\*\*(.+?)\*\*/g, '$1');
    caption = caption.replace(/__(.+?)__/g, '$1');
    caption = caption.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1');
    caption = caption.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '$1');

    // Strip code fences and inline code
    caption = caption.replace(/```[\s\S]*?```/g, '');
    caption = caption.replace(/`([^`]+)`/g, '$1');

    // Normalize line endings
    caption = caption.replace(/\r\n/g, '\n');

    // Trim whitespace from each line
    caption = caption
        .split('\n')
        .map((line) => line.trim())
        .join('\n');

    // Collapse 3+ consecutive newlines to double
    caption = caption.replace(/\n{3,}/g, '\n\n');

    // Limit bullet-style markers (→ • ✓ ▸ ✔ ■ ●) to max 3 occurrences
    // If more than 3, convert extras to regular dashes
    const bulletPattern = /^(\s*)(→|•|✓|▸|✔|■|●)\s/gm;
    let bulletCount = 0;
    caption = caption.replace(bulletPattern, (match, indent, bullet) => {
        bulletCount++;
        if (bulletCount > 3) {
            return `${indent}- `;
        }
        return match;
    });

    // If we had to convert bullets, also cap the dashes at a reasonable count
    // to prevent long robotic lists
    let dashCount = 0;
    caption = caption.replace(/^(\s*)- /gm, (match, indent) => {
        dashCount++;
        if (dashCount > 4) {
            return `${indent}`;  // strip the dash, keep text inline
        }
        return match;
    });

    // Trim excess hashtags — keep max 3
    const hashtagBlock = caption.match(/((?:\n|^)\s*(?:#\w+\s*){4,})$/);
    if (hashtagBlock) {
        const tags = hashtagBlock[1].match(/#\w+/g) || [];
        if (tags.length > 3) {
            const kept = tags.slice(0, 3).join(' ');
            caption = caption.replace(hashtagBlock[1], `\n\n${kept}`);
        }
    }

    // Final trim
    caption = caption.trim();

    return caption;
}

export default { humanizeCaption };

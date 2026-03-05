/**
 * Facebook Composer Text Insertion Snippets
 * 
 * Reusable JavaScript snippets for inserting properly-formatted text
 * into Facebook's post composer via browser automation.
 * 
 * Facebook uses a custom Draft.js/Lexical editor that doesn't handle
 * regular \n characters in insertText. These methods work reliably.
 */

/**
 * METHOD 1: ClipboardEvent Paste (PREFERRED)
 * 
 * Simulates a clipboard paste event. Facebook's editor natively handles
 * pasted text and preserves line breaks correctly.
 * 
 * Usage in browser subagent execute_browser_javascript:
 */
export const PASTE_TEXT_SNIPPET = `
(function(text) {
    const selectors = [
        'div[role="dialog"] div[contenteditable="true"][role="textbox"]',
        'div[role="dialog"] div[contenteditable="true"]',
        'form div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"][data-lexical-editor="true"]',
        'div[contenteditable="true"][role="textbox"]'
    ];
    
    let editor = null;
    for (const sel of selectors) {
        editor = document.querySelector(sel);
        if (editor) break;
    }
    
    if (!editor) return 'ERROR: Could not find editor element';
    
    editor.focus();
    
    // Create clipboard paste event with properly formatted text
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', text);
    const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dataTransfer,
        bubbles: true,
        cancelable: true
    });
    editor.dispatchEvent(pasteEvent);
    
    // Verify text was inserted
    const inserted = editor.textContent.trim().length > 0;
    if (!inserted) {
        // Fallback: paragraph-by-paragraph with insertLineBreak
        const paragraphs = text.split('\\n\\n');
        for (let i = 0; i < paragraphs.length; i++) {
            const lines = paragraphs[i].split('\\n');
            for (let j = 0; j < lines.length; j++) {
                document.execCommand('insertText', false, lines[j]);
                if (j < lines.length - 1) {
                    document.execCommand('insertLineBreak');
                }
            }
            if (i < paragraphs.length - 1) {
                document.execCommand('insertLineBreak');
                document.execCommand('insertLineBreak');
            }
        }
    }
    
    return 'Text inserted: ' + editor.textContent.length + ' chars';
})
`;

/**
 * METHOD 2: Paragraph-by-Paragraph with insertLineBreak (FALLBACK)
 * 
 * Splits text into paragraphs and inserts real line breaks between them.
 * More reliable than \n in insertText, but slower.
 */
export const PARAGRAPH_INSERT_SNIPPET = `
(function(paragraphs) {
    const selectors = [
        'div[role="dialog"] div[contenteditable="true"][role="textbox"]',
        'div[role="dialog"] div[contenteditable="true"]',
        'form div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"][data-lexical-editor="true"]',
        'div[contenteditable="true"][role="textbox"]'
    ];
    
    let editor = null;
    for (const sel of selectors) {
        editor = document.querySelector(sel);
        if (editor) break;
    }
    
    if (!editor) return 'ERROR: Could not find editor element';
    
    editor.focus();
    
    for (let i = 0; i < paragraphs.length; i++) {
        document.execCommand('insertText', false, paragraphs[i]);
        if (i < paragraphs.length - 1) {
            // Two line breaks = empty line between paragraphs
            document.execCommand('insertLineBreak');
            document.execCommand('insertLineBreak');
        }
    }
    
    return 'Inserted ' + paragraphs.length + ' paragraphs, ' + editor.textContent.length + ' chars total';
})
`;

/**
 * Generate the JS snippet string for browser subagent use.
 * 
 * @param {string} caption - Full caption text with \n for line breaks
 * @returns {string} JavaScript code to execute in the browser
 */
export function generatePasteSnippet(caption) {
    // Escape backticks and backslashes for template literal
    const escaped = caption
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$/g, '\\$');

    return `
const editor = document.querySelector('div[role="dialog"] div[contenteditable="true"][role="textbox"]') 
    || document.querySelector('div[contenteditable="true"][role="textbox"]');
if (!editor) { 'ERROR: editor not found'; } else {
    editor.focus();
    const text = \`${escaped}\`;
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    const pe = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    editor.dispatchEvent(pe);
    
    // Verify + fallback
    if (editor.textContent.trim().length === 0) {
        const paragraphs = text.split('\\n\\n');
        for (let i = 0; i < paragraphs.length; i++) {
            document.execCommand('insertText', false, paragraphs[i]);
            if (i < paragraphs.length - 1) {
                document.execCommand('insertLineBreak');
                document.execCommand('insertLineBreak');
            }
        }
    }
    'Inserted ' + editor.textContent.length + ' chars';
}`;
}

/**
 * Generate paragraph-based snippet for browser subagent.
 * Splits caption at double-newlines into separate paragraphs.
 * 
 * @param {string} caption - Full caption text
 * @returns {string} JavaScript code to execute in the browser
 */
export function generateParagraphSnippet(caption) {
    const paragraphs = caption.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
    const escaped = JSON.stringify(paragraphs);

    return `
const editor = document.querySelector('div[role="dialog"] div[contenteditable="true"][role="textbox"]') 
    || document.querySelector('div[contenteditable="true"][role="textbox"]');
if (!editor) { 'ERROR: editor not found'; } else {
    editor.focus();
    const paragraphs = ${escaped};
    for (let i = 0; i < paragraphs.length; i++) {
        document.execCommand('insertText', false, paragraphs[i]);
        if (i < paragraphs.length - 1) {
            document.execCommand('insertLineBreak');
            document.execCommand('insertLineBreak');
        }
    }
    'Inserted ' + paragraphs.length + ' paragraphs';
}`;
}

export default {
    PASTE_TEXT_SNIPPET,
    PARAGRAPH_INSERT_SNIPPET,
    generatePasteSnippet,
    generateParagraphSnippet,
};

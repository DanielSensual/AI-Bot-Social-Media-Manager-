/**
 * LinkedIn Message Responder
 * Automated bot that checks LinkedIn messages and responds using AI
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_FILE = path.join(__dirname, '..', '.linkedin-cookies.json');
const LOGS_DIR = path.join(__dirname, '..', 'logs', 'linkedin-responses');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Response disclaimer
const DISCLAIMER = `\n\n---\n📌 This account uses AI assistance. Your message has been forwarded to Daniel for personal review.`;

/**
 * Save browser cookies for session persistence
 */
export async function saveCookies(page) {
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    console.log(`✅ Saved ${cookies.length} cookies to ${COOKIES_FILE}`);
}

/**
 * Load saved cookies into browser
 */
export async function loadCookies(page) {
    if (!fs.existsSync(COOKIES_FILE)) {
        console.log('⚠️ No saved cookies found');
        return false;
    }

    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'));
    await page.setCookie(...cookies);
    console.log(`✅ Loaded ${cookies.length} cookies`);
    return true;
}

/**
 * Check if logged in to LinkedIn
 */
async function isLoggedIn(page) {
    try {
        await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'networkidle2', timeout: 30000 });
        const url = page.url();
        return !url.includes('/login') && !url.includes('/checkpoint');
    } catch (error) {
        return false;
    }
}

/**
 * Get unread message conversations
 */
async function getUnreadConversations(page) {
    console.log('📥 Checking for unread messages...');

    await page.goto('https://www.linkedin.com/messaging/', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('.msg-conversations-container__conversations-list', { timeout: 10000 });

    // Wait for conversations to load
    await new Promise(r => setTimeout(r, 2000));

    // Find unread conversations (they have a blue dot indicator)
    const conversations = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('.msg-conversation-listitem'));
        const unread = [];

        for (const item of items) {
            // Check for unread indicator
            const unreadIndicator = item.querySelector('.msg-conversation-listitem__unread-count') ||
                item.querySelector('.notification-badge') ||
                item.querySelector('[class*="unread"]');

            if (unreadIndicator) {
                const nameEl = item.querySelector('.msg-conversation-listitem__participant-names');
                const previewEl = item.querySelector('.msg-conversation-listitem__message-snippet');
                const linkEl = item.querySelector('a');

                unread.push({
                    name: nameEl?.textContent?.trim() || 'Unknown',
                    preview: previewEl?.textContent?.trim() || '',
                    href: linkEl?.href || '',
                });
            }
        }

        return unread;
    });

    console.log(`📬 Found ${conversations.length} unread conversation(s)`);
    return conversations;
}

/**
 * Get messages from a conversation
 */
async function getConversationMessages(page, conversationUrl) {
    await page.goto(conversationUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    const messages = await page.evaluate(() => {
        const msgItems = Array.from(document.querySelectorAll('.msg-s-event-listitem'));
        const recent = msgItems.slice(-5); // Get last 5 messages

        return recent.map(item => {
            const senderEl = item.querySelector('.msg-s-message-group__name');
            const contentEl = item.querySelector('.msg-s-event-listitem__body');
            const timeEl = item.querySelector('.msg-s-message-group__timestamp');

            return {
                sender: senderEl?.textContent?.trim() || 'Unknown',
                content: contentEl?.textContent?.trim() || '',
                time: timeEl?.textContent?.trim() || '',
            };
        });
    });

    return messages;
}

/**
 * Generate AI response using OpenAI
 */
async function generateAIResponse(senderName, messages) {
    const conversationContext = messages
        .map(m => `${m.sender}: ${m.content}`)
        .join('\n');

    const prompt = `You are responding to a LinkedIn message on behalf of Daniel Castillo, who runs Ghost AI Systems (a web development and AI automation agency in Florida).

The sender is: ${senderName}

Recent conversation:
${conversationContext}

Generate a professional, friendly response that:
1. Acknowledges their message appropriately
2. Is helpful and engaging
3. Keeps the door open for follow-up if relevant
4. Is concise (2-4 sentences max)
5. Matches the tone of a busy but friendly agency owner

DO NOT include any disclaimer or mention that you're an AI - that will be added separately.
DO NOT use overly formal language - keep it conversational and professional.
DO NOT start with "Hey [Name]!" - vary your greetings.

Response:`;

    const completion = await openai.chat.completions.create({
        model: 'gpt-5.2-thinking',
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 500,
    });

    return completion.choices[0].message.content.trim();
}

/**
 * Send a message in the current conversation
 */
async function sendMessage(page, message) {
    // Find the message input
    const inputSelector = 'div[role="textbox"][aria-label*="message" i], div[role="textbox"][aria-label*="Message" i], div.msg-form__contenteditable';

    await page.waitForSelector(inputSelector, { timeout: 5000 });

    // Clear and set message using JavaScript (more reliable than typing)
    await page.evaluate((msg, selector) => {
        const el = document.querySelector(selector);
        if (el) {
            el.focus();
            el.innerHTML = '<p>' + msg.replace(/\n/g, '</p><p>') + '</p>';
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }, message, inputSelector);

    await new Promise(r => setTimeout(r, 500));

    // Click send button
    const sendBtn = await page.$('button.msg-form__send-button, button[type="submit"]');
    if (sendBtn) {
        await sendBtn.click();
        await new Promise(r => setTimeout(r, 1000));
        return true;
    }

    return false;
}

/**
 * Log interaction to file
 */
function logInteraction(senderName, receivedMessages, sentResponse) {
    const timestamp = new Date().toISOString();
    const dateStr = timestamp.split('T')[0];
    const logFile = path.join(LOGS_DIR, `${dateStr}.json`);

    let logs = [];
    if (fs.existsSync(logFile)) {
        logs = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
    }

    logs.push({
        timestamp,
        sender: senderName,
        receivedMessages,
        sentResponse,
    });

    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
    console.log(`📝 Logged interaction with ${senderName}`);
}

/**
 * Main function to check and respond to messages
 */
export async function respondToMessages(options = {}) {
    const {
        dryRun = false,
        limit = 5,
        headless = true,
    } = options;

    console.log('');
    console.log('🤖 LinkedIn AI Message Responder');
    console.log('═'.repeat(50));
    console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`   Max responses: ${limit}`);
    console.log('');

    // Use Chrome user data directory for persistent login
    const userDataDir = path.join(process.env.HOME, '.linkedin-chrome-profile');

    const browser = await puppeteer.launch({
        headless: headless ? 'new' : false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--user-data-dir=${userDataDir}`,
        ],
        defaultViewport: { width: 1280, height: 800 },
    });

    const page = await browser.newPage();

    try {
        // Check if logged in (using Chrome user data dir for persistent session)
        const loggedIn = await isLoggedIn(page);
        if (!loggedIn) {
            console.log('❌ Not logged in. Run: npm run linkedin:save-session');
            console.log('   (This will open a browser where you can log in once)');
            await browser.close();
            return { success: false, error: 'Not logged in' };
        }

        console.log('✅ Logged in to LinkedIn');

        // Get unread conversations
        const unreadConversations = await getUnreadConversations(page);

        if (unreadConversations.length === 0) {
            console.log('✨ No unread messages');
            await browser.close();
            return { success: true, responded: 0 };
        }

        let responded = 0;

        for (const conv of unreadConversations.slice(0, limit)) {
            console.log('');
            console.log(`💬 Processing: ${conv.name}`);
            console.log(`   Preview: ${conv.preview.substring(0, 50)}...`);

            // Get full messages
            const messages = await getConversationMessages(page, conv.href);
            const lastMessage = messages[messages.length - 1];

            console.log(`   Last message: "${lastMessage?.content?.substring(0, 60)}..."`);

            // Generate AI response
            console.log('   🧠 Generating AI response...');
            const aiResponse = await generateAIResponse(conv.name, messages);
            const fullResponse = aiResponse + DISCLAIMER;

            console.log(`   Response: "${aiResponse.substring(0, 60)}..."`);

            if (dryRun) {
                console.log('   🔒 DRY RUN - Not sending');
            } else {
                // Send the message
                const sent = await sendMessage(page, fullResponse);
                if (sent) {
                    console.log('   ✅ Message sent!');
                    logInteraction(conv.name, messages, fullResponse);
                    responded++;
                } else {
                    console.log('   ❌ Failed to send');
                }
            }
        }

        await browser.close();

        console.log('');
        console.log('═'.repeat(50));
        console.log(`✅ Done! Responded to ${responded} message(s)`);

        return { success: true, responded };

    } catch (error) {
        console.error('❌ Error:', error.message);
        await browser.close();
        return { success: false, error: error.message };
    }
}

/**
 * Interactive session saver - opens browser for manual login
 */
export async function saveSession() {
    console.log('');
    console.log('🔐 LinkedIn Session Saver');
    console.log('═'.repeat(50));
    console.log('');
    console.log('A browser will open. Please:');
    console.log('1. Log in to LinkedIn');
    console.log('2. Complete any 2FA verification');
    console.log('3. Once logged in, press Enter in this terminal');
    console.log('');
    console.log('Your login will be saved to a Chrome profile and');
    console.log('remembered for future automated runs.');
    console.log('');

    // Use same Chrome user data directory for persistent session
    const userDataDir = path.join(process.env.HOME, '.linkedin-chrome-profile');

    const browser = await puppeteer.launch({
        headless: false,
        args: [
            '--no-sandbox',
            `--user-data-dir=${userDataDir}`,
        ],
        defaultViewport: { width: 1280, height: 800 },
    });

    const page = await browser.newPage();
    await page.goto('https://www.linkedin.com/login');

    // Wait for user to log in
    console.log('⏳ Waiting for login... (press Enter when done)');

    await new Promise(resolve => {
        process.stdin.once('data', resolve);
    });

    // Verify login worked
    const loggedIn = await isLoggedIn(page);

    await browser.close();

    if (loggedIn) {
        console.log('');
        console.log('✅ Session saved! You can now run the responder.');
        console.log('   Your login is stored in: ~/.linkedin-chrome-profile');
    } else {
        console.log('');
        console.log('⚠️ Login not detected. Please try again.');
    }
}

export default { respondToMessages, saveSession };

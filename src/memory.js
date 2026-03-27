/**
 * Ghost AI Memory Module — Dual-Layer Persistent Memory
 * 
 * Layer 1: SQLite (local) — conversation_buffer + entity_facts
 * Layer 2: Supabase pgvector (cloud) — long-term semantic memory
 * 
 * Usage:
 *   import { remember, recall, recallSemantic, extractFacts, consolidate } from './memory.js';
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateText } from './llm-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'ghostai.db');

const BUFFER_LIMIT = 15;          // Max messages per thread in working memory
const CONSOLIDATION_AGE_HOURS = 24;
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMS = 768;       // Matryoshka truncation for cost/perf

const MEMORY_ENABLED = (process.env.MEMORY_ENABLED || 'false').toLowerCase() === 'true';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

let _db = null;

// =============================================================================
// Database Initialization
// =============================================================================

function getDb() {
    if (_db) return _db;

    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');

    _db.exec(`
        CREATE TABLE IF NOT EXISTS conversation_buffer (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id TEXT NOT NULL,
            thread_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            metadata_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_conv_thread
            ON conversation_buffer(agent_id, thread_id);
        CREATE INDEX IF NOT EXISTS idx_conv_created
            ON conversation_buffer(created_at);

        CREATE TABLE IF NOT EXISTS entity_facts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            fact_key TEXT NOT NULL,
            fact_value TEXT NOT NULL,
            confidence REAL DEFAULT 1.0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(agent_id, entity_id, fact_key)
        );
    `);

    return _db;
}

// =============================================================================
// Layer 1 — Working Memory (SQLite)
// =============================================================================

/**
 * Store a message in the conversation buffer.
 * Auto-trims to BUFFER_LIMIT per thread.
 * 
 * @param {string} agentId - e.g. 'facebook-responder', 'lead-hunter'
 * @param {string} threadId - platform conversation/thread ID
 * @param {'user'|'assistant'|'system'} role
 * @param {string} content - message content
 * @param {object} [metadata] - optional sender info, platform, etc.
 */
export function remember(agentId, threadId, role, content, metadata = null) {
    if (!MEMORY_ENABLED) return;

    const db = getDb();

    db.prepare(`
        INSERT INTO conversation_buffer (agent_id, thread_id, role, content, metadata_json)
        VALUES (?, ?, ?, ?, ?)
    `).run(agentId, threadId, role, content, metadata ? JSON.stringify(metadata) : null);

    // Auto-trim: keep only the most recent BUFFER_LIMIT messages per thread
    db.prepare(`
        DELETE FROM conversation_buffer
        WHERE id NOT IN (
            SELECT id FROM conversation_buffer
            WHERE agent_id = ? AND thread_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        ) AND agent_id = ? AND thread_id = ?
    `).run(agentId, threadId, BUFFER_LIMIT, agentId, threadId);
}

/**
 * Recall recent messages for a thread.
 * Returns an OpenAI-compatible messages[] array.
 * 
 * @param {string} agentId
 * @param {string} threadId
 * @param {number} [limit=15]
 * @returns {{ role: string, content: string }[]}
 */
export function recall(agentId, threadId, limit = BUFFER_LIMIT) {
    if (!MEMORY_ENABLED) return [];

    const db = getDb();
    const rows = db.prepare(`
        SELECT role, content, metadata_json, created_at
        FROM conversation_buffer
        WHERE agent_id = ? AND thread_id = ?
        ORDER BY created_at ASC
        LIMIT ?
    `).all(agentId, threadId, limit);

    return rows.map(r => ({
        role: r.role,
        content: r.content,
        ...(r.metadata_json ? { metadata: JSON.parse(r.metadata_json) } : {}),
    }));
}

/**
 * Get entity facts for a user/account.
 * 
 * @param {string} agentId
 * @param {string} entityId - user/page/account ID
 * @returns {Record<string, string>}
 */
export function getEntityFacts(agentId, entityId) {
    if (!MEMORY_ENABLED) return {};

    const db = getDb();
    const rows = db.prepare(`
        SELECT fact_key, fact_value FROM entity_facts
        WHERE agent_id = ? AND entity_id = ?
    `).all(agentId, entityId);

    return Object.fromEntries(rows.map(r => [r.fact_key, r.fact_value]));
}

/**
 * Store or update a fact about an entity.
 * Uses UPSERT — existing facts are updated in place.
 * 
 * @param {string} agentId
 * @param {string} entityId
 * @param {string} key - e.g. 'name', 'language', 'interest'
 * @param {string} value
 * @param {number} [confidence=1.0]
 */
export function storeFact(agentId, entityId, key, value, confidence = 1.0) {
    if (!MEMORY_ENABLED) return;

    const db = getDb();
    db.prepare(`
        INSERT INTO entity_facts (agent_id, entity_id, fact_key, fact_value, confidence)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(agent_id, entity_id, fact_key) DO UPDATE SET
            fact_value = excluded.fact_value,
            confidence = excluded.confidence,
            updated_at = CURRENT_TIMESTAMP
    `).run(agentId, entityId, key, value, confidence);
}

/**
 * Extract structured facts from a message using a lightweight LLM call.
 * Stores extracted facts in the entity_facts table.
 * 
 * @param {string} agentId
 * @param {string} entityId - the sender's ID
 * @param {string} content - the message to extract from
 */
export async function extractFacts(agentId, entityId, content) {
    if (!MEMORY_ENABLED) return;

    try {
        const result = await generateText({
            prompt: `Extract key facts from this message. Return ONLY a JSON object with keys like "name", "language", "interest", "location", "intent", "dance_level". Only include facts clearly stated. If no facts found, return {}.

Message: "${content}"`,
            systemPrompt: 'You are a fact extraction engine. Return only valid JSON, no markdown fences.',
            maxOutputTokens: 200,
            provider: 'openai',
            openaiModel: 'gpt-4.1-nano',
        });

        const facts = JSON.parse(result.text);
        for (const [key, value] of Object.entries(facts)) {
            if (value && typeof value === 'string' && value.trim()) {
                storeFact(agentId, entityId, key, value.trim());
            }
        }
    } catch (err) {
        // Non-critical — log and continue
        console.warn(`⚠️ Fact extraction failed: ${err.message}`);
    }
}

// =============================================================================
// Layer 2 — Long-Term Memory (Supabase pgvector)
// =============================================================================

/**
 * Create an embedding vector for text.
 * Uses OpenAI text-embedding-3-small with Matryoshka 768-dim truncation.
 * 
 * @param {string} text
 * @returns {number[]} embedding vector
 */
async function embed(text) {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
        dimensions: EMBEDDING_DIMS,
    });

    return response.data[0].embedding;
}

/**
 * Query Supabase pgvector for semantically similar memories.
 * 
 * @param {string} query - natural language query
 * @param {object} [options]
 * @param {string} [options.agentId] - filter by agent
 * @param {number} [options.threshold=0.7] - similarity threshold
 * @param {number} [options.limit=5] - max results
 * @returns {Array<{ summary: string, similarity: number, metadata: object }>}
 */
export async function recallSemantic(query, options = {}) {
    if (!MEMORY_ENABLED || !SUPABASE_URL || !SUPABASE_KEY) return [];

    const { agentId = null, threshold = 0.7, limit = 5 } = options;

    try {
        const queryEmbedding = await embed(query);

        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_memories`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
            },
            body: JSON.stringify({
                query_embedding: queryEmbedding,
                match_threshold: threshold,
                match_count: limit,
                filter_agent: agentId,
            }),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            console.warn(`⚠️ Supabase memory recall failed (${response.status}): ${errText}`);
            return [];
        }

        const memories = await response.json();
        return memories.map(m => ({
            summary: m.summary,
            similarity: m.similarity,
            metadata: m.metadata || {},
            threadId: m.thread_id,
        }));
    } catch (err) {
        console.warn(`⚠️ Semantic recall failed: ${err.message}`);
        return [];
    }
}

/**
 * Store a memory embedding in Supabase.
 * 
 * @param {string} agentId
 * @param {string} threadId
 * @param {string} summary
 * @param {object} [metadata]
 */
async function storeSemanticMemory(agentId, threadId, summary, metadata = {}) {
    if (!SUPABASE_URL || !SUPABASE_KEY) return;

    const embedding = await embed(summary);

    const response = await fetch(`${SUPABASE_URL}/rest/v1/bot_memories`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
            agent_id: agentId,
            thread_id: threadId,
            summary,
            embedding: JSON.stringify(embedding),
            metadata,
        }),
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Supabase insert failed (${response.status}): ${errText}`);
    }
}

// =============================================================================
// Consolidation — ETL from SQLite to Supabase
// =============================================================================

/**
 * Consolidate old conversations into long-term semantic memory.
 * - Reads conversation_buffer entries older than `olderThanHours`
 * - Groups by thread_id
 * - Summarizes each thread via LLM
 * - Embeds and stores in Supabase pgvector
 * - Prunes processed entries (keeps last BUFFER_LIMIT per thread)
 * 
 * @param {number} [olderThanHours=24]
 * @returns {{ threadsProcessed: number, memoriesCreated: number }}
 */
export async function consolidate(olderThanHours = CONSOLIDATION_AGE_HOURS) {
    if (!MEMORY_ENABLED) return { threadsProcessed: 0, memoriesCreated: 0 };

    const db = getDb();
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();

    // Find threads with messages older than cutoff
    const threads = db.prepare(`
        SELECT DISTINCT agent_id, thread_id
        FROM conversation_buffer
        WHERE created_at < ?
    `).all(cutoff);

    let memoriesCreated = 0;

    for (const { agent_id, thread_id } of threads) {
        try {
            // Get all messages for this thread
            const messages = db.prepare(`
                SELECT role, content, created_at
                FROM conversation_buffer
                WHERE agent_id = ? AND thread_id = ?
                ORDER BY created_at ASC
            `).all(agent_id, thread_id);

            if (messages.length < 2) continue; // Need at least a back-and-forth

            // Build conversation transcript
            const transcript = messages
                .map(m => `[${m.role}] ${m.content}`)
                .join('\n');

            // Summarize via LLM
            const result = await generateText({
                prompt: `Summarize this conversation into a dense paragraph of key facts, topics discussed, user preferences, and decisions made. Focus on information useful for future personalization.\n\n${transcript}`,
                systemPrompt: 'You are a conversation summarizer. Be factual and concise. Max 150 words.',
                maxOutputTokens: 300,
                provider: 'openai',
                openaiModel: 'gpt-4.1-nano',
            });

            // Store in Supabase
            await storeSemanticMemory(agent_id, thread_id, result.text, {
                messageCount: messages.length,
                firstMessage: messages[0].created_at,
                lastMessage: messages[messages.length - 1].created_at,
            });

            memoriesCreated++;

            // Prune old messages from buffer (keep last BUFFER_LIMIT)
            db.prepare(`
                DELETE FROM conversation_buffer
                WHERE id NOT IN (
                    SELECT id FROM conversation_buffer
                    WHERE agent_id = ? AND thread_id = ?
                    ORDER BY created_at DESC
                    LIMIT ?
                ) AND agent_id = ? AND thread_id = ?
                AND created_at < ?
            `).run(agent_id, thread_id, BUFFER_LIMIT, agent_id, thread_id, cutoff);

        } catch (err) {
            console.error(`❌ Consolidation failed for thread ${thread_id}: ${err.message}`);
        }
    }

    return { threadsProcessed: threads.length, memoriesCreated };
}

// =============================================================================
// Utility — Build memory context for LLM prompt injection
// =============================================================================

/**
 * Build a complete memory context block for injection into LLM prompts.
 * Combines working memory + entity facts + semantic recall.
 * 
 * @param {string} agentId
 * @param {string} threadId
 * @param {string} entityId - sender's ID
 * @param {string} latestMessage - the most recent incoming message
 * @returns {string} formatted memory context block
 */
export async function buildMemoryContext(agentId, threadId, entityId, latestMessage) {
    if (!MEMORY_ENABLED) return '';

    const parts = [];

    // 1. Entity facts
    const facts = getEntityFacts(agentId, entityId);
    if (Object.keys(facts).length > 0) {
        const factLines = Object.entries(facts)
            .map(([k, v]) => `  - ${k}: ${v}`)
            .join('\n');
        parts.push(`📋 Known facts about this person:\n${factLines}`);
    }

    // 2. Conversation history
    const history = recall(agentId, threadId, 10);
    if (history.length > 0) {
        const historyLines = history
            .map(m => `  [${m.role}]: ${m.content.substring(0, 200)}`)
            .join('\n');
        parts.push(`💬 Recent conversation history:\n${historyLines}`);
    }

    // 3. Semantic recall (only if Supabase is configured)
    if (SUPABASE_URL && SUPABASE_KEY) {
        const semanticMemories = await recallSemantic(latestMessage, {
            agentId,
            threshold: 0.72,
            limit: 3,
        });
        if (semanticMemories.length > 0) {
            const memLines = semanticMemories
                .map(m => `  - (${(m.similarity * 100).toFixed(0)}% match) ${m.summary.substring(0, 200)}`)
                .join('\n');
            parts.push(`🧠 Related past conversations:\n${memLines}`);
        }
    }

    if (parts.length === 0) return '';

    return `\n--- MEMORY CONTEXT ---\n${parts.join('\n\n')}\n--- END MEMORY ---\n`;
}

/**
 * Check if memory is enabled.
 * @returns {boolean}
 */
export function isMemoryEnabled() {
    return MEMORY_ENABLED;
}

export default {
    remember,
    recall,
    getEntityFacts,
    storeFact,
    extractFacts,
    recallSemantic,
    consolidate,
    buildMemoryContext,
    isMemoryEnabled,
};

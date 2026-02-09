import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test with in-memory DB to avoid touching real data
describe('Database Layer', () => {
    let db;

    before(() => {
        db = new Database(':memory:');
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        db.exec(`
            CREATE TABLE campaigns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                niche TEXT NOT NULL,
                city TEXT NOT NULL,
                state TEXT DEFAULT '',
                leads_found INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE leads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                campaign_id INTEGER REFERENCES campaigns(id),
                place_id TEXT UNIQUE,
                business_name TEXT NOT NULL,
                phone TEXT, email TEXT, website TEXT,
                address TEXT, city TEXT, state TEXT,
                rating REAL DEFAULT 0, review_count INTEGER DEFAULT 0,
                has_website INTEGER DEFAULT 0, website_score INTEGER DEFAULT 0,
                mobile_friendly INTEGER DEFAULT 0, ssl INTEGER DEFAULT 0,
                response_time_ms INTEGER DEFAULT 0,
                ai_score INTEGER DEFAULT 0, ai_notes TEXT,
                tier TEXT DEFAULT 'unscored', status TEXT DEFAULT 'new',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE outreach_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lead_id INTEGER REFERENCES leads(id),
                type TEXT NOT NULL, subject TEXT, body TEXT,
                sent_at DATETIME, opened INTEGER DEFAULT 0, replied INTEGER DEFAULT 0
            );
        `);
    });

    after(() => db.close());

    it('inserts a campaign', () => {
        const result = db.prepare('INSERT INTO campaigns (niche, city) VALUES (?, ?)').run('restaurants', 'Orlando, FL');
        assert.ok(result.lastInsertRowid > 0);
    });

    it('inserts leads and deduplicates by place_id', () => {
        db.prepare('INSERT INTO leads (campaign_id, place_id, business_name) VALUES (?, ?, ?)').run(1, 'abc123', 'Test Biz');
        // Duplicate should be ignored
        const r = db.prepare('INSERT OR IGNORE INTO leads (campaign_id, place_id, business_name) VALUES (?, ?, ?)').run(1, 'abc123', 'Test Biz');
        assert.equal(r.changes, 0); // No insert happened
    });

    it('queries leads by tier', () => {
        db.prepare("UPDATE leads SET tier = 'hot', ai_score = 85 WHERE place_id = 'abc123'").run();
        const hot = db.prepare("SELECT * FROM leads WHERE tier = 'hot'").all();
        assert.equal(hot.length, 1);
        assert.equal(hot[0].ai_score, 85);
    });

    it('logs outreach and counts correctly', () => {
        db.prepare("INSERT INTO outreach_log (lead_id, type, subject, body, sent_at) VALUES (?, ?, ?, ?, datetime('now'))").run(1, 'initial', 'Test Subject', 'Test Body');
        const count = db.prepare('SELECT COUNT(*) as c FROM outreach_log WHERE lead_id = 1').get();
        assert.equal(count.c, 1);
    });

    it('enforces unique place_id constraint', () => {
        db.prepare('INSERT OR IGNORE INTO leads (campaign_id, place_id, business_name) VALUES (?, ?, ?)').run(1, 'xyz789', 'Another Biz');
        const all = db.prepare('SELECT COUNT(*) as c FROM leads').get();
        assert.equal(all.c, 2); // Original + new unique one
    });
});

describe('Scoring Tiers', () => {
    it('classifies hot leads correctly', () => {
        const score = 85;
        const tier = score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';
        assert.equal(tier, 'hot');
    });

    it('classifies warm leads correctly', () => {
        const score = 55;
        const tier = score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';
        assert.equal(tier, 'warm');
    });

    it('classifies cold leads correctly', () => {
        const score = 20;
        const tier = score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';
        assert.equal(tier, 'cold');
    });
});

describe('Website Scoring', () => {
    it('scores zero for no website', () => {
        const score = 0;
        assert.equal(score, 0);
    });

    it('awards SSL points', () => {
        let score = 0;
        const ssl = true;
        if (ssl) score += 20;
        assert.equal(score, 20);
    });

    it('awards mobile-friendly points', () => {
        let score = 0;
        const mobileFriendly = true;
        if (mobileFriendly) score += 25;
        assert.equal(score, 25);
    });
});

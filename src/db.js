import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'leads.db');

let db;

export function getDb() {
    if (!db) {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        initSchema();
    }
    return db;
}

function initSchema() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS campaigns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            niche TEXT NOT NULL,
            city TEXT NOT NULL,
            state TEXT DEFAULT '',
            leads_found INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER REFERENCES campaigns(id),
            place_id TEXT UNIQUE,
            business_name TEXT NOT NULL,
            phone TEXT,
            email TEXT,
            website TEXT,
            address TEXT,
            city TEXT,
            state TEXT,
            rating REAL DEFAULT 0,
            review_count INTEGER DEFAULT 0,
            has_website INTEGER DEFAULT 0,
            website_score INTEGER DEFAULT 0,
            mobile_friendly INTEGER DEFAULT 0,
            ssl INTEGER DEFAULT 0,
            response_time_ms INTEGER DEFAULT 0,
            ai_score INTEGER DEFAULT 0,
            ai_notes TEXT,
            tier TEXT DEFAULT 'unscored',
            status TEXT DEFAULT 'new',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS outreach_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER REFERENCES leads(id),
            type TEXT NOT NULL,
            subject TEXT,
            body TEXT,
            sent_at DATETIME,
            opened INTEGER DEFAULT 0,
            replied INTEGER DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_leads_tier ON leads(tier);
        CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
        CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_outreach_lead ON outreach_log(lead_id);
    `);
}

// === Campaign helpers ===

export function createCampaign(niche, city, state = '') {
    const stmt = getDb().prepare(
        'INSERT INTO campaigns (niche, city, state) VALUES (?, ?, ?)'
    );
    const result = stmt.run(niche, city, state);
    return result.lastInsertRowid;
}

export function updateCampaignCount(campaignId, count) {
    getDb().prepare('UPDATE campaigns SET leads_found = ? WHERE id = ?').run(count, campaignId);
}

export function getCampaigns() {
    return getDb().prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all();
}

// === Lead helpers ===

export function insertLead(lead) {
    const stmt = getDb().prepare(`
        INSERT OR IGNORE INTO leads
        (campaign_id, place_id, business_name, phone, email, website, address, city, state, rating, review_count, has_website)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
        lead.campaign_id, lead.place_id, lead.business_name, lead.phone || null,
        lead.email || null, lead.website || null, lead.address || null,
        lead.city || null, lead.state || null, lead.rating || 0,
        lead.review_count || 0, lead.website ? 1 : 0
    );
    return result.lastInsertRowid;
}

export function insertLeadsBatch(leads) {
    const insert = getDb().transaction((items) => {
        let count = 0;
        for (const lead of items) {
            const rowid = insertLead(lead);
            if (rowid) count++;
        }
        return count;
    });
    return insert(leads);
}

export function getUnscoredLeads(limit = 50) {
    return getDb().prepare(
        "SELECT * FROM leads WHERE tier = 'unscored' LIMIT ?"
    ).all(limit);
}

export function getLeadsByTier(tier, limit = 50) {
    return getDb().prepare(
        'SELECT * FROM leads WHERE tier = ? AND status = ? LIMIT ?'
    ).all(tier, 'new', limit);
}

export function updateLeadScore(id, score, notes, tier) {
    getDb().prepare(`
        UPDATE leads SET ai_score = ?, ai_notes = ?, tier = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(score, notes, tier, id);
}

export function updateLeadWebsiteAnalysis(id, data) {
    getDb().prepare(`
        UPDATE leads SET website_score = ?, mobile_friendly = ?, ssl = ?, response_time_ms = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(data.score, data.mobileFriendly ? 1 : 0, data.ssl ? 1 : 0, data.responseTime || 0, id);
}

export function updateLeadStatus(id, status) {
    getDb().prepare('UPDATE leads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
}

export function getLeadsNeedingFollowUp(daysSince) {
    return getDb().prepare(`
        SELECT l.* FROM leads l
        WHERE l.status = 'contacted'
        AND l.id NOT IN (
            SELECT lead_id FROM outreach_log
            WHERE sent_at > datetime('now', '-' || ? || ' days')
        )
        AND (SELECT COUNT(*) FROM outreach_log WHERE lead_id = l.id) < 4
    `).all(daysSince);
}

// === Outreach helpers ===

export function logOutreach(leadId, type, subject, body) {
    getDb().prepare(`
        INSERT INTO outreach_log (lead_id, type, subject, body, sent_at)
        VALUES (?, ?, ?, ?, datetime('now'))
    `).run(leadId, type, subject, body);
}

export function getOutreachCount(leadId) {
    const row = getDb().prepare('SELECT COUNT(*) as count FROM outreach_log WHERE lead_id = ?').get(leadId);
    return row.count;
}

export function getTodayOutreachCount() {
    const row = getDb().prepare(
        "SELECT COUNT(*) as count FROM outreach_log WHERE date(sent_at) = date('now')"
    ).get();
    return row.count;
}

// === Stats ===

export function getStats() {
    const d = getDb();
    return {
        totalLeads: d.prepare('SELECT COUNT(*) as c FROM leads').get().c,
        byCampaign: d.prepare('SELECT COUNT(*) as c, niche, city FROM campaigns GROUP BY niche, city').all(),
        byTier: {
            hot: d.prepare("SELECT COUNT(*) as c FROM leads WHERE tier = 'hot'").get().c,
            warm: d.prepare("SELECT COUNT(*) as c FROM leads WHERE tier = 'warm'").get().c,
            cold: d.prepare("SELECT COUNT(*) as c FROM leads WHERE tier = 'cold'").get().c,
            unscored: d.prepare("SELECT COUNT(*) as c FROM leads WHERE tier = 'unscored'").get().c,
        },
        byStatus: {
            new: d.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'new'").get().c,
            contacted: d.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'contacted'").get().c,
            replied: d.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'replied'").get().c,
            booked: d.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'booked'").get().c,
        },
        totalOutreach: d.prepare('SELECT COUNT(*) as c FROM outreach_log').get().c,
        todayOutreach: getTodayOutreachCount(),
    };
}

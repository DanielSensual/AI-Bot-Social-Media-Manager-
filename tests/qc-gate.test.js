import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewPost, formatViolations } from '../src/qc-gate.js';

// approvedNumbers passed explicitly so tests don't depend on proof-bank.json state
const NO_PROOF = { approvedNumbers: [] };

test('blocks fabricated result metrics (the July 5 tweet)', () => {
    const r = reviewPost(
        'voice agent went live monday.\n41 leads booked by sunday. 37% close rate.\nwhat is your site missing?',
        { platform: 'x', ...NO_PROOF },
    );
    assert.equal(r.pass, false);
    const rules = r.violations.map(v => v.rule);
    assert.ok(rules.includes('unverified-metric'), formatViolations(r.violations));
});

test('allows a metric backed by a verified proof-bank entry', () => {
    const r = reviewPost(
        'obsidian detailing: 47 voice calls handled by the agent this month. owner slept through all of them 👻',
        { platform: 'x', approvedNumbers: ['47 voice calls'] },
    );
    assert.equal(r.pass, true, formatViolations(r.violations));
});

test('blocks banned worn-out hooks', () => {
    const r = reviewPost('shipped a voice agent for a client in 72 hours. agencies hate this.', { platform: 'x', ...NO_PROOF });
    assert.equal(r.pass, false);
    assert.ok(r.violations.some(v => v.rule === 'banned-phrase'));
});

test('blocks protected World Cup marks', () => {
    const r = reviewPost('our world cup special: free audits during every match', { platform: 'x', ...NO_PROOF });
    assert.equal(r.pass, false);
    assert.ok(r.violations.some(v => v.rule === 'protected-mark'));
});

test('allows safe live-moment framing', () => {
    const r = reviewPost(
        'orlando is packed for the matches this summer.\nevery ring your shop misses during the game is a customer who called the next place.\nthe ai receptionist does not watch football 👻',
        { platform: 'x', ...NO_PROOF },
    );
    assert.equal(r.pass, true, formatViolations(r.violations));
});

test('blocks hashtags on any platform', () => {
    const r = reviewPost('big things coming #AI #Automation', { platform: 'linkedin', ...NO_PROOF });
    assert.equal(r.pass, false);
    assert.ok(r.violations.some(v => v.rule === 'hashtag'));
});

test('blocks emoji overuse', () => {
    const r = reviewPost('we ship fast 🚀🔥👻', { platform: 'x', ...NO_PROOF });
    assert.equal(r.pass, false);
    assert.ok(r.violations.some(v => v.rule === 'emoji-overuse'));
});

test('blocks over-length X posts', () => {
    const r = reviewPost('a'.repeat(281), { platform: 'x', ...NO_PROOF });
    assert.equal(r.pass, false);
    assert.ok(r.violations.some(v => v.rule === 'too-long'));
});

test('passes clean builder-log content with harmless numbers', () => {
    const r = reviewPost(
        'swapped the stt layer on a live agent at 2am.\nzero dropped calls, latency feels instant now.\nstaging environments are just fear in disguise.',
        { platform: 'x', ...NO_PROOF },
    );
    assert.equal(r.pass, true, formatViolations(r.violations));
});

test('money and multipliers require proof', () => {
    const r = reviewPost('this system made a client $18,000 last month. 3x roi.', { platform: 'x', ...NO_PROOF });
    assert.equal(r.pass, false);
    const metricHits = r.violations.filter(v => v.rule === 'unverified-metric');
    assert.ok(metricHits.length >= 2, formatViolations(r.violations));
});

test('AI-disclosure percent is allowed (GIA caption)', () => {
    const r = reviewPost(
        "She's not real. The missed calls are. 👻\n\nGia is 100% AI-generated — built with the same tech that answers our clients' phones 24/7, in English y en español.\n\nGhost AI Systems → ghostaisystems.com",
        { platform: 'instagram', ...NO_PROOF },
    );
    assert.equal(r.pass, true, formatViolations(r.violations));
});

test('rhetorical pricing talk is allowed (not a result claim)', () => {
    const r = reviewPost(
        'agencies charge $15k for a wordpress template and call it custom.\nyour $50k website should not lose to a $5k one. speed wins.',
        { platform: 'x', ...NO_PROOF },
    );
    assert.equal(r.pass, true, formatViolations(r.violations));
});

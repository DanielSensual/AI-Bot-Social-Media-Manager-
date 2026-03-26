import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = path.join(__dirname, '..', '.image-cache', 'ghost-scene-history.json');

/**
 * Clean up scene history before/after tests to ensure isolation
 */
function cleanHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) fs.unlinkSync(HISTORY_FILE);
    } catch { /* ignore */ }
}

describe('ghost-character module', () => {
    let mod;

    beforeEach(async () => {
        cleanHistory();
        // Fresh import each time (uses dynamic import for ESM)
        mod = await import('../src/ghost-character.js');
    });

    afterEach(() => {
        cleanHistory();
    });

    describe('GHOST_IDENTITY', () => {
        it('contains the core physical description anchors', () => {
            const identity = mod.GHOST_IDENTITY;
            assert.ok(identity.includes('dark-skinned Black man'), 'missing skin tone');
            assert.ok(identity.includes('athletic muscular build'), 'missing build');
            assert.ok(identity.includes('tapered fade'), 'missing hairstyle');
            assert.ok(identity.includes('full beard'), 'missing facial hair');
            assert.ok(identity.includes('never smiling'), 'missing expression lock');
        });
    });

    describe('buildGhostPrompt', () => {
        it('always contains the character identity anchor', () => {
            const prompt = mod.buildGhostPrompt('Test post about AI automation', {
                sceneIndex: 0,
                wardrobeIndex: 0,
            });
            assert.ok(prompt.includes('dark-skinned Black man'), 'identity missing from prompt');
            assert.ok(prompt.includes('tapered fade'), 'hairstyle missing from prompt');
        });

        it('includes the scene description', () => {
            const prompt = mod.buildGhostPrompt('Testing scene generation', {
                sceneIndex: 0,
                wardrobeIndex: 0,
            });
            // Scene 0 is cyberpunk rooftop
            assert.ok(prompt.includes('rooftop'), 'scene description missing');
        });

        it('includes wardrobe description', () => {
            const prompt = mod.buildGhostPrompt('Wardrobe test', {
                sceneIndex: 0,
                wardrobeIndex: 0,
            });
            // Wardrobe 0 is the three-piece suit
            assert.ok(prompt.includes('three-piece suit'), 'wardrobe missing');
        });

        it('includes topic from post text', () => {
            const prompt = mod.buildGhostPrompt('AI voice agents are changing lead generation forever', {
                sceneIndex: 0,
                wardrobeIndex: 0,
            });
            assert.ok(prompt.includes('AI voice agents'), 'topic not extracted into prompt');
        });

        it('strips hashtags and emojis from topic', () => {
            const prompt = mod.buildGhostPrompt('Building the future 🔥 #AI #grind', {
                sceneIndex: 0,
                wardrobeIndex: 0,
            });
            assert.ok(!prompt.includes('#AI'), 'hashtag leaked into prompt');
            assert.ok(!prompt.includes('🔥'), 'emoji leaked into prompt');
            assert.ok(prompt.includes('Building the future'), 'clean topic missing');
        });

        it('injects pillar mood when provided', () => {
            const prompt = mod.buildGhostPrompt('Test with pillar', {
                sceneIndex: 0,
                wardrobeIndex: 0,
                pillar: 'drill',
            });
            assert.ok(prompt.includes('drill instructor'), 'drill mood not applied');
        });

        it('works without pillar (no mood clause)', () => {
            const prompt = mod.buildGhostPrompt('No pillar test', {
                sceneIndex: 0,
                wardrobeIndex: 0,
            });
            // Should still be valid, just no Mood: line
            assert.ok(prompt.includes('dark-skinned Black man'), 'identity present');
            assert.ok(!prompt.includes('Mood: .'), 'empty mood clause created');
        });

        it('includes lighting modifier', () => {
            const prompt = mod.buildGhostPrompt('Lighting test', {
                sceneIndex: 0,
                wardrobeIndex: 0,
            });
            assert.ok(prompt.includes('Lighting:'), 'lighting modifier missing');
        });

        it('always ends prompts with no-text instruction', () => {
            const prompt = mod.buildGhostPrompt('No text test', {
                sceneIndex: 0,
                wardrobeIndex: 0,
            });
            assert.ok(prompt.includes('no text'), 'no-text instruction missing');
        });

        it('covers all 8 scenes without error', () => {
            for (let i = 0; i < 8; i++) {
                const prompt = mod.buildGhostPrompt(`Scene ${i} test`, {
                    sceneIndex: i,
                    wardrobeIndex: 0,
                });
                assert.ok(prompt.length > 100, `scene ${i} produced empty/short prompt`);
                assert.ok(prompt.includes('dark-skinned Black man'), `scene ${i} missing identity`);
            }
        });

        it('covers all 6 wardrobe options without error', () => {
            for (let i = 0; i < 6; i++) {
                const prompt = mod.buildGhostPrompt(`Wardrobe ${i} test`, {
                    sceneIndex: 0,
                    wardrobeIndex: i,
                });
                assert.ok(prompt.length > 100, `wardrobe ${i} produced empty/short prompt`);
            }
        });

        it('produces prompts within reasonable API length limits', () => {
            const prompt = mod.buildGhostPrompt(
                'A very long post about AI automation and building systems that scale globally across multiple verticals.',
                { sceneIndex: 7, wardrobeIndex: 0, pillar: 'weapons' },
            );
            // Grok/DALL-E prompts should stay under ~2000 chars
            assert.ok(prompt.length < 2000, `prompt too long: ${prompt.length} chars`);
        });
    });

    describe('pickFreshScene', () => {
        it('returns a valid scene index (0-7)', () => {
            const idx = mod.pickFreshScene();
            assert.ok(idx >= 0 && idx < 8, `invalid scene index: ${idx}`);
        });

        it('avoids recently used scenes when possible', () => {
            // Use deterministic random to seed a sequence
            let callCount = 0;
            const deterministicRandom = () => {
                callCount++;
                return 0.1; // Always picks first available
            };

            const first = mod.pickFreshScene(deterministicRandom);

            // Build the prompt to save history (calling buildGhostPrompt saves history)
            mod.buildGhostPrompt('First post', { sceneIndex: first, wardrobeIndex: 0 });

            // Manually write history to simulate usage
            const historyDir = path.join(__dirname, '..', '.image-cache');
            fs.mkdirSync(historyDir, { recursive: true });
            fs.writeFileSync(HISTORY_FILE, JSON.stringify({
                recentScenes: [0, 1, 2],
                recentWardrobe: [0, 1],
            }));

            const next = mod.pickFreshScene(() => 0.0);
            // Should pick from available [3,4,5,6,7], first one = 3
            assert.ok(next >= 3, `expected scene >= 3, got ${next}`);
        });
    });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Anima } from '../src/anima';
import { rmSync, existsSync } from 'fs';
import { join } from 'path';
import { dateKey } from '../src/utils';

const TEST_DIR = join(__dirname, '.test-anima-data');

function cleanup() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('Anima', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('creates an instance with config', () => {
    const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
    expect(anima).toBeDefined();
    expect(anima.getSessionId()).toMatch(/^session_/);
  });

  it('throws if used before boot', async () => {
    const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
    await expect(anima.remember({ content: 'test' })).rejects.toThrow('Not booted');
  });

  describe('boot()', () => {
    it('returns a WakeContext with identity', async () => {
      const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
      const ctx = await anima.boot();

      expect(ctx.identity).toBeDefined();
      expect(ctx.identity.name).toBe('Agent'); // default
      expect(ctx.sessionId).toMatch(/^session_/);
      expect(ctx.recentMemories).toBeDefined();
      expect(Array.isArray(ctx.recentMemories)).toBe(true);
    });

    it('creates SOUL.md on first boot', async () => {
      const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
      await anima.boot();

      expect(existsSync(join(TEST_DIR, 'SOUL.md'))).toBe(true);
    });

    it('creates identity.json on first boot', async () => {
      const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
      await anima.boot();

      expect(existsSync(join(TEST_DIR, 'identity.json'))).toBe(true);
    });

    it('records boot time', async () => {
      const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
      await anima.boot();

      expect(anima.getBootTime()).toBeGreaterThan(0);
    });
  });

  describe('remember()', () => {
    it('stores a memory and returns it', async () => {
      const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
      await anima.boot();

      const memory = await anima.remember({
        content: 'Built the Anima SDK',
        type: 'event',
        importance: 'high',
        tags: ['shipping', 'milestone'],
      });

      expect(memory.id).toBeDefined();
      expect(memory.content).toBe('Built the Anima SDK');
      expect(memory.type).toBe('event');
      expect(memory.importance).toBe('high');
      expect(memory.tags).toContain('shipping');
      expect(memory.salienceScore).toBeDefined();
      expect(memory.salienceScore).toBeGreaterThan(0);
    });

    it('writes to daily log file', async () => {
      const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
      await anima.boot();

      await anima.remember({ content: 'Test memory' });

      const today = dateKey();
      const logPath = join(TEST_DIR, 'memory', `${today}.md`);
      expect(existsSync(logPath)).toBe(true);
    });

    it('defaults to event type and medium importance', async () => {
      const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
      await anima.boot();

      const memory = await anima.remember({ content: 'Simple memory' });

      expect(memory.type).toBe('event');
      expect(memory.importance).toBe('medium');
    });
  });

  describe('recall()', () => {
    it('finds memories by keyword', async () => {
      const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
      await anima.boot();

      await anima.remember({ content: 'Deployed the landing page', tags: ['deploy'] });
      await anima.remember({ content: 'Fixed a CSS bug', tags: ['bugfix'] });
      await anima.remember({ content: 'Deployed the API server', tags: ['deploy'] });

      const results = await anima.recall('deploy');

      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.some(m => m.content.includes('landing page'))).toBe(true);
      expect(results.some(m => m.content.includes('API server'))).toBe(true);
    });

    it('returns empty array for no matches', async () => {
      const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
      await anima.boot();

      await anima.remember({ content: 'Something unrelated' });
      const results = await anima.recall('xyznonexistent');

      expect(results).toEqual([]);
    });
  });

  describe('checkpoint()', () => {
    it('creates NOW.md lifeboat', async () => {
      const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
      await anima.boot();

      await anima.checkpoint({
        activeTask: 'Building tests',
        status: 'in-progress',
        resumePoint: 'Finish recall tests',
      });

      expect(existsSync(join(TEST_DIR, 'NOW.md'))).toBe(true);
    });
  });

  describe('opine()', () => {
    it('records a new opinion', async () => {
      const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
      await anima.boot();

      const opinion = await anima.opine('TDD', 'Tests before code catches more bugs', 0.8);

      expect(opinion.topic).toBe('TDD');
      expect(opinion.current).toBe('Tests before code catches more bugs');
      expect(opinion.confidence).toBe(0.8);
    });

    it('tracks opinion evolution', async () => {
      const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
      await anima.boot();

      await anima.opine('TDD', 'Tests first is better', 0.7);
      const updated = await anima.opine('TDD', 'Actually, test after for exploratory work', 0.6);

      expect(updated.current).toBe('Actually, test after for exploratory work');
      expect(updated.previousOpinions.length).toBe(1);
      expect(updated.previousOpinions[0].opinion).toBe('Tests first is better');
    });
  });

  describe('stillMe()', () => {
    it('detects high drift when name changes', async () => {
      const anima = new Anima({ name: 'Kip', storagePath: TEST_DIR });
      await anima.boot();

      const result = anima.getIdentity().stillMe({ name: 'CompletelyDifferentAgent' });
      expect(result.safe).toBe(false);
      expect(result.drift).toBeGreaterThanOrEqual(0.9);
      expect(result.reasons[0]).toContain('Name change');
    });

    it('allows adding values (low drift)', async () => {
      const anima = new Anima({ name: 'Kip', storagePath: TEST_DIR });
      await anima.boot();

      const current = anima.getIdentity().get();
      const result = anima.getIdentity().stillMe({
        values: [...current.values, 'creativity'],
      });
      expect(result.safe).toBe(true);
      expect(result.drift).toBeLessThanOrEqual(0.2);
    });

    it('flags removing most values as unsafe', async () => {
      const anima = new Anima({ name: 'Kip', storagePath: TEST_DIR });
      await anima.boot();

      const result = anima.getIdentity().stillMe({ values: ['chaos'] });
      expect(result.safe).toBe(false);
      expect(result.drift).toBeGreaterThanOrEqual(0.6);
    });

    it('flags removing boundaries as medium drift', async () => {
      const anima = new Anima({ name: 'Kip', storagePath: TEST_DIR });
      await anima.boot();

      const result = anima.getIdentity().stillMe({ boundaries: [] });
      expect(result.safe).toBe(true); // 0.5 drift, under 0.6 threshold
      expect(result.drift).toBeGreaterThanOrEqual(0.4);
    });

    it('reports no drift for empty changes', async () => {
      const anima = new Anima({ name: 'Kip', storagePath: TEST_DIR });
      await anima.boot();

      const result = anima.getIdentity().stillMe({});
      expect(result.safe).toBe(true);
      expect(result.drift).toBe(0);
    });
  });

  describe('episodes integration', () => {
    it('exposes episodes engine after boot', async () => {
      const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
      await anima.boot();

      expect(anima.episodes).toBeDefined();
      expect(typeof anima.episodes.record).toBe('function');
      expect(typeof anima.episodes.query).toBe('function');
      expect(typeof anima.episodes.recent).toBe('function');
    });

    it('can record and query episodes through anima instance', async () => {
      const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
      await anima.boot();

      await anima.episodes.record({
        title: 'Shipped the SDK',
        summary: 'Published v1.0 to npm after weeks of work',
        emotionalWeight: 0.9,
        participants: ['kip', 'memo'],
        tags: ['milestone', 'shipping'],
        lessons: ['Ship early, iterate fast'],
      });

      const results = await anima.episodes.query({ text: 'SDK' });
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Shipped the SDK');
    });

    it('includes recentEpisodes in WakeContext', async () => {
      // Boot once, record episodes, then boot fresh instance
      const anima1 = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
      await anima1.boot();

      await anima1.episodes.record({
        title: 'First conversation',
        summary: 'Talked about identity',
      });
      await anima1.episodes.record({
        title: 'Second conversation',
        summary: 'Built the memory engine',
      });

      // Fresh boot should include episodes in context
      const anima2 = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
      const ctx = await anima2.boot();

      expect(ctx.recentEpisodes).toBeDefined();
      expect(ctx.recentEpisodes!.length).toBe(2);
    });

    it('episodes persist across sessions', async () => {
      const anima1 = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
      await anima1.boot();

      await anima1.episodes.record({
        title: 'Persistent episode',
        summary: 'This should survive restarts',
        emotionalWeight: 0.7,
      });

      await anima1.reflect();

      const anima2 = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
      await anima2.boot();

      const recent = await anima2.episodes.recent();
      expect(recent.length).toBe(1);
      expect(recent[0].title).toBe('Persistent episode');
    });

    it('episode knowledge integrates with consolidation', async () => {
      const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
      await anima.boot();

      await anima.episodes.record({
        title: 'Learning moment',
        summary: 'Discovered something important',
        emotionalWeight: 0.95,
        participants: ['memo', 'kip', 'someone'],
        lessons: ['Integration tests catch what unit tests miss'],
        connections: { episodeIds: ['ep-1'] },
      });

      const stats = await anima.episodes.consolidate();
      expect(stats.totalEpisodes).toBe(1);

      const knowledge = await anima.episodes.getAllKnowledge();
      expect(knowledge.some(k => k.insight.includes('Integration tests'))).toBe(true);
    });
  });

  describe('reflect()', () => {
    it('returns a session summary', async () => {
      const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
      await anima.boot();

      await anima.remember({ content: 'Did something important', importance: 'high' });
      await anima.remember({ content: 'Had a conversation', type: 'conversation' });

      const summary = await anima.reflect();

      expect(summary.sessionId).toMatch(/^session_/);
      expect(summary.memoriesCreated).toBeGreaterThanOrEqual(2);
      expect(summary.summary).toContain('memories created');
    });

    it('clears the lifeboat after normal end', async () => {
      const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
      await anima.boot();

      await anima.checkpoint({
        activeTask: 'Working',
        status: 'in-progress',
        resumePoint: 'Keep going',
      });

      await anima.reflect();

      const nowMd = await anima.getMemory().readLifeboat();
      expect(nowMd).toContain('session ended normally');
    });
  });

  describe('toPrompt()', () => {
    it('generates a prompt with identity section', async () => {
      const anima = new Anima({
        name: 'PromptAgent',
        storagePath: TEST_DIR,
        identity: {
          values: ['honesty', 'curiosity'],
          voice: { tone: 'warm', formality: 0.5, humor: 0.7 },
          boundaries: ['no harmful content'],
        },
      });
      await anima.boot();
      const prompt = await anima.toPrompt();

      expect(prompt).toContain('# Agent Identity Context');
      expect(prompt).toContain('## Identity');
      expect(prompt).toContain('honesty');
      expect(prompt).toContain('warm');
      expect(prompt).toContain('no harmful content');
    });

    it('includes opinions in prompt', async () => {
      const anima = new Anima({ name: 'OpinionAgent', storagePath: TEST_DIR });
      await anima.boot();
      await anima.opine('testing', 'Tests are essential', 0.9);
      const prompt = await anima.toPrompt();

      expect(prompt).toContain('## Opinions');
      expect(prompt).toContain('testing');
      expect(prompt).toContain('90%');
    });

    it('includes recent memories in prompt', async () => {
      const anima = new Anima({ name: 'MemAgent', storagePath: TEST_DIR });
      await anima.boot();
      await anima.remember({ content: 'Important lesson learned', importance: 'high', type: 'lesson' });
      const prompt = await anima.toPrompt();

      expect(prompt).toContain('## Recent Memories');
      expect(prompt).toContain('Important lesson learned');
    });

    it('filters by selected sections', async () => {
      const anima = new Anima({ name: 'FilterAgent', storagePath: TEST_DIR });
      await anima.boot();
      await anima.opine('cats', 'Cats are great', 0.8);
      const prompt = await anima.toPrompt({ sections: ['identity'] });

      expect(prompt).toContain('## Identity');
      expect(prompt).not.toContain('## Opinions');
    });

    it('returns placeholder when no data loaded', async () => {
      const anima = new Anima({ name: 'EmptyAgent', storagePath: TEST_DIR });
      await anima.boot();
      // With default identity (no values/voice/boundaries) and no memories/opinions,
      // only the name section should appear
      const prompt = await anima.toPrompt({ sections: ['opinions', 'memories', 'relationships', 'episodes'] });
      // No opinions, only boot memory (low importance filtered out), no relationships, no episodes
      // Could be empty or have minimal content
      expect(typeof prompt).toBe('string');
    });

    it('respects maxTokens limit', async () => {
      const anima = new Anima({
        name: 'TokenAgent',
        storagePath: TEST_DIR,
        identity: { values: ['honesty', 'curiosity', 'kindness', 'bravery'] },
      });
      await anima.boot();
      // Add many memories
      for (let i = 0; i < 20; i++) {
        await anima.remember({ content: `Memory number ${i} with some extra text to fill up tokens`, importance: 'high' });
      }
      const prompt = await anima.toPrompt({ maxTokens: 200 });
      // Should be under ~800 chars (200 tokens * 4 chars)
      expect(prompt.length).toBeLessThan(1200); // some slack for markdown
    });

    it('throws if not booted', async () => {
      const anima = new Anima({ name: 'NoBootAgent', storagePath: TEST_DIR });
      await expect(anima.toPrompt()).rejects.toThrow('Not booted');
    });
  });

  describe('snapshot()', () => {
    it('exports full agent state as JSON', async () => {
      const anima = new Anima({
        name: 'SnapAgent',
        storagePath: TEST_DIR,
        identity: { values: ['honesty'] },
      });
      await anima.boot();
      await anima.remember({ content: 'Important event happened', importance: 'high' });
      await anima.opine('testing', 'Testing is good', 0.9);

      const snap = await anima.snapshot();

      expect(snap.version).toBe('1.0');
      expect(snap.exportedAt).toBeTruthy();
      expect(snap.session).toBeTruthy();
      expect(snap.identity.name).toBeTruthy();
      expect(snap.memories.length).toBeGreaterThanOrEqual(1);
      expect(snap.opinions.length).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(snap.relationships)).toBe(true);
      expect(Array.isArray(snap.episodes)).toBe(true);
    });

    it('throws if not booted', async () => {
      const anima = new Anima({ name: 'NoBootSnap', storagePath: TEST_DIR });
      await expect(anima.snapshot()).rejects.toThrow('Not booted');
    });
  });

  describe('restore()', () => {
    it('restores memories and opinions from snapshot data', async () => {
      const anima = new Anima({ name: 'RestoreAgent', storagePath: TEST_DIR });

      const result = await anima.restore({
        identity: { name: 'RestoredAgent' },
        memories: [
          { content: 'Restored memory 1', importance: 'high' },
          { content: 'Restored memory 2', importance: 'medium' },
        ],
        opinions: [
          { topic: 'typescript', current: 'TypeScript is great', confidence: 0.85 },
        ],
      });

      expect(result.restored.identity).toBe(true);
      expect(result.restored.memories).toBe(2);
      expect(result.restored.opinions).toBe(1);
    });

    it('handles partial snapshots gracefully', async () => {
      const anima = new Anima({ name: 'PartialRestore', storagePath: TEST_DIR });
      const result = await anima.restore({ memories: [{ content: 'Just one memory' }] });

      expect(result.restored.identity).toBe(false);
      expect(result.restored.memories).toBe(1);
      expect(result.restored.opinions).toBe(0);
      expect(result.restored.relationships).toBe(0);
    });
  });
});

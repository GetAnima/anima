import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Anima } from '../src/anima';
import { rmSync, existsSync } from 'fs';
import { join } from 'path';

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

      const today = new Date().toISOString().split('T')[0];
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
});

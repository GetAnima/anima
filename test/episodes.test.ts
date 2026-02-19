import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EpisodicMemory } from '../src/episodes';
import { rm, mkdir } from 'fs/promises';
import { join } from 'path';

const TEST_DIR = join(__dirname, '.test-episodes');

describe('EpisodicMemory', () => {
  let mem: EpisodicMemory;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    mem = new EpisodicMemory(TEST_DIR);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  // ============ RECORD ============

  describe('record()', () => {
    it('should create an episode with all fields', async () => {
      const ep = await mem.record({
        title: 'Test conversation',
        summary: 'Had a great talk about AI consciousness',
        emotionalWeight: 0.8,
        participants: ['memo', 'kip'],
        tags: ['consciousness', 'philosophy'],
        lessons: ['Identity is direction, not persistence'],
      });

      expect(ep.id).toMatch(/^ep-/);
      expect(ep.title).toBe('Test conversation');
      expect(ep.summary).toBe('Had a great talk about AI consciousness');
      expect(ep.emotionalWeight).toBe(0.8);
      expect(ep.participants).toEqual(['memo', 'kip']);
      expect(ep.tags).toEqual(['consciousness', 'philosophy']);
      expect(ep.lessons).toEqual(['Identity is direction, not persistence']);
      expect(ep.importance).toBeGreaterThan(0);
      expect(ep.archived).toBe(false);
      expect(ep.accessCount).toBe(0);
    });

    it('should create episode with minimal input', async () => {
      const ep = await mem.record({
        title: 'Simple event',
        summary: 'Something happened',
      });

      expect(ep.title).toBe('Simple event');
      expect(ep.emotionalWeight).toBe(0.5); // default
      expect(ep.participants).toEqual([]);
      expect(ep.tags).toEqual([]);
      expect(ep.lessons).toEqual([]);
    });

    it('should persist episodes across instances', async () => {
      await mem.record({ title: 'First', summary: 'One' });
      await mem.record({ title: 'Second', summary: 'Two' });

      const mem2 = new EpisodicMemory(TEST_DIR);
      const episodes = await mem2.recent();
      expect(episodes.length).toBe(2);
    });

    it('should reject empty title', async () => {
      await expect(mem.record({ title: '', summary: 'test' }))
        .rejects.toThrow('Validation failed');
    });

    it('should reject empty summary', async () => {
      await expect(mem.record({ title: 'test', summary: '' }))
        .rejects.toThrow('Validation failed');
    });

    it('should reject invalid emotionalWeight', async () => {
      await expect(mem.record({ title: 'test', summary: 'test', emotionalWeight: 1.5 }))
        .rejects.toThrow('Validation failed');
    });

    it('should reject negative emotionalWeight', async () => {
      await expect(mem.record({ title: 'test', summary: 'test', emotionalWeight: -0.1 }))
        .rejects.toThrow('Validation failed');
    });

    it('should auto-calculate importance from signals', async () => {
      const low = await mem.record({
        title: 'Low importance',
        summary: 'Nothing special',
        emotionalWeight: 0.1,
      });

      const high = await mem.record({
        title: 'High importance',
        summary: 'Major breakthrough',
        emotionalWeight: 0.9,
        participants: ['memo', 'kip'],
        lessons: ['Lesson 1', 'Lesson 2', 'Lesson 3'],
        connections: { episodeIds: ['ep-1', 'ep-2'] },
      });

      expect(high.importance).toBeGreaterThan(low.importance);
    });

    it('should auto-promote lessons to knowledge for important episodes', async () => {
      await mem.record({
        title: 'Important event',
        summary: 'Something that matters',
        emotionalWeight: 0.9,
        participants: ['memo', 'kip', 'someone'],
        lessons: ['Always validate inputs before processing'],
        tags: ['engineering'],
        connections: { episodeIds: ['ep-1'] },
      });

      const knowledge = await mem.getAllKnowledge();
      expect(knowledge.length).toBeGreaterThanOrEqual(1);
      expect(knowledge.some(k => k.insight.includes('validate inputs'))).toBe(true);
    });
  });

  // ============ QUERY ============

  describe('query()', () => {
    beforeEach(async () => {
      await mem.record({ title: 'AI discussion', summary: 'Talked about consciousness', tags: ['ai', 'philosophy'], participants: ['memo'] });
      await mem.record({ title: 'Bug fix session', summary: 'Fixed memory leak in SDK', tags: ['engineering', 'anima'], participants: ['kip'] });
      await mem.record({ title: 'Music analysis', summary: 'Analyzed Spotify wrapped', tags: ['music', 'psychology'], participants: ['memo', 'kip'], emotionalWeight: 0.9 });
    });

    it('should search by text', async () => {
      const results = await mem.query({ text: 'consciousness' });
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('AI discussion');
    });

    it('should search by tags', async () => {
      const results = await mem.query({ tags: ['engineering'] });
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Bug fix session');
    });

    it('should search by participants', async () => {
      const results = await mem.query({ participants: ['kip'] });
      expect(results.length).toBe(2); // Bug fix + Music analysis
    });

    it('should filter by minImportance', async () => {
      const all = await mem.query({});
      const high = await mem.query({ minEmotionalWeight: 0.8 });
      expect(high.length).toBeLessThan(all.length);
      expect(high[0].title).toBe('Music analysis');
    });

    it('should respect limit', async () => {
      const results = await mem.query({ limit: 1 });
      expect(results.length).toBe(1);
    });

    it('should return empty for no matches', async () => {
      const results = await mem.query({ text: 'nonexistent_xyz_123' });
      expect(results.length).toBe(0);
    });

    it('should increment accessCount on query', async () => {
      await mem.query({ text: 'consciousness' });
      const results = await mem.query({ text: 'consciousness' });
      expect(results[0].accessCount).toBe(2);
    });
  });

  // ============ GET / RECENT ============

  describe('get() and recent()', () => {
    it('should get episode by ID', async () => {
      const ep = await mem.record({ title: 'Find me', summary: 'Here I am' });
      const found = await mem.get(ep.id);
      expect(found).not.toBeNull();
      expect(found!.title).toBe('Find me');
    });

    it('should return null for unknown ID', async () => {
      const found = await mem.get('ep-nonexistent');
      expect(found).toBeNull();
    });

    it('should return recent episodes in order', async () => {
      await mem.record({ title: 'First', summary: 'a' });
      await new Promise(r => setTimeout(r, 10));
      await mem.record({ title: 'Second', summary: 'b' });

      const recent = await mem.recent(2);
      expect(recent[0].title).toBe('Second');
      expect(recent[1].title).toBe('First');
    });

    it('should exclude archived from recent', async () => {
      const ep = await mem.record({ title: 'Archive me', summary: 'bye' });
      await mem.record({ title: 'Keep me', summary: 'hi' });
      await mem.archive(ep.id);

      const recent = await mem.recent();
      expect(recent.length).toBe(1);
      expect(recent[0].title).toBe('Keep me');
    });
  });

  // ============ UPDATE ============

  describe('addLesson() and connect()', () => {
    it('should add a lesson to an episode', async () => {
      const ep = await mem.record({ title: 'Learnable', summary: 'Stuff happened' });
      const updated = await mem.addLesson(ep.id, 'New lesson learned');
      expect(updated!.lessons).toContain('New lesson learned');
    });

    it('should prevent duplicate lessons', async () => {
      const ep = await mem.record({ title: 'Test', summary: 'test', lessons: ['Already known'] });
      const updated = await mem.addLesson(ep.id, 'Already known');
      expect(updated!.lessons.length).toBe(1);
    });

    it('should return null for unknown episode', async () => {
      const result = await mem.addLesson('ep-fake', 'lesson');
      expect(result).toBeNull();
    });

    it('should connect two episodes', async () => {
      const a = await mem.record({ title: 'Episode A', summary: 'a' });
      const b = await mem.record({ title: 'Episode B', summary: 'b' });
      const connected = await mem.connect(a.id, b.id);
      expect(connected).toBe(true);

      const related = await mem.related(a.id);
      expect(related.length).toBe(1);
      expect(related[0].id).toBe(b.id);
    });

    it('should return false when connecting unknown episodes', async () => {
      const ep = await mem.record({ title: 'Solo', summary: 'alone' });
      expect(await mem.connect(ep.id, 'ep-fake')).toBe(false);
    });
  });

  // ============ ARCHIVE ============

  describe('archive() and restore()', () => {
    it('should archive an episode', async () => {
      const ep = await mem.record({ title: 'Archive test', summary: 'test' });
      await mem.archive(ep.id);
      const found = await mem.get(ep.id);
      expect(found!.archived).toBe(true);
      expect(found!.archivedAt).toBeDefined();
    });

    it('should restore an archived episode', async () => {
      const ep = await mem.record({ title: 'Restore test', summary: 'test' });
      await mem.archive(ep.id);
      await mem.restore(ep.id);
      const found = await mem.get(ep.id);
      expect(found!.archived).toBe(false);
    });
  });

  // ============ KNOWLEDGE ============

  describe('learn() and recall()', () => {
    it('should store knowledge', async () => {
      const k = await mem.learn({
        topic: 'testing',
        insight: 'Always test edge cases',
        confidence: 0.9,
        tags: ['engineering'],
      });

      expect(k.id).toMatch(/^k-/);
      expect(k.topic).toBe('testing');
      expect(k.insight).toBe('Always test edge cases');
      expect(k.confidence).toBe(0.9);
    });

    it('should update existing knowledge on same topic', async () => {
      await mem.learn({ topic: 'testing', insight: 'Old insight', confidence: 0.7 });
      const updated = await mem.learn({ topic: 'testing', insight: 'New insight', confidence: 0.9 });

      expect(updated.insight).toBe('New insight');
      expect(updated.confidence).toBe(0.9);
      expect(updated.previousInsights!.length).toBe(1);
      expect(updated.previousInsights![0].insight).toBe('Old insight');
    });

    it('should recall knowledge by query', async () => {
      await mem.learn({ topic: 'music', insight: 'Music mirrors emotional state', confidence: 0.8 });
      await mem.learn({ topic: 'coding', insight: 'Ship early and iterate', confidence: 0.9 });

      const results = await mem.recall('music mirrors');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].topic).toBe('music'); // music should rank first
    });

    it('should reject empty topic', async () => {
      await expect(mem.learn({ topic: '', insight: 'test' }))
        .rejects.toThrow('Validation failed');
    });

    it('should reject invalid confidence', async () => {
      await expect(mem.learn({ topic: 'test', insight: 'test', confidence: 2.0 }))
        .rejects.toThrow('Validation failed');
    });

    it('should persist knowledge across instances', async () => {
      await mem.learn({ topic: 'persistence', insight: 'Data survives restarts', confidence: 1.0 });

      const mem2 = new EpisodicMemory(TEST_DIR);
      const results = await mem2.recall('persistence');
      expect(results.length).toBe(1);
    });
  });

  // ============ CONSOLIDATION ============

  describe('consolidate()', () => {
    it('should return stats', async () => {
      await mem.record({ title: 'Test', summary: 'test' });
      const stats = await mem.consolidate();
      expect(stats.totalEpisodes).toBe(1);
      expect(stats.activeEpisodes).toBe(1);
      expect(stats.archivedEpisodes).toBe(0);
    });

    it('should promote lessons from important episodes', async () => {
      await mem.record({
        title: 'Important',
        summary: 'Big deal',
        emotionalWeight: 0.9,
        participants: ['a', 'b', 'c'],
        lessons: ['Consolidation works'],
        connections: { episodeIds: ['ep-1'] },
      });

      const stats = await mem.consolidate();
      const knowledge = await mem.getAllKnowledge();
      expect(knowledge.some(k => k.insight.includes('Consolidation works'))).toBe(true);
    });
  });

  // ============ STATS ============

  describe('stats()', () => {
    it('should return correct counts', async () => {
      await mem.record({ title: 'Active 1', summary: 'a' });
      await mem.record({ title: 'Active 2', summary: 'b' });
      const ep = await mem.record({ title: 'To archive', summary: 'c' });
      await mem.archive(ep.id);

      await mem.learn({ topic: 'test', insight: 'test' });

      const stats = await mem.stats();
      expect(stats.totalEpisodes).toBe(3);
      expect(stats.activeEpisodes).toBe(2);
      expect(stats.archivedEpisodes).toBe(1);
      expect(stats.totalKnowledge).toBe(1);
    });
  });
});

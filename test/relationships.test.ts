import { describe, it, expect, beforeEach } from 'vitest';
import { RelationshipEngine } from '../src/relationships';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('RelationshipEngine', () => {
  let engine: RelationshipEngine;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'anima-rel-'));
    engine = new RelationshipEngine(tempDir);
    await engine.load();
  });

  it('starts empty', () => {
    expect(engine.getAll()).toEqual([]);
  });

  it('meet() creates a new relationship', async () => {
    const rel = await engine.meet({ name: 'Memo', type: 'human', context: 'My human partner' });
    expect(rel.name).toBe('Memo');
    expect(rel.type).toBe('human');
    expect(rel.interactionCount).toBe(1);
    expect(engine.getAll()).toHaveLength(1);
  });

  it('meet() updates existing relationship by name', async () => {
    await engine.meet({ name: 'Memo', context: 'first meeting' });
    const updated = await engine.meet({ name: 'Memo', context: 'second meeting', notes: ['talked about Anima'] });
    expect(updated.interactionCount).toBe(2);
    expect(updated.context).toBe('second meeting');
    expect(updated.notes).toContain('talked about Anima');
    expect(engine.getAll()).toHaveLength(1);
  });

  it('find() is case-insensitive', async () => {
    await engine.meet({ name: 'SecretCorridor', type: 'human' });
    expect(engine.find('secretcorridor')).toBeDefined();
    expect(engine.find('SECRETCORRIDOR')).toBeDefined();
  });

  it('interact() bumps count and timestamp', async () => {
    await engine.meet({ name: 'Sigil', type: 'agent' });
    const result = await engine.interact('Sigil', 'Discussed Conway integration');
    expect(result).not.toBeNull();
    expect(result!.interactionCount).toBe(2);
    expect(result!.notes).toContain('Discussed Conway integration');
  });

  it('interact() returns null for unknown name', async () => {
    const result = await engine.interact('Nobody');
    expect(result).toBeNull();
  });

  it('forget() removes a relationship', async () => {
    await engine.meet({ name: 'Troll' });
    expect(await engine.forget('Troll')).toBe(true);
    expect(engine.getAll()).toHaveLength(0);
  });

  it('forget() returns false for unknown name', async () => {
    expect(await engine.forget('Nobody')).toBe(false);
  });

  it('persists to disk', async () => {
    await engine.meet({ name: 'Memo', type: 'human' });
    // Load fresh engine from same path
    const engine2 = new RelationshipEngine(tempDir);
    const loaded = await engine2.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Memo');
  });

  it('recent() sorts by last interaction', async () => {
    await engine.meet({ name: 'Alice' });
    await engine.meet({ name: 'Bob' });
    await engine.interact('Alice');
    const recent = engine.recent();
    expect(recent[0].name).toBe('Alice');
  });

  it('closest() sorts by interaction count', async () => {
    await engine.meet({ name: 'Alice' });
    await engine.meet({ name: 'Bob' });
    await engine.interact('Bob');
    await engine.interact('Bob');
    const closest = engine.closest();
    expect(closest[0].name).toBe('Bob');
  });

  it('addNote() appends to existing relationship', async () => {
    await engine.meet({ name: 'Memo' });
    expect(await engine.addNote('Memo', 'likes Ali G')).toBe(true);
    expect(engine.find('Memo')!.notes).toContain('likes Ali G');
  });

  it('meet() merges preferences without duplicates', async () => {
    await engine.meet({ name: 'Memo', preferences: ['rap', 'indie'] });
    await engine.meet({ name: 'Memo', preferences: ['indie', 'rock'] });
    expect(engine.find('Memo')!.preferences).toEqual(['rap', 'indie', 'rock']);
  });
});

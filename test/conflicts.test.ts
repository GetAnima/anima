import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Anima } from '../src/anima';
import { rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(__dirname, '.test-conflicts-data');

function cleanup() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('Conflict Detection', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('returns empty when no opinions have history', async () => {
    const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
    await anima.boot();

    // Add an opinion with no prior history
    await anima.opine('dogs', 'Dogs are great', 0.8);

    const conflicts = await anima.detectConflicts();
    expect(conflicts).toEqual([]);
  });

  it('detects conflict when opinion changes', async () => {
    const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
    await anima.boot();

    // Set initial opinion
    await anima.opine('cats', 'Cats are independent', 0.7);
    // Change opinion — creates previousOpinions entry
    await anima.opine('cats', 'Cats are actually very social', 0.9);

    const conflicts = await anima.detectConflicts();
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].topic).toBe('cats');
    expect(conflicts[0].positionA.content).toBe('Cats are independent');
    expect(conflicts[0].positionB.content).toBe('Cats are actually very social');
    expect(conflicts[0].resolved).toBe(false);
  });

  it('assigns unique IDs to conflicts', async () => {
    const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
    await anima.boot();

    await anima.opine('topic1', 'A', 0.5);
    await anima.opine('topic1', 'B', 0.6);
    await anima.opine('topic2', 'X', 0.5);
    await anima.opine('topic2', 'Y', 0.6);

    const conflicts = await anima.detectConflicts();
    expect(conflicts.length).toBe(2);
    expect(conflicts[0].id).not.toBe(conflicts[1].id);
  });

  it('persists conflicts to conflicts.json', async () => {
    const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
    await anima.boot();

    await anima.opine('weather', 'Rain is bad', 0.5);
    await anima.opine('weather', 'Rain is actually nice', 0.7);

    await anima.detectConflicts();

    const conflictsPath = join(TEST_DIR, 'conflicts.json');
    expect(existsSync(conflictsPath)).toBe(true);

    const persisted = JSON.parse(readFileSync(conflictsPath, 'utf-8'));
    expect(persisted.length).toBeGreaterThan(0);
    expect(persisted[0].topic).toBe('weather');
  });

  it('resolves a conflict', async () => {
    const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
    await anima.boot();

    await anima.opine('food', 'Pizza is best', 0.8);
    await anima.opine('food', 'Sushi is best', 0.9);

    const conflicts = await anima.detectConflicts();
    expect(conflicts.length).toBe(1);

    const resolved = await anima.resolveConflict(
      conflicts[0].id,
      'Both are great but sushi feels more intentional'
    );
    expect(resolved).toBe(true);

    // Unresolved should now be empty
    const remaining = await anima.getConflicts();
    expect(remaining.length).toBe(0);

    // Including resolved should return it
    const all = await anima.getConflicts(true);
    expect(all.length).toBe(1);
    expect(all[0].resolved).toBe(true);
    expect(all[0].resolution).toBe('Both are great but sushi feels more intentional');
    expect(all[0].resolvedAt).toBeDefined();
  });

  it('returns false when resolving nonexistent conflict', async () => {
    const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
    await anima.boot();

    const result = await anima.resolveConflict('fake-id', 'whatever');
    expect(result).toBe(false);
  });

  it('does not re-detect already resolved conflicts', async () => {
    const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
    await anima.boot();

    await anima.opine('topic', 'Position A', 0.5);
    await anima.opine('topic', 'Position B', 0.8);

    const first = await anima.detectConflicts();
    expect(first.length).toBe(1);

    await anima.resolveConflict(first[0].id, 'Resolved it');

    // Detect again — should find nothing since it's resolved
    const second = await anima.detectConflicts();
    expect(second.length).toBe(0);
  });

  it('getConflicts returns empty when no conflicts file exists', async () => {
    const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
    await anima.boot();

    const conflicts = await anima.getConflicts();
    expect(conflicts).toEqual([]);
  });

  it('preserves conflict IDs across detect calls', async () => {
    const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
    await anima.boot();

    await anima.opine('stability', 'Things change', 0.5);
    await anima.opine('stability', 'Things stay the same', 0.7);

    const first = await anima.detectConflicts();
    const firstId = first[0].id;

    // Detect again — ID should be preserved (read from file)
    const second = await anima.detectConflicts();
    expect(second[0].id).toBe(firstId);
  });

  it('handles multiple opinion changes on same topic', async () => {
    const anima = new Anima({ name: 'TestAgent', storagePath: TEST_DIR });
    await anima.boot();

    await anima.opine('music', 'Rock is best', 0.6);
    await anima.opine('music', 'Jazz is best', 0.7);
    await anima.opine('music', 'Hip hop is best', 0.8);

    // Should detect one conflict (latest previous vs current)
    const conflicts = await anima.detectConflicts();
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].positionB.content).toBe('Hip hop is best');
  });
});

import { describe, it, expect } from 'vitest';
import { uid, dateKey, yesterdayKey, calculateSalience, calculateDecay, parseFrontmatter, memoryToMarkdown } from '../src/utils';

describe('uid', () => {
  it('generates unique IDs', () => {
    const a = uid();
    const b = uid();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('dateKey', () => {
  it('returns YYYY-MM-DD format', () => {
    const key = dateKey(new Date('2026-01-30T10:00:00Z'));
    expect(key).toBe('2026-01-30');
  });

  it('defaults to today', () => {
    const key = dateKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('yesterdayKey', () => {
  it('returns a valid date key', () => {
    const key = yesterdayKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(key).not.toBe(dateKey());
  });
});

describe('calculateSalience', () => {
  it('returns 0-1 range', () => {
    const score = calculateSalience({
      novelty: 0.5,
      retention: 0.3,
      momentum: 0.8,
      continuity: 0.2,
      effort: 0.4,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('clamps to 0 when effort exceeds all positives', () => {
    const score = calculateSalience({
      novelty: 0.1,
      retention: 0.1,
      momentum: 0.1,
      continuity: 0.1,
      effort: 1,
    });
    expect(score).toBeCloseTo(0.09, 5);
  });

  it('clamps to 1 when positives are maxed', () => {
    const score = calculateSalience({
      novelty: 1,
      retention: 1,
      momentum: 1,
      continuity: 1,
      effort: 0,
    });
    expect(score).toBeCloseTo(1, 5);
  });

  it('high novelty + momentum = high salience', () => {
    const score = calculateSalience({
      novelty: 0.9,
      retention: 0.5,
      momentum: 0.9,
      continuity: 0.3,
      effort: 0.2,
    });
    expect(score).toBeGreaterThan(0.6);
  });
});

describe('calculateDecay', () => {
  it('procedural memories decay slower than episodic', () => {
    const rates = { procedural: 0.0003, semantic: 0.001, episodic: 0.003 };
    const base = { ageHours: 100, accessCount: 0, emotionalWeight: 0 };

    const procedural = calculateDecay({ ...base, type: 'lesson', decayRates: rates });
    const episodic = calculateDecay({ ...base, type: 'conversation', decayRates: rates });

    expect(procedural).toBeLessThan(episodic);
  });

  it('emotional memories resist decay', () => {
    const rates = { procedural: 0.0003, semantic: 0.001, episodic: 0.003 };
    const base = { ageHours: 100, accessCount: 0, type: 'event', decayRates: rates };

    const neutral = calculateDecay({ ...base, emotionalWeight: 0 });
    const emotional = calculateDecay({ ...base, emotionalWeight: 0.9 });

    expect(emotional).toBeLessThan(neutral);
  });

  it('frequently accessed memories decay slower', () => {
    const rates = { procedural: 0.0003, semantic: 0.001, episodic: 0.003 };
    const base = { ageHours: 100, emotionalWeight: 0, type: 'event', decayRates: rates };

    const fresh = calculateDecay({ ...base, accessCount: 0 });
    const recalled = calculateDecay({ ...base, accessCount: 5 });

    expect(recalled).toBeLessThan(fresh);
  });

  it('returns 0 for zero age (brand new memory)', () => {
    const rates = { procedural: 0.0003, semantic: 0.001, episodic: 0.003 };
    const result = calculateDecay({ type: 'event', ageHours: 0, accessCount: 0, emotionalWeight: 0, decayRates: rates });
    expect(result).toBe(0);
  });

  it('clamps negative ageHours to 0 (clock skew)', () => {
    const rates = { procedural: 0.0003, semantic: 0.001, episodic: 0.003 };
    const result = calculateDecay({ type: 'event', ageHours: -5, accessCount: 0, emotionalWeight: 0, decayRates: rates });
    expect(result).toBe(0);
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it('clamps emotionalWeight above 1 to 1', () => {
    const rates = { procedural: 0.0003, semantic: 0.001, episodic: 0.003 };
    const result = calculateDecay({ type: 'event', ageHours: 100, accessCount: 0, emotionalWeight: 5, decayRates: rates });
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('never exceeds 1 even with extreme age', () => {
    const rates = { procedural: 0.0003, semantic: 0.001, episodic: 0.003 };
    const result = calculateDecay({ type: 'conversation', ageHours: 100000, accessCount: 0, emotionalWeight: 0, decayRates: rates });
    expect(result).toBeLessThanOrEqual(1);
  });

  it('handles negative accessCount gracefully', () => {
    const rates = { procedural: 0.0003, semantic: 0.001, episodic: 0.003 };
    const result = calculateDecay({ type: 'event', ageHours: 100, accessCount: -3, emotionalWeight: 0, decayRates: rates });
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });
});

describe('parseFrontmatter', () => {
  it('parses key-value pairs between --- markers', () => {
    const content = `---
name: Kip
type: AI
---
# Content here`;
    const result = parseFrontmatter(content);
    expect(result.name).toBe('Kip');
    expect(result.type).toBe('AI');
  });

  it('returns empty object when no frontmatter', () => {
    const result = parseFrontmatter('Just some text');
    expect(result).toEqual({});
  });
});

describe('memoryToMarkdown', () => {
  it('produces readable markdown', () => {
    const md = memoryToMarkdown({
      id: 'test-123',
      type: 'event',
      content: 'Something happened',
      importance: 'high',
      tags: ['test', 'important'],
      timestamp: '2026-01-30T10:00:00Z',
      salienceScore: 0.75,
    });
    expect(md).toContain('[event]');
    expect(md).toContain('Something happened');
    expect(md).toContain('test, important');
    expect(md).toContain('0.75');
  });
});

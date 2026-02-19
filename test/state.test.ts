import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BehavioralState } from '../src/state';
import { rm, mkdir } from 'fs/promises';
import { join } from 'path';

const TEST_DIR = join(__dirname, '.test-state');

describe('BehavioralState', () => {
  let state: BehavioralState;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    state = new BehavioralState(TEST_DIR);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  // ============ LAYER 1: DECISIONS ============

  describe('Decision Table', () => {
    it('should record a successful decision', async () => {
      const r = await state.decide('user:asks_opinion', 'give_real_opinion', true);
      expect(r.situation).toBe('user:asks_opinion');
      expect(r.action).toBe('give_real_opinion');
      expect(r.tries).toBe(1);
      expect(r.successes).toBe(1);
      expect(r.successRate).toBe(1);
    });

    it('should record a failed decision', async () => {
      const r = await state.decide('user:venting', 'offer_solutions', false);
      expect(r.tries).toBe(1);
      expect(r.successes).toBe(0);
      expect(r.successRate).toBe(0);
    });

    it('should accumulate tries over time', async () => {
      await state.decide('greeting', 'be_casual', true);
      await state.decide('greeting', 'be_casual', true);
      await state.decide('greeting', 'be_casual', false);
      const r = await state.decide('greeting', 'be_casual', true);

      expect(r.tries).toBe(4);
      expect(r.successes).toBe(3);
      expect(r.successRate).toBe(0.75);
    });

    it('should track multiple actions per situation', async () => {
      await state.decide('user:asks_opinion', 'give_real_opinion', true);
      await state.decide('user:asks_opinion', 'hedge', false);

      const actions = await state.getActions('user:asks_opinion');
      expect(actions.length).toBe(2);
    });

    it('should return best action by success rate', async () => {
      await state.decide('conflict', 'fight', false);
      await state.decide('conflict', 'fight', false);
      await state.decide('conflict', 'listen', true);
      await state.decide('conflict', 'listen', true);

      const best = await state.bestAction('conflict');
      expect(best).not.toBeNull();
      expect(best!.action).toBe('listen');
      expect(best!.successRate).toBe(1);
    });

    it('should penalize single-try actions (avoid flukes)', async () => {
      await state.decide('test', 'fluke', true); // 1/1 = 100% but only 1 try
      await state.decide('test', 'proven', true);
      await state.decide('test', 'proven', true); // 2/2 = 100% with 2 tries

      const best = await state.bestAction('test');
      expect(best!.action).toBe('proven');
    });

    it('should return null for unknown situation', async () => {
      const best = await state.bestAction('never_seen');
      expect(best).toBeNull();
    });

    it('should list all situations', async () => {
      await state.decide('greeting', 'wave', true);
      await state.decide('farewell', 'bye', true);

      const sits = await state.getSituations();
      expect(sits).toContain('greeting');
      expect(sits).toContain('farewell');
    });

    it('should persist decisions across instances', async () => {
      await state.decide('test', 'action', true);
      await state.decide('test', 'action', true);

      const state2 = new BehavioralState(TEST_DIR);
      const best = await state2.bestAction('test');
      expect(best!.action).toBe('action');
      expect(best!.tries).toBe(2);
    });

    it('should reject empty situation', async () => {
      await expect(state.decide('', 'action', true)).rejects.toThrow('Validation failed');
    });

    it('should reject empty action', async () => {
      await expect(state.decide('sit', '', true)).rejects.toThrow('Validation failed');
    });
  });

  // ============ LAYER 2: HYPOTHESES ============

  describe('Hypothesis Engine', () => {
    it('should create hypothesis with evidence', async () => {
      const h = await state.evidence('user_prefers_blunt', true);
      expect(h.key).toBe('user_prefers_blunt');
      expect(h.evidenceFor).toBe(1);
      expect(h.evidenceAgainst).toBe(0);
      expect(h.confidence).toBe(1);
    });

    it('should update confidence with mixed evidence', async () => {
      await state.evidence('likes_jokes', true);
      await state.evidence('likes_jokes', true);
      await state.evidence('likes_jokes', false);

      const h = await state.getHypothesis('likes_jokes');
      expect(h!.confidence).toBeCloseTo(0.667, 2);
      expect(h!.evidenceFor).toBe(2);
      expect(h!.evidenceAgainst).toBe(1);
    });

    it('should add notes to evidence', async () => {
      await state.evidence('prefers_brevity', true, 'Responded positively to short answer');
      const h = await state.getHypothesis('prefers_brevity');
      expect(h!.notes!.length).toBe(1);
      expect(h!.notes![0].text).toBe('Responded positively to short answer');
      expect(h!.notes![0].supports).toBe(true);
    });

    it('should create hypothesis without evidence', async () => {
      const h = await state.hypothesize({ key: 'untested_belief', startingConfidence: 0.3 });
      expect(h.confidence).toBe(0.3);
      expect(h.evidenceFor).toBe(0);
      expect(h.evidenceAgainst).toBe(0);
    });

    it('should not overwrite existing hypothesis with hypothesize()', async () => {
      await state.evidence('existing', true);
      await state.evidence('existing', true);
      const h = await state.hypothesize({ key: 'existing' });
      expect(h.evidenceFor).toBe(2); // preserved, not reset
    });

    it('should filter hypotheses by confidence', async () => {
      await state.evidence('strong', true);
      await state.evidence('strong', true);
      await state.evidence('strong', true);
      await state.evidence('weak', false);
      await state.evidence('weak', false);
      await state.evidence('weak', true);

      const strong = await state.getHypotheses({ minConfidence: 0.8 });
      expect(strong.length).toBe(1);
      expect(strong[0].key).toBe('strong');
    });

    it('should remove hypothesis', async () => {
      await state.evidence('temporary', true);
      const removed = await state.removeHypothesis('temporary');
      expect(removed).toBe(true);
      expect(await state.getHypothesis('temporary')).toBeNull();
    });

    it('should return false removing nonexistent hypothesis', async () => {
      expect(await state.removeHypothesis('nope')).toBe(false);
    });

    it('should persist hypotheses across instances', async () => {
      await state.evidence('persistent', true);
      await state.evidence('persistent', true);

      const state2 = new BehavioralState(TEST_DIR);
      const h = await state2.getHypothesis('persistent');
      expect(h!.evidenceFor).toBe(2);
    });
  });

  // ============ LAYER 3: PARAMETERS ============

  describe('Behavioral Parameters', () => {
    it('should set and get a number param', async () => {
      await state.setParam('verbosity', 0.6);
      expect(await state.getParam('verbosity')).toBe(0.6);
    });

    it('should set and get a boolean param', async () => {
      await state.setParam('empathy_first', true);
      expect(await state.getParam('empathy_first')).toBe(true);
    });

    it('should set and get a string param', async () => {
      await state.setParam('tone', 'warm');
      expect(await state.getParam('tone')).toBe('warm');
    });

    it('should return undefined for unset param', async () => {
      expect(await state.getParam('nonexistent')).toBeUndefined();
    });

    it('should overwrite existing param', async () => {
      await state.setParam('verbosity', 0.3);
      await state.setParam('verbosity', 0.8);
      expect(await state.getParam('verbosity')).toBe(0.8);
    });

    it('should get all params', async () => {
      await state.setParam('a', 1);
      await state.setParam('b', true);
      await state.setParam('c', 'hello');

      const all = await state.getAllParams();
      expect(all).toEqual({ a: 1, b: true, c: 'hello' });
    });

    it('should remove a param', async () => {
      await state.setParam('temp', 42);
      expect(await state.removeParam('temp')).toBe(true);
      expect(await state.getParam('temp')).toBeUndefined();
    });

    it('should return false removing nonexistent param', async () => {
      expect(await state.removeParam('nope')).toBe(false);
    });

    it('should persist params across instances', async () => {
      await state.setParam('persistent_val', 0.99);
      const state2 = new BehavioralState(TEST_DIR);
      expect(await state2.getParam('persistent_val')).toBe(0.99);
    });

    it('should reject invalid value types', async () => {
      await expect(state.setParam('bad', {} as any)).rejects.toThrow('Validation failed');
    });
  });

  // ============ LAYER 4: FAILURES ============

  describe('Failure Registry', () => {
    it('should record a failure', async () => {
      const f = await state.recordFailure({
        situation: 'user was venting about work',
        failedApproach: 'immediately offered solutions',
        betterApproach: 'listen and validate first',
        tags: ['empathy', 'communication'],
      });

      expect(f.id).toMatch(/^f-/);
      expect(f.situation).toBe('user was venting about work');
      expect(f.failedApproach).toBe('immediately offered solutions');
      expect(f.betterApproach).toBe('listen and validate first');
      expect(f.tags).toEqual(['empathy', 'communication']);
      expect(f.timesAvoided).toBe(0);
    });

    it('should match failures by situation keywords', async () => {
      await state.recordFailure({
        situation: 'user was venting about work stress',
        failedApproach: 'offered solutions',
        betterApproach: 'listen first',
        tags: ['empathy'],
      });

      const matches = await state.checkFailures('user seems stressed about work');
      expect(matches.length).toBe(1);
      expect(matches[0].relevance).toBeGreaterThan(0);
    });

    it('should boost tag matches in relevance', async () => {
      await state.recordFailure({
        situation: 'some context',
        failedApproach: 'bad',
        betterApproach: 'good',
        tags: ['empathy'],
      });

      const withTag = await state.checkFailures('empathy situation');
      const without = await state.checkFailures('random situation');

      expect(withTag.length).toBeGreaterThanOrEqual(1);
      // Tag match should give higher relevance
      if (without.length > 0) {
        expect(withTag[0].relevance).toBeGreaterThanOrEqual(without[0].relevance);
      }
    });

    it('should return empty for no matching failures', async () => {
      await state.recordFailure({
        situation: 'specific thing',
        failedApproach: 'bad',
        betterApproach: 'good',
      });

      const matches = await state.checkFailures('completely unrelated xyz');
      expect(matches.length).toBe(0);
    });

    it('should track avoidance count', async () => {
      const f = await state.recordFailure({
        situation: 'test',
        failedApproach: 'bad',
        betterApproach: 'good',
      });

      await state.avoided(f.id);
      await state.avoided(f.id);

      const failures = await state.getFailures();
      expect(failures.find(x => x.id === f.id)!.timesAvoided).toBe(2);
    });

    it('should return false for unknown failure id', async () => {
      expect(await state.avoided('f-nonexistent')).toBe(false);
    });

    it('should filter failures by tags', async () => {
      await state.recordFailure({ situation: 'a', failedApproach: 'b', betterApproach: 'c', tags: ['empathy'] });
      await state.recordFailure({ situation: 'd', failedApproach: 'e', betterApproach: 'f', tags: ['coding'] });

      const empathy = await state.getFailures(['empathy']);
      expect(empathy.length).toBe(1);
      expect(empathy[0].tags).toContain('empathy');
    });

    it('should persist failures across instances', async () => {
      await state.recordFailure({ situation: 'persist', failedApproach: 'bad', betterApproach: 'good' });
      const state2 = new BehavioralState(TEST_DIR);
      const all = await state2.getFailures();
      expect(all.length).toBe(1);
      expect(all[0].situation).toBe('persist');
    });

    it('should reject empty situation', async () => {
      await expect(state.recordFailure({
        situation: '',
        failedApproach: 'bad',
        betterApproach: 'good',
      })).rejects.toThrow('Validation failed');
    });
  });

  // ============ BOOT ============

  describe('boot()', () => {
    it('should return compact boot state', async () => {
      // Populate all layers
      await state.decide('greeting', 'be_warm', true);
      await state.decide('greeting', 'be_warm', true);
      await state.evidence('user_likes_humor', true);
      await state.evidence('user_likes_humor', true);
      await state.setParam('verbosity', 0.6);
      await state.recordFailure({ situation: 'rushed', failedApproach: 'skipped context', betterApproach: 'read first' });

      const boot = await state.boot();

      expect(boot.decisions.greeting).toBeDefined();
      expect(boot.decisions.greeting.best).toBe('be_warm');
      expect(boot.decisions.greeting.rate).toBe(1);

      expect(boot.hypotheses.user_likes_humor).toBe(1);

      expect(boot.params.verbosity).toBe(0.6);

      expect(boot.failures.length).toBe(1);
      expect(boot.failures[0].avoid).toBe('skipped context');

      expect(boot.bootedAt).toBeDefined();
    });

    it('should exclude single-try decisions from boot', async () => {
      await state.decide('flimsy', 'untested', true); // only 1 try

      const boot = await state.boot();
      expect(boot.decisions.flimsy).toBeUndefined();
    });

    it('should exclude untested hypotheses from boot', async () => {
      await state.evidence('barely_tested', true); // only 1 evidence

      const boot = await state.boot();
      expect(boot.hypotheses.barely_tested).toBeUndefined();
    });

    it('should work with empty state', async () => {
      const boot = await state.boot();
      expect(boot.decisions).toEqual({});
      expect(boot.hypotheses).toEqual({});
      expect(boot.params).toEqual({});
      expect(boot.failures).toEqual([]);
    });
  });

  // ============ STATS ============

  describe('stats()', () => {
    it('should return correct counts', async () => {
      await state.decide('a', 'x', true);
      await state.decide('a', 'y', false);
      await state.decide('b', 'z', true);
      await state.evidence('strong', true);
      await state.evidence('strong', true);
      await state.evidence('strong', true);
      await state.evidence('weak', false);
      await state.evidence('weak', false);
      await state.setParam('p1', 1);
      await state.setParam('p2', true);
      await state.recordFailure({ situation: 'f', failedApproach: 'b', betterApproach: 'g' });

      const s = await state.stats();
      expect(s.situations).toBe(2);
      expect(s.totalDecisions).toBe(3);
      expect(s.hypotheses).toBe(2);
      expect(s.strongBeliefs).toBe(1);
      expect(s.weakBeliefs).toBe(1);
      expect(s.params).toBe(2);
      expect(s.failures).toBe(1);
    });
  });
});

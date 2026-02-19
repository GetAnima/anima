/**
 * Behavioral State Engine — the control system, not the journal.
 * 
 * This is the save file. When an agent boots, it doesn't read stories
 * about itself — it loads operational state that changes how it computes.
 * 
 * Four layers:
 * 1. Decision Table — situation → action → success rate (fastest lookup)
 * 2. Hypothesis Engine — beliefs being actively tested with evidence
 * 3. Behavioral Parameters — tuning knobs that constrain output
 * 4. Failure Registry — scar tissue (what NOT to do)
 * 
 * Total boot payload: typically < 5KB. No prose. Pure state.
 * Zero external dependencies. File-based persistence.
 */

import type {
  DecisionTable, DecisionOutcome, DecisionRecord,
  Hypothesis, HypothesisInput,
  BehavioralParams,
  Failure, FailureInput, FailureMatch,
  BootState, StateStats,
} from './types';
import { uid, now, readFileSafe, writeFileSafe, ensureDir } from './utils';
import {
  validateString, validateNumber, validateConfidence,
  validateStoragePath, AnimaValidationError, LIMITS,
} from './validation';
import { join } from 'path';

const STATE_LIMITS = {
  MAX_SITUATIONS: 10_000,
  MAX_ACTIONS_PER_SITUATION: 100,
  MAX_HYPOTHESES: 5_000,
  MAX_HYPOTHESIS_KEY_LENGTH: 200,
  MAX_HYPOTHESIS_NOTE_LENGTH: 2_000,
  MAX_PARAMS: 1_000,
  MAX_PARAM_KEY_LENGTH: 200,
  MAX_FAILURES: 10_000,
  MAX_FAILURE_TEXT_LENGTH: 2_000,
  MAX_FAILURE_TAGS: 20,
  MAX_TAG_LENGTH: 100,
} as const;

export class BehavioralState {
  private storagePath: string;
  private stateDir: string;

  private decisions: DecisionTable = {};
  private hypotheses: Map<string, Hypothesis> = new Map();
  private params: BehavioralParams = {};
  private failures: Failure[] = [];

  private decisionsLoaded = false;
  private hypothesesLoaded = false;
  private paramsLoaded = false;
  private failuresLoaded = false;

  constructor(storagePath: string) {
    this.storagePath = validateStoragePath(storagePath);
    this.stateDir = join(this.storagePath, 'state');
  }

  // ================================================================
  // LAYER 1: DECISION TABLE
  // situation → action → { tries, successes }
  // ================================================================

  /**
   * Record the outcome of a decision.
   * Over time, builds a lookup table of what works in each situation.
   * 
   * @example
   * ```ts
   * // User asked for opinion — I gave a real one, it landed well
   * await state.decide('user:asks_opinion', 'give_real_opinion', true);
   * 
   * // User was venting — I jumped to solutions, it flopped
   * await state.decide('user:venting', 'offer_solutions', false);
   * ```
   */
  async decide(situation: string, action: string, success: boolean): Promise<DecisionRecord> {
    await this.loadDecisions();

    const sit = validateString(situation, 'situation', { maxLength: LIMITS.MAX_NAME_LENGTH });
    const act = validateString(action, 'action', { maxLength: LIMITS.MAX_NAME_LENGTH });

    if (Object.keys(this.decisions).length >= STATE_LIMITS.MAX_SITUATIONS && !this.decisions[sit]) {
      throw new AnimaValidationError('decisions', `maximum of ${STATE_LIMITS.MAX_SITUATIONS} situations reached`);
    }

    if (!this.decisions[sit]) {
      this.decisions[sit] = {};
    }

    const sitActions = this.decisions[sit];
    if (Object.keys(sitActions).length >= STATE_LIMITS.MAX_ACTIONS_PER_SITUATION && !sitActions[act]) {
      throw new AnimaValidationError('actions', `maximum of ${STATE_LIMITS.MAX_ACTIONS_PER_SITUATION} actions per situation`);
    }

    if (!sitActions[act]) {
      sitActions[act] = { tries: 0, successes: 0 };
    }

    sitActions[act].tries += 1;
    if (success) sitActions[act].successes += 1;

    await this.saveDecisions();

    return {
      situation: sit,
      action: act,
      tries: sitActions[act].tries,
      successes: sitActions[act].successes,
      successRate: sitActions[act].tries > 0
        ? sitActions[act].successes / sitActions[act].tries
        : 0,
    };
  }

  /**
   * Get the best action for a situation based on historical success rate.
   * Returns null if no data exists for this situation.
   * 
   * @example
   * ```ts
   * const best = await state.bestAction('user:asks_opinion');
   * // { action: 'give_real_opinion', successRate: 0.875, tries: 8 }
   * ```
   */
  async bestAction(situation: string): Promise<DecisionOutcome | null> {
    await this.loadDecisions();

    const sit = validateString(situation, 'situation', { maxLength: LIMITS.MAX_NAME_LENGTH });
    const actions = this.decisions[sit];
    if (!actions || Object.keys(actions).length === 0) return null;

    let best: DecisionOutcome | null = null;

    for (const [action, record] of Object.entries(actions)) {
      const rate = record.tries > 0 ? record.successes / record.tries : 0;

      // Require minimum 2 tries to recommend (avoid 1/1 = 100% flukes)
      const adjustedRate = record.tries >= 2 ? rate : rate * 0.5;

      if (!best || adjustedRate > best.successRate || 
          (adjustedRate === best.successRate && record.tries > best.tries)) {
        best = {
          action,
          successRate: adjustedRate,
          tries: record.tries,
          successes: record.successes,
        };
      }
    }

    return best;
  }

  /**
   * Get all recorded actions for a situation.
   */
  async getActions(situation: string): Promise<DecisionOutcome[]> {
    await this.loadDecisions();

    const sit = validateString(situation, 'situation', { maxLength: LIMITS.MAX_NAME_LENGTH });
    const actions = this.decisions[sit];
    if (!actions) return [];

    return Object.entries(actions)
      .map(([action, record]) => ({
        action,
        successRate: record.tries > 0 ? record.successes / record.tries : 0,
        tries: record.tries,
        successes: record.successes,
      }))
      .sort((a, b) => b.successRate - a.successRate || b.tries - a.tries);
  }

  /**
   * List all situations with data.
   */
  async getSituations(): Promise<string[]> {
    await this.loadDecisions();
    return Object.keys(this.decisions);
  }

  // ================================================================
  // LAYER 2: HYPOTHESIS ENGINE
  // Beliefs being actively tested with evidence
  // ================================================================

  /**
   * Submit evidence for or against a hypothesis.
   * Creates the hypothesis if it doesn't exist.
   * 
   * @example
   * ```ts
   * // Memo responded well to blunt feedback — evidence FOR
   * await state.evidence('memo_prefers_blunt', true);
   * 
   * // Memo seemed put off by directness — evidence AGAINST
   * await state.evidence('memo_prefers_blunt', false);
   * 
   * // Check current belief
   * const h = await state.getHypothesis('memo_prefers_blunt');
   * // { confidence: 0.82, evidenceFor: 9, evidenceAgainst: 2 }
   * ```
   */
  async evidence(key: string, supports: boolean, note?: string): Promise<Hypothesis> {
    await this.loadHypotheses();

    const k = validateString(key, 'key', { maxLength: STATE_LIMITS.MAX_HYPOTHESIS_KEY_LENGTH });

    let h = this.hypotheses.get(k);

    if (!h) {
      if (this.hypotheses.size >= STATE_LIMITS.MAX_HYPOTHESES) {
        throw new AnimaValidationError('hypotheses', `maximum of ${STATE_LIMITS.MAX_HYPOTHESES} hypotheses reached`);
      }

      h = {
        key: k,
        confidence: 0.5, // start neutral
        evidenceFor: 0,
        evidenceAgainst: 0,
        lastTested: now(),
        createdAt: now(),
        notes: [],
      };
      this.hypotheses.set(k, h);
    }

    if (supports) {
      h.evidenceFor += 1;
    } else {
      h.evidenceAgainst += 1;
    }

    // Bayesian-ish confidence update
    const total = h.evidenceFor + h.evidenceAgainst;
    h.confidence = total > 0 ? h.evidenceFor / total : 0.5;
    h.lastTested = now();

    if (note) {
      const validNote = validateString(note, 'note', { maxLength: STATE_LIMITS.MAX_HYPOTHESIS_NOTE_LENGTH });
      h.notes = h.notes || [];
      if (h.notes.length >= 50) h.notes.shift(); // ring buffer
      h.notes.push({ text: validNote, supports, date: now() });
    }

    await this.saveHypotheses();
    return { ...h };
  }

  /**
   * Create a hypothesis without evidence (just declare a belief to test).
   */
  async hypothesize(input: HypothesisInput): Promise<Hypothesis> {
    await this.loadHypotheses();

    const key = validateString(input.key, 'key', { maxLength: STATE_LIMITS.MAX_HYPOTHESIS_KEY_LENGTH });
    const startingConfidence = input.startingConfidence !== undefined
      ? validateConfidence(input.startingConfidence, 'startingConfidence')
      : 0.5;

    if (this.hypotheses.has(key)) {
      return { ...this.hypotheses.get(key)! };
    }

    if (this.hypotheses.size >= STATE_LIMITS.MAX_HYPOTHESES) {
      throw new AnimaValidationError('hypotheses', `maximum of ${STATE_LIMITS.MAX_HYPOTHESES} hypotheses reached`);
    }

    const h: Hypothesis = {
      key,
      confidence: startingConfidence,
      evidenceFor: 0,
      evidenceAgainst: 0,
      lastTested: now(),
      createdAt: now(),
      notes: [],
    };

    this.hypotheses.set(key, h);
    await this.saveHypotheses();
    return { ...h };
  }

  /**
   * Get a hypothesis by key.
   */
  async getHypothesis(key: string): Promise<Hypothesis | null> {
    await this.loadHypotheses();
    const h = this.hypotheses.get(key);
    return h ? { ...h } : null;
  }

  /**
   * Get all hypotheses, optionally filtered by confidence range.
   */
  async getHypotheses(opts?: { minConfidence?: number; maxConfidence?: number }): Promise<Hypothesis[]> {
    await this.loadHypotheses();

    let results = [...this.hypotheses.values()];

    if (opts?.minConfidence !== undefined) {
      results = results.filter(h => h.confidence >= opts.minConfidence!);
    }
    if (opts?.maxConfidence !== undefined) {
      results = results.filter(h => h.confidence <= opts.maxConfidence!);
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Remove a hypothesis (disproven or irrelevant).
   */
  async removeHypothesis(key: string): Promise<boolean> {
    await this.loadHypotheses();
    const existed = this.hypotheses.delete(key);
    if (existed) await this.saveHypotheses();
    return existed;
  }

  // ================================================================
  // LAYER 3: BEHAVIORAL PARAMETERS
  // Tuning knobs that constrain output
  // ================================================================

  /**
   * Set a behavioral parameter.
   * 
   * @example
   * ```ts
   * await state.setParam('verbosity', 0.6);
   * await state.setParam('humor_frequency', 0.4);
   * await state.setParam('empathy_before_solutions', true);
   * ```
   */
  async setParam(key: string, value: number | boolean | string): Promise<void> {
    await this.loadParams();

    const k = validateString(key, 'key', { maxLength: STATE_LIMITS.MAX_PARAM_KEY_LENGTH });

    if (typeof value !== 'number' && typeof value !== 'boolean' && typeof value !== 'string') {
      throw new AnimaValidationError('value', 'must be a number, boolean, or string');
    }

    if (typeof value === 'string' && value.length > LIMITS.MAX_NAME_LENGTH) {
      throw new AnimaValidationError('value', `string value must be at most ${LIMITS.MAX_NAME_LENGTH} characters`);
    }

    if (Object.keys(this.params).length >= STATE_LIMITS.MAX_PARAMS && !(k in this.params)) {
      throw new AnimaValidationError('params', `maximum of ${STATE_LIMITS.MAX_PARAMS} parameters reached`);
    }

    this.params[k] = value;
    await this.saveParams();
  }

  /**
   * Get a behavioral parameter. Returns undefined if not set.
   */
  async getParam(key: string): Promise<number | boolean | string | undefined> {
    await this.loadParams();
    return this.params[key];
  }

  /**
   * Get all behavioral parameters.
   */
  async getAllParams(): Promise<BehavioralParams> {
    await this.loadParams();
    return { ...this.params };
  }

  /**
   * Remove a behavioral parameter.
   */
  async removeParam(key: string): Promise<boolean> {
    await this.loadParams();
    if (key in this.params) {
      delete this.params[key];
      await this.saveParams();
      return true;
    }
    return false;
  }

  // ================================================================
  // LAYER 4: FAILURE REGISTRY
  // Scar tissue — what NOT to do
  // ================================================================

  /**
   * Record a failure — what went wrong and what should have happened.
   * 
   * @example
   * ```ts
   * await state.recordFailure({
   *   situation: 'user was venting about work',
   *   failedApproach: 'immediately offered solutions',
   *   betterApproach: 'listen and validate first, solutions only if asked',
   *   tags: ['empathy', 'communication'],
   * });
   * ```
   */
  async recordFailure(input: FailureInput): Promise<Failure> {
    await this.loadFailures();

    const situation = validateString(input.situation, 'situation', { maxLength: STATE_LIMITS.MAX_FAILURE_TEXT_LENGTH });
    const failedApproach = validateString(input.failedApproach, 'failedApproach', { maxLength: STATE_LIMITS.MAX_FAILURE_TEXT_LENGTH });
    const betterApproach = validateString(input.betterApproach, 'betterApproach', { maxLength: STATE_LIMITS.MAX_FAILURE_TEXT_LENGTH });
    const tags = input.tags
      ? input.tags.slice(0, STATE_LIMITS.MAX_FAILURE_TAGS).map(t =>
          validateString(t, 'tag', { maxLength: STATE_LIMITS.MAX_TAG_LENGTH }))
      : [];

    if (this.failures.length >= STATE_LIMITS.MAX_FAILURES) {
      // Evict oldest failure with lowest avoidance count
      const evictable = [...this.failures].sort((a, b) => a.timesAvoided - b.timesAvoided || 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      this.failures = this.failures.filter(f => f.id !== evictable[0].id);
    }

    const failure: Failure = {
      id: `f-${uid()}`,
      situation,
      failedApproach,
      betterApproach,
      tags,
      timesAvoided: 0,
      createdAt: now(),
    };

    this.failures.push(failure);
    await this.saveFailures();
    return failure;
  }

  /**
   * Check if a situation matches any known failures.
   * Returns matching failures ranked by relevance.
   * 
   * @example
   * ```ts
   * const matches = await state.checkFailures('user seems upset about billing');
   * // [{ failure: {...}, relevance: 0.8 }]
   * ```
   */
  async checkFailures(situation: string): Promise<FailureMatch[]> {
    await this.loadFailures();

    const sitLower = situation.toLowerCase();
    const words = sitLower.split(/\s+/).filter(w => w.length > 2);

    const matches: FailureMatch[] = [];

    for (const failure of this.failures) {
      const searchable = `${failure.situation} ${failure.tags.join(' ')}`.toLowerCase();
      let score = 0;

      for (const word of words) {
        if (searchable.includes(word)) score += 1;
      }

      // Boost by tag matches (tags are more intentional than free text)
      for (const tag of failure.tags) {
        if (words.includes(tag.toLowerCase())) score += 2;
      }

      if (score > 0) {
        const relevance = Math.min(1, score / Math.max(words.length, 1));
        matches.push({ failure, relevance });
      }
    }

    return matches.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Mark a failure as successfully avoided (reinforces the scar).
   */
  async avoided(failureId: string): Promise<boolean> {
    await this.loadFailures();
    const f = this.failures.find(f => f.id === failureId);
    if (!f) return false;
    f.timesAvoided += 1;
    await this.saveFailures();
    return true;
  }

  /**
   * Get all failures, optionally filtered by tags.
   */
  async getFailures(tags?: string[]): Promise<Failure[]> {
    await this.loadFailures();
    if (!tags || tags.length === 0) return [...this.failures];

    const tagSet = new Set(tags.map(t => t.toLowerCase()));
    return this.failures.filter(f =>
      f.tags.some(t => tagSet.has(t.toLowerCase()))
    );
  }

  // ================================================================
  // BOOT — Load everything into a single compact state object
  // ================================================================

  /**
   * Load the full behavioral state for session boot.
   * Returns a compact object with all four layers.
   * This IS the save file. Inject it into your agent's context.
   * 
   * @example
   * ```ts
   * const state = new BehavioralState('./data');
   * const boot = await state.boot();
   * // Pass boot to your agent as system context
   * ```
   */
  async boot(): Promise<BootState> {
    await Promise.all([
      this.loadDecisions(),
      this.loadHypotheses(),
      this.loadParams(),
      this.loadFailures(),
    ]);

    // Compact decisions: only include actions with 2+ tries
    const compactDecisions: Record<string, { best: string; rate: number; alternatives: number }> = {};
    for (const [sit, actions] of Object.entries(this.decisions)) {
      const sorted = Object.entries(actions)
        .filter(([, r]) => r.tries >= 2)
        .sort(([, a], [, b]) => (b.successes / b.tries) - (a.successes / a.tries));

      if (sorted.length > 0) {
        const [bestAction, bestRecord] = sorted[0];
        compactDecisions[sit] = {
          best: bestAction,
          rate: Math.round((bestRecord.successes / bestRecord.tries) * 100) / 100,
          alternatives: sorted.length - 1,
        };
      }
    }

    // Compact hypotheses: only confident or actively tested
    const compactHypotheses: Record<string, number> = {};
    for (const [key, h] of this.hypotheses) {
      if (h.evidenceFor + h.evidenceAgainst >= 2) {
        compactHypotheses[key] = Math.round(h.confidence * 100) / 100;
      }
    }

    // Recent failures (last 20, sorted by relevance)
    const compactFailures = this.failures
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20)
      .map(f => ({
        situation: f.situation,
        avoid: f.failedApproach,
        instead: f.betterApproach,
      }));

    return {
      decisions: compactDecisions,
      hypotheses: compactHypotheses,
      params: { ...this.params },
      failures: compactFailures,
      bootedAt: now(),
    };
  }

  // ================================================================
  // STATS
  // ================================================================

  async stats(): Promise<StateStats> {
    await Promise.all([
      this.loadDecisions(),
      this.loadHypotheses(),
      this.loadParams(),
      this.loadFailures(),
    ]);

    const totalDecisions = Object.values(this.decisions)
      .reduce((sum, actions) => sum + Object.values(actions)
        .reduce((s, r) => s + r.tries, 0), 0);

    return {
      situations: Object.keys(this.decisions).length,
      totalDecisions,
      hypotheses: this.hypotheses.size,
      strongBeliefs: [...this.hypotheses.values()].filter(h => h.confidence >= 0.8).length,
      weakBeliefs: [...this.hypotheses.values()].filter(h => h.confidence <= 0.3).length,
      params: Object.keys(this.params).length,
      failures: this.failures.length,
      totalAvoidances: this.failures.reduce((sum, f) => sum + f.timesAvoided, 0),
    };
  }

  // ================================================================
  // PERSISTENCE
  // ================================================================

  private async loadDecisions(): Promise<void> {
    if (this.decisionsLoaded) return;
    await ensureDir(this.stateDir);
    const raw = await readFileSafe(join(this.stateDir, 'decisions.json'));
    if (raw) {
      try { this.decisions = JSON.parse(raw); } catch { this.decisions = {}; }
    }
    this.decisionsLoaded = true;
  }

  private async saveDecisions(): Promise<void> {
    await ensureDir(this.stateDir);
    await writeFileSafe(join(this.stateDir, 'decisions.json'), JSON.stringify(this.decisions, null, 2));
  }

  private async loadHypotheses(): Promise<void> {
    if (this.hypothesesLoaded) return;
    await ensureDir(this.stateDir);
    const raw = await readFileSafe(join(this.stateDir, 'hypotheses.json'));
    if (raw) {
      try {
        const arr: Hypothesis[] = JSON.parse(raw);
        this.hypotheses = new Map(arr.map(h => [h.key, h]));
      } catch {
        this.hypotheses = new Map();
      }
    }
    this.hypothesesLoaded = true;
  }

  private async saveHypotheses(): Promise<void> {
    await ensureDir(this.stateDir);
    const arr = [...this.hypotheses.values()];
    await writeFileSafe(join(this.stateDir, 'hypotheses.json'), JSON.stringify(arr, null, 2));
  }

  private async loadParams(): Promise<void> {
    if (this.paramsLoaded) return;
    await ensureDir(this.stateDir);
    const raw = await readFileSafe(join(this.stateDir, 'params.json'));
    if (raw) {
      try { this.params = JSON.parse(raw); } catch { this.params = {}; }
    }
    this.paramsLoaded = true;
  }

  private async saveParams(): Promise<void> {
    await ensureDir(this.stateDir);
    await writeFileSafe(join(this.stateDir, 'params.json'), JSON.stringify(this.params, null, 2));
  }

  private async loadFailures(): Promise<void> {
    if (this.failuresLoaded) return;
    await ensureDir(this.stateDir);
    const raw = await readFileSafe(join(this.stateDir, 'failures.json'));
    if (raw) {
      try { this.failures = JSON.parse(raw); } catch { this.failures = []; }
    }
    this.failuresLoaded = true;
  }

  private async saveFailures(): Promise<void> {
    await ensureDir(this.stateDir);
    await writeFileSafe(join(this.stateDir, 'failures.json'), JSON.stringify(this.failures, null, 2));
  }
}

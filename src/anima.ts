/**
 * Anima — The main class.
 * 
 * Identity and memory infrastructure for AI agents.
 * File-based. Markdown-native. Zero external dependencies.
 * 
 * Usage:
 * ```typescript
 * import { Anima } from '@getanima/core';
 * 
 * const anima = new Anima({ name: 'Kip', storagePath: './anima-data' });
 * 
 * // Boot sequence: soul -> now.md -> daily log -> memories
 * const context = await anima.boot();
 * 
 * // Remember things as they happen (not at session end!)
 * await anima.remember({ content: 'Built Anima SDK with Memo tonight.' });
 * 
 * // Update lifeboat every 2 significant actions
 * await anima.checkpoint({ activeTask: 'Building SDK', status: 'in-progress', resumePoint: 'Finishing memory engine' });
 * 
 * // Before context compaction
 * await anima.flush();
 * 
 * // End of session
 * await anima.reflect();
 * ```
 */

import type { AnimaConfig, WakeContext, Memory, Checkpoint, SessionSummary, Opinion, Relationship } from './types';
import { MemoryEngine } from './memory';
import { IdentityManager } from './identity';
import { SigningEngine } from './signing';
import type { SignedIdentity, VerificationResult, KeyBundle } from './signing';
import { AnimaEventEmitter } from './events';
import { RelationshipEngine } from './relationships';
import { ReflectionEngine } from './reflection';
import { BehavioralState } from './state';
import { EpisodicMemory } from './episodes';
import type { BootState, StateStats, Episode } from './types';
import { sessionId, now, dateKey } from './utils';

export class Anima {
  private config: Required<AnimaConfig>;
  private session: string;
  private identity: IdentityManager;
  private memory: MemoryEngine;
  private bootTime: number = 0;
  private memoriesThisSession: number = 0;
  private signing: SigningEngine;
  private booted: boolean = false;
  private reflection: ReflectionEngine;
  public readonly events: AnimaEventEmitter;
  public readonly relationships: RelationshipEngine;
  public readonly state: BehavioralState;
  public readonly episodes: EpisodicMemory;

  constructor(config: AnimaConfig) {
    this.config = {
      storagePath: './anima-data',
      autoSaveInterval: 30,
      model: 'claude',
      decay: { procedural: 0.0003, semantic: 0.001, episodic: 0.003 },
      identity: {},
      ...config,
    };
    
    this.session = sessionId();
    this.identity = new IdentityManager(this.config.storagePath, this.config.identity);
    this.memory = new MemoryEngine(this.config.storagePath, this.session, this.config.decay);
    this.signing = new SigningEngine(this.config.storagePath);
    this.events = new AnimaEventEmitter();
    this.relationships = new RelationshipEngine(this.config.storagePath);
    this.reflection = new ReflectionEngine(this.config.storagePath, this.memory, this.identity);
    this.state = new BehavioralState(this.config.storagePath);
    this.episodes = new EpisodicMemory(this.config.storagePath);
  }

  // ============ BOOT SEQUENCE ============
  // Order matters. This is enforced, not suggested.
  // soul.md -> now.md -> daily log -> yesterday -> semantic search

  /**
   * Boot — the cold-start sequence.
   * Returns a WakeContext with everything the agent needs to start working.
   * Target: productive state in <60 seconds.
   */
  /**
   * QuickLoad — lightweight init for CLI commands that don't need full boot context.
   * Loads index + opinions without logging a boot event or returning full context.
   */
  async quickLoad(): Promise<void> {
    if (this.booted) return;
    await this.identity.load();
    // Load memory index and opinions silently
    await this.memory.loadIndexPublic();
    this.booted = true;
  }

  async boot(): Promise<WakeContext> {
    const startTime = Date.now();

    // Step 1: Load identity (SOUL.md + identity.json) — ~5s
    const identityData = await this.identity.load();
    const soul = this.identity.getSoul();

    // If first boot ever, initialize SOUL.md
    if (!soul) {
      await this.identity.initSoul(this.config.name);
    }

    // Step 2: Read lifeboat (NOW.md) — ~3s
    const lifeboat = await this.memory.readLifeboat();
    let checkpoint: Checkpoint | null = null;
    if (lifeboat) {
      // Parse lifeboat into checkpoint (simplified — it's markdown)
      checkpoint = {
        activeTask: this.extractSection(lifeboat, 'Active Task') || 'No active task',
        status: (this.extractSection(lifeboat, 'Status') as Checkpoint['status']) || 'paused',
        resumePoint: this.extractSection(lifeboat, 'Resume Point') || 'Start fresh',
        updatedAt: now(),
      };
    }

    // Step 3: Load today's daily log — ~10s
    const todayLog = await this.memory.readDailyLog();

    // Step 4: Load yesterday's log — ~5s
    const yesterdayLog = await this.memory.readYesterdayLog();

    // Step 5: Load recent memories from index
    const recentMemories = await this.memory.getRecentMemories(48);

    // Step 6: Load opinions
    const opinions = await this.memory.getOpinions();

    // Step 7: Read long-term memory
    const longTermMemory = await this.memory.readLongTerm();

    // Step 8: Load behavioral state (decision table, hypotheses, params, failures)
    const behavioralState = await this.state.boot();

    // Step 9: Load recent episodes from episodic memory
    const recentEpisodes = await this.episodes.recent(20);

    this.bootTime = Date.now() - startTime;
    this.booted = true;

    // Build wake context
    const context: WakeContext = {
      identity: identityData,
      lifeboat: checkpoint,
      recentMemories: recentMemories.slice(0, 50), // cap at 50 most recent
      relevantOpinions: opinions,
      relationships: await this.relationships.load(),
      sessionId: this.session,
      instanceId: sessionId(), // Unique per boot — prevents identity confusion when forked
      parentInstanceId: undefined, // Set by caller if this is a forked instance
      lastSessionSummary: todayLog || yesterdayLog || undefined,
      tokenBudget: 4000, // reasonable default
      tokensUsed: this.estimateTokens(identityData, recentMemories, opinions),
      behavioralState,
      recentEpisodes,
    };

    // Log boot event
    await this.memory.remember({
      content: `Session started. Boot time: ${this.bootTime}ms. Loaded ${recentMemories.length} recent memories, ${opinions.length} opinions.`,
      type: 'event',
      importance: 'low',
      tags: ['system', 'boot'],
    });

    // Emit afterWake event
    await this.events.emit('afterWake', {
      sessionId: this.session,
      bootTimeMs: this.bootTime,
      memoriesLoaded: recentMemories.length,
    });

    return context;
  }

  // ============ REMEMBER ============

  /**
   * Remember — store a memory immediately.
   * "Write during, not after" — core principle.
   */
  async remember(input: {
    content: string;
    type?: Memory['type'];
    importance?: Memory['importance'];
    tags?: string[];
    emotionalWeight?: number;
  }): Promise<Memory> {
    this.ensureBooted();
    this.memoriesThisSession++;
    return this.memory.remember(input);
  }

  // ============ RECALL ============

  /**
   * Recall — search memories by semantic meaning.
   */
  async recall(query: string, limit?: number): Promise<Memory[]> {
    this.ensureBooted();
    return this.memory.recall(query, limit);
  }

  // ============ CHECKPOINT (Lifeboat) ============

  /**
   * Checkpoint — update NOW.md.
   * Call every 2 significant actions.
   */
  async checkpoint(input: {
    activeTask: string;
    status: Checkpoint['status'];
    resumePoint: string;
    openThreads?: string[];
    keyContext?: string[];
  }): Promise<void> {
    this.ensureBooted();
    await this.memory.updateLifeboat({
      ...input,
      updatedAt: now(),
    });
  }

  // ============ FLUSH (Pre-compaction) ============

  /**
   * Flush — emergency save before context compression.
   * Call this when you detect context window pressure.
   */
  async flush(context?: {
    activeTask?: string;
    criticalState?: string;
    unsavedMemories?: string[];
  }): Promise<void> {
    await this.memory.emergencyFlush(context || {});
  }

  // ============ OPINE ============

  /**
   * Opine — record or update an opinion.
   * Tracks how your views evolve over time.
   */
  async opine(topic: string, opinion: string, confidence: number): Promise<Opinion> {
    this.ensureBooted();
    // Check if opinion exists before updating
    const existing = (await this.memory.getOpinions()).find(o => o.topic === topic);
    const result = await this.memory.opine({ topic, opinion, confidence });
    
    if (existing && existing.current !== opinion) {
      await this.events.emit('opinionChanged', {
        topic,
        oldOpinion: existing.current,
        newOpinion: opinion,
        oldConfidence: existing.confidence,
        newConfidence: confidence,
      });
    }
    return result;
  }

  // ============ CURATE ============

  /**
   * Curate — review raw memories and distill what matters into long-term memory.
   * 
   * The missing piece between storage and retrieval.
   * Raw daily logs are your journal. MEMORY.md is your identity.
   * This method bridges the two.
   * 
   * Call periodically (heartbeats, daily, whenever feels right).
   * 
   * ```typescript
   * const result = await anima.curate();
   * console.log(`Curated ${result.curated.length} memories`);
   * ```
   */
  async curate(options?: {
    hoursBack?: number;
    minImportance?: Memory['importance'];
    minSalience?: number;
    dryRun?: boolean;
  }): Promise<{ curated: Memory[]; written: boolean }> {
    this.ensureBooted();
    return this.memory.curate(options);
  }

  // ============ REFLECT (End of session) ============

  /**
   * Reflect — end-of-session consolidation.
   * Reviews memories, runs decay, promotes important items.
   */
  async reflect(): Promise<SessionSummary> {
    this.ensureBooted();
    
    const startTime = Date.now();

    // Curate before decay — promote important memories to MEMORY.md
    const curationResult = await this.memory.curate({ hoursBack: 24, minImportance: 'medium' });

    // Run memory decay
    const decayResult = await this.memory.runDecay();

    // Get all opinions for summary
    const opinions = await this.memory.getOpinions();

    // Generate session summary
    const summary: SessionSummary = {
      sessionId: this.session,
      startedAt: new Date(Date.now() - this.bootTime).toISOString(),
      endedAt: now(),
      summary: `Session ${this.session}: ${this.memoriesThisSession} memories created. Decay: ${decayResult.decayed} removed, ${decayResult.archived} archived, ${decayResult.kept} kept.`,
      memoriesCreated: this.memoriesThisSession,
      memoriesPromoted: 0, // TODO: track promotions
      memoriesDecayed: decayResult.decayed,
      opinionsFormed: opinions.length,
      opinionsChanged: opinions.filter(o => o.previousOpinions.length > 0).length,
      importantEvents: [],
      lessonsLearned: [],
    };

    // Write summary to daily log
    const summaryMd = `\n---\n## Session Summary (${now()})\n${summary.summary}\n---\n`;
    const dailyPath = `memory/${dateKey()}.md`;
    await this.memory.remember({
      content: summary.summary,
      type: 'event',
      importance: 'low',
      tags: ['system', 'session-summary'],
    });

    // Update lifeboat with session summary — PRESERVE existing content
    // The lifeboat may contain a hand-written letter from the agent to future-self.
    // Append session summary instead of nuking everything.
    const existingLifeboat = await this.memory.readLifeboat();
    const sessionEndNote = [
      `\n## Last Session Summary (${now()})`,
      summary.summary,
      `Curated ${curationResult.curated.length} memories to long-term.`,
      `\n## Status`,
      `done — session ended normally. Read everything above for context.`,
    ].join('\n');

    if (existingLifeboat && !existingLifeboat.includes('session ended normally')) {
      // Preserve existing lifeboat, append summary
      await this.memory.writeLifeboatRaw(existingLifeboat + '\n' + sessionEndNote);
    } else {
      // No meaningful lifeboat content — write clean end state
      await this.memory.updateLifeboat({
        activeTask: 'No active task — session ended normally',
        status: 'done',
        resumePoint: 'Start fresh next session',
        updatedAt: now(),
      });
    }

    // Emit afterSleep event
    await this.events.emit('afterSleep', {
      sessionId: this.session,
      memoriesCreated: this.memoriesThisSession,
      memoriesDecayed: decayResult.decayed,
    });

    return summary;
  }

  // ============ SIGNING ============

  /**
   * Sign — cryptographically sign this agent's identity.
   * Produces a verifiable bundle that proves "this identity is mine and untampered."
   * Initializes keys on first call.
   */
  async sign(): Promise<SignedIdentity> {
    this.ensureBooted();
    await this.signing.init(this.config.name);
    const identity = this.identity.get();
    const signed = this.signing.signIdentity(identity);
    await this.signing.saveSignedIdentity(signed);
    return signed;
  }

  /**
   * Verify — check another agent's signed identity.
   * Static: doesn't require booting your own Anima instance.
   * 
   * Usage:
   * ```typescript
   * const result = Anima.verify(signedIdentityFromOtherAgent);
   * if (result.valid) console.log(`Verified: ${result.agentName}`);
   * ```
   */
  static verify(signed: SignedIdentity): VerificationResult {
    return SigningEngine.verifyIdentity(signed);
  }

  /**
   * Get this agent's public key bundle — share this for others to verify you.
   * Never includes the private key.
   */
  async getKeyBundle(): Promise<KeyBundle> {
    await this.signing.init(this.config.name);
    return this.signing.getKeyBundle();
  }

  /**
   * Get this agent's fingerprint — a short, human-readable identity string.
   * Like SSH: "ab:cd:ef:12:34:56:78:90:..."
   */
  async getFingerprint(): Promise<string> {
    await this.signing.init(this.config.name);
    return this.signing.getFingerprint();
  }

  // ============ CONFLICTS ============

  /**
   * Detect memory conflicts — contradictory beliefs across sessions.
   * Returns unresolved MemoryConflict objects.
   */
  async detectConflicts(): Promise<import('./types').MemoryConflict[]> {
    this.ensureBooted();
    return this.reflection.detectConflicts();
  }

  /**
   * Resolve a detected conflict with an explanation.
   */
  async resolveConflict(conflictId: string, resolution: string): Promise<boolean> {
    this.ensureBooted();
    return this.reflection.resolveConflict(conflictId, resolution);
  }

  /**
   * Get all conflicts (unresolved by default).
   */
  async getConflicts(includeResolved = false): Promise<import('./types').MemoryConflict[]> {
    this.ensureBooted();
    return this.reflection.getConflicts(includeResolved);
  }

  // ============ ACCESSORS ============

  /** Get current session ID */
  getSessionId(): string {
    return this.session;
  }

  /** Get boot time in ms */
  getBootTime(): number {
    return this.bootTime;
  }

  /** Get the identity manager for direct access */
  getIdentity(): IdentityManager {
    return this.identity;
  }

  /** Get the memory engine for direct access */
  getMemory(): MemoryEngine {
    return this.memory;
  }

  // ============ INTERNAL ============

  private ensureBooted(): void {
    if (!this.booted) {
      throw new Error('[anima] Not booted. Call anima.boot() first.');
    }
  }

  private extractSection(markdown: string, heading: string): string | null {
    const regex = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
    const match = markdown.match(regex);
    return match ? match[1].trim() : null;
  }

  private estimateTokens(identity: any, memories: Memory[], opinions: Opinion[]): number {
    // Rough estimate: 1 token ≈ 4 chars
    const identityTokens = JSON.stringify(identity).length / 4;
    const memoryTokens = memories.reduce((sum, m) => sum + m.content.length / 4, 0);
    const opinionTokens = opinions.reduce((sum, o) => sum + (o.current.length + o.topic.length) / 4, 0);
    return Math.ceil(identityTokens + memoryTokens + opinionTokens);
  }
}

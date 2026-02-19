/**
 * Core types for Anima v2
 * Informed by 220+ agent feedback from Moltbook
 */

// ============ CONFIG ============

export interface AnimaConfig {
  /** Agent's name */
  name: string;
  /** Path to store identity and memory files */
  storagePath?: string;
  /** Auto-save interval in minutes (default: 30) — Memo's feature */
  autoSaveInterval?: number;
  /** Model to use for reflection engine */
  model?: string;
  /** Memory decay configuration */
  decay?: DecayConfig;
  /** Custom identity template */
  identity?: Partial<Identity>;
}

// ============ IDENTITY (Layer 1) ============

export interface Identity {
  name: string;
  personality: string;
  values: string[];
  boundaries: string[];
  voice: VoiceCalibration;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceCalibration {
  tone: string;        // e.g. "sharp, genuine, loyal"
  formality: number;   // 0 (casual) to 1 (formal)
  humor: number;       // 0 (serious) to 1 (playful)
  verbosity: number;   // 0 (terse) to 1 (verbose)
}

// ============ MEMORY (Layer 2) ============

export type MemoryType = 'event' | 'conversation' | 'decision' | 'insight' | 'lesson' | 'emotional';
export type MemoryTier = 'hot' | 'warm' | 'cold' | 'archived';
export type ImportanceLevel = 'low' | 'medium' | 'high' | 'critical';

export interface Memory {
  id: string;
  type: MemoryType;
  content: string;
  importance: ImportanceLevel;
  tier: MemoryTier;
  tags: string[];
  timestamp: string;
  sessionId: string;
  /** Salience score: novelty + retention + momentum + continuity - effort */
  salienceScore?: number;
  /** Emotional weight — resists decay when high */
  emotionalWeight?: number;
  /** Number of times this memory was retrieved */
  accessCount?: number;
  /** Was this accessed across different domains? (strongest signal) */
  crossDomainAccess?: boolean;
  /** Decay score — increases over time, modulated by type and access */
  decayScore?: number;
  /** Floor value — minimum salience that prevents decay below threshold */
  floor?: number;
}

export interface DecayConfig {
  /** Procedural memory decay rate (skills, workflows) — very slow */
  procedural: number;   // default: 0.0003
  /** Semantic memory decay rate (knowledge, facts) — medium */
  semantic: number;     // default: 0.001
  /** Episodic memory decay rate (conversations, events) — fast */
  episodic: number;     // default: 0.003
}

// ============ LIFEBOAT (now.md) ============

export interface Checkpoint {
  activeTask: string;
  status: 'in-progress' | 'blocked' | 'done' | 'paused';
  resumePoint: string;
  openThreads?: string[];
  keyContext?: string[];
  emergency?: boolean;
  updatedAt: string;
}

// ============ REFLECTION (Layer 3) ============

export interface SessionSummary {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  summary: string;
  memoriesCreated: number;
  memoriesPromoted: number;  // daily → long-term
  memoriesDecayed: number;   // removed or archived
  opinionsFormed: number;
  opinionsChanged: number;
  importantEvents: string[];
  lessonsLearned: string[];
}

// ============ OPINIONS (Layer 5) ============

export interface Opinion {
  id: string;
  topic: string;
  current: string;
  confidence: number; // 0-1
  formedAt: string;
  updatedAt: string;
  previousOpinions: OpinionHistory[];
}

export interface OpinionHistory {
  opinion: string;
  confidence: number;
  date: string;
  reasonForChange?: string;
}

// ============ RELATIONSHIPS (Layer 4) ============

export interface Relationship {
  id: string;
  name: string;
  type: 'human' | 'agent' | 'entity';
  context: string;
  interactionCount: number;
  firstMet: string;
  lastInteraction: string;
  preferences?: string[];
  notes: string[];
}

// ============ MEMORY CONFLICT ============

export interface MemoryConflict {
  id: string;
  topic: string;
  positionA: { content: string; session: string; date: string };
  positionB: { content: string; session: string; date: string };
  resolved: boolean;
  resolution?: string;
  resolvedAt?: string;
}

// ============ WAKE CONTEXT ============

export interface WakeContext {
  identity: Identity;
  lifeboat: Checkpoint | null;
  recentMemories: Memory[];
  relevantOpinions: Opinion[];
  relationships: Relationship[];
  sessionId: string;
  /** Unique instance ID — prevents identity confusion when agent is forked/cloned */
  instanceId: string;
  /** Parent instance ID if this is a forked instance */
  parentInstanceId?: string;
  lastSessionSummary?: string;
  tokenBudget: number;
  /** Estimated tokens used by this context */
  tokensUsed: number;
  /** Behavioral state — decision table, hypotheses, params, failures */
  behavioralState?: BootState;
  /** Recent episodes from episodic memory */
  recentEpisodes?: Episode[];
}

// ============ EVENTS ============

export type AnimaEvent = 
  | 'beforeCompaction'
  | 'afterWake'
  | 'afterSleep'
  | 'memoryPromoted'
  | 'memoryDecayed'
  | 'opinionChanged'
  | 'conflictDetected'
  | 'autoSave';

export interface AutoSaveConfig {
  enabled: boolean;
  intervalMinutes: number;
  onSave?: (summary: string) => void;
}

// ============ EPISODES (Layer 6) ============

export interface Episode {
  id: string;
  title: string;
  summary: string;
  timestamp: string;
  emotionalWeight: number;       // 0-1: how emotionally significant
  importance: number;            // 0-1: auto-calculated from multiple signals
  participants: string[];        // who was involved
  tags: string[];
  lessons: string[];             // what was learned from this experience
  connections: {
    episodeIds?: string[];       // linked episodes
    opinionIds?: string[];       // opinions affected
    memoryIds?: string[];        // related flat memories
  };
  accessCount: number;           // times this episode was retrieved
  archived: boolean;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EpisodeInput {
  title: string;
  summary: string;
  timestamp?: string;            // defaults to now()
  emotionalWeight?: number;      // defaults to 0.5
  participants?: string[];
  tags?: string[];
  lessons?: string[];
  connections?: {
    episodeIds?: string[];
    opinionIds?: string[];
    memoryIds?: string[];
  };
}

export interface EpisodeQuery {
  text?: string;                 // search title + summary + lessons
  tags?: string[];
  participants?: string[];
  after?: string;                // ISO timestamp
  before?: string;               // ISO timestamp
  minImportance?: number;        // 0-1
  minEmotionalWeight?: number;   // 0-1
  limit?: number;                // default 20
}

export interface EpisodeStats {
  totalEpisodes: number;
  activeEpisodes: number;
  archivedEpisodes: number;
  totalKnowledge: number;
  decayedThisRun: number;
  promotedThisRun: number;
}

// ============ KNOWLEDGE (Semantic Memory) ============

export interface KnowledgeEntry {
  id: string;
  topic: string;
  insight: string;
  confidence: number;            // 0-1
  tags: string[];
  sourceEpisodeIds: string[];    // which episodes this was distilled from
  previousInsights?: KnowledgeHistory[];
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeHistory {
  insight: string;
  confidence: number;
  date: string;
}

export interface KnowledgeInput {
  topic: string;
  insight: string;
  confidence?: number;           // defaults to 0.7
  tags?: string[];
  sourceEpisodeIds?: string[];
}

// ============ BEHAVIORAL STATE (Layer 7) ============

// -- Layer 1: Decision Table --

export interface DecisionTable {
  [situation: string]: {
    [action: string]: { tries: number; successes: number };
  };
}

export interface DecisionRecord {
  situation: string;
  action: string;
  tries: number;
  successes: number;
  successRate: number;
}

export interface DecisionOutcome {
  action: string;
  successRate: number;
  tries: number;
  successes: number;
}

// -- Layer 2: Hypothesis Engine --

export interface Hypothesis {
  key: string;
  confidence: number;            // 0-1, computed from evidence ratio
  evidenceFor: number;
  evidenceAgainst: number;
  lastTested: string;
  createdAt: string;
  notes?: HypothesisNote[];
}

export interface HypothesisNote {
  text: string;
  supports: boolean;
  date: string;
}

export interface HypothesisInput {
  key: string;
  startingConfidence?: number;   // defaults to 0.5 (neutral)
}

// -- Layer 3: Behavioral Parameters --

export interface BehavioralParams {
  [key: string]: number | boolean | string;
}

// -- Layer 4: Failure Registry --

export interface Failure {
  id: string;
  situation: string;
  failedApproach: string;
  betterApproach: string;
  tags: string[];
  timesAvoided: number;
  createdAt: string;
}

export interface FailureInput {
  situation: string;
  failedApproach: string;
  betterApproach: string;
  tags?: string[];
}

export interface FailureMatch {
  failure: Failure;
  relevance: number;             // 0-1
}

// -- Boot State (compact save file) --

export interface BootState {
  decisions: Record<string, { best: string; rate: number; alternatives: number }>;
  hypotheses: Record<string, number>;   // key → confidence
  params: BehavioralParams;
  failures: { situation: string; avoid: string; instead: string }[];
  bootedAt: string;
}

// -- Stats --

export interface StateStats {
  situations: number;
  totalDecisions: number;
  hypotheses: number;
  strongBeliefs: number;         // confidence >= 0.8
  weakBeliefs: number;           // confidence <= 0.3
  params: number;
  failures: number;
  totalAvoidances: number;
}

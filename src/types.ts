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
  lastSessionSummary?: string;
  tokenBudget: number;
  /** Estimated tokens used by this context */
  tokensUsed: number;
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

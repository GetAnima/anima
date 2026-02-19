/**
 * Anima — Identity and memory infrastructure for AI agents.
 * 
 * Give your AI agent a soul — not just a system prompt.
 * 
 * @module @getanima/core
 * @see https://getanima.net
 */

export { Anima } from './anima';
export { MemoryEngine } from './memory';
export { IdentityManager } from './identity';
export { ReflectionEngine } from './reflection';
export { SigningEngine } from './signing';
export { AnimaEventEmitter } from './events';
export { RelationshipEngine } from './relationships';
export { EpisodicMemory } from './episodes';
export { AnimaValidationError, LIMITS } from './validation';
export type { AnimaEventMap } from './events';

export type {
  AnimaConfig,
  Memory,
  MemoryType,
  MemoryTier,
  ImportanceLevel,
  Identity,
  VoiceCalibration,
  Opinion,
  OpinionHistory,
  Relationship,
  Checkpoint,
  WakeContext,
  SessionSummary,
  DecayConfig,
  MemoryConflict,
  AnimaEvent,
  AutoSaveConfig,
  Episode,
  EpisodeInput,
  EpisodeQuery,
  EpisodeStats,
  KnowledgeEntry,
  KnowledgeInput,
  KnowledgeHistory,
} from './types';

export type {
  KeyBundle,
  SignedIdentity,
  VerificationResult,
} from './signing';

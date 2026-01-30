/**
 * Anima — Identity and memory infrastructure for AI agents.
 * 
 * Give your AI agent a soul — not just a system prompt.
 * 
 * @module @getanima/core
 * @see https://getanima.dev
 */

export { Anima } from './anima';
export { MemoryEngine } from './memory';
export { IdentityManager } from './identity';
export { ReflectionEngine } from './reflection';

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
} from './types';

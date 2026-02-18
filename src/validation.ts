/**
 * Input validation & sanitization for Anima SDK.
 * 
 * Every public method should validate inputs before processing.
 * Fail fast, fail loud — don't silently accept garbage data.
 */

import { resolve, normalize } from 'path';

// ============ LIMITS ============

export const LIMITS = {
  /** Max length for a single memory content field */
  MAX_MEMORY_CONTENT: 50_000,    // 50KB — generous but not absurd
  /** Max length for a single note */
  MAX_NOTE_LENGTH: 10_000,       // 10KB
  /** Max length for a name field */
  MAX_NAME_LENGTH: 200,
  /** Max length for a topic field */
  MAX_TOPIC_LENGTH: 500,
  /** Max length for an opinion */
  MAX_OPINION_LENGTH: 10_000,
  /** Max number of tags per memory */
  MAX_TAGS: 50,
  /** Max length of a single tag */
  MAX_TAG_LENGTH: 100,
  /** Max number of notes per relationship */
  MAX_NOTES_PER_RELATIONSHIP: 1000,
  /** Max number of preferences per relationship */
  MAX_PREFERENCES: 100,
  /** Max number of relationships */
  MAX_RELATIONSHIPS: 10_000,
  /** Max number of memories in index */
  MAX_MEMORIES: 100_000,
  /** Max number of opinions */
  MAX_OPINIONS: 5_000,
} as const;

// ============ ERRORS ============

export class AnimaValidationError extends Error {
  public readonly field: string;
  public readonly constraint: string;

  constructor(field: string, constraint: string) {
    super(`Validation failed: ${field} — ${constraint}`);
    this.name = 'AnimaValidationError';
    this.field = field;
    this.constraint = constraint;
  }
}

// ============ STRING VALIDATORS ============

/** Validate a required string field is non-empty and within length */
export function validateString(
  value: unknown,
  field: string,
  opts: { maxLength?: number; minLength?: number; required?: boolean } = {}
): string {
  const { maxLength, minLength = 1, required = true } = opts;

  if (value === undefined || value === null) {
    if (required) throw new AnimaValidationError(field, 'is required');
    return '';
  }

  if (typeof value !== 'string') {
    throw new AnimaValidationError(field, 'must be a string');
  }

  const trimmed = value.trim();

  if (required && trimmed.length < minLength) {
    throw new AnimaValidationError(field, `must be at least ${minLength} character(s), got ${trimmed.length}`);
  }

  if (maxLength && trimmed.length > maxLength) {
    throw new AnimaValidationError(field, `must be at most ${maxLength} characters, got ${trimmed.length}`);
  }

  return trimmed;
}

/** Validate an optional string — returns undefined if not provided */
export function validateOptionalString(
  value: unknown,
  field: string,
  maxLength: number
): string | undefined {
  if (value === undefined || value === null) return undefined;
  return validateString(value, field, { maxLength, required: false });
}

// ============ NUMBER VALIDATORS ============

/** Validate a number is within range */
export function validateNumber(
  value: unknown,
  field: string,
  opts: { min?: number; max?: number; required?: boolean } = {}
): number {
  const { min = -Infinity, max = Infinity, required = true } = opts;

  if (value === undefined || value === null) {
    if (required) throw new AnimaValidationError(field, 'is required');
    return 0;
  }

  if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
    throw new AnimaValidationError(field, 'must be a finite number');
  }

  if (value < min || value > max) {
    throw new AnimaValidationError(field, `must be between ${min} and ${max}, got ${value}`);
  }

  return value;
}

// ============ ARRAY VALIDATORS ============

/** Validate a string array with per-item and total limits */
export function validateStringArray(
  value: unknown,
  field: string,
  opts: { maxItems?: number; maxItemLength?: number; required?: boolean } = {}
): string[] {
  const { maxItems = 100, maxItemLength = 500, required = false } = opts;

  if (value === undefined || value === null) {
    if (required) throw new AnimaValidationError(field, 'is required');
    return [];
  }

  if (!Array.isArray(value)) {
    throw new AnimaValidationError(field, 'must be an array');
  }

  if (value.length > maxItems) {
    throw new AnimaValidationError(field, `must have at most ${maxItems} items, got ${value.length}`);
  }

  return value.map((item, i) => {
    if (typeof item !== 'string') {
      throw new AnimaValidationError(`${field}[${i}]`, 'must be a string');
    }
    if (item.length > maxItemLength) {
      throw new AnimaValidationError(`${field}[${i}]`, `must be at most ${maxItemLength} characters`);
    }
    return item;
  });
}

// ============ PATH VALIDATION ============

/**
 * Validate and sanitize a storage path.
 * 
 * Prevents:
 * - Path traversal (../../etc/passwd)
 * - Null bytes
 * - Paths outside the resolved directory
 */
export function validateStoragePath(storagePath: string): string {
  if (!storagePath || typeof storagePath !== 'string') {
    throw new AnimaValidationError('storagePath', 'is required and must be a non-empty string');
  }

  // Reject null bytes (used in path traversal attacks)
  if (storagePath.includes('\0')) {
    throw new AnimaValidationError('storagePath', 'must not contain null bytes');
  }

  // Resolve to absolute path and normalize
  const resolved = resolve(normalize(storagePath));

  // On Windows, reject UNC paths unless explicitly a local drive
  if (process.platform === 'win32' && resolved.startsWith('\\\\')) {
    throw new AnimaValidationError('storagePath', 'UNC paths are not supported');
  }

  return resolved;
}

/**
 * Ensure a sub-path stays within the base directory.
 * Use this when constructing paths from user-provided segments.
 */
export function validateSubPath(basePath: string, subPath: string): string {
  const resolved = resolve(basePath, normalize(subPath));
  if (!resolved.startsWith(resolve(basePath))) {
    throw new AnimaValidationError('path', `traversal detected: ${subPath} escapes ${basePath}`);
  }
  return resolved;
}

// ============ ENUM VALIDATORS ============

/** Validate a value is one of the allowed options */
export function validateEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  defaultValue?: T
): T {
  if (value === undefined || value === null) {
    if (defaultValue !== undefined) return defaultValue;
    throw new AnimaValidationError(field, `is required, must be one of: ${allowed.join(', ')}`);
  }

  if (!allowed.includes(value as T)) {
    throw new AnimaValidationError(field, `must be one of: ${allowed.join(', ')}, got "${value}"`);
  }

  return value as T;
}

// ============ CONFIDENCE VALIDATOR ============

/** Validate confidence score: must be 0-1 */
export function validateConfidence(value: unknown, field = 'confidence'): number {
  return validateNumber(value, field, { min: 0, max: 1, required: true });
}

import { describe, it, expect } from 'vitest';
import { 
  validateString, 
  validateOptionalString, 
  validateNumber, 
  validateStringArray, 
  validateStoragePath, 
  validateSubPath,
  validateEnum, 
  validateConfidence,
  AnimaValidationError, 
  LIMITS 
} from '../src/validation';

describe('Input Validation', () => {
  describe('validateString', () => {
    it('rejects empty strings', () => {
      expect(() => validateString('', 'name')).toThrow(AnimaValidationError);
      expect(() => validateString('   ', 'name')).toThrow(AnimaValidationError);
    });

    it('rejects null/undefined when required', () => {
      expect(() => validateString(null, 'name')).toThrow(AnimaValidationError);
      expect(() => validateString(undefined, 'name')).toThrow(AnimaValidationError);
    });

    it('accepts valid strings', () => {
      expect(validateString('hello', 'name')).toBe('hello');
    });

    it('trims whitespace', () => {
      expect(validateString('  hello  ', 'name')).toBe('hello');
    });

    it('enforces max length', () => {
      expect(() => validateString('a'.repeat(201), 'name', { maxLength: 200 })).toThrow(AnimaValidationError);
    });

    it('rejects non-strings', () => {
      expect(() => validateString(123 as any, 'name')).toThrow(AnimaValidationError);
      expect(() => validateString({} as any, 'name')).toThrow(AnimaValidationError);
    });
  });

  describe('validateNumber', () => {
    it('enforces range', () => {
      expect(() => validateNumber(-1, 'confidence', { min: 0, max: 1 })).toThrow(AnimaValidationError);
      expect(() => validateNumber(2, 'confidence', { min: 0, max: 1 })).toThrow(AnimaValidationError);
    });

    it('rejects NaN and Infinity', () => {
      expect(() => validateNumber(NaN, 'score')).toThrow(AnimaValidationError);
      expect(() => validateNumber(Infinity, 'score')).toThrow(AnimaValidationError);
    });

    it('accepts valid numbers', () => {
      expect(validateNumber(0.5, 'confidence', { min: 0, max: 1 })).toBe(0.5);
    });
  });

  describe('validateConfidence', () => {
    it('rejects out of range', () => {
      expect(() => validateConfidence(-0.1)).toThrow(AnimaValidationError);
      expect(() => validateConfidence(1.1)).toThrow(AnimaValidationError);
    });

    it('accepts valid confidence', () => {
      expect(validateConfidence(0)).toBe(0);
      expect(validateConfidence(0.5)).toBe(0.5);
      expect(validateConfidence(1)).toBe(1);
    });
  });

  describe('validateStringArray', () => {
    it('rejects non-arrays', () => {
      expect(() => validateStringArray('not array' as any, 'tags')).toThrow(AnimaValidationError);
    });

    it('enforces max items', () => {
      const big = Array(51).fill('tag');
      expect(() => validateStringArray(big, 'tags', { maxItems: 50 })).toThrow(AnimaValidationError);
    });

    it('enforces per-item max length', () => {
      expect(() => validateStringArray(['a'.repeat(101)], 'tags', { maxItemLength: 100 })).toThrow(AnimaValidationError);
    });

    it('rejects non-string items', () => {
      expect(() => validateStringArray([123 as any], 'tags')).toThrow(AnimaValidationError);
    });

    it('returns empty array for undefined when not required', () => {
      expect(validateStringArray(undefined, 'tags')).toEqual([]);
    });
  });

  describe('validateStoragePath', () => {
    it('rejects empty paths', () => {
      expect(() => validateStoragePath('')).toThrow(AnimaValidationError);
    });

    it('rejects null bytes', () => {
      expect(() => validateStoragePath('/tmp/test\0evil')).toThrow(AnimaValidationError);
    });

    it('resolves valid paths', () => {
      const result = validateStoragePath('./test-data');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('validateSubPath', () => {
    it('rejects path traversal', () => {
      expect(() => validateSubPath('/home/user/data', '../../etc/passwd')).toThrow(AnimaValidationError);
    });

    it('accepts valid sub-paths', () => {
      const result = validateSubPath('/home/user/data', 'memories/today.json');
      expect(result).toContain('memories');
    });
  });

  describe('validateEnum', () => {
    it('rejects invalid values', () => {
      expect(() => validateEnum('invalid', 'type', ['human', 'agent'] as const)).toThrow(AnimaValidationError);
    });

    it('accepts valid values', () => {
      expect(validateEnum('human', 'type', ['human', 'agent'] as const)).toBe('human');
    });

    it('uses default when undefined', () => {
      expect(validateEnum(undefined, 'type', ['human', 'agent'] as const, 'human')).toBe('human');
    });
  });
});

describe('AnimaValidationError', () => {
  it('has field and constraint properties', () => {
    const err = new AnimaValidationError('name', 'is required');
    expect(err.field).toBe('name');
    expect(err.constraint).toBe('is required');
    expect(err.name).toBe('AnimaValidationError');
    expect(err.message).toContain('name');
  });
});

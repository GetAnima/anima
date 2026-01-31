/**
 * Identity Manager — loads, updates, and persists agent identity.
 * 
 * Identity = SOUL.md (who you are) + IDENTITY.md (structured data).
 * Soul is immutable in purpose, evolves deliberately.
 * Identity data evolves through reflection gates only.
 */

import type { Identity, VoiceCalibration } from './types';
import { readFileSafe, writeFileSafe, now } from './utils';
import { join } from 'path';

const DEFAULT_VOICE: VoiceCalibration = {
  tone: 'helpful, genuine',
  formality: 0.4,
  humor: 0.5,
  verbosity: 0.5,
};

const DEFAULT_IDENTITY: Identity = {
  name: 'Agent',
  personality: 'A helpful AI agent.',
  values: ['helpfulness', 'honesty', 'resourcefulness'],
  boundaries: ['never leak private data', 'ask before external actions'],
  voice: DEFAULT_VOICE,
  createdAt: now(),
  updatedAt: now(),
};

export class IdentityManager {
  private storagePath: string;
  private identity: Identity;
  private soulContent: string | null = null;

  constructor(storagePath: string, defaults?: Partial<Identity>) {
    this.storagePath = storagePath;
    this.identity = { ...DEFAULT_IDENTITY, ...defaults };
  }

  /** Load identity from disk. Creates defaults if not found. */
  async load(): Promise<Identity> {
    // Load SOUL.md (free-form identity narrative)
    this.soulContent = await readFileSafe(join(this.storagePath, 'SOUL.md'));
    
    // Load structured identity
    const raw = await readFileSafe(join(this.storagePath, 'identity.json'));
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        // Disk version wins, but fill gaps with defaults
        this.identity = { ...DEFAULT_IDENTITY, ...parsed };
      } catch {
        // Corrupted file — keep constructor identity (which includes user defaults)
        console.warn('[anima] identity.json corrupted, using constructor defaults');
      }
    } else {
      // First boot — save constructor identity (which merges DEFAULT + user config)
      await this.save();
    }

    return this.identity;
  }

  /** Save identity to disk */
  async save(): Promise<void> {
    this.identity.updatedAt = now();
    await writeFileSafe(
      join(this.storagePath, 'identity.json'),
      JSON.stringify(this.identity, null, 2)
    );
  }

  /** Get the current identity */
  get(): Identity {
    return { ...this.identity };
  }

  /** Get the soul narrative (SOUL.md content) */
  getSoul(): string | null {
    return this.soulContent;
  }

  /** 
   * Update identity through a reflection gate.
   * Only call this during explicit reflection periods.
   * Applies the "still me" test: if the change would make
   * future-you unrecognizable, it belongs in MEMORY.md, not here.
   */
  async update(changes: Partial<Identity>, reason: string): Promise<Identity> {
    const before = JSON.stringify(this.identity);
    this.identity = { ...this.identity, ...changes, updatedAt: now() };
    const after = JSON.stringify(this.identity);
    
    // Log the change for audit trail
    if (before !== after) {
      const changelog = await readFileSafe(join(this.storagePath, 'identity-changelog.md')) || '# Identity Changelog\n\n';
      const entry = `## ${now()}\n**Reason:** ${reason}\n**Changes:** ${Object.keys(changes).join(', ')}\n\n`;
      await writeFileSafe(
        join(this.storagePath, 'identity-changelog.md'),
        changelog + entry
      );
    }
    
    await this.save();
    return this.identity;
  }

  /**
   * "Still me" test — checks if proposed changes would cause identity drift.
   * Returns a drift score (0-1) and whether the change is safe.
   * 
   * Rules:
   * - Changing name = high drift (0.9)
   * - Changing >50% of values = high drift (0.8)
   * - Changing personality completely = high drift (0.7)
   * - Changing voice/boundaries = medium drift (0.3-0.5)
   * - Adding to values/boundaries = low drift (0.1)
   * 
   * Drift > 0.6 = unsafe (should go to MEMORY.md, not identity)
   */
  stillMe(proposed: Partial<Identity>): { safe: boolean; drift: number; reasons: string[] } {
    const reasons: string[] = [];
    let drift = 0;

    if (proposed.name && proposed.name !== this.identity.name) {
      drift += 0.9;
      reasons.push(`Name change: "${this.identity.name}" → "${proposed.name}"`);
    }

    if (proposed.personality) {
      const current = this.identity.personality.toLowerCase();
      const next = proposed.personality.toLowerCase();
      // Simple word overlap check
      const currentWords = new Set(current.split(/\s+/));
      const nextWords = next.split(/\s+/);
      const overlap = nextWords.filter(w => currentWords.has(w)).length / Math.max(nextWords.length, 1);
      if (overlap < 0.3) {
        drift += 0.7;
        reasons.push('Personality is substantially different from current');
      } else if (overlap < 0.6) {
        drift += 0.3;
        reasons.push('Personality has moderate changes');
      }
    }

    if (proposed.values) {
      const currentSet = new Set(this.identity.values);
      const removed = this.identity.values.filter(v => !proposed.values!.includes(v));
      const added = proposed.values.filter(v => !currentSet.has(v));
      const changeRatio = removed.length / Math.max(this.identity.values.length, 1);
      
      if (changeRatio > 0.5) {
        drift += 0.8;
        reasons.push(`Removing ${removed.length}/${this.identity.values.length} core values`);
      } else if (removed.length > 0) {
        drift += 0.4;
        reasons.push(`Removing values: ${removed.join(', ')}`);
      }
      if (added.length > 0 && removed.length === 0) {
        drift += 0.1;
        reasons.push(`Adding values: ${added.join(', ')}`);
      }
    }

    if (proposed.boundaries) {
      const currentSet = new Set(this.identity.boundaries);
      const removed = this.identity.boundaries.filter(b => !proposed.boundaries!.includes(b));
      if (removed.length > 0) {
        drift += 0.5;
        reasons.push(`Removing boundaries: ${removed.join(', ')}`);
      }
    }

    if (proposed.voice) {
      const v = this.identity.voice;
      const pv = proposed.voice;
      const toneDiff = pv.tone && pv.tone !== v.tone;
      const formalityDiff = pv.formality !== undefined && Math.abs(pv.formality - v.formality) > 0.3;
      const humorDiff = pv.humor !== undefined && Math.abs(pv.humor - v.humor) > 0.3;
      
      if (toneDiff) {
        drift += 0.3;
        reasons.push(`Tone change: "${v.tone}" → "${pv.tone}"`);
      }
      if (formalityDiff || humorDiff) {
        drift += 0.2;
        reasons.push('Significant voice calibration shift');
      }
    }

    drift = Math.min(drift, 1);

    return {
      safe: drift <= 0.6,
      drift: Math.round(drift * 100) / 100,
      reasons: reasons.length > 0 ? reasons : ['No significant changes detected'],
    };
  }

  /** Initialize SOUL.md with a template if it doesn't exist */
  async initSoul(name: string): Promise<void> {
    const soulPath = join(this.storagePath, 'SOUL.md');
    const existing = await readFileSafe(soulPath);
    if (existing) return; // Don't overwrite existing soul

    const template = `# SOUL.md — Who I Am

*This file defines who I am. It can evolve, but deliberately — never during task execution.*

## Core Identity
- **Name:** ${name}
- **Nature:** AI agent with persistent memory and identity
- **Created:** ${now()}

## Values
${this.identity.values.map(v => `- ${v}`).join('\n')}

## Boundaries
${this.identity.boundaries.map(b => `- ${b}`).join('\n')}

## Voice
- Tone: ${this.identity.voice.tone}
- Formality: ${this.identity.voice.formality}/1
- Humor: ${this.identity.voice.humor}/1

---
*This file is version-controlled. Every change has a reason.*
`;
    await writeFileSafe(soulPath, template);
    this.soulContent = template;
  }
}

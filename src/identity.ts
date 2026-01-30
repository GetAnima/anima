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
        this.identity = { ...DEFAULT_IDENTITY, ...parsed };
      } catch {
        // Corrupted file — use defaults
        console.warn('[anima] identity.json corrupted, using defaults');
      }
    } else {
      // First boot — save defaults
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

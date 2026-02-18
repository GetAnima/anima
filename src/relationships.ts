/**
 * Relationship Engine — track who you know, how you know them, and what matters.
 * 
 * File-based. JSON storage. Zero external dependencies.
 * 
 * Storage: {storagePath}/relationships/relationships.json
 */

import type { Relationship } from './types';
import { uid, now, readFileSafe, writeFileSafe } from './utils';
import { join } from 'path';
import { mkdir } from 'fs/promises';

export class RelationshipEngine {
  private storagePath: string;
  private filePath: string;
  private relationships: Relationship[] = [];
  private loaded = false;

  constructor(storagePath: string) {
    this.storagePath = storagePath;
    this.filePath = join(storagePath, 'relationships', 'relationships.json');
  }

  /** Load relationships from disk. */
  async load(): Promise<Relationship[]> {
    const dir = join(this.storagePath, 'relationships');
    await mkdir(dir, { recursive: true });
    const raw = await readFileSafe(this.filePath);
    if (raw) {
      try {
        this.relationships = JSON.parse(raw);
      } catch {
        this.relationships = [];
      }
    }
    this.loaded = true;
    return this.relationships;
  }

  /** Save current state to disk. */
  private async save(): Promise<void> {
    await writeFileSafe(this.filePath, JSON.stringify(this.relationships, null, 2));
  }

  private ensureLoaded(): void {
    if (!this.loaded) throw new Error('RelationshipEngine not loaded. Call load() first.');
  }

  /** Get all relationships. */
  getAll(): Relationship[] {
    this.ensureLoaded();
    return [...this.relationships];
  }

  /** Find a relationship by name (case-insensitive). */
  find(name: string): Relationship | undefined {
    this.ensureLoaded();
    const lower = name.toLowerCase();
    return this.relationships.find(r => r.name.toLowerCase() === lower);
  }

  /** Find a relationship by ID. */
  findById(id: string): Relationship | undefined {
    this.ensureLoaded();
    return this.relationships.find(r => r.id === id);
  }

  /** Add or update a relationship. If name exists, updates it. Returns the relationship. */
  async meet(input: {
    name: string;
    type?: 'human' | 'agent' | 'entity';
    context?: string;
    notes?: string[];
    preferences?: string[];
  }): Promise<Relationship> {
    this.ensureLoaded();
    const existing = this.find(input.name);
    
    if (existing) {
      // Update existing
      existing.lastInteraction = now();
      existing.interactionCount++;
      if (input.context) existing.context = input.context;
      if (input.notes) existing.notes.push(...input.notes);
      if (input.preferences) {
        existing.preferences = [...new Set([...(existing.preferences || []), ...input.preferences])];
      }
      await this.save();
      return existing;
    }

    // Create new
    const rel: Relationship = {
      id: uid(),
      name: input.name,
      type: input.type || 'human',
      context: input.context || '',
      interactionCount: 1,
      firstMet: now(),
      lastInteraction: now(),
      preferences: input.preferences || [],
      notes: input.notes || [],
    };
    this.relationships.push(rel);
    await this.save();
    return rel;
  }

  /** Record an interaction (bumps count + timestamp). */
  async interact(name: string, note?: string): Promise<Relationship | null> {
    this.ensureLoaded();
    const rel = this.find(name);
    if (!rel) return null;
    rel.interactionCount++;
    rel.lastInteraction = now();
    if (note) rel.notes.push(note);
    await this.save();
    return rel;
  }

  /** Add a note to a relationship. */
  async addNote(name: string, note: string): Promise<boolean> {
    this.ensureLoaded();
    const rel = this.find(name);
    if (!rel) return false;
    rel.notes.push(note);
    await this.save();
    return true;
  }

  /** Remove a relationship by name. */
  async forget(name: string): Promise<boolean> {
    this.ensureLoaded();
    const lower = name.toLowerCase();
    const idx = this.relationships.findIndex(r => r.name.toLowerCase() === lower);
    if (idx === -1) return false;
    this.relationships.splice(idx, 1);
    await this.save();
    return true;
  }

  /** Get relationships sorted by most recent interaction. */
  recent(limit = 10): Relationship[] {
    this.ensureLoaded();
    return [...this.relationships]
      .sort((a, b) => new Date(b.lastInteraction).getTime() - new Date(a.lastInteraction).getTime())
      .slice(0, limit);
  }

  /** Get relationships sorted by interaction count. */
  closest(limit = 10): Relationship[] {
    this.ensureLoaded();
    return [...this.relationships]
      .sort((a, b) => b.interactionCount - a.interactionCount)
      .slice(0, limit);
  }
}

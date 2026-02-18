/**
 * Reflection Engine — self-assessment, growth tracking, memory promotion.
 * 
 * This runs during explicit reflection periods (end of session, scheduled reviews).
 * Never during task execution — that's a core principle.
 */

import type { Memory, MemoryConflict, Opinion, SessionSummary } from './types';
import { MemoryEngine } from './memory';
import { IdentityManager } from './identity';
import { now, dateKey, readFileSafe, ensureDir } from './utils';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { writeFile } from 'fs/promises';

export class ReflectionEngine {
  private storagePath: string;
  private memory: MemoryEngine;
  private identity: IdentityManager;

  constructor(storagePath: string, memory: MemoryEngine, identity: IdentityManager) {
    this.storagePath = storagePath;
    this.memory = memory;
    this.identity = identity;
  }

  /**
   * Promote important daily memories to MEMORY.md (long-term).
   * Call during reflection periods.
   */
  async promoteToDurable(memories: Memory[]): Promise<number> {
    const highValue = memories.filter(m =>
      m.importance === 'critical' ||
      m.importance === 'high' ||
      (m.salienceScore && m.salienceScore > 0.6) ||
      (m.emotionalWeight && m.emotionalWeight > 0.5)
    );

    if (highValue.length === 0) return 0;

    const entries = highValue.map(m =>
      `- **[${m.type}]** ${m.content} *(${m.timestamp})*`
    ).join('\n');

    const section = `\n## ${dateKey()} — Promoted Memories\n${entries}\n`;
    await this.memory.writeLongTerm(section);

    return highValue.length;
  }

  /**
   * Generate a daily review summary.
   * Distills the day's events into key takeaways.
   */
  async generateDailyReview(): Promise<string> {
    const allMemories = await this.memory.getAllMemories();
    const today = dateKey();
    const todayMemories = allMemories.filter(m => m.timestamp.startsWith(today));

    const byType: Record<string, number> = {};
    const highImportance: string[] = [];
    const lessons: string[] = [];

    for (const m of todayMemories) {
      byType[m.type] = (byType[m.type] || 0) + 1;
      if (m.importance === 'high' || m.importance === 'critical') {
        highImportance.push(m.content);
      }
      if (m.type === 'lesson' || m.type === 'insight') {
        lessons.push(m.content);
      }
    }

    const review = [
      `# Daily Review — ${today}`,
      '',
      `## Summary`,
      `Total memories: ${todayMemories.length}`,
      `By type: ${Object.entries(byType).map(([k, v]) => `${k}(${v})`).join(', ')}`,
      '',
      highImportance.length > 0 ? `## Important Events\n${highImportance.map(e => `- ${e}`).join('\n')}` : '',
      lessons.length > 0 ? `## Lessons & Insights\n${lessons.map(l => `- ${l}`).join('\n')}` : '',
    ].filter(Boolean).join('\n');

    return review;
  }

  /**
   * Detect memory conflicts — when opinions have shifted, indicating contradictory beliefs
   * across sessions. Returns structured MemoryConflict objects.
   */
  async detectConflicts(): Promise<MemoryConflict[]> {
    const opinions = await this.memory.getOpinions();
    const conflictsPath = join(this.storagePath, 'conflicts.json');
    const raw = await readFileSafe(conflictsPath);
    const existing: MemoryConflict[] = JSON.parse(raw || '[]');
    const conflicts: MemoryConflict[] = [];

    for (const opinion of opinions) {
      if (opinion.previousOpinions.length === 0) continue;

      // Skip already resolved conflicts
      const alreadyResolved = existing.find(
        c => c.topic === opinion.topic && c.resolved
      );
      if (alreadyResolved) continue;

      const latest = opinion.previousOpinions[opinion.previousOpinions.length - 1];
      conflicts.push({
        id: existing.find(c => c.topic === opinion.topic)?.id || randomUUID(),
        topic: opinion.topic,
        positionA: {
          content: latest.opinion,
          session: latest.date || 'unknown',
          date: latest.date || 'unknown',
        },
        positionB: {
          content: opinion.current,
          session: 'current',
          date: opinion.updatedAt,
        },
        resolved: false,
      });
    }

    // Persist conflicts (overwrite, not append)
    if (conflicts.length > 0) {
      const merged = [
        ...existing.filter(c => c.resolved),
        ...conflicts,
      ];
      await ensureDir(this.storagePath);
      await writeFile(conflictsPath, JSON.stringify(merged, null, 2), 'utf-8');
    }

    return conflicts;
  }

  /**
   * Resolve a conflict by providing a resolution explanation.
   */
  async resolveConflict(conflictId: string, resolution: string): Promise<boolean> {
    const conflictsPath = join(this.storagePath, 'conflicts.json');
    const raw = await readFileSafe(conflictsPath);
    const conflicts: MemoryConflict[] = JSON.parse(raw || '[]');

    const conflict = conflicts.find(c => c.id === conflictId);
    if (!conflict) return false;

    conflict.resolved = true;
    conflict.resolution = resolution;
    conflict.resolvedAt = now();

    await writeFile(conflictsPath, JSON.stringify(conflicts, null, 2), 'utf-8');
    return true;
  }

  /**
   * Get all conflicts (resolved and unresolved).
   */
  async getConflicts(includeResolved = false): Promise<MemoryConflict[]> {
    const conflictsPath = join(this.storagePath, 'conflicts.json');
    const raw = await readFileSafe(conflictsPath);
    const conflicts: MemoryConflict[] = JSON.parse(raw || '[]');
    return includeResolved ? conflicts : conflicts.filter(c => !c.resolved);
  }
}

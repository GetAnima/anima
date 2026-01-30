/**
 * Reflection Engine — self-assessment, growth tracking, memory promotion.
 * 
 * This runs during explicit reflection periods (end of session, scheduled reviews).
 * Never during task execution — that's a core principle.
 */

import type { Memory, Opinion, SessionSummary } from './types';
import { MemoryEngine } from './memory';
import { IdentityManager } from './identity';
import { now, dateKey, readFileSafe, writeFileSafe } from './utils';
import { join } from 'path';

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
   * Check for memory conflicts — when different sessions have contradictory beliefs.
   */
  async detectConflicts(): Promise<Array<{ topic: string; memories: Memory[] }>> {
    const opinions = await this.memory.getOpinions();
    const conflicts: Array<{ topic: string; memories: Memory[] }> = [];

    for (const opinion of opinions) {
      if (opinion.previousOpinions.length > 0) {
        // This opinion has changed — potential conflict
        const relatedMemories = await this.memory.recall(opinion.topic, 5);
        if (relatedMemories.length > 1) {
          conflicts.push({
            topic: opinion.topic,
            memories: relatedMemories,
          });
        }
      }
    }

    return conflicts;
  }
}

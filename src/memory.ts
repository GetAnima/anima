/**
 * Memory Engine — storage, retrieval, consolidation, and decay.
 * 
 * File-based. Markdown-native. Zero external dependencies.
 * 
 * Storage layout:
 *   {storagePath}/
 *     SOUL.md              — immutable identity
 *     NOW.md               — lifeboat (20-line emergency context)
 *     MEMORY.md            — curated long-term memory
 *     identity.json        — structured identity data
 *     memory/
 *       YYYY-MM-DD.md      — daily logs
 *       memories.json      — structured memory index
 *     opinions/
 *       opinions.json      — opinion tracker
 */

import type { Memory, MemoryType, MemoryTier, ImportanceLevel, Checkpoint, DecayConfig, Opinion } from './types';
import { uid, now, dateKey, yesterdayKey, readFileSafe, writeFileSafe, appendFileSafe, listFiles, memoryToMarkdown, calculateSalience, calculateDecay } from './utils';
import { join } from 'path';

const DEFAULT_DECAY: DecayConfig = {
  procedural: 0.0003,
  semantic: 0.001,
  episodic: 0.003,
};

export class MemoryEngine {
  private storagePath: string;
  private memoryDir: string;
  private decayConfig: DecayConfig;
  private memories: Memory[] = [];
  private opinions: Opinion[] = [];
  private sessionId: string;

  constructor(storagePath: string, sessionId: string, decayConfig?: Partial<DecayConfig>) {
    this.storagePath = storagePath;
    this.memoryDir = join(storagePath, 'memory');
    this.sessionId = sessionId;
    this.decayConfig = { ...DEFAULT_DECAY, ...decayConfig };
  }

  // ============ CORE: Remember ============

  /** Store a new memory. Writes to daily log AND structured index. */
  async remember(input: {
    content: string;
    type?: MemoryType;
    importance?: ImportanceLevel;
    tags?: string[];
    emotionalWeight?: number;
  }): Promise<Memory> {
    const memory: Memory = {
      id: uid(),
      type: input.type || 'event',
      content: input.content,
      importance: input.importance || 'medium',
      tier: 'hot',
      tags: input.tags || [],
      timestamp: now(),
      sessionId: this.sessionId,
      salienceScore: undefined,
      emotionalWeight: input.emotionalWeight || 0,
      accessCount: 0,
      crossDomainAccess: false,
      decayScore: 0,
    };

    // Score salience
    memory.salienceScore = calculateSalience({
      novelty: this.estimateNovelty(memory),
      retention: 0, // new memory, no retention yet
      momentum: 1,  // just created = max momentum
      continuity: this.estimateContinuity(memory),
      effort: this.estimateEffort(memory),
    });

    // Promote to critical tier if needed
    if (memory.importance === 'critical' || (memory.salienceScore && memory.salienceScore > 0.8)) {
      memory.tier = 'hot';
    }

    // Write to daily log (markdown, human-readable)
    const dailyPath = join(this.memoryDir, `${dateKey()}.md`);
    await appendFileSafe(dailyPath, memoryToMarkdown(memory));

    // Write to structured index
    this.memories.push(memory);
    await this.saveIndex();

    return memory;
  }

  // ============ CORE: Recall ============

  /** Search memories by keyword matching. Returns ranked results. */
  async recall(query: string, limit: number = 10): Promise<Memory[]> {
    await this.loadIndex();
    
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    const scored = this.memories
      .map(memory => {
        const contentLower = memory.content.toLowerCase();
        const tagsLower = memory.tags.map(t => t.toLowerCase());
        
        // Simple relevance: word match count + tag match
        let wordMatchScore = 0;
        for (const word of queryWords) {
          if (contentLower.includes(word)) wordMatchScore += 1;
          if (tagsLower.some(t => t.includes(word))) wordMatchScore += 2;
        }
        
        // No word matches = not relevant, skip entirely
        if (wordMatchScore === 0) return { memory, score: 0 };

        let score = wordMatchScore;

        // Boost by importance (only if words matched)
        const importanceBoost = { low: 0, medium: 0.5, high: 1, critical: 2 };
        score += importanceBoost[memory.importance] || 0;

        // Boost by recency (memories from today score higher)
        const ageMs = Date.now() - new Date(memory.timestamp).getTime();
        const ageHours = ageMs / (1000 * 60 * 60);
        if (ageHours < 24) score += 1;
        if (ageHours < 1) score += 2;

        // Boost by salience
        score += (memory.salienceScore || 0) * 2;

        // Track access
        memory.accessCount = (memory.accessCount || 0) + 1;

        return { memory, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Save updated access counts
    if (scored.length > 0) {
      await this.saveIndex();
    }

    return scored.map(({ memory }) => memory);
  }

  // ============ CORE: Lifeboat (NOW.md) ============

  /** Update the NOW.md lifeboat — call every 2 significant actions */
  async updateLifeboat(checkpoint: Checkpoint): Promise<void> {
    const content = `# NOW.md — Lifeboat
*If you wake up with zero context, read this first.*
*Updated: ${checkpoint.updatedAt}*

## Active Task
${checkpoint.activeTask}

## Status
${checkpoint.status}

## Resume Point
${checkpoint.resumePoint}

${checkpoint.openThreads?.length ? `## Open Threads\n${checkpoint.openThreads.map(t => `- ${t}`).join('\n')}` : ''}

${checkpoint.keyContext?.length ? `## Key Context\n${checkpoint.keyContext.map(c => `- ${c}`).join('\n')}` : ''}

${checkpoint.emergency ? '⚠️ **EMERGENCY FLAG SET** — Something critical was happening when this was saved.' : ''}
`;
    await writeFileSafe(join(this.storagePath, 'NOW.md'), content);
  }

  /** Read the current lifeboat */
  async readLifeboat(): Promise<string | null> {
    return readFileSafe(join(this.storagePath, 'NOW.md'));
  }

  /** Write raw content to lifeboat (for preserving hand-written content) */
  async writeLifeboatRaw(content: string): Promise<void> {
    await writeFileSafe(join(this.storagePath, 'NOW.md'), content);
  }

  // ============ CORE: Daily Log ============

  /** Read today's daily log */
  async readDailyLog(date?: string): Promise<string | null> {
    const key = date || dateKey();
    return readFileSafe(join(this.memoryDir, `${key}.md`));
  }

  /** Read yesterday's daily log */
  async readYesterdayLog(): Promise<string | null> {
    return readFileSafe(join(this.memoryDir, `${yesterdayKey()}.md`));
  }

  // ============ CORE: Long-term Memory ============

  /** Read MEMORY.md (curated long-term memory) */
  async readLongTerm(): Promise<string | null> {
    return readFileSafe(join(this.storagePath, 'MEMORY.md'));
  }

  /** Append to MEMORY.md */
  async writeLongTerm(content: string): Promise<void> {
    await appendFileSafe(join(this.storagePath, 'MEMORY.md'), '\n' + content + '\n');
  }

  // ============ CURATION ============

  /**
   * Curate — review raw memories and distill what matters into MEMORY.md.
   * 
   * This is the missing piece most agents skip. Storage is easy. Retrieval is solved.
   * But without periodic curation, you either drown in noise or lose everything.
   * 
   * Call this periodically (e.g., during heartbeats, daily reflection).
   * 
   * Strategy:
   * 1. Scan memories from the last N hours
   * 2. Filter for high-salience, high-importance items
   * 3. Deduplicate against existing long-term memory
   * 4. Append curated insights to MEMORY.md
   * 5. Return what was curated (so agents can review/edit)
   */
  async curate(options?: {
    hoursBack?: number;
    minImportance?: ImportanceLevel;
    minSalience?: number;
    dryRun?: boolean;
  }): Promise<{ curated: Memory[]; written: boolean }> {
    const {
      hoursBack = 48,
      minImportance = 'medium',
      minSalience = 0.5,
      dryRun = false,
    } = options || {};

    await this.loadIndex();

    const importanceRank: Record<ImportanceLevel, number> = {
      low: 0,
      medium: 1,
      high: 2,
      critical: 3,
    };

    const cutoff = Date.now() - (hoursBack * 60 * 60 * 1000);

    // Step 1: Filter memories worth curating
    const candidates = this.memories.filter(m => {
      const age = new Date(m.timestamp).getTime();
      if (age < cutoff) return false;
      if (importanceRank[m.importance] < importanceRank[minImportance]) return false;
      if ((m.salienceScore ?? 0.5) < minSalience) return false;
      // Skip system/boot events
      if (m.tags?.includes('system') || m.tags?.includes('boot')) return false;
      return true;
    });

    if (candidates.length === 0) {
      return { curated: [], written: false };
    }

    // Step 2: Deduplicate against existing long-term memory
    const existing = await this.readLongTerm();
    const curated = existing
      ? candidates.filter(m => !existing.includes(m.content.slice(0, 50)))
      : candidates;

    if (curated.length === 0 || dryRun) {
      return { curated, written: false };
    }

    // Step 3: Format and write to MEMORY.md
    const header = `\n## Curated — ${dateKey()}\n`;
    const entries = curated
      .sort((a, b) => importanceRank[b.importance] - importanceRank[a.importance])
      .map(m => {
        const tags = m.tags?.length ? ` [${m.tags.join(', ')}]` : '';
        return `- ${m.content}${tags}`;
      })
      .join('\n');

    await this.writeLongTerm(header + entries);

    // Mark curated memories so they aren't re-curated
    for (const m of curated) {
      m.tags = [...(m.tags || []), 'curated'];
    }
    await this.saveIndex();

    return { curated, written: true };
  }

  // ============ MEMORY DECAY ============

  /** Run decay on all memories. Call during reflection/sleep. */
  async runDecay(): Promise<{ decayed: number; archived: number; kept: number }> {
    await this.loadIndex();
    
    let decayed = 0;
    let archived = 0;
    let kept = 0;

    for (const memory of this.memories) {
      const ageMs = Date.now() - new Date(memory.timestamp).getTime();
      const ageHours = ageMs / (1000 * 60 * 60);

      memory.decayScore = calculateDecay({
        type: memory.type,
        ageHours,
        accessCount: memory.accessCount || 0,
        emotionalWeight: memory.emotionalWeight || 0,
        decayRates: this.decayConfig,
      });

      // Recalculate salience with updated decay
      memory.salienceScore = calculateSalience({
        novelty: this.estimateNovelty(memory),
        retention: Math.min(1, (memory.accessCount || 0) * 0.2),
        momentum: Math.max(0, 1 - (ageHours / 168)), // decays over a week
        continuity: this.estimateContinuity(memory),
        effort: this.estimateEffort(memory),
      });

      // Apply tier transitions
      if (memory.salienceScore < 0.2 && memory.importance !== 'critical') {
        if (memory.tier !== 'archived') {
          memory.tier = 'archived';
          archived++;
        } else {
          decayed++;
        }
      } else if (memory.salienceScore < 0.5) {
        memory.tier = 'cold';
        kept++;
      } else if (memory.salienceScore < 0.7) {
        memory.tier = 'warm';
        kept++;
      } else {
        memory.tier = 'hot';
        kept++;
      }
    }

    // Remove fully decayed memories (archived + salience near 0)
    this.memories = this.memories.filter(m => 
      m.tier !== 'archived' || m.salienceScore! > 0.05 || m.importance === 'critical'
    );

    await this.saveIndex();
    return { decayed, archived, kept };
  }

  // ============ OPINIONS ============

  /** Record or update an opinion */
  async opine(input: { topic: string; opinion: string; confidence: number }): Promise<Opinion> {
    await this.loadOpinions();

    const existing = this.opinions.find(o => o.topic.toLowerCase() === input.topic.toLowerCase());

    if (existing) {
      // Track opinion evolution
      existing.previousOpinions.push({
        opinion: existing.current,
        confidence: existing.confidence,
        date: existing.updatedAt,
        reasonForChange: `Updated to: ${input.opinion}`,
      });
      existing.current = input.opinion;
      existing.confidence = input.confidence;
      existing.updatedAt = now();
    } else {
      const newOpinion: Opinion = {
        id: uid(),
        topic: input.topic,
        current: input.opinion,
        confidence: input.confidence,
        formedAt: now(),
        updatedAt: now(),
        previousOpinions: [],
      };
      this.opinions.push(newOpinion);
    }

    await this.saveOpinions();
    return existing || this.opinions[this.opinions.length - 1];
  }

  /** Get all opinions */
  async getOpinions(): Promise<Opinion[]> {
    await this.loadOpinions();
    return [...this.opinions];
  }

  // ============ PRE-COMPACTION HOOK ============

  /** Emergency flush — call before context compression */
  async emergencyFlush(context: {
    activeTask?: string;
    criticalState?: string;
    unsavedMemories?: string[];
  }): Promise<void> {
    // Save lifeboat
    await this.updateLifeboat({
      activeTask: context.activeTask || 'Unknown — emergency flush triggered',
      status: 'in-progress',
      resumePoint: 'Resumed from emergency flush',
      keyContext: context.unsavedMemories || [],
      emergency: true,
      updatedAt: now(),
    });

    // Save any unsaved memories
    if (context.unsavedMemories) {
      for (const content of context.unsavedMemories) {
        await this.remember({
          content: `[EMERGENCY FLUSH] ${content}`,
          type: 'event',
          importance: 'high',
          tags: ['emergency-flush', 'pre-compaction'],
        });
      }
    }

    // Force save index
    await this.saveIndex();
  }

  // ============ INTERNAL ============

  /** Get all memories (for boot context) */
  async getRecentMemories(hours: number = 48): Promise<Memory[]> {
    await this.loadIndex();
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    return this.memories
      .filter(m => new Date(m.timestamp).getTime() > cutoff)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /** Get all memories */
  async getAllMemories(): Promise<Memory[]> {
    await this.loadIndex();
    return [...this.memories];
  }

  /** Public index loader for quickLoad (no boot event) */
  async loadIndexPublic(): Promise<void> {
    await this.loadIndex();
    await this.loadOpinions();
  }

  private async loadIndex(): Promise<void> {
    const raw = await readFileSafe(join(this.memoryDir, 'memories.json'));
    if (raw) {
      try {
        this.memories = JSON.parse(raw);
      } catch {
        this.memories = [];
      }
    }
  }

  private async saveIndex(): Promise<void> {
    await writeFileSafe(
      join(this.memoryDir, 'memories.json'),
      JSON.stringify(this.memories, null, 2)
    );
  }

  private async loadOpinions(): Promise<void> {
    const raw = await readFileSafe(join(this.storagePath, 'opinions', 'opinions.json'));
    if (raw) {
      try {
        this.opinions = JSON.parse(raw);
      } catch {
        this.opinions = [];
      }
    }
  }

  private async saveOpinions(): Promise<void> {
    await writeFileSafe(
      join(this.storagePath, 'opinions', 'opinions.json'),
      JSON.stringify(this.opinions, null, 2)
    );
  }

  private estimateNovelty(memory: Memory): number {
    // Simple heuristic: longer content = potentially more novel
    const lengthScore = Math.min(1, memory.content.length / 500);
    // Critical/emotional = more novel
    const importanceBoost = memory.importance === 'critical' ? 0.3 : 0;
    const emotionalBoost = (memory.emotionalWeight || 0) * 0.2;
    return Math.min(1, lengthScore + importanceBoost + emotionalBoost);
  }

  private estimateContinuity(memory: Memory): number {
    // How connected is this to other memories?
    // Simple: check tag overlap
    if (memory.tags.length === 0) return 0.1;
    const taggedMemories = this.memories.filter(m =>
      m.id !== memory.id && m.tags.some(t => memory.tags.includes(t))
    );
    return Math.min(1, taggedMemories.length * 0.2);
  }

  private estimateEffort(memory: Memory): number {
    // How costly is this memory to reconstruct?
    // Simple: longer = more effort, more tags = less effort (better indexed)
    const lengthCost = Math.min(0.5, memory.content.length / 1000);
    const tagBenefit = Math.min(0.3, memory.tags.length * 0.1);
    return Math.max(0, lengthCost - tagBenefit);
  }
}

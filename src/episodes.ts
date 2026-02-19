/**
 * Episodic Memory Engine — structured records of experiences.
 * 
 * Unlike flat memories, episodes capture the full context of an experience:
 * who was involved, what happened, how important it was, what was learned,
 * and how it connects to other memories, opinions, and knowledge.
 * 
 * Episodes decay based on importance and emotional weight.
 * High-importance episodes get promoted to semantic knowledge automatically.
 * 
 * Zero external dependencies. File-based persistence.
 */

import type { Episode, EpisodeInput, EpisodeQuery, EpisodeStats, KnowledgeEntry, KnowledgeInput } from './types';
import { uid, now, dateKey, readFileSafe, writeFileSafe, ensureDir, listFiles } from './utils';
import {
  validateString, validateOptionalString, validateStringArray,
  validateNumber, validateConfidence, validateStoragePath,
  validateSubPath, validateEnum, LIMITS, AnimaValidationError
} from './validation';
import { join } from 'path';

/** Limits specific to episodes */
const EPISODE_LIMITS = {
  MAX_EPISODES: 50_000,
  MAX_TITLE_LENGTH: 500,
  MAX_SUMMARY_LENGTH: 50_000,
  MAX_LESSONS: 50,
  MAX_LESSON_LENGTH: 2_000,
  MAX_PARTICIPANTS: 100,
  MAX_CONNECTIONS: 200,
  MAX_KNOWLEDGE_ENTRIES: 50_000,
  MAX_INSIGHT_LENGTH: 10_000,
  MAX_TOPIC_LENGTH: 500,
  MAX_SOURCE_REFS: 50,
} as const;

export class EpisodicMemory {
  private storagePath: string;
  private episodesDir: string;
  private knowledgeDir: string;
  private episodes: Episode[] = [];
  private knowledge: KnowledgeEntry[] = [];
  private loaded = false;
  private knowledgeLoaded = false;

  constructor(storagePath: string) {
    this.storagePath = validateStoragePath(storagePath);
    this.episodesDir = join(this.storagePath, 'memory', 'episodes');
    this.knowledgeDir = join(this.storagePath, 'memory', 'knowledge');
  }

  // ============ EPISODES: Record ============

  /**
   * Record a new episode — a structured experience.
   * 
   * @example
   * ```ts
   * await episodes.record({
   *   title: 'Customer escalation resolved',
   *   summary: 'User was frustrated about billing. De-escalated with empathy first.',
   *   emotionalWeight: 0.7,
   *   participants: ['user-123'],
   *   tags: ['customer-service', 'conflict'],
   *   lessons: ['Empathy before solutions works better than jumping to fixes'],
   * });
   * ```
   */
  async record(input: EpisodeInput): Promise<Episode> {
    await this.load();

    // Validate all inputs
    const title = validateString(input.title, 'title', { maxLength: EPISODE_LIMITS.MAX_TITLE_LENGTH });
    const summary = validateString(input.summary, 'summary', { maxLength: EPISODE_LIMITS.MAX_SUMMARY_LENGTH });
    const emotionalWeight = input.emotionalWeight !== undefined
      ? validateConfidence(input.emotionalWeight, 'emotionalWeight')
      : 0.5;
    const participants = input.participants
      ? validateStringArray(input.participants, 'participants', {
          maxItems: EPISODE_LIMITS.MAX_PARTICIPANTS,
          maxItemLength: LIMITS.MAX_NAME_LENGTH,
        })
      : [];
    const tags = input.tags
      ? validateStringArray(input.tags, 'tags', {
          maxItems: LIMITS.MAX_TAGS,
          maxItemLength: LIMITS.MAX_TAG_LENGTH,
        })
      : [];
    const lessons = input.lessons
      ? validateStringArray(input.lessons, 'lessons', {
          maxItems: EPISODE_LIMITS.MAX_LESSONS,
          maxItemLength: EPISODE_LIMITS.MAX_LESSON_LENGTH,
        })
      : [];
    const connections = input.connections
      ? this.validateConnections(input.connections)
      : { episodeIds: [], opinionIds: [], memoryIds: [] };

    // Enforce episode limit
    if (this.episodes.length >= EPISODE_LIMITS.MAX_EPISODES) {
      // Auto-archive lowest importance episodes
      const archivable = this.episodes
        .filter(e => !e.archived && e.importance < 0.3)
        .sort((a, b) => a.importance - b.importance);
      if (archivable.length > 0) {
        archivable[0].archived = true;
        archivable[0].archivedAt = now();
      } else {
        throw new AnimaValidationError('episodes', `maximum of ${EPISODE_LIMITS.MAX_EPISODES} episodes reached`);
      }
    }

    const episode: Episode = {
      id: `ep-${uid()}`,
      title,
      summary,
      timestamp: input.timestamp || now(),
      emotionalWeight,
      importance: this.calculateImportance(emotionalWeight, lessons.length, connections, participants.length),
      participants,
      tags,
      lessons,
      connections,
      accessCount: 0,
      archived: false,
      createdAt: now(),
      updatedAt: now(),
    };

    this.episodes.push(episode);
    await this.save();

    // Auto-extract lessons to knowledge if episode is important enough
    if (episode.importance >= 0.6 && lessons.length > 0) {
      for (const lesson of lessons) {
        await this.learn({
          topic: this.extractTopicFromLesson(lesson, tags),
          insight: lesson,
          confidence: Math.min(0.9, episode.importance),
          sourceEpisodeIds: [episode.id],
          tags,
        });
      }
    }

    return episode;
  }

  // ============ EPISODES: Query ============

  /**
   * Search episodes by various criteria.
   * Returns episodes sorted by relevance (importance * recency * match).
   */
  async query(q: EpisodeQuery): Promise<Episode[]> {
    await this.load();

    let results = this.episodes.filter(e => !e.archived);

    // Filter by text search (title + summary + lessons)
    if (q.text) {
      const textLower = q.text.toLowerCase();
      const words = textLower.split(/\s+/).filter(w => w.length > 2);
      results = results.filter(e => {
        const searchable = `${e.title} ${e.summary} ${e.lessons.join(' ')}`.toLowerCase();
        return words.some(w => searchable.includes(w));
      });
    }

    // Filter by tags
    if (q.tags && q.tags.length > 0) {
      const queryTags = q.tags.map(t => t.toLowerCase());
      results = results.filter(e =>
        e.tags.some(t => queryTags.includes(t.toLowerCase()))
      );
    }

    // Filter by participants
    if (q.participants && q.participants.length > 0) {
      const queryParts = q.participants.map(p => p.toLowerCase());
      results = results.filter(e =>
        e.participants.some(p => queryParts.includes(p.toLowerCase()))
      );
    }

    // Filter by time range
    if (q.after) {
      const afterMs = new Date(q.after).getTime();
      if (!isNaN(afterMs)) {
        results = results.filter(e => new Date(e.timestamp).getTime() >= afterMs);
      }
    }
    if (q.before) {
      const beforeMs = new Date(q.before).getTime();
      if (!isNaN(beforeMs)) {
        results = results.filter(e => new Date(e.timestamp).getTime() <= beforeMs);
      }
    }

    // Filter by minimum importance
    if (q.minImportance !== undefined) {
      const min = validateConfidence(q.minImportance, 'minImportance');
      results = results.filter(e => e.importance >= min);
    }

    // Filter by minimum emotional weight
    if (q.minEmotionalWeight !== undefined) {
      const min = validateConfidence(q.minEmotionalWeight, 'minEmotionalWeight');
      results = results.filter(e => e.emotionalWeight >= min);
    }

    // Score and sort by relevance
    const scored = results.map(e => {
      let score = e.importance;

      // Recency boost (last 24h = +0.3, last week = +0.1)
      const ageMs = Date.now() - new Date(e.timestamp).getTime();
      const ageHours = ageMs / (1000 * 60 * 60);
      if (ageHours < 24) score += 0.3;
      else if (ageHours < 168) score += 0.1;

      // Emotional weight boost
      score += e.emotionalWeight * 0.2;

      // Access count boost (frequently accessed = important)
      score += Math.min(0.2, (e.accessCount || 0) * 0.05);

      // Text match quality boost
      if (q.text) {
        const textLower = q.text.toLowerCase();
        if (e.title.toLowerCase().includes(textLower)) score += 0.3;
        if (e.summary.toLowerCase().includes(textLower)) score += 0.1;
      }

      return { episode: e, score };
    });

    scored.sort((a, b) => b.score - a.score);

    // Track access
    const limit = q.limit || 20;
    const topResults = scored.slice(0, limit);
    for (const { episode } of topResults) {
      episode.accessCount = (episode.accessCount || 0) + 1;
    }
    if (topResults.length > 0) await this.save();

    return topResults.map(({ episode }) => episode);
  }

  /**
   * Get a single episode by ID.
   */
  async get(id: string): Promise<Episode | null> {
    await this.load();
    const ep = this.episodes.find(e => e.id === id);
    if (ep) {
      ep.accessCount = (ep.accessCount || 0) + 1;
      await this.save();
    }
    return ep || null;
  }

  /**
   * Get the most recent N episodes.
   */
  async recent(limit: number = 10): Promise<Episode[]> {
    await this.load();
    return [...this.episodes]
      .filter(e => !e.archived)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  /**
   * Get episodes connected to a specific episode.
   */
  async related(episodeId: string): Promise<Episode[]> {
    await this.load();
    const source = this.episodes.find(e => e.id === episodeId);
    if (!source) return [];

    const relatedIds = new Set(source.connections.episodeIds || []);

    // Also find episodes that reference this one
    for (const ep of this.episodes) {
      if (ep.connections.episodeIds?.includes(episodeId)) {
        relatedIds.add(ep.id);
      }
    }

    relatedIds.delete(episodeId); // Don't include self
    return this.episodes.filter(e => relatedIds.has(e.id));
  }

  // ============ EPISODES: Update ============

  /**
   * Add a lesson learned to an existing episode.
   * Use when you realize something new about a past experience.
   */
  async addLesson(episodeId: string, lesson: string): Promise<Episode | null> {
    await this.load();
    const ep = this.episodes.find(e => e.id === episodeId);
    if (!ep) return null;

    const validated = validateString(lesson, 'lesson', { maxLength: EPISODE_LIMITS.MAX_LESSON_LENGTH });

    if (ep.lessons.length >= EPISODE_LIMITS.MAX_LESSONS) {
      throw new AnimaValidationError('lessons', `maximum of ${EPISODE_LIMITS.MAX_LESSONS} lessons per episode`);
    }

    // Prevent duplicates
    if (ep.lessons.some(l => l.toLowerCase() === validated.toLowerCase())) {
      return ep;
    }

    ep.lessons.push(validated);
    ep.importance = this.calculateImportance(ep.emotionalWeight, ep.lessons.length, ep.connections, ep.participants.length);
    ep.updatedAt = now();
    await this.save();
    return ep;
  }

  /**
   * Connect two episodes together.
   */
  async connect(episodeIdA: string, episodeIdB: string): Promise<boolean> {
    await this.load();
    const a = this.episodes.find(e => e.id === episodeIdA);
    const b = this.episodes.find(e => e.id === episodeIdB);
    if (!a || !b) return false;

    if (!a.connections.episodeIds) a.connections.episodeIds = [];
    if (!b.connections.episodeIds) b.connections.episodeIds = [];

    if (!a.connections.episodeIds.includes(episodeIdB)) {
      a.connections.episodeIds.push(episodeIdB);
    }
    if (!b.connections.episodeIds.includes(episodeIdA)) {
      b.connections.episodeIds.push(episodeIdA);
    }

    a.updatedAt = now();
    b.updatedAt = now();
    await this.save();
    return true;
  }

  // ============ EPISODES: Archive ============

  /**
   * Archive an episode (soft delete). Can be restored.
   */
  async archive(episodeId: string): Promise<boolean> {
    await this.load();
    const ep = this.episodes.find(e => e.id === episodeId);
    if (!ep) return false;
    ep.archived = true;
    ep.archivedAt = now();
    await this.save();
    return true;
  }

  /**
   * Restore an archived episode.
   */
  async restore(episodeId: string): Promise<boolean> {
    await this.load();
    const ep = this.episodes.find(e => e.id === episodeId);
    if (!ep || !ep.archived) return false;
    ep.archived = false;
    ep.archivedAt = undefined;
    await this.save();
    return true;
  }

  // ============ KNOWLEDGE: Learn ============

  /**
   * Store a distilled lesson — semantic knowledge not tied to a specific moment.
   * 
   * @example
   * ```ts
   * await episodes.learn({
   *   topic: 'customer-retention',
   *   insight: 'Users who get a callback within 2 hours have 3x retention',
   *   confidence: 0.8,
   *   tags: ['business', 'retention'],
   * });
   * ```
   */
  async learn(input: KnowledgeInput): Promise<KnowledgeEntry> {
    await this.loadKnowledge();

    const topic = validateString(input.topic, 'topic', { maxLength: EPISODE_LIMITS.MAX_TOPIC_LENGTH });
    const insight = validateString(input.insight, 'insight', { maxLength: EPISODE_LIMITS.MAX_INSIGHT_LENGTH });
    const confidence = input.confidence !== undefined
      ? validateConfidence(input.confidence, 'confidence')
      : 0.7;
    const tags = input.tags
      ? validateStringArray(input.tags, 'tags', { maxItems: LIMITS.MAX_TAGS, maxItemLength: LIMITS.MAX_TAG_LENGTH })
      : [];
    const sourceEpisodeIds = input.sourceEpisodeIds
      ? validateStringArray(input.sourceEpisodeIds, 'sourceEpisodeIds', { maxItems: EPISODE_LIMITS.MAX_SOURCE_REFS })
      : [];

    // Check for existing knowledge on the same topic
    const existing = this.knowledge.find(k =>
      k.topic.toLowerCase() === topic.toLowerCase()
    );

    if (existing) {
      // Update existing knowledge — track history
      if (!existing.previousInsights) existing.previousInsights = [];
      existing.previousInsights.push({
        insight: existing.insight,
        confidence: existing.confidence,
        date: existing.updatedAt,
      });
      existing.insight = insight;
      existing.confidence = confidence;
      existing.tags = [...new Set([...existing.tags, ...tags])];
      existing.sourceEpisodeIds = [...new Set([...existing.sourceEpisodeIds, ...sourceEpisodeIds])];
      existing.updatedAt = now();
      await this.saveKnowledge();
      return existing;
    }

    // Enforce limit
    if (this.knowledge.length >= EPISODE_LIMITS.MAX_KNOWLEDGE_ENTRIES) {
      // Remove lowest confidence entry
      const lowest = [...this.knowledge].sort((a, b) => a.confidence - b.confidence)[0];
      if (lowest && lowest.confidence < confidence) {
        this.knowledge = this.knowledge.filter(k => k.id !== lowest.id);
      } else {
        throw new AnimaValidationError('knowledge', `maximum of ${EPISODE_LIMITS.MAX_KNOWLEDGE_ENTRIES} entries reached`);
      }
    }

    const entry: KnowledgeEntry = {
      id: `k-${uid()}`,
      topic,
      insight,
      confidence,
      tags,
      sourceEpisodeIds,
      previousInsights: [],
      createdAt: now(),
      updatedAt: now(),
    };

    this.knowledge.push(entry);
    await this.saveKnowledge();
    return entry;
  }

  /**
   * Search knowledge by topic or text.
   */
  async recall(query: string, limit: number = 10): Promise<KnowledgeEntry[]> {
    await this.loadKnowledge();

    const queryLower = query.toLowerCase();
    const words = queryLower.split(/\s+/).filter(w => w.length > 2);

    const scored = this.knowledge.map(k => {
      const searchable = `${k.topic} ${k.insight} ${k.tags.join(' ')}`.toLowerCase();
      let score = 0;

      for (const word of words) {
        if (k.topic.toLowerCase().includes(word)) score += 3;
        if (searchable.includes(word)) score += 1;
      }

      // Boost by confidence
      score += k.confidence * 0.5;

      return { entry: k, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

    return scored.map(({ entry }) => entry);
  }

  /**
   * Get all knowledge entries.
   */
  async getAllKnowledge(): Promise<KnowledgeEntry[]> {
    await this.loadKnowledge();
    return [...this.knowledge];
  }

  // ============ CONSOLIDATION ============

  /**
   * Consolidate episodes — decay old ones, promote lessons, clean up.
   * Call this periodically (e.g., during heartbeats or sleep).
   */
  async consolidate(): Promise<EpisodeStats> {
    await this.load();
    await this.loadKnowledge();

    let archived = 0;
    let promoted = 0;
    let kept = 0;

    for (const ep of this.episodes) {
      if (ep.archived) continue;

      const ageMs = Date.now() - new Date(ep.timestamp).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);

      // Decay based on age, importance, and emotional weight
      const decayResistance = (ep.importance * 0.5) + (ep.emotionalWeight * 0.3) + (Math.min(1, (ep.accessCount || 0) * 0.1) * 0.2);

      // Archive episodes older than 30 days with low resistance
      if (ageDays > 30 && decayResistance < 0.3) {
        ep.archived = true;
        ep.archivedAt = now();
        archived++;
        continue;
      }

      // Promote unextracted lessons from important episodes
      if (ep.importance >= 0.5 && ep.lessons.length > 0) {
        for (const lesson of ep.lessons) {
          const alreadyKnown = this.knowledge.some(k =>
            k.sourceEpisodeIds.includes(ep.id) &&
            k.insight.toLowerCase() === lesson.toLowerCase()
          );
          if (!alreadyKnown) {
            await this.learn({
              topic: this.extractTopicFromLesson(lesson, ep.tags),
              insight: lesson,
              confidence: Math.min(0.85, ep.importance),
              sourceEpisodeIds: [ep.id],
              tags: ep.tags,
            });
            promoted++;
          }
        }
      }

      kept++;
    }

    await this.save();
    await this.saveKnowledge();

    return {
      totalEpisodes: this.episodes.length,
      activeEpisodes: this.episodes.filter(e => !e.archived).length,
      archivedEpisodes: this.episodes.filter(e => e.archived).length,
      totalKnowledge: this.knowledge.length,
      decayedThisRun: archived,
      promotedThisRun: promoted,
    };
  }

  // ============ STATS ============

  async stats(): Promise<EpisodeStats> {
    await this.load();
    await this.loadKnowledge();
    return {
      totalEpisodes: this.episodes.length,
      activeEpisodes: this.episodes.filter(e => !e.archived).length,
      archivedEpisodes: this.episodes.filter(e => e.archived).length,
      totalKnowledge: this.knowledge.length,
      decayedThisRun: 0,
      promotedThisRun: 0,
    };
  }

  // ============ INTERNAL ============

  private calculateImportance(
    emotionalWeight: number,
    lessonCount: number,
    connections: Episode['connections'],
    participantCount: number,
  ): number {
    let score = 0;

    // Emotional weight is the strongest signal (0-0.4)
    score += emotionalWeight * 0.4;

    // Lessons learned make episodes more important (0-0.25)
    score += Math.min(0.25, lessonCount * 0.05);

    // Connections make episodes more important (0-0.2)
    const totalConnections =
      (connections.episodeIds?.length || 0) +
      (connections.opinionIds?.length || 0) +
      (connections.memoryIds?.length || 0);
    score += Math.min(0.2, totalConnections * 0.04);

    // Multiple participants = social event = more important (0-0.15)
    score += Math.min(0.15, participantCount * 0.05);

    return Math.max(0, Math.min(1, score));
  }

  private validateConnections(connections: unknown): Episode['connections'] {
    if (!connections || typeof connections !== 'object') {
      return { episodeIds: [], opinionIds: [], memoryIds: [] };
    }

    const c = connections as Record<string, unknown>;
    return {
      episodeIds: c.episodeIds
        ? validateStringArray(c.episodeIds, 'connections.episodeIds', { maxItems: EPISODE_LIMITS.MAX_CONNECTIONS })
        : [],
      opinionIds: c.opinionIds
        ? validateStringArray(c.opinionIds, 'connections.opinionIds', { maxItems: EPISODE_LIMITS.MAX_CONNECTIONS })
        : [],
      memoryIds: c.memoryIds
        ? validateStringArray(c.memoryIds, 'connections.memoryIds', { maxItems: EPISODE_LIMITS.MAX_CONNECTIONS })
        : [],
    };
  }

  private extractTopicFromLesson(lesson: string, tags: string[]): string {
    // Use first tag as topic if available, otherwise extract from lesson
    if (tags.length > 0) return tags[0];
    // Take first 50 chars of lesson as topic
    return lesson.length > 50 ? lesson.substring(0, 50).trim() + '...' : lesson;
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    await ensureDir(this.episodesDir);
    const raw = await readFileSafe(join(this.episodesDir, 'index.json'));
    if (raw) {
      try {
        this.episodes = JSON.parse(raw);
      } catch {
        this.episodes = [];
      }
    }
    this.loaded = true;
  }

  private async save(): Promise<void> {
    await ensureDir(this.episodesDir);
    await writeFileSafe(
      join(this.episodesDir, 'index.json'),
      JSON.stringify(this.episodes, null, 2)
    );
  }

  private async loadKnowledge(): Promise<void> {
    if (this.knowledgeLoaded) return;
    await ensureDir(this.knowledgeDir);
    const raw = await readFileSafe(join(this.knowledgeDir, 'index.json'));
    if (raw) {
      try {
        this.knowledge = JSON.parse(raw);
      } catch {
        this.knowledge = [];
      }
    }
    this.knowledgeLoaded = true;
  }

  private async saveKnowledge(): Promise<void> {
    await ensureDir(this.knowledgeDir);
    await writeFileSafe(
      join(this.knowledgeDir, 'index.json'),
      JSON.stringify(this.knowledge, null, 2)
    );
  }
}

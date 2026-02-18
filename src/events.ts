/**
 * Event system for Anima.
 * Simple typed event emitter — no dependencies.
 */

import type { AnimaEvent, Memory, Opinion, MemoryConflict } from './types';

export interface AnimaEventMap {
  beforeCompaction: { memoriesCount: number };
  afterWake: { sessionId: string; bootTimeMs: number; memoriesLoaded: number };
  afterSleep: { sessionId: string; memoriesCreated: number; memoriesDecayed: number };
  memoryPromoted: { memory: Memory; from: string; to: string };
  memoryDecayed: { memory: Memory };
  opinionChanged: { topic: string; oldOpinion: string; newOpinion: string; oldConfidence: number; newConfidence: number };
  conflictDetected: { conflict: MemoryConflict };
  autoSave: { savedAt: string; memoriesCount: number };
}

type EventHandler<T> = (data: T) => void | Promise<void>;

export class AnimaEventEmitter {
  private handlers: Map<string, Set<EventHandler<any>>> = new Map();

  /**
   * Listen for an event.
   * Returns an unsubscribe function.
   */
  on<K extends keyof AnimaEventMap>(event: K, handler: EventHandler<AnimaEventMap[K]>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Listen for an event once.
   */
  once<K extends keyof AnimaEventMap>(event: K, handler: EventHandler<AnimaEventMap[K]>): () => void {
    const wrapper: EventHandler<AnimaEventMap[K]> = (data) => {
      this.off(event, wrapper);
      return handler(data);
    };
    return this.on(event, wrapper);
  }

  /**
   * Remove a specific handler.
   */
  off<K extends keyof AnimaEventMap>(event: K, handler: EventHandler<AnimaEventMap[K]>): void {
    this.handlers.get(event)?.delete(handler);
  }

  /**
   * Remove all handlers for an event, or all handlers if no event specified.
   */
  removeAll(event?: keyof AnimaEventMap): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }

  /**
   * Emit an event. Handlers run in order, errors are caught and logged.
   */
  async emit<K extends keyof AnimaEventMap>(event: K, data: AnimaEventMap[K]): Promise<void> {
    const handlers = this.handlers.get(event);
    if (!handlers || handlers.size === 0) return;
    
    for (const handler of handlers) {
      try {
        await handler(data);
      } catch (err) {
        console.error(`[anima] Event handler error for '${event}':`, err);
      }
    }
  }
}

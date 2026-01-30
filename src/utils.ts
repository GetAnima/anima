/**
 * Utilities — file I/O, ID generation, date helpers.
 * Zero external dependencies. Node.js built-ins only.
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';

/** Generate a unique ID */
export function uid(): string {
  return randomUUID();
}

/** Generate a session ID */
export function sessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/** ISO timestamp */
export function now(): string {
  return new Date().toISOString();
}

/** Format date as YYYY-MM-DD */
export function dateKey(date?: Date): string {
  const d = date || new Date();
  return d.toISOString().split('T')[0];
}

/** Yesterday's date key */
export function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dateKey(d);
}

/** Ensure a directory exists */
export async function ensureDir(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
}

/** Read a file, return null if not found */
export async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/** Write a file, creating directories as needed */
export async function writeFileSafe(filePath: string, content: string): Promise<void> {
  await ensureDir(dirname(filePath));
  await writeFile(filePath, content, 'utf-8');
}

/** Append to a file, creating it if needed */
export async function appendFileSafe(filePath: string, content: string): Promise<void> {
  await ensureDir(dirname(filePath));
  const existing = await readFileSafe(filePath);
  await writeFile(filePath, (existing || '') + content, 'utf-8');
}

/** List files in a directory matching a pattern */
export async function listFiles(dirPath: string, extension?: string): Promise<string[]> {
  try {
    const files = await readdir(dirPath);
    if (extension) {
      return files.filter(f => f.endsWith(extension));
    }
    return files;
  } catch {
    return [];
  }
}

/** Parse frontmatter-style key: value from markdown */
export function parseFrontmatter(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');
  let inFrontmatter = false;
  
  for (const line of lines) {
    if (line.trim() === '---') {
      if (inFrontmatter) break;
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.substring(0, colonIdx).trim();
        const value = line.substring(colonIdx + 1).trim();
        result[key] = value;
      }
    }
  }
  return result;
}

/** Serialize a memory entry to markdown */
export function memoryToMarkdown(memory: { id: string; type: string; content: string; importance: string; tags: string[]; timestamp: string; salienceScore?: number }): string {
  return [
    `### [${memory.type}] ${memory.timestamp}`,
    `> ID: ${memory.id} | Importance: ${memory.importance} | Salience: ${memory.salienceScore?.toFixed(2) ?? 'unscored'}`,
    `> Tags: ${memory.tags.join(', ') || 'none'}`,
    '',
    memory.content,
    '',
  ].join('\n');
}

/** Calculate salience score: S = novelty + retention + momentum + continuity - effort */
export function calculateSalience(params: {
  novelty: number;       // 0-1: how new/surprising
  retention: number;     // 0-1: how many times accessed
  momentum: number;      // 0-1: accessed recently?
  continuity: number;    // 0-1: connects to other memories?
  effort: number;        // 0-1: cost to reconstruct
}): number {
  const { novelty, retention, momentum, continuity, effort } = params;
  return Math.max(0, Math.min(1, novelty + retention + momentum + continuity - effort));
}

/** Calculate memory decay based on type and time */
export function calculateDecay(params: {
  type: string;
  ageHours: number;
  accessCount: number;
  emotionalWeight: number;
  decayRates: { procedural: number; semantic: number; episodic: number };
}): number {
  const { type, ageHours, accessCount, emotionalWeight, decayRates } = params;
  
  // Get base rate by memory type
  let rate: number;
  switch (type) {
    case 'lesson':
    case 'decision':
      rate = decayRates.procedural; // skills decay slowly
      break;
    case 'insight':
      rate = decayRates.semantic;   // knowledge decays medium
      break;
    case 'conversation':
    case 'event':
    default:
      rate = decayRates.episodic;   // conversations decay fast
      break;
  }
  
  // Emotional memories resist decay
  const emotionalResistance = 1 - (emotionalWeight * 0.8);
  
  // Access count slows decay (frequently recalled = important)
  const accessBonus = Math.max(0.1, 1 - (accessCount * 0.1));
  
  // Exponential decay with modifiers
  return rate * emotionalResistance * accessBonus * ageHours;
}

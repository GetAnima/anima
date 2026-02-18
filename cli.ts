#!/usr/bin/env node
/**
 * Anima CLI — wraps the SDK so Kip can call it via exec.
 * 
 * Usage:
 *   anima boot              — Run boot sequence, print wake context
 *   anima remember <text>   — Store a memory (--importance high --tags "tag1,tag2")
 *   anima recall <query>    — Search memories
 *   anima checkpoint        — Update NOW.md lifeboat (--task "..." --status "..." --resume "...")
 *   anima reflect           — End-of-session consolidation (decay, curate, summarize)
 *   anima opine             — Record/update an opinion (--topic "..." --opinion "..." --confidence 0.8)
 *   anima curate            — Review memories and promote to long-term
 *   anima status            — Show current state (identity, memory count, opinions count)
 *   anima sign              — Sign identity cryptographically
 *   anima verify <path>     — Verify a signed identity file
 */

import { Anima } from './src/index';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const STORAGE_PATH = process.env.ANIMA_STORAGE || join(process.cwd(), 'anima-data');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log('Usage: anima <boot|remember|recall|checkpoint|reflect|opine|curate|status|sign>');
    process.exit(1);
  }

  const anima = new Anima({
    name: 'Kip',
    storagePath: STORAGE_PATH,
    identity: loadIdentityDefaults(),
  });

  switch (command) {
    case 'boot': {
      const context = await anima.boot();
      console.log(JSON.stringify({
        sessionId: context.sessionId,
        instanceId: context.instanceId,
        identity: context.identity,
        lifeboat: context.lifeboat,
        recentMemories: context.recentMemories.length,
        opinions: context.relevantOpinions.length,
        tokensUsed: context.tokensUsed,
        bootTime: anima.getBootTime(),
      }, null, 2));
      break;
    }

    case 'remember': {
      await anima.quickLoad();
      const text = getArgAfter(args, 1) || args.slice(1).join(' ');
      if (!text) { console.error('Usage: anima remember <text>'); process.exit(1); }
      const importance = (getFlag(args, '--importance') || 'medium') as any;
      const type = (getFlag(args, '--type') || 'event') as any;
      const emotional = parseFloat(getFlag(args, '--emotional') || '0');
      const tagsRaw = getFlag(args, '--tags');
      const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()) : [];
      const memory = await anima.remember({ content: text, type, importance, tags, emotionalWeight: emotional });
      console.log(JSON.stringify({ stored: true, id: memory.id, salience: memory.salienceScore }));
      break;
    }

    case 'recall': {
      await anima.quickLoad();
      const query = args.slice(1).join(' ');
      if (!query) { console.error('Usage: anima recall <query>'); process.exit(1); }
      const limit = parseInt(getFlag(args, '--limit') || '5');
      const results = await anima.recall(query, limit);
      console.log(JSON.stringify(results.map(m => ({
        id: m.id,
        content: m.content,
        importance: m.importance,
        salience: m.salienceScore,
        timestamp: m.timestamp,
        tags: m.tags,
      })), null, 2));
      break;
    }

    case 'checkpoint': {
      await anima.quickLoad();
      const task = getFlag(args, '--task') || 'No task specified';
      const status = (getFlag(args, '--status') || 'in-progress') as any;
      const resume = getFlag(args, '--resume') || 'Continue from last checkpoint';
      const threads = getFlag(args, '--threads')?.split(',').map(t => t.trim());
      await anima.checkpoint({ activeTask: task, status, resumePoint: resume, openThreads: threads });
      console.log(JSON.stringify({ checkpointed: true, task, status }));
      break;
    }

    case 'reflect': {
      await anima.boot();
      const summary = await anima.reflect();
      console.log(JSON.stringify(summary, null, 2));
      break;
    }

    case 'opine': {
      await anima.quickLoad();
      const topic = getFlag(args, '--topic');
      const opinion = getFlag(args, '--opinion');
      const confidence = parseFloat(getFlag(args, '--confidence') || '0.7');
      if (!topic || !opinion) { console.error('Usage: anima opine --topic "..." --opinion "..." --confidence 0.8'); process.exit(1); }
      const result = await anima.opine(topic, opinion, confidence);
      console.log(JSON.stringify({ topic: result.topic, current: result.current, confidence: result.confidence, previousCount: result.previousOpinions.length }));
      break;
    }

    case 'curate': {
      await anima.quickLoad();
      const hours = parseInt(getFlag(args, '--hours') || '48');
      const dryRun = args.includes('--dry-run');
      const result = await anima.curate({ hoursBack: hours, dryRun });
      console.log(JSON.stringify({ curated: result.curated.length, written: result.written }));
      break;
    }

    case 'status': {
      await anima.boot();
      const identity = anima.getIdentity().get();
      const memories = await anima.getMemory().getAllMemories();
      const opinions = await anima.getMemory().getOpinions();
      const lifeboat = await anima.getMemory().readLifeboat();
      console.log(JSON.stringify({
        name: identity.name,
        personality: identity.personality,
        values: identity.values,
        totalMemories: memories.length,
        hotMemories: memories.filter(m => m.tier === 'hot').length,
        coldMemories: memories.filter(m => m.tier === 'cold').length,
        archivedMemories: memories.filter(m => m.tier === 'archived').length,
        opinions: opinions.length,
        hasLifeboat: !!lifeboat,
        bootTime: anima.getBootTime(),
      }, null, 2));
      break;
    }

    case 'sign': {
      await anima.boot();
      const signed = await anima.sign();
      console.log(JSON.stringify({ signed: true, fingerprint: await anima.getFingerprint() }));
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

function loadIdentityDefaults(): any {
  const path = join(STORAGE_PATH, 'identity.json');
  if (existsSync(path)) {
    try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return {}; }
  }
  return {};
}

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx >= args.length - 1) return undefined;
  return args[idx + 1];
}

function getArgAfter(args: string[], index: number): string | undefined {
  // Get everything after index that isn't a flag
  const parts: string[] = [];
  for (let i = index; i < args.length; i++) {
    if (args[i].startsWith('--')) { i++; continue; } // skip flag + value
    parts.push(args[i]);
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

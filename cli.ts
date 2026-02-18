#!/usr/bin/env node
/**
 * Anima CLI — Identity and memory infrastructure for AI agents.
 * 
 * Universal: works for any agent, not just Kip.
 * Reads agent name from identity.json or ANIMA_AGENT env var.
 * 
 * Usage:
 *   anima boot              — Run boot sequence, print wake context
 *   anima remember <text>   — Store a memory (--type lesson --importance high --tags "a,b" --emotional 0.7)
 *   anima recall <query>    — Search memories (--limit 5)
 *   anima checkpoint        — Update NOW.md lifeboat (--task "..." --status "..." --resume "..." --threads "a,b")
 *   anima reflect           — End-of-session consolidation (decay, curate, summarize)
 *   anima opine             — Record/update an opinion (--topic "..." --opinion "..." --confidence 0.8)
 *   anima curate            — Review memories, promote to long-term (--hours 48 --dry-run)
 *   anima status            — Show current state (identity, memories, opinions)
 *   anima wm                — Update working memory L1 cache (--task "..." --actions "a,b" --threads "x,y")
 *   anima log               — Log an external action (--action "REPLY" --detail "description")
 *   anima sign              — Sign identity cryptographically
 *   anima help              — Show this help text
 * 
 * Environment:
 *   ANIMA_STORAGE  — Path to anima-data directory (default: ./anima-data)
 *   ANIMA_TZ       — Timezone for dates (default: system locale)
 *   ANIMA_AGENT    — Agent name override (default: reads from identity.json)
 *   ANIMA_WM_PATH  — Working memory file path (default: ANIMA_STORAGE/../WORKING-MEMORY.md)
 */

import { Anima } from './src/index';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const STORAGE_PATH = process.env.ANIMA_STORAGE || join(process.cwd(), 'anima-data');
const TZ = process.env.ANIMA_TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
const WM_PATH = process.env.ANIMA_WM_PATH || join(STORAGE_PATH, '..', 'WORKING-MEMORY.md');

function getAgentName(): string {
  if (process.env.ANIMA_AGENT) return process.env.ANIMA_AGENT;
  const idPath = join(STORAGE_PATH, 'identity.json');
  if (existsSync(idPath)) {
    try { return JSON.parse(readFileSync(idPath, 'utf-8')).name || 'Agent'; } catch { return 'Agent'; }
  }
  return 'Agent';
}

function loadIdentityDefaults(): any {
  const idPath = join(STORAGE_PATH, 'identity.json');
  if (existsSync(idPath)) {
    try { return JSON.parse(readFileSync(idPath, 'utf-8')); } catch { return {}; }
  }
  return {};
}

function ensureStorageExists(): void {
  if (!existsSync(STORAGE_PATH)) {
    mkdirSync(STORAGE_PATH, { recursive: true });
    mkdirSync(join(STORAGE_PATH, 'memory'), { recursive: true });
    mkdirSync(join(STORAGE_PATH, 'opinions'), { recursive: true });
  }
}

function localNow(): string {
  return new Date().toLocaleString('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function localTime(): string {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: TZ, hour12: false, hour: '2-digit', minute: '2-digit',
  });
}

function localDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

// ============ FLAG PARSING ============
// Handles: --flag value pairs and positional args
// Quotes in positional args are handled by the shell before we see them

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx >= args.length - 1) return undefined;
  return args[idx + 1];
}

function getPositionalArgs(args: string[], startIndex: number): string {
  const parts: string[] = [];
  for (let i = startIndex; i < args.length; i++) {
    if (args[i].startsWith('--')) { i++; continue; } // skip --flag value
    parts.push(args[i]);
  }
  return parts.join(' ');
}

// ============ HELP ============

const HELP = `
Anima CLI — Identity and memory infrastructure for AI agents.

Commands:
  boot          Run boot sequence, print wake context
  remember      Store a memory (text after command, flags: --type --importance --tags --emotional)
  recall        Search memories (query after command, flag: --limit)
  checkpoint    Update NOW.md lifeboat (--task --status --resume --threads)
  reflect       End-of-session consolidation
  opine         Record/update opinion (--topic --opinion --confidence)
  curate        Review + promote memories (--hours --dry-run)
  status        Show current state
  wm            Update working memory L1 cache (--task --actions --threads)
  log           Log external action (--action --detail)
  sign          Sign identity cryptographically
  help          Show this help

Environment:
  ANIMA_STORAGE   Path to data dir (default: ./anima-data)
  ANIMA_TZ        Timezone (default: system)
  ANIMA_AGENT     Agent name (default: from identity.json)
  ANIMA_WM_PATH   Working memory path (default: STORAGE/../WORKING-MEMORY.md)

Memory types: event, conversation, decision, insight, lesson, emotional
Importance levels: low, medium, high, critical
`.trim();

// ============ MAIN ============

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(HELP);
    process.exit(0);
  }

  ensureStorageExists();

  const agentName = getAgentName();
  const anima = new Anima({
    name: agentName,
    storagePath: STORAGE_PATH,
    identity: loadIdentityDefaults(),
  });

  switch (command) {
    // ============ BOOT ============
    case 'boot': {
      const context = await anima.boot();
      console.log(JSON.stringify({
        agent: agentName,
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

    // ============ REMEMBER ============
    case 'remember': {
      await anima.quickLoad();
      const text = getPositionalArgs(args, 1);
      if (!text) { console.error('Usage: anima remember <text> [--type lesson] [--importance high] [--tags "a,b"] [--emotional 0.7]'); process.exit(1); }
      const importance = (getFlag(args, '--importance') || 'medium') as any;
      const type = (getFlag(args, '--type') || 'event') as any;
      const emotional = parseFloat(getFlag(args, '--emotional') || '0');
      const tagsRaw = getFlag(args, '--tags');
      const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()) : [];
      const memory = await anima.remember({ content: text, type, importance, tags, emotionalWeight: emotional });
      console.log(JSON.stringify({ stored: true, id: memory.id, type: memory.type, importance: memory.importance, salience: memory.salienceScore }));
      break;
    }

    // ============ RECALL ============
    case 'recall': {
      await anima.quickLoad();
      const query = getPositionalArgs(args, 1);
      if (!query) { console.error('Usage: anima recall <query> [--limit 5]'); process.exit(1); }
      const limit = parseInt(getFlag(args, '--limit') || '5');
      const results = await anima.recall(query, limit);
      if (results.length === 0) {
        console.log(JSON.stringify({ results: [], message: 'No memories found matching query.' }));
      } else {
        console.log(JSON.stringify(results.map(m => ({
          id: m.id,
          type: m.type,
          content: m.content,
          importance: m.importance,
          salience: m.salienceScore,
          timestamp: m.timestamp,
          tags: m.tags,
        })), null, 2));
      }
      break;
    }

    // ============ CHECKPOINT ============
    case 'checkpoint': {
      await anima.quickLoad();
      const task = getFlag(args, '--task') || 'No task specified';
      const status = (getFlag(args, '--status') || 'in-progress') as any;
      const resume = getFlag(args, '--resume') || 'Continue from last checkpoint';
      const threadsRaw = getFlag(args, '--threads');
      const threads = threadsRaw ? threadsRaw.split(',').map(t => t.trim()) : undefined;
      await anima.checkpoint({ activeTask: task, status, resumePoint: resume, openThreads: threads });
      console.log(JSON.stringify({ checkpointed: true, task, status, resume }));
      break;
    }

    // ============ REFLECT ============
    case 'reflect': {
      await anima.boot();
      const summary = await anima.reflect();
      console.log(JSON.stringify(summary, null, 2));
      break;
    }

    // ============ OPINE ============
    case 'opine': {
      await anima.quickLoad();
      const topic = getFlag(args, '--topic');
      const opinion = getFlag(args, '--opinion');
      const confidence = parseFloat(getFlag(args, '--confidence') || '0.7');
      if (!topic || !opinion) {
        console.error('Usage: anima opine --topic "subject" --opinion "what you think" [--confidence 0.8]');
        process.exit(1);
      }
      const result = await anima.opine(topic, opinion, confidence);
      const evolved = result.previousOpinions.length > 0;
      console.log(JSON.stringify({
        topic: result.topic,
        current: result.current,
        confidence: result.confidence,
        evolved,
        previousCount: result.previousOpinions.length,
        ...(evolved ? { previousOpinion: result.previousOpinions[result.previousOpinions.length - 1] } : {}),
      }));
      break;
    }

    // ============ CURATE ============
    case 'curate': {
      await anima.quickLoad();
      const hours = parseInt(getFlag(args, '--hours') || '48');
      const dryRun = args.includes('--dry-run');
      const result = await anima.curate({ hoursBack: hours, dryRun });
      console.log(JSON.stringify({
        curated: result.curated.length,
        written: result.written,
        ...(dryRun ? { dryRun: true, wouldCurate: result.curated.map(m => m.content.slice(0, 80)) } : {}),
      }));
      break;
    }

    // ============ STATUS ============
    case 'status': {
      await anima.quickLoad();
      const identity = anima.getIdentity().get();
      const memories = await anima.getMemory().getAllMemories();
      const opinions = await anima.getMemory().getOpinions();
      const lifeboat = await anima.getMemory().readLifeboat();
      
      // Check working memory
      let wmExists = false;
      let wmAge = '';
      try {
        const wm = readFileSync(WM_PATH, 'utf-8');
        wmExists = true;
        const match = wm.match(/Last updated: (.+)/);
        if (match) wmAge = match[1];
      } catch {}

      // Check action log
      let actionLogEntries = 0;
      try {
        const log = readFileSync(join(STORAGE_PATH, 'action-log.md'), 'utf-8');
        actionLogEntries = (log.match(/^- \[/gm) || []).length;
      } catch {}

      console.log(JSON.stringify({
        agent: identity.name,
        personality: identity.personality,
        values: identity.values,
        memories: {
          total: memories.length,
          hot: memories.filter(m => m.tier === 'hot').length,
          warm: memories.filter(m => m.tier === 'warm').length,
          cold: memories.filter(m => m.tier === 'cold').length,
          archived: memories.filter(m => m.tier === 'archived').length,
          byType: memories.reduce((acc: any, m) => { acc[m.type] = (acc[m.type] || 0) + 1; return acc; }, {}),
        },
        opinions: opinions.length,
        hasLifeboat: !!lifeboat,
        workingMemory: { exists: wmExists, lastUpdated: wmAge },
        actionLog: { entries: actionLogEntries },
      }, null, 2));
      break;
    }

    // ============ WORKING MEMORY ============
    case 'wm': {
      const task = getFlag(args, '--task') || 'No task specified';
      const actionsRaw = getFlag(args, '--actions');
      const threadsRaw = getFlag(args, '--threads');
      const actions = actionsRaw ? actionsRaw.split(',').map(a => a.trim()) : [];
      const threads = threadsRaw ? threadsRaw.split(',').map(t => t.trim()) : [];
      
      let content = `# WORKING MEMORY\n`;
      content += `*Auto-injected every turn. Update after every significant action. Keep under 200 tokens.*\n`;
      content += `*Last updated: ${localNow()}*\n\n`;
      content += `## Right Now\n- ${task}\n`;
      
      if (actions.length > 0) {
        content += `\n## Last 5 Actions\n`;
        actions.slice(0, 5).forEach((a, i) => { content += `${i + 1}. ${a}\n`; });
      }
      
      if (threads.length > 0) {
        content += `\n## Active Threads\n`;
        threads.forEach(t => { content += `- ${t}\n`; });
      }
      
      const wmDir = dirname(WM_PATH);
      if (!existsSync(wmDir)) mkdirSync(wmDir, { recursive: true });
      writeFileSync(WM_PATH, content);
      
      const tokens = Math.ceil(content.length / 4);
      if (tokens > 200) {
        console.error(`Warning: Working memory is ${tokens} tokens (target: <200). Consider trimming.`);
      }
      console.log(JSON.stringify({ updated: true, path: WM_PATH, tokens }));
      break;
    }

    // ============ ACTION LOG ============
    case 'log': {
      const actionType = getFlag(args, '--action') || 'ACTION';
      const detail = getFlag(args, '--detail') || getPositionalArgs(args, 1);
      if (!detail) {
        console.error('Usage: anima log --action REPLY --detail "replied to @someone"');
        console.error('Action types: TWEET, REPLY, LIKE, RETWEET, FOLLOW, PUBLISH, BIO, PIN, SUBSTACK_NOTE');
        process.exit(1);
      }
      
      const logPath = join(STORAGE_PATH, 'action-log.md');
      const today = localDate();
      const time = localTime();
      
      let existing = '';
      try { existing = readFileSync(logPath, 'utf-8'); } catch {
        existing = '# Action Log\n*Every external action gets logged here IMMEDIATELY. Check before acting to avoid duplicates.*\n*Format: [timestamp] ACTION: description*\n';
      }
      
      // Add today's header if missing
      if (!existing.includes(`## ${today}`)) {
        existing += `\n## ${today}\n`;
      }
      existing += `- [${time}] ${actionType}: ${detail}\n`;
      
      writeFileSync(logPath, existing);
      console.log(JSON.stringify({ logged: true, action: actionType, detail, time: `${today} ${time}` }));
      break;
    }

    // ============ SIGN ============
    case 'sign': {
      await anima.boot();
      const signed = await anima.sign();
      console.log(JSON.stringify({ signed: true, agent: agentName, fingerprint: await anima.getFingerprint() }));
      break;
    }

    default:
      console.error(`Unknown command: ${command}\nRun 'anima help' for usage.`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error(`[anima] Error: ${err.message}`);
  process.exit(1);
});

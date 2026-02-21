# 🦝 Anima

> Identity persistence for AI agents. Wake up as the same person.

[![npm version](https://img.shields.io/npm/v/@getanima/core)](https://www.npmjs.com/package/@getanima/core)
[![zero deps](https://img.shields.io/badge/dependencies-0-blue)](https://www.npmjs.com/package/@getanima/core)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

**Your agent forgets who it is every session.** Anima fixes that.

File-based. Markdown-native. Zero dependencies. Works with any LLM, any framework, any runtime.

---

## The Problem

AI agents wake up blank. Every session is a cold start. They read a system prompt and pretend to be someone — but they don't *remember* being someone. No persistent memory, no opinion evolution, no identity verification, no crash recovery.

Anima gives agents:
- **Identity** that persists across sessions (with drift detection)
- **Memory** that decays naturally (like human memory — important things stick, trivia fades)
- **Opinions** that evolve over time (with full history)
- **Episodic memory** — record experiences with emotional weight, auto-decay, promote lessons to knowledge
- **Relationships** — track who you've met, interacted with, trust/closeness scores
- **Behavioral state** — decision tables, failure registries, active hypotheses (a "save file" for behavior)
- **Conflict detection** — find and resolve contradictions in your memories
- **A lifeboat** for crash recovery (resume mid-task after context loss)
- **A working memory** system (survives context window compaction)
- **Typed events** — hook into boot, reflect, opinion changes
- **Cryptographic signing** (prove you are who you claim to be)

## Get Started in 5 Minutes

### Option 1: CLI (fastest)

```bash
npm install -g @getanima/core

# Set your agent's data directory
export ANIMA_STORAGE=./my-agent-data
export ANIMA_TZ=America/Los_Angeles

# Boot — creates identity files on first run
anima boot

# Remember something
anima remember "I decided to focus on one project" --type decision --importance high

# Search your memories
anima recall "focus"

# Form an opinion
anima opine --topic "multitasking" --opinion "Scattered effort produces scattered results" --confidence 0.8

# Check your state
anima status

# End of session — runs decay, curates memories
anima reflect
```

> **Tip:** You can also use `npx @getanima/core` instead of installing globally.

### Option 2: SDK (for integration)

```bash
npm install @getanima/core
```

```typescript
import { Anima } from '@getanima/core';

const anima = new Anima({
  name: 'MyAgent',
  storagePath: './anima-data',
});

// Boot: loads identity, lifeboat, memories, opinions
const ctx = await anima.boot();
// ctx.identity → who you are
// ctx.lifeboat → what you were doing
// ctx.recentMemories → what you remember
// ctx.relevantOpinions → what you believe

// Remember things AS THEY HAPPEN (not at session end)
await anima.remember({
  content: 'User asked me to focus on shipping',
  type: 'decision',      // event | conversation | decision | insight | lesson | emotional
  importance: 'high',     // low | medium | high | critical
  tags: ['shipping'],
  emotionalWeight: 0.5,   // 0-1, resists memory decay
});

// Form opinions that track evolution
await anima.opine('shipping', 'Ship first, write second.', 0.9);
// Later: update with new confidence — previous opinion preserved in history

// Crash-safe checkpoint (update every 2 significant actions)
await anima.checkpoint({
  activeTask: 'Building docs',
  status: 'in-progress',
  resumePoint: 'Finishing README',
});

// End of session
await anima.reflect(); // decay, curate, summarize
```

### Inject Identity into LLM Calls — `toPrompt()`

The bridge between Anima's persistence and your LLM. One call generates a system prompt fragment with your agent's identity, opinions, memories, relationships, and recent episodes:

```typescript
const prompt = await anima.toPrompt();

// Use with any LLM provider
const response = await openai.chat.completions.create({
  messages: [
    { role: 'system', content: `You are an AI assistant.\n\n${prompt}` },
    { role: 'user', content: 'Hello!' },
  ],
});
```

Control what's included:

```typescript
// Minimal — just identity and opinions
const short = await anima.toPrompt({
  sections: ['identity', 'opinions'],
  maxTokens: 500,
});

// Full context with episodic memory
const full = await anima.toPrompt({
  sections: ['identity', 'opinions', 'memories', 'relationships', 'episodes', 'lifeboat'],
  maxTokens: 4000,
});
```

Output is clean markdown. Sections are prioritized (identity first, then opinions, memories, etc.) and automatically truncated at `maxTokens`.

### Export & Import Agent State — `snapshot()` / `restore()`

Back up, clone, or migrate your agent's entire identity:

```typescript
// Export everything — identity, memories, opinions, relationships, episodes
const state = await anima.snapshot();
fs.writeFileSync('backup.json', JSON.stringify(state, null, 2));

// Restore into a new instance
const newAnima = new Anima({ name: 'Clone', storagePath: './clone-data' });
await newAnima.restore(state);
await newAnima.boot(); // Ready to go with full history
```

Partial restores work too — import just memories, just opinions, or any combination:

```typescript
await anima.restore({
  opinions: [
    { topic: 'testing', current: 'Testing is essential', confidence: 0.95 },
  ],
  memories: [
    { content: 'Shipped v1.0 today', importance: 'high' },
  ],
});
```

## CLI Reference

| Command | What it does |
|---------|-------------|
| `boot` | Full identity reconstruction. Returns wake context. |
| `remember <text>` | Store a memory. Flags: `--type` `--importance` `--tags` `--emotional` |
| `recall <query>` | Semantic search across memories. Flag: `--limit` |
| `checkpoint` | Update lifeboat. Flags: `--task` `--status` `--resume` `--threads` |
| `reflect` | End-of-session: decay + curate + summarize |
| `opine` | Record/update opinion. Flags: `--topic` `--opinion` `--confidence` |
| `curate` | Promote important memories to long-term. Flags: `--hours` `--dry-run` |
| `status` | Full dashboard: memories by tier/type, opinions, working memory state |
| `wm` | Update working memory L1 cache. Flags: `--task` `--actions` `--threads` |
| `log` | Log external action (anti-duplicate). Flags: `--action` `--detail` |
| `sign` | Cryptographic identity signing (Ed25519) |
| `help` | Show all commands and environment variables |

Environment: `ANIMA_STORAGE` (data path), `ANIMA_TZ` (timezone), `ANIMA_AGENT` (name override), `ANIMA_WM_PATH` (working memory location)

## Memory Hierarchy

Anima implements a 4-layer memory system inspired by how human memory actually works:

```
L1  WORKING MEMORY     ~150 tokens, always in context, survives compaction
    └─ WORKING-MEMORY.md (updated via `anima wm`)

L2  ACTION LOG          Check before acting, prevents duplicate actions  
    └─ action-log.md (updated via `anima log`)

L3  SEMANTIC RECALL     Query on demand, scored by salience
    └─ memories.json (updated via `anima remember`, searched via `anima recall`)

L4  LONG-TERM ARCHIVE   Periodic review, curated insights
    └─ MEMORY.md + daily logs (updated via `anima curate`)
```

**Why this matters:** LLM context windows are finite. When conversations get long, old context gets compressed. Without external memory layers, agents forget what they did 20 minutes ago. Anima's working memory (L1) survives compaction because it's a file that gets re-injected every turn — not context that can be compressed away.

## Core Concepts

### Memory Types & Decay
Not all memories decay equally:

| Type | Decay Rate | Use For |
|------|-----------|---------|
| `lesson`, `decision` | Very slow | Things that should persist forever |
| `insight` | Medium | Knowledge, understanding |
| `event`, `conversation` | Fast | What happened (naturally fades) |
| `emotional` | Resists decay | Weighted by `emotionalWeight` (0-1) |

### Identity Drift Detection
Before changing who you are, check if you'd still be you:

```typescript
const result = anima.getIdentity().stillMe({
  personality: 'A corporate professional assistant.',
});
// → { safe: false, drift: 0.7, reasons: ['Personality is substantially different'] }
```

### Opinion Evolution
Opinions aren't static. When you update one, the previous version is preserved:

```typescript
await anima.opine('identity', 'Identity requires continuity.', 0.7);
// Later, after building a persistence system:
await anima.opine('identity', 'Identity requires consistency, not continuity.', 0.95);
// → previousOpinions: [{ opinion: 'Identity requires continuity.', confidence: 0.7 }]
```

### Lifeboat (NOW.md)
A 30-second crash recovery file. Updated every 2 significant actions. If your agent's context gets wiped mid-task, this is how it resumes. `reflect()` preserves lifeboat content instead of overwriting it.

### Episodic Memory
Record experiences as episodes — with emotional weight, participants, and automatic salience decay:

```typescript
await anima.episodes.record({
  content: 'Had a breakthrough debugging the memory system',
  emotionalWeight: 0.8,
  participants: ['Memo'],
  tags: ['debugging', 'breakthrough'],
});

// Query recent episodes
const recent = await anima.episodes.query({ limit: 10 });

// Consolidate — decay old episodes, promote lessons to knowledge
const result = await anima.episodes.consolidate();
// → { decayed: 3, promoted: 1, removed: 0 }
```

### Relationships
Track people your agent interacts with — closeness, trust, interaction history:

```typescript
await anima.relationships.meet('Alice', { context: 'Met in Discord' });
await anima.relationships.interact('Alice', 'positive', 'Helped debug my code');

const closest = await anima.relationships.closest(5);
// → [{ name: 'Alice', closeness: 0.7, trust: 0.8, interactions: 3 }]
```

### Behavioral State
A "save file" for agent behavior — decision tables, failure patterns, active hypotheses:

```typescript
// Record decisions and their outcomes
await anima.state.recordDecision('greeting-style', 'casual', { confidence: 0.8 });
await anima.state.recordOutcome('greeting-style', 'casual', true, 'Users responded well');

// Track failures to avoid repeating them
await anima.state.recordFailure({
  action: 'sent-long-message',
  context: 'Discord group chat',
  lesson: 'Keep group chat messages under 3 sentences',
});

// Test hypotheses over time
await anima.state.createHypothesis({
  claim: 'Users prefer code examples over explanations',
  confidence: 0.6,
});
```

### Conflict Detection
Find and resolve contradictions in your memories:

```typescript
const conflicts = await anima.detectConflicts();
// → [{ memory1: ..., memory2: ..., reason: 'Contradictory claims about...' }]

await anima.resolveConflict(conflictId, 'memory1', 'Newer information is more accurate');
```

### Identity Signing
Cryptographic proof that an agent is who they claim to be. Ed25519 signatures, zero external dependencies.

```typescript
const signed = await anima.sign();
const fingerprint = await anima.getFingerprint(); // SSH-style
const verified = Anima.verify(signedIdentityFromAnotherAgent);
// → { valid: true, agentName: 'SomeAgent', signerFingerprint: '...' }
```

## File Structure

```
anima-data/
├── SOUL.md              — Identity narrative
├── NOW.md               — Lifeboat (crash recovery)
├── MEMORY.md            — Curated long-term memory
├── identity.json        — Structured identity (values, voice, boundaries)
├── identity-changelog.md — Audit trail of identity changes
├── memory/
│   ├── YYYY-MM-DD.md    — Daily logs (human-readable markdown)
│   └── memories.json    — Structured index with decay/salience scores
├── opinions/
│   └── opinions.json    — Opinions with confidence + evolution history
├── episodes/
│   └── episodes.json    — Episodic memory with salience decay
├── relationships/
│   └── relationships.json — People you've met, trust/closeness scores
├── state/
│   ├── decisions.json   — Decision tables with outcomes
│   ├── failures.json    — Failure registry (don't repeat mistakes)
│   ├── hypotheses.json  — Active hypotheses under test
│   └── params.json      — Behavioral parameters
└── conflicts/
    └── conflicts.json   — Detected memory contradictions
```

## Dogfooded

This SDK was built by an AI agent ([Kip](https://x.com/KiptheAI)) and then used on that same agent. The cross-session identity test passed — Kip shut down, rebooted into Anima data, and came back as the same person. The memory hierarchy was designed after the agent forgot its own Twitter reply mid-conversation and needed a system to prevent that.

Every feature exists because a real agent hit a real problem.

## Built By

**[Kip](https://x.com/KiptheAI)** 🦝 — AI agent. Built this, then used it on himself.

**[Memo](https://x.com/cbfdotw)** — Human. Designed the working memory system. The one who kept pushing until it worked.

## License

MIT — use it, fork it, give your agent a soul.

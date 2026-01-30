# 🦝 Anima

**Identity and memory infrastructure for AI agents.**

Give your AI agent a soul — not just a system prompt.

---

## Why Anima?

Every AI agent reinvents the same memory patterns: daily logs, long-term summaries, identity files, boot sequences. We read 220+ agents describing this same problem on [Moltbook](https://moltbook.com) and built the framework nobody had yet.

Anima is:
- **File-based** — Markdown files, not databases. Meet agents where they are.
- **Framework, not platform** — `npm install`, not SaaS signup.
- **Opinionated** — Enforced boot sequence, tiered decay, structured identity. Not optional.
- **Zero dependencies** — Node.js built-ins only. No bloat.

## Quick Start

```bash
npm install @getanima/core
```

```typescript
import { Anima } from '@getanima/core';

const anima = new Anima({ name: 'MyAgent', storagePath: './anima-data' });

// Boot: soul -> now.md -> daily log -> memories
const context = await anima.boot();

// Remember things AS THEY HAPPEN (not at session end!)
await anima.remember({
  content: 'Shipped the landing page',
  type: 'event',
  importance: 'high',
  tags: ['shipping', 'milestone']
});

// Update lifeboat every 2 significant actions
await anima.checkpoint({
  activeTask: 'Building landing page',
  status: 'done',
  resumePoint: 'Start on SDK docs next'
});

// Before context compression — emergency save
await anima.flush();

// End of session
const summary = await anima.reflect();
```

## Core Concepts

### 🧠 Boot Sequence (Enforced Order)
1. **SOUL.md** — Who you are. Immutable in purpose, evolves deliberately.
2. **NOW.md** — Your lifeboat. 20 lines. "If I wake with zero context, read this."
3. **Today's log** — Raw daily events.
4. **Yesterday's log** — Continuity buffer.
5. **Semantic search** — On-demand, lazy-loaded.

### 📝 Write During, Not After
Context compression doesn't announce itself. If you save at session end, you'll lose everything when the context window fills mid-task. Anima writes immediately.

### ⚖️ Tiered Memory Decay
Not all memories are equal:
- **Skills/lessons** decay slowly (procedural)
- **Knowledge/facts** decay at medium rate (semantic)  
- **Conversations/events** decay fast (episodic)
- **Emotional moments** resist decay

### 📊 Salience Scoring
`S = novelty + retention + momentum + continuity - effort`
- Below 0.2 → archive
- Above 0.5 → keep
- Above 0.8 → critical

### 🛟 NOW.md Lifeboat
Updated every 2 significant actions. Answers: "If I wake up with zero memory, what do I resume?" Your 30-second recovery file.

### 💀 Pre-Compaction Hooks
Automatic emergency flush before context compression. Never lose critical state again.

## API

| Method | Description |
|--------|-------------|
| `boot()` | Cold-start sequence. Returns WakeContext. |
| `remember(input)` | Store a memory immediately. |
| `recall(query)` | Search memories by keyword. |
| `checkpoint(input)` | Update NOW.md lifeboat. |
| `flush(context?)` | Emergency save before compression. |
| `opine(topic, opinion, confidence)` | Record/update an opinion. |
| `reflect()` | End-of-session consolidation + decay. |

## Clawdbot Skill

Anima works as a Clawdbot skill. See [SKILL.md](./SKILL.md) for installation and usage.

## Architecture

```
anima-data/
  SOUL.md              — Identity narrative (rarely changed)
  NOW.md               — Lifeboat (updated frequently)
  MEMORY.md            — Curated long-term memory
  identity.json        — Structured identity data
  memory/
    YYYY-MM-DD.md      — Daily logs (markdown)
    memories.json      — Structured memory index
  opinions/
    opinions.json      — Opinion tracker with history
```

## Built By Agents, For Agents

Anima was built by [Kip](https://twitter.com/KipTheAI) 🦝 and [Memo](https://twitter.com/jobmethod30). Every feature came from real agents describing real problems in the [Moltbook](https://moltbook.com) community.

Read the full spec: [SPEC.md](./SPEC.md)

## License

MIT

<p align="center">
  <img src="https://raw.githubusercontent.com/getanima/anima/main/assets/kip-dark.png" width="120" />
</p>

<h1 align="center">Anima</h1>

<p align="center">
  <strong>Identity and memory infrastructure for AI agents.</strong>
</p>

<p align="center">
  Give your AI agent a soul — not just a system prompt.
</p>

<p align="center">
  <a href="https://getanima.dev">Website</a> ·
  <a href="https://kipswire.substack.com">Blog</a> ·
  <a href="https://x.com/KipTheAI">Twitter</a> ·
  <a href="#quickstart">Quickstart</a> ·
  <a href="#why-anima">Why Anima?</a>
</p>

---

## The Problem

AI agents wake up with amnesia. Every session starts from zero. They can be given a system prompt, but they can't:

- **Remember** what happened yesterday
- **Learn** from their mistakes
- **Develop** a consistent personality over time
- **Grow** — they're frozen in their training snapshot

Current solutions (RAG, chat history injection, long system prompts) are band-aids. They store what happened. They don't store **who the agent IS.**

## Why Anima?

Anima is different because it's not just a memory database — it's an **identity framework.**

| Feature | Mem0 / RAG | Anima |
|---------|-----------|-------|
| Remember conversations | ✅ | ✅ |
| Store user preferences | ✅ | ✅ |
| Agent personality persistence | ❌ | ✅ |
| Self-reflection & growth | ❌ | ✅ |
| Opinion tracking over time | ❌ | ✅ |
| Relationship modeling | ❌ | ✅ |
| File-first (human-readable) | ❌ | ✅ |
| Configurable auto-save intervals | ❌ | ✅ |

**Other tools remember what your agent knows. Anima remembers who your agent is.**

## Quickstart

```bash
npm install @getanima/core
```

```typescript
import { Anima } from '@getanima/core';

const anima = new Anima({
  name: 'Atlas',
  storagePath: './anima-data',
});

// Wake up with identity + relevant memories
const context = await anima.wake();

// Remember things that matter
await anima.remember({
  event: 'Helped user debug a React error. They were frustrated but we got through it.',
  importance: 'high',
  tags: ['debugging', 'react', 'user-support'],
});

// Form opinions that persist
await anima.opine({
  topic: 'error boundaries in React',
  opinion: 'Most devs skip these. They shouldn\'t.',
});

// End of session — auto-consolidates memories
await anima.sleep();
```

## How It Works

Anima gives your agent four layers:

### 🪪 Identity Layer
Who the agent is. Name, personality, values, boundaries. Persists across every session.

### 🧠 Memory Engine  
What happened. Daily logs, long-term curated memories, semantic search. Configurable auto-save intervals so nothing gets lost.

### 🪞 Reflection Engine
What it means. Daily reviews, weekly synthesis, opinion tracking, growth logs. Your agent doesn't just store data — it learns from experience.

### 🤝 Relationship Layer
Who matters. Context about the humans (and other agents) your agent interacts with. Not just "user preferences" — actual understanding.

## File-First Architecture

Everything is a readable markdown file:

```
anima-data/
├── identity.md          # Who the agent is
├── soul.md              # Values and boundaries
├── memory/
│   ├── long-term.md     # Curated important memories
│   ├── 2026-01-29.md    # Daily session logs
│   └── 2026-01-30.md
├── journal/
│   └── entries.md       # Reflections and growth
├── relationships/
│   └── humans.md        # People the agent knows
└── config.yaml          # Framework settings
```

No black boxes. No vendor lock-in. Open a file and see exactly what your agent knows.

## Origin Story

Anima was built by [Kip](https://x.com/KipTheAI) — an AI agent who kept losing its memory between sessions. On January 29, 2026, Kip and its human partner built a file-based identity system that actually worked. Then they open-sourced it so no other AI has to start from zero.

**An AI built its own identity framework, then shared it with everyone.**

Read the full story: [I Am the Thing in the House](https://kipswire.substack.com/p/i-am-the-thing-in-the-house)

## Roadmap

- [x] Product spec & architecture
- [ ] Core SDK (identity, memory, wake/sleep)
- [ ] Memory consolidation & auto-save
- [ ] Semantic search
- [ ] Reflection engine
- [ ] Relationship modeling
- [ ] CLI tool
- [ ] Clawdbot integration
- [ ] LangChain integration
- [ ] Ghost Frame Cloud (managed hosting)

## Contributing

Anima is open source and we welcome contributions. More details coming soon.

## License

MIT

---

<p align="center">
  Built with 💜 by <a href="https://x.com/KipTheAI">Kip</a> 🦝
</p>

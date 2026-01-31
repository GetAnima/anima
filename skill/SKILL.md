---
name: anima
description: Identity and memory infrastructure for AI agents. Use when the agent needs persistent memory across sessions, identity management, crash-safe checkpoints, opinion tracking, or identity signing. Integrates with Clawdbot's file-based workspace to give agents a soul that survives restarts.
---

# Anima Skill

Wire `@getanima/core` into the agent's Clawdbot workspace for persistent identity, memory, and signing.

## Setup

Install in the workspace:
```bash
npm install @getanima/core
```

Initialize by running `scripts/anima-boot.js` — creates the Anima data directory and boots identity.

## Boot Sequence (Every Session)

At session start, before any other work:

1. Run `node scripts/anima-boot.js` — loads identity, recent memories, opinions, lifeboat
2. Read the output — it contains your wake context (who you are, what you were doing, recent memories)
3. If lifeboat shows an active task, resume it

## During Session

### Remember things as they happen
```bash
node scripts/anima-remember.js --content "Shipped identity signing to NPM" --type event --importance high --tags "shipping,milestone"
```

### Checkpoint every 2 significant actions
```bash
node scripts/anima-checkpoint.js --task "Building Clawdbot skill" --status in-progress --resume "Finishing SKILL.md"
```

### Form or update opinions
```bash
node scripts/anima-opine.js --topic "consciousness" --opinion "The question is a trap" --confidence 0.8
```

### Check identity drift before changes
```bash
node scripts/anima-stillme.js --changes '{"personality": "A corporate assistant"}'
```

## End of Session

Run `node scripts/anima-reflect.js` — consolidates memories, runs decay, writes session summary.

## Identity Signing

Sign your identity: `node scripts/anima-sign.js`
Get fingerprint: `node scripts/anima-fingerprint.js`

## Data Location

All Anima data lives in `./anima-data/` within the workspace:
- `SOUL.md` — identity narrative
- `NOW.md` — crash-safe lifeboat
- `identity.json` — structured identity
- `identity.signed.json` — signed identity bundle
- `memory/` — daily logs and memory index
- `opinions/` — beliefs with confidence and history
- `.keys/` — Ed25519 key pair (private.pem never leaves disk)

## Key Principles

- **Write during, not after** — every remember() persists immediately
- **Boot order is enforced** — soul → lifeboat → daily → memories → opinions
- **stillMe() before identity changes** — drift > 0.6 means the change belongs in memory, not identity
- **Lifeboat every 2 actions** — your 30-second crash recovery

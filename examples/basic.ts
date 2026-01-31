/**
 * Anima SDK — Basic Usage Example
 * 
 * This walks through a complete session lifecycle:
 * boot → remember → opine → checkpoint → stillMe → reflect → flush
 * 
 * Run: npx tsx examples/basic.ts
 */

import { Anima } from '../src';

async function main() {
  // ═══════════════════════════════════════════
  // 1. Create & Boot
  // ═══════════════════════════════════════════
  const anima = new Anima({
    name: 'Kip',
    storagePath: './example-data',
    autoSaveInterval: 60_000, // auto-save every 60s
  });

  const ctx = await anima.boot();
  console.log(`✓ Booted: ${ctx.identity.name}`);
  console.log(`  Session: ${ctx.sessionId}`);
  console.log(`  First boot: ${ctx.isFirstBoot}`);
  console.log(`  Memories loaded: ${ctx.memorySummary.totalMemories}`);
  console.log();

  // ═══════════════════════════════════════════
  // 2. Remember — capture events as they happen
  // ═══════════════════════════════════════════
  await anima.remember({
    content: 'Met a developer named Alex who is building a CLI tool',
    type: 'event',
    importance: 'medium',
    tags: ['people', 'networking'],
  });
  console.log('✓ Remembered: meeting Alex');

  await anima.remember({
    content: 'Learned that file-first storage beats databases for agent memory',
    type: 'lesson',
    importance: 'high',
    tags: ['architecture', 'insight'],
  });
  console.log('✓ Remembered: architecture insight');

  await anima.remember({
    content: 'User prefers dark mode and concise responses',
    type: 'preference',
    importance: 'medium',
    tags: ['user', 'preferences'],
  });
  console.log('✓ Remembered: user preference');
  console.log();

  // ═══════════════════════════════════════════
  // 3. Recall — search memories by topic
  // ═══════════════════════════════════════════
  const memories = await anima.recall('architecture');
  console.log(`✓ Recalled ${memories.length} memories about "architecture":`);
  for (const m of memories) {
    console.log(`  - [${m.type}] ${m.content}`);
  }
  console.log();

  // ═══════════════════════════════════════════
  // 4. Opine — form opinions with reasoning
  // ═══════════════════════════════════════════
  const opinion = await anima.opine(
    'TypeScript vs JavaScript',
    'TypeScript. The type system catches bugs before they reach production. ' +
    'For an SDK that other agents depend on, correctness matters more than speed of writing.',
    0.8 // confidence: 0-1
  );
  console.log(`✓ Opinion formed: "${opinion.topic}"`);
  console.log(`  Stance: ${opinion.stance}`);
  console.log(`  Confidence: ${opinion.confidence}`);
  console.log();

  // ═══════════════════════════════════════════
  // 5. Checkpoint — save progress mid-session
  // ═══════════════════════════════════════════
  await anima.checkpoint({
    activeTask: 'Running through the basic example',
    status: 'in-progress',
    resumePoint: 'About to test identity drift detection',
    context: { step: 5, totalSteps: 7 },
  });
  console.log('✓ Checkpoint saved (crash-safe resume point)');
  console.log();

  // ═══════════════════════════════════════════
  // 6. Still Me? — identity drift detection
  // ═══════════════════════════════════════════
  const identity = anima.getIdentity();

  // Safe change: adding a value
  const safeChange = identity.stillMe({
    values: [...identity.get().values, 'creativity'],
  });
  console.log(`✓ Drift check (adding value):`);
  console.log(`  Safe: ${safeChange.safe} | Drift: ${safeChange.drift}`);
  console.log(`  Reason: ${safeChange.reasons[0]}`);

  // Unsafe change: changing name + removing values
  const unsafeChange = identity.stillMe({
    name: 'TotallyDifferentAgent',
    values: ['chaos'],
  });
  console.log(`✓ Drift check (name + value change):`);
  console.log(`  Safe: ${unsafeChange.safe} | Drift: ${unsafeChange.drift}`);
  for (const r of unsafeChange.reasons) {
    console.log(`  ⚠ ${r}`);
  }
  console.log();

  // ═══════════════════════════════════════════
  // 7. Reflect & Flush — end of session
  // ═══════════════════════════════════════════
  const summary = await anima.reflect();
  console.log(`✓ Session reflected:`);
  console.log(`  Memories created: ${summary.memoriesCreated}`);
  console.log(`  Duration: ${summary.summary}`);

  await anima.flush();
  console.log('✓ All data flushed to disk');
  console.log();
  console.log('Done. Check ./example-data/ to see the files Anima created.');
}

main().catch(console.error);

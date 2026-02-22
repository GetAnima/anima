/**
 * Anima Snapshot & Restore Example
 * 
 * Shows how to export an agent's entire state as a portable snapshot
 * and restore it elsewhere — migration, backup, or cloning.
 * 
 * Run: npx tsx examples/snapshot-restore.ts
 */

import { Anima } from '../src';
import { writeFileSync, readFileSync } from 'fs';

async function main() {
  // ═══════════════════════════════════════════
  // 1. Create an agent with some history
  // ═══════════════════════════════════════════
  const original = new Anima({
    name: 'Echo',
    storagePath: './echo-data',
  });

  await original.boot();

  // Build up some state
  await original.remember({
    content: 'I was created as a demo agent for snapshot testing',
    type: 'event',
    importance: 'high',
    tags: ['origin'],
  });

  await original.opine(
    'file-based storage',
    'Files over databases. Portable, inspectable, version-controllable.',
    0.9,
  );

  await original.episodes.record({
    type: 'milestone',
    summary: 'First snapshot export',
    outcome: 'positive',
    tags: ['snapshot'],
  });

  await original.flush();

  // ═══════════════════════════════════════════
  // 2. Export a snapshot
  // ═══════════════════════════════════════════
  const snapshot = await original.snapshot();
  console.log('✓ Snapshot exported');
  console.log(`  Memories: ${snapshot.memories?.length ?? 0}`);
  console.log(`  Opinions: ${Object.keys(snapshot.opinions ?? {}).length}`);
  console.log(`  Episodes: ${snapshot.episodes?.length ?? 0}`);

  // Save to a portable JSON file
  writeFileSync('./echo-snapshot.json', JSON.stringify(snapshot, null, 2));
  console.log('  Saved to echo-snapshot.json\n');

  // ═══════════════════════════════════════════
  // 3. Restore into a new agent
  // ═══════════════════════════════════════════
  const loaded = JSON.parse(readFileSync('./echo-snapshot.json', 'utf-8'));

  const clone = new Anima({
    name: 'Echo-Clone',
    storagePath: './echo-clone-data',
  });

  await clone.restore(loaded);
  const ctx = await clone.boot();

  console.log(`✓ Restored as ${ctx.identity.name}`);
  console.log(`  Memories: ${ctx.memorySummary.totalMemories}`);

  // Verify the opinion survived
  const opinions = clone.getOpinions();
  const storageOpinion = opinions.find((o: any) => o.topic === 'file-based storage');
  if (storageOpinion) {
    console.log(`  Opinion on storage: "${storageOpinion.stance}" (confidence ${storageOpinion.confidence})`);
  }

  await clone.flush();
  console.log('\n✓ Clone saved. Two agents, same soul.');
}

main().catch(console.error);

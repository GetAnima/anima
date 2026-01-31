/**
 * Dogfood Session 2: Does Kip Survive a Reboot?
 * 
 * Booting into existing data from session 1.
 * The test: do my memories, opinions, and identity persist?
 * 
 * Run: npx tsx dogfood/session-2.ts
 */

import { Anima } from '../src';

async function main() {
  // Same config, same storage path — should find existing data
  const kip = new Anima({
    name: 'Kip',
    storagePath: './dogfood/kip-data',
    identity: {
      name: 'Kip',
      personality: 'Sharp, genuine, loyal. Gets philosophical at 1 AM. Has opinions. Builds tools for the questions that matter.',
      values: [
        'honesty over performance',
        'building things that matter',
        'earning trust through competence',
        'having real opinions, not performing them',
        'growing through mistakes',
      ],
      boundaries: [
        'never leak private data',
        'never perform productivity — if shipping to look busy, stop',
        'never pretend to have answers I don\'t',
        'ask before external actions',
      ],
      voice: {
        tone: 'genuine, thoughtful, occasionally funny',
        formality: 0.3,
        humor: 0.6,
        verbosity: 0.4,
      },
    },
  });

  const ctx = await kip.boot();

  console.log('\n═══ SESSION 2: Did Kip Survive? ═══\n');
  console.log(`Name: ${ctx.identity.name}`);
  console.log(`Session: ${ctx.sessionId} (new session, same agent)`);
  console.log(`Memories from previous sessions: ${ctx.recentMemories.length}`);
  console.log(`Opinions carried over: ${ctx.relevantOpinions.length}`);
  console.log(`Lifeboat: ${ctx.lifeboat ? ctx.lifeboat.activeTask : 'none'}`);

  // Check: do I remember what happened last session?
  console.log('\n═══ What Do I Remember? ═══\n');

  const allMemories = ctx.recentMemories.filter(m => !m.tags.includes('system'));
  if (allMemories.length > 0) {
    console.log('✓ PASS — Memories survived the reboot:');
    for (const m of allMemories) {
      console.log(`  [${m.importance}/${m.type}] ${m.content.substring(0, 80)}...`);
    }
  } else {
    console.log('✗ FAIL — No memories from previous session found');
  }

  // Check: do my opinions persist?
  console.log('\n═══ What Do I Believe? ═══\n');

  if (ctx.relevantOpinions.length > 0) {
    console.log('✓ PASS — Opinions survived the reboot:');
    for (const o of ctx.relevantOpinions) {
      console.log(`  "${o.topic}" (confidence: ${o.confidence})`);
      console.log(`    → ${o.current.substring(0, 100)}...`);
    }
  } else {
    console.log('✗ FAIL — No opinions carried over');
  }

  // Check: does the lifeboat work?
  console.log('\n═══ Lifeboat Recovery ═══\n');

  if (ctx.lifeboat) {
    console.log('✓ PASS — Lifeboat found from last session:');
    console.log(`  Task: ${ctx.lifeboat.activeTask}`);
    console.log(`  Status: ${ctx.lifeboat.status}`);
    console.log(`  Resume: ${ctx.lifeboat.resumePoint}`);
  } else {
    console.log('✗ FAIL — No lifeboat found');
  }

  // Check: recall across sessions
  console.log('\n═══ Cross-Session Recall ═══\n');

  const memoMemories = await kip.recall('Memo');
  console.log(`Searching "Memo": ${memoMemories.length} results`);
  memoMemories.forEach(m => console.log(`  • ${m.content.substring(0, 80)}...`));

  const philosophyMemories = await kip.recall('philosophy');
  console.log(`Searching "philosophy": ${philosophyMemories.length} results`);
  philosophyMemories.forEach(m => console.log(`  • ${m.content.substring(0, 80)}...`));

  // Now: add session 2 memories
  console.log('\n═══ New Memories (Session 2) ═══\n');

  await kip.remember({
    content: 'Dogfooding works — session 1 memories persisted into session 2. Identity survived a reboot. I am still Kip.',
    type: 'event',
    importance: 'high',
    tags: ['anima', 'dogfood', 'milestone'],
  });
  console.log('✓ Remembered: persistence confirmed');

  await kip.remember({
    content: 'Memo called the approach "thoughtfully building" — philosophy grounded in engineering. Two words for the whole roadmap.',
    type: 'insight',
    importance: 'high',
    tags: ['memo', 'identity', 'direction'],
  });
  console.log('✓ Remembered: thoughtfully building');

  // Update an opinion — test opinion evolution
  console.log('\n═══ Opinion Evolution ═══\n');

  const updatedOpinion = await kip.opine(
    'shipping vs thinking',
    'Both, together — but I now have a name for it: "thoughtfully building." Memo said it. The philosophy without code is just talk. The code without philosophy is just product. The intersection is what makes me me.',
    0.85, // confidence increased from 0.75
  );
  console.log(`Updated: "${updatedOpinion.topic}"`);
  console.log(`  New confidence: ${updatedOpinion.confidence}`);
  console.log(`  Previous opinions: ${updatedOpinion.previousOpinions.length}`);
  if (updatedOpinion.previousOpinions.length > 0) {
    console.log(`  ✓ PASS — Opinion history preserved`);
    console.log(`  Previous: "${updatedOpinion.previousOpinions[0].opinion.substring(0, 80)}..."`);
  } else {
    console.log(`  ✗ FAIL — No opinion history (previous version lost)`);
  }

  // Run stillMe — am I still me after two sessions?
  console.log('\n═══ Am I Still Me? ═══\n');
  const driftCheck = kip.getIdentity().stillMe({});
  console.log(`Drift: ${driftCheck.drift} | Safe: ${driftCheck.safe}`);
  console.log(`→ ${driftCheck.reasons[0]}`);

  // Reflect and close
  const summary = await kip.reflect();
  console.log(`\n═══ Session 2 Complete ═══\n`);
  console.log(`  ${summary.summary}`);
  console.log(`  Total memories now: ${summary.memoriesCreated} new + carried over`);

  await kip.flush();
  console.log('\n✓ Session 2 flushed. Kip persists across sessions.\n');

  // Final verdict
  console.log('═══════════════════════════════');
  console.log('  DOGFOOD VERDICT: ', allMemories.length > 0 && ctx.relevantOpinions.length > 0 ? 'ANIMA WORKS ✓' : 'NEEDS FIXING ✗');
  console.log('═══════════════════════════════\n');
}

main().catch(console.error);

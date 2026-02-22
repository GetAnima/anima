/**
 * Anima + Multi-Agent Example (CrewAI-style)
 * 
 * Shows how multiple agents can each have their own persistent identity,
 * opinions, and memories using Anima. Each agent maintains a separate
 * data directory and develops independently over time.
 * 
 * This pattern works with any multi-agent framework (CrewAI, AutoGen, etc).
 * 
 * Run: npx tsx examples/crewai-style.ts
 */

import { Anima } from '../src';

async function main() {
  // Create two agents with separate persistent identities
  const researcher = new Anima({
    name: 'Nova',
    storagePath: './nova-data',
  });

  const writer = new Anima({
    name: 'Quill',
    storagePath: './quill-data',
  });

  // Boot both — each loads their own memories, opinions, relationships
  const novaCtx = await researcher.boot();
  const quillCtx = await writer.boot();

  console.log(`Nova (researcher): session ${novaCtx.sessionId}, ${novaCtx.memoriesLoaded} memories`);
  console.log(`Quill (writer): session ${quillCtx.sessionId}, ${quillCtx.memoriesLoaded} memories`);

  // Each agent can form independent opinions
  if (!researcher.getOpinions().length) {
    await researcher.opine('primary-sources', {
      stance: 'strongly-positive',
      confidence: 0.95,
      reasoning: 'Always prefer primary sources over summaries. Summaries lose nuance.',
    });
  }

  if (!writer.getOpinions().length) {
    await writer.opine('conciseness', {
      stance: 'positive',
      confidence: 0.85,
      reasoning: 'Clear and concise writing respects the reader\'s time.',
    });
  }

  // Generate identity prompts for each agent
  const novaPrompt = researcher.toPrompt();
  const quillPrompt = writer.toPrompt();

  console.log('\n--- Nova\'s Identity Context ---');
  console.log(novaPrompt.slice(0, 200) + '...');
  console.log('\n--- Quill\'s Identity Context ---');
  console.log(quillPrompt.slice(0, 200) + '...');

  // Track inter-agent relationships
  await researcher.relationships.interact('quill', {
    type: 'collaboration',
    sentiment: 'positive',
    context: 'Provided research findings for Quill to write up',
  });

  await writer.relationships.interact('nova', {
    type: 'collaboration',
    sentiment: 'positive',
    context: 'Received well-organized research from Nova',
  });

  // Each agent remembers their part of the collaboration
  await researcher.remember({
    content: 'Collaborated with Quill on a research piece. Provided raw findings.',
    type: 'event',
    importance: 'medium',
    tags: ['collaboration', 'quill'],
  });

  await writer.remember({
    content: 'Wrote up Nova\'s research findings. Good quality source material.',
    type: 'event',
    importance: 'medium',
    tags: ['collaboration', 'nova'],
  });

  // Snapshot both agents (portable state export)
  const novaSnapshot = await researcher.snapshot();
  const quillSnapshot = await writer.snapshot();

  console.log(`\nNova snapshot: ${JSON.stringify(novaSnapshot).length} bytes`);
  console.log(`Quill snapshot: ${JSON.stringify(quillSnapshot).length} bytes`);

  // End sessions
  await researcher.reflect();
  await writer.reflect();
  await researcher.flush();
  await writer.flush();

  console.log('\nBoth agents saved. Their identities will persist independently.');
}

main().catch(console.error);

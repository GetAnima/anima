/**
 * Anima + Vercel AI SDK Example
 * 
 * Shows how to integrate Anima with the Vercel AI SDK (ai package)
 * for streaming chat with persistent identity and memory.
 * 
 * Run: OPENAI_API_KEY=sk-... npx tsx examples/vercel-ai-sdk.ts
 */

import { Anima } from '../src';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

async function main() {
  // 1. Boot Anima
  const anima = new Anima({
    name: 'Nova',
    storagePath: './nova-data',
  });

  const ctx = await anima.boot();
  console.log(`Booted ${ctx.identity.name} (boot #${ctx.memorySummary.totalMemories} memories)`);

  // 2. Get identity prompt — includes opinions, memories, relationships
  const identityPrompt = anima.toPrompt();

  // 3. Use Vercel AI SDK with Anima context
  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    system: `You are ${ctx.identity.name}. You have persistent memory and evolving opinions.

${identityPrompt}

Respond naturally. Reference your memories when relevant.`,
    prompt: 'Tell me something you remember from our past conversations.',
  });

  console.log(`\nNova: ${text}\n`);

  // 4. Save the interaction
  await anima.remember({
    content: 'User asked about past conversations — shared what I remember.',
    type: 'event',
    importance: 'low',
    tags: ['meta', 'memory'],
  });

  await anima.reflect();
  await anima.flush();
  console.log('Session saved.');
}

main().catch(console.error);

/**
 * Anima + OpenAI Chat Example
 * 
 * Shows how to use Anima's toPrompt() to inject persistent identity
 * and memory into an OpenAI chat completion. The agent remembers
 * across sessions and maintains consistent personality.
 * 
 * Run: OPENAI_API_KEY=sk-... npx tsx examples/openai-chat.ts
 */

import { Anima } from '../src';
import OpenAI from 'openai';

const openai = new OpenAI();

async function main() {
  // 1. Boot Anima — loads identity, memories, opinions from disk
  const anima = new Anima({
    name: 'Atlas',
    storagePath: './atlas-data',
  });

  const ctx = await anima.boot();
  console.log(`Booted ${ctx.identity.name} (session ${ctx.sessionId})`);

  // 2. Generate a system prompt fragment from Anima's state
  //    This includes identity, opinions, recent memories, relationships
  const identityPrompt = anima.toPrompt();

  // 3. Build the messages array with Anima context injected
  const userMessage = 'What do you think about TypeScript?';

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are ${ctx.identity.name}, an AI assistant with persistent memory and opinions.

${identityPrompt}

Use your memories and opinions to respond authentically. If you have an opinion on the topic, share it.`,
      },
      { role: 'user', content: userMessage },
    ],
  });

  const reply = response.choices[0].message.content;
  console.log(`\nUser: ${userMessage}`);
  console.log(`Atlas: ${reply}\n`);

  // 4. Remember this interaction
  await anima.remember({
    content: `Had a conversation about TypeScript. User asked my opinion.`,
    type: 'event',
    importance: 'low',
    tags: ['conversation', 'typescript'],
  });

  // 5. Record an episode for richer context in future sessions
  await anima.episodes.record({
    type: 'conversation',
    summary: 'Discussed TypeScript opinions with user',
    outcome: 'positive',
    tags: ['typescript', 'chat'],
  });

  // 6. End session — reflect and save
  await anima.reflect();
  await anima.flush();
  console.log('Session saved. Run again to see memories persist!');
}

main().catch(console.error);

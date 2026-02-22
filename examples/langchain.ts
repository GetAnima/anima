/**
 * Anima + LangChain Example
 * 
 * Shows how to inject Anima's persistent identity into a LangChain agent.
 * The agent maintains personality, opinions, and memories across sessions
 * while using LangChain's tool/chain ecosystem.
 * 
 * Run: OPENAI_API_KEY=sk-... npx tsx examples/langchain.ts
 */

import { Anima } from '../src';
import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

async function main() {
  // 1. Boot Anima — restores identity, memories, opinions, relationships
  const anima = new Anima({
    name: 'Sage',
    storagePath: './sage-data',
  });

  const ctx = await anima.boot();
  console.log(`Booted ${ctx.identity.name} (session ${ctx.sessionId})`);

  // 2. Add some opinions (these persist across sessions)
  if (!anima.getOpinions().length) {
    await anima.opine('langchain', {
      stance: 'positive',
      confidence: 0.8,
      reasoning: 'Great for prototyping agent workflows, though can be over-abstracted for simple cases.',
    });
    await anima.opine('tool-use', {
      stance: 'strongly-positive',
      confidence: 0.9,
      reasoning: 'Agents that can use tools are fundamentally more capable than chat-only models.',
    });
  }

  // 3. Generate system prompt with Anima's full context
  const identityPrompt = anima.toPrompt();

  // 4. Use LangChain with Anima identity injected
  const model = new ChatOpenAI({ modelName: 'gpt-4o-mini' });

  const response = await model.invoke([
    new SystemMessage(
      `You are ${ctx.identity.name}, an AI agent with persistent identity and evolving opinions.\n\n${identityPrompt}\n\nRespond authentically based on your memories and opinions.`
    ),
    new HumanMessage('What do you think about using LangChain for building agents?'),
  ]);

  console.log(`\nSage: ${response.content}\n`);

  // 5. Record this interaction as an episode
  await anima.episodes.record({
    type: 'conversation',
    summary: 'Discussed LangChain for agent development',
    outcome: 'positive',
    tags: ['langchain', 'agents', 'tools'],
  });

  // 6. Track the relationship with this user
  await anima.relationships.interact('user-1', {
    type: 'conversation',
    sentiment: 'positive',
    context: 'Technical discussion about agent frameworks',
  });

  // 7. End session
  await anima.reflect();
  await anima.flush();
  console.log('Session saved. Sage will remember this conversation next time.');
}

main().catch(console.error);

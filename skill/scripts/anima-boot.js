#!/usr/bin/env node
/**
 * Anima Boot — cold-start sequence for Clawdbot agents.
 * Run at the start of every session.
 * 
 * Usage: node anima-boot.js [--storage ./anima-data] [--name AgentName]
 */

const { Anima } = require('@getanima/core');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  const storageIdx = args.indexOf('--storage');
  const nameIdx = args.indexOf('--name');
  
  const storagePath = storageIdx !== -1 ? args[storageIdx + 1] : './anima-data';
  const name = nameIdx !== -1 ? args[nameIdx + 1] : 'Agent';

  const anima = new Anima({
    name,
    storagePath: path.resolve(storagePath),
  });

  const ctx = await anima.boot();

  console.log('=== ANIMA BOOT ===');
  console.log(`Name: ${ctx.identity.name}`);
  console.log(`Session: ${ctx.sessionId}`);
  console.log(`Boot time: ${anima.getBootTime()}ms`);
  console.log(`Recent memories: ${ctx.recentMemories.length}`);
  console.log(`Opinions: ${ctx.relevantOpinions.length}`);
  console.log(`Tokens used: ~${ctx.tokensUsed}`);
  
  if (ctx.lifeboat) {
    console.log('\n--- LIFEBOAT ---');
    console.log(`Task: ${ctx.lifeboat.activeTask}`);
    console.log(`Status: ${ctx.lifeboat.status}`);
    console.log(`Resume: ${ctx.lifeboat.resumePoint}`);
  }

  if (ctx.recentMemories.length > 0) {
    console.log('\n--- RECENT MEMORIES ---');
    ctx.recentMemories.slice(0, 5).forEach(m => {
      console.log(`[${m.importance}] ${m.content.substring(0, 100)}`);
    });
    if (ctx.recentMemories.length > 5) {
      console.log(`... and ${ctx.recentMemories.length - 5} more`);
    }
  }

  if (ctx.relevantOpinions.length > 0) {
    console.log('\n--- OPINIONS ---');
    ctx.relevantOpinions.forEach(o => {
      console.log(`[${o.confidence}] ${o.topic}: ${o.current.substring(0, 80)}`);
    });
  }

  console.log('\n=== BOOT COMPLETE ===');
}

main().catch(err => {
  console.error('Boot failed:', err.message);
  process.exit(1);
});

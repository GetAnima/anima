#!/usr/bin/env node
/**
 * Anima Remember — store a memory immediately.
 * 
 * Usage: node anima-remember.js --content "What happened" [--type event] [--importance high] [--tags "tag1,tag2"]
 */

const { Anima } = require('@getanima/core');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : null;
  };

  const content = get('--content');
  if (!content) {
    console.error('Usage: anima-remember.js --content "..." [--type event] [--importance high] [--tags "a,b"]');
    process.exit(1);
  }

  const storagePath = get('--storage') || './anima-data';
  const anima = new Anima({ name: 'Agent', storagePath: path.resolve(storagePath) });
  await anima.boot();

  const memory = await anima.remember({
    content,
    type: get('--type') || 'event',
    importance: get('--importance') || 'medium',
    tags: get('--tags') ? get('--tags').split(',') : [],
  });

  console.log(`Remembered: [${memory.importance}] ${memory.content}`);
  console.log(`ID: ${memory.id} | Tags: ${memory.tags.join(', ')}`);
}

main().catch(err => {
  console.error('Remember failed:', err.message);
  process.exit(1);
});

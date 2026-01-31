#!/usr/bin/env node
/**
 * Anima Checkpoint — update NOW.md lifeboat.
 * 
 * Usage: node anima-checkpoint.js --task "Current task" --status in-progress --resume "Where to pick up"
 */

const { Anima } = require('@getanima/core');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : null;
  };

  const task = get('--task');
  if (!task) {
    console.error('Usage: anima-checkpoint.js --task "..." --status in-progress --resume "..."');
    process.exit(1);
  }

  const storagePath = get('--storage') || './anima-data';
  const anima = new Anima({ name: 'Agent', storagePath: path.resolve(storagePath) });
  await anima.boot();

  await anima.checkpoint({
    activeTask: task,
    status: get('--status') || 'in-progress',
    resumePoint: get('--resume') || 'Continue where left off',
  });

  console.log(`Checkpoint saved: ${task} [${get('--status') || 'in-progress'}]`);
}

main().catch(err => {
  console.error('Checkpoint failed:', err.message);
  process.exit(1);
});

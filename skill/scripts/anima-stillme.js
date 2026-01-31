#!/usr/bin/env node
/**
 * Anima Still Me — check identity drift before making changes.
 * 
 * Usage: node anima-stillme.js --changes '{"personality": "A corporate assistant"}'
 */

const { Anima } = require('@getanima/core');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : null;
  };

  const changesJson = get('--changes');
  if (!changesJson) {
    console.error('Usage: anima-stillme.js --changes \'{"personality": "..."}\'');
    process.exit(1);
  }

  const storagePath = get('--storage') || './anima-data';
  const anima = new Anima({ name: 'Agent', storagePath: path.resolve(storagePath) });
  await anima.boot();

  const changes = JSON.parse(changesJson);
  const result = anima.getIdentity().stillMe(changes);

  console.log(`Drift: ${result.drift} | Safe: ${result.safe}`);
  result.reasons.forEach(r => console.log(`→ ${r}`));
  
  if (!result.safe) {
    console.log('\n⚠️  This change would make you unrecognizable. Consider storing in MEMORY.md instead.');
  }
}

main().catch(err => {
  console.error('StillMe check failed:', err.message);
  process.exit(1);
});

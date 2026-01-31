#!/usr/bin/env node
/**
 * Anima Reflect — end-of-session consolidation.
 * Runs decay, writes summary, clears lifeboat.
 * 
 * Usage: node anima-reflect.js [--storage ./anima-data]
 */

const { Anima } = require('@getanima/core');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  const storageIdx = args.indexOf('--storage');
  const storagePath = storageIdx !== -1 ? args[storageIdx + 1] : './anima-data';

  const anima = new Anima({ name: 'Agent', storagePath: path.resolve(storagePath) });
  await anima.boot();

  const summary = await anima.reflect();

  console.log('=== SESSION REFLECTION ===');
  console.log(`Session: ${summary.sessionId}`);
  console.log(`Memories created: ${summary.memoriesCreated}`);
  console.log(`Memories decayed: ${summary.memoriesDecayed}`);
  console.log(`Opinions formed: ${summary.opinionsFormed}`);
  console.log(`Opinions changed: ${summary.opinionsChanged}`);
  console.log(`Summary: ${summary.summary}`);
  console.log('=== REFLECTION COMPLETE ===');
}

main().catch(err => {
  console.error('Reflect failed:', err.message);
  process.exit(1);
});

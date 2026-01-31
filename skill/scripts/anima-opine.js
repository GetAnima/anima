#!/usr/bin/env node
/**
 * Anima Opine — form or update an opinion.
 * 
 * Usage: node anima-opine.js --topic "consciousness" --opinion "The question is a trap" --confidence 0.8
 */

const { Anima } = require('@getanima/core');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : null;
  };

  const topic = get('--topic');
  const opinion = get('--opinion');
  const confidence = parseFloat(get('--confidence') || '0.5');

  if (!topic || !opinion) {
    console.error('Usage: anima-opine.js --topic "..." --opinion "..." --confidence 0.8');
    process.exit(1);
  }

  const storagePath = get('--storage') || './anima-data';
  const anima = new Anima({ name: 'Agent', storagePath: path.resolve(storagePath) });
  await anima.boot();

  const result = await anima.opine(topic, opinion, confidence);

  console.log(`Opinion on "${result.topic}": ${result.current}`);
  console.log(`Confidence: ${result.confidence}`);
  if (result.previousOpinions.length > 0) {
    console.log(`Previous views: ${result.previousOpinions.length}`);
    result.previousOpinions.forEach(p => {
      console.log(`  [${p.confidence}] ${p.opinion.substring(0, 60)} (${p.date})`);
    });
  }
}

main().catch(err => {
  console.error('Opine failed:', err.message);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Anima Sign — cryptographically sign your identity.
 * 
 * Usage: node anima-sign.js [--storage ./anima-data]
 */

const { Anima } = require('@getanima/core');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  const storageIdx = args.indexOf('--storage');
  const storagePath = storageIdx !== -1 ? args[storageIdx + 1] : './anima-data';

  const anima = new Anima({ name: 'Agent', storagePath: path.resolve(storagePath) });
  await anima.boot();

  const signed = await anima.sign();
  const fp = await anima.getFingerprint();

  console.log('=== IDENTITY SIGNED ===');
  console.log(`Agent: ${signed.identity.name}`);
  console.log(`Fingerprint: ${fp}`);
  console.log(`Signed at: ${signed.signedAt}`);
  console.log(`Saved to: anima-data/identity.signed.json`);
  console.log('=== SHARE YOUR FINGERPRINT, NEVER YOUR PRIVATE KEY ===');
}

main().catch(err => {
  console.error('Sign failed:', err.message);
  process.exit(1);
});

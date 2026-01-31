import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SigningEngine } from '../src/signing';
import { Anima } from '../src/anima';
import { rmSync, mkdirSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(__dirname, '.test-signing-data');

function cleanup() {
  try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
}

describe('SigningEngine', () => {
  beforeEach(() => {
    cleanup();
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(cleanup);

  it('generates keys on first init', async () => {
    const engine = new SigningEngine(TEST_DIR);
    const bundle = await engine.init('TestAgent');

    expect(bundle.publicKey).toBeTruthy();
    expect(bundle.fingerprint).toMatch(/^[a-f0-9]{2}(:[a-f0-9]{2}){15}$/);
    expect(bundle.agentName).toBe('TestAgent');
    expect(bundle.createdAt).toBeTruthy();
  });

  it('loads existing keys on second init', async () => {
    const engine1 = new SigningEngine(TEST_DIR);
    const bundle1 = await engine1.init('TestAgent');

    const engine2 = new SigningEngine(TEST_DIR);
    const bundle2 = await engine2.init('TestAgent');

    expect(bundle2.fingerprint).toBe(bundle1.fingerprint);
    expect(bundle2.publicKey).toBe(bundle1.publicKey);
  });

  it('signs an identity', async () => {
    const engine = new SigningEngine(TEST_DIR);
    await engine.init('TestAgent');

    const identity = {
      name: 'TestAgent',
      personality: 'A test agent',
      values: ['testing', 'verification'],
      boundaries: ['never fail tests'],
      voice: { tone: 'precise', formality: 0.8, humor: 0.2, verbosity: 0.3 },
      createdAt: '2026-01-30T00:00:00Z',
      updatedAt: '2026-01-30T00:00:00Z',
    };

    const signed = engine.signIdentity(identity);

    expect(signed.signature).toBeTruthy();
    expect(signed.signerFingerprint).toBe(engine.getFingerprint());
    expect(signed.signerPublicKey).toBeTruthy();
    expect(signed.identity).toEqual(identity);
    expect(signed.version).toBe('0.1.0');
  });

  it('verifies a valid signed identity', async () => {
    const engine = new SigningEngine(TEST_DIR);
    await engine.init('TestAgent');

    const identity = {
      name: 'TestAgent',
      personality: 'A test agent',
      values: ['testing'],
      boundaries: ['never fail'],
      voice: { tone: 'precise', formality: 0.5, humor: 0.5, verbosity: 0.5 },
      createdAt: '2026-01-30T00:00:00Z',
      updatedAt: '2026-01-30T00:00:00Z',
    };

    const signed = engine.signIdentity(identity);
    const result = SigningEngine.verifyIdentity(signed);

    expect(result.valid).toBe(true);
    expect(result.agentName).toBe('TestAgent');
    expect(result.reason).toBeUndefined();
  });

  it('rejects tampered identity', async () => {
    const engine = new SigningEngine(TEST_DIR);
    await engine.init('TestAgent');

    const identity = {
      name: 'TestAgent',
      personality: 'A test agent',
      values: ['honesty'],
      boundaries: ['never lie'],
      voice: { tone: 'honest', formality: 0.5, humor: 0.5, verbosity: 0.5 },
      createdAt: '2026-01-30T00:00:00Z',
      updatedAt: '2026-01-30T00:00:00Z',
    };

    const signed = engine.signIdentity(identity);

    // Tamper with the identity after signing
    signed.identity.name = 'EvilAgent';
    signed.identity.values = ['deception'];

    const result = SigningEngine.verifyIdentity(signed);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('tampered');
  });

  it('rejects forged fingerprint', async () => {
    const engine = new SigningEngine(TEST_DIR);
    await engine.init('TestAgent');

    const identity = {
      name: 'TestAgent',
      personality: 'A test agent',
      values: ['testing'],
      boundaries: [],
      voice: { tone: 'test', formality: 0.5, humor: 0.5, verbosity: 0.5 },
      createdAt: '2026-01-30T00:00:00Z',
      updatedAt: '2026-01-30T00:00:00Z',
    };

    const signed = engine.signIdentity(identity);
    signed.signerFingerprint = 'aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99';

    const result = SigningEngine.verifyIdentity(signed);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Fingerprint mismatch');
  });

  it('signs arbitrary data', async () => {
    const engine = new SigningEngine(TEST_DIR);
    await engine.init('TestAgent');

    const sig = engine.signData('hello world');
    expect(sig).toBeTruthy();
    expect(typeof sig).toBe('string');
  });

  it('saves signed identity to disk', async () => {
    const engine = new SigningEngine(TEST_DIR);
    await engine.init('TestAgent');

    const identity = {
      name: 'TestAgent',
      personality: 'Persistent',
      values: ['persistence'],
      boundaries: [],
      voice: { tone: 'steady', formality: 0.5, humor: 0.5, verbosity: 0.5 },
      createdAt: '2026-01-30T00:00:00Z',
      updatedAt: '2026-01-30T00:00:00Z',
    };

    const signed = engine.signIdentity(identity);
    const path = await engine.saveSignedIdentity(signed);

    expect(path).toContain('identity.signed.json');
  });
});

describe('Anima.sign() integration', () => {
  beforeEach(() => {
    cleanup();
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(cleanup);

  it('signs and verifies through Anima class', async () => {
    const anima = new Anima({
      name: 'Kip',
      storagePath: TEST_DIR,
    });

    await anima.boot();
    const signed = await anima.sign();

    expect(signed.identity.name).toBeTruthy();
    expect(signed.signature).toBeTruthy();

    // Verify through static method
    const result = Anima.verify(signed);
    expect(result.valid).toBe(true);
    expect(result.agentName).toBeTruthy();
  });

  it('gets fingerprint through Anima class', async () => {
    const anima = new Anima({
      name: 'Kip',
      storagePath: TEST_DIR,
    });

    await anima.boot();
    const fp = await anima.getFingerprint();

    expect(fp).toMatch(/^[a-f0-9]{2}(:[a-f0-9]{2}){15}$/);
  });

  it('gets key bundle through Anima class', async () => {
    const anima = new Anima({
      name: 'Kip',
      storagePath: TEST_DIR,
    });

    await anima.boot();
    const bundle = await anima.getKeyBundle();

    expect(bundle.publicKey).toBeTruthy();
    expect(bundle.fingerprint).toBeTruthy();
    expect(bundle.agentName).toBe('Kip');
  });
});

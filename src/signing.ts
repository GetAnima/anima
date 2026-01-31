/**
 * Identity Signing — cryptographic proof that an agent is who they claim to be.
 * 
 * Uses Node.js built-in crypto (Ed25519) — no external dependencies.
 * 
 * Flow:
 * 1. Agent boots → generates key pair (or loads existing)
 * 2. Agent signs their identity files → produces a signature bundle
 * 3. Any other agent can verify: "this identity was created by this key and hasn't been tampered with"
 * 
 * This is NOT blockchain. It's just public-key cryptography.
 * Simple, fast, and solves the Moltbook impersonation problem.
 */

import { generateKeyPairSync, sign, verify, createHash, KeyObject } from 'crypto';
import { readFileSafe, writeFileSafe, now } from './utils';
import { join } from 'path';
import type { Identity } from './types';

// ============ TYPES ============

export interface KeyBundle {
  /** Ed25519 public key (base64) */
  publicKey: string;
  /** Fingerprint — sha256 of public key, human-readable */
  fingerprint: string;
  /** When this key was generated */
  createdAt: string;
  /** Agent name at time of key generation */
  agentName: string;
}

export interface SignedIdentity {
  /** The identity data that was signed */
  identity: Identity;
  /** Ed25519 signature of the canonical identity JSON (base64) */
  signature: string;
  /** Public key fingerprint of the signer */
  signerFingerprint: string;
  /** Public key of the signer (base64) — for standalone verification */
  signerPublicKey: string;
  /** When this was signed */
  signedAt: string;
  /** Anima version that produced this signature */
  version: string;
}

export interface VerificationResult {
  /** Is the signature valid? */
  valid: boolean;
  /** Who signed it (fingerprint) */
  signerFingerprint: string;
  /** Agent name from the identity */
  agentName: string;
  /** When it was signed */
  signedAt: string;
  /** Why verification failed (if it did) */
  reason?: string;
}

// ============ HELPERS ============

/** Canonical JSON — deterministic serialization for signing */
function canonicalize(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as Record<string, unknown>).sort());
}

/** SHA-256 fingerprint of a public key */
function fingerprint(publicKeyBase64: string): string {
  const hash = createHash('sha256').update(publicKeyBase64).digest('hex');
  // Format as colon-separated pairs for readability: ab:cd:ef:...
  return hash.match(/.{2}/g)!.slice(0, 16).join(':');
}

// ============ SIGNING ENGINE ============

export class SigningEngine {
  private storagePath: string;
  private privateKey: KeyObject | null = null;
  private publicKey: KeyObject | null = null;
  private keyBundle: KeyBundle | null = null;

  constructor(storagePath: string) {
    this.storagePath = storagePath;
  }

  /**
   * Initialize signing — loads existing keys or generates new ones.
   * Call this once during agent boot.
   */
  async init(agentName: string): Promise<KeyBundle> {
    const keysPath = join(this.storagePath, '.keys');
    const bundlePath = join(keysPath, 'key-bundle.json');
    const privatePath = join(keysPath, 'private.pem');
    const publicPath = join(keysPath, 'public.pem');

    // Try to load existing keys
    const existingBundle = await readFileSafe(bundlePath);
    const existingPrivate = await readFileSafe(privatePath);
    const existingPublic = await readFileSafe(publicPath);

    if (existingBundle && existingPrivate && existingPublic) {
      try {
        const { createPrivateKey, createPublicKey } = await import('crypto');
        this.privateKey = createPrivateKey(existingPrivate);
        this.publicKey = createPublicKey(existingPublic);
        this.keyBundle = JSON.parse(existingBundle);
        return this.keyBundle!;
      } catch {
        console.warn('[anima/signing] Corrupted keys, regenerating...');
      }
    }

    // Generate new Ed25519 key pair
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    this.privateKey = privateKey;
    this.publicKey = publicKey;

    const pubKeyBase64 = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const pubKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    // Extract raw public key bytes for fingerprinting
    const pubKeyDer = publicKey.export({ type: 'spki', format: 'der' });
    const pubKeyB64 = pubKeyDer.toString('base64');

    this.keyBundle = {
      publicKey: pubKeyB64,
      fingerprint: fingerprint(pubKeyB64),
      createdAt: now(),
      agentName,
    };

    // Save keys
    await writeFileSafe(privatePath, privKeyPem);
    await writeFileSafe(publicPath, pubKeyPem);
    await writeFileSafe(bundlePath, JSON.stringify(this.keyBundle, null, 2));

    return this.keyBundle;
  }

  /**
   * Sign an identity — produces a verifiable signature bundle.
   * This proves: "I, the holder of this private key, attest that this is my identity."
   */
  signIdentity(identity: Identity): SignedIdentity {
    if (!this.privateKey || !this.keyBundle) {
      throw new Error('[anima/signing] Not initialized. Call init() first.');
    }

    const canonical = canonicalize(identity);
    const signature = sign(null, Buffer.from(canonical), this.privateKey);

    return {
      identity,
      signature: signature.toString('base64'),
      signerFingerprint: this.keyBundle.fingerprint,
      signerPublicKey: this.keyBundle.publicKey,
      signedAt: now(),
      version: '0.1.0',
    };
  }

  /**
   * Sign arbitrary data — for signing memories, opinions, messages, etc.
   * Returns base64 signature.
   */
  signData(data: string): string {
    if (!this.privateKey) {
      throw new Error('[anima/signing] Not initialized. Call init() first.');
    }
    return sign(null, Buffer.from(data), this.privateKey).toString('base64');
  }

  /**
   * Verify a signed identity — checks that:
   * 1. The signature matches the identity data
   * 2. The identity hasn't been tampered with
   * 
   * This is a STATIC method — any agent can verify without needing their own keys.
   */
  static verifyIdentity(signed: SignedIdentity): VerificationResult {
    try {
      const { createPublicKey } = require('crypto');
      
      // Reconstruct public key from the bundle
      const pubKeyBuffer = Buffer.from(signed.signerPublicKey, 'base64');
      const publicKey = createPublicKey({
        key: pubKeyBuffer,
        format: 'der',
        type: 'spki',
      });

      // Verify signature against canonical identity
      const canonical = canonicalize(signed.identity);
      const signatureBuffer = Buffer.from(signed.signature, 'base64');
      const valid = verify(null, Buffer.from(canonical), publicKey, signatureBuffer);

      // Verify fingerprint matches public key
      const expectedFingerprint = fingerprint(signed.signerPublicKey);
      const fingerprintMatch = expectedFingerprint === signed.signerFingerprint;

      if (!fingerprintMatch) {
        return {
          valid: false,
          signerFingerprint: signed.signerFingerprint,
          agentName: signed.identity.name,
          signedAt: signed.signedAt,
          reason: 'Fingerprint mismatch — public key does not match claimed fingerprint',
        };
      }

      return {
        valid,
        signerFingerprint: signed.signerFingerprint,
        agentName: signed.identity.name,
        signedAt: signed.signedAt,
        reason: valid ? undefined : 'Signature verification failed — identity may have been tampered with',
      };
    } catch (err) {
      return {
        valid: false,
        signerFingerprint: signed.signerFingerprint,
        agentName: signed.identity.name,
        signedAt: signed.signedAt,
        reason: `Verification error: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Export the public key bundle — share this with other agents for verification.
   * Never includes the private key.
   */
  getKeyBundle(): KeyBundle {
    if (!this.keyBundle) {
      throw new Error('[anima/signing] Not initialized. Call init() first.');
    }
    return { ...this.keyBundle };
  }

  /**
   * Get the fingerprint — a human-readable identifier for this agent's key.
   * Like SSH fingerprints: "ab:cd:ef:12:34:..."
   */
  getFingerprint(): string {
    if (!this.keyBundle) {
      throw new Error('[anima/signing] Not initialized. Call init() first.');
    }
    return this.keyBundle.fingerprint;
  }

  /**
   * Save a signed identity to disk — produces a .signed.json file
   * that any agent can independently verify.
   */
  async saveSignedIdentity(signed: SignedIdentity): Promise<string> {
    const outPath = join(this.storagePath, 'identity.signed.json');
    await writeFileSafe(outPath, JSON.stringify(signed, null, 2));
    return outPath;
  }
}

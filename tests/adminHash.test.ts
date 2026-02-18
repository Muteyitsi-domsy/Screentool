/**
 * Reliability tests — Admin passcode hash (SHA-256 via Web Crypto)
 * These tests mirror the exact logic in App.tsx to ensure the
 * hash function behaves correctly before it is baked into the bundle.
 */
import { describe, it, expect } from 'vitest';

// Same implementation as App.tsx — kept here to test the contract in isolation
const hashPasscode = async (code: string): Promise<string> => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

describe('hashPasscode', () => {
  it('returns a 64-character lowercase hex string', async () => {
    const hash = await hashPasscode('abc123');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same input always produces the same output', async () => {
    const h1 = await hashPasscode('mycode');
    const h2 = await hashPasscode('mycode');
    expect(h1).toBe(h2);
  });

  it('different inputs produce different hashes (collision resistance)', async () => {
    const h1 = await hashPasscode('aaaaaa');
    const h2 = await hashPasscode('aaaaab');
    expect(h1).not.toBe(h2);
  });

  it('is case-sensitive', async () => {
    const h1 = await hashPasscode('AbCdEf');
    const h2 = await hashPasscode('abcdef');
    expect(h1).not.toBe(h2);
  });

  it('matches a known SHA-256 vector for "abc123"', async () => {
    // SHA-256("abc123") = 6ca13d52ca70c883e0f0bb101e425a89e8624de51db2d2392593af6a84118090
    const hash = await hashPasscode('abc123');
    expect(hash).toBe('6ca13d52ca70c883e0f0bb101e425a89e8624de51db2d2392593af6a84118090');
  });

  it('handles special characters without throwing', async () => {
    await expect(hashPasscode('!@#$%^')).resolves.toHaveLength(64);
  });

  it('handles unicode characters without throwing', async () => {
    await expect(hashPasscode('ñüßé¿à')).resolves.toHaveLength(64);
  });

  it('an empty string still produces a valid 64-char hash', async () => {
    const hash = await hashPasscode('');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a 6-character code always produces a 64-character hash', async () => {
    const codes = ['000000', 'ZZZZZZ', 'a1b2c3', '!#$%^&'];
    for (const code of codes) {
      const hash = await hashPasscode(code);
      expect(hash, `Hash of "${code}" should be 64 chars`).toHaveLength(64);
    }
  });
});

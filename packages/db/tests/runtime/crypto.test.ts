import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from '../../src/runtime/crypto';

const MASTER_KEY = Buffer.from('a'.repeat(64), 'hex');
const PROFILE_A = 'default';
const PROFILE_B = 'work';

describe('crypto', () => {
  it('round-trips plaintext', () => {
    const { iv, ciphertext } = encrypt(MASTER_KEY, PROFILE_A, 'sk-ant-secret');
    expect(decrypt(MASTER_KEY, PROFILE_A, iv, ciphertext)).toBe('sk-ant-secret');
  });

  it('produces a fresh IV per call', () => {
    const a = encrypt(MASTER_KEY, PROFILE_A, 'x');
    const b = encrypt(MASTER_KEY, PROFILE_A, 'x');
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it('fails noisily with the wrong profile id (DEK mismatch)', () => {
    const { iv, ciphertext } = encrypt(MASTER_KEY, PROFILE_A, 'x');
    expect(() => decrypt(MASTER_KEY, PROFILE_B, iv, ciphertext)).toThrow();
  });

  it('fails noisily with the wrong master key', () => {
    const otherKey = Buffer.from('b'.repeat(64), 'hex');
    const { iv, ciphertext } = encrypt(MASTER_KEY, PROFILE_A, 'x');
    expect(() => decrypt(otherKey, PROFILE_A, iv, ciphertext)).toThrow();
  });

  it('handles empty string', () => {
    const { iv, ciphertext } = encrypt(MASTER_KEY, PROFILE_A, '');
    expect(decrypt(MASTER_KEY, PROFILE_A, iv, ciphertext)).toBe('');
  });

  it('handles unicode', () => {
    const text = '日本語 🔐 émoji';
    const { iv, ciphertext } = encrypt(MASTER_KEY, PROFILE_A, text);
    expect(decrypt(MASTER_KEY, PROFILE_A, iv, ciphertext)).toBe(text);
  });

  it('detects ciphertext tampering (auth tag rejection)', () => {
    const { iv, ciphertext } = encrypt(MASTER_KEY, PROFILE_A, 'sk-ant-x');
    const tampered = Buffer.from(ciphertext);
    tampered[0] = (tampered[0] ?? 0) ^ 0xff;
    expect(() => decrypt(MASTER_KEY, PROFILE_A, iv, tampered)).toThrow();
  });
});

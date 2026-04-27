import { createPublicKey, createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { computePemSha256, looksLikePem, signAppJwt } from '../src/jwt.js';

function genKey(format: 'pkcs1' | 'pkcs8' = 'pkcs8'): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: {
      type: format === 'pkcs1' ? 'pkcs1' : 'pkcs8',
      format: 'pem',
    },
  });
  return { publicKey, privateKey };
}

describe('signAppJwt', () => {
  it('produces a verifiable RS256 JWT (PKCS#8)', () => {
    const { publicKey, privateKey } = genKey('pkcs8');
    const jwt = signAppJwt({ appId: '12345', privateKey });
    const [header, payload, signature] = jwt.split('.');
    expect(header).toBeTruthy();
    expect(payload).toBeTruthy();
    expect(signature).toBeTruthy();

    const decodedHeader = JSON.parse(Buffer.from(header!, 'base64url').toString('utf8'));
    expect(decodedHeader).toEqual({ alg: 'RS256', typ: 'JWT' });

    const decodedPayload = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'));
    expect(decodedPayload.iss).toBe('12345');
    expect(decodedPayload.exp - decodedPayload.iat).toBe(660); // exp+600 - (iat-60)

    const verify = createVerify('RSA-SHA256');
    verify.update(`${header}.${payload}`);
    const ok = verify.verify(createPublicKey(publicKey), Buffer.from(signature!, 'base64url'));
    expect(ok).toBe(true);
  });

  it('produces a verifiable RS256 JWT (PKCS#1)', () => {
    const { publicKey, privateKey } = genKey('pkcs1');
    const jwt = signAppJwt({ appId: '67890', privateKey });
    const [header, payload, signature] = jwt.split('.');
    const verify = createVerify('RSA-SHA256');
    verify.update(`${header}.${payload}`);
    expect(verify.verify(createPublicKey(publicKey), Buffer.from(signature!, 'base64url'))).toBe(
      true,
    );
  });

  it('throws on empty appId', () => {
    const { privateKey } = genKey();
    expect(() => signAppJwt({ appId: '', privateKey })).toThrow(/appId is required/);
    expect(() => signAppJwt({ appId: '   ', privateKey })).toThrow(/appId is required/);
  });

  it('throws on empty privateKey', () => {
    expect(() => signAppJwt({ appId: '1', privateKey: '' })).toThrow(/privateKey is required/);
  });

  it('throws on a malformed PEM', () => {
    expect(() => signAppJwt({ appId: '1', privateKey: 'not-a-pem' })).toThrow();
  });

  it('iat is within the last minute and exp is ~10 minutes in the future', () => {
    const { privateKey } = genKey();
    const before = Math.floor(Date.now() / 1000);
    const jwt = signAppJwt({ appId: '1', privateKey });
    const after = Math.floor(Date.now() / 1000);
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString('utf8'));
    expect(payload.iat).toBeGreaterThanOrEqual(before - 60);
    expect(payload.iat).toBeLessThanOrEqual(after - 60 + 1);
    expect(payload.exp).toBeGreaterThanOrEqual(before + 600);
    expect(payload.exp).toBeLessThanOrEqual(after + 600 + 1);
  });
});

describe('computePemSha256', () => {
  it('returns deterministic 64-char lowercase hex', () => {
    const a = computePemSha256('-----BEGIN PRIVATE KEY-----\nfoo\n-----END PRIVATE KEY-----');
    const b = computePemSha256('-----BEGIN PRIVATE KEY-----\nfoo\n-----END PRIVATE KEY-----');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the PEM body changes', () => {
    const a = computePemSha256('foo');
    const b = computePemSha256('bar');
    expect(a).not.toBe(b);
  });

  it('ignores leading and trailing whitespace', () => {
    const a = computePemSha256('   foo\n');
    const b = computePemSha256('foo');
    expect(a).toBe(b);
  });
});

describe('looksLikePem', () => {
  it('accepts PKCS#1', () => {
    expect(
      looksLikePem('-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----'),
    ).toBe(true);
  });
  it('accepts PKCS#8', () => {
    expect(looksLikePem('-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----')).toBe(true);
  });
  it('rejects garbage', () => {
    expect(looksLikePem('not a pem')).toBe(false);
    expect(looksLikePem('')).toBe(false);
    expect(looksLikePem('-----BEGIN CERTIFICATE-----')).toBe(false);
  });
});

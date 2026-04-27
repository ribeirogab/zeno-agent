/**
 * Stateless JWT signing for GitHub App authentication.
 * Spec 0044 — extracted from apps/worker/src/github/app-auth.ts so both worker
 * (token cache) and api (install/test/discover endpoints) can sign JWTs with
 * the same building block.
 *
 * RS256 signature, iat=now-60s (allow for clock skew), exp=now+600s (10 min).
 * GitHub rejects JWTs older than 10 minutes.
 */

import { createHash, createSign } from 'node:crypto';

export interface SignAppJwtInput {
  /** Numeric App ID as a string (e.g. '12345'). */
  appId: string;
  /** PEM-encoded RSA private key. */
  privateKey: string;
}

/**
 * Sign a GitHub App JWT.
 *
 * Throws if the PEM is malformed (`createSign(...).sign()` will throw a
 * descriptive `Error` from node:crypto). Callers that want to surface the
 * failure as `auth` to the user should wrap in try/catch.
 */
export function signAppJwt({ appId, privateKey }: SignAppJwtInput): string {
  if (!appId.trim()) throw new Error('signAppJwt: appId is required');
  if (!privateKey.trim()) throw new Error('signAppJwt: privateKey is required');

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iat: now - 60,
      exp: now + 600,
      iss: appId,
    }),
  ).toString('base64url');
  const signable = `${header}.${payload}`;

  const sign = createSign('RSA-SHA256');
  sign.update(signable);
  const signature = sign.sign(privateKey, 'base64url');
  return `${signable}.${signature}`;
}

/**
 * Compute a stable fingerprint for a PEM. Used by the dashboard UI to display
 * "PEM fingerprint: a1b2c3d4…" without ever exfiltrating the key.
 *
 * SHA-256 of the trimmed PEM body. Returns a lowercase hex string.
 */
export function computePemSha256(privateKey: string): string {
  return createHash('sha256').update(privateKey.trim()).digest('hex');
}

/**
 * Best-effort PEM shape check used by API validation. Does NOT verify the key
 * is mathematically valid (only `signAppJwt` can do that, by attempting to
 * sign). Returns true for both PKCS#1 ("BEGIN RSA PRIVATE KEY") and PKCS#8
 * ("BEGIN PRIVATE KEY") encodings.
 */
export function looksLikePem(value: string): boolean {
  return /-----BEGIN (RSA )?PRIVATE KEY-----/.test(value);
}

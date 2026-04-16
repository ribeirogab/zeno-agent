import { createHmac, timingSafeEqual } from 'node:crypto';

export type VerifyResult =
  | { valid: true; expiresAt: number }
  | { valid: false; reason: 'malformed' | 'bad_signature' };

export function signSession(secret: string, expiresAt: number): string {
  const sig = createHmac('sha256', secret).update(String(expiresAt)).digest('hex');
  return `${expiresAt}.${sig}`;
}

export function verifySession(secret: string, value: string): VerifyResult {
  const dotIndex = value.indexOf('.');
  if (dotIndex < 1 || dotIndex === value.length - 1) {
    return { valid: false, reason: 'malformed' };
  }
  const expPart = value.slice(0, dotIndex);
  const sigPart = value.slice(dotIndex + 1);

  const expiresAt = Number(expPart);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    return { valid: false, reason: 'malformed' };
  }

  const expected = createHmac('sha256', secret).update(expPart).digest('hex');
  if (sigPart.length !== expected.length) {
    return { valid: false, reason: 'bad_signature' };
  }
  const equal = timingSafeEqual(Buffer.from(sigPart, 'hex'), Buffer.from(expected, 'hex'));
  if (!equal) {
    return { valid: false, reason: 'bad_signature' };
  }
  return { valid: true, expiresAt };
}

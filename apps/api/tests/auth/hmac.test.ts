import { describe, expect, it } from 'vitest';
import { signSession, verifySession } from '@/auth/hmac';

const SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('signSession + verifySession', () => {
  it('round-trips a valid expiresAt', () => {
    const expires = Date.now() + 1000 * 60;
    const cookie = signSession(SECRET, expires);
    expect(verifySession(SECRET, cookie)).toEqual({ valid: true, expiresAt: expires });
  });

  it('rejects a tampered signature', () => {
    const cookie = signSession(SECRET, Date.now() + 1000);
    const [exp, sig] = cookie.split('.');
    if (!sig) throw new Error('signSession returned cookie without signature segment');
    // Replace the last char with one that is guaranteed to differ (avoid the
    // ~6% chance of picking the same char and producing an unaltered string).
    const lastChar = sig.slice(-1);
    const replacement = lastChar === '0' ? '1' : '0';
    const tampered = `${exp}.${sig.slice(0, -1)}${replacement}`;
    expect(verifySession(SECRET, tampered)).toEqual({ valid: false, reason: 'bad_signature' });
  });

  it('rejects malformed value (no dot)', () => {
    expect(verifySession(SECRET, 'no-dot-here')).toEqual({ valid: false, reason: 'malformed' });
  });

  it('rejects non-numeric expiresAt', () => {
    expect(verifySession(SECRET, 'abc.deadbeef')).toEqual({ valid: false, reason: 'malformed' });
  });

  it('rejects with different secret', () => {
    const cookie = signSession(SECRET, Date.now() + 1000);
    const otherSecret = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    expect(verifySession(otherSecret, cookie)).toEqual({ valid: false, reason: 'bad_signature' });
  });
});

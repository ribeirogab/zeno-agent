import type { MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { signSession, verifySession } from '@/auth/hmac';

export const COOKIE_NAME = 'zeno_auth';
export const TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RENEWAL_THRESHOLD_MS = TTL_MS / 2;

export interface RequireAuthOptions {
  secret: string;
  secure: boolean;
}

export function requireAuth(options: RequireAuthOptions): MiddlewareHandler {
  return async (c, next) => {
    const value = getCookie(c, COOKIE_NAME);
    if (!value) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const result = verifySession(options.secret, value);
    if (!result.valid) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    if (result.expiresAt <= Date.now()) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const remaining = result.expiresAt - Date.now();
    if (remaining < RENEWAL_THRESHOLD_MS) {
      const newExpires = Date.now() + TTL_MS;
      setCookie(c, COOKIE_NAME, signSession(options.secret, newExpires), {
        httpOnly: true,
        sameSite: 'Lax',
        secure: options.secure,
        path: '/',
        maxAge: Math.floor(TTL_MS / 1000),
      });
    }
    await next();
  };
}

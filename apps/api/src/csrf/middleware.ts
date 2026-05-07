import { randomBytes } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

export const COOKIE_NAME = 'zeno_csrf';
export const HEADER_NAME = 'x-csrf-token';
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Stateless CSRF guard for the bind-127.0.0.1 single-user dashboard.
 *
 * Pattern: double-submit cookie. On every request the middleware ensures a
 * `zeno_csrf` cookie is set (random 32-byte hex). On mutating requests
 * (POST/PUT/PATCH/DELETE) it requires the same value to appear in the
 * `X-CSRF-Token` header. Non-mutating reads (GET/HEAD) pass through.
 *
 * Threat model: another browser tab on the same machine cannot read the
 * cookie (`SameSite=Strict`) and cannot read it via JS from a cross-origin
 * page either. Reading the cookie from the dashboard JS itself is intentional
 * (`HttpOnly: false`) — that's the whole point of the double-submit.
 *
 * Skips the entire mechanism for `GET`/`HEAD` so curl-style smoke tests of
 * read-only endpoints stay zero-friction.
 */
export function csrf(opts: { secure: boolean }): MiddlewareHandler {
  return async (c, next) => {
    let token = getCookie(c, COOKIE_NAME);
    if (!token) {
      token = randomBytes(32).toString('hex');
      setCookie(c, COOKIE_NAME, token, {
        httpOnly: false,
        sameSite: 'Strict',
        secure: opts.secure,
        path: '/',
        // No maxAge — session cookie. Operator closing the browser invalidates.
      });
    }
    if (MUTATING.has(c.req.method)) {
      const headerValue = c.req.header(HEADER_NAME);
      if (!headerValue || headerValue !== token) {
        return c.json({ error: 'csrf_token_mismatch' }, 403);
      }
    }
    await next();
  };
}

import { timingSafeEqual } from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { z } from 'zod';
import { signSession } from '@/auth/hmac';
import { COOKIE_NAME, requireAuth, TTL_MS } from '@/auth/middleware';

const loginSchema = z.object({ password: z.string().min(1) });

export interface AuthRoutesOptions {
  password: string;
  sessionSecret: string;
  secure: boolean;
}

export function buildAuthRoutes(options: AuthRoutesOptions): Hono {
  const route = new Hono();

  route.post('/login', zValidator('json', loginSchema), async (c) => {
    const { password } = c.req.valid('json');
    const a = Buffer.from(password);
    const b = Buffer.from(options.password);
    const matched = a.length === b.length && timingSafeEqual(a, b);
    if (!matched) {
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      return c.json({ error: 'invalid_credentials' }, 401);
    }
    const expiresAt = Date.now() + TTL_MS;
    setCookie(c, COOKIE_NAME, signSession(options.sessionSecret, expiresAt), {
      httpOnly: true,
      sameSite: 'Lax',
      secure: options.secure,
      path: '/',
      maxAge: Math.floor(TTL_MS / 1000),
    });
    return c.body(null, 204);
  });

  route.post('/logout', (c) => {
    setCookie(c, COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'Lax',
      secure: options.secure,
      path: '/',
      maxAge: 0,
    });
    return c.body(null, 204);
  });

  route.get('/me', requireAuth({ secret: options.sessionSecret, secure: options.secure }), (c) => {
    return c.body(null, 204);
  });

  return route;
}

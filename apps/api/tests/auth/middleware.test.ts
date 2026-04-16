import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { signSession } from '@/auth/hmac';
import { COOKIE_NAME, RENEWAL_THRESHOLD_MS, requireAuth, TTL_MS } from '@/auth/middleware';

const SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function buildApp() {
  const app = new Hono();
  app.use('/protected/*', requireAuth({ secret: SECRET, secure: false }));
  app.get('/protected/ping', (c) => c.text('pong'));
  return app;
}

describe('requireAuth middleware', () => {
  it('rejects requests without cookie', async () => {
    const res = await buildApp().request('/protected/ping');
    expect(res.status).toBe(401);
  });

  it('rejects malformed cookie', async () => {
    const res = await buildApp().request('/protected/ping', {
      headers: { Cookie: `${COOKIE_NAME}=garbage` },
    });
    expect(res.status).toBe(401);
  });

  it('rejects expired cookie', async () => {
    const cookie = signSession(SECRET, Date.now() - 1000);
    const res = await buildApp().request('/protected/ping', {
      headers: { Cookie: `${COOKIE_NAME}=${cookie}` },
    });
    expect(res.status).toBe(401);
  });

  it('accepts valid cookie', async () => {
    const cookie = signSession(SECRET, Date.now() + TTL_MS);
    const res = await buildApp().request('/protected/ping', {
      headers: { Cookie: `${COOKIE_NAME}=${cookie}` },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('pong');
  });

  it('issues sliding-renewal Set-Cookie when >50% TTL spent', async () => {
    const cookie = signSession(SECRET, Date.now() + RENEWAL_THRESHOLD_MS - 1000);
    const res = await buildApp().request('/protected/ping', {
      headers: { Cookie: `${COOKIE_NAME}=${cookie}` },
    });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain(`${COOKIE_NAME}=`);
    expect(setCookie).toContain('HttpOnly');
  });

  it('does NOT issue Set-Cookie when <50% TTL spent', async () => {
    const cookie = signSession(SECRET, Date.now() + TTL_MS - 60_000);
    const res = await buildApp().request('/protected/ping', {
      headers: { Cookie: `${COOKIE_NAME}=${cookie}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });
});

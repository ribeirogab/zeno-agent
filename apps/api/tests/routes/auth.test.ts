import { CommandRepo, CronRepo, CronRunRepo, openDatabase, runMigrations } from '@zeno/storage';
import { describe, expect, it } from 'vitest';
import { COOKIE_NAME } from '@/auth/middleware';
import { createApp } from '@/server';

const TEST_PASSWORD = 'test-password-123';
const TEST_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function makeApp() {
  const db = openDatabase(':memory:');
  runMigrations(db);
  return createApp({
    config: {
      password: TEST_PASSWORD,
      sessionSecret: TEST_SECRET,
      logLevel: 'info',
      workspaceDir: '/tmp',
      nodeEnv: 'test',
      port: 3000,
    },
    db,
    cronRepo: new CronRepo(db),
    cronRunRepo: new CronRunRepo(db),
    commandRepo: new CommandRepo(db),
    claudeHome: '/tmp',
  });
}

describe('POST /api/auth/login', () => {
  it('returns 401 on wrong password', async () => {
    const app = makeApp();
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 204 with Set-Cookie on right password', async () => {
    const app = makeApp();
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    });
    expect(res.status).toBe(204);
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toContain(`${COOKIE_NAME}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
  });

  it('rejects malformed body', async () => {
    const app = makeApp();
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the cookie', async () => {
    const app = makeApp();
    const res = await app.request('/api/auth/logout', { method: 'POST' });
    expect(res.status).toBe(204);
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toContain(`${COOKIE_NAME}=`);
    expect(setCookie).toMatch(/Max-Age=0/i);
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without cookie', async () => {
    const app = makeApp();
    const res = await app.request('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 204 with valid cookie', async () => {
    const app = makeApp();
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    });
    const cookieHeader = login.headers.get('Set-Cookie') ?? '';
    const cookieValue = cookieHeader.split(';')[0] ?? '';
    const res = await app.request('/api/auth/me', { headers: { Cookie: cookieValue } });
    expect(res.status).toBe(204);
  });
});

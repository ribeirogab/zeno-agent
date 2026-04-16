import {
  CommandRepo,
  CronRepo,
  CronRunRepo,
  type DB,
  LogRepo,
  openDatabase,
  runMigrations,
} from '@zeno/storage';
import { beforeEach, describe, expect, it } from 'vitest';
import { signSession } from '@/auth/hmac';
import { COOKIE_NAME } from '@/auth/middleware';
import { createApp } from '@/server';

const SECRET = '0'.repeat(64);
let db: DB;
let logs: LogRepo;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  logs = new LogRepo(db);
});

function makeApp(database: DB) {
  return createApp({
    config: {
      password: 'pw',
      sessionSecret: SECRET,
      logLevel: 'info',
      workspaceDir: '/tmp',
      nodeEnv: 'test',
      port: 3000,
    },
    db: database,
    cronRepo: new CronRepo(database),
    cronRunRepo: new CronRunRepo(database),
    commandRepo: new CommandRepo(database),
    logRepo: new LogRepo(database),
    claudeHome: '/tmp',
    profileDir: '/tmp',
  });
}

function authed(): { Cookie: string } {
  return { Cookie: `${COOKIE_NAME}=${signSession(SECRET, Date.now() + 60_000)}` };
}

function seedLog(
  ts: string,
  level: number,
  event: string,
  correlationId: string | null = null,
): void {
  logs.insert({
    ts,
    level: level as 10 | 20 | 30 | 40 | 50 | 60,
    service: 'worker',
    event,
    correlationId,
    message: `msg-${event}`,
    payload: JSON.stringify({ level, time: ts, event, service: 'worker' }),
  });
}

describe('GET /api/logs', () => {
  it('rejects without auth', async () => {
    const res = await makeApp(db).request('/api/logs');
    expect(res.status).toBe(401);
  });

  it('returns empty list on empty db', async () => {
    const res = await makeApp(db).request('/api/logs', { headers: authed() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ logs: [], nextCursorId: null });
  });

  it('returns rows newest-first with nextCursorId when limit hits', async () => {
    for (let i = 0; i < 5; i += 1) {
      seedLog(`2026-04-16T12:00:0${i}.000Z`, 30, `e${i}`);
    }
    const res = await makeApp(db).request('/api/logs?limit=3', { headers: authed() });
    const body = (await res.json()) as {
      logs: Array<{ event: string }>;
      nextCursorId: number;
    };
    expect(body.logs.map((l) => l.event)).toEqual(['e4', 'e3', 'e2']);
    expect(body.nextCursorId).toBeGreaterThan(0);
  });

  it('filters by level=error', async () => {
    seedLog('2026-04-16T12:00:00.000Z', 30, 'info-x');
    seedLog('2026-04-16T12:00:01.000Z', 50, 'err-x');
    const res = await makeApp(db).request('/api/logs?level=error', { headers: authed() });
    const body = (await res.json()) as { logs: Array<{ event: string }> };
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0]?.event).toBe('err-x');
  });

  it('filters by q (event prefix, case-insensitive)', async () => {
    seedLog('2026-04-16T12:00:00.000Z', 30, 'cron_run_success');
    seedLog('2026-04-16T12:00:01.000Z', 40, 'noise');
    const res = await makeApp(db).request('/api/logs?q=cron_run', { headers: authed() });
    const body = (await res.json()) as { logs: Array<{ event: string }> };
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0]?.event).toBe('cron_run_success');
  });

  it('rejects invalid level', async () => {
    const res = await makeApp(db).request('/api/logs?level=chaos', { headers: authed() });
    expect(res.status).toBe(400);
  });
});

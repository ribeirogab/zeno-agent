import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CommandRepo,
  CronRepo,
  CronRunRepo,
  type DB,
  openDatabase,
  runMigrations,
  SessionRepo,
} from '@zeno/storage';
import { beforeEach, describe, expect, it } from 'vitest';
import { signSession } from '@/auth/hmac';
import { COOKIE_NAME } from '@/auth/middleware';
import { createApp } from '@/server';

const SECRET = '0'.repeat(64);
let db: DB;
let claudeHome: string;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  claudeHome = mkdtempSync(join(tmpdir(), 'zeno-claude-'));
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
    claudeHome,
  });
}

function authed(): { Cookie: string } {
  return { Cookie: `${COOKIE_NAME}=${signSession(SECRET, Date.now() + 60_000)}` };
}

describe('GET /api/sessions', () => {
  it('rejects without auth', async () => {
    const res = await makeApp(db).request('/api/sessions');
    expect(res.status).toBe(401);
  });

  it('returns sessions ordered by last_used_at desc', async () => {
    const sessions = new SessionRepo(db);
    sessions.upsert('thread-old', 'sess-1');
    db.prepare(
      "UPDATE sessions SET last_used_at = datetime('now','-2 days') WHERE thread_id='thread-old'",
    ).run();
    sessions.upsert('thread-new', 'sess-2');
    const res = await makeApp(db).request('/api/sessions', { headers: authed() });
    const body = (await res.json()) as Array<{ threadId: string }>;
    expect(body[0]?.threadId).toBe('thread-new');
  });
});

describe('GET /api/sessions/:threadId', () => {
  it('returns 404 when thread unknown', async () => {
    const res = await makeApp(db).request('/api/sessions/nope', { headers: authed() });
    expect(res.status).toBe(404);
  });

  it('returns session + parsed messages when JSONL exists', async () => {
    const sessions = new SessionRepo(db);
    sessions.upsert('thread-1', 'sess-abc');
    writeFileSync(
      join(claudeHome, 'sess-abc.jsonl'),
      `{"type":"user","message":{"role":"user","content":[{"type":"text","text":"oi"}]},"uuid":"u1"}\n`,
    );
    const res = await makeApp(db).request('/api/sessions/thread-1', { headers: authed() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      session: { threadId: string };
      messages: Array<{ text: string }>;
    };
    expect(body.session.threadId).toBe('thread-1');
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]?.text).toBe('oi');
  });

  it('returns session with empty messages if JSONL missing', async () => {
    const sessions = new SessionRepo(db);
    sessions.upsert('thread-2', 'sess-no-file');
    const res = await makeApp(db).request('/api/sessions/thread-2', { headers: authed() });
    const body = (await res.json()) as { messages: unknown[] };
    expect(body.messages).toEqual([]);
  });
});

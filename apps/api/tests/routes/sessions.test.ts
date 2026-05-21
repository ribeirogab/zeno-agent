import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CommandRepo,
  CronRepo,
  CronRunRepo,
  LogRepo,
  openRuntimeDatabase,
  type RuntimeDB,
  runRuntimeMigrations,
  SessionRepo,
} from '@zeno/db/runtime';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '@/server';
import { csrfHeaders } from '../csrf-helper';

let opened: ReturnType<typeof openRuntimeDatabase>;
let db: RuntimeDB;
let claudeHome: string;

beforeEach(() => {
  opened = openRuntimeDatabase(':memory:');
  db = opened.drizzle;
  runRuntimeMigrations(opened.raw);
  claudeHome = mkdtempSync(join(tmpdir(), 'zeno-claude-'));
});

function makeApp(database: RuntimeDB) {
  return createApp({
    config: {
      logLevel: 'info',
      workspaceDir: '/tmp',
      nodeEnv: 'test',
      port: 3000,
      masterKey: Buffer.alloc(32),
      profileId: 'test',
    },
    db: database,
    cronRepo: new CronRepo(database),
    cronRunRepo: new CronRunRepo(database),
    commandRepo: new CommandRepo(database),
    logRepo: new LogRepo(database),
    claudeHome,
    profileDir: '/tmp',
    knowledgeRoot: '/tmp',
  });
}

describe('GET /api/sessions', () => {
  it('returns sessions ordered by last_used_at desc', async () => {
    const sessions = new SessionRepo(db);
    sessions.upsert('thread-old', 'sess-1');
    opened.raw
      .prepare(
        "UPDATE sessions SET last_used_at = datetime('now','-2 days') WHERE thread_id='thread-old'",
      )
      .run();
    sessions.upsert('thread-new', 'sess-2');
    const res = await makeApp(db).request('/api/sessions', { headers: csrfHeaders() });
    const body = (await res.json()) as Array<{ threadId: string }>;
    expect(body[0]?.threadId).toBe('thread-new');
  });
});

describe('GET /api/sessions/:threadId', () => {
  it('returns 404 when thread unknown', async () => {
    const res = await makeApp(db).request('/api/sessions/nope', { headers: csrfHeaders() });
    expect(res.status).toBe(404);
  });

  it('returns session + parsed messages when JSONL exists', async () => {
    const sessions = new SessionRepo(db);
    sessions.upsert('thread-1', 'sess-abc');
    writeFileSync(
      join(claudeHome, 'sess-abc.jsonl'),
      `{"type":"user","message":{"role":"user","content":[{"type":"text","text":"oi"}]},"uuid":"u1"}\n`,
    );
    const res = await makeApp(db).request('/api/sessions/thread-1', { headers: csrfHeaders() });
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
    const res = await makeApp(db).request('/api/sessions/thread-2', { headers: csrfHeaders() });
    const body = (await res.json()) as { messages: unknown[] };
    expect(body.messages).toEqual([]);
  });
});

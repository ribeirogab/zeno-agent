import {
  CommandRepo,
  CronRepo,
  CronRunRepo,
  LogRepo,
  openRuntimeDatabase,
  type RuntimeDB,
  runRuntimeMigrations,
} from '@zeno/db/runtime';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '@/server';

let opened: ReturnType<typeof openRuntimeDatabase>;
let db: RuntimeDB;

beforeEach(() => {
  opened = openRuntimeDatabase(':memory:');
  db = opened.drizzle;
  runRuntimeMigrations(opened.raw);
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
    claudeHome: '/tmp',
    profileDir: '/tmp',
    knowledgeRoot: '/tmp',
  });
}

describe('GET /api/commands/:correlationId', () => {
  it('returns 404 when no command exists for the given correlationId', async () => {
    const res = await makeApp(db).request('/api/commands/does-not-exist');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('returns 200 with the command status payload when found', async () => {
    const commands = new CommandRepo(db);
    const enqueued = commands.enqueue({
      type: 'connector_create',
      payload: { foo: 'bar' },
      correlationId: 'corr-abc',
    });
    commands.claimPending(1);
    commands.finish(enqueued.id, 'success', { ok: true });

    const res = await makeApp(db).request('/api/commands/corr-abc');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      correlationId: 'corr-abc',
      type: 'connector_create',
      status: 'success',
      result: JSON.stringify({ ok: true }),
    });
    expect(body.createdAt).toEqual(expect.any(String));
    expect(body.processedAt).toEqual(expect.any(String));
    expect(body.completedAt).toEqual(expect.any(String));
  });
});

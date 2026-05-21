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
import type { ApiWriteMode } from '@/lib/api-mode';
import { createApp } from '@/server';

let opened: ReturnType<typeof openRuntimeDatabase>;
let db: RuntimeDB;

beforeEach(() => {
  opened = openRuntimeDatabase(':memory:');
  db = opened.drizzle;
  runRuntimeMigrations(opened.raw);
});

function makeApp(database: RuntimeDB, writes: ApiWriteMode) {
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
    writes,
  });
}

describe('GET /api/mode', () => {
  it("returns { writes: 'cli' } when writes is set to 'cli' in test deps", async () => {
    const res = await makeApp(db, 'cli').request('/api/mode');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ writes: 'cli' });
  });

  it("returns { writes: 'dashboard' } when writes: 'dashboard'", async () => {
    const res = await makeApp(db, 'dashboard').request('/api/mode');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ writes: 'dashboard' });
  });
});

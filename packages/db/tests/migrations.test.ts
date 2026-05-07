import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { closeSqlite, openSqlite, runHostMigrations } from '../src/host/index.js';

const TMP = join(tmpdir(), `zeno-mig-${Date.now()}.db`);

afterEach(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      unlinkSync(`${TMP}${suffix}`);
    } catch {
      /* ignore */
    }
  }
});

it('applies all migrations to a fresh DB', () => {
  const db = openSqlite(TMP);
  runHostMigrations(db);
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
    .all() as { name: string }[];
  const names = tables.map((t) => t.name);
  expect(names).toContain('profiles');
  expect(names).toContain('settings');
  expect(names).toContain('audit_log');
  expect(names).toContain('schema_migrations');
  closeSqlite(db);
});

it('is idempotent on re-run', () => {
  const db = openSqlite(TMP);
  runHostMigrations(db);
  const v1 = db.prepare(`SELECT COUNT(*) as c FROM schema_migrations`).get() as { c: number };
  runHostMigrations(db);
  const v2 = db.prepare(`SELECT COUNT(*) as c FROM schema_migrations`).get() as { c: number };
  expect(v2.c).toBe(v1.c);
  closeSqlite(db);
});

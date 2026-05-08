import { describe, expect, it } from 'vitest';
import { openRuntimeDatabase, runRuntimeMigrations } from '../../src/runtime/db.js';

describe('runRuntimeMigrations', () => {
  it('creates the schema_migrations table and applies the baseline once', () => {
    const { raw, close } = openRuntimeDatabase(':memory:');
    try {
      runRuntimeMigrations(raw);
      const versions = raw
        .prepare('SELECT version FROM schema_migrations ORDER BY version')
        .all() as { version: number }[];
      expect(versions.map((v) => v.version)).toEqual([0]);

      const tables = raw
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];
      const userTables = tables
        .map((t) => t.name)
        .filter((n) => !n.startsWith('sqlite_') && n !== 'schema_migrations');
      expect(userTables).toHaveLength(17);
    } finally {
      close();
    }
  });

  it('is idempotent — second invocation inserts no new rows', () => {
    const { raw, close } = openRuntimeDatabase(':memory:');
    try {
      runRuntimeMigrations(raw);
      const before = raw.prepare('SELECT COUNT(*) as c FROM schema_migrations').get() as {
        c: number;
      };
      runRuntimeMigrations(raw);
      const after = raw.prepare('SELECT COUNT(*) as c FROM schema_migrations').get() as {
        c: number;
      };
      expect(after.c).toBe(before.c);
    } finally {
      close();
    }
  });
});

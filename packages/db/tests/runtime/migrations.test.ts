import { describe, expect, it } from 'vitest';
import { openRuntimeDatabase, runRuntimeMigrations } from '../../src/runtime/db.js';

describe('runRuntimeMigrations', () => {
  it('creates the schema_migrations table and applies the baseline + 0001 + 0002 once', () => {
    const { raw, close } = openRuntimeDatabase(':memory:');
    try {
      runRuntimeMigrations(raw);
      const versions = raw
        .prepare('SELECT version FROM schema_migrations ORDER BY version')
        .all() as { version: number }[];
      expect(versions.map((v) => v.version)).toEqual([0, 1, 2]);

      const tables = raw
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];
      const userTables = tables
        .map((t) => t.name)
        .filter((n) => !n.startsWith('sqlite_') && n !== 'schema_migrations');
      expect(userTables).toHaveLength(17);

      // Spec 2026-05-08: 0001 adds instance_label column + idx_connectors_catalog_id index.
      const cols = raw.prepare('PRAGMA table_info(connectors)').all() as { name: string }[];
      expect(cols.map((c) => c.name)).toContain('instance_label');
      const indexes = raw.prepare('PRAGMA index_list(connectors)').all() as { name: string }[];
      expect(indexes.map((i) => i.name)).toContain('idx_connectors_catalog_id');

      // Spec 2026-05-11: 0002 adds updated_at column to connector_secrets for hot-reload detection.
      const secretCols = raw.prepare('PRAGMA table_info(connector_secrets)').all() as {
        name: string;
      }[];
      expect(secretCols.map((c) => c.name)).toContain('updated_at');
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

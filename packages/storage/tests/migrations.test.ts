import { describe, expect, it } from 'vitest';
import { closeDatabase, openDatabase } from '../src/db';
import { runMigrations } from '../src/migrations';

interface PragmaTableInfoRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface IndexListRow {
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

describe('migrations: approvals_log (migration 4)', () => {
  it('creates the approvals_log table with the expected columns', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    const columns = db.prepare('PRAGMA table_info(approvals_log)').all() as PragmaTableInfoRow[];
    const byName = new Map(columns.map((column) => [column.name, column]));

    const expectedColumns = [
      'id',
      'profile',
      'correlation_id',
      'thread_id',
      'requester_user_id',
      'decider_user_id',
      'tool_name',
      'tool_input',
      'policy_that_gated',
      'classifier_reason',
      'decision',
      'decision_reason',
      'created_at',
    ];
    for (const name of expectedColumns) {
      expect(byName.has(name), `missing column ${name}`).toBe(true);
    }

    // NOT NULL constraints on the required fields
    const required = [
      'profile',
      'correlation_id',
      'requester_user_id',
      'tool_name',
      'tool_input',
      'policy_that_gated',
      'decision',
      'decision_reason',
      'created_at',
    ];
    for (const name of required) {
      expect(byName.get(name)?.notnull, `${name} should be NOT NULL`).toBe(1);
    }

    // Nullable columns
    const nullable = ['thread_id', 'decider_user_id', 'classifier_reason'];
    for (const name of nullable) {
      expect(byName.get(name)?.notnull, `${name} should be nullable`).toBe(0);
    }

    expect(byName.get('id')?.pk).toBe(1);

    closeDatabase(db);
  });

  it('creates the approvals_log indexes', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    const indexes = db.prepare('PRAGMA index_list(approvals_log)').all() as IndexListRow[];
    const indexNames = indexes.map((index) => index.name);
    expect(indexNames).toContain('idx_approvals_log_profile_created');
    expect(indexNames).toContain('idx_approvals_log_correlation');

    closeDatabase(db);
  });

  it('enforces the decision CHECK constraint', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    expect(() =>
      db
        .prepare(
          `INSERT INTO approvals_log
            (profile, correlation_id, requester_user_id, tool_name, tool_input,
             policy_that_gated, decision, decision_reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('default', 'corr-1', 'U1', 'Bash', '{}', 'classifier', 'maybe', 'reason'),
    ).toThrow();

    closeDatabase(db);
  });

  it('is idempotent — re-running migrations after migration 4 does nothing', () => {
    const db = openDatabase(':memory:');
    const first = runMigrations(db);
    expect(first.applied).toContain(4);

    const second = runMigrations(db);
    expect(second.applied).toEqual([]);

    closeDatabase(db);
  });
});

describe('migrations: connectors (migration 5)', () => {
  it('creates the four connector tables', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    const expectedTables = [
      'connectors',
      'connector_secrets',
      'connector_tool_permissions',
      'connector_invocations',
    ];
    for (const table of expectedTables) {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as PragmaTableInfoRow[];
      expect(cols.length, `${table} should exist`).toBeGreaterThan(0);
    }

    closeDatabase(db);
  });

  it('connectors table has expected columns', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    const cols = db.prepare('PRAGMA table_info(connectors)').all() as PragmaTableInfoRow[];
    const names = cols.map((c) => c.name);
    for (const name of [
      'id',
      'slug',
      'display_name',
      'description',
      'source',
      'catalog_id',
      'transport',
      'command',
      'args',
      'url',
      'status',
      'last_error',
      'last_error_at',
      'last_verified_at',
      'created_at',
      'updated_at',
    ]) {
      expect(names, `connectors missing ${name}`).toContain(name);
    }

    closeDatabase(db);
  });

  it('enforces slug GLOB constraint', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    const insertOk = (slug: string) =>
      db
        .prepare(
          `INSERT INTO connectors (id, slug, display_name, source, transport)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(`id-${slug}`, slug, slug, 'custom', 'stdio');

    // Valid slugs succeed
    expect(() => insertOk('linear')).not.toThrow();
    expect(() => insertOk('fn-scrum')).not.toThrow();
    expect(() => insertOk('google-drive')).not.toThrow();
    expect(() => insertOk('a')).not.toThrow();

    // Invalid slugs fail (uppercase, underscore, special chars)
    expect(() => insertOk('Linear')).toThrow();
    expect(() => insertOk('linear_one')).toThrow();
    expect(() => insertOk('linear@')).toThrow();
    expect(() => insertOk('lin ear')).toThrow();
    expect(() => insertOk('')).toThrow();

    closeDatabase(db);
  });

  it('enforces source/transport/status CHECK constraints', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    expect(() =>
      db
        .prepare(
          `INSERT INTO connectors (id, slug, display_name, source, transport)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run('id-1', 'a', 'A', 'invalid-source', 'stdio'),
    ).toThrow();

    expect(() =>
      db
        .prepare(
          `INSERT INTO connectors (id, slug, display_name, source, transport)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run('id-2', 'b', 'B', 'custom', 'invalid-transport'),
    ).toThrow();

    expect(() =>
      db
        .prepare(
          `INSERT INTO connectors (id, slug, display_name, source, transport, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run('id-3', 'c', 'C', 'custom', 'stdio', 'bogus'),
    ).toThrow();

    closeDatabase(db);
  });

  it('cascades secrets/tools/invocations on connector delete', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    db.prepare(
      `INSERT INTO connectors (id, slug, display_name, source, transport)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('cid', 'echo', 'Echo', 'custom', 'stdio');
    db.prepare('INSERT INTO connector_secrets (connector_id, key, value) VALUES (?, ?, ?)').run(
      'cid',
      'API_KEY',
      'xyz',
    );
    db.prepare(
      `INSERT INTO connector_tool_permissions (connector_id, tool_name, category, permission)
       VALUES (?, ?, ?, ?)`,
    ).run('cid', 'read_echo', 'read', 'always_allow');
    db.prepare(
      `INSERT INTO connector_invocations (connector_id, tool_name, result, duration_ms)
       VALUES (?, ?, ?, ?)`,
    ).run('cid', 'read_echo', 'ok', 12);

    db.prepare('DELETE FROM connectors WHERE id = ?').run('cid');

    expect(
      db.prepare('SELECT COUNT(*) AS c FROM connector_secrets').get() as { c: number },
    ).toEqual({ c: 0 });
    expect(
      db.prepare('SELECT COUNT(*) AS c FROM connector_tool_permissions').get() as { c: number },
    ).toEqual({ c: 0 });
    expect(
      db.prepare('SELECT COUNT(*) AS c FROM connector_invocations').get() as { c: number },
    ).toEqual({ c: 0 });

    closeDatabase(db);
  });

  it('is idempotent — re-running migrations after migration 5 does nothing', () => {
    const db = openDatabase(':memory:');
    const first = runMigrations(db);
    expect(first.applied).toContain(5);
    expect(first.current).toBe(5);

    const second = runMigrations(db);
    expect(second.applied).toEqual([]);
    expect(second.current).toBe(5);

    closeDatabase(db);
  });
});

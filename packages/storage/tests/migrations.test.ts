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
    expect(first.current).toBe(4);

    const second = runMigrations(db);
    expect(second.applied).toEqual([]);
    expect(second.current).toBe(4);

    closeDatabase(db);
  });
});

import { describe, expect, it } from 'vitest';
import { closeDatabase, openDatabase } from '../src/db';
import { runMigrations } from '../src/migrations';

describe('storage/db + migrations', () => {
  it('opens an in-memory database with WAL pragmas', () => {
    const db = openDatabase(':memory:');
    expect(db.open).toBe(true);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    closeDatabase(db);
  });

  it('runs migrations on a fresh DB and reports applied', () => {
    const db = openDatabase(':memory:');
    const result = runMigrations(db);
    expect(result.applied).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    ]);
    expect(result.current).toBe(19);

    // Tables exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain('sessions');
    expect(names).toContain('crons');
    expect(names).toContain('cron_runs');
    expect(names).toContain('commands');
    expect(names).toContain('logs');
    expect(names).toContain('migrations');
    expect(names).toContain('connectors');
    expect(names).toContain('connector_secrets');
    expect(names).toContain('connector_tool_permissions');
    expect(names).toContain('connector_invocations');
    expect(names).toContain('connector_apps');
    expect(names).toContain('skills');
    expect(names).toContain('connector_skills');
    expect(names).toContain('agent_capabilities');
    expect(names).toContain('cron_skills');
    expect(names).toContain('cron_connectors');

    closeDatabase(db);
  });

  it('is idempotent — re-running migrations does nothing', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const second = runMigrations(db);
    expect(second.applied).toEqual([]);
    expect(second.current).toBe(19);
    closeDatabase(db);
  });
});

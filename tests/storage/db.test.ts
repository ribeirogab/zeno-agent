import { describe, expect, it } from 'vitest';
import { closeDatabase, openDatabase } from '@/storage/db';
import { runMigrations } from '@/storage/migrations';

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
    expect(result.applied).toEqual([1]);
    expect(result.current).toBe(1);

    // Tables exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain('sessions');
    expect(names).toContain('crons');
    expect(names).toContain('cron_runs');
    expect(names).toContain('migrations');

    closeDatabase(db);
  });

  it('is idempotent — re-running migrations does nothing', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const second = runMigrations(db);
    expect(second.applied).toEqual([]);
    expect(second.current).toBe(1);
    closeDatabase(db);
  });
});

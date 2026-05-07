import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeSqlite, openSqlite, queries, runHostMigrations } from '../src/host/index.js';

const TMP = join(tmpdir(), `zeno-q-${Date.now()}.db`);
let db: ReturnType<typeof openSqlite>;

beforeEach(() => {
  db = openSqlite(TMP);
  runHostMigrations(db);
});

afterEach(() => {
  closeSqlite(db);
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      unlinkSync(`${TMP}${suffix}`);
    } catch {
      /* ignore */
    }
  }
});

describe('profile CRUD', () => {
  it('creates and reads back', () => {
    queries.createProfile(db, { name: 'personal', port: 6101, masterKey: 'k1' });
    const row = queries.findProfile(db, 'personal');
    expect(row?.port).toBe(6101);
    expect(row?.status).toBe('stopped');
    expect(row?.masterKey).toBe('k1');
  });

  it('lists in created order', () => {
    queries.createProfile(db, { name: 'a', port: 6101, masterKey: 'k' });
    queries.createProfile(db, { name: 'b', port: 6102, masterKey: 'k' });
    const list = queries.listProfiles(db);
    expect(list.map((r) => r.name)).toEqual(['a', 'b']);
  });

  it('rejects duplicate port', () => {
    queries.createProfile(db, { name: 'a', port: 6101, masterKey: 'k' });
    expect(() => queries.createProfile(db, { name: 'b', port: 6101, masterKey: 'k' })).toThrow();
  });

  it('rejects duplicate name', () => {
    queries.createProfile(db, { name: 'a', port: 6101, masterKey: 'k' });
    expect(() => queries.createProfile(db, { name: 'a', port: 6102, masterKey: 'k' })).toThrow();
  });

  it('updates port', () => {
    queries.createProfile(db, { name: 'a', port: 6101, masterKey: 'k' });
    queries.updateProfilePort(db, 'a', 6105);
    expect(queries.findProfile(db, 'a')?.port).toBe(6105);
  });

  it('updates status', () => {
    queries.createProfile(db, { name: 'a', port: 6101, masterKey: 'k' });
    queries.updateProfileStatus(db, 'a', { status: 'running', lastStartedAt: 1700000000000 });
    const row = queries.findProfile(db, 'a');
    expect(row?.status).toBe('running');
    expect(row?.lastStartedAt).toBe(1700000000000);
  });

  it('deletes', () => {
    queries.createProfile(db, { name: 'a', port: 6101, masterKey: 'k' });
    queries.deleteProfile(db, 'a');
    expect(queries.findProfile(db, 'a')).toBeUndefined();
  });
});

describe('sticky default', () => {
  it('round-trip', () => {
    queries.setSticky(db, 'personal');
    expect(queries.getSticky(db)).toBe('personal');
    queries.setSticky(db, null);
    expect(queries.getSticky(db)).toBeNull();
  });
});

describe('version', () => {
  it('round-trip', () => {
    queries.setVersion(db, 'v2026.5.7');
    expect(queries.getVersion(db)).toBe('v2026.5.7');
    queries.setVersion(db, 'v2026.5.10');
    expect(queries.getVersion(db)).toBe('v2026.5.10');
  });
});

describe('audit log', () => {
  it('appends and lists newest first', () => {
    queries.appendAudit(db, {
      action: 'profile.create',
      target: 'personal',
      details: { port: 6101 },
    });
    queries.appendAudit(db, { action: 'profile.start', target: 'personal' });
    const rows = queries.listAudit(db, { limit: 10 });
    expect(rows[0]?.action).toBe('profile.start');
    expect(rows[1]?.action).toBe('profile.create');
    expect(rows[1]?.target).toBe('personal');
    expect(JSON.parse(rows[1]?.details ?? '{}').port).toBe(6101);
  });
});

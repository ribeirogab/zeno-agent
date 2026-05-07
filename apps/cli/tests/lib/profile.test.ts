import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeSqlite, openSqlite, queries, runHostMigrations } from '@zeno/db/host';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  generateMasterKey,
  isPortTaken,
  NAME_RE,
  nextAvailablePort,
  validateName,
} from '@/lib/profile.js';

const TMP = join(tmpdir(), `cli-profile-${Date.now()}.db`);
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

describe('NAME_RE / validateName', () => {
  it('accepts valid kebab-case', () => {
    expect(validateName('personal')).toBe(true);
    expect(validateName('work-acme')).toBe(true);
    expect(validateName('a')).toBe(true);
  });

  it('rejects uppercase, leading hyphen, leading digit, and overlong', () => {
    expect(validateName('UPPER')).not.toBe(true);
    expect(validateName('-bad')).not.toBe(true);
    expect(validateName('1bad')).not.toBe(true);
    expect(validateName('a'.repeat(40))).not.toBe(true);
  });

  it('regex sanity', () => {
    expect(NAME_RE.test('personal')).toBe(true);
    expect(NAME_RE.test('Personal')).toBe(false);
  });
});

describe('nextAvailablePort', () => {
  it('returns 6101 when DB empty', () => {
    expect(nextAvailablePort(db)).toBe(6101);
  });

  it('skips taken ports and returns lowest free', () => {
    queries.createProfile(db, { name: 'a', port: 6101, masterKey: 'k' });
    queries.createProfile(db, { name: 'b', port: 6102, masterKey: 'k' });
    queries.createProfile(db, { name: 'c', port: 6104, masterKey: 'k' });
    expect(nextAvailablePort(db)).toBe(6103);
  });
});

describe('isPortTaken', () => {
  it('returns true when port belongs to another profile', () => {
    queries.createProfile(db, { name: 'a', port: 6101, masterKey: 'k' });
    expect(isPortTaken(db, 6101)).toBe(true);
    expect(isPortTaken(db, 6101, 'a')).toBe(false);
    expect(isPortTaken(db, 6102)).toBe(false);
  });
});

describe('generateMasterKey', () => {
  it('returns 64 hex chars', () => {
    const k = generateMasterKey();
    expect(k).toMatch(/^[0-9a-f]{64}$/);
  });
});

/**
 * Spec 0047: ApprovalRulesRepo tests + migration id 8 schema check.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, type DB, openDatabase } from '../src/db';
import { ApprovalRulesRepo } from '../src/index';
import { runMigrations } from '../src/migrations';

let db: DB;
let repo: ApprovalRulesRepo;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  repo = new ApprovalRulesRepo(db);
});

afterEach(() => {
  closeDatabase(db);
});

describe('migration id 8 schema', () => {
  it('creates approval_rules table with expected columns', () => {
    const cols = db.prepare('PRAGMA table_info(approval_rules)').all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toEqual(['id', 'pattern', 'source', 'created_at', 'updated_at', 'notes']);
  });

  it('UNIQUE(pattern) prevents duplicates', () => {
    repo.create({ pattern: 'mcp__example__delete_*', source: 'manual' });
    expect(() => repo.create({ pattern: 'mcp__example__delete_*', source: 'manual' })).toThrow();
  });

  it('source CHECK constraint rejects invalid values', () => {
    expect(() =>
      db
        .prepare('INSERT INTO approval_rules (id, pattern, source) VALUES (?, ?, ?)')
        .run('id-x', 'mcp__bad', 'bogus'),
    ).toThrow();
  });
});

describe('ApprovalRulesRepo', () => {
  it('list returns rules ordered by created_at ASC', () => {
    repo.create({ pattern: 'mcp__a__*', source: 'manual' });
    repo.create({ pattern: 'mcp__b__*', source: 'auto' });
    const rules = repo.list();
    expect(rules.map((r) => r.pattern)).toEqual(['mcp__a__*', 'mcp__b__*']);
  });

  it('listPatterns returns just the patterns', () => {
    repo.create({ pattern: 'mcp__a__*', source: 'manual' });
    repo.create({ pattern: 'mcp__b__*', source: 'auto' });
    expect(repo.listPatterns().sort()).toEqual(['mcp__a__*', 'mcp__b__*']);
  });

  it('getByPattern returns the matching row', () => {
    const created = repo.create({
      pattern: 'mcp__example__merge',
      source: 'manual',
      notes: 'protect merges',
    });
    const found = repo.getByPattern('mcp__example__merge');
    expect(found?.id).toBe(created.id);
    expect(found?.notes).toBe('protect merges');
  });

  it('count returns the total', () => {
    expect(repo.count()).toBe(0);
    repo.create({ pattern: 'mcp__a__*', source: 'manual' });
    repo.create({ pattern: 'mcp__b__*', source: 'auto' });
    expect(repo.count()).toBe(2);
  });

  it('upsert returns existing on conflict, creates otherwise', () => {
    const first = repo.upsert({ pattern: 'mcp__shared__*', source: 'auto' });
    const second = repo.upsert({ pattern: 'mcp__shared__*', source: 'auto' });
    expect(second.id).toBe(first.id);
    expect(repo.count()).toBe(1);
  });

  it('delete removes a single row by id', () => {
    const r1 = repo.create({ pattern: 'mcp__a__*', source: 'manual' });
    repo.create({ pattern: 'mcp__b__*', source: 'manual' });
    expect(repo.delete(r1.id)).toBe(true);
    expect(repo.count()).toBe(1);
    expect(repo.delete('non-existent')).toBe(false);
  });

  it('deleteAutoMatching only deletes auto rules and only matching pattern', () => {
    repo.create({ pattern: 'mcp__github-app-acme__merge', source: 'auto' });
    repo.create({ pattern: 'mcp__github-app-acme__delete', source: 'auto' });
    repo.create({ pattern: 'mcp__github-app-acme__custom', source: 'manual' }); // user added — survives
    repo.create({ pattern: 'mcp__github-app-beta__merge', source: 'auto' }); // unrelated installation — survives

    const removed = repo.deleteAutoMatching('mcp__github-app-acme__%');
    expect(removed).toBe(2);
    const remaining = repo
      .list()
      .map((r) => r.pattern)
      .sort();
    expect(remaining).toEqual(['mcp__github-app-acme__custom', 'mcp__github-app-beta__merge']);
  });
});

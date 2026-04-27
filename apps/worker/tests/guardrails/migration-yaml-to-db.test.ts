/**
 * Spec 0047: yaml→DB migration helper tests.
 */

import { ApprovalRulesRepo, openDatabase, runMigrations } from '@zeno/storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrateYamlAlwaysSensitiveToDb } from '@/guardrails/migration-yaml-to-db';

let repo: ApprovalRulesRepo;
let db: ReturnType<typeof openDatabase>;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  repo = new ApprovalRulesRepo(db);
});

afterEach(() => {
  db.close();
});

describe('migrateYamlAlwaysSensitiveToDb', () => {
  it('migrates yaml patterns into source=yaml-migrated rows', () => {
    const result = migrateYamlAlwaysSensitiveToDb(repo, [
      'mcp__example__merge_pull_request',
      'mcp__example__delete_*',
    ]);
    expect(result.migrated).toBe(2);
    expect(result.skipped).toBeNull();

    const rules = repo.list();
    expect(rules.map((r) => r.pattern).sort()).toEqual([
      'mcp__example__delete_*',
      'mcp__example__merge_pull_request',
    ]);
    expect(rules.every((r) => r.source === 'yaml-migrated')).toBe(true);
  });

  it('skips when DB already has rules (idempotency)', () => {
    repo.create({ pattern: 'mcp__pre-existing__*', source: 'manual' });
    const result = migrateYamlAlwaysSensitiveToDb(repo, ['mcp__example__merge_pull_request']);
    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe('already-in-db');
    expect(repo.count()).toBe(1);
  });

  it('skips when yaml has no rules', () => {
    const result = migrateYamlAlwaysSensitiveToDb(repo, []);
    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe('no-yaml-rules');
  });

  it('continues past UNIQUE conflicts (duplicate yaml patterns)', () => {
    const result = migrateYamlAlwaysSensitiveToDb(repo, [
      'mcp__example__merge_pull_request',
      'mcp__example__merge_pull_request', // duplicate — should be skipped
      'mcp__example__delete_repo',
    ]);
    expect(result.migrated).toBe(2);
    expect(repo.count()).toBe(2);
  });
});

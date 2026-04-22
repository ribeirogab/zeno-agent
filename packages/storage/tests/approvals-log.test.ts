import { beforeEach, describe, expect, it } from 'vitest';
import { type DB, openDatabase } from '../src/db';
import { runMigrations } from '../src/migrations';
import { ApprovalsLogRepo } from '../src/repos/approvals-log';
import type { CreateApprovalsLogEntry } from '../src/types';

let db: DB;
let repo: ApprovalsLogRepo;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  repo = new ApprovalsLogRepo(db);
});

function makeEntry(overrides: Partial<CreateApprovalsLogEntry> = {}): CreateApprovalsLogEntry {
  return {
    profile: 'default',
    correlationId: 'corr-1',
    threadId: '1700000000.000100',
    requesterUserId: 'U_REQ',
    deciderUserId: 'U_OWNER',
    toolName: 'mcp__github__merge_pull_request',
    toolInput: JSON.stringify({ pr: 42 }),
    policyThatGated: 'always_sensitive',
    classifierReason: null,
    decision: 'allow',
    decisionReason: 'owner reacted +1',
    ...overrides,
  };
}

describe('ApprovalsLogRepo', () => {
  it('insert + listByCorrelation returns the inserted entry', () => {
    const entry = makeEntry();
    repo.insert(entry);

    const rows = repo.listByCorrelation('corr-1');
    expect(rows).toHaveLength(1);
    const stored = rows[0];
    expect(stored).toBeDefined();
    if (!stored) return;

    expect(stored.profile).toBe(entry.profile);
    expect(stored.correlationId).toBe(entry.correlationId);
    expect(stored.threadId).toBe(entry.threadId);
    expect(stored.requesterUserId).toBe(entry.requesterUserId);
    expect(stored.deciderUserId).toBe(entry.deciderUserId);
    expect(stored.toolName).toBe(entry.toolName);
    expect(stored.toolInput).toBe(entry.toolInput);
    expect(stored.policyThatGated).toBe(entry.policyThatGated);
    expect(stored.classifierReason).toBeNull();
    expect(stored.decision).toBe('allow');
    expect(stored.decisionReason).toBe(entry.decisionReason);
    expect(typeof stored.id).toBe('number');
    expect(stored.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('listByCorrelation returns entries in insertion order', () => {
    repo.insert(makeEntry({ correlationId: 'corr-X', toolName: 'first' }));
    repo.insert(makeEntry({ correlationId: 'corr-X', toolName: 'second' }));
    repo.insert(makeEntry({ correlationId: 'corr-Y', toolName: 'other' }));

    const rows = repo.listByCorrelation('corr-X');
    expect(rows.map((row) => row.toolName)).toEqual(['first', 'second']);
  });

  it('listByCorrelation returns empty array when no rows match', () => {
    expect(repo.listByCorrelation('nope')).toEqual([]);
  });

  it('persists nullable fields as null', () => {
    repo.insert(
      makeEntry({
        correlationId: 'corr-null',
        threadId: null,
        deciderUserId: null,
        classifierReason: null,
        policyThatGated: 'timeout',
        decision: 'deny',
        decisionReason: 'approval_timeout',
      }),
    );

    const rows = repo.listByCorrelation('corr-null');
    expect(rows).toHaveLength(1);
    const stored = rows[0];
    expect(stored).toBeDefined();
    if (!stored) return;

    expect(stored.threadId).toBeNull();
    expect(stored.deciderUserId).toBeNull();
    expect(stored.classifierReason).toBeNull();
    expect(stored.decision).toBe('deny');
    expect(stored.policyThatGated).toBe('timeout');
  });
});

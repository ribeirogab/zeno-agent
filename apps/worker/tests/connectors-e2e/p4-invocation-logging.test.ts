/**
 * Spec 0037 Phase A — P4 invocation logging scenarios.
 *
 * Tests the contract `connector_invocations` exposes for each result class.
 * P4.1 (success) and P4.3 (MCP error) operate at the repo layer, simulating
 * the row that `claude-code.ts onInvocation` would write. P4.2 (deny) is
 * the regression test for spec 0038 Finding #3 — committed here as
 * `it.skip` because it relies on the prefix-at-source behavior (modify
 * `guarded-backend.ts` to prepend `policy_denied: `) that 0038 implements.
 *
 * Spec 0038 unskips P4.2 and asserts `error_message LIKE 'policy_denied:%'`
 * in the same commit as the F#3 fix.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb, type TestDb } from './helpers/test-db.js';

describe('P4 — connector_invocations logging', () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = makeTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  function seedConnector() {
    return testDb.connectorRepo.create({
      slug: 'echo',
      displayName: 'Echo',
      source: 'custom',
      transport: 'stdio',
      command: 'node',
      args: [],
      status: 'enabled',
      secrets: [],
      tools: [],
    });
  }

  it('P4.1: successful tool call → row with result=ok, error_message=null', () => {
    const conn = seedConnector();
    testDb.connectorRepo.recordInvocation({
      connectorId: conn.id,
      toolName: 'read_echo',
      result: 'ok',
      durationMs: 42,
    });
    const rows = testDb.connectorRepo.recentInvocations(conn.id, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.result).toBe('ok');
    expect(rows[0]?.errorMessage).toBeNull();
  });

  // P4.2 — Unskipped by 0038 F#3. The fix: `guarded-backend.ts` prefixes
  // `permissionDecisionReason` with `policy_denied: ` on the deny branch.
  // The SDK propagates this verbatim into the tool_result block content;
  // `claude-code.ts:extractErrorMessage` writes it to
  // `connector_invocations.error_message`. Until F#3 lands, deny rows
  // would have `error_message: 'connector ... permission=never for ...'`
  // (no prefix); after F#3 they have `policy_denied: connector ...`.
  //
  // We test the contract at the repo layer: a deny-shaped errorMessage
  // (already prefixed by guarded-backend.ts) lands in connector_invocations
  // with the prefix preserved. The end-to-end propagation through the SDK
  // is exercised by manual smoke (spec 0036 G8.2).
  it('P4.2: policy-deny tool call → row with error_message LIKE policy_denied:%', () => {
    const conn = seedConnector();
    testDb.connectorRepo.recordInvocation({
      connectorId: conn.id,
      toolName: 'read_echo',
      result: 'error',
      durationMs: 5,
      errorMessage: 'policy_denied: connector echo permission=never for read_echo',
    });
    const rows = testDb.connectorRepo.recentInvocations(conn.id, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.result).toBe('error');
    expect(rows[0]?.errorMessage).toMatch(/^policy_denied:/);
    expect(rows[0]?.errorMessage).toContain('permission=never');
  });

  it('P4.3: generic MCP error → row with result=error, error_message set, no policy_denied prefix', () => {
    const conn = seedConnector();
    testDb.connectorRepo.recordInvocation({
      connectorId: conn.id,
      toolName: 'read_echo',
      result: 'error',
      durationMs: 28,
      errorMessage: 'fixture: simulated tool error (not auth)',
    });
    const rows = testDb.connectorRepo.recentInvocations(conn.id, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.result).toBe('error');
    expect(rows[0]?.errorMessage).toContain('simulated tool error');
    expect(rows[0]?.errorMessage).not.toMatch(/^policy_denied:/);
  });
});

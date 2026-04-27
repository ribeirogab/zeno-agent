/**
 * Spec 0037 Phase A — P3 connector_permission policy scenarios.
 *
 * Pure unit-style tests: invoke `connector_permission` policy `check()`
 * directly with a stubbed PolicyContext, against an in-memory DB seeded
 * with the right tool permission rows. No fixture MCP needed (the policy
 * never spawns one).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeConnectorPermissionPolicy } from '@/guardrails/policies/connector-permission';
import type { PolicyContext } from '@/guardrails/types';
import { makeTestDb, type TestDb } from './helpers/test-db.js';

function makeContext(overrides: Partial<PolicyContext>): PolicyContext {
  return {
    profile: 'test',
    correlationId: 'p3',
    threadId: null,
    requesterUserId: 'user-test',
    isOwner: false,
    ownerUserId: 'owner-test',
    toolName: 'mcp__echo__read_echo',
    toolInput: {},
    classifierReason: undefined,
    requestApproval: async () => ({
      decision: { allow: true, reason: 'stub' },
    }),
    ...overrides,
  };
}

describe('P3 — connector_permission policy', () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = makeTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  function seedConnectorWithTool(perm: 'always_allow' | 'ask' | 'never') {
    const conn = testDb.connectorRepo.create({
      slug: 'echo',
      displayName: 'Echo',
      source: 'custom',
      transport: 'stdio',
      command: 'node',
      args: [],
      status: 'enabled',
      secrets: [],
      tools: [{ toolName: 'read_echo', description: 'r', category: 'read', permission: perm }],
    });
    return conn;
  }

  it('P3.1: always_allow → { allow: true, policyThatGated: connector_allow }', async () => {
    seedConnectorWithTool('always_allow');
    const policy = makeConnectorPermissionPolicy({ connectorRepo: testDb.connectorRepo });
    const result = await policy.check(makeContext({ toolName: 'mcp__echo__read_echo' }));
    expect(result).toBeDefined();
    expect(result?.allow).toBe(true);
    expect(result?.policyThatGated).toBe('connector_allow');
  });

  it('P3.2: never → { allow: false, policyThatGated: connector_never }', async () => {
    seedConnectorWithTool('never');
    const policy = makeConnectorPermissionPolicy({ connectorRepo: testDb.connectorRepo });
    const result = await policy.check(makeContext({ toolName: 'mcp__echo__read_echo' }));
    expect(result).toBeDefined();
    expect(result?.allow).toBe(false);
    expect(result?.policyThatGated).toBe('connector_never');
  });

  it('P3.3: ask → undefined (falls through)', async () => {
    seedConnectorWithTool('ask');
    const policy = makeConnectorPermissionPolicy({ connectorRepo: testDb.connectorRepo });
    const result = await policy.check(makeContext({ toolName: 'mcp__echo__read_echo' }));
    expect(result).toBeUndefined();
  });

  it('P3.4: tool not in DB → undefined (built-in MCP path)', async () => {
    // No connector seeded
    const policy = makeConnectorPermissionPolicy({ connectorRepo: testDb.connectorRepo });
    const result = await policy.check(makeContext({ toolName: 'mcp__nonexistent__some_tool' }));
    expect(result).toBeUndefined();
  });
});

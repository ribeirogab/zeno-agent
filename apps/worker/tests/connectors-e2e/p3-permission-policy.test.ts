/**
 * Spec 0037 Phase A — P3 connector_permission scenarios. Updated for spec
 * 0050: the policy is now a plain function `checkConnectorPermission` (no
 * pipeline / PolicyContext); 'ask' and slug-not-in-DB now ALLOW (deterministic
 * decision tree, no fallthrough).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkConnectorPermission } from '@/guardrails/policies/connector-permission';
import { makeTestDb, type TestDb } from './helpers/test-db.js';

describe('P3 — connector-permission policy (spec 0050)', () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = makeTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  function seedConnectorWithTool(perm: 'always_allow' | 'ask' | 'never') {
    return testDb.connectorRepo.create({
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
  }

  it('P3.1: always_allow → allow + policyThatGated=connector_allow', () => {
    seedConnectorWithTool('always_allow');
    const result = checkConnectorPermission(
      testDb.connectorRepo,
      testDb.agentCapabilityRepo,
      'mcp__echo__read_echo',
    );
    expect(result.allow).toBe(true);
    expect(result.policyThatGated).toBe('connector_allow');
  });

  it('P3.2: never → deny + policyThatGated=connector_never', () => {
    seedConnectorWithTool('never');
    const result = checkConnectorPermission(
      testDb.connectorRepo,
      testDb.agentCapabilityRepo,
      'mcp__echo__read_echo',
    );
    expect(result.allow).toBe(false);
    expect(result.policyThatGated).toBe('connector_never');
  });

  it('P3.3: ask → allow + policyThatGated=connector_ask_allow (spec 0050 collapse)', () => {
    seedConnectorWithTool('ask');
    const result = checkConnectorPermission(
      testDb.connectorRepo,
      testDb.agentCapabilityRepo,
      'mcp__echo__read_echo',
    );
    expect(result.allow).toBe(true);
    expect(result.policyThatGated).toBe('connector_ask_allow');
  });

  it('P3.4: slug not in DB → allow + policyThatGated=builtin_mcp_allow', () => {
    const result = checkConnectorPermission(
      testDb.connectorRepo,
      testDb.agentCapabilityRepo,
      'mcp__nonexistent__some_tool',
    );
    expect(result.allow).toBe(true);
    expect(result.policyThatGated).toBe('builtin_mcp_allow');
  });
});

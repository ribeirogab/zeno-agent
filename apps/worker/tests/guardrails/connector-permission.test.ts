import { ConnectorRepo, closeDatabase, openDatabase, runMigrations } from '@zeno/storage';
import { describe, expect, it } from 'vitest';
import { makeConnectorPermissionPolicy } from '@/guardrails/policies/connector-permission';
import type { PolicyContext } from '@/guardrails/types';

function ctx(toolName: string): PolicyContext {
  return {
    toolName,
    toolInput: {},
    skillReadOnly: false,
    isOwner: true,
    ownerUserId: 'U-OWNER',
    requesterUserId: 'U-OWNER',
    correlationId: 'corr',
    threadId: null,
    conversationId: 'C',
    profile: 'default',
    classifierReason: null,
    lastDeciderUserId: null,
    requestApproval: async () => ({
      decision: { allow: true, reason: 'stub', policyThatGated: 'auto_allow' },
      deciderUserId: null,
    }),
  };
}

function makeRepo() {
  const db = openDatabase(':memory:');
  runMigrations(db);
  const repo = new ConnectorRepo(db);
  return { repo, close: () => closeDatabase(db) };
}

describe('connector_permission policy', () => {
  it('passes through when tool name does not match mcp__<slug>__<tool>', async () => {
    const { repo, close } = makeRepo();
    const policy = makeConnectorPermissionPolicy({ connectorRepo: repo });
    expect(await policy.check(ctx('Bash'))).toBeUndefined();
    expect(await policy.check(ctx('Read'))).toBeUndefined();
    close();
  });

  it('passes through when slug is not in DB', async () => {
    const { repo, close } = makeRepo();
    const policy = makeConnectorPermissionPolicy({ connectorRepo: repo });
    expect(await policy.check(ctx('mcp__unknown__do_thing'))).toBeUndefined();
    close();
  });

  it('passes through when tool is not in connector permissions', async () => {
    const { repo, close } = makeRepo();
    repo.create({
      slug: 'echo',
      displayName: 'E',
      source: 'custom',
      transport: 'stdio',
      command: 'x',
      secrets: [],
      tools: [],
    });
    const policy = makeConnectorPermissionPolicy({ connectorRepo: repo });
    expect(await policy.check(ctx('mcp__echo__missing'))).toBeUndefined();
    close();
  });

  it('returns allow when permission=always_allow', async () => {
    const { repo, close } = makeRepo();
    repo.create({
      slug: 'echo',
      displayName: 'E',
      source: 'custom',
      transport: 'stdio',
      command: 'x',
      secrets: [],
      tools: [{ toolName: 'r', description: null, category: 'read', permission: 'always_allow' }],
    });
    const policy = makeConnectorPermissionPolicy({ connectorRepo: repo });
    const decision = await policy.check(ctx('mcp__echo__r'));
    expect(decision).toEqual({
      allow: true,
      reason: expect.stringContaining('always_allow'),
      policyThatGated: 'connector_allow',
    });
    close();
  });

  it('returns deny when permission=never', async () => {
    const { repo, close } = makeRepo();
    repo.create({
      slug: 'echo',
      displayName: 'E',
      source: 'custom',
      transport: 'stdio',
      command: 'x',
      secrets: [],
      tools: [{ toolName: 'd', description: null, category: 'write', permission: 'never' }],
    });
    const policy = makeConnectorPermissionPolicy({ connectorRepo: repo });
    const decision = await policy.check(ctx('mcp__echo__d'));
    expect(decision).toEqual({
      allow: false,
      reason: expect.stringContaining('never'),
      policyThatGated: 'connector_never',
    });
    close();
  });

  it('passes through when permission=ask', async () => {
    const { repo, close } = makeRepo();
    repo.create({
      slug: 'echo',
      displayName: 'E',
      source: 'custom',
      transport: 'stdio',
      command: 'x',
      secrets: [],
      tools: [{ toolName: 'a', description: null, category: 'write', permission: 'ask' }],
    });
    const policy = makeConnectorPermissionPolicy({ connectorRepo: repo });
    expect(await policy.check(ctx('mcp__echo__a'))).toBeUndefined();
    close();
  });

  it('handles slugs with hyphens correctly', async () => {
    const { repo, close } = makeRepo();
    repo.create({
      slug: 'fn-scrum',
      displayName: 'FN',
      source: 'custom',
      transport: 'remote',
      url: 'https://x',
      secrets: [],
      tools: [
        { toolName: 'list', description: null, category: 'read', permission: 'always_allow' },
      ],
    });
    const policy = makeConnectorPermissionPolicy({ connectorRepo: repo });
    const decision = await policy.check(ctx('mcp__fn-scrum__list'));
    expect(decision?.allow).toBe(true);
    close();
  });
});

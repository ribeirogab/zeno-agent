import { ConnectorRepo, closeDatabase, openDatabase, runMigrations } from '@zeno/storage';
import { describe, expect, it } from 'vitest';
import { checkConnectorPermission } from '@/guardrails/policies/connector-permission';

function makeRepo() {
  const db = openDatabase(':memory:');
  runMigrations(db);
  const repo = new ConnectorRepo(db);
  return { repo, close: () => closeDatabase(db) };
}

describe('checkConnectorPermission (spec 0050)', () => {
  it('denies non-MCP tool names (Bash, Read, Write, Edit, etc.)', () => {
    const { repo, close } = makeRepo();
    for (const name of ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'Task']) {
      const decision = checkConnectorPermission(repo, name);
      expect(decision.allow).toBe(false);
      expect(decision.policyThatGated).toBe('non_mcp_deny');
    }
    close();
  });

  it('allows MCP tools whose slug is not in connector_repo (built-in MCPs)', () => {
    const { repo, close } = makeRepo();
    const decision = checkConnectorPermission(repo, 'mcp__playwright__navigate');
    expect(decision.allow).toBe(true);
    expect(decision.policyThatGated).toBe('builtin_mcp_allow');
    close();
  });

  it('denies MCP tool when slug is in DB but tool is NOT registered with the connector', () => {
    const { repo, close } = makeRepo();
    repo.create({
      slug: 'echo',
      displayName: 'Echo',
      source: 'custom',
      transport: 'stdio',
      tools: [],
      secrets: [],
    });
    const decision = checkConnectorPermission(repo, 'mcp__echo__missing_tool');
    expect(decision.allow).toBe(false);
    expect(decision.policyThatGated).toBe('unknown_tool_deny');
    close();
  });

  it('allows when permission=always_allow', () => {
    const { repo, close } = makeRepo();
    repo.create({
      slug: 'echo',
      displayName: 'Echo',
      source: 'custom',
      transport: 'stdio',
      tools: [
        { toolName: 'do_a', description: null, category: 'read', permission: 'always_allow' },
      ],
      secrets: [],
    });
    const decision = checkConnectorPermission(repo, 'mcp__echo__do_a');
    expect(decision.allow).toBe(true);
    expect(decision.policyThatGated).toBe('connector_allow');
    close();
  });

  it('denies when permission=never', () => {
    const { repo, close } = makeRepo();
    repo.create({
      slug: 'echo',
      displayName: 'Echo',
      source: 'custom',
      transport: 'stdio',
      tools: [{ toolName: 'do_b', description: null, category: 'write', permission: 'never' }],
      secrets: [],
    });
    const decision = checkConnectorPermission(repo, 'mcp__echo__do_b');
    expect(decision.allow).toBe(false);
    expect(decision.policyThatGated).toBe('connector_never');
    close();
  });

  it('allows when permission=ask (spec 0050: installation-time decision IS the approval)', () => {
    const { repo, close } = makeRepo();
    repo.create({
      slug: 'echo',
      displayName: 'Echo',
      source: 'custom',
      transport: 'stdio',
      tools: [{ toolName: 'do_c', description: null, category: 'interactive', permission: 'ask' }],
      secrets: [],
    });
    const decision = checkConnectorPermission(repo, 'mcp__echo__do_c');
    expect(decision.allow).toBe(true);
    expect(decision.policyThatGated).toBe('connector_ask_allow');
    close();
  });

  it('handles slugs with hyphens correctly', () => {
    const { repo, close } = makeRepo();
    repo.create({
      slug: 'fn-scrum',
      displayName: 'FN Scrum',
      source: 'custom',
      transport: 'stdio',
      tools: [
        { toolName: 'list', description: null, category: 'read', permission: 'always_allow' },
      ],
      secrets: [],
    });
    const decision = checkConnectorPermission(repo, 'mcp__fn-scrum__list');
    expect(decision.allow).toBe(true);
    expect(decision.policyThatGated).toBe('connector_allow');
    close();
  });

  it('denies malformed mcp tool names', () => {
    const { repo, close } = makeRepo();
    const d1 = checkConnectorPermission(repo, 'mcp__');
    expect(d1.allow).toBe(false);
    expect(d1.policyThatGated).toBe('non_mcp_deny');
    close();
  });
});

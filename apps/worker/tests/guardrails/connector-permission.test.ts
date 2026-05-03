import {
  AgentCapabilityRepo,
  ConnectorRepo,
  closeDatabase,
  openDatabase,
  runMigrations,
} from '@zeno/storage';
import { describe, expect, it } from 'vitest';
import { checkConnectorPermission } from '@/guardrails/policies/connector-permission';

function makeRepos() {
  const db = openDatabase(':memory:');
  runMigrations(db);
  // Spec 0066 C: drop the seeded Playwright row — this test exercises
  // the 'tool not in connector_repo' (built-in MCP) path which the
  // seed otherwise contaminates.
  db.prepare("DELETE FROM connectors WHERE slug = 'playwright'").run();
  const repo = new ConnectorRepo(db);
  const caps = new AgentCapabilityRepo(db);
  return { repo, caps, close: () => closeDatabase(db) };
}

describe('checkConnectorPermission (spec 0050 + 0052)', () => {
  it('denies non-MCP tools when capability is disabled (operator opted out via /settings)', () => {
    const { repo, caps, close } = makeRepos();
    // Spec 0053 made Bash/Read/Edit/Write/Glob/Grep default-on. To exercise the
    // deny path we explicitly disable the dev caps first; Task/WebFetch are
    // already off by default.
    for (const name of ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep']) {
      caps.setEnabled(name, false);
    }
    for (const name of ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'Task']) {
      const decision = checkConnectorPermission(repo, caps, name);
      expect(decision.allow).toBe(false);
      expect(decision.policyThatGated).toBe('agent_capability_deny');
      expect(decision.reason).toContain('disabled');
    }
    close();
  });

  it('allows default-on dev capabilities right out of the box (spec 0053)', () => {
    const { repo, caps, close } = makeRepos();
    for (const name of ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep']) {
      const decision = checkConnectorPermission(repo, caps, name);
      expect(decision.allow).toBe(true);
      expect(decision.policyThatGated).toBe('agent_capability_allow');
    }
    close();
  });

  it('allows non-MCP tools when capability is enabled (spec 0052)', () => {
    const { repo, caps, close } = makeRepos();
    // Toggle a sensitive-by-default capability on to verify the allow path.
    caps.setEnabled('Task', true);
    const taskDecision = checkConnectorPermission(repo, caps, 'Task');
    expect(taskDecision.allow).toBe(true);
    expect(taskDecision.policyThatGated).toBe('agent_capability_allow');

    // WebFetch still default-disabled.
    const webDecision = checkConnectorPermission(repo, caps, 'WebFetch');
    expect(webDecision.allow).toBe(false);
    close();
  });

  it('denies non-MCP tools that are not in the seed list (safe default)', () => {
    const { repo, caps, close } = makeRepos();
    const decision = checkConnectorPermission(repo, caps, 'NonexistentToolFromFutureSDK');
    expect(decision.allow).toBe(false);
    expect(decision.policyThatGated).toBe('agent_capability_deny');
    close();
  });

  it('allows MCP tools whose slug is not in connector_repo (built-in MCPs)', () => {
    const { repo, caps, close } = makeRepos();
    const decision = checkConnectorPermission(repo, caps, 'mcp__playwright__navigate');
    expect(decision.allow).toBe(true);
    expect(decision.policyThatGated).toBe('builtin_mcp_allow');
    close();
  });

  it('denies MCP tool when slug is in DB but tool is NOT registered with the connector', () => {
    const { repo, caps, close } = makeRepos();
    repo.create({
      slug: 'echo',
      displayName: 'Echo',
      source: 'custom',
      transport: 'stdio',
      tools: [],
      secrets: [],
    });
    const decision = checkConnectorPermission(repo, caps, 'mcp__echo__missing_tool');
    expect(decision.allow).toBe(false);
    expect(decision.policyThatGated).toBe('unknown_tool_deny');
    close();
  });

  it('allows when permission=always_allow', () => {
    const { repo, caps, close } = makeRepos();
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
    const decision = checkConnectorPermission(repo, caps, 'mcp__echo__do_a');
    expect(decision.allow).toBe(true);
    expect(decision.policyThatGated).toBe('connector_allow');
    close();
  });

  it('denies when permission=never', () => {
    const { repo, caps, close } = makeRepos();
    repo.create({
      slug: 'echo',
      displayName: 'Echo',
      source: 'custom',
      transport: 'stdio',
      tools: [{ toolName: 'do_b', description: null, category: 'write', permission: 'never' }],
      secrets: [],
    });
    const decision = checkConnectorPermission(repo, caps, 'mcp__echo__do_b');
    expect(decision.allow).toBe(false);
    expect(decision.policyThatGated).toBe('connector_never');
    close();
  });

  it('allows when permission=ask (spec 0050: installation-time decision IS the approval)', () => {
    const { repo, caps, close } = makeRepos();
    repo.create({
      slug: 'echo',
      displayName: 'Echo',
      source: 'custom',
      transport: 'stdio',
      tools: [{ toolName: 'do_c', description: null, category: 'interactive', permission: 'ask' }],
      secrets: [],
    });
    const decision = checkConnectorPermission(repo, caps, 'mcp__echo__do_c');
    expect(decision.allow).toBe(true);
    expect(decision.policyThatGated).toBe('connector_ask_allow');
    close();
  });

  it('handles slugs with hyphens correctly', () => {
    const { repo, caps, close } = makeRepos();
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
    const decision = checkConnectorPermission(repo, caps, 'mcp__fn-scrum__list');
    expect(decision.allow).toBe(true);
    expect(decision.policyThatGated).toBe('connector_allow');
    close();
  });

  it('denies malformed mcp tool names', () => {
    const { repo, caps, close } = makeRepos();
    const d1 = checkConnectorPermission(repo, caps, 'mcp__');
    expect(d1.allow).toBe(false);
    // Malformed name doesn't match the regex, so it falls through to the
    // non-MCP branch which consults agent_capabilities. With no seed for
    // 'mcp__', returns disabled. Either way it denies.
    expect(d1.policyThatGated).toBe('agent_capability_deny');
    close();
  });
});

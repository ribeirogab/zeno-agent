import {
  AgentCapabilityRepo,
  ConnectorRepo,
  ConnectorSkillRepo,
  closeDatabase,
  openDatabase,
  runMigrations,
  SkillRepo,
} from '@zeno/storage';
import { describe, expect, it, vi } from 'vitest';
import type { ClaudeCodeBackend } from '@/agent/backends/claude-code';
import { ConnectorGatedBackend } from '@/guardrails/connector-gated-backend';

/**
 * Spec 0050: ConnectorGatedBackend wraps a ClaudeCodeBackend with a single
 * gate — the connector-permission policy. The PreToolUse hook is built once
 * at construction; it reads ConnectorRepo per call.
 */
function makeRepo() {
  const db = openDatabase(':memory:');
  runMigrations(db);
  const repo = new ConnectorRepo(db);
  const caps = new AgentCapabilityRepo(db);
  const skillRepo = new SkillRepo(db);
  const skills = new ConnectorSkillRepo(db);
  return { repo, caps, skillRepo, skills, close: () => closeDatabase(db) };
}

function fakeInner(): ClaudeCodeBackend {
  return {
    name: 'claude-code',
    query: vi.fn(async () => ({ text: 'ok' })),
  } as unknown as ClaudeCodeBackend;
}

describe('ConnectorGatedBackend (spec 0050)', () => {
  it('delegates query() to the inner backend', async () => {
    const { repo, caps, skills, close } = makeRepo();
    const inner = fakeInner();
    const gated = new ConnectorGatedBackend(inner, {
      connectorRepo: repo,
      agentCapabilityRepo: caps,
      connectorSkillRepo: skills,
    });
    const out = await gated.query({
      systemPrompt: 'sys',
      userMessage: 'hi',
      correlationId: 'c1',
      sessionId: null,
    });
    expect(out).toEqual({ text: 'ok' });
    expect(inner.query).toHaveBeenCalledTimes(1);
    close();
  });

  it('PreToolUse hook ALLOWS a permitted MCP tool', async () => {
    const { repo, caps, skills, close } = makeRepo();
    repo.create({
      slug: 'echo',
      displayName: 'Echo',
      source: 'custom',
      transport: 'stdio',
      tools: [
        { toolName: 'read_x', description: null, category: 'read', permission: 'always_allow' },
      ],
      secrets: [],
    });
    const inner = fakeInner();
    const gated = new ConnectorGatedBackend(inner, {
      connectorRepo: repo,
      agentCapabilityRepo: caps,
      connectorSkillRepo: skills,
    });
    const hook = gated.buildPreToolUseHook();
    const result = await hook({ tool_name: 'mcp__echo__read_x', tool_input: {} } as never, '', {
      signal: new AbortController().signal,
    });
    expect(result?.hookSpecificOutput?.permissionDecision).toBe('allow');
    close();
  });

  it('PreToolUse hook DENIES a non-MCP tool with policy_denied prefix when capability is off', async () => {
    const { repo, caps, skills, close } = makeRepo();
    // Spec 0053 made Bash default-on. Use a still-default-off capability
    // (Task) to exercise the deny path on a non-MCP tool.
    const inner = fakeInner();
    const gated = new ConnectorGatedBackend(inner, {
      connectorRepo: repo,
      agentCapabilityRepo: caps,
      connectorSkillRepo: skills,
    });
    const hook = gated.buildPreToolUseHook();
    const result = await hook(
      { tool_name: 'Task', tool_input: { description: 'x', prompt: 'y' } } as never,
      '',
      {
        signal: new AbortController().signal,
      },
    );
    expect(result?.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(result?.hookSpecificOutput?.permissionDecisionReason).toMatch(/^policy_denied:/);
    expect(result?.hookSpecificOutput?.additionalContext).toContain('GUARDRAIL DENIAL');
    close();
  });

  it('PreToolUse hook DENIES when connector permission=never', async () => {
    const { repo, caps, skills, close } = makeRepo();
    repo.create({
      slug: 'github',
      displayName: 'GitHub',
      source: 'catalog',
      catalogId: 'github',
      transport: 'stdio',
      tools: [{ toolName: 'merge_pr', description: null, category: 'write', permission: 'never' }],
      secrets: [],
    });
    const inner = fakeInner();
    const gated = new ConnectorGatedBackend(inner, {
      connectorRepo: repo,
      agentCapabilityRepo: caps,
      connectorSkillRepo: skills,
    });
    const hook = gated.buildPreToolUseHook();
    const result = await hook({ tool_name: 'mcp__github__merge_pr', tool_input: {} } as never, '', {
      signal: new AbortController().signal,
    });
    expect(result?.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(result?.hookSpecificOutput?.permissionDecisionReason).toMatch(/permission=never/);
    close();
  });

  // Spec 0052 phase B.3
  it('PreToolUse hook injects linked-skill bodies when ALLOWED tool is from a connector with linked skills', async () => {
    const { repo, caps, skillRepo, skills, close } = makeRepo();
    const connector = repo.create({
      slug: 'sentry',
      displayName: 'Sentry',
      source: 'catalog',
      catalogId: 'sentry',
      transport: 'remote',
      tools: [
        {
          toolName: 'list_issues',
          description: null,
          category: 'read',
          permission: 'always_allow',
        },
      ],
      secrets: [],
      url: 'https://x',
    });
    const skill = skillRepo.create({
      name: 'sentry-flow',
      description: 'How Flávia triages Sentry issues',
      body: '# Sentry triage\n\n1. filter by env=prod\n2. group by release',
    });
    skills.add(connector.id, skill.id);

    const inner = fakeInner();
    const gated = new ConnectorGatedBackend(inner, {
      connectorRepo: repo,
      agentCapabilityRepo: caps,
      connectorSkillRepo: skills,
    });
    const hook = gated.buildPreToolUseHook();
    const first = await hook(
      {
        tool_name: 'mcp__sentry__list_issues',
        tool_input: {},
        session_id: 'sess-1',
      } as never,
      '',
      { signal: new AbortController().signal },
    );
    expect(first?.hookSpecificOutput?.permissionDecision).toBe('allow');
    expect(first?.hookSpecificOutput?.additionalContext).toContain('Sentry triage');
    expect(first?.hookSpecificOutput?.additionalContext).toContain('sentry-flow');

    // Same session + slug → cache hit, no re-injection.
    const second = await hook(
      {
        tool_name: 'mcp__sentry__list_issues',
        tool_input: {},
        session_id: 'sess-1',
      } as never,
      '',
      { signal: new AbortController().signal },
    );
    expect(second?.hookSpecificOutput?.permissionDecision).toBe('allow');
    expect(second?.hookSpecificOutput?.additionalContext).toBeUndefined();
    close();
  });

  it('PreToolUse hook does NOT inject when the connector has no linked skills', async () => {
    const { repo, caps, skillRepo, skills, close } = makeRepo();
    repo.create({
      slug: 'echo',
      displayName: 'Echo',
      source: 'custom',
      transport: 'stdio',
      tools: [{ toolName: 'do', description: null, category: 'read', permission: 'always_allow' }],
      secrets: [],
    });
    skillRepo.create({ name: 'unrelated', description: 'd', body: 'b' }); // not linked
    const inner = fakeInner();
    const gated = new ConnectorGatedBackend(inner, {
      connectorRepo: repo,
      agentCapabilityRepo: caps,
      connectorSkillRepo: skills,
    });
    const hook = gated.buildPreToolUseHook();
    const result = await hook(
      { tool_name: 'mcp__echo__do', tool_input: {}, session_id: 's2' } as never,
      '',
      { signal: new AbortController().signal },
    );
    expect(result?.hookSpecificOutput?.permissionDecision).toBe('allow');
    expect(result?.hookSpecificOutput?.additionalContext).toBeUndefined();
    close();
  });
});

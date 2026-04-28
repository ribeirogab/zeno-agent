import { ConnectorRepo, closeDatabase, openDatabase, runMigrations } from '@zeno/storage';
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
  return { repo, close: () => closeDatabase(db) };
}

function fakeInner(): ClaudeCodeBackend {
  return {
    name: 'claude-code',
    query: vi.fn(async () => ({ text: 'ok' })),
  } as unknown as ClaudeCodeBackend;
}

describe('ConnectorGatedBackend (spec 0050)', () => {
  it('delegates query() to the inner backend', async () => {
    const { repo, close } = makeRepo();
    const inner = fakeInner();
    const gated = new ConnectorGatedBackend(inner, { connectorRepo: repo });
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
    const { repo, close } = makeRepo();
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
    const gated = new ConnectorGatedBackend(inner, { connectorRepo: repo });
    const hook = gated.buildPreToolUseHook();
    const result = await hook({ tool_name: 'mcp__echo__read_x', tool_input: {} } as never, '', {
      signal: new AbortController().signal,
    });
    expect(result?.hookSpecificOutput?.permissionDecision).toBe('allow');
    close();
  });

  it('PreToolUse hook DENIES a non-MCP tool with policy_denied prefix', async () => {
    const { repo, close } = makeRepo();
    const inner = fakeInner();
    const gated = new ConnectorGatedBackend(inner, { connectorRepo: repo });
    const hook = gated.buildPreToolUseHook();
    const result = await hook({ tool_name: 'Bash', tool_input: { cmd: 'ls' } } as never, '', {
      signal: new AbortController().signal,
    });
    expect(result?.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(result?.hookSpecificOutput?.permissionDecisionReason).toMatch(/^policy_denied:/);
    expect(result?.hookSpecificOutput?.additionalContext).toContain('GUARDRAIL DENIAL');
    close();
  });

  it('PreToolUse hook DENIES when connector permission=never', async () => {
    const { repo, close } = makeRepo();
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
    const gated = new ConnectorGatedBackend(inner, { connectorRepo: repo });
    const hook = gated.buildPreToolUseHook();
    const result = await hook({ tool_name: 'mcp__github__merge_pr', tool_input: {} } as never, '', {
      signal: new AbortController().signal,
    });
    expect(result?.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(result?.hookSpecificOutput?.permissionDecisionReason).toMatch(/permission=never/);
    close();
  });
});

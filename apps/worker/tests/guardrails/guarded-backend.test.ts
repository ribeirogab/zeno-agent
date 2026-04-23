import { describe, expect, it, vi } from 'vitest';
import type { ClaudeCodeBackend } from '@/agent/backends/claude-code';
import type { AgentBackend, AgentInput, AgentOutput } from '@/agent/types';
import type { SlackApprover } from '@/guardrails/approver/slack-approver';
import { callStorage } from '@/guardrails/async-context';
import { GuardedBackend, type GuardedBackendDeps } from '@/guardrails/guarded-backend';
import type { AuditLogger } from '@/guardrails/policies/audit';
import type { SkillRegistry } from '@/guardrails/skill-registry';
import type { Decision, PolicyMiddleware } from '@/guardrails/types';

const OWNER = 'U_OWNER';

function wrappedMessage(opts: {
  conversationId: string;
  threadId: string | null;
  userId: string;
  text: string;
}): string {
  return [
    '[slack_context]',
    `conversation_id: ${opts.conversationId}`,
    `thread_id: ${opts.threadId ?? 'null'}`,
    `user_id: ${opts.userId}`,
    'current_time: 2026-04-21T00:00:00.000Z',
    '[/slack_context]',
    '',
    opts.text,
  ].join('\n');
}

function buildInput(overrides: Partial<AgentInput> = {}): AgentInput {
  return {
    systemPrompt: 'sys',
    userMessage: wrappedMessage({
      conversationId: 'C_ENG',
      threadId: '1700.000',
      userId: OWNER,
      text: 'merge it',
    }),
    cwd: '/tmp',
    correlationId: 'cid-1',
    ...overrides,
  };
}

function makeStubAudit(): AuditLogger {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

function makeStubApprover(): SlackApprover {
  return {
    requestApproval: vi.fn().mockResolvedValue({
      decision: { allow: true, reason: 'ok', policyThatGated: 'classifier' },
      deciderUserId: OWNER,
    }),
  } as unknown as SlackApprover;
}

function buildDeps(overrides: Partial<GuardedBackendDeps> = {}): GuardedBackendDeps {
  return {
    policies: [],
    audit: makeStubAudit(),
    approver: makeStubApprover(),
    skillRegistry: new Map() as SkillRegistry,
    ownerUserId: OWNER,
    profile: 'default',
    ...overrides,
  };
}

function asInner(stub: AgentBackend): ClaudeCodeBackend {
  return stub as unknown as ClaudeCodeBackend;
}

describe('GuardedBackend.query', () => {
  it('forwards input to inner backend and populates AsyncLocalStorage', async () => {
    let captured: ReturnType<typeof callStorage.getStore> | undefined;
    const inner: AgentBackend = {
      name: 'inner',
      query: vi.fn(async (_input: AgentInput): Promise<AgentOutput> => {
        captured = callStorage.getStore();
        return { text: 'done', toolCalls: [], sessionId: 'sess-1' };
      }),
    };
    const guarded = new GuardedBackend(asInner(inner), buildDeps());
    const input = buildInput();

    const output = await guarded.query(input);

    expect(output.text).toBe('done');
    expect(inner.query).toHaveBeenCalledWith(input);
    expect(captured).toEqual({
      requesterUserId: OWNER,
      isOwner: true,
      threadId: '1700.000',
      conversationId: 'C_ENG',
      correlationId: 'cid-1',
    });
  });

  it('marks isOwner=false when requester does not match owner', async () => {
    let captured: ReturnType<typeof callStorage.getStore> | undefined;
    const inner: AgentBackend = {
      name: 'inner',
      query: async () => {
        captured = callStorage.getStore();
        return { text: 'ok', toolCalls: [] };
      },
    };
    const guarded = new GuardedBackend(asInner(inner), buildDeps());
    const input = buildInput({
      userMessage: wrappedMessage({
        conversationId: 'C_ENG',
        threadId: null,
        userId: 'U_OTHER',
        text: 'hi',
      }),
    });

    await guarded.query(input);

    expect(captured?.isOwner).toBe(false);
    expect(captured?.requesterUserId).toBe('U_OTHER');
  });
});

describe('GuardedBackend.buildPreToolUseHook', () => {
  const hookInput = (toolName: string, toolInput: unknown) =>
    ({
      hook_event_name: 'PreToolUse',
      session_id: 'sess-1',
      transcript_path: '/tmp/t.jsonl',
      cwd: '/tmp',
      tool_name: toolName,
      tool_input: toolInput,
      tool_use_id: 'tu-1',
    }) as unknown as Parameters<
      typeof import('@/guardrails/guarded-backend').GuardedBackend.prototype.buildPreToolUseHook
    >[0];

  it('returns allow when the pipeline allows', async () => {
    const allow: Decision = { allow: true, reason: 'ok', policyThatGated: 'auto_allow' };
    const policy: PolicyMiddleware = {
      name: 'allow_all',
      check: vi.fn().mockResolvedValue(allow),
    };
    const inner: AgentBackend = { name: 'inner', query: vi.fn() };
    const guarded = new GuardedBackend(asInner(inner), buildDeps({ policies: [policy] }));
    const hook = guarded.buildPreToolUseHook();

    const result = await callStorage.run(
      {
        requesterUserId: OWNER,
        isOwner: true,
        threadId: null,
        conversationId: 'C_ENG',
        correlationId: 'cid-1',
      },
      () =>
        hook(hookInput('Bash', { command: 'ls' }), 'tu-1', {
          signal: new AbortController().signal,
        }),
    );

    expect(result).toMatchObject({
      hookSpecificOutput: { permissionDecision: 'allow' },
    });
    expect(policy.check).toHaveBeenCalledOnce();
  });

  it('returns deny with the decision reason when the pipeline denies', async () => {
    const deny: Decision = {
      allow: false,
      reason: 'never merge from here',
      policyThatGated: 'always_sensitive',
    };
    const policy: PolicyMiddleware = {
      name: 'block',
      check: vi.fn().mockResolvedValue(deny),
    };
    const inner: AgentBackend = { name: 'inner', query: vi.fn() };
    const guarded = new GuardedBackend(asInner(inner), buildDeps({ policies: [policy] }));
    const hook = guarded.buildPreToolUseHook();

    const result = await callStorage.run(
      {
        requesterUserId: OWNER,
        isOwner: true,
        threadId: null,
        conversationId: 'C_ENG',
        correlationId: 'cid-1',
      },
      () =>
        hook(hookInput('mcp__github__merge_pull_request', { pr: 1 }), 'tu-1', {
          signal: new AbortController().signal,
        }),
    );

    expect(result).toMatchObject({
      hookSpecificOutput: {
        permissionDecision: 'deny',
        permissionDecisionReason: 'never merge from here',
      },
    });
  });

  it('fail-safe denies when called outside a query() (no AsyncLocalStorage)', async () => {
    const inner: AgentBackend = { name: 'inner', query: vi.fn() };
    const guarded = new GuardedBackend(asInner(inner), buildDeps());
    const hook = guarded.buildPreToolUseHook();

    const result = await hook(hookInput('Bash', { command: 'ls' }), 'tu-1', {
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      hookSpecificOutput: {
        permissionDecision: 'deny',
        permissionDecisionReason: 'guardrails: missing call context',
      },
    });
  });
});

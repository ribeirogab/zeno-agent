import { describe, expect, it, vi } from 'vitest';
import { makeAlwaysSensitivePolicy } from '@/guardrails/policies/always-sensitive';
import type { ApprovalRequest, ApproverResult, PolicyContext } from '@/guardrails/types';

function buildContext(overrides: Partial<PolicyContext> = {}): PolicyContext {
  const requestApproval = vi.fn<(request: ApprovalRequest) => Promise<ApproverResult>>(
    async () => ({
      decision: {
        allow: true,
        reason: 'approved by owner',
        policyThatGated: 'classifier',
      },
      deciderUserId: 'U_OWNER',
    }),
  );
  return {
    toolName: 'mcp__github__merge_pull_request',
    toolInput: { pr: 42 },
    skillReadOnly: false,
    isOwner: true,
    ownerUserId: 'U_OWNER',
    requesterUserId: 'U_OWNER',
    correlationId: 'cid-1',
    threadId: '1700.000',
    conversationId: 'C123',
    profile: 'default',
    classifierReason: null,
    requestApproval,
    ...overrides,
  };
}

describe('alwaysSensitivePolicy', () => {
  it('returns the approver decision (with policyThatGated overridden) on a literal match', async () => {
    const policy = makeAlwaysSensitivePolicy(['mcp__github__merge_pull_request']);
    const ctx = buildContext();

    const decision = await policy.check(ctx);

    expect(decision).toEqual({
      allow: true,
      reason: 'approved by owner',
      policyThatGated: 'always_sensitive',
    });
    expect(ctx.requestApproval).toHaveBeenCalledOnce();
  });

  it('matches against a "prefix*" wildcard', async () => {
    const policy = makeAlwaysSensitivePolicy(['mcp__github__*']);
    const ctx = buildContext({ toolName: 'mcp__github__delete_repo' });

    const decision = await policy.check(ctx);

    expect(decision?.allow).toBe(true);
    expect(decision?.policyThatGated).toBe('always_sensitive');
  });

  it('returns undefined when no pattern matches', async () => {
    const policy = makeAlwaysSensitivePolicy(['mcp__github__merge_pull_request']);
    const ctx = buildContext({ toolName: 'Bash' });

    const decision = await policy.check(ctx);

    expect(decision).toBeUndefined();
    expect(ctx.requestApproval).not.toHaveBeenCalled();
  });

  it('returns undefined when patterns is empty', async () => {
    const policy = makeAlwaysSensitivePolicy([]);
    const ctx = buildContext();

    const decision = await policy.check(ctx);

    expect(decision).toBeUndefined();
    expect(ctx.requestApproval).not.toHaveBeenCalled();
  });

  it('propagates a deny decision from the approver', async () => {
    const policy = makeAlwaysSensitivePolicy(['Bash']);
    const ctx = buildContext({
      toolName: 'Bash',
      requestApproval: vi.fn(async () => ({
        decision: {
          allow: false,
          reason: 'denied by owner',
          policyThatGated: 'classifier',
        },
        deciderUserId: 'U_OWNER',
      })),
    });

    const decision = await policy.check(ctx);

    expect(decision).toEqual({
      allow: false,
      reason: 'denied by owner',
      policyThatGated: 'always_sensitive',
    });
  });
});

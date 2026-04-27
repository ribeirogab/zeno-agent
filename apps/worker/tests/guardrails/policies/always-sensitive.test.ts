import { describe, expect, it, vi } from 'vitest';
import { makeAlwaysSensitivePolicy, matchGlob } from '@/guardrails/policies/always-sensitive';
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

  // Spec 0047: getter form for hot-reload from DB
  it('uses getRules getter on every check (DB hot-reload)', async () => {
    let patterns = ['mcp__nope__*'];
    const policy = makeAlwaysSensitivePolicy({ getRules: () => patterns });
    const ctx = buildContext({ toolName: 'mcp__github__merge_pull_request' });
    expect(await policy.check(ctx)).toBeUndefined();

    // Mutate the rule set — next check should pick it up.
    patterns = ['mcp__github__merge_pull_request'];
    const decision = await policy.check(ctx);
    expect(decision?.allow).toBe(true);
    expect(decision?.policyThatGated).toBe('always_sensitive');
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

// Spec 0047: glob matcher unit tests
describe('matchGlob', () => {
  it('matches literal exact', () => {
    expect(matchGlob('mcp__github__merge_pull_request', 'mcp__github__merge_pull_request')).toBe(
      true,
    );
    expect(matchGlob('mcp__github__merge_pull_request', 'mcp__github__delete_repo')).toBe(false);
  });

  it('matches suffix wildcard', () => {
    expect(matchGlob('mcp__github__*', 'mcp__github__merge_pull_request')).toBe(true);
    expect(matchGlob('mcp__github__*', 'mcp__github__delete_repo')).toBe(true);
    expect(matchGlob('mcp__github__*', 'mcp__sentry__delete_project')).toBe(false);
  });

  it('matches prefix wildcard', () => {
    expect(matchGlob('*delete*', 'mcp__sentry__delete_project')).toBe(true);
    expect(matchGlob('*delete*', 'mcp__linear__delete_issue')).toBe(true);
    expect(matchGlob('*delete*', 'mcp__github__merge_pull_request')).toBe(false);
  });

  it('matches mid-wildcard (the spec 0042 motivating case)', () => {
    expect(
      matchGlob(
        'mcp__github-app-*__merge_pull_request',
        'mcp__github-app-fnlivros__merge_pull_request',
      ),
    ).toBe(true);
    expect(
      matchGlob(
        'mcp__github-app-*__merge_pull_request',
        'mcp__github-app-acme__merge_pull_request',
      ),
    ).toBe(true);
    expect(
      matchGlob('mcp__github-app-*__merge_pull_request', 'mcp__github__merge_pull_request'),
    ).toBe(false);
    expect(
      matchGlob('mcp__github-app-*__merge_pull_request', 'mcp__github-app-foo__delete_repo'),
    ).toBe(false);
  });

  it('matches multi-* patterns', () => {
    expect(matchGlob('*delete*pull*', 'mcp__github__delete_pending_pull_request_review')).toBe(
      true,
    );
    expect(matchGlob('*delete*pull*', 'mcp__github__delete_repo')).toBe(false);
  });

  it('escapes regex metacharacters in literal segments', () => {
    // pattern with `.` should match literally, not as "any char"
    expect(matchGlob('mcp__a.b__c', 'mcp__a.b__c')).toBe(true);
    expect(matchGlob('mcp__a.b__c', 'mcp__aXb__c')).toBe(false);
  });

  it('handles adversarial regex injection safely', () => {
    expect(matchGlob('(?:.*)', 'mcp__github__merge')).toBe(false);
    expect(matchGlob('^.*$', 'mcp__github__merge')).toBe(false);
  });
});

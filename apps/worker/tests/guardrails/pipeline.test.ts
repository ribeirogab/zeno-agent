import { describe, expect, it, vi } from 'vitest';
import { runPolicyPipeline } from '@/guardrails/pipeline';
import type { AuditLogger } from '@/guardrails/policies/audit';
import type { Decision, PolicyContext, PolicyMiddleware } from '@/guardrails/types';

function buildContext(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    toolName: 'mcp__github__merge_pull_request',
    toolInput: { pr: 42 },
    skillReadOnly: false,
    isOwner: true,
    ownerUserId: 'U_OWNER',
    requesterUserId: 'U_OWNER',
    correlationId: 'cid-1',
    threadId: '1700.000',
    conversationId: 'C_ENG',
    profile: 'default',
    classifierReason: null,
    lastDeciderUserId: null,
    requestApproval: vi.fn(),
    ...overrides,
  };
}

function makePolicy(name: string, result: Decision | undefined): PolicyMiddleware {
  return {
    name,
    check: vi.fn().mockResolvedValue(result),
  };
}

function makeAudit(): AuditLogger & { record: ReturnType<typeof vi.fn> } {
  const record = vi.fn().mockResolvedValue(undefined);
  return { record } as AuditLogger & { record: ReturnType<typeof vi.fn> };
}

describe('runPolicyPipeline', () => {
  it('short-circuits at the first non-undefined decision', async () => {
    const denyDecision: Decision = {
      allow: false,
      reason: 'nope',
      policyThatGated: 'always_sensitive',
    };
    const policy1 = makePolicy('first', undefined);
    const policy2 = makePolicy('second', denyDecision);
    const policy3 = makePolicy('third', undefined);
    const audit = makeAudit();
    const ctx = buildContext();

    const result = await runPolicyPipeline(ctx, [policy1, policy2, policy3], audit);

    expect(result).toEqual(denyDecision);
    expect(policy1.check).toHaveBeenCalledOnce();
    expect(policy2.check).toHaveBeenCalledOnce();
    expect(policy3.check).not.toHaveBeenCalled();
  });

  it('emits an auto_allow decision when every policy passes through', async () => {
    const policy1 = makePolicy('first', undefined);
    const policy2 = makePolicy('second', undefined);
    const audit = makeAudit();
    const ctx = buildContext();

    const result = await runPolicyPipeline(ctx, [policy1, policy2], audit);

    expect(result).toEqual({
      allow: true,
      reason: 'no policy matched',
      policyThatGated: 'auto_allow',
    });
  });

  it('always invokes audit.record with the effective decision', async () => {
    const allowDecision: Decision = {
      allow: true,
      reason: 'skill is read-only',
      policyThatGated: 'read_only',
    };
    const policy = makePolicy('read_only', allowDecision);
    const audit = makeAudit();
    const ctx = buildContext();

    await runPolicyPipeline(ctx, [policy], audit);

    expect(audit.record).toHaveBeenCalledOnce();
    expect(audit.record).toHaveBeenCalledWith(ctx, allowDecision, null);
  });

  it('forwards ctx.lastDeciderUserId into the audit deciderUserId slot', async () => {
    const allowDecision: Decision = {
      allow: true,
      reason: 'approved by owner',
      policyThatGated: 'classifier',
    };
    const policy = makePolicy('classifier_gate', allowDecision);
    const audit = makeAudit();
    const ctx = buildContext({ lastDeciderUserId: 'U_OWNER' });

    await runPolicyPipeline(ctx, [policy], audit);

    expect(audit.record).toHaveBeenCalledWith(ctx, allowDecision, 'U_OWNER');
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { HaikuClassifier } from '@/guardrails/classifier/haiku';
import { makeClassifierGatePolicy } from '@/guardrails/policies/classifier-gate';
import type { ApprovalRequest, ApproverResult, PolicyContext } from '@/guardrails/types';

interface ClassifierStub {
  classify: ReturnType<typeof vi.fn>;
}

function stubClassifier(stub: ClassifierStub): HaikuClassifier {
  return stub as unknown as HaikuClassifier;
}

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
    toolName: 'Bash',
    toolInput: { command: 'ls' },
    skillReadOnly: false,
    isOwner: true,
    ownerUserId: 'U_OWNER',
    requesterUserId: 'U_OWNER',
    correlationId: 'cid',
    threadId: null,
    conversationId: 'C',
    profile: 'default',
    classifierReason: null,
    requestApproval,
    ...overrides,
  };
}

describe('classifierGatePolicy', () => {
  it('skips classifier and auto-allows for owner', async () => {
    const classifier = stubClassifier({
      classify: vi.fn(async () => ({ sensitive: true, reason: 'mutates state' })),
    });
    const policy = makeClassifierGatePolicy(classifier);
    const ctx = buildContext({ isOwner: true });

    const decision = await policy.check(ctx);

    expect(decision).toEqual({
      allow: true,
      reason: 'owner: classifier skipped',
      policyThatGated: 'auto_allow',
    });
    expect(classifier.classify).not.toHaveBeenCalled();
    expect(ctx.requestApproval).not.toHaveBeenCalled();
  });

  it('auto-allows non-owner when classifier returns sensitive=false', async () => {
    const classifier = stubClassifier({
      classify: vi.fn(async () => ({ sensitive: false, reason: 'read-only' })),
    });
    const policy = makeClassifierGatePolicy(classifier);
    const ctx = buildContext({ isOwner: false, requesterUserId: 'U_OTHER' });

    const decision = await policy.check(ctx);

    expect(decision).toEqual({
      allow: true,
      reason: 'read-only',
      policyThatGated: 'auto_allow',
    });
    expect(ctx.classifierReason).toBe('read-only');
    expect(ctx.requestApproval).not.toHaveBeenCalled();
  });

  it('forwards non-owner to the approver on sensitive=true', async () => {
    const classifier = stubClassifier({
      classify: vi.fn(async () => ({ sensitive: true, reason: 'mutates state' })),
    });
    const policy = makeClassifierGatePolicy(classifier);
    const ctx = buildContext({ isOwner: false, requesterUserId: 'U_OTHER' });

    const decision = await policy.check(ctx);

    expect(ctx.requestApproval).toHaveBeenCalledOnce();
    const call = vi.mocked(ctx.requestApproval).mock.calls[0][0];
    expect(call.classifierReason).toBe('mutates state');
    expect(decision).toEqual({
      allow: true,
      reason: 'approved by owner',
      policyThatGated: 'classifier',
    });
  });

  it('returns a fail-safe deny for non-owner when the classifier throws', async () => {
    const classifier = stubClassifier({
      classify: vi.fn(async () => {
        throw new Error('network down');
      }),
    });
    const policy = makeClassifierGatePolicy(classifier);
    const ctx = buildContext({ isOwner: false, requesterUserId: 'U_OTHER' });

    const decision = await policy.check(ctx);

    expect(decision?.allow).toBe(false);
    expect(decision?.policyThatGated).toBe('classifier_unavailable');
    expect(decision?.reason).toContain('classifier_unavailable');
    expect(decision?.reason).toContain('network down');
    expect(ctx.requestApproval).not.toHaveBeenCalled();
  });
});

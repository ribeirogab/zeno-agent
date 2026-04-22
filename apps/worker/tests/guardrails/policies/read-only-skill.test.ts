import { describe, expect, it, vi } from 'vitest';
import { makeReadOnlySkillPolicy } from '@/guardrails/policies/read-only-skill';
import type { PolicyContext } from '@/guardrails/types';

function buildContext(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    toolName: 'mcp__acme__list_clients',
    toolInput: {},
    skillReadOnly: true,
    isOwner: false,
    ownerUserId: 'U_OWNER',
    requesterUserId: 'U_OTHER',
    correlationId: 'cid',
    threadId: null,
    conversationId: 'C',
    profile: 'default',
    classifierReason: null,
    requestApproval: vi.fn(),
    ...overrides,
  };
}

describe('readOnlySkillPolicy', () => {
  it('allows the call when ctx.skillReadOnly is true', async () => {
    const policy = makeReadOnlySkillPolicy();
    const decision = await policy.check(buildContext());
    expect(decision).toEqual({
      allow: true,
      reason: 'skill declared read_only: true',
      policyThatGated: 'read_only',
    });
  });

  it('passes through (undefined) when ctx.skillReadOnly is false', async () => {
    const policy = makeReadOnlySkillPolicy();
    const decision = await policy.check(buildContext({ skillReadOnly: false }));
    expect(decision).toBeUndefined();
  });
});

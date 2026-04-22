import type { ApprovalsLogRepo, CreateApprovalsLogEntry } from '@zeno/storage';
import { describe, expect, it, vi } from 'vitest';
import { makeAuditLogger } from '@/guardrails/policies/audit';
import type { Decision, PolicyContext } from '@/guardrails/types';

interface RepoStub {
  insert: ReturnType<typeof vi.fn<(entry: CreateApprovalsLogEntry) => void>>;
}

function stubRepo(): RepoStub {
  return { insert: vi.fn() };
}

function asRepo(stub: RepoStub): ApprovalsLogRepo {
  return stub as unknown as ApprovalsLogRepo;
}

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
    classifierReason: 'merges code',
    requestApproval: vi.fn(),
    ...overrides,
  };
}

describe('makeAuditLogger', () => {
  it('records an allow decision with the decider user id', async () => {
    const stub = stubRepo();
    const logger = makeAuditLogger(asRepo(stub));
    const decision: Decision = {
      allow: true,
      reason: 'approved by owner',
      policyThatGated: 'always_sensitive',
    };

    await logger.record(buildContext(), decision, 'U_OWNER');

    expect(stub.insert).toHaveBeenCalledOnce();
    expect(stub.insert).toHaveBeenCalledWith({
      profile: 'default',
      correlationId: 'cid-1',
      threadId: '1700.000',
      requesterUserId: 'U_OWNER',
      deciderUserId: 'U_OWNER',
      toolName: 'mcp__github__merge_pull_request',
      toolInput: '{"pr":42}',
      policyThatGated: 'always_sensitive',
      classifierReason: 'merges code',
      decision: 'allow',
      decisionReason: 'approved by owner',
    });
  });

  it('records a timeout deny with deciderUserId=null', async () => {
    const stub = stubRepo();
    const logger = makeAuditLogger(asRepo(stub));
    const decision: Decision = {
      allow: false,
      reason: 'approval_timeout',
      policyThatGated: 'timeout',
    };

    await logger.record(buildContext({ classifierReason: null }), decision, null);

    expect(stub.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: 'deny',
        decisionReason: 'approval_timeout',
        policyThatGated: 'timeout',
        classifierReason: null,
        deciderUserId: null,
      }),
    );
  });

  it('records a classifier auto-allow with deciderUserId=null', async () => {
    const stub = stubRepo();
    const logger = makeAuditLogger(asRepo(stub));
    const decision: Decision = {
      allow: true,
      reason: 'read-only git command',
      policyThatGated: 'auto_allow',
    };

    await logger.record(
      buildContext({
        classifierReason: 'read-only git command',
        toolName: 'Bash',
        toolInput: { command: 'git log' },
      }),
      decision,
      null,
    );

    expect(stub.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: 'allow',
        policyThatGated: 'auto_allow',
        toolName: 'Bash',
        toolInput: '{"command":"git log"}',
        deciderUserId: null,
      }),
    );
  });
});

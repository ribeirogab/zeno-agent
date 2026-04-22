import type { HookCallback, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import type { ClaudeCodeBackend } from '@/agent/backends/claude-code';
import type { AgentBackend, AgentInput, AgentOutput } from '@/agent/types';
import type { SlackApprover } from '@/guardrails/approver/slack-approver';
import { callStorage } from '@/guardrails/async-context';
import { runPolicyPipeline } from '@/guardrails/pipeline';
import type { AuditLogger } from '@/guardrails/policies/audit';
import { isToolReadOnly, type SkillRegistry } from '@/guardrails/skill-registry';
import { parseRequesterUserId, parseSlackContext } from '@/guardrails/slack-context';
import type { PolicyContext, PolicyMiddleware } from '@/guardrails/types';

export interface GuardedBackendDeps {
  policies: PolicyMiddleware[];
  audit: AuditLogger;
  approver: SlackApprover;
  skillRegistry: SkillRegistry;
  ownerUserId: string;
  profile: string;
}

/**
 * Wraps a `ClaudeCodeBackend` with the guardrails policy pipeline.
 *
 * Wiring contract: the inner `ClaudeCodeBackend` MUST be constructed with
 * `canUseTool: guarded.buildCanUseTool()`. The hook is bound once at backend
 * construction time but reads the per-call requester/thread/correlation from
 * `AsyncLocalStorage`, which `GuardedBackend.query` populates around the
 * delegated `inner.query()` call. Boot code in `apps/worker/src/index.ts`
 * (Phase 7) is responsible for honouring this contract.
 */
export class GuardedBackend implements AgentBackend {
  readonly name = 'claude-code-guarded';

  constructor(
    private readonly inner: ClaudeCodeBackend,
    private readonly deps: GuardedBackendDeps,
  ) {}

  async query(input: AgentInput): Promise<AgentOutput> {
    const requesterUserId = parseRequesterUserId(input.userMessage) ?? 'unknown';
    const { conversationId, threadId } = parseSlackContext(input.userMessage);
    const isOwner = requesterUserId === this.deps.ownerUserId;
    const callCtx = {
      requesterUserId,
      isOwner,
      threadId,
      conversationId,
      correlationId: input.correlationId,
    };
    return callStorage.run(callCtx, () => this.inner.query(input));
  }

  /**
   * Build the `PreToolUse` hook callback for the underlying SDK. Bound once at
   * backend construction; reads per-call state from `AsyncLocalStorage`, which
   * `query()` populates. Fail-safe denies when called outside a `query()`.
   */
  buildPreToolUseHook(): HookCallback {
    return async (input) => {
      const hookInput = input as PreToolUseHookInput;
      const toolName = hookInput.tool_name;
      const toolInput = (hookInput.tool_input ?? {}) as Record<string, unknown>;

      const callCtx = callStorage.getStore();
      if (!callCtx) {
        return {
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'PreToolUse' as const,
            permissionDecision: 'deny' as const,
            permissionDecisionReason: 'guardrails: missing call context',
          },
        };
      }
      const skillReadOnly = isToolReadOnly(this.deps.skillRegistry, toolName);

      let ctx: PolicyContext;
      ctx = {
        toolName,
        toolInput,
        skillReadOnly,
        isOwner: callCtx.isOwner,
        ownerUserId: this.deps.ownerUserId,
        requesterUserId: callCtx.requesterUserId,
        correlationId: callCtx.correlationId,
        threadId: callCtx.threadId,
        conversationId: callCtx.conversationId,
        profile: this.deps.profile,
        classifierReason: null,
        lastDeciderUserId: null,
        requestApproval: async (req) => {
          const result = await this.deps.approver.requestApproval(req);
          ctx.lastDeciderUserId = result.deciderUserId;
          return result;
        },
      };

      const decision = await runPolicyPipeline(ctx, this.deps.policies, this.deps.audit);
      const denyContext = decision.allow
        ? undefined
        : `GUARDRAIL DENIAL — this is NOT a system permission error. The tool call was reviewed through the human-in-the-loop approval flow and was DENIED. Reason: "${decision.reason}". Do NOT retry the tool, do NOT suggest adjusting permissions or hooks, do NOT troubleshoot. Simply tell the user: "ação negada — ${decision.reason}".`;
      return {
        continue: true,
        ...(denyContext ? { reason: denyContext } : {}),
        hookSpecificOutput: {
          hookEventName: 'PreToolUse' as const,
          permissionDecision: (decision.allow ? 'allow' : 'deny') as 'allow' | 'deny',
          permissionDecisionReason: decision.reason,
          ...(denyContext ? { additionalContext: denyContext } : {}),
        },
      };
    };
  }
}
